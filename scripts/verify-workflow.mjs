import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

const required = [
    'npm ci',
    'npm run lint',
    'npm test',
    'npm run verify:bundle',
    'npm run verify:workflow',
    'apt-get install --yes chromium',
    'CHROME_BIN: /usr/bin/chromium',
];

for (const fragment of required) {
    if (!workflow.includes(fragment)) {
        throw new Error(`CI workflow is missing required contract: ${fragment}`);
    }
}

if (/skip|continue-on-error:\s*true/i.test(workflow)) {
    throw new Error('CI workflow must not silently skip required verification');
}

console.log('CI workflow contract is present: Chromium, unit/layout tests, lint, bundle verification.');
