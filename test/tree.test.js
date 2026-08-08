import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTaskForest, flattenForest } from '../src/stats.js';

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
