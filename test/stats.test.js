import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildDashboard,
    entryMinutes,
    filterByRange,
    findStaleClocks,
    summariseByDay,
    summariseByTask,
    summariseSessionMetrics,
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

test('an entry crossing midnight counts wholly against the day it began', () => {
    const overnight = entry({
        start: new Date(2026, 7, 4, 23, 30),
        end: new Date(2026, 7, 5, 0, 30),
        minutes: 60,
    });
    // Started yesterday, so "today" must not claim it.
    assert.equal(filterByRange([overnight], 'today', NOW).length, 0);
    const [day] = summariseByDay([overnight], NOW, 2);
    assert.equal(day.key, '2026-08-04');
    assert.equal(day.minutes, 60);
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

test('the day series is gapless and oldest first', () => {
    const days = summariseByDay([entry()], NOW, 3);
    assert.deepEqual(days.map(day => day.key), ['2026-08-03', '2026-08-04', '2026-08-05']);
    assert.deepEqual(days.map(day => day.minutes), [0, 0, 60]);
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
