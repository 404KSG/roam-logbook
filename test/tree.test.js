import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTaskForest, flattenForest, MAX_TASK_FOREST_NODES } from '../src/stats.js';

/** A task rollup row, the shape `summariseByTask` produces. */
const row = (taskUid, title, minutes) => ({
    taskUid,
    title,
    pageTitle: 'Test Page',
    minutes,
    sessions: 1,
    running: false,
    lastActivity: new Date(2026, 7, 8, 12, 0),
});

/** Build a hierarchy from `uid: [parentUid, string]` pairs. */
const hierarchy = (blocks, mirrorsOf = {}) => {
    const parentOf = {};
    const stringOf = {};
    for (const [uid, parentUid, string] of blocks) {
        if (parentUid) parentOf[uid] = parentUid;
        stringOf[uid] = string;
    }
    return { parentOf, stringOf, mirrorsOf };
};

const TODO = title => `{{[[TODO]]}} ${title}`;

test('with no hierarchy every task is its own root', () => {
    const forest = buildTaskForest([row('a', 'one', 60), row('b', 'two', 30)]);
    assert.deepEqual(forest.map(node => node.title), ['one', 'two']);
    assert.deepEqual(forest.map(node => node.total), [60, 30]);
    assert.deepEqual(forest.map(node => node.children.length), [0, 0]);
});

test('sub-tasks nest under the parent and roll their time up', () => {
    const forest = buildTaskForest(
        [row('parent', '发布 v1', 60), row('childA', '写文档', 120), row('childB', '打包', 60)],
        hierarchy([
            ['parent', null, TODO('发布 v1')],
            ['childA', 'parent', TODO('写文档')],
            ['childB', 'parent', TODO('打包')],
        ])
    );

    assert.equal(forest.length, 1);
    const [root] = forest;
    assert.equal(root.title, '发布 v1');
    assert.equal(root.own, 60, 'own time stays just the parent’s own sessions');
    assert.equal(root.total, 240, 'total picks up both sub-tasks');
    assert.deepEqual(root.children.map(node => node.title), ['写文档', '打包']);
});

test('a parent with no time of its own still appears', () => {
    const forest = buildTaskForest(
        [row('childA', '写文档', 120)],
        hierarchy([
            ['parent', null, TODO('发布 v1')],
            ['childA', 'parent', TODO('写文档')],
        ])
    );

    assert.equal(forest.length, 1);
    assert.equal(forest[0].title, '发布 v1');
    assert.equal(forest[0].own, 0);
    assert.equal(forest[0].total, 120);
});

test('ancestor-only task rows retain their raw task strings for display formatting', () => {
    const forest = buildTaskForest(
        [row('childA', '写文档', 120)],
        hierarchy([
            ['parent', null, TODO('Parent [[Project]] #[[Planning]]')],
            ['childA', 'parent', TODO('Child [[Task]] #[[Deep Work]]')],
        ])
    );

    assert.equal(forest[0].taskString, TODO('Parent [[Project]] #[[Planning]]'));
    assert.equal(forest[0].children[0].taskString, null);
});

test('plain blocks between two tasks do not become tree levels', () => {
    const forest = buildTaskForest(
        [row('parent', '发布 v1', 0), row('childA', '写文档', 120)],
        hierarchy([
            ['parent', null, TODO('发布 v1')],
            ['section', 'parent', '一些说明文字'],
            ['childA', 'section', TODO('写文档')],
        ])
    );

    assert.equal(forest[0].children.length, 1);
    assert.equal(forest[0].children[0].title, '写文档');
});

test('nesting follows several levels', () => {
    const forest = buildTaskForest(
        [row('leaf', '写序言', 30)],
        hierarchy([
            ['top', null, TODO('Q3 目标')],
            ['mid', 'top', TODO('发布 v1')],
            ['leaf', 'mid', TODO('写序言')],
        ])
    );

    const rows = flattenForest(forest);
    assert.deepEqual(rows.map(node => [node.title, node.depth, node.total]), [
        ['Q3 目标', 0, 30],
        ['发布 v1', 1, 30],
        ['写序言', 2, 30],
    ]);
});

test('a task referenced under another task rolls up there', () => {
    // 写文档 lives on its own page; the project page holds only ((写文档)).
    const forest = buildTaskForest(
        [row('taskdoc01', '写文档', 120)],
        hierarchy(
            [
                ['project01', null, TODO('发布 v1')],
                ['mirror0001', 'project01', '((taskdoc01))'],
                ['taskdoc01', null, TODO('写文档')],
            ],
            { taskdoc01: ['mirror0001'] }
        )
    );

    assert.equal(forest.length, 1);
    assert.equal(forest[0].title, '发布 v1');
    assert.equal(forest[0].total, 120);
    assert.equal(forest[0].children[0].title, '写文档');
});

test('a task under two parents appears in both and says so', () => {
    const forest = buildTaskForest(
        [row('taskdoc01', '写文档', 120)],
        hierarchy(
            [
                ['project01', null, TODO('发布 v1')],
                ['project02', null, TODO('冲刺周报')],
                ['mirror0001', 'project01', '((taskdoc01))'],
                ['mirror0002', 'project02', '((taskdoc01))'],
                ['taskdoc01', null, TODO('写文档')],
            ],
            { taskdoc01: ['mirror0001', 'mirror0002'] }
        )
    );

    // The overlap is intended; `occurrences` is what lets the UI flag it.
    assert.equal(forest.length, 2);
    assert.deepEqual(forest.map(node => node.total), [120, 120]);
    assert.equal(forest[0].children[0].occurrences, 2);
});

test('a diamond reference graph expands the shared task once under each branch', () => {
    const forest = buildTaskForest(
        [row('diamond-a', 'A', 1), row('diamond-b', 'B', 2), row('diamond-c', 'C', 3), row('diamond-d', 'D', 4)],
        hierarchy(
            [
                ['diamond-a', null, TODO('A')],
                ['diamond-b', null, TODO('B')],
                ['diamond-c', null, TODO('C')],
                ['diamond-d', null, TODO('D')],
                ['mirror-ab', 'diamond-a', '((diamond-b))'],
                ['mirror-ac', 'diamond-a', '((diamond-c))'],
                ['mirror-bd', 'diamond-b', '((diamond-d))'],
                ['mirror-bd-duplicate', 'diamond-b', '((diamond-d))'],
                ['mirror-cd', 'diamond-c', '((diamond-d))'],
            ],
            {
                'diamond-b': ['mirror-ab'],
                'diamond-c': ['mirror-ac'],
                'diamond-d': ['mirror-bd', 'mirror-bd-duplicate', 'mirror-cd'],
            }
        )
    );

    const [root] = forest;
    assert.equal(root.title, 'A');
    assert.deepEqual(root.children.map(node => node.title), ['C', 'B']);
    assert.deepEqual(root.children.map(node => node.children.map(child => child.title)), [['D'], ['D']]);
    assert.deepEqual(root.children.map(node => node.children[0].occurrences), [2, 2]);
});

test('task forest expansion marks nodes beyond the global budget as truncated', () => {
    const childCount = MAX_TASK_FOREST_NODES + 2;
    const children = Array.from({ length: childCount }, (_, index) => `cap-child-${index}`);
    const rows = [row('cap-root', 'root', 0), ...children.map((uid, index) => row(uid, `child ${index}`, 1))];
    const blocks = [
        ['cap-root', null, TODO('root')],
        ...children.map((uid, index) => [uid, 'cap-root', TODO(`child ${index}`)]),
    ];
    const forest = buildTaskForest(rows, hierarchy(blocks));
    const [root] = forest;
    const normal = root.children.filter(node => !node.truncated).length;
    const truncated = root.children.filter(node => node.truncated).length;

    assert.equal(normal, MAX_TASK_FOREST_NODES - 1, 'the root consumes one expansion slot');
    assert.equal(truncated, childCount - normal);
    assert.ok(root.children.some(node => node.truncated));
});

test('a reference loop is cut instead of recursing forever', () => {
    const forest = buildTaskForest(
        [row('taskA0001', 'A', 30), row('taskB0001', 'B', 60)],
        hierarchy(
            [
                ['taskA0001', null, TODO('A')],
                ['taskB0001', 'taskA0001', TODO('B')],
                ['loop00001', 'taskB0001', '((taskA0001))'],
            ],
            { taskA0001: ['loop00001'] }
        )
    );

    // A under B under A: every node still resolves, nothing hangs.
    const rows = flattenForest(forest);
    assert.ok(rows.length > 0);
    assert.ok(rows.some(node => node.truncated), 'the repeat should be marked truncated');
});

test('children are ordered by total, not by own time', () => {
    const forest = buildTaskForest(
        [row('parent', 'p', 0), row('light', 'light', 10), row('heavy', 'heavy', 0), row('deep', 'deep', 500)],
        hierarchy([
            ['parent', null, TODO('p')],
            ['light', 'parent', TODO('light')],
            ['heavy', 'parent', TODO('heavy')],
            ['deep', 'heavy', TODO('deep')],
        ])
    );

    assert.deepEqual(forest[0].children.map(node => node.title), ['heavy', 'light']);
});

test('flattening hides the descendants of a collapsed node', () => {
    const forest = buildTaskForest(
        [row('parent', 'p', 0), row('childA', 'a', 10), row('grandkid', 'g', 5)],
        hierarchy([
            ['parent', null, TODO('p')],
            ['childA', 'parent', TODO('a')],
            ['grandkid', 'childA', TODO('g')],
        ])
    );

    const all = flattenForest(forest);
    assert.deepEqual(all.map(node => node.title), ['p', 'a', 'g']);
    assert.deepEqual(all.map(node => node.hasChildren), [true, true, false]);

    // Collapsing the root hides the whole branch but keeps the root itself.
    const collapsedRoot = flattenForest(forest, { isCollapsed: node => node.taskUid === 'parent' });
    assert.deepEqual(collapsedRoot.map(node => node.title), ['p']);
    assert.equal(collapsedRoot[0].collapsed, true);
    assert.equal(collapsedRoot[0].total, 15, 'a collapsed row still reports the rolled-up total');

    // Collapsing mid-tree keeps everything above it visible.
    const collapsedMid = flattenForest(forest, { isCollapsed: node => node.taskUid === 'childA' });
    assert.deepEqual(collapsedMid.map(node => node.title), ['p', 'a']);
});

test('a leaf is never reported as collapsed', () => {
    const forest = buildTaskForest([row('solo', 'solo', 10)]);
    const [node] = flattenForest(forest, { isCollapsed: () => true });
    assert.equal(node.collapsed, false);
    assert.equal(node.hasChildren, false);
});

test('an ancestor with no sessions still reports its checkbox state', () => {
    const forest = buildTaskForest(
        [{ ...row('childA', 'sub', 30), status: 'DONE' }],
        hierarchy([
            ['parent', null, '{{[[DONE]]}} shipped'],
            ['childA', 'parent', TODO('sub')],
        ])
    );

    // The parent is known only from the hierarchy strings, never from an entry.
    assert.equal(forest[0].status, 'DONE');
    assert.equal(forest[0].children[0].status, 'DONE');
});
