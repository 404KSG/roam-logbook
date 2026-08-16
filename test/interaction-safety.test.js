import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { installGraph, uninstallGraph } from './helpers/graph-stub.js';
import { presentMutationResult } from '../src/action-result.js';

const dom = new JSDOM('<!doctype html><html><body><div class="rm-topbar"></div></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.HTMLElement = dom.window.HTMLElement;

const TASK = { uid: 'action001', string: '{{[[TODO]]}} action task', parent: null };
const OTHER = { uid: 'action002', string: '{{[[TODO]]}} another action task', parent: null };
let graph;
let focused = null;
const contextCommands = new Map();
const paletteCommands = new Map();
const settingsStore = new Map();
const toasts = [];

const extensionAPI = {
    settings: {
        get: key => settingsStore.get(key),
        set: (key, value) => settingsStore.set(key, value),
        panel: { create: () => {} },
    },
    ui: {
        showToast: payload => toasts.push(typeof payload === 'string' ? payload : payload?.content),
        commandPalette: {
            addCommand: spec => paletteCommands.set(spec.label, spec.callback),
            removeCommand: ({ label }) => paletteCommands.delete(label),
        },
    },
};

const install = () => {
    graph = installGraph([TASK, OTHER]);
    focused = null;
    settingsStore.clear();
    settingsStore.set('allowMultipleClocks', true);
    contextCommands.clear();
    paletteCommands.clear();
    toasts.length = 0;
    window.roamAlphaAPI.ui.getFocusedBlock = () => (focused ? { 'block-uid': focused } : null);
    window.roamAlphaAPI.ui.blockContextMenu = {
        addCommand: spec => contextCommands.set(spec.label, spec),
        removeCommand: ({ label }) => contextCommands.delete(label),
    };
};

install();
const extension = (await import('../src/extension.js')).default;
const clock = await import('../src/clock.js');
const paused = await import('../src/paused.js');

const click = node => node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
const settle = async () => {
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
};
const topbarButton = () => document.querySelector('#roam-logbook-topbar button');
const openPopover = () => {
    click(topbarButton());
    return document.querySelector('body > .rlb-popover');
};
const footerAction = label =>
    [...document.querySelectorAll('.rlb-popover__footer button')].find(node => node.textContent === label);

const failNextPostWriteReads = () => {
    const originalQuery = graph.api.data.q;
    const originalUpdate = graph.api.data.block.update;
    let remaining = 0;
    graph.api.data.block.update = async args => {
        const result = await originalUpdate(args);
        remaining = 2;
        return result;
    };
    graph.api.data.q = (...args) => {
        if (remaining > 0) {
            remaining -= 1;
            throw new Error('Roam is still syncing after the write');
        }
        return originalQuery(...args);
    };
    return () => {
        graph.api.data.q = originalQuery;
        graph.api.data.block.update = originalUpdate;
    };
};

test.beforeEach(() => {
    extension.onunload();
    document.body.innerHTML = '<div class="rm-topbar"></div>';
    install();
    extension.onload({ extensionAPI });
});

test.afterEach(() => extension.onunload());
test.after(() => uninstallGraph());

test('Clock out current block with no focused block only notifies and performs zero writes', async () => {
    await clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') });
    const before = clock.getRunning()[0].clockUid;
    const callback = paletteCommands.get('Logbook: Clock out current block');

    await callback();

    assert.equal(clock.getRunning().length, 1);
    assert.equal(clock.getRunning()[0].clockUid, before);
    assert.match(graph.childrenOf(graph.childrenOf(TASK.uid)[0].uid)[0].string, /^CLOCK:: \[/);
    assert.match(toasts.join(' '), /focused block/i);
});

test('context menu does not offer Clock In on a direct DONE Task', async () => {
    await graph.api.data.block.update({
        block: { uid: TASK.uid, string: '{{[[DONE]]}} already finished' },
    });

    const command = contextCommands.get('Logbook: Clock in');
    assert.equal(command['display-conditional']({ 'block-uid': TASK.uid }), false);
});

test('Clock Out All requires a second confirmation and resets when the popover closes', async () => {
    await clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn(OTHER.uid, { now: new Date('2026-08-15T09:01:00') });
    assert.equal(clock.getRunning().length, 2);

    openPopover();
    const first = footerAction('Clock Out All');
    assert.ok(first);
    assert.match(first.getAttribute('aria-label'), /permanently close all running Sessions/i);
    click(first);
    await settle();

    assert.equal(clock.getRunning().length, 2, 'the first click must not write to the graph');
    const confirm = footerAction('Confirm Clock Out All');
    assert.ok(confirm);
    assert.match(confirm.title, /confirm/i);
    assert.equal(confirm.getAttribute('aria-label'), confirm.title);

    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(document.querySelector('.rlb-popover'), null);
    openPopover();
    assert.ok(footerAction('Clock Out All'), 'closing the popover resets confirmation');
    assert.equal(footerAction('Confirm Clock Out All'), undefined);

    click(footerAction('Clock Out All'));
    await settle();
    assert.equal(clock.getRunning().length, 2);
    click(footerAction('Confirm Clock Out All'));
    await settle();
    assert.equal(clock.getRunning().length, 0, 'only the confirmed action may close all Sessions');
});

test('Command Palette Clock Out All requires a second invocation before writing', async () => {
    await clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn(OTHER.uid, { now: new Date('2026-08-15T09:01:00') });
    const command = paletteCommands.get('Logbook: Clock out all running clocks');

    await command();

    assert.equal(clock.getRunning().length, 2, 'the first command invocation must only arm confirmation');
    assert.match(toasts.join(' '), /run again.*confirm/i);

    await command();
    assert.equal(clock.getRunning().length, 0, 'the second command invocation performs the confirmed action');
    assert.doesNotMatch(toasts.join(' '), /could not be updated|Retry after Roam finishes syncing/i);
});

test('Command Palette reports a partial Clock Out All and retains the failed Session for retry', async () => {
    await clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn(OTHER.uid, { now: new Date('2026-08-15T09:01:00') });
    const command = paletteCommands.get('Logbook: Clock out all running clocks');
    await command();
    toasts.length = 0;

    const originalUpdate = graph.api.data.block.update;
    let updateCount = 0;
    graph.api.data.block.update = async args => {
        updateCount += 1;
        if (updateCount === 2) throw new Error('second Session update failed');
        return originalUpdate(args);
    };
    try {
        await command();
    } finally {
        graph.api.data.block.update = originalUpdate;
    }

    assert.equal(updateCount, 2);
    assert.equal(clock.getRunning().length, 1, 'the failed Session remains running');
    assert.deepEqual(paused.getPaused().map(item => item.taskUid), [clock.getRunning()[0].taskUid]);
    assert.deepEqual(toasts, [
        '1 Session ended; 1 could not be updated. Retry after Roam finishes syncing.',
    ]);
});

test('Popover reports the same partial Clock Out All exactly once', async () => {
    await clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn(OTHER.uid, { now: new Date('2026-08-15T09:01:00') });
    const popover = openPopover();
    click(footerAction('Clock Out All'));
    await settle();
    toasts.length = 0;

    const originalUpdate = graph.api.data.block.update;
    let updateCount = 0;
    graph.api.data.block.update = async args => {
        updateCount += 1;
        if (updateCount === 2) throw new Error('second Session update failed');
        return originalUpdate(args);
    };
    try {
        click(footerAction('Confirm Clock Out All'));
        await settle();
    } finally {
        graph.api.data.block.update = originalUpdate;
    }

    assert.equal(updateCount, 2);
    assert.equal(clock.getRunning().length, 1);
    assert.deepEqual(toasts, [
        '1 Session ended; 1 could not be updated. Retry after Roam finishes syncing.',
    ]);
    assert.deepEqual(
        [...popover.querySelectorAll('.rlb-popover__notice')].map(node => node.textContent),
        ['1 Session ended; 1 could not be updated. Retry after Roam finishes syncing.']
    );
});

test('the public batch close helper uses the shared partial presenter contract', async () => {
    await clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn(OTHER.uid, { now: new Date('2026-08-15T09:01:00') });
    const failedUid = clock.getRunning().find(entry => entry.taskUid === OTHER.uid).clockUid;
    const originalUpdate = graph.api.data.block.update;
    graph.api.data.block.update = async args => {
        if (args.block.uid === failedUid) throw new Error('batch helper update failed');
        return originalUpdate(args);
    };

    let result;
    try {
        result = await clock.clockOutEntries(null, { now: new Date('2026-08-15T09:02:00') });
    } finally {
        graph.api.data.block.update = originalUpdate;
    }

    const messages = [];
    presentMutationResult(result, message => messages.push(message));
    assert.equal(result.partial, true);
    assert.equal(result.completed, 1);
    assert.equal(result.failed, 1);
    assert.deepEqual(messages, [
        '1 Session ended; 1 could not be updated. Retry after Roam finishes syncing.',
    ]);
});

test('Command Palette presents an uncertain mutation result once and preserves success silence', async () => {
    focused = TASK.uid;
    await clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') });
    const command = paletteCommands.get('Logbook: Clock out current block');
    const restore = failNextPostWriteReads();
    try {
        await command();
    } finally {
        restore();
    }

    assert.equal(
        toasts.filter(message => /Graph state could not be confirmed; no further changes were made\./.test(message)).length,
        1
    );
    assert.match(toasts.join(' '), /Retry after Roam finishes syncing/i);

    toasts.length = 0;
    await clock.clockIn(OTHER.uid, { now: new Date('2026-08-15T09:01:00') });
    assert.doesNotMatch(toasts.join(' '), /Graph state could not be confirmed/i);
});

test('context menu presents an uncertain mutation result without continuing to write', async () => {
    await clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') });
    const command = contextCommands.get('Logbook: Clock out');
    const restore = failNextPostWriteReads();
    try {
        await command.callback({ 'block-uid': TASK.uid });
    } finally {
        restore();
    }

    assert.match(toasts.join(' '), /Graph state could not be confirmed.*Retry after Roam finishes syncing/i);
    assert.equal(clock.getRunning().length, 1, 'the last valid running snapshot remains visible');
});

test('topbar per-session action presents an uncertain mutation result', async () => {
    await clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') });
    const popover = openPopover();
    const restore = failNextPostWriteReads();
    try {
        click(popover.querySelector('[data-action="clock-out"]'));
        await settle();
    } finally {
        restore();
    }

    assert.match(toasts.join(' '), /Graph state could not be confirmed.*Retry after Roam finishes syncing/i);
});

test('Command Palette confirmation expires and unload resets the armed state', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    await clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn(OTHER.uid, { now: new Date('2026-08-15T09:01:00') });
    const command = paletteCommands.get('Logbook: Clock out all running clocks');

    await command();
    t.mock.timers.tick(5_001);
    await command();
    assert.equal(clock.getRunning().length, 2, 'an expired confirmation cannot execute');

    extension.onunload();
    extension.onload({ extensionAPI });
    await paletteCommands.get('Logbook: Clock out all running clocks')();
    assert.equal(clock.getRunning().length, 2, 'unload clears a pending command confirmation');
});

test('single-session Pause remains a one-click recoverable action', async () => {
    await clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') });
    openPopover();

    click(footerAction('Pause'));
    await settle();

    assert.equal(clock.getRunning().length, 0);
    assert.equal(paused.getPaused().length, 1);
    assert.equal(footerAction('Resume paused Tasks')?.textContent, 'Resume paused Tasks');
});
