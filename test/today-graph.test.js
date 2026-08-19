import assert from 'node:assert/strict';
import test from 'node:test';

import { readTodayTodoSnapshot } from '../src/roam.js';
import { installGraph, uninstallGraph } from './helpers/graph-stub.js';

test.afterEach(() => uninstallGraph());

test('bounded Today read distinguishes an absent Daily Notes page from failure', () => {
    installGraph([]);
    const empty = readTodayTodoSnapshot(new Date('2026-08-19T10:00:00'));
    assert.equal(empty.ok, true);
    assert.equal(empty.status, 'empty');
    assert.deepEqual(empty.roots, []);

    const graph = installGraph([
        { uid: 'today-1', page: 'August 19th, 2026', parent: null, order: 0, string: '{{[[TODO]]}} Read' },
        { uid: 'today-2', page: 'August 19th, 2026', parent: 'today-1', order: 0, string: 'context' },
        { uid: 'today-3', page: 'August 19th, 2026', parent: 'today-2', order: 0, string: '{{[[TODO]]}} Reply' },
    ]);
    const success = readTodayTodoSnapshot(new Date('2026-08-19T10:00:00'));
    assert.equal(success.ok, true);
    assert.equal(success.status, 'success');
    assert.equal(success.roots[0].children[0].string, 'context');
    assert.equal(graph.pullCount(), 0);
    assert.equal(graph.fastQueryCount() > 0, true);

    const originalQuery = graph.api.data.q;
    graph.api.data.q = () => {
        throw new Error('temporary graph failure');
    };
    const failure = readTodayTodoSnapshot(new Date('2026-08-19T10:00:00'));
    graph.api.data.q = originalQuery;
    assert.equal(failure.ok, false);
    assert.equal(failure.status, 'error');
    assert.notEqual(failure.roots, []);
});

test('Today read follows only a bounded page-anchored tree and resolves bare references', () => {
    const graph = installGraph([
        { uid: 'page-root', page: 'August 19th, 2026', parent: null, order: 0, string: '{{[[TODO]]}} Project' },
        { uid: 'mirror-1', page: 'August 19th, 2026', parent: 'page-root', order: 0, string: '((target-1))' },
        { uid: 'child-1', page: 'August 19th, 2026', parent: 'mirror-1', order: 0, string: '{{[[TODO]]}} Child' },
        { uid: 'target-1', page: 'Other Page', parent: null, order: 0, string: '{{[[TODO]]}} Referenced' },
    ]);
    const result = readTodayTodoSnapshot(new Date('2026-08-19T10:00:00'), { maxDepth: 4, maxNodes: 10 });
    assert.equal(result.ok, true);
    assert.equal(result.referenceStrings['target-1'], '{{[[TODO]]}} Referenced');
    assert.equal(result.roots[0].children[0].string, '((target-1))');
    assert.equal(graph.pullCount(), 0, 'Today reads the Daily Notes page in one query, not one Pull per node');
    assert.ok(graph.fastQueryCount() <= 2, 'Today uses one page-tree query plus at most one finite reference query');
});

test('Today read rejects pages beyond its explicit node and depth bounds', () => {
    installGraph([
        { uid: 'bound-1', page: 'August 19th, 2026', parent: null, order: 0, string: '{{[[TODO]]}} One' },
        { uid: 'bound-2', page: 'August 19th, 2026', parent: 'bound-1', order: 0, string: '{{[[TODO]]}} Two' },
        { uid: 'bound-3', page: 'August 19th, 2026', parent: 'bound-2', order: 0, string: '{{[[TODO]]}} Three' },
    ]);

    const tooMany = readTodayTodoSnapshot(new Date('2026-08-19T10:00:00'), {
        maxNodes: 2,
    });
    assert.equal(tooMany.ok, false);
    assert.match(tooMany.error.message, /2-block read limit/);

    const tooDeep = readTodayTodoSnapshot(new Date('2026-08-19T10:00:00'), {
        maxDepth: 1,
    });
    assert.equal(tooDeep.ok, false);
    assert.match(tooDeep.error.message, /1-level read limit/);
});
