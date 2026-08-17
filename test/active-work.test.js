import test from 'node:test';
import assert from 'node:assert/strict';

import {
    ACTIVE_WORK_WINDOW_MINUTES,
    buildActiveWork,
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
});

test('pure Recent Active Work expires without a running clock', () => {
    const entries = [entry({ taskUid: 'recent', start: '09:00', end: '10:00' })];
    assert.equal(buildActiveWork(entries, { now: at('10:44') }).count, 1);
    assert.equal(buildActiveWork(entries, { now: at('10:45') }).count, 0);
});
