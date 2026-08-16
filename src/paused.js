/**
 * Durable bulk pause/resume for running tasks.
 *
 * A pause closes real CLOCK entries, so paused time never accrues. The graph-scoped
 * settings record stores the recoverable Pause Batch and any in-flight Resume
 * association needed to survive a reload between graph and state writes. A
 * Resume starts a new shared Pomodoro cycle; old per-clock remainder fields are
 * migrated away without touching CLOCK records.
 */

import * as clock from './clock.js';
import { taskTitle } from './org.js';
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
let finalizing = null;
let notice = '';
let unsupportedRaw = null;
const listeners = new Set();
let unsubscribeClockActions = null;

const cleanRecord = value => {
    if (!value || typeof value !== 'object') return null;
    const taskUid = typeof value.taskUid === 'string' ? value.taskUid.trim() : '';
    const title = typeof value.title === 'string' ? value.title : '';
    const pausedAtMs = Number(value.pausedAtMs);
    const clockUid = typeof value.clockUid === 'string' && value.clockUid ? value.clockUid : null;
    const reconciliationState =
        value.reconciliationState === 'externally-replaced' ||
        value.reconciliationState === 'externally-clocked-out'
            ? value.reconciliationState
            : null;
    const externalClockUid =
        typeof value.externalClockUid === 'string' && value.externalClockUid
            ? value.externalClockUid
            : null;
    if (!taskUid || !Number.isFinite(pausedAtMs) || pausedAtMs < 0) return null;
    return {
        taskUid,
        title,
        pausedAtMs,
        ...(clockUid ? { clockUid } : {}),
        ...(reconciliationState ? { reconciliationState } : {}),
        ...(externalClockUid ? { externalClockUid } : {}),
    };
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

const hasLegacyPomodoroFields = value =>
    Boolean(value && ('pomodoroRemainingMs' in value || 'pomodoroSuppressed' in value));

const cleanFinalizing = value => {
    if (!value || typeof value !== 'object' || value.action !== 'clock-out-all') return null;
    if (!Array.isArray(value.targets)) return null;
    const targets = [];
    for (const target of value.targets) {
        if (!target || typeof target.taskUid !== 'string' || !target.taskUid) return null;
        if (typeof target.clockUid !== 'string' || !target.clockUid) return null;
        const key = `${target.taskUid}\u0000${target.clockUid}`;
        if (targets.some(item => `${item.taskUid}\u0000${item.clockUid}` === key)) continue;
        targets.push({ taskUid: target.taskUid, clockUid: target.clockUid });
    }
    return { action: 'clock-out-all', targets };
};

const serialized = () =>
    JSON.stringify({
        version: VERSION,
        data: {
            items,
            pendingResume,
            ...(finalizing ? { finalizing } : {}),
        },
    });

function persist() {
    if (unsupportedRaw !== null) return false;
    try {
        writeSetting(SETTING_PAUSED_BATCH, serialized());
        return true;
    } catch (error) {
        notice ||= 'Pause Batch could not be saved yet; its recovery state was retained.';
        console.warn('[roam-logbook] could not persist Pause Batch', error);
        return false;
    }
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

const handleClockAction = action => {
    if (!action || action.source === 'pause' || action.source === 'resume') return;
    const item = items.find(record => record.taskUid === action.taskUid);
    if (!item) return;

    if (action.type === 'clock-in') {
        item.reconciliationState = 'externally-replaced';
        item.externalClockUid = action.clockUid;
        notice = 'A paused Session was replaced by explicit clock activity; Resume All will not duplicate it.';
        persist();
        notify();
        return;
    }
    if (action.type === 'clock-out' && item.externalClockUid === action.clockUid) {
        item.reconciliationState = 'externally-clocked-out';
        notice = 'A paused Session was explicitly clocked out; Resume All will not recreate it.';
        persist();
        notify();
    }
};

const ensureClockActionSubscription = () => {
    unsubscribeClockActions?.();
    unsubscribeClockActions = clock.subscribeActions(handleClockAction);
};

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

/**
 * Remove Pause Batch records whose Tasks were confirmed DONE by the caller.
 *
 * The completion coordinator supplies a confirmed scope; this API deliberately
 * does not infer hierarchy on its own. That keeps pause state changes aligned
 * with the same graph snapshot used before automatic Clock Out.
 */
export function pruneCompleted(taskUids = []) {
    const completedTaskUids = [...new Set(taskUids.filter(uid => typeof uid === 'string' && uid))];
    if (unsupportedRaw !== null) {
        notice = 'Saved paused-task state is unsupported; completed Tasks were not pruned.';
        notify();
        return {
            action: 'prune-completed-paused',
            ok: false,
            completedTaskUids,
            removed: 0,
            removedPaused: 0,
            removedPending: 0,
            uncertain: true,
            error: new Error(notice),
        };
    }

    const scope = new Set(completedTaskUids);
    const previousItems = items;
    const previousPending = pendingResume;
    items = items.filter(item => !scope.has(item.taskUid));
    pendingResume = pendingResume.filter(item => !scope.has(item.taskUid));
    const removedPaused = previousItems.length - items.length;
    const removedPending = previousPending.length - pendingResume.length;
    if (removedPaused > 0 || removedPending > 0) {
        notice = '';
        if (!persist()) {
            items = previousItems;
            pendingResume = previousPending;
            notice = 'Completed Tasks could not be removed from the saved Pause Batch; recovery state was kept.';
            notify();
            return {
                action: 'prune-completed-paused',
                ok: false,
                completedTaskUids,
                removed: 0,
                removedPaused: 0,
                removedPending: 0,
                uncertain: true,
                error: new Error(notice),
            };
        }
        notify();
    }
    return {
        action: 'prune-completed-paused',
        ok: true,
        completedTaskUids,
        removed: removedPaused + removedPending,
        removedPaused,
        removedPending,
        uncertain: false,
        error: null,
    };
}

export function getNotice() {
    return notice;
}

/** Load the current version, migrating the original version-1 shape safely. */
export function load() {
    items = [];
    pendingResume = [];
    finalizing = null;
    notice = '';
    unsupportedRaw = null;
    ensureClockActionSubscription();
    const raw = readSetting(SETTING_PAUSED_BATCH);
    if (!raw) return getPaused();

    let recoverableItems = [];
    let recoverablePending = [];
    let recoverableFinalizing = null;
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (parsed?.version === VERSION && parsed.data && Array.isArray(parsed.data.items)) {
            recoverableItems = parsed.data.items.map(cleanRecord).filter(Boolean);
            if ('pendingResume' in parsed.data && !Array.isArray(parsed.data.pendingResume)) {
                throw new Error('invalid pendingResume shape');
            }
            const needsMigration =
                parsed.data.items.some(hasLegacyPomodoroFields) ||
                (Array.isArray(parsed.data.pendingResume) && parsed.data.pendingResume.some(hasLegacyPomodoroFields));
            const loadedItems = parsed.data.items.map(cleanRecord);
            const loadedPending = Array.isArray(parsed.data.pendingResume)
                ? parsed.data.pendingResume.map(value => cleanPending(value, { version: VERSION }))
                : [];
            recoverablePending = loadedPending.filter(Boolean);
            if (loadedItems.some(item => !item) || loadedPending.some(item => !item)) {
                throw new Error('invalid paused-task record');
            }
            if ('finalizing' in parsed.data && parsed.data.finalizing !== null) {
                recoverableFinalizing = cleanFinalizing(parsed.data.finalizing);
                if (!recoverableFinalizing) throw new Error('invalid finalizing Pause Batch marker');
            }
            const byTask = new Map(loadedItems.map(item => [item.taskUid, item]));
            const pendingByTask = new Map(loadedPending.map(item => [item.taskUid, item]));
            items = [...byTask.values()];
            pendingResume = [...pendingByTask.values()];
            finalizing = recoverableFinalizing;
            if (pendingResume.some(item => item.recoveryState === 'conflict')) {
                const firstWarning = preserveStateBackup(SETTING_PAUSED_BATCH, raw);
                notice = firstWarning
                    ? 'A current pending Resume has no exact Session association; it was retained as a conflict.'
                    : '';
            }
            if (needsMigration) persist();
            return getPaused();
        }
        if (parsed?.version === LEGACY_VERSION && Array.isArray(parsed.items)) {
            recoverableItems = parsed.items.map(cleanRecord).filter(Boolean);
            const loaded = parsed.items.map(cleanRecord);
            const loadedPending = Array.isArray(parsed.pendingResume)
                ? parsed.pendingResume.map(value =>
                      cleanPending(value, { version: LEGACY_VERSION, legacy: true })
                  )
                : [];
            recoverablePending = loadedPending.filter(Boolean);
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
        items = [...new Map(recoverableItems.map(item => [item.taskUid, item])).values()];
        pendingResume = [...new Map(recoverablePending.map(item => [item.taskUid, item])).values()];
        finalizing = recoverableFinalizing;
        unsupportedRaw = raw;
        const firstWarning = preserveStateBackup(SETTING_PAUSED_BATCH, raw);
        notice = firstWarning
            ? 'Saved paused-task state uses an unsupported or invalid version and was kept.'
            : '';
        if (firstWarning) console.warn('[roam-logbook] could not read paused task state', error);
        return getPaused();
    }
}

const pausedRecord = snapshot => {
    const { clockUid: _clockUid, ...record } = snapshot;
    return record;
};

const pauseBatchResult = ({
    completed = 0,
    failed = 0,
    pendingClockUids = [],
    pendingTaskUids = [],
    uncertain = false,
    error = null,
    retry = null,
    ...extra
} = {}) => {
    const clockUids = [...new Set(pendingClockUids.filter(Boolean))];
    const taskUids = [...new Set(pendingTaskUids.filter(Boolean))];
    const incomplete = uncertain || failed > 0 || clockUids.length > 0 || taskUids.length > 0;
    return {
        action: 'pause-all',
        ok: !incomplete,
        paused: completed,
        count: completed,
        completed,
        failed,
        pending: Math.max(clockUids.length, taskUids.length),
        pendingClockUids: clockUids,
        pendingTaskUids: taskUids,
        uncertain: Boolean(uncertain),
        partial: Boolean(incomplete && completed > 0),
        retry:
            retry ||
            (incomplete
                ? { action: 'pause', retryClockUids: clockUids, retryTaskUids: taskUids }
                : null),
        error: error || (failed > 0 ? new Error('One or more Sessions could not be paused.') : null),
        item: 'Session',
        completedVerb: 'paused',
        ...extra,
    };
};

/** Close every current CLOCK while preserving enough state for a later resume. */
export async function pauseAll({ now = new Date() } = {}) {
    if (unsupportedRaw !== null) {
        notice = 'Saved paused-task state is unsupported; no Tasks were paused.';
        notify();
        return pauseBatchResult({
            failed: items.length,
            pendingTaskUids: items.map(item => item.taskUid),
            uncertain: true,
            error: new Error(notice),
        });
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
        const pendingClockUids = clock.getRunning().map(entry => entry.clockUid);
        const pendingTaskUids = clock.getRunning().map(entry => entry.taskUid);
        return pauseBatchResult({
            failed: pendingClockUids.length,
            pendingClockUids,
            pendingTaskUids,
            uncertain: true,
            error: new Error(notice),
        });
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
                    clockUid: entry.clockUid,
                }));
                // Persist before the first graph mutation. A reload then has the
                // durable intent even if a later CLOCK update fails.
                for (const snapshot of snapshots) {
                    const record = pausedRecord(snapshot);
                    merged.set(record.taskUid, record);
                }
                items = [...merged.values()];
                if (!persist()) {
                    const error = new Error(notice || 'Pause Batch could not be saved before closing Sessions.');
                    error.uncertain = true;
                    throw error;
                }
                return snapshots;
            },
        });
    } catch {
        items = originalItems;
        notice = clock.getNotice() || 'Unable to pause Tasks because the graph is unavailable.';
        notify();
        const pendingClockUids = clock.getRunning().map(entry => entry.clockUid);
        const pendingTaskUids = clock.getRunning().map(entry => entry.taskUid);
        return pauseBatchResult({
            failed: pendingClockUids.length,
            pendingClockUids,
            pendingTaskUids,
            uncertain: true,
            error: new Error(notice),
        });
    }

    if (outcome.preflight) {
        items = originalItems;
        notice = 'Pause Batch could not be saved before closing Sessions; no Session was changed.';
        notify();
        return pauseBatchResult({
            failed: outcome.pendingClockUids?.length || 0,
            pendingClockUids: outcome.pendingClockUids || [],
            pendingTaskUids: outcome.entries?.filter(entry => entry.running).map(entry => entry.taskUid) || [],
            uncertain: true,
            error: outcome.error || new Error(notice),
        });
    }

    let failed = 0;
    const byClockUid = new Map(outcome.results.map(result => [result.clockUid, result]));
    for (const snapshot of outcome.records) {
        const result = byClockUid.get(snapshot.clockUid);
        if (result?.closed) continue;
        failed += 1;
        if (previous.has(snapshot.taskUid)) merged.set(snapshot.taskUid, previous.get(snapshot.taskUid));
        else merged.set(snapshot.taskUid, pausedRecord(snapshot));
        console.error('[roam-logbook] could not pause task', snapshot.taskUid, result?.error);
    }

    items = [...merged.values()];
    if (outcome.uncertain) {
        notice = clock.GRAPH_UNCERTAIN;
    } else if (failed > 0) {
        notice = `${failed} Task${failed === 1 ? '' : 's'} could not be paused.`;
    }
    const persisted = persist();
    if (!persisted) notice ||= 'Pause Batch could not be saved yet; its recovery state was retained.';
    notify();
    const pendingSnapshots = outcome.records.filter(snapshot => {
        const result = byClockUid.get(snapshot.clockUid);
        return !result?.closed;
    });
    const pendingClockUids = pendingSnapshots.map(snapshot => snapshot.clockUid);
    const pendingTaskUids = pendingSnapshots.map(snapshot => snapshot.taskUid);
    const incomplete = Boolean(outcome.uncertain) || failed > 0 || pendingSnapshots.length > 0;
    return pauseBatchResult({
        completed: outcome.closed,
        failed,
        pendingClockUids,
        pendingTaskUids,
        uncertain: Boolean(outcome.uncertain || !persisted),
        retry: incomplete
            ? {
                  ...(outcome.retry || { action: 'pause' }),
                  action: 'pause',
                  retryClockUids: pendingClockUids,
                  retryTaskUids: pendingTaskUids,
              }
            : null,
        error:
            outcome.error ||
            pendingSnapshots.find(snapshot => byClockUid.get(snapshot.clockUid)?.error)?.error ||
            null,
    });
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

const removeTask = taskUid => {
    items = items.filter(item => item.taskUid !== taskUid);
};

/**
 * Complete durable Resume associations that survived a reload or an interrupted
 * state write. This function never creates a CLOCK: a pending clockUid is an
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

        pendingResume = pendingResume.filter(item => item.taskUid !== pending.taskUid);
        removeTask(pending.taskUid);
        persist();
        recovered += 1;
        if (pending.legacy === true) legacyRecovered += 1;
    }
    return { recovered, failed, conflicts, legacyToCreate, legacyRecovered };
}

const pendingTasks = () => new Set(pendingResume.map(item => item.taskUid));

/**
 * Finish the settings side of an interrupted Clock Out All commit from the
 * graph's confirmed running snapshot. A target that is no longer running is
 * permanently closed; only targets still open remain recoverable.
 */
function reconcileFinalizing({ running = [] } = {}) {
    if (!finalizing) return { ok: true, uncertain: false, activeTaskUids: [] };

    const runningByClock = new Map(running.map(entry => [entry.clockUid, entry]));
    const activeTargets = finalizing.targets.filter(target => {
        const entry = runningByClock.get(target.clockUid);
        return entry?.taskUid === target.taskUid;
    });
    const activeTaskUids = new Set(activeTargets.map(target => target.taskUid));
    const previousItems = items;
    const previousPending = pendingResume;
    const previousFinalizing = finalizing;
    items = items.filter(item => activeTaskUids.has(item.taskUid));
    pendingResume = pendingResume.filter(item => activeTaskUids.has(item.taskUid));
    finalizing = activeTargets.length > 0 ? { action: 'clock-out-all', targets: activeTargets } : null;

    const changed =
        previousItems.length !== items.length ||
        previousPending.length !== pendingResume.length ||
        JSON.stringify(previousFinalizing) !== JSON.stringify(finalizing);
    if (!changed) return { ok: true, uncertain: false, activeTaskUids: [...activeTaskUids] };

    if (!persist()) {
        items = previousItems;
        pendingResume = previousPending;
        finalizing = previousFinalizing;
        notice = 'Clock Out All was confirmed in the graph, but its recovery state could not be committed yet.';
        notify();
        return {
            ok: false,
            uncertain: true,
            activeTaskUids: [...activeTaskUids],
            error: new Error(notice),
        };
    }
    notify();
    return { ok: true, uncertain: false, activeTaskUids: [...activeTaskUids] };
}

const resumeBatchResult = ({
    completed = 0,
    failed = 0,
    pendingTaskUids = [],
    uncertain = false,
    blocked = false,
    error = null,
    retry = null,
    ...extra
} = {}) => {
    const pending = [...new Set(pendingTaskUids.filter(Boolean))];
    const incomplete = blocked || uncertain || failed > 0 || pending.length > 0;
    return {
        action: 'resume-all',
        ok: !incomplete,
        count: completed,
        completed,
        resumed: completed,
        failed,
        pending: pending.length,
        pendingTaskUids: pending,
        uncertain: Boolean(uncertain),
        partial: Boolean(incomplete && completed > 0),
        retry:
            retry || (incomplete ? { action: 'resume', retryTaskUids: pending } : null),
        error: error || (failed > 0 ? new Error('One or more Tasks could not be resumed.') : null),
        item: 'Task',
        completedVerb: 'resumed',
        blocked,
        ...extra,
    };
};

const resumeOneResult = ({
    completed = 0,
    failed = 0,
    pendingTaskUids = [],
    uncertain = false,
    error = null,
    retry = null,
    ...extra
} = {}) => {
    const pending = [...new Set(pendingTaskUids.filter(Boolean))];
    const incomplete = uncertain || failed > 0 || pending.length > 0;
    return {
        action: 'resume-one',
        ok: !incomplete,
        count: completed,
        completed,
        resumed: completed,
        failed,
        pending: pending.length,
        pendingTaskUids: pending,
        uncertain: Boolean(uncertain),
        partial: Boolean(incomplete && completed > 0),
        retry: retry || (incomplete ? { action: 'resume', retryTaskUids: pending } : null),
        error: error || (failed > 0 ? new Error('The Session could not be resumed.') : null),
        item: 'Session',
        completedVerb: 'resumed',
        ...extra,
    };
};

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
        let result;
        try {
            result = await clock.clockIn(record.taskUid, { now, source: 'resume' });
        } catch (error) {
            // A confirmed ordinary write failure did not create a Session. Drop
            // only this new in-flight marker so the Task can be retried; an
            // uncertain write keeps its exact marker for reload recovery.
            if (createdPending && !error?.uncertain) {
                pendingResume = pendingResume.filter(item => item.taskUid !== record.taskUid);
                persist();
            }
            throw error;
        }
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
    // This write is intentionally before consuming the Pause Batch item. If a
    // reload happens now, the exact Session association remains recoverable.
    persist();

    pendingResume = pendingResume.filter(item => item.taskUid !== record.taskUid);
    removeTask(record.taskUid);
    persist();
    return entry;
}

/** Resume one exact Pause Batch item without touching the remaining batch. */
export async function resumeOne(taskUid, { now = new Date() } = {}) {
    if (unsupportedRaw !== null) {
        notice = 'Saved paused-task state is unsupported; no Sessions were resumed.';
        notify();
        return resumeOneResult({
            failed: 1,
            pendingTaskUids: [taskUid],
            uncertain: true,
            error: new Error(notice),
        });
    }

    notice = '';
    const initial = clock.refreshResult();
    if (!initial.ok) {
        notice = clock.getNotice() || clock.GRAPH_UNCERTAIN;
        notify();
        return resumeOneResult({
            failed: 1,
            pendingTaskUids: [taskUid],
            uncertain: true,
            error: initial.error,
        });
    }

    const record = items.find(item => item.taskUid === taskUid);
    const alreadyRunning = initial.running.find(entry => entry.taskUid === taskUid);
    if (!record) {
        return resumeOneResult({ alreadyRunning: Boolean(alreadyRunning) });
    }

    if (record.reconciliationState) {
        removeTask(taskUid);
        persist();
        notice = record.reconciliationState === 'externally-clocked-out'
            ? 'The paused Session was already clocked out and was not reopened.'
            : 'The paused Session was replaced by explicit clock activity and was not duplicated.';
        notify();
        return resumeOneResult({ reconciled: true });
    }

    if (alreadyRunning) {
        removeTask(taskUid);
        persist();
        notify();
        return resumeOneResult({ alreadyRunning: true });
    }

    const valid = existingTask(record);
    if (valid?.uncertain) {
        notice = clock.GRAPH_UNCERTAIN;
        notify();
        return resumeOneResult({
            failed: 1,
            pendingTaskUids: [taskUid],
            uncertain: true,
            error: valid.error,
        });
    }
    if (!valid) {
        notice = `Task ${taskUid} could not be confirmed; the paused Session was kept.`;
        notify();
        return resumeOneResult({
            failed: 1,
            pendingTaskUids: [taskUid],
            error: new Error(notice),
        });
    }

    let enabledMultiple = false;
    if (initial.running.length > 0 && !allowMultipleClocks()) {
        try {
            writeSetting(SETTING_MULTIPLE, true);
        } catch (error) {
            notice = 'Multiple clocks could not be enabled; the paused Session was kept.';
            notify();
            return resumeOneResult({
                failed: 1,
                pendingTaskUids: [taskUid],
                error,
            });
        }
        if (!allowMultipleClocks()) {
            notice = 'Multiple clocks could not be enabled; the paused Session was kept.';
            notify();
            return resumeOneResult({
                failed: 1,
                pendingTaskUids: [taskUid],
                error: new Error(notice),
            });
        }
        enabledMultiple = true;
    }

    try {
        await resumeRecord(valid, now);
    } catch (error) {
        if (error?.code === 'done-ancestor') {
            const cleanup = pruneCompleted([taskUid]);
            notice = 'The paused Session was under a completed Task and was not resumed.';
            notify();
            return resumeOneResult({
                reconciled: true,
                pruned: cleanup.removed,
                completedTaskUids: [taskUid],
            });
        }
        notice = error?.uncertain ? clock.GRAPH_UNCERTAIN : error?.message || 'The paused Session could not be resumed.';
        notify();
        return resumeOneResult({
            failed: 1,
            pendingTaskUids: [taskUid],
            uncertain: Boolean(error?.uncertain),
            error,
        });
    }

    notice = enabledMultiple ? 'Multiple clocks were enabled to resume this Session.' : '';
    notify();
    return resumeOneResult({ completed: 1, enabledMultiple });
}

/** Start a fresh CLOCK for each valid paused task and consume successful records. */
export async function resumeAll({ now = new Date() } = {}) {
    if (unsupportedRaw !== null) {
        notice = 'Saved paused-task state is unsupported; no Tasks were resumed.';
        notify();
        return resumeBatchResult({
            blocked: true,
            pendingTaskUids: [...items, ...pendingResume].map(item => item.taskUid),
            error: new Error(notice),
            pruned: 0,
            satisfied: 0,
        });
    }

    notice = '';
    // Read the complete graph snapshot before planning any CLOCK writes. The
    // multiple-clock setting must be enabled before the first resume so a batch
    // cannot make its own later Sessions clock one another out.
    const initial = clock.refreshResult();
    if (!initial.ok) {
        notice = clock.getNotice() || 'Graph state could not be confirmed; no further changes were made.';
        notify();
        return resumeBatchResult({
            failed: pendingResume.length + items.length,
            pendingTaskUids: [...items, ...pendingResume].map(item => item.taskUid),
            pruned: 0,
            satisfied: 0,
            blocked: true,
            uncertain: true,
            error: initial.error,
        });
    }

    const finalized = reconcileFinalizing({ running: initial.running });
    if (!finalized.ok) {
        return resumeBatchResult({
            failed: finalized.activeTaskUids.length,
            pendingTaskUids: [...items, ...pendingResume].map(item => item.taskUid),
            blocked: true,
            uncertain: true,
            error: finalized.error,
            pruned: 0,
            satisfied: 0,
        });
    }
    if (finalized.activeTaskUids.length > 0) {
        notice = 'Clock Out All still has running Sessions; they were kept for an explicit retry.';
        notify();
        return resumeBatchResult({
            failed: finalized.activeTaskUids.length,
            pendingTaskUids: finalized.activeTaskUids,
            blocked: true,
            error: new Error(notice),
            pruned: 0,
            satisfied: 0,
        });
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
    let reconciled = 0;
    let completedPruned = 0;

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
        if (record.reconciliationState) {
            reconciled += 1;
            continue;
        }
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
                ...resumeBatchResult({
                    completed: recovered.recovered,
                    failed: recovered.failed + recovered.conflicts.length + ready.length,
                    pendingTaskUids: [...retained, ...ready, ...pendingResume].map(item => item.taskUid),
                    blocked: true,
                    error: new Error(notice),
                    pruned,
                    satisfied,
                }),
                conflicts: recovered.conflicts,
            };
        }
        enabledMultiple = true;
    }

    let resumed = recovered.recovered;
    let failed = recovered.failed + uncertain + recovered.conflicts.length;
    let legacyRecovered = recovered.legacyRecovered;
    let mutationUncertain = uncertain > 0;
    let firstError = null;
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
            if (error?.code === 'done-ancestor') {
                completedPruned += pruneCompleted([record.taskUid]).removed;
                completedTasks.add(record.taskUid);
                continue;
            }
            failed += 1;
            retained.push(record);
            console.error('[roam-logbook] could not resume task', record.taskUid, error);
            firstError ||= error;
            if (error?.uncertain) {
                mutationUncertain = true;
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
    if (completedPruned > 0) {
        messages.push(
            `${completedPruned} paused Session${completedPruned === 1 ? ' was' : 's were'} under a completed Task and not resumed.`
        );
    }
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
    if (reconciled > 0) {
        messages.push(
            `${reconciled} paused Session${reconciled === 1 ? ' was' : 's were'} reconciled with explicit clock activity.`
        );
        items = items.filter(item => !item.reconciliationState);
    }
    notice = messages.join(' ');
    persist();
    notify();
    return resumeBatchResult({
        completed: resumed,
        failed,
        pendingTaskUids: [...items, ...pendingResume].map(item => item.taskUid),
        uncertain: mutationUncertain,
        error: firstError,
        pruned,
        completedPruned,
        satisfied,
        blocked: false,
        legacyRecovery,
        legacyRecovered,
    });
}

/**
 * Permanent bulk finish. Pause state is cleared only after every target closes;
 * failed running tasks become a precise retryable Pause Batch entry.
 */
export async function clockOutAll({ now = new Date() } = {}) {
    let outcome;
    try {
        outcome = await clock.clockOutEntries(null, {
            now,
            prepare: entries => {
                const previousFinalizing = finalizing;
                finalizing = {
                    action: 'clock-out-all',
                    targets: entries
                        .filter(entry => entry.running)
                        .map(entry => ({ taskUid: entry.taskUid, clockUid: entry.clockUid })),
                };
                if (!persist()) {
                    finalizing = previousFinalizing;
                    const error = new Error(
                        notice || 'Pause Batch could not be saved before closing Sessions.'
                    );
                    error.uncertain = true;
                    throw error;
                }
            },
        });
    } catch {
        notice = clock.getNotice() || 'Unable to finish Sessions because the graph is unavailable.';
        notify();
        const pendingClockUids = clock.getRunning().map(entry => entry.clockUid);
        return {
            action: 'clock-out-all',
            ok: false,
            count: 0,
            completed: 0,
            failed: pendingClockUids.length,
            pending: pendingClockUids.length,
            pendingClockUids,
            partial: false,
            uncertain: true,
            error: new Error(notice),
            retry: { action: 'close', retryClockUids: pendingClockUids, writtenClockUids: [] },
            item: 'Session',
            completedVerb: 'ended',
        };
    }

    if (outcome?.preflight) {
        notice = 'Pause Batch could not be saved before closing Sessions; no Session was changed.';
        notify();
        return {
            ...outcome,
            action: 'clock-out-all',
            ok: false,
            item: 'Session',
            completedVerb: 'ended',
            count: 0,
            completed: 0,
            partial: false,
        };
    }

    if (!Array.isArray(outcome?.results)) {
        notice = clock.getNotice() || 'Unable to finish Sessions because the graph is unavailable.';
        notify();
        return {
            action: 'clock-out-all',
            ok: false,
            count: 0,
            completed: 0,
            failed: clock.getRunning().length,
            pending: clock.getRunning().length,
            pendingClockUids: clock.getRunning().map(entry => entry.clockUid),
            partial: false,
            uncertain: true,
            error: new Error(notice),
            retry: { action: 'close', retryClockUids: clock.getRunning().map(entry => entry.clockUid) },
            item: 'Session',
            completedVerb: 'ended',
        };
    }

    const closedUids = new Set(
        outcome.results.filter(result => result.closed).map(result => result.clockUid)
    );
    const stillRunning = (outcome.entries || clock.getRunning()).filter(
        entry => entry.running && !closedUids.has(entry.clockUid)
    );
    if (!outcome.uncertain && outcome.failed === 0 && stillRunning.length === 0) {
        const previousFinalizing = finalizing;
        items = [];
        pendingResume = [];
        finalizing = null;
        notice = '';
        const persisted = persist();
        if (!persisted) {
            finalizing = previousFinalizing || {
                action: 'clock-out-all',
                targets: (outcome.entries || []).map(entry => ({
                    taskUid: entry.taskUid,
                    clockUid: entry.clockUid,
                })),
            };
            notice = 'Sessions were closed, but clearing the saved Pause Batch could not be committed yet.';
            notify();
            return {
                ...outcome,
                action: 'clock-out-all',
                ok: false,
                item: 'Session',
                completedVerb: 'ended',
                count: outcome.closed,
                completed: outcome.closed,
                pending: 0,
                pendingClockUids: [],
                uncertain: true,
                partial: false,
                retry: {
                    action: 'commit-pause-batch',
                    retryClockUids: [],
                    writtenClockUids: outcome.results.filter(result => result.closed).map(result => result.clockUid),
                },
                error: new Error(notice),
            };
        }
        notify();
        return {
            ...outcome,
            action: 'clock-out-all',
            item: 'Session',
            completedVerb: 'ended',
            count: outcome.closed,
            completed: outcome.closed,
            pending: 0,
            pendingClockUids: [],
        };
    }

    const retained = new Map(
        items.filter(item => stillRunning.some(entry => entry.taskUid === item.taskUid)).map(item => [item.taskUid, item])
    );
    for (const entry of stillRunning) {
        retained.set(entry.taskUid, {
            taskUid: entry.taskUid,
            title: entry.title,
            pausedAtMs: now.getTime(),
            clockUid: entry.clockUid,
        });
    }
    items = [...retained.values()];
    pendingResume = pendingResume.filter(item => stillRunning.some(entry => entry.taskUid === item.taskUid));
    finalizing = {
        action: 'clock-out-all',
        targets: (outcome.entries || []).map(entry => ({ taskUid: entry.taskUid, clockUid: entry.clockUid })),
    };
    notice = outcome.uncertain
        ? clock.GRAPH_UNCERTAIN
        : `${stillRunning.length} Session${stillRunning.length === 1 ? '' : 's'} could not be closed.`;
    const persisted = persist();
    if (!persisted) {
        notice = 'Sessions were partly closed, but their durable recovery state could not be committed yet.';
    }
    notify();
    const pendingClockUids = stillRunning.map(entry => entry.clockUid);
    return {
        ...outcome,
        action: 'clock-out-all',
        ok: false,
        item: 'Session',
        completedVerb: 'ended',
        count: outcome.closed,
        completed: outcome.closed,
        uncertain: Boolean(outcome.uncertain || !persisted),
        pending: pendingClockUids.length,
        pendingClockUids,
        partial: Boolean(outcome.partial || (outcome.closed > 0 && pendingClockUids.length > 0)),
        retry: {
            ...(outcome.retry || { action: 'close' }),
            retryClockUids: pendingClockUids,
            writtenClockUids: outcome.results.filter(result => result.closed).map(result => result.clockUid),
        },
    };
}

export function clear() {
    if (unsupportedRaw !== null) {
        notice = 'Saved paused-task state is unsupported and was kept.';
        notify();
        return false;
    }
    items = [];
    pendingResume = [];
    finalizing = null;
    notice = '';
    persist();
    notify();
    return true;
}

/** Drop only in-memory state and subscriptions; persisted pause survives reload. */
export function reset() {
    items = [];
    pendingResume = [];
    finalizing = null;
    notice = '';
    unsupportedRaw = null;
    listeners.clear();
    unsubscribeClockActions?.();
    unsubscribeClockActions = null;
}
