import assert from 'node:assert/strict';
import test from 'node:test';

import { buildActivity, getActivityDensity } from '../src/activity.js';

const NOW = new Date(2026, 7, 15, 12, 0);

const entry = (clockUid, start, end, minutes, overrides = {}) => ({
    clockUid,
    taskUid: `${clockUid}-task`,
    start: new Date(start),
    end: end ? new Date(end) : null,
    minutes,
    running: end === null,
    ...overrides,
});

test('Activity Today keeps independent Sessions in start order with visible labels', () => {
    const activity = buildActivity(
        [
            entry('late', '2026-08-15T11:30:00', '2026-08-15T12:00:00', 30),
            entry('early', '2026-08-15T09:00:00', '2026-08-15T09:30:00', 30),
            entry('zero', '2026-08-15T10:00:00', '2026-08-15T10:00:00', 0),
        ],
        { now: NOW, rangeId: 'today' }
    );

    assert.equal(activity.unit, 'session');
    assert.equal(activity.buckets.length, 3);
    assert.deepEqual(
        activity.buckets.map(bucket => [bucket.id, bucket.minutes, bucket.dateLabel]),
        [
            ['early', 30, '09:00'],
            ['zero', 0, '10:00'],
            ['late', 30, '11:30'],
        ]
    );
    assert.deepEqual(activity.buckets.map(bucket => bucket.sessionCount), [1, 1, 1]);
    assert.deepEqual(activity.buckets.map(bucket => bucket.durationLabel), ['30m', '0m', '30m']);
    assert.equal(activity.totalMinutes, 60);
});

test('Activity Last 7 days uses seven start-day buckets and keeps cross-midnight time on its start day', () => {
    const activity = buildActivity(
        [
            entry('overnight', '2026-08-09T23:30:00', '2026-08-10T00:30:00', 60),
            entry('midweek', '2026-08-12T09:00:00', '2026-08-12T09:45:00', 45),
        ],
        { now: NOW, rangeId: 'week' }
    );

    assert.equal(activity.unit, 'day');
    assert.deepEqual(activity.buckets.map(bucket => bucket.dateKey), [
        '2026-08-09',
        '2026-08-10',
        '2026-08-11',
        '2026-08-12',
        '2026-08-13',
        '2026-08-14',
        '2026-08-15',
    ]);
    assert.deepEqual(activity.buckets.map(bucket => bucket.minutes), [60, 0, 0, 45, 0, 0, 0]);
    assert.equal(activity.buckets[0].dateLabel, 'Aug 9');
    assert.equal(activity.buckets[3].durationLabel, '45m');
    assert.equal(activity.buckets[0].sessionCount, 1);
    assert.equal(activity.buckets[0].ariaLabel, 'Aug 9, 2026 · 1h 00m · 1 Session');
});

test('Activity Last 30 days uses decimal hours while accessibility keeps full duration', () => {
    const now = new Date(2026, 8, 15, 12, 0);
    const activity = buildActivity(
        [
            entry('august', '2026-08-31T09:00:00', '2026-08-31T10:30:00', 90),
            entry('september', '2026-09-01T09:00:00', '2026-09-01T09:30:00', 30),
        ],
        { now, rangeId: 'month' }
    );

    assert.equal(activity.unit, 'day');
    assert.equal(activity.buckets.length, 30);
    const august = activity.buckets.find(bucket => bucket.dateKey === '2026-08-31');
    const september = activity.buckets.find(bucket => bucket.dateKey === '2026-09-01');
    assert.deepEqual(
        [august.minutes, august.durationLabel, august.dateLabel, august.monthLabel],
        [90, '1.5', '31', '']
    );
    assert.deepEqual(
        [september.minutes, september.durationLabel, september.dateLabel, september.monthLabel],
        [30, '0.5', '1', 'Sep']
    );
    assert.match(august.ariaLabel, /Aug 31, 2026.*1h 30m.*1 Session/);
    assert.match(september.ariaLabel, /Sep 1, 2026.*30m.*1 Session/);
    assert.equal(activity.durationFormat, 'hours');
});

test('Activity All time keeps a complete calendar-month timeline through now', () => {
    const monthly = buildActivity(
        [
            entry('first', '2026-06-01T09:00:00', '2026-06-01T09:30:00', 30),
            entry('last', '2026-07-20T09:00:00', '2026-07-20T10:00:00', 60),
        ],
        { now: NOW, rangeId: 'all' }
    );
    assert.equal(monthly.unit, 'month');
    assert.equal(monthly.buckets.length, 3);
    assert.deepEqual(monthly.buckets.map(bucket => bucket.dateKey), [
        '2026-06-01',
        '2026-07-01',
        '2026-08-01',
    ]);
    assert.deepEqual(monthly.buckets.map(bucket => bucket.minutes), [30, 60, 0]);
    assert.equal(monthly.buckets.at(-1).start.getTime(), new Date('2026-08-01T00:00:00').getTime());
    assert.equal(monthly.buckets[0].durationLabel, '30m');
    assert.equal(monthly.buckets[0].dateLabel, 'Jun');
    assert.equal(monthly.buckets.at(-1).dateLabel, 'Aug');
    assert.match(monthly.buckets[0].ariaLabel, /Jun 2026.*30m.*1 Session/);
});

test('Activity All time switches to complete calendar-year buckets beyond 24 months', () => {
    const yearly = buildActivity(
        [
            entry('january', '2024-01-15T09:00:00', '2024-01-15T09:30:00', 30),
            entry('may', '2025-05-20T09:00:00', '2025-05-20T10:00:00', 60),
        ],
        { now: NOW, rangeId: 'all' }
    );
    assert.equal(yearly.unit, 'year');
    assert.deepEqual(yearly.buckets.map(bucket => bucket.dateKey), ['2024-01-01', '2025-01-01', '2026-01-01']);
    assert.deepEqual(yearly.buckets.map(bucket => bucket.minutes), [30, 60, 0]);
    assert.deepEqual(yearly.buckets.map(bucket => bucket.dateLabel), ['2024', '2025', '2026']);
    assert.equal(yearly.buckets.at(-1).start.getFullYear(), 2026);
    assert.equal(yearly.buckets[0].durationLabel, '30m');
    assert.match(yearly.buckets[0].ariaLabel, /Jan 1, 2024.*30m.*1 Session/);
});

test('Activity All time keeps exactly 24 months monthly and switches at month 25', () => {
    const exactlyTwentyFour = buildActivity(
        [entry('month-24', '2024-09-15T09:00:00', '2024-09-15T09:30:00', 30)],
        { now: NOW, rangeId: 'all' }
    );
    assert.equal(exactlyTwentyFour.unit, 'month');
    assert.equal(exactlyTwentyFour.buckets.length, 24);
    assert.equal(exactlyTwentyFour.buckets[0].dateKey, '2024-09-01');
    assert.equal(exactlyTwentyFour.buckets.at(-1).dateKey, '2026-08-01');

    const twentyFive = buildActivity(
        [entry('month-25', '2024-08-15T09:00:00', '2024-08-15T09:30:00', 30)],
        { now: NOW, rangeId: 'all' }
    );
    assert.equal(twentyFive.unit, 'year');
    assert.deepEqual(twentyFive.buckets.map(bucket => bucket.dateLabel), ['2024', '2025', '2026']);
});

test('Activity density is explicit and prioritises short-range readability', () => {
    assert.equal(getActivityDensity('week', 'day', 7).barWidthPx, 42);
    assert.ok(getActivityDensity('week', 'day', 7).barWidthPx > 18);
    assert.equal(getActivityDensity('month', 'day', 30).barWidthPx, 10);
    assert.ok(getActivityDensity('today', 'session', 3).barWidthPx > getActivityDensity('today', 'session', 12).barWidthPx);
    assert.ok(getActivityDensity('all', 'month', 8).barWidthPx > getActivityDensity('all', 'month', 20).barWidthPx);
    assert.ok(getActivityDensity('all', 'year', 3).barWidthPx > getActivityDensity('all', 'month', 20).barWidthPx);
});

test('Activity includes a running Session in its cached derived bucket without changing range semantics', () => {
    const activity = buildActivity(
        [
            entry('running', '2026-08-15T11:15:00', null, null),
            entry('old', '2026-08-08T23:30:00', '2026-08-09T00:30:00', 60),
        ],
        { now: NOW, rangeId: 'week' }
    );

    assert.equal(activity.buckets.at(-1).minutes, 45);
    assert.equal(activity.buckets.at(-1).sessionCount, 1);
    assert.deepEqual(activity.buckets.at(-1).runningClockUids, ['running']);
    assert.equal(activity.buckets.at(-1).durationLabel, '45m');
    assert.equal(activity.buckets.find(bucket => bucket.dateKey === '2026-08-08'), undefined);
});

test('Activity with no entries stays empty so the Dashboard can keep its compact empty state', () => {
    const activity = buildActivity([], { now: NOW, rangeId: 'week' });

    assert.deepEqual(activity.buckets, []);
    assert.equal(activity.totalMinutes, 0);
    assert.equal(activity.maxMinutes, 0);
});
