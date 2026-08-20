import test from 'node:test';
import assert from 'node:assert/strict';

import {
    ACTIVE_WORK_WINDOW_MINUTES,
    buildActiveWork,
    createActiveWorkDeriver,
    openLineMinutesLeft,
} from '../src/active-work.js';

const at = value => new Date(`2026-08-17T${value}:00`);

const entry = ({ taskUid, title = taskUid, start, end = null, running = !end }) => ({
    clockUid: `${taskUid}-${start.replace(':', '')}`,
    taskUid,
    title,
    start: at(start),
    end: end ? at(end) : null,
    running,
});

test('Active Work keeps one focused item and distinct recent tasks inside 45 minutes', () => {
    const model = buildActiveWork(
        [
            entry({ taskUid: 'focused', start: '10:20' }),
            entry({ taskUid: 'recent', start: '09:40', end: '10:10' }),
            entry({ taskUid: 'recent', start: '09:10', end: '09:30' }),
            entry({ taskUid: 'stale', start: '08:00', end: '09:00' }),
        ],
        { now: at('10:20') }
    );

    assert.equal(ACTIVE_WORK_WINDOW_MINUTES, 45);
    assert.equal(model.focused.taskUid, 'focused');
    assert.deepEqual(model.recent.map(item => item.taskUid), ['recent']);
    assert.equal(model.count, 2);
    assert.equal(model.recent[0].end.toISOString(), at('10:10').toISOString());
    assert.equal(model.recent[0].remainingMinutes, 35);
});

test('Active Work is the single source of banked task minutes', () => {
    const model = buildActiveWork(
        [
            { ...entry({ taskUid: 'focused', start: '10:20' }), minutes: 40 },
            { ...entry({ taskUid: 'focused', start: '09:00', end: '10:00' }), minutes: 25 },
        ],
        { now: at('10:20') }
    );

    assert.equal(model.focused.priorMinutes, 25);
    assert.equal(model.items[0].priorMinutes, 25);
});

test('Active Work chooses the newest running entry as Focused during legacy overlap', () => {
    const model = buildActiveWork([
        entry({ taskUid: 'older', start: '09:00' }),
        entry({ taskUid: 'newer', start: '10:00' }),
    ], { now: at('10:05') });

    assert.equal(model.focused.taskUid, 'newer');
    assert.deepEqual(model.recent, []);
    assert.equal(model.count, 1);
});

test('Active Work keeps pure Recent history when there is no Focused CLOCK', () => {
    const model = buildActiveWork([
        entry({ taskUid: 'recent', start: '09:00', end: '10:00' }),
    ], { now: at('10:01') });

    assert.equal(model.focused, null);
    assert.deepEqual(model.recent.map(item => item.taskUid), ['recent']);
    assert.deepEqual(model.items.map(item => item.taskUid), ['recent']);
    assert.equal(model.count, 1);
    assert.equal(model.recent[0].remainingMinutes, 44);
});

test('Active Work preserves snapshot order for Recent items with equal end times', () => {
    const model = buildActiveWork(
        [
            entry({ taskUid: 'first', start: '09:00', end: '10:10' }),
            entry({ taskUid: 'second', start: '09:05', end: '10:10' }),
        ],
        { now: at('10:20') }
    );

    assert.deepEqual(model.recent.map(item => item.taskUid), ['first', 'second']);
});

test('pure Recent Active Work expires without a running clock', () => {
    const entries = [entry({ taskUid: 'recent', start: '09:00', end: '10:00' })];
    assert.equal(buildActiveWork(entries, { now: at('10:44') }).count, 1);
    assert.equal(buildActiveWork(entries, { now: at('10:45') }).count, 0);
});

test('Active Work reuses invariant derivation for one snapshot and rebuilds a new snapshot', () => {
    const deriver = createActiveWorkDeriver();
    const entries = Object.freeze([
        entry({ taskUid: 'focused', start: '10:20' }),
        entry({ taskUid: 'recent', start: '09:40', end: '10:10' }),
        entry({ taskUid: 'stale', start: '08:00', end: '09:00' }),
    ].map(Object.freeze));

    const first = deriver.build(entries, { now: at('10:20') });
    const second = deriver.build(entries, { now: at('10:21') });

    assert.equal(deriver.getCacheStats().snapshotBuilds, 1);
    assert.equal(first.focused.taskUid, 'focused');
    assert.equal(first.recent[0].remainingMinutes, 35);
    assert.equal(second.focused.taskUid, 'focused');
    assert.equal(second.recent[0].remainingMinutes, 34);

    const refreshedSnapshot = entries.slice();
    const refreshed = deriver.build(refreshedSnapshot, { now: at('10:21') });

    assert.equal(deriver.getCacheStats().snapshotBuilds, 2);
    assert.equal(refreshed.focused.taskUid, 'focused');
    assert.equal(refreshed.recent[0].remainingMinutes, 34);
});

test('Active Work scales repeated ticks by indexing a large snapshot once', () => {
    const deriver = createActiveWorkDeriver();
    const entries = [];
    for (let index = 0; index < 10_000; index += 1) {
        const start = new Date(Date.parse('2026-08-17T09:00:00') + index * 60_000);
        const end = new Date(start.getTime() + 30_000);
        entries.push({
            taskUid: `task-${index % 1_000}`,
            start,
            end,
            running: false,
            minutes: 1,
        });
    }
    entries.push({
        taskUid: 'focused',
        start: new Date('2026-08-17T12:00:00'),
        end: null,
        running: true,
        minutes: null,
    });

    let model;
    for (let tick = 0; tick < 60; tick += 1) {
        model = deriver.build(entries, {
            now: new Date('2026-08-17T12:00:00').getTime() + tick * 1_000,
        });
    }

    assert.equal(model.focused.taskUid, 'focused');
    assert.equal(deriver.getCacheStats().snapshotBuilds, 1);

    deriver.build(entries.slice(), { now: new Date('2026-08-17T12:01:00') });
    assert.equal(deriver.getCacheStats().snapshotBuilds, 2);
});

test('Open Line minutes use ceiling semantics and disappear at the exact boundary', () => {
    const ended = new Date('2026-08-17T10:00:00.000');
    const line = { end: ended };
    assert.equal(openLineMinutesLeft(line, new Date('2026-08-17T10:00:00.001')), 45);
    assert.equal(openLineMinutesLeft(line, new Date('2026-08-17T10:44:59.999')), 1);
    assert.equal(openLineMinutesLeft(line, new Date('2026-08-17T10:45:00.000')), 0);
    assert.equal(
        buildActiveWork(
            [{ ...entry({ taskUid: 'boundary', start: '09:00', end: '10:00' }), end: ended }],
            { now: new Date('2026-08-17T10:45:00.000') }
        ).count,
        0
    );
});
