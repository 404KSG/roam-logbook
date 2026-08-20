import test from 'node:test';
import assert from 'node:assert/strict';

import { installGraph, uninstallGraph } from './helpers/graph-stub.js';

installGraph();

const clock = await import('../src/clock.js');
const { setExtensionAPI } = await import('../src/settings.js');

const TASK = { uid: 'taskone01', string: '{{[[TODO]]}} this is a test task', parent: null };
const OTHER = { uid: 'tasktwo02', string: '{{[[TODO]]}} another task', parent: null };

const AT_1558 = new Date(2026, 7, 5, 15, 58);
const AT_1658 = new Date(2026, 7, 5, 16, 58);
const AT_1005 = new Date(2026, 7, 17, 10, 5);

const createManualMutationScheduler = () => {
    const pending = [];
    return {
        schedule(callback) {
            pending.push(callback);
            return () => {
                const index = pending.indexOf(callback);
                if (index >= 0) pending.splice(index, 1);
            };
        },
        runNext() {
            pending.shift()?.();
        },
        get size() {
            return pending.length;
        },
    };
};

/** Rebuild the graph and the clock module's derived state. */
function seed(blocks) {
    const graph = installGraph(blocks);
    clock.refresh();
    return graph;
}

const drawerOf = (graph, taskUid) =>
    graph.childrenOf(taskUid).find(block => block.string.includes('LOGBOOK'));

const clockLinesOf = (graph, taskUid) =>
    graph.childrenOf(drawerOf(graph, taskUid).uid).map(block => block.string);

test.beforeEach(() => setExtensionAPI(null));
test.after(() => uninstallGraph());

test('clocking in creates the drawer and a running entry', async () => {
    const graph = seed([TASK]);

    const { taskUid } = await clock.clockIn('taskone01', { now: AT_1558 });

    assert.equal(taskUid, 'taskone01');
    assert.equal(drawerOf(graph, 'taskone01').string, 'LOGBOOK::');
    assert.equal(drawerOf(graph, 'taskone01').open, false);
    assert.deepEqual(clockLinesOf(graph, 'taskone01'), ['CLOCK: [2026-08-05 Wed 15:58]']);
    assert.equal(clock.getRunning().length, 1);
    assert.equal(clock.getRunning()[0].title, 'this is a test task');
});

test('clock refresh does not perform an extra hierarchy read for removed breadcrumbs', async () => {
    const parent = { uid: 'context-parent', string: '03 - Daily Tasks', parent: null };
    const task = { uid: 'context-task', string: '{{[[TODO]]}} Child task', parent: parent.uid };
    const graph = seed([parent, task]);

    await clock.clockIn(task.uid, { now: AT_1558 });

    const beforeRefresh = graph.queryLog().length;
    clock.refresh();
    const refreshQueries = graph.queryLog().slice(beforeRefresh);
    assert.equal(
        refreshQueries.some(query => query.includes(':find ?uid ?parent-uid')),
        false,
        'Active refresh must not walk parent chains for presentation metadata'
    );
    assert.equal(
        refreshQueries.some(query => query.includes(':find ?target-uid ?mirror-uid')),
        false,
        'Active refresh must not resolve mirror context for presentation metadata'
    );
    const entry = clock.getEntriesSnapshot().find(item => item.taskUid === task.uid);
    assert.equal('contextPath' in entry, false);
    assert.equal(clock.getRunning()[0].taskUid, task.uid);
});

test('the core Clock In path rejects plain and completed blocks without writing', async () => {
    const plain = { uid: 'plain0001', string: 'just a note', parent: null };
    const done = { uid: 'done00001', string: '{{[[DONE]]}} completed task', parent: null };
    const graph = seed([TASK, plain, done]);

    for (const uid of [plain.uid, done.uid]) {
        await assert.rejects(
            () => clock.clockIn(uid, { now: AT_1558 }),
            error => error?.code === 'todo-only' && /unfinished TODO/i.test(error.message)
        );
    }

    assert.equal(clock.getRunning().length, 0);
    assert.equal(graph.childrenOf(plain.uid).length, 0);
    assert.equal(graph.childrenOf(done.uid).length, 0);
});

test('repeating Clock In on the confirmed Timing Line publishes a user action', async () => {
    seed([TASK]);
    const actions = [];
    const unsubscribe = clock.subscribeActions(action => actions.push(action));
    try {
        await clock.clockIn(TASK.uid, { now: AT_1558 });
        const repeated = await clock.clockIn(TASK.uid, { now: AT_1658 });

        assert.equal(repeated.alreadyFocused, true);
        assert.equal(actions.length, 2);
        assert.equal(actions[1].type, 'clock-in');
        assert.equal(actions[1].source, 'user');
        assert.equal(actions[1].taskUid, TASK.uid);
        assert.equal(actions[1].alreadyFocused, true);
        assert.equal(actions[1].newCycle, false);
    } finally {
        unsubscribe();
    }
});

test('Clock In publishes sidebar navigation intent before graph confirmation settles', async () => {
    seed([TASK]);
    const intents = [];
    const unsubscribe = clock.subscribeClockInIntents(intent => intents.push(intent));
    let settled = false;
    try {
        const pending = clock.clockIn(TASK.uid, {
            now: AT_1558,
            source: 'active-work-switch',
        }).finally(() => {
            settled = true;
        });

        assert.equal(settled, false);
        assert.deepEqual(intents, [
            {
                type: 'clock-in-intent',
                source: 'active-work-switch',
                taskUid: TASK.uid,
            },
        ]);
        await pending;
    } finally {
        unsubscribe();
    }
});

test('an accepted sidebar intent yields before graph writes and keeps the click timestamp', async () => {
    const graph = seed([TASK]);
    const scheduler = createManualMutationScheduler();
    const intents = [];
    const unsubscribe = clock.subscribeClockInIntents(intent => {
        intents.push(intent);
        return true;
    });
    try {
        const pending = clock.clockIn(TASK.uid, {
            now: AT_1558,
            source: 'active-work-switch',
            scheduleMutationStartFn: scheduler.schedule,
        });

        assert.deepEqual(intents, [
            {
                type: 'clock-in-intent',
                source: 'active-work-switch',
                taskUid: TASK.uid,
            },
        ]);
        assert.equal(scheduler.size, 0, 'the intent publishes synchronously');
        assert.equal(graph.childrenOf(TASK.uid).length, 0, 'the graph is untouched before the yield');

        await Promise.resolve();
        assert.equal(scheduler.size, 1, 'the queued mutation waits for its injected start scheduler');
        assert.equal(graph.childrenOf(TASK.uid).length, 0);

        scheduler.runNext();
        const result = await pending;
        assert.equal(result.taskUid, TASK.uid);
        assert.deepEqual(clockLinesOf(graph, TASK.uid), ['CLOCK: [2026-08-05 Wed 15:58]']);
    } finally {
        unsubscribe();
    }
});

test('deferred Clock Ins remain serial and later mutations cannot pass the first one', async () => {
    const graph = seed([TASK, OTHER]);
    const scheduler = createManualMutationScheduler();
    const unsubscribe = clock.subscribeClockInIntents(() => true);
    try {
        const first = clock.clockIn(TASK.uid, {
            now: AT_1558,
            source: 'active-work-switch',
            scheduleMutationStartFn: scheduler.schedule,
        });
        const second = clock.clockIn(OTHER.uid, {
            now: AT_1658,
            source: 'active-work-switch',
            scheduleMutationStartFn: scheduler.schedule,
        });

        await Promise.resolve();
        assert.equal(scheduler.size, 1, 'only the first queued mutation may start');
        scheduler.runNext();
        await first;

        await Promise.resolve();
        assert.equal(scheduler.size, 1, 'the second start is scheduled only after the first settles');
        scheduler.runNext();
        await second;

        assert.equal(clock.getRunning()[0].taskUid, OTHER.uid);
        assert.deepEqual(clockLinesOf(graph, TASK.uid), ['CLOCK: [2026-08-05 Wed 15:58]--[2026-08-05 Wed 16:58] => 1:00']);
        assert.deepEqual(clockLinesOf(graph, OTHER.uid), ['CLOCK: [2026-08-05 Wed 16:58]']);
    } finally {
        unsubscribe();
    }
});

test('reset cancels an unstarted deferred mutation with the existing invalidated result', async () => {
    const graph = seed([TASK]);
    const scheduler = createManualMutationScheduler();
    const unsubscribe = clock.subscribeClockInIntents(() => true);
    try {
        const pending = clock.clockIn(TASK.uid, {
            now: AT_1558,
            source: 'active-work-switch',
            scheduleMutationStartFn: scheduler.schedule,
        });
        await Promise.resolve();
        assert.equal(scheduler.size, 1);

        clock.reset();
        const result = await pending;
        assert.equal(result.invalidated, true);
        assert.equal(result.retryable, true);
        assert.equal(scheduler.size, 0, 'reset cancels the not-yet-started scheduler callback');
        assert.equal(graph.childrenOf(TASK.uid).length, 0);
    } finally {
        unsubscribe();
    }
});

test('without an accepted sidebar intent, Clock In and Clock Out keep the immediate queue path', async () => {
    const graph = seed([TASK]);
    const scheduler = createManualMutationScheduler();
    const unsubscribe = clock.subscribeClockInIntents(() => false);
    try {
        const started = await clock.clockIn(TASK.uid, {
            now: AT_1558,
            scheduleMutationStartFn: scheduler.schedule,
        });
        assert.equal(scheduler.size, 0);

        await clock.clockOut(started.clockUid, { now: AT_1658 });
        assert.equal(scheduler.size, 0, 'Clock Out has no navigation intent');
        assert.deepEqual(clockLinesOf(graph, TASK.uid), [
            'CLOCK: [2026-08-05 Wed 15:58]--[2026-08-05 Wed 16:58] => 1:00',
        ]);
    } finally {
        unsubscribe();
    }
});

test('the drawer sits directly under the task, as in org', async () => {
    const graph = seed([TASK]);
    await clock.clockIn('taskone01', { now: AT_1558 });
    assert.equal(graph.childrenOf('taskone01')[0].string, 'LOGBOOK::');
});

test('Clock In does not collapse an existing drawer', async () => {
    const graph = seed([
        TASK,
        { uid: 'open-drawer', string: 'LOGBOOK::', parent: TASK.uid, open: true },
    ]);

    await clock.clockIn(TASK.uid, { now: AT_1558 });

    assert.equal(graph.store.get('open-drawer').open, true);
});

test('entries nest under the drawer, never beside it', async () => {
    const graph = seed([TASK]);
    const { clockUid } = await clock.clockIn('taskone01', { now: AT_1558 });

    // task > LOGBOOK:: > CLOCK: — a CLOCK block as a sibling of the drawer
    // would still read back, but it is not the org shape.
    const drawer = graph.store.get(graph.store.get(clockUid).parent);
    assert.equal(drawer.string, 'LOGBOOK::');
    assert.equal(drawer.parent, 'taskone01');
    assert.equal(graph.childrenOf('taskone01').length, 1);
});

test('clocking out writes the end stamp and the org duration', async () => {
    const graph = seed([TASK]);
    await clock.clockIn('taskone01', { now: AT_1558 });

    await clock.clockOut(clock.getRunning()[0].clockUid, { now: AT_1658 });

    assert.deepEqual(clockLinesOf(graph, 'taskone01'), [
        'CLOCK: [2026-08-05 Wed 15:58]--[2026-08-05 Wed 16:58] => 1:00',
    ]);
    assert.equal(clock.getRunning().length, 0);
});

test('a second session is inserted before the first and remains independent', async () => {
    const graph = seed([TASK]);
    await clock.clockIn('taskone01', { now: AT_1558 });
    await clock.clockOut(clock.getRunning()[0].clockUid, { now: AT_1658 });
    await clock.clockIn('taskone01', { now: new Date(2026, 7, 5, 18, 0) });

    assert.equal(graph.childrenOf('taskone01').filter(b => b.string.startsWith('LOGBOOK')).length, 1);
    assert.deepEqual(clockLinesOf(graph, 'taskone01'), [
        'CLOCK: [2026-08-05 Wed 18:00]',
        'CLOCK: [2026-08-05 Wed 15:58]--[2026-08-05 Wed 16:58] => 1:00',
    ]);
    assert.equal(graph.childrenOf(drawerOf(graph, 'taskone01').uid).length, 2);
});

test('logging against a block reference writes to the original block', async () => {
    const graph = seed([TASK, { uid: 'mirror001', string: '((taskone01))', parent: null }]);

    const { taskUid } = await clock.clockIn('mirror001', { now: AT_1558 });

    assert.equal(taskUid, 'taskone01');
    assert.equal(drawerOf(graph, 'taskone01').string, 'LOGBOOK::');
    assert.equal(drawerOf(graph, 'mirror001'), undefined);
});

test('a chain of references resolves to the block at the end', async () => {
    seed([
        TASK,
        { uid: 'mirror001', string: '((taskone01))', parent: null },
        { uid: 'mirror002', string: '{{embed: ((mirror001))}}', parent: null },
    ]);
    assert.equal(clock.resolveTaskUid('mirror002'), 'taskone01');
});

test('by default a new clock closes the running one', async () => {
    const graph = seed([TASK, OTHER]);
    await clock.clockIn('taskone01', { now: AT_1558 });

    await clock.clockIn('tasktwo02', { now: AT_1658 });

    assert.deepEqual(clockLinesOf(graph, 'taskone01'), [
        'CLOCK: [2026-08-05 Wed 15:58]--[2026-08-05 Wed 16:58] => 1:00',
    ]);
    assert.equal(clock.getRunning().length, 1);
    assert.equal(clock.getRunning()[0].taskUid, 'tasktwo02');
});

test('clocking in another task always closes the previous Focused CLOCK', async () => {
    setExtensionAPI({ settings: { get: key => (key === 'allowMultipleClocks' ? true : undefined) } });
    const graph = seed([TASK, OTHER]);

    await clock.clockIn('taskone01', { now: AT_1558 });
    await clock.clockIn('tasktwo02', { now: AT_1658 });

    assert.equal(clock.getRunning().length, 1);
    assert.equal(clock.getRunning()[0].taskUid, 'tasktwo02');
    assert.deepEqual(clockLinesOf(graph, 'taskone01'), [
        'CLOCK: [2026-08-05 Wed 15:58]--[2026-08-05 Wed 16:58] => 1:00',
    ]);
});

test('reload reconciliation closes legacy overlapping CLOCKs and keeps the newest Focused one', async () => {
    const graph = seed([
        TASK,
        OTHER,
        { uid: 'legacy-drawer-1', string: 'LOGBOOK::', parent: TASK.uid },
        { uid: 'legacy-clock-1', string: 'CLOCK: [2026-08-17 Mon 09:00]', parent: 'legacy-drawer-1' },
        { uid: 'legacy-drawer-2', string: 'LOGBOOK::', parent: OTHER.uid },
        { uid: 'legacy-clock-2', string: 'CLOCK: [2026-08-17 Mon 10:00]', parent: 'legacy-drawer-2' },
    ]);

    const result = await clock.reconcileOpenClocks({ now: AT_1005 });

    assert.equal(result.ok, true);
    assert.equal(result.closed, 1);
    assert.equal(clock.getRunning().length, 1);
    assert.equal(clock.getRunning()[0].taskUid, OTHER.uid);
    assert.equal(
        graph.store.get('legacy-clock-1').string,
        'CLOCK: [2026-08-17 Mon 09:00]--[2026-08-17 Mon 10:00] => 1:00'
    );
});

test('clocking out a block finds its running entry', async () => {
    const graph = seed([TASK]);
    await clock.clockIn('taskone01', { now: AT_1558 });

    assert.equal(await clock.clockOutBlock('taskone01', { now: AT_1658 }), true);
    assert.ok(clockLinesOf(graph, 'taskone01')[0].includes('=> 1:00'));
    assert.equal(await clock.clockOutBlock('taskone01', { now: AT_1658 }), false);
});

test('an end before the start clamps to a zero-length session', async () => {
    const graph = seed([TASK]);
    await clock.clockIn('taskone01', { now: AT_1658 });

    // Clock skew or a manual edit must not produce a negative duration.
    await clock.clockOut(clock.getRunning()[0].clockUid, { now: AT_1558 });

    assert.deepEqual(clockLinesOf(graph, 'taskone01'), [
        'CLOCK: [2026-08-05 Wed 16:58]--[2026-08-05 Wed 16:58] => 0:00',
    ]);
});

test('discarding the last entry removes the empty drawer too', async () => {
    const graph = seed([TASK]);
    await clock.clockIn('taskone01', { now: AT_1558 });

    await clock.discardClock(clock.getRunning()[0].clockUid);

    assert.equal(drawerOf(graph, 'taskone01'), undefined);
    assert.equal(clock.getRunning().length, 0);
});

test('discarding one of several entries keeps the drawer', async () => {
    const graph = seed([TASK]);
    await clock.clockIn('taskone01', { now: AT_1558 });
    await clock.clockOut(clock.getRunning()[0].clockUid, { now: AT_1658 });
    await clock.clockIn('taskone01', { now: new Date(2026, 7, 5, 18, 0) });

    await clock.discardClock(clock.getRunning()[0].clockUid);

    assert.equal(clockLinesOf(graph, 'taskone01').length, 1);
});

test('a clock left open in the graph is picked back up on refresh', () => {
    seed([
        TASK,
        { uid: 'drawer001', string: 'LOGBOOK::', parent: 'taskone01' },
        { uid: 'entry0001', string: 'CLOCK:: [2026-08-04 Tue 09:00]', parent: 'drawer001' },
    ]);

    // This is the reload path: no extension state, just what the graph says.
    assert.equal(clock.getRunning().length, 1);
    assert.equal(clock.getRunning()[0].clockUid, 'entry0001');
    assert.equal(clock.isBlockRunning('taskone01'), true);
});

test('reload keeps mixed historical drawer and CLOCK spellings readable', () => {
    const graph = seed([
        TASK,
        { uid: 'mixed-drawer', string: ':LOGBOOK:', parent: 'taskone01' },
        {
            uid: 'mixed-legacy',
            string: 'CLOCK:: [2026-08-04 Tue 09:00]--[2026-08-04 Tue 09:30] => 0:30',
            parent: 'mixed-drawer',
            order: 1,
        },
        {
            uid: 'mixed-current',
            string: 'CLOCK: [2026-08-04 Tue 10:00]',
            parent: 'mixed-drawer',
            order: 0,
        },
    ]);

    assert.deepEqual(clockLinesOf(graph, 'taskone01'), [
        'CLOCK: [2026-08-04 Tue 10:00]',
        'CLOCK:: [2026-08-04 Tue 09:00]--[2026-08-04 Tue 09:30] => 0:30',
    ]);
    assert.equal(clock.getRunning()[0].clockUid, 'mixed-current');
    assert.equal(graph.store.get('mixed-legacy').string.includes('CLOCK::'), true);
});

test('unparseable drawer children are ignored rather than breaking the read', () => {
    seed([
        TASK,
        { uid: 'drawer001', string: 'LOGBOOK::', parent: 'taskone01' },
        { uid: 'junk0001', string: 'a note someone typed in the drawer', parent: 'drawer001' },
        { uid: 'entry0001', string: 'CLOCK:: [2026-08-04 Tue 09:00]', parent: 'drawer001' },
    ]);

    assert.equal(clock.getRunning().length, 1);
    assert.equal(clock.getRunning()[0].clockUid, 'entry0001');
});

test('subscribers see the running list immediately and on change', async () => {
    seed([TASK]);
    const seen = [];
    const unsubscribe = clock.subscribe(running => seen.push(running.length));

    await clock.clockIn('taskone01', { now: AT_1558 });
    unsubscribe();
    await clock.clockOutAll({ now: AT_1658 });

    assert.deepEqual(seen, [0, 1]);
});

test('Clock Out All keeps the legacy count as structured batch result fields', async () => {
    seed([TASK]);
    await clock.clockIn('taskone01', { now: AT_1558 });

    const result = await clock.clockOutAll({ now: AT_1658 });

    assert.equal(result.ok, true);
    assert.equal(result.count, 1);
    assert.equal(result.completed, 1);
    assert.equal(result.closed, 1, 'internal close count remains available to the clock seam');
    assert.equal(result.failed, 0);
    assert.equal(result.pending, 0);
    assert.equal(result.partial, false);
});

test('batch close confirms all written CLOCKs with one read and one notification', async () => {
    const graph = seed([
        TASK,
        OTHER,
        { uid: 'batch-drawer-a', string: 'LOGBOOK::', parent: TASK.uid },
        { uid: 'batch-clock-a', string: 'CLOCK:: [2026-08-17 Mon 09:00]', parent: 'batch-drawer-a' },
        { uid: 'batch-drawer-b', string: 'LOGBOOK::', parent: OTHER.uid },
        { uid: 'batch-clock-b', string: 'CLOCK:: [2026-08-17 Mon 09:01]', parent: 'batch-drawer-b' },
    ]);
    const originalQuery = graph.api.data.q;
    let entryReads = 0;
    graph.api.data.q = (...args) => {
        if (String(args[0]).includes(':in $ [?drawer-string ...]')) entryReads += 1;
        return originalQuery(...args);
    };
    let notifications = 0;
    const unsubscribe = clock.subscribe(() => {
        notifications += 1;
    });
    notifications = 0;

    try {
        const result = await clock.clockOutEntries(null, { now: AT_1005 });

        assert.equal(result.ok, true);
        assert.equal(result.closed, 2);
        assert.equal(entryReads, 2, 'one preflight read plus one batch confirmation read');
        assert.equal(notifications, 1, 'the batch publishes one final snapshot');
        assert.equal(clock.getRunning().length, 0);
    } finally {
        unsubscribe();
        graph.api.data.q = originalQuery;
    }
});

test('Clock Out All returns a structured uncertain result when the preflight read fails', async () => {
    const graph = seed([TASK]);
    await clock.clockIn('taskone01', { now: AT_1558 });
    const originalQuery = graph.api.data.q;
    graph.api.data.q = () => {
        throw new Error('graph unavailable before batch close');
    };

    try {
        const result = await clock.clockOutAll({ now: AT_1658 });
        assert.equal(result.ok, false);
        assert.equal(result.uncertain, true);
        assert.equal(result.failed, 1);
        assert.equal(result.pending, 1);
        assert.ok(result.error);
        assert.deepEqual(result.retry.retryClockUids, [clock.getRunning()[0].clockUid]);
    } finally {
        graph.api.data.q = originalQuery;
    }
});

test('a selected batch preflight failure reports only its requested running UIDs', async () => {
    const graph = seed([
        TASK,
        OTHER,
        { uid: 'scope-drawer-1', string: 'LOGBOOK::', parent: TASK.uid },
        { uid: 'scope-clock-1', string: 'CLOCK:: [2026-08-17 Mon 09:00]', parent: 'scope-drawer-1' },
        { uid: 'scope-drawer-2', string: 'LOGBOOK::', parent: OTHER.uid },
        { uid: 'scope-clock-2', string: 'CLOCK:: [2026-08-17 Mon 09:01]', parent: 'scope-drawer-2' },
    ]);
    const selectedClockUid = 'scope-clock-1';

    const result = await clock.clockOutEntries([selectedClockUid], {
        prepare: async () => {
            throw new Error('selection preflight failed');
        },
    });

    assert.equal(result.uncertain, true);
    assert.equal(result.failed, 1);
    assert.equal(result.pending, 1);
    assert.deepEqual(result.pendingClockUids, [selectedClockUid]);
    assert.deepEqual(result.retry.retryClockUids, [selectedClockUid]);
    assert.match(graph.store.get(selectedClockUid).string, /^CLOCK:: \[/);
    assert.match(graph.store.get('scope-clock-2').string, /^CLOCK:: \[/);
});

test('discarding an unknown CLOCK is non-destructive and structured', async () => {
    const graph = seed([TASK]);

    const result = await clock.discardClock('missing-clock');

    assert.deepEqual(result, { deleted: false, reason: 'not-found' });
    assert.equal(graph.store.has('missing-clock'), false);
});

test('discard reports uncertain drawer cleanup after the CLOCK delete succeeds', async () => {
    const graph = seed([TASK]);
    const { clockUid } = await clock.clockIn(TASK.uid, { now: AT_1558 });
    const originalQuery = graph.api.data.q;
    const originalPull = graph.api.data.pull;
    graph.api.data.pull = (pattern, ...args) => {
        if (pattern.includes(':block/children') && args[0]?.[1] === TASK.uid) {
            throw new Error('drawer pull lookup failed after discard');
        }
        return originalPull(pattern, ...args);
    };
    graph.api.data.q = (datalog, ...args) => {
        if (String(datalog).includes(':find ?uid ?string ?order') && args[0] === TASK.uid) {
            throw new Error('drawer lookup failed after discard');
        }
        return originalQuery(datalog, ...args);
    };

    try {
        const result = await clock.discardClock(clockUid);

        assert.equal(result.deleted, true);
        assert.equal(result.uncertain, true);
        assert.equal(result.partial, true);
        assert.equal(result.retry.action, 'discard-drawer');
        assert.equal(result.retry.clockUid, clockUid);
        assert.equal(graph.store.has(clockUid), false);
    } finally {
        graph.api.data.q = originalQuery;
        graph.api.data.pull = originalPull;
    }
});

test('isBlockRunning fails closed when reference resolution cannot read the graph', async () => {
    const graph = seed([TASK]);
    await clock.clockIn(TASK.uid, { now: AT_1558 });
    const originalQuery = graph.api.data.q;
    graph.api.data.q = () => {
        throw new Error('graph read failed during menu rendering');
    };

    try {
        assert.equal(clock.isBlockRunning(TASK.uid), true);
    } finally {
        graph.api.data.q = originalQuery;
    }
});
