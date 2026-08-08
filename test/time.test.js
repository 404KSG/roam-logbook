import test from 'node:test';
import assert from 'node:assert/strict';

import {
    dateKey,
    durationMinutes,
    formatDurationMinutes,
    formatElapsed,
    formatMinutesHuman,
    formatStamp,
    formatTimestamp,
    parseDurationMinutes,
    parseTimestamp,
    startOfDaysAgo,
} from '../src/time.js';

test('formats an org timestamp with its day name', () => {
    assert.equal(formatTimestamp(new Date(2026, 7, 5, 15, 58)), '2026-08-05 Wed 15:58');
    assert.equal(formatStamp(new Date(2026, 7, 5, 15, 58)), '[2026-08-05 Wed 15:58]');
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

test('date keys and day offsets use local midnight', () => {
    assert.equal(dateKey(new Date(2026, 7, 5, 23, 59)), '2026-08-05');
    const start = startOfDaysAgo(new Date(2026, 7, 5, 15, 0), 2);
    assert.equal(dateKey(start), '2026-08-03');
    assert.equal(start.getHours(), 0);
});
