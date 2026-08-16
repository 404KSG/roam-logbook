import test from 'node:test';
import assert from 'node:assert/strict';

import { installGraph, uninstallGraph } from './helpers/graph-stub.js';

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
    return drawer ? graph.childrenOf(drawer.uid).filter(block => block.string.startsWith('CLOCK::')) : [];
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

test('concurrent Clock in on one Task creates one drawer and one Running Session', async () => {
    allowMultiple = true;
    const clock = await import('../src/clock.js');

    const results = await Promise.allSettled([
        clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') }),
        clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:01') }),
    ]);

    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);
    assert.match(
        results.find(result => result.status === 'rejected').reason.message,
        /already has a running clock/
    );
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
    assert.match(clockBlocksFor(OTHER.uid)[0].string, /^CLOCK:: \[/);
});

test('concurrent Clock in on different Tasks is allowed in parallel mode', async () => {
    allowMultiple = true;
    const clock = await import('../src/clock.js');

    await Promise.all([
        clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') }),
        clock.clockIn(OTHER.uid, { now: new Date('2026-08-15T09:00:01') }),
    ]);

    assert.deepEqual(
        clock.getRunning().map(entry => entry.taskUid).sort(),
        [TASK.uid, OTHER.uid].sort()
    );
    assert.equal(clockBlocksFor(TASK.uid).length, 1);
    assert.equal(clockBlocksFor(OTHER.uid).length, 1);
});

test('Clock in re-reads graph state and refuses an external change observed before mutation', async () => {
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

    await assert.rejects(
        () => clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') }),
        /already has a running clock/
    );
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

    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(clockBlocksFor(TASK.uid).length, 1);
    assert.equal(
        [...graph.store.values()].filter(block => block.parent === TASK.uid && block.string === 'LOGBOOK::').length,
        1,
        'the new lifecycle must wait for the old graph mutation instead of creating a second drawer'
    );
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
