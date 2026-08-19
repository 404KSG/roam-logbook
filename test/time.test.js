import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import {
    dateKey,
    durationMinutes,
    formatDurationMinutes,
    formatElapsed,
    formatMinutesHuman,
    formatRelativeTime,
    formatStarted,
    formatStamp,
    formatTimestamp,
    parseDurationMinutes,
    parseTimestamp,
    startOfDaysAgo,
} from '../src/time.js';

const runInTimezone = (timezone, source) => {
    const moduleUrl = new URL('../src/time.js', import.meta.url).href;
    const script = `import * as time from ${JSON.stringify(moduleUrl)};\n${source}`;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
        env: { ...process.env, TZ: timezone },
        encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
};

test('formats an org timestamp with its day name', () => {
    assert.equal(formatTimestamp(new Date(2026, 7, 5, 15, 58)), '2026-08-05 Wed 15:58');
    assert.equal(formatStamp(new Date(2026, 7, 5, 15, 58)), '[2026-08-05 Wed 15:58]');
});

test('formats Started as a compact local date and time against a fixed now', () => {
    const now = new Date(2026, 7, 15, 9, 0);
    assert.deepEqual(formatStarted('[2026-08-15 Sat 08:46]', now), {
        valid: true,
        raw: '[2026-08-15 Sat 08:46]',
        dateLabel: 'Today',
        timeLabel: '08:46',
        datetime: '2026-08-15T08:46',
    });
    assert.deepEqual(formatStarted('[2026-08-14 Fri 21:30]', now), {
        valid: true,
        raw: '[2026-08-14 Fri 21:30]',
        dateLabel: 'Aug 14',
        timeLabel: '21:30',
        datetime: '2026-08-14T21:30',
    });
});

test('falls back to the original Started text when its timestamp is invalid', () => {
    assert.deepEqual(formatStarted('[not a timestamp]', new Date(2026, 7, 15, 9, 0)), {
        valid: false,
        raw: '[not a timestamp]',
        dateLabel: '[not a timestamp]',
        timeLabel: '',
        datetime: null,
    });
});

test('pads single-digit months, days and hours', () => {
    assert.equal(formatTimestamp(new Date(2026, 0, 3, 9, 4)), '2026-01-03 Sat 09:04');
});

test('round-trips a timestamp through parse', () => {
    const original = new Date(2026, 7, 5, 15, 58);
    assert.equal(parseTimestamp(formatTimestamp(original)).getTime(), original.getTime());
});

test('parses timestamps without a day name and with seconds', () => {
    assert.equal(parseTimestamp('2026-08-05 15:58').getTime(), new Date(2026, 7, 5, 15, 58).getTime());
    assert.equal(
        parseTimestamp('2026-08-05 Wed 15:58:30').getTime(),
        new Date(2026, 7, 5, 15, 58, 30).getTime()
    );
});

test('parses a non-English day name', () => {
    // Graphs written in another locale must still round-trip.
    assert.equal(parseTimestamp('2026-08-05 週三 15:58').getTime(), new Date(2026, 7, 5, 15, 58).getTime());
});

test('rejects junk and dates that do not exist', () => {
    assert.equal(parseTimestamp('not a date'), null);
    assert.equal(parseTimestamp(''), null);
    assert.equal(parseTimestamp(null), null);
    // `new Date` would silently roll this into March.
    assert.equal(parseTimestamp('2026-02-31 Tue 10:00'), null);
    assert.equal(parseTimestamp('2026-08-05 Wed 25:00'), null);
});

test('accepts a nonexistent spring-forward local time as the shifted instant', () => {
    const result = runInTimezone(
        'America/New_York',
        `
const shifted = time.parseTimestamp('2026-03-08 Sun 02:30');
const invalidDay = time.parseTimestamp('2026-02-31 Tue 02:30');
const springDay = time.startOfDaysAgo(new Date(2026, 2, 9, 12), 1);
const fallDay = time.startOfDaysAgo(new Date(2026, 10, 2, 12), 1);
console.log(JSON.stringify({
    shifted: shifted && {
        year: shifted.getFullYear(),
        month: shifted.getMonth(),
        day: shifted.getDate(),
        hour: shifted.getHours(),
        minute: shifted.getMinutes(),
    },
    invalidDay,
    springDay: { key: time.dateKey(springDay), hour: springDay.getHours() },
    fallDay: { key: time.dateKey(fallDay), hour: fallDay.getHours() },
}));`
    );

    assert.deepEqual(result.shifted, { year: 2026, month: 2, day: 8, hour: 3, minute: 30 });
    assert.equal(result.invalidDay, null);
    assert.deepEqual(result.springDay, { key: '2026-03-08', hour: 0 });
    assert.deepEqual(result.fallDay, { key: '2026-11-01', hour: 0 });
});

test('truncates durations to whole minutes', () => {
    const start = new Date(2026, 7, 5, 15, 58).getTime();
    assert.equal(durationMinutes(start, start + 60 * 60_000), 60);
    assert.equal(durationMinutes(start, start + 59_999), 0);
    // A clock that somehow ends before it starts is worth nothing, not negative.
    assert.equal(durationMinutes(start, start - 60_000), 0);
});

test('formats durations the way org writes them', () => {
    assert.equal(formatDurationMinutes(60), '1:00');
    assert.equal(formatDurationMinutes(7), '0:07');
    assert.equal(formatDurationMinutes(1590), '26:30');
});

test('parses org duration summaries', () => {
    assert.equal(parseDurationMinutes('1:00'), 60);
    assert.equal(parseDurationMinutes('26:30'), 1590);
    assert.equal(parseDurationMinutes('1:60'), null);
    assert.equal(parseDurationMinutes('nope'), null);
});

test('elapsed drops the hour segment under an hour', () => {
    assert.equal(formatElapsed(0), '0:00');
    assert.equal(formatElapsed(754_000), '12:34');
    assert.equal(formatElapsed(3_754_000), '1:02:34');
});

test('humanises minutes for the dashboard', () => {
    assert.equal(formatMinutesHuman(45), '45m');
    assert.equal(formatMinutesHuman(125), '2h 05m');
});

test('formats robust compact relative times for Recent Active Work', () => {
    const now = new Date(2026, 7, 15, 9, 30);
    assert.equal(formatRelativeTime(new Date(2026, 7, 15, 9, 29, 45), now), 'just now');
    assert.equal(formatRelativeTime(new Date(2026, 7, 15, 9, 27), now), '3m ago');
    assert.equal(formatRelativeTime(new Date(2026, 7, 15, 7, 30), now), '2h ago');
    assert.equal(formatRelativeTime(new Date(2026, 7, 13, 9, 30), now), '2d ago');
    assert.equal(formatRelativeTime(new Date(2026, 7, 15, 9, 31), now), 'just now');
    assert.equal(formatRelativeTime('not a date', now), 'time unavailable');
});

test('keeps week/month and month/year boundaries from rounding early', () => {
    const now = new Date(2026, 7, 15, 9, 30);
    const ago = days => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    assert.equal(formatRelativeTime(ago(28), now), '4w ago');
    assert.equal(formatRelativeTime(ago(29), now), '4w ago');
    assert.equal(formatRelativeTime(ago(30), now), '1mo ago');
    assert.equal(formatRelativeTime(ago(34), now), '1mo ago');
    assert.equal(formatRelativeTime(ago(360), now), '11mo ago');
    assert.equal(formatRelativeTime(ago(365), now), '1y ago');
});

test('date keys and day offsets use local midnight', () => {
    assert.equal(dateKey(new Date(2026, 7, 5, 23, 59)), '2026-08-05');
    const start = startOfDaysAgo(new Date(2026, 7, 5, 15, 0), 2);
    assert.equal(dateKey(start), '2026-08-03');
    assert.equal(start.getHours(), 0);
});
