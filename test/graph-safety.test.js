import test from 'node:test';
import assert from 'node:assert/strict';

import { installGraph, uninstallGraph } from './helpers/graph-stub.js';

const TASK = { uid: 'safetask1', string: '{{[[TODO]]}} safety task', parent: null };
const QUERY = '[:find ?value :where [?b :block/string ?value]]';

let graph;
const settings = new Map();

const useSettings = () => {
    settings.clear();
    return {
        settings: {
            get: key => settings.get(key),
            set: (key, value) => settings.set(key, value),
        },
    };
};

const writes = () => ({
    creates: 0,
    updates: 0,
    deletes: 0,
});

test.beforeEach(() => {
    graph = installGraph([TASK]);
});

test.after(() => uninstallGraph());

test('the graph adapter distinguishes a successful empty query from a failed query', async () => {
    const roam = await import('../src/roam.js');

    graph.api.data.q = () => [];
    const empty = roam.queryResult(QUERY);
    assert.equal(empty.ok, true);
    assert.deepEqual(empty.rows, []);

    graph.api.data.q = () => {
        throw new Error('graph unavailable');
    };
    const failed = roam.queryResult(QUERY);
    assert.equal(failed.ok, false);
    assert.equal(failed.rows, null);
    assert.match(failed.error.message, /graph unavailable/);
});

test('a malformed graph query result is a failed read, not an empty graph', async () => {
    const roam = await import('../src/roam.js');

    graph.api.data.q = () => ({ rows: [] });
    const result = roam.queryResult(QUERY);
    assert.equal(result.ok, false);
    assert.equal(result.rows, null);
    assert.match(result.error.message, /array/);
    assert.throws(() => roam.queryOrThrow(QUERY), /array/);
});

test('malformed graph rows preserve the last valid clock snapshot', async () => {
    const clock = await import('../src/clock.js');
    const { setExtensionAPI } = await import('../src/settings.js');
    setExtensionAPI(useSettings());
    clock.reset();

    await clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') });
    const before = clock.getRunning().map(entry => entry.clockUid);
    graph.api.data.q = () => [['only one column']];

    const result = clock.refresh();

    assert.deepEqual(result.map(entry => entry.clockUid), before);
    assert.equal(clock.getLastRefreshStatus().ok, false);
});

test('clock refresh preserves its last valid running snapshot when the graph read fails', async () => {
    const clock = await import('../src/clock.js');
    const settingsApi = useSettings();
    const { setExtensionAPI } = await import('../src/settings.js');
    setExtensionAPI(settingsApi);

    await clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') });
    const before = clock.getRunning().map(entry => entry.clockUid);
    assert.equal(clock.getLastRefreshStatus().ok, true);

    graph.api.data.q = () => {
        throw new Error('temporary graph read failure');
    };
    const result = clock.refresh();

    assert.deepEqual(result.map(entry => entry.clockUid), before);
    assert.deepEqual(clock.getRunning().map(entry => entry.clockUid), before);
    assert.equal(clock.getLastRefreshStatus().ok, false);
});

test('clock in performs zero graph writes when the current graph state is uncertain', async () => {
    const clock = await import('../src/clock.js');
    const { setExtensionAPI } = await import('../src/settings.js');
    setExtensionAPI(useSettings());
    const count = writes();
    const original = graph.api.data.block;
    graph.api.data.block = {
        create: async (...args) => {
            count.creates += 1;
            return original.create(...args);
        },
        update: async (...args) => {
            count.updates += 1;
            return original.update(...args);
        },
        delete: async (...args) => {
            count.deletes += 1;
            return original.delete(...args);
        },
    };
    graph.api.data.q = () => {
        throw new Error('graph read failed before mutation');
    };

    await assert.rejects(
        () => clock.clockIn(TASK.uid),
        /Graph state could not be confirmed; no further changes were made/
    );
    assert.deepEqual(count, { creates: 0, updates: 0, deletes: 0 });
});

test('resume keeps the Pause Batch when task existence cannot be confirmed', async () => {
    const paused = await import('../src/paused.js');
    const clock = await import('../src/clock.js');
    const { setExtensionAPI } = await import('../src/settings.js');
    const settingsApi = useSettings();
    setExtensionAPI(settingsApi);
    settings.set(
        'pausedBatch',
        JSON.stringify({
            version: 1,
            items: [{ taskUid: TASK.uid, title: 'safety task', pausedAtMs: 1 }],
        })
    );
    paused.load();
    clock.reset();
    graph.api.data.q = () => {
        throw new Error('graph is temporarily unavailable');
    };

    const result = await paused.resumeAll({ now: new Date('2026-08-15T09:00:00') });

    assert.equal(result.resumed, 0);
    assert.equal(result.failed, 1);
    assert.equal(paused.getPaused().length, 1);
    assert.match(paused.getNotice(), /could not be confirmed|could not be resumed/i);
    assert.deepEqual(
        JSON.parse(settings.get('pausedBatch')).data.items.map(item => item.taskUid),
        [TASK.uid]
    );
});

test('an empty graph remains a valid empty state', async () => {
    const clock = await import('../src/clock.js');
    const { setExtensionAPI } = await import('../src/settings.js');
    setExtensionAPI(useSettings());
    graph = installGraph([]);

    assert.deepEqual(clock.refresh(), []);
    assert.equal(clock.getLastRefreshStatus().ok, true);
});
