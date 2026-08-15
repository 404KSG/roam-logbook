/**
 * Durable bulk pause/resume for running tasks.
 *
 * A pause closes real CLOCK entries, so paused time never accrues. The graph-scoped
 * settings record stores the recoverable Pause Batch and any in-flight Resume
 * association needed to survive a reload between graph and Pomodoro writes.
 */

import * as clock from './clock.js';
import { taskTitle } from './org.js';
import * as pomodoro from './pomodoro.js';
import { STATE_FORMATS } from './version.js';
import { getBlockString, GraphReadError } from './roam.js';
import {
    allowMultipleClocks,
    readSetting,
    SETTING_MULTIPLE,
    SETTING_PAUSED_BATCH,
    preserveStateBackup,
    writeSetting,
} from './settings.js';

const VERSION = STATE_FORMATS.pauseBatch;
const LEGACY_VERSION = 1;
let items = [];
let pendingResume = [];
let notice = '';
let unsupportedRaw = null;
const listeners = new Set();

const cleanRecord = value => {
    if (!value || typeof value !== 'object') return null;
    const taskUid = typeof value.taskUid === 'string' ? value.taskUid.trim() : '';
    const title = typeof value.title === 'string' ? value.title : '';
    const pausedAtMs = Number(value.pausedAtMs);
    const remaining = value.pomodoroRemainingMs;
    const pomodoroRemainingMs = remaining === null || remaining === undefined ? null : Number(remaining);
    const pomodoroSuppressed = value.pomodoroSuppressed === true;
    const clockUid = typeof value.clockUid === 'string' && value.clockUid ? value.clockUid : null;
    if (!taskUid || !Number.isFinite(pausedAtMs) || pausedAtMs < 0) return null;
    if (
        pomodoroRemainingMs !== null &&
        (!Number.isFinite(pomodoroRemainingMs) || pomodoroRemainingMs <= 0)
    ) {
        return null;
    }
    return { taskUid, title, pausedAtMs, pomodoroRemainingMs, pomodoroSuppressed, ...(clockUid ? { clockUid } : {}) };
};

const cleanPending = (value, { version = VERSION, legacy = false } = {}) => {
    const record = cleanRecord(value);
    if (!record) return null;
    const clockUid = typeof value.clockUid === 'string' && value.clockUid ? value.clockUid : null;
    const explicitLegacy =
        legacy || value.legacy === true || Number(value.sourceVersion) === LEGACY_VERSION;
    const sourceVersion = explicitLegacy
        ? LEGACY_VERSION
        : Number.isInteger(Number(value.sourceVersion))
          ? Number(value.sourceVersion)
          : version;
    return {
        ...record,
        clockUid,
        legacy: explicitLegacy,
        sourceVersion,
        ...(clockUid
            ? {}
            : {
                  recoveryState: explicitLegacy ? 'legacy-fallback' : 'conflict',
                  ...(explicitLegacy ? {} : { recoveryIssue: 'missing-clockUid' }),
              }),
    };
};

const serialized = () =>
    JSON.stringify({
        version: VERSION,
        data: {
            items,
            pendingResume,
        },
    });

function persist() {
    if (unsupportedRaw !== null) return false;
    writeSetting(SETTING_PAUSED_BATCH, serialized());
    return true;
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

export function getPendingResume() {
    return pendingResume.map(item => ({ ...item }));
}

export function getNotice() {
    return notice;
}

/** Load the current version, migrating the original version-1 shape safely. */
export function load() {
    items = [];
    pendingResume = [];
    notice = '';
    unsupportedRaw = null;
    const raw = readSetting(SETTING_PAUSED_BATCH);
    if (!raw) return getPaused();

    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (parsed?.version === VERSION && parsed.data && Array.isArray(parsed.data.items)) {
            const loadedItems = parsed.data.items.map(cleanRecord);
            const loadedPending = Array.isArray(parsed.data.pendingResume)
                ? parsed.data.pendingResume.map(value => cleanPending(value, { version: VERSION }))
                : [];
            if (loadedItems.some(item => !item) || loadedPending.some(item => !item)) {
                throw new Error('invalid paused-task record');
            }
            const byTask = new Map(loadedItems.map(item => [item.taskUid, item]));
            const pendingByTask = new Map(loadedPending.map(item => [item.taskUid, item]));
            items = [...byTask.values()];
            pendingResume = [...pendingByTask.values()];
            if (pendingResume.some(item => item.recoveryState === 'conflict')) {
                const firstWarning = preserveStateBackup(SETTING_PAUSED_BATCH, raw);
                notice = firstWarning
                    ? 'A current pending Resume has no exact Session association; it was retained as a conflict.'
                    : '';
            }
            return getPaused();
        }
        if (parsed?.version === LEGACY_VERSION && Array.isArray(parsed.items)) {
            const loaded = parsed.items.map(cleanRecord);
            const loadedPending = Array.isArray(parsed.pendingResume)
                ? parsed.pendingResume.map(value =>
                      cleanPending(value, { version: LEGACY_VERSION, legacy: true })
                  )
                : [];
            if (loaded.some(item => !item) || loadedPending.some(item => !item)) {
                throw new Error('invalid legacy paused-task record');
            }
            items = [...new Map(loaded.map(item => [item.taskUid, item])).values()];
            pendingResume = [...new Map(loadedPending.map(item => [item.taskUid, item])).values()];
            persist();
            return getPaused();
        }
        throw new Error('unsupported paused-batch version');
    } catch (error) {
        unsupportedRaw = raw;
        const firstWarning = preserveStateBackup(SETTING_PAUSED_BATCH, raw);
        notice = firstWarning
            ? 'Saved paused-task state uses an unsupported or invalid version and was kept.'
            : '';
        if (firstWarning) console.warn('[roam-logbook] could not read paused task state', error);
        return getPaused();
    }
}

const pomodoroSnapshot = (entry, nowMs) => {
    const targetMs = pomodoro.targetDurationMs(entry.clockUid);
    if (targetMs === null) {
        return {
            pomodoroRemainingMs: null,
            pomodoroSuppressed: pomodoro.isAssigned(entry.clockUid),
        };
    }
    const remaining = targetMs - Math.max(0, nowMs - entry.start.getTime());
    return {
        pomodoroRemainingMs: remaining > 0 ? remaining : null,
        pomodoroSuppressed: remaining <= 0,
    };
};

/** Close every current CLOCK while preserving enough state for a later resume. */
export async function pauseAll({ now = new Date() } = {}) {
    if (unsupportedRaw !== null) {
        notice = 'Saved paused-task state is unsupported; no Tasks were paused.';
        notify();
        return { paused: 0, failed: 0, uncertain: true };
    }

    notice = '';
    const originalItems = items.map(item => ({ ...item }));
    let previous;
    try {
        previous = new Map(
            items.map(item => {
                const taskUid = clock.resolveTaskUid(item.taskUid) || item.taskUid;
                return [taskUid, { ...item, taskUid }];
            })
        );
    } catch {
        notice = clock.getNotice() || 'Unable to pause Tasks because the graph is unavailable.';
        notify();
        return { paused: 0, failed: 0, uncertain: true };
    }
    const merged = new Map(previous);
    let outcome;
    try {
        outcome = await clock.pauseEntries({
            now,
            prepare: entries => {
                const snapshots = entries.map(entry => ({
                    taskUid: entry.taskUid,
                    title: entry.title,
                    pausedAtMs: now.getTime(),
                    ...pomodoroSnapshot(entry, now.getTime()),
                    clockUid: entry.clockUid,
                }));
                // Persist before the first graph mutation. A reload then has the
                // durable intent even if a later CLOCK update fails.
                for (const snapshot of snapshots) {
                    const { clockUid: _clockUid, ...record } = snapshot;
                    merged.set(record.taskUid, record);
                }
                items = [...merged.values()];
                persist();
                return snapshots;
            },
        });
    } catch {
        items = originalItems;
        notice = clock.getNotice() || 'Unable to pause Tasks because the graph is unavailable.';
        notify();
        return { paused: 0, failed: 0, uncertain: true };
    }

    let failed = 0;
    const byClockUid = new Map(outcome.results.map(result => [result.clockUid, result]));
    for (const snapshot of outcome.records) {
        const result = byClockUid.get(snapshot.clockUid);
        if (result?.closed) continue;
        failed += 1;
        if (previous.has(snapshot.taskUid)) merged.set(snapshot.taskUid, previous.get(snapshot.taskUid));
        else merged.delete(snapshot.taskUid);
        console.error('[roam-logbook] could not pause task', snapshot.taskUid, result?.error);
    }

    items = [...merged.values()];
    if (outcome.uncertain) {
        notice = clock.GRAPH_UNCERTAIN;
    } else if (failed > 0) {
        notice = `${failed} Task${failed === 1 ? '' : 's'} could not be paused.`;
    }
    persist();
    notify();
    return {
        paused: outcome.closed,
        failed,
        uncertain: Boolean(outcome.uncertain),
        partial: Boolean(outcome.partial),
        retry: outcome.retry,
    };
}

const existingTask = record => {
    try {
        const taskUid = clock.resolveTaskUid(record.taskUid);
        const string = getBlockString(taskUid);
        return string === null ? null : { ...record, taskUid, title: taskTitle(string) || record.title };
    } catch (error) {
        if (error instanceof GraphReadError) return { uncertain: true, error };
        throw error;
    }
};

const applyPomodoro = record => {
    if (record.pomodoroRemainingMs) {
        if (!pomodoro.startDurationMs(record.clockUid, record.pomodoroRemainingMs)) {
            throw new Error('Pomodoro remainder could not be saved.');
        }
    } else if (record.pomodoroSuppressed) {
        if (!pomodoro.suppress(record.clockUid)) throw new Error('Pomodoro suppression could not be saved.');
    }
};

const removeTask = taskUid => {
    items = items.filter(item => item.taskUid !== taskUid);
};

/**
 * Complete durable Resume associations that survived a reload or an interrupted
 * Pomodoro write. This function never creates a CLOCK: a pending clockUid is an
 * exact foreign-key-like association, and a missing exact Session is a conflict.
 * Only legacy records without a clockUid may be scheduled for a fresh resume.
 */
async function recoverPending({ running = [] } = {}) {
    let recovered = 0;
    let failed = 0;
    let legacyRecovered = 0;
    const conflicts = [];
    const legacyToCreate = [];
    const byClockUid = new Map(running.map(entry => [entry.clockUid, entry]));

    for (const pending of [...pendingResume]) {
        let entry = null;
        if (pending.clockUid) {
            entry = byClockUid.get(pending.clockUid) || null;
            if (!entry || entry.taskUid !== pending.taskUid) {
                conflicts.push({
                    taskUid: pending.taskUid,
                    clockUid: pending.clockUid,
                    reason: 'exact Session association is missing or belongs to another Task',
                });
                continue;
            }
        } else if (pending.legacy === true) {
            const matches = running.filter(item => item.taskUid === pending.taskUid);
            if (matches.length === 1) entry = matches[0];
            else if (matches.length > 1) {
                conflicts.push({
                    taskUid: pending.taskUid,
                    reason: 'legacy pending record matched more than one running Session',
                });
                continue;
            } else {
                legacyToCreate.push(pending);
                continue;
            }
        } else {
            conflicts.push({
                taskUid: pending.taskUid,
                reason: 'current pending Resume has no clockUid; exact Session association is required',
            });
            continue;
        }

        try {
            applyPomodoro({ ...pending, clockUid: entry.clockUid });
            pendingResume = pendingResume.filter(item => item.taskUid !== pending.taskUid);
            removeTask(pending.taskUid);
            persist();
            recovered += 1;
            if (pending.legacy === true) legacyRecovered += 1;
        } catch (error) {
            failed += 1;
            console.error('[roam-logbook] could not recover paused task', pending.taskUid, error);
        }
    }
    return { recovered, failed, conflicts, legacyToCreate, legacyRecovered };
}

const pendingTasks = () => new Set(pendingResume.map(item => item.taskUid));

/** Start a fresh CLOCK and make its recovery association durable before migration. */
async function resumeRecord(record, now) {
    let pending = pendingResume.find(item => item.taskUid === record.taskUid);
    let createdPending = false;
    if (!pending) {
        pending = {
            ...record,
            clockUid: null,
            legacy: false,
            sourceVersion: VERSION,
            recoveryState: 'in-flight',
        };
        pendingResume.push(pending);
        persist();
        createdPending = true;
    }

    let entry = pending.clockUid
        ? clock.getRunning().find(item => item.clockUid === pending.clockUid)
        : pending.legacy === true
          ? clock.getRunning().find(item => item.taskUid === record.taskUid)
          : null;
    if (pending.clockUid && (!entry || entry.taskUid !== record.taskUid)) {
        const conflict = new Error(
            `Resume conflict for ${record.taskUid}: exact Session ${pending.clockUid} is unavailable.`
        );
        conflict.conflict = true;
        throw conflict;
    }
    if (!pending.clockUid && !pending.legacy && !createdPending) {
        const conflict = new Error(
            `Resume conflict for ${record.taskUid}: current pending Resume has no exact clockUid.`
        );
        conflict.conflict = true;
        throw conflict;
    }
    if (!entry) {
        const result = await clock.clockIn(record.taskUid, { now });
        if (result?.uncertain) {
            if (result.clockUid) {
                pending.clockUid = result.clockUid;
                persist();
            }
            const uncertain = new Error(result.notice || clock.getNotice());
            uncertain.uncertain = true;
            throw uncertain;
        }
        entry = clock.getRunning().find(item => item.clockUid === result.clockUid) || result;
    }
    pending.clockUid = entry.clockUid;
    pending.legacy = false;
    pending.sourceVersion = VERSION;
    delete pending.recoveryState;
    delete pending.recoveryIssue;
    // This write is intentionally before the Pomodoro migration. If the next
    // line fails, reload can find this exact Session and finish it.
    persist();

    applyPomodoro({ ...record, clockUid: entry.clockUid });
    pendingResume = pendingResume.filter(item => item.taskUid !== record.taskUid);
    removeTask(record.taskUid);
    persist();
    return entry;
}

/** Start a fresh CLOCK for each valid paused task and consume successful records. */
export async function resumeAll({ now = new Date() } = {}) {
    if (unsupportedRaw !== null) {
        notice = 'Saved paused-task state is unsupported; no Tasks were resumed.';
        notify();
        return { resumed: 0, failed: 0, pruned: 0, satisfied: 0, blocked: true };
    }

    notice = '';
    // Read the complete graph snapshot before planning any CLOCK writes. The
    // multiple-clock setting must be enabled before the first resume so a batch
    // cannot make its own later Sessions clock one another out.
    const initial = clock.refreshResult();
    if (!initial.ok) {
        notice = clock.getNotice() || 'Graph state could not be confirmed; no further changes were made.';
        notify();
        return {
            resumed: 0,
            failed: pendingResume.length + items.length,
            pruned: 0,
            satisfied: 0,
            blocked: true,
            uncertain: true,
        };
    }

    const recovered = await recoverPending({ running: initial.running });
    const runningEntries = clock.getRunning();
    const runningTasks = new Set(runningEntries.map(entry => entry.taskUid));
    const retained = [];
    const ready = [];
    const plannedTasks = new Set();
    const blockedPending = pendingTasks();
    let pruned = 0;
    let satisfied = 0;
    let uncertain = 0;

    for (const pending of recovered.legacyToCreate) {
        const valid = existingTask(pending);
        if (valid?.uncertain) {
            uncertain += 1;
            continue;
        }
        if (!valid) {
            recovered.conflicts.push({
                taskUid: pending.taskUid,
                reason: 'legacy pending Task could not be found',
            });
            continue;
        }
        if (!plannedTasks.has(valid.taskUid)) {
            plannedTasks.add(valid.taskUid);
            ready.push(valid);
        }
    }

    for (const record of [...items]) {
        const valid = existingTask(record);
        if (valid?.uncertain) {
            uncertain += 1;
            retained.push(record);
            continue;
        }
        if (!valid) {
            pruned += 1;
            continue;
        }
        if (blockedPending.has(valid.taskUid)) {
            retained.push(valid);
            continue;
        }
        if (runningTasks.has(valid.taskUid) || plannedTasks.has(valid.taskUid)) {
            satisfied += 1;
            continue;
        }
        plannedTasks.add(valid.taskUid);
        ready.push(valid);
    }

    const needsMultiple = ready.length > 1 || (ready.length > 0 && runningEntries.length > 0);
    let enabledMultiple = false;
    if (needsMultiple && !allowMultipleClocks()) {
        try {
            writeSetting(SETTING_MULTIPLE, true);
        } catch (error) {
            console.error('[roam-logbook] could not enable multiple clocks for Resume All', error);
        }
        if (!allowMultipleClocks()) {
            notice = 'Multiple clocks could not be enabled; no paused Tasks were resumed.';
            items = [...retained, ...ready];
            persist();
            notify();
            return {
                resumed: recovered.recovered,
                failed: recovered.failed + recovered.conflicts.length,
                pruned,
                satisfied,
                blocked: true,
                conflicts: recovered.conflicts,
            };
        }
        enabledMultiple = true;
    }

    let resumed = recovered.recovered;
    let failed = recovered.failed + uncertain + recovered.conflicts.length;
    let legacyRecovered = recovered.legacyRecovered;
    const legacyRecovery =
        recovered.legacyRecovered > 0 || recovered.legacyToCreate.length > 0;
    const completedTasks = new Set();
    for (const record of ready) {
        try {
            await resumeRecord(record, now);
            resumed += 1;
            if (record.legacy === true) legacyRecovered += 1;
            completedTasks.add(record.taskUid);
        } catch (error) {
            failed += 1;
            retained.push(record);
            console.error('[roam-logbook] could not resume task', record.taskUid, error);
            if (error?.uncertain) {
                // The graph may contain the just-created CLOCK, but the read
                // could not confirm it. Do not perform another destructive step.
                for (const remaining of ready.slice(ready.indexOf(record) + 1)) retained.push(remaining);
                break;
            }
        }
    }

    items = retained.filter(item => !completedTasks.has(item.taskUid));
    const messages = [];
    if (enabledMultiple) messages.push(`Multiple clocks were enabled to resume ${ready.length} Tasks.`);
    if (pruned > 0) messages.push(`${pruned} missing Task${pruned === 1 ? ' was' : 's were'} removed.`);
    if (failed > 0) messages.push(`${failed} Task${failed === 1 ? '' : 's'} could not be resumed.`);
    if (uncertain > 0) {
        messages.push(
            `${uncertain} Task${uncertain === 1 ? '' : 's'} could not be confirmed because the graph is unavailable.`
        );
    }
    if (recovered.conflicts.length > 0) {
        messages.push(
            `${recovered.conflicts.length} pending Resume conflict${recovered.conflicts.length === 1 ? '' : 's'} were retained; exact Session associations were not changed.`
        );
    }
    if (legacyRecovery) {
        messages.push('Legacy Resume recovery used explicit Task matching.');
    }
    notice = messages.join(' ');
    persist();
    notify();
    return {
        resumed,
        failed,
        pruned,
        satisfied,
        blocked: false,
        legacyRecovery,
        legacyRecovered,
    };
}

/**
 * Permanent bulk finish. Pause state is cleared only after every target closes;
 * failed running tasks become a precise retryable Pause Batch entry.
 */
export async function clockOutAll({ now = new Date() } = {}) {
    let outcome;
    try {
        outcome = await clock.clockOutEntries(null, { now });
    } catch {
        notice = clock.getNotice() || 'Unable to finish Sessions because the graph is unavailable.';
        notify();
        return 0;
    }

    const closedUids = new Set(
        outcome.results.filter(result => result.closed).map(result => result.clockUid)
    );
    const stillRunning = (outcome.entries || clock.getRunning()).filter(
        entry => entry.running && !closedUids.has(entry.clockUid)
    );
    if (!outcome.uncertain && outcome.failed === 0 && stillRunning.length === 0) {
        items = [];
        pendingResume = [];
        notice = '';
        persist();
        notify();
        return outcome.closed;
    }

    const retained = new Map(
        items.filter(item => stillRunning.some(entry => entry.taskUid === item.taskUid)).map(item => [item.taskUid, item])
    );
    for (const entry of stillRunning) {
        retained.set(entry.taskUid, {
            taskUid: entry.taskUid,
            title: entry.title,
            pausedAtMs: now.getTime(),
            ...pomodoroSnapshot(entry, now.getTime()),
            clockUid: entry.clockUid,
        });
    }
    items = [...retained.values()];
    pendingResume = pendingResume.filter(item => stillRunning.some(entry => entry.taskUid === item.taskUid));
    notice = outcome.uncertain
        ? clock.GRAPH_UNCERTAIN
        : `${stillRunning.length} Session${stillRunning.length === 1 ? '' : 's'} could not be closed.`;
    persist();
    notify();
    return outcome.uncertain ? { ...outcome, retry: outcome.retry } : outcome.closed;
}

export function clear() {
    if (unsupportedRaw !== null) {
        notice = 'Saved paused-task state is unsupported and was kept.';
        notify();
        return false;
    }
    items = [];
    pendingResume = [];
    notice = '';
    persist();
    notify();
    return true;
}

/** Drop only in-memory state and subscriptions; persisted pause survives reload. */
export function reset() {
    items = [];
    pendingResume = [];
    notice = '';
    unsupportedRaw = null;
    listeners.clear();
}
