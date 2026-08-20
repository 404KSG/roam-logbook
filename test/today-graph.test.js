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

test('Today projection keeps task/reference seeds and required ancestors only', () => {
    const blocks = [
        {
            uid: 'projection-context',
            page: 'August 19th, 2026',
            parent: null,
            order: 0,
            string: 'Daily Notes context',
        },
        {
            uid: 'projection-todo',
            page: 'August 19th, 2026',
            parent: 'projection-context',
            order: 0,
            string: '{{[[TODO]]}} Open project',
        },
        {
            uid: 'projection-todo-note',
            page: 'August 19th, 2026',
            parent: 'projection-todo',
            order: 0,
            string: 'irrelevant task note',
        },
        {
            uid: 'projection-todo-done',
            page: 'August 19th, 2026',
            parent: 'projection-todo',
            order: 1,
            string: '{{[[DONE]]}} Finished child',
        },
        {
            uid: 'projection-done-ancestor',
            page: 'August 19th, 2026',
            parent: 'projection-context',
            order: 1,
            string: '{{[[DONE]]}} Completed wrapper',
        },
        {
            uid: 'projection-done-plain',
            page: 'August 19th, 2026',
            parent: 'projection-done-ancestor',
            order: 0,
            string: 'plain bridge',
        },
        {
            uid: 'projection-done-child',
            page: 'August 19th, 2026',
            parent: 'projection-done-plain',
            order: 0,
            string: '{{[[TODO]]}} Open under completed wrapper',
        },
        {
            uid: 'projection-standalone-done',
            page: 'August 19th, 2026',
            parent: 'projection-context',
            order: 2,
            string: '{{[[DONE]]}} Standalone completed branch',
        },
        {
            uid: 'projection-standalone-done-note',
            page: 'August 19th, 2026',
            parent: 'projection-standalone-done',
            order: 0,
            string: 'completed branch note',
        },
        {
            uid: 'projection-reference-context',
            page: 'August 19th, 2026',
            parent: 'projection-context',
            order: 3,
            string: 'reference context',
        },
        {
            uid: 'projection-mirror',
            page: 'August 19th, 2026',
            parent: 'projection-reference-context',
            order: 0,
            string: '((projection-target))',
        },
        {
            uid: 'projection-mirror-note',
            page: 'August 19th, 2026',
            parent: 'projection-mirror',
            order: 0,
            string: 'irrelevant mirror note',
        },
        {
            uid: 'projection-reference-plain',
            page: 'August 19th, 2026',
            parent: 'projection-mirror',
            order: 1,
            string: 'reference plain bridge',
        },
        {
            uid: 'projection-reference-child',
            page: 'August 19th, 2026',
            parent: 'projection-reference-plain',
            order: 0,
            string: '{{[[TODO]]}} Nested reference task',
        },
        {
            uid: 'projection-unrelated',
            page: 'August 19th, 2026',
            parent: 'projection-context',
            order: 4,
            string: 'unrelated notes and logbook history',
        },
        {
            uid: 'projection-logbook',
            page: 'August 19th, 2026',
            parent: 'projection-unrelated',
            order: 0,
            string: 'LOGBOOK::',
        },
        {
            uid: 'projection-clock',
            page: 'August 19th, 2026',
            parent: 'projection-logbook',
            order: 0,
            string: 'CLOCK: [2026-08-19 Wed 09:00]--[2026-08-19 Wed 09:30] => 0:30',
        },
        {
            uid: 'projection-root-done',
            page: 'August 19th, 2026',
            parent: null,
            order: 1,
            string: '{{[[DONE]]}} Another standalone completed block',
        },
        {
            uid: 'projection-target',
            page: 'Other Page',
            parent: null,
            order: 0,
            string: '{{[[TODO]]}} Referenced task',
        },
    ];

    const graph = installGraph(blocks);
    const result = readTodayTodoSnapshot(new Date('2026-08-19T10:00:00'));
    assert.equal(result.ok, true);

    const retained = [];
    const walk = nodes => {
        for (const node of nodes) {
            retained.push(node.uid);
            walk(node.children);
        }
    };
    walk(result.roots);

    assert.deepEqual(retained, [
        'projection-context',
        'projection-todo',
        'projection-done-ancestor',
        'projection-done-plain',
        'projection-done-child',
        'projection-reference-context',
        'projection-mirror',
        'projection-reference-plain',
        'projection-reference-child',
    ]);
    assert.equal(result.referenceStrings['projection-target'], '{{[[TODO]]}} Referenced task');
    assert.equal(graph.pullCount(), 0);
    assert.ok(graph.fastQueryCount() <= 2, 'projection keeps one page query plus at most one reference query');
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
    assert.equal(result.roots[0].children.length, 1);
    let deepest = result.roots[0];
    for (let depth = 1; depth <= 9; depth += 1) {
        deepest = deepest.children[0];
    }
    assert.equal(deepest.uid, 'large-depth-9');
    assert.equal(deepest.children.length, 0);
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
