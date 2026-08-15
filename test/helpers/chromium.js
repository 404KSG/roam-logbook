import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
    process.env.CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
].filter(Boolean);

export const CHROMIUM_DEBUGGER_TIMEOUT_MS = 30_000;

export async function findChromium() {
    for (const candidate of CANDIDATES) {
        try {
            await access(candidate);
            return candidate;
        } catch {
            // Try the next known installation path.
        }
    }
    if (process.env.CI) throw new Error('Chromium is required in CI but no executable was found');
    return null;
}

function createClient(url) {
    const socket = new WebSocket(url);
    const pending = new Map();
    let nextId = 0;

    const opened = new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, { once: true });
        socket.addEventListener('error', reject, { once: true });
    });

    socket.addEventListener('message', event => {
        const message = JSON.parse(String(event.data));
        if (!message.id) return;
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message));
        else request.resolve(message.result);
    });

    return {
        async send(method, params = {}, sessionId) {
            await opened;
            const id = ++nextId;
            const response = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
            socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
            return response;
        },
        close() {
            socket.close();
        },
    };
}

async function waitForDebugger(process) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(
            () => reject(new Error('Chromium did not expose a debugger endpoint')),
            CHROMIUM_DEBUGGER_TIMEOUT_MS
        );
        let output = '';
        process.stderr.on('data', chunk => {
            output += chunk;
            const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
            if (!match) return;
            clearTimeout(timeout);
            resolve(match[1]);
        });
        process.once('exit', code => {
            clearTimeout(timeout);
            reject(new Error(`Chromium exited before setup (${code})`));
        });
    });
}

async function waitForReady(client, sessionId) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        const result = await client.send(
            'Runtime.evaluate',
            { expression: 'document.readyState', returnByValue: true },
            sessionId
        );
        if (result.result.value === 'complete') return;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('Chromium fixture did not finish loading');
}

/**
 * Keep the layout fixture launch deterministic on Ubuntu runners. The fixture
 * evaluates only test-owned static HTML, so the CI sandbox trade-off is
 * limited to this isolated browser process rather than the extension runtime.
 */
export function chromiumLaunchArgs(profile) {
    return [
        '--headless=new',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-networking',
        '--disable-extensions',
        'about:blank',
    ];
}

export async function withChromium(html, expression) {
    const executable = await findChromium();
    if (!executable) throw new Error('Chromium is unavailable');

    const profile = await mkdtemp(join(tmpdir(), 'roam-logbook-layout-'));
    const browser = spawn(
        executable,
        chromiumLaunchArgs(profile),
        { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    let client;
    let targetId;

    try {
        const debuggerUrl = await waitForDebugger(browser);
        client = createClient(debuggerUrl);
        ({ targetId } = await client.send('Target.createTarget', { url: 'about:blank' }));
        const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
        await client.send('Page.enable', {}, sessionId);
        await client.send(
            'Page.navigate',
            { url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}` },
            sessionId
        );
        await waitForReady(client, sessionId);
        const result = await client.send(
            'Runtime.evaluate',
            { expression, returnByValue: true, awaitPromise: true },
            sessionId
        );
        if (result.exceptionDetails) {
            throw new Error(result.exceptionDetails.exception?.description ?? 'Fixture evaluation failed');
        }
        return result.result.value;
    } finally {
        if (client && targetId) await client.send('Target.closeTarget', { targetId }).catch(() => {});
        const exited =
            browser.exitCode === null && browser.signalCode === null ? once(browser, 'exit') : null;
        if (client) await client.send('Browser.close').catch(() => {});
        client?.close();
        if (exited) {
            const closed = await Promise.race([
                exited.then(() => true),
                new Promise(resolve => setTimeout(() => resolve(false), 2_000)),
            ]);
            if (!closed && browser.exitCode === null && browser.signalCode === null) {
                const forced = once(browser, 'exit');
                browser.kill('SIGKILL');
                await forced;
            }
        }
        if (browser.exitCode === null && browser.signalCode === null) {
            const exited = once(browser, 'exit');
            browser.kill();
            await exited;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        await rm(profile, { recursive: true, force: true });
    }
}
