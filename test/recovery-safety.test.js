import test from 'node:test';
import assert from 'node:assert/strict';

import { installGraph, uninstallGraph } from './helpers/graph-stub.js';

const TASK = { uid: 'recovery1', string: '{{[[TODO]]}} recovery task', parent: null };
const OTHER = { uid: 'recovery2', string: '{{[[TODO]]}} another recovery task', parent: null };
const T0 = new Date('2026-08-15T09:00:00');

let graph;
let allowMultiple = true;
const store = new Map();

const extensionAPI = {
    settings: {
        get: key => store.get(key),
        set: (key, value) => store.set(key, value),
    },
};

const install = async () => {
    graph = installGraph([TASK, OTHER]);
    allowMultiple = true;
    store.clear();
    const { setExtensionAPI } = await import('../src/settings.js');
    setExtensionAPI(extensionAPI);
    const clock = await import('../src/clock.js');
    const paused = await import('../src/paused.js');
    const pomodoro = await import('../src/pomodoro.js');
    clock.reset();
    paused.reset();
    pomodoro.reset();
    return { clock, paused, pomodoro };
};

const extensionWithMultiple = {
    settings: {
        get: key => (key === 'allowMultipleClocks' ? allowMultiple : store.get(key)),
        set: (key, value) => store.set(key, value),
    },
};

const clockLines = taskUid => {
    const drawer = [...graph.store.values()].find(
        block => block.parent === taskUid && block.string === 'LOGBOOK::'
    );
    return drawer ? graph.childrenOf(drawer.uid).map(block => block.string) : [];
};

test.beforeEach(async () => {
    const { setExtensionAPI } = await import('../src/settings.js');
    setExtensionAPI(extensionWithMultiple);
});

test.after(() => uninstallGraph());

test('Clock Out All retains only the still-running Pause Batch records after a partial failure', async () => {
    const { clock, paused, pomodoro } = await install();
    await clock.clockIn(TASK.uid, { now: T0 });
    await clock.clockIn(OTHER.uid, { now: new Date(T0.getTime() + 1_000) });
    await paused.pauseAll({ now: new Date(T0.getTime() + 5 * 60_000) });

    await clock.clockIn(TASK.uid, { now: new Date(T0.getTime() + 6 * 60_000) });
    await clock.clockIn(OTHER.uid, { now: new Date(T0.getTime() + 6 * 60_000) });
    const failedUid = clock.getRunning().find(entry => entry.taskUid === OTHER.uid).clockUid;
    const originalUpdate = graph.api.data.block.update;
    graph.api.data.block.update = async args => {
        if (args.block.uid === failedUid) throw new Error('one close failed');
        return originalUpdate(args);
    };

    try {
        await paused.clockOutAll({ now: new Date(T0.getTime() + 7 * 60_000) });
    } finally {
        graph.api.data.block.update = originalUpdate;
    }

    assert.equal(clock.getRunning().length, 1);
    assert.equal(clock.getRunning()[0].taskUid, OTHER.uid);
    assert.deepEqual(
        paused.getPaused().map(item => item.taskUid),
        [OTHER.uid]
    );
    assert.match(paused.getNotice(), /could not be closed|could not be finished/i);
    assert.equal(pomodoro.getNotice(), '');
});

test('Resume retains a pending association when Pomodoro migration fails, then recovers without a duplicate Session', async () => {
    const { clock, paused, pomodoro } = await install();
    store.set(
        'pausedBatch',
        JSON.stringify({
            version: 1,
            items: [
                {
                    taskUid: TASK.uid,
                    title: 'recovery task',
                    pausedAtMs: T0.getTime(),
                    pomodoroRemainingMs: 17 * 60_000,
                },
            ],
        })
    );
    paused.load();
    pomodoro.load();

    const originalSet = extensionAPI.settings.set;
    let failPomodoro = true;
    extensionAPI.settings.set = (key, value) => {
        if (failPomodoro && key === 'pomodoroTargets') throw new Error('pomodoro write failed');
        originalSet(key, value);
    };
    try {
        const first = await paused.resumeAll({ now: T0 });
        assert.equal(first.resumed, 0);
        assert.equal(first.failed, 1);
    } finally {
        extensionAPI.settings.set = originalSet;
    }

    assert.equal(clock.getRunning().length, 1);
    assert.equal(clockLines(TASK.uid).length, 1);
    assert.equal(paused.getPaused().length, 1);
    assert.equal(paused.getPendingResume().length, 1);
    const persistedPending = JSON.parse(store.get('pausedBatch')).data.pendingResume;
    assert.equal(persistedPending[0].clockUid, clock.getRunning()[0].clockUid);

    // Simulate reload: the graph CLOCK remains, while only durable settings survive.
    paused.reset();
    pomodoro.reset();
    clock.reset();
    paused.load();
    pomodoro.load();
    clock.refresh();

    const second = await paused.resumeAll({ now: new Date(T0.getTime() + 1_000) });
    assert.equal(second.resumed, 1);
    assert.equal(clock.getRunning().length, 1);
    assert.equal(clockLines(TASK.uid).length, 1, 'recovery must not create a second Session');
    assert.equal(paused.getPaused().length, 0);
    assert.equal(paused.getPendingResume().length, 0);
    const resumedUid = clock.getRunning()[0].clockUid;
    assert.equal(pomodoro.targetDurationMs(resumedUid), 17 * 60_000);
});

test('legacy Pause and Pomodoro settings migrate to versioned data without losing values', async () => {
    const { paused, pomodoro } = await install();
    store.set(
        'pausedBatch',
        JSON.stringify({
            version: 1,
            items: [{ taskUid: TASK.uid, title: 'legacy', pausedAtMs: T0.getTime() }],
        })
    );
    store.set('pomodoroTargets', JSON.stringify({ legacyclock: 25 }));

    paused.load();
    pomodoro.load();

    assert.equal(paused.getPaused().length, 1);
    assert.equal(pomodoro.targetMinutes('legacyclock'), 25);
    assert.equal(JSON.parse(store.get('pausedBatch')).version, 2);
    assert.ok(JSON.parse(store.get('pausedBatch')).data);
    assert.equal(JSON.parse(store.get('pomodoroTargets')).version, 1);
    assert.equal(JSON.parse(store.get('pomodoroTargets')).data.legacyclock, 25);
});

test('unknown persisted versions are retained and surfaced instead of overwritten', async () => {
    const { paused, pomodoro } = await install();
    const pauseRaw = JSON.stringify({ version: 99, data: { items: [] } });
    const pomodoroRaw = JSON.stringify({ version: 99, data: { futureclock: 40 } });
    store.set('pausedBatch', pauseRaw);
    store.set('pomodoroTargets', pomodoroRaw);

    paused.load();
    pomodoro.load();

    assert.equal(store.get('pausedBatch'), pauseRaw);
    assert.equal(store.get('pomodoroTargets'), pomodoroRaw);
    assert.match(paused.getNotice(), /unsupported version|kept/i);
    assert.match(pomodoro.getNotice(), /unsupported version|kept/i);
});
