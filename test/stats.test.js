import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildDashboard,
    entryMinutes,
    filterByRange,
    findStaleClocks,
    sortTaskForest,
    summariseByTask,
    summariseSessionMetrics,
    transformTaskForest,
} from '../src/stats.js';

const NOW = new Date(2026, 7, 5, 17, 0);

const entry = (overrides = {}) => ({
    clockUid: 'c1',
    taskUid: 't1',
    taskString: '{{[[TODO]]}} task one',
    title: 'task one',
    pageTitle: 'August 5th, 2026',
    start: new Date(2026, 7, 5, 15, 0),
    end: new Date(2026, 7, 5, 16, 0),
    minutes: 60,
    running: false,
    ...overrides,
});

test('a running entry counts up to now', () => {
    const running = entry({ end: null, minutes: null, running: true });
    assert.equal(entryMinutes(running, NOW), 120);
    assert.equal(entryMinutes(entry(), NOW), 60);
});

test('range filtering buckets by start day', () => {
    const entries = [
        entry({ clockUid: 'today', start: new Date(2026, 7, 5, 9, 0) }),
        entry({ clockUid: 'threeDaysAgo', start: new Date(2026, 7, 2, 9, 0) }),
        entry({ clockUid: 'lastMonth', start: new Date(2026, 6, 1, 9, 0) }),
    ];

    assert.deepEqual(
        filterByRange(entries, 'today', NOW).map(e => e.clockUid),
        ['today']
    );
    assert.deepEqual(
        filterByRange(entries, 'week', NOW).map(e => e.clockUid),
        ['today', 'threeDaysAgo']
    );
    assert.equal(filterByRange(entries, 'all', NOW).length, 3);
});

test('an entry crossing midnight remains in the range of its start day', () => {
    const overnight = entry({
        start: new Date(2026, 7, 4, 23, 30),
        end: new Date(2026, 7, 5, 0, 30),
        minutes: 60,
    });
    // Started yesterday, so "today" must not claim it.
    assert.equal(filterByRange([overnight], 'today', NOW).length, 0);
    assert.equal(filterByRange([overnight], 'week', NOW).length, 1);
});

test('task rollups sum minutes and sort by weight', () => {
    const rows = summariseByTask(
        [
            entry({ taskUid: 't1', title: 'small', minutes: 15 }),
            entry({ taskUid: 't2', title: 'big', minutes: 90 }),
            entry({ taskUid: 't1', title: 'small', minutes: 20, clockUid: 'c2' }),
        ],
        NOW
    );

    assert.deepEqual(rows.map(row => row.title), ['big', 'small']);
    assert.equal(rows[1].minutes, 35);
    assert.equal(rows[1].sessions, 2);
});

test('session metrics count CLOCK entries once and expose profile statistics', () => {
    const metrics = summariseSessionMetrics(
        [
            entry({ clockUid: 'short', minutes: 10 }),
            entry({ clockUid: 'medium', minutes: 30, start: new Date(2026, 7, 4, 15, 0) }),
            entry({
                clockUid: 'running',
                minutes: null,
                end: null,
                running: true,
                start: new Date(2026, 7, 5, 15, 0),
            }),
        ],
        NOW
    );

    assert.equal(metrics.sessions, 3);
    assert.equal(metrics.completedSessions, 2);
    assert.equal(metrics.runningSessions, 1);
    assert.equal(metrics.focusMinutes, 160);
    assert.equal(metrics.averageMinutes, 160 / 3);
    assert.equal(metrics.longestMinutes, 120);
    assert.equal(metrics.medianMinutes, 30);
    assert.equal(metrics.activeDays, 2);
});

test('a task with a running clock is flagged as running', () => {
    const [row] = summariseByTask(
        [entry(), entry({ clockUid: 'c2', end: null, minutes: null, running: true })],
        NOW
    );
    assert.equal(row.running, true);
    assert.equal(row.sessions, 2);
});

test('stale detection only flags clocks older than the threshold', () => {
    const entries = [
        entry({ clockUid: 'fresh', start: new Date(2026, 7, 5, 16, 0), end: null, running: true }),
        entry({ clockUid: 'forgotten', start: new Date(2026, 7, 4, 9, 0), end: null, running: true }),
        entry({ clockUid: 'closed', start: new Date(2026, 7, 1, 9, 0) }),
    ];
    assert.deepEqual(
        findStaleClocks(entries, NOW, 8).map(e => e.clockUid),
        ['forgotten']
    );
});

test('the dashboard model reports today and week totals regardless of range', () => {
    const entries = [
        entry({ clockUid: 'today', start: new Date(2026, 7, 5, 9, 0), minutes: 30 }),
        entry({ clockUid: 'week', start: new Date(2026, 7, 2, 9, 0), minutes: 45 }),
        entry({ clockUid: 'old', start: new Date(2026, 5, 2, 9, 0), minutes: 100 }),
    ];
    const model = buildDashboard(entries, { now: NOW, rangeId: 'today' });

    assert.equal(model.totalMinutes, 30);
    assert.equal(model.todayMinutes, 30);
    assert.equal(model.weekMinutes, 75);
    assert.equal(model.tasks.length, 1);
});

const taskNode = (taskUid, title, status, children = [], values = {}) => ({
    taskUid,
    title,
    status,
    pageTitle: 'Tasks',
    own: values.own ?? 0,
    sessions: values.sessions ?? 0,
    total: values.total ?? values.own ?? 0,
    running: false,
    occurrences: 1,
    truncated: false,
    children,
});

test('task forest filtering preserves matching branches and marks only required ancestors as context', () => {
    const forest = [
        taskNode('parent', 'Parent', 'DONE', [
            taskNode('todo-child', 'Todo child', 'TODO'),
            taskNode('done-child', 'Done child', 'DONE'),
        ]),
        taskNode('todo-root', 'Todo root', 'TODO', [taskNode('done-grandchild', 'Done grandchild', 'DONE')]),
        taskNode('legacy', 'Legacy task', null),
    ];

    const result = transformTaskForest(forest, { filter: 'TODO' });

    assert.equal(result.filter, 'TODO');
    assert.equal(result.matchCount, 2);
    assert.equal(result.totalCount, 6);
    assert.deepEqual(result.forest.map(node => [node.taskUid, node.context]), [
        ['parent', true],
        ['todo-root', false],
    ]);
    assert.deepEqual(result.forest[0].children.map(node => [node.taskUid, node.context]), [
        ['todo-child', false],
    ]);
    assert.deepEqual(result.forest[1].children, []);
    assert.equal(result.forest.some(node => node.taskUid === 'legacy'), false);
});

test('task forest filtering recomputes visible totals and keeps the source total separately', () => {
    const forest = [
        taskNode('parent', 'Parent', 'DONE', [
            taskNode('todo-child', 'Todo child', 'TODO', [], { own: 20, total: 20 }),
            taskNode('done-child', 'Done child', 'DONE', [], { own: 30, total: 30 }),
        ], { own: 10, total: 60 }),
    ];

    const result = transformTaskForest(forest, { filter: 'TODO' });
    const [parent] = result.forest;

    assert.equal(parent.total, 30);
    assert.equal(parent.unfilteredTotal, 60);
    assert.equal(parent.children[0].total, 20);
});

test('task forest sorting uses recomputed filtered totals', () => {
    const forest = [
        taskNode('large-unfiltered', 'A', 'DONE', [taskNode('todo-a', 'A child', 'TODO', [], { own: 20 })], {
            own: 10,
            total: 100,
        }),
        taskNode('small-unfiltered', 'B', 'DONE', [taskNode('todo-b', 'B child', 'TODO', [], { own: 40 })], {
            own: 5,
            total: 45,
        }),
    ];

    const result = transformTaskForest(forest, { filter: 'TODO', sortBy: 'total', direction: 'desc' });

    assert.deepEqual(result.forest.map(node => [node.taskUid, node.total]), [
        ['small-unfiltered', 45],
        ['large-unfiltered', 30],
    ]);
});

test('DONE filtering does not reveal unmatched descendants and ALL includes unknown statuses', () => {
    const forest = [
        taskNode('parent', 'Parent', 'DONE', [taskNode('todo-child', 'Todo child', 'TODO')]),
        taskNode('todo-root', 'Todo root', 'TODO', [taskNode('done-child', 'Done child', 'DONE')]),
        taskNode('legacy', 'Legacy task', null),
    ];

    const done = transformTaskForest(forest, { filter: 'DONE' });
    assert.equal(done.matchCount, 2);
    assert.deepEqual(done.forest.map(node => [node.taskUid, node.context]), [
        ['parent', false],
        ['todo-root', true],
    ]);
    assert.deepEqual(done.forest[0].children, []);
    assert.deepEqual(done.forest[1].children.map(node => [node.taskUid, node.context]), [
        ['done-child', false],
    ]);

    const all = transformTaskForest(forest, { filter: 'ALL' });
    assert.equal(all.matchCount, all.totalCount);
    assert.equal(all.totalCount, 5);
    assert.equal(all.forest.some(node => node.taskUid === 'legacy'), true);
    assert.equal(all.forest.flatMap(node => [node, ...node.children]).some(node => node.context), false);
});

test('task counts use unique UIDs when a task appears under multiple parents', () => {
    const forest = [
        taskNode('parent-a', 'Parent A', 'DONE', [taskNode('shared', 'Shared task', 'TODO')]),
        taskNode('parent-b', 'Parent B', 'DONE', [taskNode('shared', 'Shared task', 'TODO')]),
    ];

    const result = transformTaskForest(forest, { filter: 'TODO' });

    assert.equal(result.matchCount, 1);
    assert.equal(result.totalCount, 3);
    assert.deepEqual(result.forest.map(node => node.taskUid), ['parent-a', 'parent-b']);
    assert.deepEqual(result.forest.map(node => node.children.map(child => child.taskUid)), [
        ['shared'],
        ['shared'],
    ]);
});

test('task forest sorting is recursive, directional, and deterministic on ties', () => {
    const forest = [
        taskNode(
            'root-b',
            'Beta',
            'TODO',
            [
                taskNode('child-z', 'Same', 'TODO', [], { sessions: 2, own: 20, total: 20 }),
                taskNode('child-a', 'Same', 'TODO', [], { sessions: 2, own: 20, total: 20 }),
                taskNode('child-low', 'Low', 'TODO', [], { sessions: 1, own: 20, total: 20 }),
            ],
            { sessions: 2, own: 10, total: 100 }
        ),
        taskNode('root-a', 'Alpha', 'TODO', [taskNode('child-high', 'High', 'TODO', [], { sessions: 3 })], {
            sessions: 2,
            own: 30,
            total: 50,
        }),
        taskNode('root-c', 'Charlie', 'TODO', [], { sessions: 1, own: 20, total: 75 }),
    ];
    const before = structuredClone(forest);

    const sessions = sortTaskForest(forest, { sortBy: 'sessions', direction: 'desc' });
    assert.deepEqual(sessions.map(node => node.taskUid), ['root-a', 'root-b', 'root-c']);
    assert.deepEqual(sessions[1].children.map(node => node.taskUid), [
        'child-a',
        'child-z',
        'child-low',
    ]);

    const own = sortTaskForest(forest, { sortBy: 'own', direction: 'asc' });
    assert.deepEqual(own.map(node => node.taskUid), ['root-b', 'root-c', 'root-a']);

    const total = sortTaskForest(forest, { sortBy: 'total', direction: 'desc' });
    assert.deepEqual(total.map(node => node.taskUid), ['root-b', 'root-c', 'root-a']);

    assert.deepEqual(forest, before);
    assert.notStrictEqual(sessions, forest);
    assert.notStrictEqual(sessions[1], forest[0]);
    assert.notStrictEqual(sessions[1].children, forest[0].children);
});
