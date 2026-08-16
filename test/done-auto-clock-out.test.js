import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { installGraph, uninstallGraph } from './helpers/graph-stub.js';

const dom = new JSDOM('<!doctype html><html><body><div class="rm-topbar"></div></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.HTMLElement = dom.window.HTMLElement;

const TASK = { uid: 'done-task1', string: '{{[[TODO]]}} finish this task', parent: null };
const PARENT = { uid: 'done-parent', string: '{{[[TODO]]}} parent task', parent: null };
const CHILD = { uid: 'done-child', string: '{{[[TODO]]}} child task', parent: 'done-parent' };
const SIBLING = { uid: 'done-sibling', string: '{{[[TODO]]}} sibling task', parent: 'done-parent' };
const OTHER = { uid: 'done-other', string: '{{[[TODO]]}} unrelated task', parent: null };
const PAUSED_CHILD = { uid: 'done-paused', string: '{{[[TODO]]}} paused child', parent: 'done-parent' };
const RUNNING_CHILD = { uid: 'done-running', string: '{{[[TODO]]}} running child', parent: 'done-parent' };
const contextCommands = new Map();
const paletteCommands = new Map();
const settingsStore = new Map([['allowMultipleClocks', true]]);

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

let graph;
const settle = async () => {
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
};

const install = blocks => {
    graph = installGraph(blocks);
    window.roamAlphaAPI.ui.blockContextMenu = {
        addCommand: spec => contextCommands.set(spec.label, spec),
        removeCommand: ({ label }) => contextCommands.delete(label),
    };
};

install([TASK]);
const extension = (await import('../src/extension.js')).default;
const clock = await import('../src/clock.js');
const paused = await import('../src/paused.js');
const roam = await import('../src/roam.js');

test.beforeEach(() => {
    extension.onunload();
    document.body.innerHTML = '<div class="rm-topbar"></div>';
    contextCommands.clear();
    paletteCommands.clear();
    settingsStore.clear();
    settingsStore.set('allowMultipleClocks', true);
    install([TASK]);
    extension.onload({ extensionAPI });
});

test.afterEach(() => extension.onunload());
test.after(() => uninstallGraph());

test('DONE automatically clocks out a running Session through the lifecycle watch', async () => {
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': TASK.uid });

    assert.equal(clock.getRunning().length, 1);
    assert.ok(graph.pullWatchCount() > 0, 'running task should have a pull watch');

    await graph.api.data.block.update({
        block: { uid: TASK.uid, string: '{{[[DONE]]}} finish this task' },
    });
    await settle();

    assert.equal(clock.getRunning().length, 0);
    const drawer = graph.childrenOf(TASK.uid).find(block => block.string === 'LOGBOOK::');
    assert.match(graph.childrenOf(drawer.uid)[0].string, /--/);
    assert.equal(graph.pullWatchCount(), 0, 'completed task watch should be removed');
});

test('unloading the extension removes completion pull watches', async () => {
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': TASK.uid });
    assert.ok(graph.pullWatchCount() > 0);

    extension.onunload();

    assert.equal(graph.pullWatchCount(), 0);
});

test('DONE on a parent clocks out the parent and its running child Sessions', async () => {
    install([PARENT, CHILD]);
    extension.onunload();
    extension.onload({ extensionAPI });

    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': PARENT.uid });
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': CHILD.uid });
    assert.deepEqual(clock.getRunning().map(entry => entry.taskUid).sort(), [PARENT.uid, CHILD.uid].sort());

    await graph.api.data.block.update({
        block: { uid: PARENT.uid, string: '{{[[DONE]]}} parent task' },
    });
    await settle();

    assert.equal(clock.getRunning().length, 0);
});

test('a parent without its own Session is watched and leaves unrelated parallel work running', async () => {
    install([PARENT, CHILD, OTHER]);
    extension.onunload();
    extension.onload({ extensionAPI });

    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': CHILD.uid });
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': OTHER.uid });
    assert.ok(graph.pullWatchUids().includes(PARENT.uid), 'confirmed ancestors must be watched');

    await graph.api.data.block.update({
        block: { uid: PARENT.uid, string: '{{[[DONE]]}} parent task' },
    });
    await settle();

    assert.deepEqual(clock.getRunning().map(entry => entry.taskUid), [OTHER.uid]);
});

test('DONE on a child does not clock out its parent or sibling Sessions', async () => {
    install([PARENT, CHILD, SIBLING]);
    extension.onunload();
    extension.onload({ extensionAPI });

    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': PARENT.uid });
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': CHILD.uid });
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': SIBLING.uid });

    await graph.api.data.block.update({
        block: { uid: CHILD.uid, string: '{{[[DONE]]}} child task' },
    });
    await settle();

    assert.deepEqual(
        clock.getRunning().map(entry => entry.taskUid).sort(),
        [PARENT.uid, SIBLING.uid].sort()
    );
});

test('parent DONE prunes paused descendants before Resume can reopen them', async () => {
    install([PARENT, PAUSED_CHILD, RUNNING_CHILD]);
    extension.onunload();
    extension.onload({ extensionAPI });

    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': PAUSED_CHILD.uid });
    await paused.pauseAll({ now: new Date('2026-08-16T09:01:00') });
    assert.deepEqual(paused.getPaused().map(item => item.taskUid), [PAUSED_CHILD.uid]);

    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': RUNNING_CHILD.uid });
    await graph.api.data.block.update({
        block: { uid: PARENT.uid, string: '{{[[DONE]]}} parent task' },
    });
    await settle();

    assert.equal(clock.getRunning().length, 0);
    assert.deepEqual(paused.getPaused(), []);
    assert.deepEqual(paused.getPendingResume(), []);
});

test('reload reconciliation closes an open child whose parent is already DONE', async () => {
    install([
        { ...PARENT, string: '{{[[DONE]]}} parent task' },
        CHILD,
        { uid: 'reload-drawer', string: 'LOGBOOK::', parent: CHILD.uid },
        { uid: 'reload-clock', string: 'CLOCK:: [2026-08-16 Sun 09:00]', parent: 'reload-drawer' },
    ]);
    extension.onunload();
    extension.onload({ extensionAPI });
    await settle();

    assert.equal(clock.getRunning().length, 0);
    assert.match(graph.childrenOf('reload-drawer')[0].string, /--/);
});

test('rapid DONE then TODO is re-read before automatic Clock Out writes', async () => {
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': TASK.uid });

    await graph.api.data.block.update({
        block: { uid: TASK.uid, string: '{{[[DONE]]}} finish this task' },
    });
    await graph.api.data.block.update({
        block: { uid: TASK.uid, string: '{{[[TODO]]}} finish this task' },
    });
    await settle();

    assert.equal(clock.getRunning().length, 1);
});

test('Clock In rejects a Task below a confirmed DONE ancestor', async () => {
    install([
        { ...PARENT, string: '{{[[DONE]]}} parent task' },
        CHILD,
    ]);
    extension.onunload();
    extension.onload({ extensionAPI });

    await assert.rejects(
        () => clock.clockIn(CHILD.uid),
        error => {
            assert.equal(error.code, 'done-ancestor');
            assert.equal(error.doneAncestorUid, PARENT.uid);
            return true;
        }
    );
    assert.equal(clock.getRunning().length, 0);
    assert.equal(graph.childrenOf(CHILD.uid).length, 0);
});

test('automatic Clock Out closes duplicate open clocks for the same Task', async () => {
    install([
        TASK,
        { uid: 'duplicate-drawer', string: 'LOGBOOK::', parent: TASK.uid },
        { uid: 'duplicate-clock-a', string: 'CLOCK:: [2026-08-16 Sun 09:00]', parent: 'duplicate-drawer' },
        { uid: 'duplicate-clock-b', string: 'CLOCK:: [2026-08-16 Sun 09:01]', parent: 'duplicate-drawer' },
    ]);
    extension.onunload();
    extension.onload({ extensionAPI });
    assert.equal(clock.getRunning().length, 2);

    await graph.api.data.block.update({
        block: { uid: TASK.uid, string: '{{[[DONE]]}} finish this task' },
    });
    await settle();

    assert.equal(clock.getRunning().length, 0);
    assert.equal(graph.childrenOf('duplicate-drawer').every(block => block.string.includes('--')), true);
});

test('automatic completion returns a structured uncertain result and writes nothing on hierarchy failure', async () => {
    install([PARENT, CHILD]);
    extension.onunload();
    extension.onload({ extensionAPI });
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': CHILD.uid });
    const clockUid = clock.getRunning()[0].clockUid;
    let clockUpdates = 0;
    const originalUpdate = graph.api.data.block.update;
    graph.api.data.block.update = async payload => {
        if (payload.block.uid === clockUid) clockUpdates += 1;
        return originalUpdate(payload);
    };
    const originalQuery = graph.api.data.q;
    graph.api.data.q = (datalog, ...args) => {
        if (String(datalog).includes('?parent-uid')) throw new Error('parent query unavailable');
        return originalQuery(datalog, ...args);
    };

    await graph.api.data.block.update({
        block: { uid: PARENT.uid, string: '{{[[DONE]]}} parent task' },
    });
    await settle();
    const result = await clock.clockOutCompletedTask(PARENT.uid);

    assert.equal(result.uncertain, true);
    assert.equal(result.ok, false);
    assert.equal(clockUpdates, 0);
    assert.equal(clock.getRunning().length, 1);
    graph.api.data.q = originalQuery;
});

test('Roam Pull Watch adapter exposes a removable, idempotent public seam', async () => {
    const changes = [];
    const watch = roam.watchBlockString(TASK.uid, event => changes.push(event.after[':block/string']));
    assert.equal(watch.ok, true);
    await graph.api.data.block.update({
        block: { uid: TASK.uid, string: '{{[[TODO]]}} changed task' },
    });
    assert.deepEqual(changes, ['{{[[TODO]]}} changed task']);
    assert.deepEqual(watch.detach(), { ok: true, detached: true });
    assert.deepEqual(watch.detach(), { ok: true, detached: false });
    assert.equal(graph.pullWatchCount(), 0);
});

test('missing Pull Watch installation degrades without graph writes', () => {
    let graphWrites = 0;
    const blockApi = graph.api.data.block;
    const originalCreate = blockApi.create;
    const originalUpdate = blockApi.update;
    const originalDelete = blockApi.delete;
    blockApi.create = async payload => {
        graphWrites += 1;
        return originalCreate(payload);
    };
    blockApi.update = async payload => {
        graphWrites += 1;
        return originalUpdate(payload);
    };
    blockApi.delete = async payload => {
        graphWrites += 1;
        return originalDelete(payload);
    };
    graph.api.data.addPullWatch = undefined;

    const result = roam.watchBlockString(TASK.uid, () => {});

    assert.equal(result.ok, false);
    assert.match(result.error.message, /addPullWatch unavailable/);
    assert.equal(graphWrites, 0);
    assert.equal(graph.pullWatchCount(), 0);
});

test('Pull Watch installation errors return ok:false', () => {
    graph.api.data.addPullWatch = () => {
        throw new Error('Pull Watch install failed');
    };

    const result = roam.watchBlockString(TASK.uid, () => {});

    assert.equal(result.ok, false);
    assert.equal(result.error.message, 'Pull Watch install failed');
    assert.equal(graph.pullWatchCount(), 0);
});

test('Pull Watch removal retries after an error and succeeds on the second attempt', () => {
    const originalRemove = graph.api.data.removePullWatch;
    let attempts = 0;
    graph.api.data.removePullWatch = (...args) => {
        attempts += 1;
        if (attempts === 1) throw new Error('Pull Watch removal failed');
        return originalRemove(...args);
    };

    const watch = roam.watchBlockString(TASK.uid, () => {});
    assert.equal(watch.ok, true);

    const first = watch.detach();
    assert.equal(first.ok, false);
    assert.equal(first.detached, false);
    assert.equal(first.error.message, 'Pull Watch removal failed');
    assert.equal(graph.pullWatchCount(), 1);

    assert.deepEqual(watch.detach(), { ok: true, detached: true });
    assert.equal(attempts, 2);
    assert.equal(graph.pullWatchCount(), 0);
});

test('completion remains idle until a public Pull Watch update arrives', async () => {
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': TASK.uid });
    const watchCount = graph.pullWatchCount();
    let graphWrites = 0;
    const originalUpdate = graph.api.data.block.update;
    graph.api.data.block.update = async payload => {
        graphWrites += 1;
        return originalUpdate(payload);
    };

    await Promise.resolve();
    await Promise.resolve();
    assert.equal(graphWrites, 0);
    assert.equal(graph.pullWatchCount(), watchCount);
    assert.equal(clock.getRunning().length, 1);

    await graph.api.data.block.update({
        block: { uid: TASK.uid, string: '{{[[DONE]]}} finish this task' },
    });
    await settle();
    assert.equal(clock.getRunning().length, 0);
    assert.equal(graphWrites, 2);
});

test('DONE parent prunes a pending Resume association on reload', async () => {
    install([PARENT, CHILD]);
    settingsStore.set(
        'pausedBatch',
        JSON.stringify({
            version: 2,
            data: {
                items: [],
                pendingResume: [
                    {
                        taskUid: CHILD.uid,
                        title: 'child task',
                        pausedAtMs: 1,
                        clockUid: null,
                        sourceVersion: 2,
                    },
                ],
            },
        })
    );
    extension.onunload();
    extension.onload({ extensionAPI });
    assert.ok(graph.pullWatchUids().includes(PARENT.uid));

    await graph.api.data.block.update({
        block: { uid: PARENT.uid, string: '{{[[DONE]]}} parent task' },
    });
    await settle();

    assert.deepEqual(paused.getPendingResume(), []);
    assert.deepEqual(JSON.parse(settingsStore.get('pausedBatch')).data.pendingResume, []);
});

test('Resume One prunes a paused Task when its ancestor is already DONE', async () => {
    install([
        { ...PARENT, string: '{{[[DONE]]}} parent task' },
        CHILD,
    ]);
    settingsStore.set(
        'pausedBatch',
        JSON.stringify({
            version: 2,
            data: {
                items: [{ taskUid: CHILD.uid, title: 'child task', pausedAtMs: 1 }],
                pendingResume: [],
            },
        })
    );
    extension.onunload();
    extension.onload({ extensionAPI });

    const result = await paused.resumeOne(CHILD.uid);

    assert.equal(result.ok, true);
    assert.equal(result.reconciled, true);
    assert.deepEqual(paused.getPaused(), []);
    assert.deepEqual(paused.getPendingResume(), []);
    assert.equal(graph.childrenOf(CHILD.uid).length, 0);
});

test('an ambiguous parent hierarchy withholds the cascade and performs zero clock writes', async () => {
    install([PARENT, CHILD, OTHER]);
    extension.onunload();
    extension.onload({ extensionAPI });
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': CHILD.uid });
    const clockUid = clock.getRunning()[0].clockUid;
    let clockUpdates = 0;
    const originalUpdate = graph.api.data.block.update;
    graph.api.data.block.update = async payload => {
        if (payload.block.uid === clockUid) clockUpdates += 1;
        return originalUpdate(payload);
    };
    const originalQuery = graph.api.data.q;
    graph.api.data.q = (datalog, ...args) => {
        const rows = originalQuery(datalog, ...args);
        if (String(datalog).includes('?parent-uid') && rows.some(row => row[0] === CHILD.uid)) {
            return [...rows, [CHILD.uid, OTHER.uid, OTHER.string]];
        }
        return rows;
    };

    const result = await clock.clockOutCompletedTask(PARENT.uid);

    assert.equal(result.uncertain, true);
    assert.equal(clockUpdates, 0);
    assert.equal(clock.getRunning().length, 1);
    graph.api.data.q = originalQuery;
});

test('Clock In rejects a cyclic hierarchy instead of guessing its ancestor scope', async () => {
    const cyclicParent = {
        uid: 'cycle-parent',
        string: '{{[[TODO]]}} cyclic parent',
        parent: 'cycle-child',
    };
    const cyclicChild = {
        uid: 'cycle-child',
        string: '{{[[TODO]]}} cyclic child',
        parent: cyclicParent.uid,
    };
    install([cyclicParent, cyclicChild]);
    extension.onunload();
    extension.onload({ extensionAPI });

    await assert.rejects(
        () => clock.clockIn(cyclicChild.uid),
        /Graph state could not be confirmed; no further changes were made/
    );
    assert.equal(clock.getRunning().length, 0);
    assert.equal(
        graph.childrenOf(cyclicChild.uid).some(block => block.string === 'LOGBOOK::'),
        false
    );
});

test('ordinary Clock Out closes only the selected Session, not its descendants', async () => {
    install([PARENT, CHILD]);
    extension.onunload();
    extension.onload({ extensionAPI });
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': PARENT.uid });
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': CHILD.uid });
    const parentClock = clock.getRunning().find(entry => entry.taskUid === PARENT.uid);

    assert.equal(await clock.clockOut(parentClock.clockUid), true);
    assert.deepEqual(clock.getRunning().map(entry => entry.taskUid), [CHILD.uid]);
});
