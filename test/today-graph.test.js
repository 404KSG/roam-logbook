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

test('Today read accepts a legal 509-block page with maximum depth 9', () => {
    const blocks = [
        {
            uid: 'large-root',
            page: 'August 19th, 2026',
            parent: null,
            order: 0,
            string: '{{[[TODO]]}} Large project',
        },
    ];

    // Keep one branch at the real page depth while filling the page with
    // ordinary sibling blocks. This is a valid tree, not malformed data.
    for (let depth = 1; depth <= 9; depth += 1) {
        blocks.push({
            uid: `large-depth-${depth}`,
            page: 'August 19th, 2026',
            parent: depth === 1 ? 'large-root' : `large-depth-${depth - 1}`,
            order: 0,
            string: depth === 9 ? '{{[[TODO]]}} Deep task' : `context ${depth}`,
        });
    }
    for (let index = 0; index < 499; index += 1) {
        blocks.push({
            uid: `large-sibling-${index}`,
            page: 'August 19th, 2026',
            parent: 'large-root',
            order: index + 1,
            string: `context sibling ${index}`,
        });
    }

    assert.equal(blocks.length, 509);
    installGraph(blocks);
    const result = readTodayTodoSnapshot(new Date('2026-08-19T10:00:00'), { maxDepth: 9 });

    assert.equal(result.ok, true);
    assert.equal(result.status, 'success');
    assert.equal(result.roots.length, 1);
    assert.equal(result.roots[0].children.length, 500);
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
