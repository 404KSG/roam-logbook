/**
 * Durable bulk pause/resume for running tasks.
 *
 * A pause closes real CLOCK entries, so paused time never accrues. The small
 * graph-scoped settings record remembers which tasks should receive a fresh
 * session on resume, plus any exact Pomodoro remainder.
 */

import * as clock from './clock.js';
import { taskTitle } from './org.js';
import * as pomodoro from './pomodoro.js';
import { getBlockString } from './roam.js';
import {
    allowMultipleClocks,
    readSetting,
    SETTING_PAUSED_BATCH,
    writeSetting,
} from './settings.js';

const VERSION = 1;
let items = [];
let notice = '';
const listeners = new Set();

const cleanRecord = value => {
    if (!value || typeof value !== 'object') return null;
    const taskUid = typeof value.taskUid === 'string' ? value.taskUid.trim() : '';
    const title = typeof value.title === 'string' ? value.title : '';
    const pausedAtMs = Number(value.pausedAtMs);
    const remaining = value.pomodoroRemainingMs;
    const pomodoroRemainingMs = remaining === null || remaining === undefined ? null : Number(remaining);
    if (!taskUid || !Number.isFinite(pausedAtMs) || pausedAtMs < 0) return null;
    if (
        pomodoroRemainingMs !== null &&
        (!Number.isFinite(pomodoroRemainingMs) || pomodoroRemainingMs <= 0)
    ) {
        return null;
    }
    return { taskUid, title, pausedAtMs, pomodoroRemainingMs };
};

const serialized = () => JSON.stringify({ version: VERSION, items });

function persist() {
    writeSetting(SETTING_PAUSED_BATCH, serialized());
}

function notify() {
    for (const listener of listeners) {
        try {
            listener(getPaused());
        } catch (error) {
            console.error('[roam-logbook] paused-batch listener failed', error);
        }
    }
}

export function subscribe(listener) {
    listeners.add(listener);
    listener(getPaused());
    return () => listeners.delete(listener);
}

export function getPaused() {
    return items.map(item => ({ ...item }));
}

export function getNotice() {
    return notice;
}

/** Load one validated, de-duplicated batch. Invalid settings become empty. */
export function load() {
    items = [];
    notice = '';
    const raw = readSetting(SETTING_PAUSED_BATCH);
    if (!raw) return items;
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!parsed || parsed.version !== VERSION || !Array.isArray(parsed.items)) {
            throw new Error('unsupported paused-batch shape');
        }
        const byTask = new Map();
        for (const value of parsed.items) {
            const record = cleanRecord(value);
            if (!record) throw new Error('invalid paused task record');
            byTask.set(record.taskUid, record);
        }
        items = [...byTask.values()];
    } catch (error) {
        notice = 'Saved paused-task state was invalid and has been discarded.';
        console.warn('[roam-logbook] could not read paused task state', error);
        persist();
    }
    return getPaused();
}

const exactRemainder = (entry, nowMs) => {
    const targetMs = pomodoro.targetDurationMs(entry.clockUid);
    if (targetMs === null) return null;
    const remaining = targetMs - Math.max(0, nowMs - entry.start.getTime());
    return remaining > 0 ? remaining : null;
};

/** Close every current CLOCK while preserving enough state for a later resume. */
export async function pauseAll({ now = new Date() } = {}) {
    const running = clock.getRunning().slice();
    if (running.length === 0) return { paused: 0, failed: 0 };

    notice = '';
    const previous = new Map(
        items.map(item => {
            const taskUid = clock.resolveTaskUid(item.taskUid) || item.taskUid;
            return [taskUid, { ...item, taskUid }];
        })
    );
    const merged = new Map(previous);
    const snapshots = running.map(entry => ({
        taskUid: entry.taskUid,
        title: entry.title,
        pausedAtMs: now.getTime(),
        pomodoroRemainingMs: exactRemainder(entry, now.getTime()),
        clockUid: entry.clockUid,
    }));

    // Persist before mutating the graph. If Roam closes between these writes,
    // resume sees an already-running task as satisfied instead of duplicating it.
    for (const { clockUid: _clockUid, ...record } of snapshots) {
        merged.set(record.taskUid, record);
    }
    items = [...merged.values()];
    persist();

    let paused = 0;
    let failed = 0;
    for (const snapshot of snapshots) {
        try {
            if (await clock.clockOut(snapshot.clockUid, { now })) {
                paused += 1;
            } else {
                failed += 1;
                if (previous.has(snapshot.taskUid)) merged.set(snapshot.taskUid, previous.get(snapshot.taskUid));
                else merged.delete(snapshot.taskUid);
            }
        } catch (error) {
            failed += 1;
            if (previous.has(snapshot.taskUid)) merged.set(snapshot.taskUid, previous.get(snapshot.taskUid));
            else merged.delete(snapshot.taskUid);
            console.error('[roam-logbook] could not pause task', snapshot.taskUid, error);
        }
    }

    items = [...merged.values()];
    if (failed > 0) notice = `${failed} Task${failed === 1 ? '' : 's'} could not be paused.`;
    persist();
    notify();
    return { paused, failed };
}

const existingTask = record => {
    const taskUid = clock.resolveTaskUid(record.taskUid);
    const string = getBlockString(taskUid);
    return string === null ? null : { ...record, taskUid, title: taskTitle(string) || record.title };
};

/** Explain the all-or-nothing single-clock guard without changing persisted state. */
export function resumeBlockReason() {
    if (allowMultipleClocks()) return '';
    const runningTasks = new Set(clock.getRunning().map(entry => entry.taskUid));
    const valid = new Set(
        items.map(existingTask).filter(Boolean).map(item => item.taskUid).filter(uid => !runningTasks.has(uid))
    );
    if (valid.size > 1 || (valid.size > 0 && runningTasks.size > 0)) {
        return 'Enable “Allow multiple clocks at once” in Logbook settings to resume this batch.';
    }
    return '';
}

/** Start a fresh CLOCK for each valid paused task and consume successful records. */
export async function resumeAll({ now = new Date() } = {}) {
    notice = '';
    const runningTasks = new Set(clock.getRunning().map(entry => entry.taskUid));
    const retained = [];
    const ready = [];
    const plannedTasks = new Set();
    let pruned = 0;
    let satisfied = 0;

    for (const record of items) {
        const valid = existingTask(record);
        if (!valid) {
            pruned += 1;
            continue;
        }
        if (runningTasks.has(valid.taskUid) || plannedTasks.has(valid.taskUid)) {
            satisfied += 1;
            continue;
        }
        plannedTasks.add(valid.taskUid);
        ready.push(valid);
    }

    if (!allowMultipleClocks() && (ready.length > 1 || (ready.length > 0 && runningTasks.size > 0))) {
        notice = 'Enable “Allow multiple clocks at once” in Logbook settings to resume this batch.';
        if (pruned > 0) notice += ` ${pruned} missing Task${pruned === 1 ? ' was' : 's were'} removed.`;
        items = [...ready];
        persist();
        notify();
        return { resumed: 0, failed: 0, pruned, satisfied, blocked: true };
    }

    let resumed = 0;
    let failed = 0;
    for (const record of ready) {
        try {
            const result = await clock.clockIn(record.taskUid, { now });
            if (record.pomodoroRemainingMs) {
                pomodoro.startDurationMs(result.clockUid, record.pomodoroRemainingMs);
            }
            resumed += 1;
        } catch (error) {
            failed += 1;
            retained.push(record);
            console.error('[roam-logbook] could not resume task', record.taskUid, error);
        }
    }

    items = retained;
    const messages = [];
    if (pruned > 0) messages.push(`${pruned} missing Task${pruned === 1 ? ' was' : 's were'} removed.`);
    if (failed > 0) messages.push(`${failed} Task${failed === 1 ? '' : 's'} could not be resumed.`);
    notice = messages.join(' ');
    persist();
    notify();
    return { resumed, failed, pruned, satisfied, blocked: false };
}

export function clear() {
    items = [];
    notice = '';
    persist();
    notify();
}

/** Permanent bulk finish: unlike Pause All, no task remains resumable. */
export async function clockOutAll({ now = new Date() } = {}) {
    clear();
    return clock.clockOutAll({ now });
}

/** Drop only in-memory state and subscriptions; persisted pause survives reload. */
export function reset() {
    items = [];
    notice = '';
    listeners.clear();
}
