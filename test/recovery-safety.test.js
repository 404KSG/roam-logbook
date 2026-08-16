import test from 'node:test';
import assert from 'node:assert/strict';

import { installGraph, uninstallGraph } from './helpers/graph-stub.js';

const TASK = { uid: 'recovery1', string: '{{[[TODO]]}} recovery task', parent: null };
const OTHER = { uid: 'recovery2', string: '{{[[TODO]]}} another recovery task', parent: null };
const UNRELATED = { uid: 'recovery3', string: '{{[[TODO]]}} unrelated running task', parent: null };
const PARENT = { uid: 'recovery-parent', string: '{{[[TODO]]}} recovery parent', parent: null };
const PAUSED_CHILD = {
    uid: 'recovery-paused',
    string: '{{[[TODO]]}} paused recovery child',
    parent: 'recovery-parent',
};
const RUNNING_CHILD = {
    uid: 'recovery-running',
    string: '{{[[TODO]]}} running recovery child',
    parent: 'recovery-parent',
};
const RUNNING_SIBLING = {
    uid: 'recovery-sibling',
    string: '{{[[TODO]]}} running recovery sibling',
    parent: 'recovery-parent',
};
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

const install = async (blocks = [TASK, OTHER, UNRELATED]) => {
    graph = installGraph(blocks);
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
    const { setExtensionAPI } = await import('../src/settings.js');
    setExtensionAPI(extensionWithMultiple);
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

    let result;
    try {
        result = await paused.clockOutAll({ now: new Date(T0.getTime() + 7 * 60_000) });
    } finally {
        graph.api.data.block.update = originalUpdate;
    }

    assert.equal(result.ok, false);
    assert.equal(result.count, 1);
    assert.equal(result.completed, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.partial, true);
    assert.deepEqual(result.pendingClockUids, [failedUid]);
    assert.equal(clock.getRunning().length, 1);
    assert.equal(clock.getRunning()[0].taskUid, OTHER.uid);
    assert.deepEqual(
        paused.getPaused().map(item => item.taskUid),
        [OTHER.uid]
    );
    assert.match(paused.getNotice(), /could not be closed|could not be finished/i);
    assert.equal(pomodoro.getNotice(), '');
});

test('automatic completion keeps Pause Batch recovery until every tree Session is confirmed closed', async () => {
    const { clock, paused } = await install([PARENT, PAUSED_CHILD, RUNNING_CHILD, RUNNING_SIBLING]);
    const { setExtensionAPI } = await import('../src/settings.js');
    setExtensionAPI(extensionWithMultiple);
    await clock.clockIn(PAUSED_CHILD.uid, { now: T0 });
    await paused.pauseAll({ now: new Date(T0.getTime() + 60_000) });
    await clock.clockIn(RUNNING_CHILD.uid, { now: new Date(T0.getTime() + 2 * 60_000) });
    await clock.clockIn(RUNNING_SIBLING.uid, { now: new Date(T0.getTime() + 3 * 60_000) });

    const failedUid = clock.getRunning().find(entry => entry.taskUid === RUNNING_SIBLING.uid).clockUid;
    await graph.api.data.block.update({
        block: { uid: PARENT.uid, string: '{{[[DONE]]}} recovery parent' },
    });
    const originalUpdate = graph.api.data.block.update;
    graph.api.data.block.update = async args => {
        if (args.block.uid === failedUid) throw new Error('one automatic close failed');
        return originalUpdate(args);
    };

    let result;
    try {
        result = await clock.clockOutCompletedTask(PARENT.uid, {
            getPauseTaskUids: () => paused.getPaused().map(item => item.taskUid),
            pruneCompleted: taskUids => paused.pruneCompleted(taskUids),
            now: new Date(T0.getTime() + 4 * 60_000),
        });
    } finally {
        graph.api.data.block.update = originalUpdate;
    }

    assert.equal(result.partial, true);
    assert.deepEqual(result.pendingClockUids, [failedUid]);
    assert.deepEqual(paused.getPaused().map(item => item.taskUid), [PAUSED_CHILD.uid]);
    assert.equal(clock.getRunning().length, 1);
});

test('Clock Out All keeps a durable finalizing marker when clearing the batch cannot be committed', async () => {
    const { clock, paused } = await install();
    const { setExtensionAPI } = await import('../src/settings.js');
    setExtensionAPI(extensionWithMultiple);
    await clock.clockIn(TASK.uid, { now: T0 });
    await paused.pauseAll({ now: new Date(T0.getTime() + 5 * 60_000) });
    await clock.clockIn(TASK.uid, { now: new Date(T0.getTime() + 6 * 60_000) });

    const originalSet = extensionWithMultiple.settings.set;
    let pausedBatchWrites = 0;
    extensionWithMultiple.settings.set = (key, value) => {
        if (key === 'pausedBatch') {
            pausedBatchWrites += 1;
            if (pausedBatchWrites === 2) throw new Error('Pause Batch commit failed');
        }
        return originalSet(key, value);
    };

    let result;
    try {
        result = await paused.clockOutAll({ now: new Date(T0.getTime() + 7 * 60_000) });
    } finally {
        extensionWithMultiple.settings.set = originalSet;
    }

    assert.equal(result.uncertain, true);
    assert.equal(result.ok, false);
    assert.equal(clock.getRunning().length, 0, 'the graph close remains committed');
    const durable = JSON.parse(store.get('pausedBatch'));
    assert.ok(durable.data.finalizing, 'the durable recovery marker survives the failed clear');

    paused.reset();
    clock.reset();
    paused.load();
    clock.refresh();
    const recovered = await paused.resumeAll({ now: new Date(T0.getTime() + 8 * 60_000) });

    assert.equal(recovered.resumed, 0, 'reload reconciliation must not resurrect a closed Session');
    assert.equal(clock.getRunning().length, 0);
    assert.deepEqual(paused.getPaused(), []);
    assert.deepEqual(paused.getPendingResume(), []);
    assert.equal(JSON.parse(store.get('pausedBatch')).data.finalizing, undefined);
});

test('finalizing cleanup preserves a new Pause Batch item across settings failure and reload', async () => {
    const { clock, paused } = await install();
    const { setExtensionAPI } = await import('../src/settings.js');
    setExtensionAPI(extensionWithMultiple);
    await clock.clockIn(TASK.uid, { now: T0 });
    await paused.pauseAll({ now: new Date(T0.getTime() + 5 * 60_000) });
    await clock.clockIn(TASK.uid, { now: new Date(T0.getTime() + 6 * 60_000) });

    const originalSet = extensionWithMultiple.settings.set;
    let pausedBatchWrites = 0;
    extensionWithMultiple.settings.set = (key, value) => {
        if (key === 'pausedBatch') {
            pausedBatchWrites += 1;
            if (pausedBatchWrites === 2) throw new Error('Pause Batch commit failed');
        }
        return originalSet(key, value);
    };

    try {
        await paused.clockOutAll({ now: new Date(T0.getTime() + 7 * 60_000) });
    } finally {
        extensionWithMultiple.settings.set = originalSet;
    }

    await clock.clockIn(OTHER.uid, { now: new Date(T0.getTime() + 8 * 60_000) });
    await paused.pauseAll({ now: new Date(T0.getTime() + 9 * 60_000) });

    paused.reset();
    clock.reset();
    paused.load();
    clock.refresh();

    assert.deepEqual(paused.getPaused().map(item => item.taskUid), [OTHER.uid]);
    assert.ok(paused.getRecoveryState(), 'reload exposes the pending finalizing cleanup');
    const recovery = await paused.retryFinalizing({ now: new Date(T0.getTime() + 10 * 60_000) });

    assert.equal(recovery.ok, true);
    assert.equal(recovery.action, 'commit-pause-batch');
    assert.equal(clock.getRunning().length, 0, 'cleanup does not resume the newly paused Task');
    assert.deepEqual(paused.getPaused().map(item => item.taskUid), [OTHER.uid]);
    assert.equal(paused.getRecoveryState(), null);
});

test('malformed pendingResume is backed up and surfaced without discarding valid Pause Batch records', async () => {
    const { paused } = await install();
    const raw = JSON.stringify({
        version: 2,
        data: {
            items: [{ taskUid: TASK.uid, title: 'kept task', pausedAtMs: T0.getTime() }],
            pendingResume: { taskUid: OTHER.uid },
        },
    });
    store.set('pausedBatch', raw);

    paused.load();

    assert.deepEqual(paused.getPaused().map(item => item.taskUid), [TASK.uid]);
    assert.deepEqual(paused.getPendingResume(), []);
    assert.match(paused.getNotice(), /invalid|kept/i);
    assert.equal(store.get('pausedBatch'), raw, 'the malformed source remains untouched');
    assert.equal(JSON.parse(store.get('stateBackups')).data.pausedBatch.raw, raw);
});

test('Pause All returns a structured partial result and retries only the remaining Session', async () => {
    const { clock, paused } = await install();
    const { setExtensionAPI } = await import('../src/settings.js');
    setExtensionAPI(extensionWithMultiple);
    await clock.clockIn(TASK.uid, { now: T0 });
    await clock.clockIn(OTHER.uid, { now: new Date(T0.getTime() + 1_000) });
    const failedUid = clock.getRunning().find(entry => entry.taskUid === OTHER.uid).clockUid;
    const originalUpdate = graph.api.data.block.update;
    let failed = true;
    let updateCount = 0;
    graph.api.data.block.update = async args => {
        updateCount += 1;
        if (failed && args.block.uid === failedUid) throw new Error('one pause failed');
        return originalUpdate(args);
    };

    let first;
    try {
        first = await paused.pauseAll({ now: new Date(T0.getTime() + 5 * 60_000) });
    } finally {
        failed = false;
    }

    assert.equal(first.ok, false);
    assert.equal(first.partial, true);
    assert.equal(first.completed, 1);
    assert.equal(first.failed, 1);
    assert.equal(first.pending, 1);
    assert.deepEqual(first.retry.retryClockUids, [failedUid]);
    assert.equal(paused.getPaused().length, 2, 'the failed Task remains in the recoverable Pause Batch');
    assert.equal(clock.getRunning().length, 1);

    const retry = await paused.pauseAll({ now: new Date(T0.getTime() + 6 * 60_000) });
    graph.api.data.block.update = originalUpdate;
    assert.equal(retry.ok, true);
    assert.equal(retry.count, 1);
    assert.equal(retry.failed, 0);
    assert.equal(paused.getPaused().length, 2);
    assert.equal(clock.getRunning().length, 0);
    assert.equal(updateCount, 3, 'the successful Session is not written again on retry');
});

test('Pause All keeps the existing Pause Batch when its preflight snapshot is uncertain', async () => {
    const { clock, paused } = await install();
    const { setExtensionAPI } = await import('../src/settings.js');
    setExtensionAPI(extensionWithMultiple);
    await clock.clockIn(TASK.uid, { now: T0 });
    await paused.pauseAll({ now: new Date(T0.getTime() + 5 * 60_000) });
    await clock.clockIn(OTHER.uid, { now: new Date(T0.getTime() + 6 * 60_000) });

    const originalQuery = graph.api.data.q;
    graph.api.data.q = () => {
        throw new Error('preflight snapshot unavailable');
    };
    let result;
    try {
        result = await paused.pauseAll({ now: new Date(T0.getTime() + 7 * 60_000) });
    } finally {
        graph.api.data.q = originalQuery;
    }

    assert.equal(result.uncertain, true);
    assert.equal(result.completed, 0);
    assert.deepEqual(paused.getPaused().map(item => item.taskUid), [TASK.uid]);
    assert.equal(clock.getRunning().length, 1, 'preflight uncertainty performs no pause write');
});

test('Resume All returns a structured partial result and retries only the retained Task', async () => {
    const { clock, paused } = await install();
    const { setExtensionAPI } = await import('../src/settings.js');
    setExtensionAPI(extensionWithMultiple);
    await clock.clockIn(TASK.uid, { now: T0 });
    await clock.clockIn(OTHER.uid, { now: new Date(T0.getTime() + 1_000) });
    await paused.pauseAll({ now: new Date(T0.getTime() + 5 * 60_000) });

    const originalCreate = graph.api.data.block.create;
    let failed = true;
    graph.api.data.block.create = async args => {
        const parent = graph.store.get(args.location['parent-uid']);
        if (failed && parent?.parent === OTHER.uid) throw new Error('one resume failed');
        return originalCreate(args);
    };

    let first;
    try {
        first = await paused.resumeAll({ now: new Date(T0.getTime() + 6 * 60_000) });
    } finally {
        failed = false;
    }

    assert.equal(first.ok, false);
    assert.equal(first.partial, true);
    assert.equal(first.completed, 1);
    assert.equal(first.resumed, 1);
    assert.equal(first.failed, 1);
    assert.equal(first.pending, 1);
    assert.deepEqual(first.pendingTaskUids, [OTHER.uid]);
    assert.deepEqual(paused.getPaused().map(item => item.taskUid), [OTHER.uid]);
    assert.equal(clock.getRunning().length, 1);

    const retry = await paused.resumeAll({ now: new Date(T0.getTime() + 7 * 60_000) });
    graph.api.data.block.create = originalCreate;
    assert.equal(retry.ok, true);
    assert.equal(retry.count, 1);
    assert.equal(retry.failed, 0);
    assert.equal(paused.getPaused().length, 0);
    assert.equal(clock.getRunning().length, 2, 'retry adds only the retained Task');
    assert.equal(
        graph.childrenOf(graph.childrenOf(TASK.uid).find(block => block.string === 'LOGBOOK::').uid).filter(block =>
            block.string.startsWith('CLOCK::')
        ).length,
        2,
        'the already resumed Task keeps exactly one new Session'
    );
});

test('Clock Out All stops after a post-write refresh failure and keeps an exact retryable remainder', async () => {
    const { clock, paused } = await install();
    const { setExtensionAPI } = await import('../src/settings.js');
    setExtensionAPI(extensionWithMultiple);
    await clock.clockIn(TASK.uid, { now: T0 });
    await clock.clockIn(OTHER.uid, { now: new Date(T0.getTime() + 1_000) });

    const originalQuery = graph.api.data.q;
    const originalUpdate = graph.api.data.block.update;
    let failNextRead = 0;
    let updateCount = 0;
    graph.api.data.block.update = async args => {
        updateCount += 1;
        const result = await originalUpdate(args);
        failNextRead = 2;
        return result;
    };
    graph.api.data.q = (...args) => {
        if (failNextRead > 0) {
            failNextRead -= 1;
            throw new Error('refresh failed after bulk close');
        }
        return originalQuery(...args);
    };

    try {
        const result = await paused.clockOutAll({ now: new Date(T0.getTime() + 5 * 60_000) });
        assert.equal(result.uncertain, true);
        assert.equal(result.partial, true);
        assert.equal(updateCount, 1, 'the post-write read failure stops the next destructive update');
        assert.match(paused.getNotice(), /Graph state could not be confirmed/i);
        assert.equal(clock.getRunning().length >= 1, true, 'the cached running state remains non-empty');
        const graphRunning = [clockLines(TASK.uid), clockLines(OTHER.uid)]
            .flat()
            .filter(line => typeof line === 'string' && !line.includes('--'));
        assert.equal(graphRunning.length, 1, 'the unattempted Session was not destructively changed');
    } finally {
        graph.api.data.q = originalQuery;
        graph.api.data.block.update = originalUpdate;
    }
});

test('Pause All stops after a post-write refresh failure and resumes the exact remainder on retry', async () => {
    const { clock, paused } = await install();
    const { setExtensionAPI } = await import('../src/settings.js');
    setExtensionAPI(extensionWithMultiple);
    await clock.clockIn(TASK.uid, { now: T0 });
    await clock.clockIn(OTHER.uid, { now: new Date(T0.getTime() + 1_000) });

    const originalQuery = graph.api.data.q;
    const originalUpdate = graph.api.data.block.update;
    let failNextRead = 0;
    let updateCount = 0;
    graph.api.data.block.update = async args => {
        updateCount += 1;
        const result = await originalUpdate(args);
        failNextRead = 2;
        return result;
    };
    graph.api.data.q = (...args) => {
        if (failNextRead > 0) {
            failNextRead -= 1;
            throw new Error('refresh failed after pause');
        }
        return originalQuery(...args);
    };

    let first;
    try {
        first = await paused.pauseAll({ now: new Date(T0.getTime() + 5 * 60_000) });
        assert.equal(first.uncertain, true);
        assert.equal(first.partial, true);
        assert.equal(first.paused, 1);
        assert.equal(first.failed, 1);
        assert.equal(updateCount, 1, 'the failed confirmation stops the next pause write');
        assert.equal(
            [clockLines(TASK.uid), clockLines(OTHER.uid)]
                .flat()
                .filter(line => !line.includes('--')).length,
            1
        );
        assert.equal(
            paused.getPaused().length,
            2,
            'the Pause Batch keeps the confirmed Session and the exact unconfirmed remainder'
        );
        assert.match(paused.getNotice(), /Graph state could not be confirmed/i);
    } finally {
        graph.api.data.q = originalQuery;
        graph.api.data.block.update = originalUpdate;
    }

    const retry = await paused.pauseAll({ now: new Date(T0.getTime() + 6 * 60_000) });
    assert.equal(retry.uncertain, false);
    assert.equal(retry.failed, 0);
    assert.equal(paused.getPaused().length, 2);
    assert.equal(
        [clockLines(TASK.uid), clockLines(OTHER.uid)]
            .flat()
            .filter(line => !line.includes('--')).length,
        0,
        'retry closes only the unconfirmed remainder and does not duplicate the first Session'
    );
});

test('Resume ignores legacy Pomodoro remainder and keeps the exact Session association', async () => {
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
        assert.equal(first.resumed, 1);
        assert.equal(first.failed, 0);
    } finally {
        extensionAPI.settings.set = originalSet;
    }

    assert.equal(clock.getRunning().length, 1);
    assert.equal(clockLines(TASK.uid).length, 1);
    assert.equal(paused.getPaused().length, 0);
    assert.equal(paused.getPendingResume().length, 0);
    assert.equal(pomodoro.targetDurationMs(clock.getRunning()[0].clockUid), null);

    // Simulate reload: the graph CLOCK remains, while only durable settings survive.
    paused.reset();
    pomodoro.reset();
    clock.reset();
    paused.load();
    pomodoro.load();
    clock.refresh();

    const second = await paused.resumeAll({ now: new Date(T0.getTime() + 1_000) });
    assert.equal(second.resumed, 0);
    assert.equal(clock.getRunning().length, 1);
    assert.equal(clockLines(TASK.uid).length, 1, 'recovery must not create a second Session');
    assert.equal(paused.getPaused().length, 0);
    assert.equal(paused.getPendingResume().length, 0);
    const resumedUid = clock.getRunning()[0].clockUid;
    assert.equal(pomodoro.targetDurationMs(resumedUid), null);
});

test('Resume does not close an unrelated Session while two exact pending associations are unresolved', async () => {
    const { clock, paused, pomodoro } = await install();
    allowMultiple = false;
    store.set(
        'pausedBatch',
        JSON.stringify({
            version: 2,
            data: {
                items: [],
                pendingResume: [
                    {
                        taskUid: TASK.uid,
                        title: 'recovery task',
                        pausedAtMs: T0.getTime(),
                        pomodoroRemainingMs: 12 * 60_000,
                        clockUid: 'old-clock-one',
                    },
                    {
                        taskUid: OTHER.uid,
                        title: 'another recovery task',
                        pausedAtMs: T0.getTime(),
                        pomodoroRemainingMs: 8 * 60_000,
                        clockUid: 'old-clock-two',
                    },
                ],
            },
        })
    );
    paused.load();
    pomodoro.load();

    await clock.clockIn(UNRELATED.uid, { now: T0 });
    const unrelatedUid = clock.getRunning()[0].clockUid;
    const result = await paused.resumeAll({ now: new Date(T0.getTime() + 1_000) });

    assert.equal(clock.getRunning().length, 1, 'the unrelated Session must remain the only running Session');
    assert.equal(clock.getRunning()[0].clockUid, unrelatedUid);
    assert.equal(clock.getRunning()[0].taskUid, UNRELATED.uid);
    assert.equal(result.resumed, 0);
    assert.equal(paused.getPendingResume().length, 2, 'unresolved exact pending entries remain retryable');
    assert.match(paused.getNotice(), /conflict|could not be confirmed|old-clock/i);
});

test('a missing exact pending Session never transfers its Pomodoro remainder to a later Session', async () => {
    const { clock, paused, pomodoro } = await install();
    allowMultiple = true;
    store.set(
        'pausedBatch',
        JSON.stringify({
            version: 2,
            data: {
                items: [],
                pendingResume: [
                    {
                        taskUid: TASK.uid,
                        title: 'recovery task',
                        pausedAtMs: T0.getTime(),
                        pomodoroRemainingMs: 7 * 60_000,
                        clockUid: 'old-session-that-disappeared',
                    },
                ],
            },
        })
    );
    paused.load();
    pomodoro.load();

    await clock.clockIn(TASK.uid, { now: T0 });
    const laterUid = clock.getRunning()[0].clockUid;
    const result = await paused.resumeAll({ now: new Date(T0.getTime() + 1_000) });

    assert.equal(result.resumed, 0);
    assert.equal(paused.getPendingResume().length, 1);
    assert.notEqual(pomodoro.targetDurationMs(laterUid), 7 * 60_000);
    assert.match(paused.getNotice(), /conflict|exact Session/i);
});

test('current pending Resume without a clockUid is a conflict, never a task fallback', async () => {
    const { clock, paused, pomodoro } = await install();
    store.set(
        'pausedBatch',
        JSON.stringify({
            version: 2,
            data: {
                items: [],
                pendingResume: [
                    {
                        taskUid: TASK.uid,
                        title: 'current pending without association',
                        pausedAtMs: T0.getTime(),
                        pomodoroRemainingMs: 9 * 60_000,
                        clockUid: null,
                    },
                ],
            },
        })
    );
    paused.load();
    pomodoro.load();

    await clock.clockIn(TASK.uid, { now: T0 });
    const laterUid = clock.getRunning()[0].clockUid;
    const result = await paused.resumeAll({ now: new Date(T0.getTime() + 1_000) });

    assert.equal(result.resumed, 0);
    assert.equal(result.legacyRecovery, false);
    assert.equal(paused.getPendingResume().length, 1);
    assert.equal(paused.getPendingResume()[0].recoveryState, 'conflict');
    assert.notEqual(pomodoro.targetDurationMs(laterUid), 9 * 60_000);
    assert.match(paused.getNotice(), /conflict|clockUid|exact Session/i);
});

test('current pending Resume without a clockUid cannot create a replacement Session', async () => {
    const { clock, paused, pomodoro } = await install();
    store.set(
        'pausedBatch',
        JSON.stringify({
            version: 2,
            data: {
                items: [],
                pendingResume: [
                    {
                        taskUid: TASK.uid,
                        title: 'current pending without association',
                        pausedAtMs: T0.getTime(),
                        pomodoroRemainingMs: 9 * 60_000,
                        clockUid: '',
                    },
                ],
            },
        })
    );
    paused.load();
    pomodoro.load();

    const result = await paused.resumeAll({ now: T0 });

    assert.equal(result.resumed, 0);
    assert.equal(clock.getRunning().length, 0);
    assert.equal(paused.getPendingResume().length, 1);
    assert.equal(pomodoro.targetDurationMs('new-clock'), null);
    assert.match(paused.getNotice(), /conflict|clockUid/i);
});

test('current pending Resume conflict survives repeated reload without consuming or rebinding', async () => {
    const { paused } = await install();
    const raw = JSON.stringify({
        version: 2,
        data: {
            items: [],
            pendingResume: [
                {
                    taskUid: TASK.uid,
                    title: 'reload-safe conflict',
                    pausedAtMs: T0.getTime(),
                    pomodoroRemainingMs: 6 * 60_000,
                    clockUid: null,
                },
            ],
        },
    });
    store.set('pausedBatch', raw);

    paused.load();
    const first = paused.getPendingResume();
    paused.reset();
    paused.load();
    const second = paused.getPendingResume();

    assert.deepEqual(second, first);
    assert.equal(second[0].legacy, false);
    assert.equal(second[0].recoveryState, 'conflict');
    const canonical = store.get('pausedBatch');
    assert.notEqual(canonical, raw, 'legacy Pomodoro fields are removed during safe migration');
    assert.match(canonical, /"recoveryState":"conflict"/);
    assert.equal(canonical, JSON.stringify({ version: 2, data: { items: [], pendingResume: second } }));
});

test('explicit legacy pending Resume uses task fallback and reports legacy recovery', async () => {
    const { clock, paused, pomodoro } = await install();
    store.set(
        'pausedBatch',
        JSON.stringify({
            version: 2,
            data: {
                items: [],
                pendingResume: [
                    {
                        taskUid: TASK.uid,
                        title: 'legacy pending association',
                        pausedAtMs: T0.getTime(),
                        pomodoroRemainingMs: 9 * 60_000,
                        legacy: true,
                        sourceVersion: 1,
                    },
                ],
            },
        })
    );
    paused.load();
    pomodoro.load();

    await clock.clockIn(TASK.uid, { now: T0 });
    const runningUid = clock.getRunning()[0].clockUid;
    const result = await paused.resumeAll({ now: new Date(T0.getTime() + 1_000) });

    assert.equal(result.resumed, 1);
    assert.equal(result.legacyRecovery, true);
    assert.equal(result.legacyRecovered, 1);
    assert.equal(paused.getPendingResume().length, 0);
    assert.equal(pomodoro.targetDurationMs(runningUid), null);
    assert.match(paused.getNotice(), /legacy.*recovery|legacy.*Task matching/i);
});

test('version-one pending Resume is migrated with an explicit legacy marker', async () => {
    const { paused } = await install();
    store.set(
        'pausedBatch',
        JSON.stringify({
            version: 1,
            items: [],
            pendingResume: [
                {
                    taskUid: TASK.uid,
                    title: 'migrated pending association',
                    pausedAtMs: T0.getTime(),
                    pomodoroRemainingMs: 4 * 60_000,
                },
            ],
        })
    );

    paused.load();

    const pending = paused.getPendingResume();
    assert.equal(pending.length, 1);
    assert.equal(pending[0].legacy, true);
    assert.equal(pending[0].sourceVersion, 1);
    assert.equal(JSON.parse(store.get('pausedBatch')).data.pendingResume[0].legacy, true);
    assert.equal(JSON.parse(store.get('pausedBatch')).data.pendingResume[0].sourceVersion, 1);
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
