import test from 'node:test';
import assert from 'node:assert/strict';

import { installGraph, uninstallGraph } from './helpers/graph-stub.js';
import { mutationResultNotice } from '../src/action-result.js';

const TASK = { uid: 'mutatet1', string: '{{[[TODO]]}} mutation task', parent: null };
const OTHER = { uid: 'mutatet2', string: '{{[[TODO]]}} other task', parent: null };

let graph;
let allowMultiple = false;

const settingsApi = {
    settings: {
        get: key => (key === 'allowMultipleClocks' ? allowMultiple : undefined),
        set: () => {},
    },
};

const drawerFor = taskUid =>
    [...graph.store.values()].find(block => block.parent === taskUid && block.string === 'LOGBOOK::');

const clockBlocksFor = taskUid => {
    const drawer = drawerFor(taskUid);
    return drawer ? graph.childrenOf(drawer.uid).filter(block => /^CLOCK:{1,2} \[/.test(block.string)) : [];
};

test.beforeEach(async () => {
    graph = installGraph([TASK, OTHER]);
    allowMultiple = false;
    const { setExtensionAPI } = await import('../src/settings.js');
    const clock = await import('../src/clock.js');
    setExtensionAPI(settingsApi);
    clock.reset();
});

test.after(() => uninstallGraph());

test('concurrent Clock in on one Task converges on one Focused CLOCK', async () => {
    allowMultiple = true;
    const clock = await import('../src/clock.js');

    const results = await Promise.allSettled([
        clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') }),
        clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:01') }),
    ]);

    assert.equal(results.filter(result => result.status === 'fulfilled').length, 2);
    assert.equal(results.filter(result => result.status === 'rejected').length, 0);
    assert.equal(results[1].value.alreadyFocused, true);
    assert.equal(clockBlocksFor(TASK.uid).length, 1);
    assert.equal(clock.getRunning().length, 1);
});

test('concurrent Clock in on different Tasks leaves one running Session in single-clock mode', async () => {
    const clock = await import('../src/clock.js');

    const results = await Promise.all([
        clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') }),
        clock.clockIn(OTHER.uid, { now: new Date('2026-08-15T09:00:01') }),
    ]);

    assert.equal(results.length, 2);
    assert.equal(clock.getRunning().length, 1);
    assert.equal(clock.getRunning()[0].taskUid, OTHER.uid);
    assert.equal(clockBlocksFor(TASK.uid).length, 1);
    assert.match(clockBlocksFor(TASK.uid)[0].string, /--/);
    assert.equal(clockBlocksFor(OTHER.uid).length, 1);
    assert.match(clockBlocksFor(OTHER.uid)[0].string, /^CLOCK:{1,2} \[/);
});

test('concurrent Clock in on different Tasks is an atomic focus switch', async () => {
    allowMultiple = true;
    const clock = await import('../src/clock.js');

    await Promise.all([
        clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') }),
        clock.clockIn(OTHER.uid, { now: new Date('2026-08-15T09:00:01') }),
    ]);

    assert.deepEqual(clock.getRunning().map(entry => entry.taskUid), [OTHER.uid]);
    assert.equal(clockBlocksFor(TASK.uid).length, 1);
    assert.match(clockBlocksFor(TASK.uid)[0].string, /--/);
    assert.equal(clockBlocksFor(OTHER.uid).length, 1);
});

test('Clock in re-reads graph state and treats an external same-task CLOCK as already Focused', async () => {
    allowMultiple = true;
    const clock = await import('../src/clock.js');
    graph.store.set('externaldr', {
        uid: 'externaldr',
        string: 'LOGBOOK::',
        parent: TASK.uid,
        order: 0,
        page: 'Test Page',
    });
    graph.store.set('externalc1', {
        uid: 'externalc1',
        string: 'CLOCK:: [2026-08-15 Sat 08:00]',
        parent: 'externaldr',
        order: 0,
        page: 'Test Page',
    });

    const result = await clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') });
    assert.equal(result.alreadyFocused, true);
    assert.equal(clockBlocksFor(TASK.uid).length, 1);
    assert.equal(clock.getRunning().length, 1);
    assert.equal(clock.getRunning()[0].clockUid, 'externalc1');
});

test('a failed Clock in can be retried without duplicating a successful drawer', async () => {
    const clock = await import('../src/clock.js');
    const originalCreate = graph.api.data.block.create;
    let attempts = 0;
    graph.api.data.block.create = async args => {
        attempts += 1;
        if (attempts === 2) throw new Error('clock write failed');
        return originalCreate(args);
    };

    await assert.rejects(
        () => clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') }),
        /clock write failed/
    );
    assert.equal(clockBlocksFor(TASK.uid).length, 0);
    assert.equal(drawerFor(TASK.uid) !== undefined, true);

    graph.api.data.block.create = originalCreate;
    await clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:01:00') });

    assert.equal(clockBlocksFor(TASK.uid).length, 1);
    assert.equal(clock.getRunning().length, 1);
});

test('a focus switch returns the closed CLOCK scope when the new CLOCK write throws', async () => {
    const clock = await import('../src/clock.js');
    await clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') });
    const closedClockUid = clock.getRunning()[0].clockUid;
    const originalCreate = graph.api.data.block.create;
    graph.api.data.block.create = async payload => {
        if (String(payload.block.string).startsWith('CLOCK:')) throw new Error('new clock write failed');
        return originalCreate(payload);
    };

    try {
        const result = await clock.clockIn(OTHER.uid, { now: new Date('2026-08-15T09:01:00') });

        assert.equal(result.uncertain, true);
        assert.equal(result.partial, true);
        assert.equal(result.retry.action, 'clock-in');
        assert.equal(result.retry.taskUid, OTHER.uid);
        assert.deepEqual(result.retry.closedClockUids, [closedClockUid]);
        assert.match(clockBlocksFor(TASK.uid)[0].string, /--/);
        assert.equal(clockBlocksFor(OTHER.uid).length, 0);
    } finally {
        graph.api.data.block.create = originalCreate;
    }
});

test('Clock Out does not count a no-op write as closed', async () => {
    const clock = await import('../src/clock.js');
    await clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') });
    const clockUid = clock.getRunning()[0].clockUid;
    const originalUpdate = graph.api.data.block.update;
    graph.api.data.block.update = async payload => {
        if (payload.block.uid === clockUid) return;
        return originalUpdate(payload);
    };

    try {
        const result = await clock.clockOut(clockUid, { now: new Date('2026-08-15T09:01:00') });

        assert.equal(result.closed, false);
        assert.equal(result.uncertain, true);
        assert.deepEqual(result.retry.retryClockUids, [clockUid]);
        assert.equal(clock.getRunning()[0].clockUid, clockUid);
    } finally {
        graph.api.data.block.update = originalUpdate;
    }
});

test('Clock In does not report a new CLOCK until refresh confirms it is running', async () => {
    const clock = await import('../src/clock.js');
    const originalCreate = graph.api.data.block.create;
    graph.api.data.block.create = async payload => {
        if (String(payload.block.string).startsWith('CLOCK:')) return;
        return originalCreate(payload);
    };

    try {
        const result = await clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') });

        assert.equal(result.uncertain, true);
        assert.equal(result.partial, true);
        assert.equal(clock.getRunning().length, 0);
        assert.equal(clockBlocksFor(TASK.uid).length, 0);
    } finally {
        graph.api.data.block.create = originalCreate;
    }
});

test('unload does not reset the mutation tail behind an in-flight Clock In', async () => {
    allowMultiple = true;
    const clock = await import('../src/clock.js');
    const originalCreate = graph.api.data.block.create;
    let release;
    const gate = new Promise(resolve => {
        release = resolve;
    });
    let started;
    const startedPromise = new Promise(resolve => {
        started = resolve;
    });
    let blocked = true;
    graph.api.data.block.create = async args => {
        if (blocked && args.block.string === 'LOGBOOK::') {
            blocked = false;
            started();
            await gate;
        }
        return originalCreate(args);
    };

    const oldInstance = clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') });
    await startedPromise;
    clock.reset();
    const newInstance = clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:01') });
    release();

    const results = await Promise.allSettled([oldInstance, newInstance]);
    graph.api.data.block.create = originalCreate;

    assert.equal(results.filter(result => result.status === 'fulfilled').length, 2);
    assert.equal(clockBlocksFor(TASK.uid).length, 1);
    assert.equal(
        [...graph.store.values()].filter(block => block.parent === TASK.uid && block.string === 'LOGBOOK::').length,
        1,
        'the new lifecycle must wait for the old graph mutation instead of creating a second drawer'
    );
});

test('queued mutation invalidation returns a retryable user-visible result', async () => {
    allowMultiple = true;
    const clock = await import('../src/clock.js');
    const originalCreate = graph.api.data.block.create;
    let release;
    const gate = new Promise(resolve => {
        release = resolve;
    });
    let started;
    const startedPromise = new Promise(resolve => {
        started = resolve;
    });
    let blocked = true;
    graph.api.data.block.create = async args => {
        if (blocked && args.block.string === 'LOGBOOK::') {
            blocked = false;
            started();
            await gate;
        }
        return originalCreate(args);
    };

    try {
        const inFlight = clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') });
        await startedPromise;
        const queued = clock.clockIn(OTHER.uid, { now: new Date('2026-08-15T09:00:01') });
        clock.reset();
        release();

        const [first, invalidated] = await Promise.all([inFlight, queued]);
        assert.equal(first.taskUid, TASK.uid);
        assert.equal(invalidated.ok, false);
        assert.equal(invalidated.invalidated, true);
        assert.equal(invalidated.uncertain, true);
        assert.equal(invalidated.retryable, true);
        assert.deepEqual(invalidated.retry, {
            action: 'retry-mutation',
            reason: 'extension-reload',
        });
        assert.match(mutationResultNotice(invalidated), /extension reload.*Retry/i);
        assert.equal(drawerFor(OTHER.uid), undefined, 'invalidated work must not be silently written');
    } finally {
        graph.api.data.block.create = originalCreate;
    }
});

test('Clock in stops after a successful close whose refresh cannot confirm graph state', async () => {
    const clock = await import('../src/clock.js');
    await clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') });

    const originalQuery = graph.api.data.q;
    const originalUpdate = graph.api.data.block.update;
    let closeFinished = false;
    let failNextRead = 0;
    graph.api.data.block.update = async args => {
        const result = await originalUpdate(args);
        closeFinished = true;
        failNextRead = 2;
        return result;
    };
    graph.api.data.q = (...args) => {
        if (closeFinished && failNextRead > 0) {
            failNextRead -= 1;
            throw new Error('refresh failed after close');
        }
        return originalQuery(...args);
    };

    try {
        const result = await clock.clockIn(OTHER.uid, {
            now: new Date('2026-08-15T09:01:00'),
        });

        assert.equal(result.uncertain, true);
        assert.equal(result.partial, true);
        assert.equal(drawerFor(OTHER.uid), undefined, 'uncertain state must not create a drawer');
        assert.equal(clockBlocksFor(OTHER.uid).length, 0, 'uncertain state must not create a CLOCK');
    } finally {
        graph.api.data.q = originalQuery;
        graph.api.data.block.update = originalUpdate;
    }
});
