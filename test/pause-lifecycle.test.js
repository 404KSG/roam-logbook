import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { installGraph, uninstallGraph } from './helpers/graph-stub.js';

const T0 = new Date('2026-08-15T01:00:00.000Z');
const TASKS = [
    { uid: 'pauseone1', string: '{{[[TODO]]}} first paused task', parent: null },
    { uid: 'pausetwo2', string: '{{[[TODO]]}} second paused task', parent: null },
];

const dom = new JSDOM('<!doctype html><html><body><div class="rm-topbar"></div></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.HTMLElement = dom.window.HTMLElement;

const contextCommands = new Map();
const paletteCommands = new Map();
const settingsStore = new Map([['allowMultipleClocks', true]]);
let graph;

const extensionAPI = {
    settings: {
        get: key => settingsStore.get(key),
        set: (key, value) => settingsStore.set(key, value),
        panel: { create: () => {} },
    },
    ui: {
        commandPalette: {
            addCommand: spec => paletteCommands.set(spec.label, spec.callback),
            removeCommand: ({ label }) => paletteCommands.delete(label),
        },
    },
};

const install = () => {
    graph = installGraph(TASKS);
    window.roamAlphaAPI.ui.blockContextMenu = {
        addCommand: spec => contextCommands.set(spec.label, spec),
        removeCommand: ({ label }) => contextCommands.delete(label),
    };
};

install();
const extension = (await import('../src/extension.js')).default;
const clock = await import('../src/clock.js');
const pomodoro = await import('../src/pomodoro.js');

const click = node => {
    assert.ok(node, 'expected a clickable control');
    node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
};
const settle = async () => {
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
};
const topbarButton = () => document.querySelector('#roam-logbook-topbar button');
const popover = () => document.querySelector('body > .rlb-popover');
const action = label =>
    [...popover().querySelectorAll('.rlb-popover__footer button')].find(
        node => node.textContent === label
    );
const clockLines = taskUid => {
    const drawer = graph.childrenOf(taskUid).find(block => block.string === 'LOGBOOK::');
    return drawer ? graph.childrenOf(drawer.uid).map(block => block.string) : [];
};
const savedRecord = (taskUid, title, pomodoroRemainingMs = null) => ({
    taskUid,
    title,
    pausedAtMs: T0.getTime(),
    pomodoroRemainingMs,
});
const savePaused = items =>
    settingsStore.set('pausedBatch', JSON.stringify({ version: 1, items }));
const reload = () => {
    extension.onunload();
    extension.onload({ extensionAPI });
};

test.beforeEach(t => {
    t.mock.timers.enable({ apis: ['Date'], now: T0 });
    document.body.innerHTML = '<div class="rm-topbar"></div>';
    settingsStore.clear();
    settingsStore.set('allowMultipleClocks', true);
    contextCommands.clear();
    paletteCommands.clear();
    install();
    extension.onload({ extensionAPI });
});

test.afterEach(t => {
    extension.onunload();
    t.mock.timers.reset();
});

test.after(() => uninstallGraph());

test('Pause All survives reload and Resume All starts fresh Sessions with the Pomodoro remainder', async t => {
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': 'pauseone1' });
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': 'pausetwo2' });
    assert.equal(clock.getRunning().length, 2);
    assert.equal(pomodoro.targetMinutes(clock.getRunning()[0].clockUid), 30);

    t.mock.timers.tick(5 * 60_000 + 17_000);
    click(topbarButton());
    click(action('Pause All'));
    await settle();

    assert.equal(clock.getRunning().length, 0);
    assert.ok(clockLines('pauseone1')[0].includes('--'));
    assert.ok(clockLines('pausetwo2')[0].includes('--'));
    assert.equal(popover().querySelector('.rlb-popover__title').textContent, '2 Tasks Paused');
    assert.ok(action('Resume All'));
    const footer = [...popover().querySelectorAll('.rlb-popover__footer button')];
    assert.ok(footer.slice(0, -1).every(button => !/\bbp3-icon-/.test(button.className)));
    assert.match(footer.at(-1).className, /\bbp3-icon-refresh\b/);
    assert.equal(footer.at(-1).textContent, '');

    const persisted = JSON.parse(settingsStore.get('pausedBatch'));
    assert.equal(persisted.version, 2);
    assert.equal(persisted.data.items.length, 2);
    assert.equal(
        persisted.data.items.find(item => item.taskUid === 'pauseone1').pomodoroRemainingMs,
        24 * 60_000 + 43_000
    );

    extension.onunload();
    extension.onload({ extensionAPI });
    click(topbarButton());
    assert.equal(popover().querySelector('.rlb-popover__title').textContent, '2 Tasks Paused');

    t.mock.timers.tick(10 * 60_000);
    click(action('Resume All'));
    await settle();

    assert.equal(clock.getRunning().length, 2);
    assert.equal(clockLines('pauseone1').length, 2);
    assert.equal(clockLines('pausetwo2').length, 2);
    assert.equal(JSON.parse(settingsStore.get('pausedBatch')).data.items.length, 0);
    const resumedFirst = clock.getRunning().find(entry => entry.taskUid === 'pauseone1');
    assert.equal(pomodoro.targetDurationMs(resumedFirst.clockUid), 24 * 60_000 + 43_000);
    assert.equal(popover().querySelector('.rlb-popover__title').textContent, '2 Sessions Running');
    const resumedRow = [...popover().querySelectorAll('.rlb-run')]
        .find(row => row.textContent.includes('first paused task'));
    assert.match(resumedRow.querySelector('.rlb-run__meta').textContent, /24:43/);
    assert.equal(resumedRow.querySelector('.bp3-icon-stopwatch'), null);
});

test('a persisted string true setting permits an all-or-nothing multi-task resume', async () => {
    extension.onunload();
    settingsStore.set('allowMultipleClocks', 'true');
    savePaused([
        savedRecord('pauseone1', 'first paused task'),
        savedRecord('pausetwo2', 'second paused task'),
    ]);
    extension.onload({ extensionAPI });

    click(topbarButton());
    const resume = action('Resume All');
    assert.equal(resume.disabled, false);
    click(resume);
    await settle();

    assert.equal(clock.getRunning().length, 2);
    assert.equal(JSON.parse(settingsStore.get('pausedBatch')).data.items.length, 0);
});

test('Resume All explicitly enables multiple clocks and never leaves a partial one-clock result', async () => {
    extension.onunload();
    settingsStore.set('allowMultipleClocks', false);
    savePaused([
        savedRecord('pauseone1', 'first paused task'),
        savedRecord('pausetwo2', 'second paused task'),
    ]);
    extension.onload({ extensionAPI });

    click(topbarButton());
    const resume = action('Resume All');
    assert.equal(resume.disabled, false, 'explicit Resume All consent is always actionable');
    click(resume);
    await settle();

    assert.equal(settingsStore.get('allowMultipleClocks'), true);
    assert.equal(clock.getRunning().length, 2, 'the complete valid batch is restored');
    assert.equal(JSON.parse(settingsStore.get('pausedBatch')).data.items.length, 0);
    assert.match(popover().textContent, /Multiple clocks were enabled to resume 2 Tasks\./);
});

test('malformed paused state is retained with a visible warning', t => {
    t.mock.method(console, 'warn', () => {});
    extension.onunload();
    settingsStore.set('pausedBatch', '{not json');
    extension.onload({ extensionAPI });

    click(topbarButton());
    assert.equal(action('Resume All'), undefined);
    assert.match(popover().textContent, /unsupported or invalid version and was kept/);
    assert.equal(settingsStore.get('pausedBatch'), '{not json');
});

test('Resume All prunes missing Tasks and consumes a Task that is already running', async () => {
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': 'pauseone1' });
    savePaused([
        savedRecord('pauseone1', 'first paused task'),
        savedRecord('missing99', 'deleted task'),
    ]);
    reload();

    click(topbarButton());
    click(action('Resume All'));
    await settle();

    assert.equal(clock.getRunning().length, 1, 'the already-running Task is not duplicated');
    assert.equal(clockLines('pauseone1').length, 1);
    assert.equal(JSON.parse(settingsStore.get('pausedBatch')).data.items.length, 0);
    assert.match(popover().textContent, /1 missing Task was removed/);
});

test('a failed resume retains only the failed Task for retry', async t => {
    t.mock.method(console, 'error', () => {});
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': 'pauseone1' });
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': 'pausetwo2' });
    click(topbarButton());
    click(action('Pause All'));
    await settle();

    const originalCreate = graph.api.data.block.create;
    graph.api.data.block.create = async args => {
        const parent = graph.store.get(args.location['parent-uid']);
        if (parent?.parent === 'pausetwo2') throw new Error('simulated graph write failure');
        return originalCreate(args);
    };
    try {
        click(action('Resume All'));
        await settle();
    } finally {
        graph.api.data.block.create = originalCreate;
    }

    assert.equal(clock.getRunning().length, 1);
    const retained = JSON.parse(settingsStore.get('pausedBatch')).data.items;
    assert.deepEqual(retained.map(item => item.taskUid), ['pausetwo2']);
    assert.match(popover().textContent, /1 Task could not be resumed/);
});

test('an overrun Pomodoro is not restarted after pause and resume', async t => {
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': 'pauseone1' });
    t.mock.timers.tick(31 * 60_000);

    click(topbarButton());
    click(action('Pause All'));
    await settle();
    const pausedRecord = JSON.parse(settingsStore.get('pausedBatch')).data.items[0];
    assert.equal(pausedRecord.pomodoroRemainingMs, null);
    assert.equal(pausedRecord.pomodoroSuppressed, true);

    extension.onunload();
    extension.onload({ extensionAPI });
    click(topbarButton());
    click(action('Resume All'));
    await settle();
    const resumed = clock.getRunning()[0];
    assert.equal(pomodoro.targetMinutes(resumed.clockUid), null);
    assert.equal(pomodoro.isAssigned(resumed.clockUid), true);
    assert.equal(pomodoro.isActive(resumed.clockUid), false);
    assert.equal(JSON.parse(settingsStore.get('pomodoroTargets')).data[resumed.clockUid], 0);
});

test('Clock Out All permanently finishes running Tasks and clears an older paused batch', async () => {
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': 'pauseone1' });
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': 'pausetwo2' });
    click(topbarButton());
    click(action('Pause All'));
    await settle();

    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': 'pauseone1' });
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': 'pausetwo2' });
    assert.ok(action('Clock Out All'));
    click(action('Clock Out All'));
    click(action('Confirm Clock Out All'));
    await settle();

    assert.equal(clock.getRunning().length, 0);
    assert.equal(JSON.parse(settingsStore.get('pausedBatch')).data.items.length, 0);
});

test('a later Pause All merges newly running Tasks into the older batch', async () => {
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': 'pauseone1' });
    click(topbarButton());
    click(action('Pause All'));
    await settle();
    assert.deepEqual(
        JSON.parse(settingsStore.get('pausedBatch')).data.items.map(item => item.taskUid),
        ['pauseone1']
    );

    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': 'pausetwo2' });
    click(action('Pause All'));
    await settle();

    assert.deepEqual(
        JSON.parse(settingsStore.get('pausedBatch')).data.items.map(item => item.taskUid).sort(),
        ['pauseone1', 'pausetwo2']
    );
    assert.equal(popover().querySelector('.rlb-popover__title').textContent, '2 Tasks Paused');
});
