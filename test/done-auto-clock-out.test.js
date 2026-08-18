import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { installGraph, uninstallGraph } from './helpers/graph-stub.js';
import { attachCompletionHandling } from '../src/completion.js';

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
const contextCommands = new Map();
const paletteCommands = new Map();
const settingsStore = new Map([['allowMultipleClocks', true]]);
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

const seedOpenClock = (taskUid, clockUid, start = '2026-08-16 Sun 09:00') => {
    const drawerUid = `${clockUid}-drawer`;
    graph.store.set(drawerUid, {
        uid: drawerUid,
        string: 'LOGBOOK::',
        parent: taskUid,
        order: 0,
        open: false,
        page: 'Test Page',
    });
    graph.store.set(clockUid, {
        uid: clockUid,
        string: `CLOCK:: [${start}]`,
        parent: drawerUid,
        order: 0,
        open: true,
        page: 'Test Page',
    });
};

const refreshSeededClocks = () => clock.refresh();

install([TASK]);
const extension = (await import('../src/extension.js')).default;
const clock = await import('../src/clock.js');
const roam = await import('../src/roam.js');

test.beforeEach(() => {
    extension.onunload();
    document.body.innerHTML = '<div class="rm-topbar"></div>';
    contextCommands.clear();
    paletteCommands.clear();
    toasts.length = 0;
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

test('completion retains a failed detach handle so lifecycle cleanup can be retried', async () => {
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': TASK.uid });
    extension.onunload();

    const originalRemove = graph.api.data.removePullWatch;
    let failRemove = true;
    graph.api.data.removePullWatch = (...args) => {
        if (failRemove) throw new Error('Pull Watch removal unavailable during unload');
        return originalRemove(...args);
    };
    const detach = attachCompletionHandling();
    clock.refresh();
    assert.equal(graph.pullWatchCount(), 1);

    const first = detach();
    failRemove = false;
    graph.api.data.removePullWatch = originalRemove;

    assert.equal(first.ok, false);
    assert.equal(graph.pullWatchCount(), 1);
    const second = detach();
    assert.equal(second.ok, true);
    assert.equal(graph.pullWatchCount(), 0);
});

test('a failed old watcher detach blocks duplicate installation until cleanup succeeds', async () => {
    const originalRemove = graph.api.data.removePullWatch;
    const originalAdd = graph.api.data.addPullWatch;
    let failRemove = true;
    let addAttempts = 0;
    graph.api.data.removePullWatch = (...args) => {
        if (failRemove) throw new Error('old Pull Watch cannot be removed yet');
        return originalRemove(...args);
    };
    graph.api.data.addPullWatch = (...args) => {
        addAttempts += 1;
        return originalAdd(...args);
    };

    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': TASK.uid });
    addAttempts = 0;
    extension.onunload();
    assert.equal(graph.pullWatchCount(), 1, 'the failed old watch remains installed');

    const detach = attachCompletionHandling();
    try {
        clock.refresh();
        assert.equal(addAttempts, 0, 'a new lifecycle does not duplicate the old watch');
        assert.equal(graph.pullWatchCount(), 1);

        failRemove = false;
        graph.api.data.removePullWatch = originalRemove;
        clock.refresh();
        assert.equal(addAttempts, 1, 'watch installation continues after old cleanup succeeds');
        assert.equal(graph.pullWatchCount(), 1);
    } finally {
        failRemove = false;
        graph.api.data.removePullWatch = originalRemove;
        graph.api.data.addPullWatch = originalAdd;
        detach();
    }
});

test('DONE on a parent clocks out every Focused/legacy child CLOCK in its tree', async () => {
    install([PARENT, CHILD]);
    extension.onunload();
    extension.onload({ extensionAPI });

    seedOpenClock(PARENT.uid, 'done-parent-clock', '2026-08-16 Sun 09:00');
    seedOpenClock(CHILD.uid, 'done-child-clock', '2026-08-16 Sun 09:01');
    refreshSeededClocks();
    assert.deepEqual(clock.getRunning().map(entry => entry.taskUid), [CHILD.uid]);

    await graph.api.data.block.update({
        block: { uid: PARENT.uid, string: '{{[[DONE]]}} parent task' },
    });
    await settle();

    assert.equal(clock.getRunning().length, 0);
});

test('a parent without its own Focused CLOCK is watched and leaves unrelated work running', async () => {
    install([PARENT, CHILD, OTHER]);
    extension.onunload();
    extension.onload({ extensionAPI });

    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': CHILD.uid });
    assert.ok(graph.pullWatchUids().includes(PARENT.uid), 'confirmed ancestors must be watched');
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': OTHER.uid });

    await graph.api.data.block.update({
        block: { uid: PARENT.uid, string: '{{[[DONE]]}} parent task' },
    });
    await settle();

    assert.deepEqual(clock.getRunning().map(entry => entry.taskUid), [OTHER.uid]);
});

test('DONE on a child does not clock out its parent or sibling CLOCKs', async () => {
    install([PARENT, CHILD, SIBLING]);
    extension.onunload();
    extension.onload({ extensionAPI });

    seedOpenClock(PARENT.uid, 'done-tree-parent-clock', '2026-08-16 Sun 09:00');
    seedOpenClock(CHILD.uid, 'done-tree-child-clock', '2026-08-16 Sun 09:01');
    seedOpenClock(SIBLING.uid, 'done-tree-sibling-clock', '2026-08-16 Sun 09:02');
    refreshSeededClocks();

    await graph.api.data.block.update({
        block: { uid: CHILD.uid, string: '{{[[DONE]]}} child task' },
    });
    await settle();

    assert.deepEqual(clock.getRunning().map(entry => entry.taskUid), [SIBLING.uid]);
    assert.match(graph.childrenOf('done-tree-parent-clock-drawer')[0].string, /^CLOCK:: \[/);
    assert.match(graph.childrenOf('done-tree-sibling-clock-drawer')[0].string, /^CLOCK:: \[/);
    assert.match(graph.childrenOf('done-tree-child-clock-drawer')[0].string, /--/);
});

test('completion retries only failed auto-close Sessions and surfaces the partial result', async () => {
    install([PARENT, CHILD, SIBLING]);
    extension.onunload();
    extension.onload({ extensionAPI });
    seedOpenClock(PARENT.uid, 'retry-parent-clock', '2026-08-16 Sun 09:00');
    seedOpenClock(CHILD.uid, 'retry-child-clock', '2026-08-16 Sun 09:01');
    seedOpenClock(SIBLING.uid, 'retry-sibling-clock', '2026-08-16 Sun 09:02');
    refreshSeededClocks();

    const failedUid = clock.getRunning().find(entry => entry.taskUid === SIBLING.uid).clockUid;
    const updateCounts = new Map();
    let failOnce = true;
    const originalUpdate = graph.api.data.block.update;
    graph.api.data.block.update = async payload => {
        const uid = payload.block.uid;
        updateCounts.set(uid, (updateCounts.get(uid) || 0) + 1);
        if (uid === failedUid && failOnce) {
            failOnce = false;
            throw new Error('transient automatic close failure');
        }
        return originalUpdate(payload);
    };

    try {
        await graph.api.data.block.update({
            block: { uid: PARENT.uid, string: '{{[[DONE]]}} parent task' },
        });
        await settle();
    } finally {
        graph.api.data.block.update = originalUpdate;
    }

    assert.equal(clock.getRunning().length, 0);
    assert.equal(updateCounts.get(failedUid), 2, 'only the failed Session is retried');
    const successfulUid = clock.getRunning().find(entry => entry.taskUid === CHILD.uid)?.clockUid;
    assert.equal(successfulUid, undefined);
    assert.equal(updateCounts.size, 4, 'the parent event and three tree CLOCK writes are accounted for');
    assert.equal(
        [...updateCounts.entries()].find(([uid]) => uid !== failedUid && uid !== PARENT.uid)?.[1],
        1,
        'the successful Session is not retried'
    );
    assert.ok(toasts.some(message => /could not be updated/.test(message)));
});

test('completion retains a persistent auto-close failure without spinning or retrying closed Sessions', async () => {
    install([PARENT, CHILD, SIBLING]);
    extension.onunload();
    extension.onload({ extensionAPI });
    seedOpenClock(CHILD.uid, 'malformed-child-clock', '2026-08-16 Sun 09:00');
    seedOpenClock(SIBLING.uid, 'malformed-sibling-clock', '2026-08-16 Sun 09:01');
    refreshSeededClocks();

    const failedUid = clock.getRunning().find(entry => entry.taskUid === SIBLING.uid).clockUid;
    const updateCounts = new Map();
    const originalUpdate = graph.api.data.block.update;
    graph.api.data.block.update = async payload => {
        const uid = payload.block.uid;
        updateCounts.set(uid, (updateCounts.get(uid) || 0) + 1);
        if (uid === failedUid) throw new Error('persistent automatic close failure');
        return originalUpdate(payload);
    };
    try {
        await graph.api.data.block.update({
            block: { uid: PARENT.uid, string: '{{[[DONE]]}} parent task' },
        });
        await settle();
        const afterRetry = updateCounts.get(failedUid);
        await settle();
        assert.equal(updateCounts.get(failedUid), afterRetry, 'a persistent failure does not spin');
    } finally {
        graph.api.data.block.update = originalUpdate;
    }

    assert.equal(updateCounts.get(failedUid), 2, 'only the failed Session receives the bounded retry');
    assert.equal(clock.getRunning().length, 1);
    assert.equal(clock.getRunning()[0].taskUid, SIBLING.uid);
});

test('an explicit refresh retries the remaining DONE Session after bounded automatic retries stop', async () => {
    install([PARENT, CHILD, SIBLING]);
    extension.onunload();
    extension.onload({ extensionAPI });
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': CHILD.uid });
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': SIBLING.uid });

    const failedUid = clock.getRunning().find(entry => entry.taskUid === SIBLING.uid).clockUid;
    const updateCounts = new Map();
    let fail = true;
    const originalUpdate = graph.api.data.block.update;
    graph.api.data.block.update = async payload => {
        const uid = payload.block.uid;
        updateCounts.set(uid, (updateCounts.get(uid) || 0) + 1);
        if (uid === failedUid && fail) throw new Error('persistent automatic close failure');
        return originalUpdate(payload);
    };

    try {
        await graph.api.data.block.update({
            block: { uid: PARENT.uid, string: '{{[[DONE]]}} parent task' },
        });
        await settle();
        assert.equal(updateCounts.get(failedUid), 2, 'the automatic retry remains bounded');
        assert.equal(clock.getRunning().length, 1);

        fail = false;
        clock.refresh();
        await settle();
    } finally {
        graph.api.data.block.update = originalUpdate;
    }

    assert.equal(updateCounts.get(failedUid), 3, 'refresh retries only the remaining clock UID');
    assert.equal(clock.getRunning().length, 0);
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

test('a malformed hierarchy component does not disable healthy completion watches', async () => {
    install([PARENT, CHILD, SIBLING]);
    extension.onunload();
    extension.onload({ extensionAPI });
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': CHILD.uid });
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': SIBLING.uid });

    const originalQuery = graph.api.data.q;
    graph.api.data.q = (datalog, ...args) => {
        const rows = originalQuery(datalog, ...args);
        if (String(datalog).includes('?parent-uid')) {
            return [...rows, [CHILD.uid, 'ambiguous-parent', '{{[[TODO]]}} ambiguous parent']];
        }
        return rows;
    };
    try {
        await graph.api.data.block.update({
            block: { uid: SIBLING.uid, string: '{{[[DONE]]}} sibling task' },
        });
        await settle();
    } finally {
        graph.api.data.q = originalQuery;
    }

    assert.equal(clock.getRunning().length, 0);
    assert.equal(
        graph.pullWatchUids().includes(CHILD.uid),
        false,
        'the previously focused child is historical Recent work, not a running CLOCK watch'
    );
});

test('an unrelated cyclic hierarchy component does not block a healthy DONE root', async () => {
    const cycleA = { uid: 'done-cycle-a', string: '{{[[TODO]]}} cycle A', parent: 'done-cycle-b' };
    const cycleB = { uid: 'done-cycle-b', string: '{{[[TODO]]}} cycle B', parent: cycleA.uid };
    install([
        TASK,
        cycleA,
        cycleB,
        { uid: 'done-root-drawer', string: 'LOGBOOK::', parent: TASK.uid },
        { uid: 'done-root-clock', string: 'CLOCK:: [2026-08-16 Sun 09:00]', parent: 'done-root-drawer' },
        { uid: 'done-cycle-drawer', string: 'LOGBOOK::', parent: cycleA.uid },
        { uid: 'done-cycle-clock', string: 'CLOCK:: [2026-08-16 Sun 09:01]', parent: 'done-cycle-drawer' },
    ]);
    extension.onunload();
    extension.onload({ extensionAPI });
    await settle();

    await graph.api.data.block.update({
        block: { uid: TASK.uid, string: '{{[[DONE]]}} finish this task' },
    });
    await settle();

    assert.deepEqual(clock.getRunning().map(entry => entry.taskUid), [cycleA.uid]);
    assert.match(graph.childrenOf('done-root-drawer')[0].string, /--/);
    assert.match(graph.childrenOf('done-cycle-drawer')[0].string, /^CLOCK:: \[/);
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
    await settle();
    assert.equal(clock.getRunning().length, 1);

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

test('Pull Watch removal without an API remains retryable', () => {
    const originalRemove = graph.api.data.removePullWatch;
    graph.api.data.removePullWatch = undefined;
    const watch = roam.watchBlockString(TASK.uid, () => {});
    assert.equal(watch.ok, true);

    const first = watch.detach();
    graph.api.data.removePullWatch = originalRemove;

    assert.equal(first.ok, false);
    assert.equal(graph.pullWatchCount(), 1);
    assert.deepEqual(watch.detach(), { ok: true, detached: true });
    assert.equal(graph.pullWatchCount(), 0);
});

test('completion retries a failed Pull Watch installation on the next graph sync', async () => {
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': TASK.uid });
    extension.onunload();

    const originalAdd = graph.api.data.addPullWatch;
    let failInstall = true;
    graph.api.data.addPullWatch = (...args) => {
        if (failInstall) throw new Error('Pull Watch installation temporarily unavailable');
        return originalAdd(...args);
    };
    const detach = attachCompletionHandling();
    try {
        clock.refresh();
        assert.equal(graph.pullWatchCount(), 0);
        failInstall = false;
        clock.refresh();
        assert.equal(graph.pullWatchCount(), 1);
    } finally {
        graph.api.data.addPullWatch = originalAdd;
        detach();
    }
});

test('completion performs a second confirmed read after watch installation', async () => {
    install([
        TASK,
        { uid: 'gap-drawer', string: 'LOGBOOK::', parent: TASK.uid },
        { uid: 'gap-clock', string: 'CLOCK:: [2026-08-16 Sun 09:00]', parent: 'gap-drawer' },
    ]);
    extension.onunload();

    const originalAdd = graph.api.data.addPullWatch;
    let installed = false;
    graph.api.data.addPullWatch = (...args) => {
        const result = originalAdd(...args);
        if (!installed) {
            installed = true;
            // Change the graph after the first snapshot and before the watch can
            // observe it. The post-install read is the only signal in this probe.
            graph.store.get(TASK.uid).string = '{{[[DONE]]}} finish this task';
        }
        return result;
    };

    try {
        extension.onload({ extensionAPI });
        await settle();
    } finally {
        graph.api.data.addPullWatch = originalAdd;
    }

    assert.equal(installed, true);
    assert.equal(clock.getRunning().length, 0, 'the DONE transition in the install gap is reconciled');
    assert.match(graph.childrenOf('gap-drawer')[0].string, /--/);
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

test('completion keeps a DONE event that arrives while the same auto-close is in flight', async () => {
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': TASK.uid });
    extension.onunload();

    const results = [];
    const detach = attachCompletionHandling({ onResult: result => results.push(result) });
    const originalUpdate = graph.api.data.block.update;
    const clockUid = graph
        .childrenOf(graph.childrenOf(TASK.uid)[0].uid)
        .find(block => block.string.startsWith('CLOCK:')).uid;
    let injected = false;
    graph.api.data.block.update = async payload => {
        const result = await originalUpdate(payload);
        if (!injected && payload.block.uid === clockUid && payload.block.string.includes('--')) {
            injected = true;
            await originalUpdate({
                block: { uid: TASK.uid, string: '{{[[DONE]]}} finish this task' },
            });
        }
        return result;
    };

    try {
        clock.refresh();
        await graph.api.data.block.update({
            block: { uid: TASK.uid, string: '{{[[DONE]]}} finish this task' },
        });
        await settle();
    } finally {
        graph.api.data.block.update = originalUpdate;
        detach();
    }

    assert.equal(injected, true);
    assert.equal(results.length, 2, 'the in-flight event is drained after the first action');
    assert.equal(results[1].ok, true);
    assert.equal(results[1].closed, 0);
    assert.equal(clock.getRunning().length, 0);
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

test('ordinary Clock Out closes the selected Focused CLOCK', async () => {
    install([PARENT, CHILD]);
    extension.onunload();
    extension.onload({ extensionAPI });
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': CHILD.uid });
    const childClock = clock.getRunning().find(entry => entry.taskUid === CHILD.uid);

    assert.equal(await clock.clockOut(childClock.clockUid), true);
    assert.deepEqual(clock.getRunning(), []);
});
