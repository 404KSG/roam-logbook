/**
 * Clock in / clock out, and the observable list of running clocks.
 *
 * State is derived: every mutation writes to the graph and then re-reads it, so
 * what the UI shows is what a reload would show. Mutations are serialized for this
 * graph instance, and each queued action re-reads before it writes.
 */

import { readAllEntries, readHierarchy } from './entries.js';
import { buildActiveWork, chooseFocusedEntry } from './active-work.js';
import { DRAWER_LABEL, formatClockLine, isDrawerBlock, taskStatus } from './org.js';
import { createBlock, deleteBlock, GraphReadError, getBlockString, getChildren, resolveReferencedUid, updateBlock } from './roam.js';
import { enqueueMutation, resetMutationQueue } from './mutations.js';

let running = [];
let entriesSnapshot = [];
let lastRefreshStatus = { ok: true, error: null };
let notice = '';
const listeners = new Set();
const actionListeners = new Set();

export const GRAPH_UNCERTAIN = 'Graph state could not be confirmed; no further changes were made.';

async function withGraphGuard(action) {
    try {
        return await action();
    } catch (error) {
        if (error instanceof GraphReadError) {
            notice = GRAPH_UNCERTAIN;
            throw new Error(GRAPH_UNCERTAIN, { cause: error });
        }
        throw error;
    }
}

/** Subscribe to running-clock changes. Returns an unsubscribe function. */
export function subscribe(listener) {
    listeners.add(listener);
    listener(running, { reason: 'initial' });
    return () => listeners.delete(listener);
}

/** Observe confirmed clock actions without coupling graph state to Pause Batch. */
export function subscribeActions(listener) {
    actionListeners.add(listener);
    return () => actionListeners.delete(listener);
}

function publishAction(action) {
    for (const listener of actionListeners) {
        try {
            listener(action);
        } catch (error) {
            console.error('[roam-logbook] clock action listener failed', error);
        }
    }
}

export function getRunning() {
    return running;
}

/** The last confirmed graph snapshot used to derive Active Work. */
export function getEntriesSnapshot() {
    return entriesSnapshot.slice();
}

/** Derive the one Focused item plus the recent return set without a graph read. */
export function getActiveWork(now = new Date()) {
    return buildActiveWork(entriesSnapshot, { now });
}

export function getLastRefreshStatus() {
    return { ...lastRefreshStatus };
}

export function getNotice() {
    return notice;
}

function notify(meta = { reason: 'mutation' }) {
    for (const listener of listeners) {
        try {
            listener(running, meta);
        } catch (error) {
            console.error('[roam-logbook] listener failed', error);
        }
    }
}

const uncertainCloseResult = (error, entries = running, { preflight = false } = {}) => {
    const pendingClockUids = entries.filter(entry => entry.running).map(entry => entry.clockUid);
    return {
        action: 'close-sessions',
        ok: false,
        item: 'Session',
        completedVerb: 'ended',
        entries,
        results: [],
        closed: 0,
        count: 0,
        completed: 0,
        failed: pendingClockUids.length,
        pending: pendingClockUids.length,
        pendingClockUids,
        uncertain: true,
        partial: false,
        retry: { action: 'close', retryClockUids: pendingClockUids, writtenClockUids: [] },
        error,
        preflight,
    };
};

const uncertainPauseResult = error => {
    const pendingClockUids = running.map(entry => entry.clockUid);
    return {
        action: 'pause-sessions',
        ok: false,
        item: 'Session',
        completedVerb: 'paused',
        entries: running,
        records: [],
        results: [],
        closed: 0,
        count: 0,
        completed: 0,
        failed: pendingClockUids.length,
        pending: pendingClockUids.length,
        pendingClockUids,
        pendingTaskUids: running.map(entry => entry.taskUid),
        uncertain: true,
        partial: false,
        retry: { action: 'pause', retryClockUids: pendingClockUids, retryTaskUids: running.map(entry => entry.taskUid) },
        error,
        preflight: true,
    };
};

/**
 * Re-read the graph and publish the current set of open clocks.
 *
 * Each open clock is tagged with `priorMinutes`, the time already banked against
 * the same task. A failed read leaves the last valid snapshot untouched.
 */
export function refresh({ entries, notify: shouldNotify = true } = {}) {
    let all;
    try {
        if (entries !== undefined && !Array.isArray(entries)) {
            throw new GraphReadError('Clock refresh received an invalid entries snapshot');
        }
        all = entries ?? readAllEntries();
    } catch (error) {
        lastRefreshStatus = { ok: false, error };
        notice = GRAPH_UNCERTAIN;
        console.error('[roam-logbook] could not refresh clocks', error);
        return running;
    }

    const bankedByTask = new Map();
    for (const entry of all) {
        if (entry.running) continue;
        bankedByTask.set(entry.taskUid, (bankedByTask.get(entry.taskUid) || 0) + (entry.minutes || 0));
    }

    entriesSnapshot = all.map(entry =>
        entry.running
            ? { ...entry, priorMinutes: bankedByTask.get(entry.taskUid) || 0 }
            : { ...entry }
    );
    const focused = chooseFocusedEntry(entriesSnapshot);
    // The graph may contain legacy overlapping CLOCKs. Keep the public running
    // seam single-focused immediately; reconcileOpenClocks() then closes the
    // other graph entries at the known focus-switch boundary.
    running = focused ? [{ ...focused }] : [];

    lastRefreshStatus = { ok: true, error: null };
    notice = '';
    if (shouldNotify) notify({ reason: 'refresh', explicit: true });
    return running;
}

/**
 * Refresh with an explicit outcome for callers that have just written the graph.
 * A failed post-write read is different from a failed preflight: the write may
 * have reached Roam, so the caller must stop and retain a retryable state rather
 * than pretend the mutation failed or continue with another write.
 */
export function refreshResult({ entries, notify: shouldNotify = true } = {}) {
    const snapshot = refresh({ entries, notify: shouldNotify });
    if (!lastRefreshStatus.ok) {
        return {
            ok: false,
            uncertain: true,
            running: snapshot,
            error: lastRefreshStatus.error,
            notice: GRAPH_UNCERTAIN,
        };
    }
    return { ok: true, uncertain: false, running: snapshot, error: null, notice: '' };
}

export function reset() {
    running = [];
    entriesSnapshot = [];
    lastRefreshStatus = { ok: true, error: null };
    notice = '';
    listeners.clear();
    actionListeners.clear();
    resetMutationQueue();
}

/**
 * The block a clock should actually be attached to.
 *
 * When the user right-clicks a block reference or an embed, the drawer belongs
 * on the original block, not on the mirror they happen to be looking at.
 */
export function resolveTaskUid(uid) {
    return resolveReferencedUid(uid);
}

function doneAncestorFor(taskUid) {
    const taskString = getBlockString(taskUid);
    if (taskStatus(taskString) === 'DONE') return taskUid;
    const hierarchy = readHierarchy([taskUid]);
    if (hierarchy.issues.length > 0) {
        throw new GraphReadError('Task hierarchy could not be confirmed before Clock In', {
            issue: {
                kind: 'hierarchy',
                source: 'parent',
                message: 'Task hierarchy could not be confirmed before Clock In',
                affectedUids: [taskUid],
            },
        });
    }
    const seen = new Set();
    let current = taskUid;
    while (current && hierarchy.parentOf[current]) {
        if (seen.has(current)) {
            throw new GraphReadError('Task hierarchy contains a cycle before Clock In', {
                issue: {
                    kind: 'hierarchy',
                    source: 'parent',
                    message: 'Task hierarchy contains a cycle before Clock In',
                    affectedUids: [taskUid],
                },
            });
        }
        seen.add(current);
        current = hierarchy.parentOf[current];
        if (taskStatus(hierarchy.stringOf[current]) === 'DONE') return current;
    }
    return null;
}

/** The task's LOGBOOK drawer, created directly under the task if missing. */
async function ensureDrawer(taskUid) {
    const children = getChildren(taskUid);
    const existing = children.find(child => isDrawerBlock(child.string));
    if (existing) return { uid: existing.uid, created: false };
    // Order 0 mirrors org, where the drawer sits immediately under the heading.
    const uid = await createBlock({ parentUid: taskUid, order: 0, string: DRAWER_LABEL, open: false });
    const confirmation = refreshResult({ notify: false });
    return { uid, created: true, confirmation };
}

/** Rewrite one confirmed running entry into its closed form. */
async function closeEntry(entry, end) {
    if (!entry?.running) return false;
    const string = formatClockLine(entry.start, end.getTime() < entry.start.getTime() ? entry.start : end);
    await updateBlock({ uid: entry.clockUid, string });
    return true;
}

/**
 * Close a confirmed set of entries inside an already-queued mutation.
 *
 * Failed writes are returned per entry so Pause/Clock Out All can preserve the
 * exact retry set. A read failure before this function is called is still thrown
 * by the public action and therefore produces zero writes.
 */
async function closeEntriesNow(entries, clockUids, now, { publish = true } = {}) {
    const byUid = new Map(entries.filter(entry => entry.running).map(entry => [entry.clockUid, entry]));
    const ids = clockUids === null ? [...byUid.keys()] : [...new Set(clockUids)];
    const results = [];

    let uncertain = null;
    for (const clockUid of ids) {
        const entry = byUid.get(clockUid);
        if (!entry) {
            results.push({ clockUid, closed: false, reason: 'not-running' });
            continue;
        }
        try {
            const closed = await closeEntry(entry, now);
            results.push({ clockUid, closed });
            if (closed) {
                const confirmation = refreshResult({ notify: false });
                if (!confirmation.ok) {
                    uncertain = confirmation;
                    break;
                }
            }
        } catch (error) {
            results.push({ clockUid, closed: false, error });
        }
    }

    const retryClockUids = ids.filter(clockUid => {
        const result = results.find(item => item.clockUid === clockUid);
        return !result || Boolean(result.error);
    });
    const closed = results.filter(result => result.closed).length;
    const failed = results.filter(result => result.error).length;
    const pending = retryClockUids.length;
    const incomplete = Boolean(uncertain) || failed > 0 || pending > 0;
    if (publish && (closed > 0 || uncertain)) notify();
    return {
        action: 'close-sessions',
        ok: !incomplete,
        item: 'Session',
        completedVerb: 'ended',
        results,
        closed,
        count: closed,
        completed: closed,
        failed,
        pending,
        pendingClockUids: retryClockUids,
        uncertain: Boolean(uncertain),
        partial: Boolean(incomplete && closed > 0),
        retry: incomplete
            ? {
                  action: 'close',
                  retryClockUids,
                  writtenClockUids: results.filter(result => result.closed).map(result => result.clockUid),
              }
            : null,
        refresh: uncertain,
        error: uncertain?.error || results.find(result => result.error)?.error || null,
    };
}

/**
 * Open a clock on `blockUid` (or the block it references).
 *
 * @returns {Promise<{clockUid: string, taskUid: string}>}
 */
export async function clockIn(blockUid, { now = new Date(), source = 'user' } = {}) {
    return enqueueMutation(() =>
        withGraphGuard(async () => {
            const taskUid = resolveTaskUid(blockUid);
            if (!taskUid) throw new Error('No block to clock in');

            // This read is deliberately inside the queue. It is the boundary that
            // prevents two concurrent actions, or an external fresh write observed
            // from both deciding that the task is free.
            const entries = readAllEntries();
            const open = entries.filter(entry => entry.running);
            const doneAncestorUid = doneAncestorFor(taskUid);
            if (doneAncestorUid) {
                const error = new Error(
                    `Cannot Clock In under DONE Task ${doneAncestorUid}; reopen it first.`
                );
                error.code = 'done-ancestor';
                error.taskUid = taskUid;
                error.doneAncestorUid = doneAncestorUid;
                throw error;
            }
            if (open.length === 1 && open[0].taskUid === taskUid) {
                refresh({ entries, notify: false });
                return { clockUid: open[0].clockUid, taskUid, alreadyFocused: true };
            }
            // There is exactly one real CLOCK by design. A Clock In on another
            // Task is an atomic focus switch: close every confirmed open legacy
            // entry at this instant, then create the new Focused CLOCK.
            if (open.length > 0) {
                const outcome = await closeEntriesNow(entries, open.map(entry => entry.clockUid), now, {
                    publish: false,
                });
                if (outcome.uncertain) {
                    return {
                        taskUid,
                        uncertain: true,
                        partial: outcome.partial,
                        notice: GRAPH_UNCERTAIN,
                        retry: outcome.retry,
                    };
                }
                if (outcome.failed > 0) throw outcome.results.find(result => result.error).error;
            }

            const drawer = await ensureDrawer(taskUid);
            if (drawer.confirmation && !drawer.confirmation.ok) {
                return {
                    taskUid,
                    drawerUid: drawer.uid,
                    uncertain: true,
                    partial: true,
                    notice: GRAPH_UNCERTAIN,
                    retry: { action: 'clock-in', taskUid, drawerUid: drawer.uid },
                };
            }
            const clockUid = await createBlock({
                parentUid: drawer.uid,
                // Roam shifts existing siblings when a child is created at 0,
                // keeping the newest Session at the top of the drawer.
                order: 0,
                string: formatClockLine(now),
            });

            const confirmation = refreshResult({ notify: false });
            if (!confirmation.ok) {
                return {
                    clockUid,
                    taskUid,
                    uncertain: true,
                    partial: true,
                    notice: GRAPH_UNCERTAIN,
                    retry: { action: 'clock-in', taskUid, drawerUid: drawer.uid, clockUid },
                };
            }
            const result = { clockUid, taskUid };
            publishAction({
                type: 'clock-in',
                source,
                clockUid,
                taskUid,
                newCycle: open.length === 0,
                cycleStartedAt: open.length === 0 ? now.getTime() : null,
            });
            notify();
            return result;
        })
    );
}

/**
 * Reconcile legacy graphs that contain more than one open CLOCK on reload.
 *
 * The newest-started open entry is the deterministic Focused entry. Older
 * entries are closed at that Focused start instant when possible, which avoids
 * extending their unknown overlap into the new single-clock era while keeping
 * every historical CLOCK block intact.
 */
export async function reconcileOpenClocks({
    now = new Date(),
    source = 'legacy-reconcile',
    entries: suppliedEntries,
} = {}) {
    return enqueueMutation(() =>
        withGraphGuard(async () => {
            if (suppliedEntries !== undefined && !Array.isArray(suppliedEntries)) {
                throw new GraphReadError('Clock reconciliation received an invalid entries snapshot');
            }
            const entries = suppliedEntries ?? readAllEntries();
            const open = entries.filter(entry => entry.running);
            if (open.length <= 1) {
                refresh({ entries, notify: false });
                return {
                    action: 'reconcile-overlapping-clocks',
                    ok: true,
                    focused: open[0]?.clockUid || null,
                    closed: 0,
                    pending: 0,
                    entries,
                };
            }

            const focused = chooseFocusedEntry(open) || open[0];
            const closeAt = focused?.start instanceof Date ? focused.start : now;
            const outcome = await closeEntriesNow(
                entries,
                open.filter(entry => entry.clockUid !== focused.clockUid).map(entry => entry.clockUid),
                closeAt,
                { publish: false }
            );
            if (!outcome.uncertain) {
                for (const closed of outcome.results.filter(item => item.closed)) {
                    const entry = open.find(item => item.clockUid === closed.clockUid);
                    publishAction({
                        type: 'clock-out',
                        source,
                        clockUid: closed.clockUid,
                        taskUid: entry?.taskUid,
                    });
                }
            }
            notify({ reason: 'reconcile-overlap', explicit: true });
            return {
                ...outcome,
                action: 'reconcile-overlapping-clocks',
                focused: focused.clockUid,
                entries,
            };
        })
    );
}

/** Close one confirmed clock and return whether it was still running. */
export async function clockOut(clockUid, { now = new Date(), source = 'user' } = {}) {
    return enqueueMutation(() =>
        withGraphGuard(async () => {
            const entries = readAllEntries();
            const outcome = await closeEntriesNow(entries, [clockUid], now);
            const result = outcome.results[0];
            if (result?.error) throw result.error;
            if (outcome.uncertain) {
                return {
                    closed: result?.closed === true,
                    uncertain: true,
                    partial: outcome.partial,
                    notice: GRAPH_UNCERTAIN,
                    retry: outcome.retry,
                };
            }
            if (result?.closed === true) {
                const entry = entries.find(item => item.clockUid === clockUid);
                publishAction({ type: 'clock-out', source, clockUid, taskUid: entry?.taskUid });
            }
            return result?.closed === true;
        })
    );
}

/** Close a selected set, or every currently running clock when omitted. */
export async function clockOutEntries(
    clockUids = null,
    { now = new Date(), source = 'user', prepare = null } = {}
) {
    return enqueueMutation(async () => {
        let entries = [];
        let readCompleted = false;
        let prepareStarted = false;
        try {
            return await withGraphGuard(async () => {
                entries = readAllEntries();
                readCompleted = true;
                if (prepare) {
                    prepareStarted = true;
                    await prepare(entries.map(entry => ({ ...entry })));
                }
                const outcome = await closeEntriesNow(entries, clockUids, now);
                const result = { ...outcome, entries };
                if (!outcome.uncertain) {
                    for (const closed of outcome.results.filter(item => item.closed)) {
                        const entry = entries.find(item => item.clockUid === closed.clockUid);
                        publishAction({
                            type: 'clock-out',
                            source,
                            clockUid: closed.clockUid,
                            taskUid: entry?.taskUid,
                        });
                    }
                }
                // Batch close changes the confirmed running snapshot without
                // using closeEntriesNow's normal per-session publish path.
                // Notify subscribers once so the shared Pomodoro cycle and
                // surfaces reconcile the final batch state together.
                notify();
                return result;
            });
        } catch (error) {
            notice = GRAPH_UNCERTAIN;
            return uncertainCloseResult(error, readCompleted ? entries : running, { preflight: prepareStarted });
        }
    });
}

/**
 * Prepare and close the current running entries as one queued graph action.
 *
 * The preparation callback may persist extension state, but it cannot write the
 * graph. This lets Pause All save its recovery record before the first CLOCK
 * closes without allowing another local graph mutation to interleave.
 */
export async function pauseEntries({ now = new Date(), prepare, source = 'pause' } = {}) {
    return enqueueMutation(async () => {
        try {
            return await withGraphGuard(async () => {
                const allEntries = readAllEntries();
                const entries = allEntries.filter(entry => entry.running);
                if (entries.length === 0) refresh({ entries: allEntries, notify: false });
                const records = prepare ? await prepare(entries.map(entry => ({ ...entry }))) : [];
                const outcome = await closeEntriesNow(
                    entries,
                    records.map(record => record.clockUid),
                    now,
                    { publish: false }
                );
                const result = { entries, records, ...outcome };
                if (!outcome.uncertain) {
                    for (const closed of outcome.results.filter(item => item.closed)) {
                        const entry = entries.find(item => item.clockUid === closed.clockUid);
                        publishAction({
                            type: 'clock-out',
                            source,
                            clockUid: closed.clockUid,
                            taskUid: entry?.taskUid,
                        });
                    }
                }
                notify();
                return result;
            });
        } catch (error) {
            notice = GRAPH_UNCERTAIN;
            return uncertainPauseResult(error);
        }
    });
}

/** Close all currently running clocks and return a structured batch result. */
export async function clockOutAll({ now = new Date(), source = 'user' } = {}) {
    let outcome;
    try {
        outcome = await clockOutEntries(null, { now, source });
    } catch (error) {
        notice = GRAPH_UNCERTAIN;
        const pendingClockUids = running.map(entry => entry.clockUid);
        return {
            action: 'clock-out-all',
            ok: false,
            item: 'Session',
            completedVerb: 'ended',
            count: 0,
            completed: 0,
            failed: pendingClockUids.length,
            pending: pendingClockUids.length,
            pendingClockUids,
            uncertain: true,
            partial: false,
            retry: { action: 'close', retryClockUids: pendingClockUids, writtenClockUids: [] },
            error,
        };
    }
    if (outcome.uncertain) {
        notice = GRAPH_UNCERTAIN;
    } else if (outcome.failed > 0) {
        notice = `${outcome.failed} Session${outcome.failed === 1 ? '' : 's'} could not be closed.`;
    }
    return {
        ...outcome,
        action: 'clock-out-all',
        item: 'Session',
        completedVerb: 'ended',
        count: outcome.closed,
        completed: outcome.closed,
    };
}

/** Close whichever clock belongs to this block, if any. */
export async function clockOutBlock(blockUid, { now = new Date(), source = 'user' } = {}) {
    return enqueueMutation(() =>
        withGraphGuard(async () => {
            const taskUid = resolveTaskUid(blockUid);
            const entries = readAllEntries();
            const entry = entries.find(item => item.running && item.taskUid === taskUid);
            if (!entry) return false;
            const outcome = await closeEntriesNow(entries, [entry.clockUid], now);
            const result = outcome.results[0];
            if (result?.error) throw result.error;
            if (outcome.uncertain) {
                return {
                    closed: result?.closed === true,
                    uncertain: true,
                    partial: outcome.partial,
                    notice: GRAPH_UNCERTAIN,
                    retry: outcome.retry,
                };
            }
            if (result?.closed === true) {
                publishAction({
                    type: 'clock-out',
                    source,
                    clockUid: entry.clockUid,
                    taskUid: entry.taskUid,
                });
            }
            return result?.closed === true;
        })
    );
}

/**
 * Automatically close a completed Task's own and confirmed descendant Sessions.
 *
 * The caller may provide Pause Batch hooks, but the graph scope is always
 * confirmed here from a fresh hierarchy read while inside the mutation queue.
 */
export async function clockOutCompletedTask(
    taskUid,
    {
        now = new Date(),
        source = 'auto-complete',
        getPauseTaskUids = null,
        pruneCompleted = null,
        retryClockUids = null,
    } = {}
) {
    return enqueueMutation(async () => {
        try {
            return await withGraphGuard(async () => {
                const entries = readAllEntries();
                const runningEntries = entries.filter(entry => entry.running);
                const pauseTaskUids = getPauseTaskUids ? getPauseTaskUids() : [];
                if (!Array.isArray(pauseTaskUids)) {
                    throw new GraphReadError('Paused Task scope could not be confirmed');
                }
                const taskUids = [
                    ...new Set([
                        taskUid,
                        ...runningEntries.map(entry => entry.taskUid),
                        ...pauseTaskUids,
                    ].filter(Boolean)),
                ];
                const hierarchy = readHierarchy(taskUids);
                const relevantHierarchyIssues = hierarchy.issues.filter(issue =>
                    hierarchyIssueAffectsTask(issue, taskUid, hierarchy.parentOf)
                );
                if (relevantHierarchyIssues.length > 0) {
                    throw new GraphReadError('Task hierarchy could not be confirmed for automatic Clock Out', {
                        issue: {
                            kind: 'hierarchy',
                            source: 'parent',
                            message: 'Task hierarchy could not be confirmed for automatic Clock Out',
                            affectedUids: relevantHierarchyIssues.flatMap(issue =>
                                issue.affectedUids || [issue.taskUid, issue.parentUid]
                            ),
                        },
                    });
                }
                const stringOf = new Map([
                    ...entries.map(entry => [entry.taskUid, entry.taskString]),
                    ...Object.entries(hierarchy.stringOf),
                ]);
                const taskString = stringOf.get(taskUid) ?? getBlockString(taskUid);
                if (taskStatus(taskString) !== 'DONE') {
                    return {
                        action: 'auto-clock-out',
                        source,
                        ok: true,
                        skipped: true,
                        reason: 'task-not-done',
                        triggerUid: taskUid,
                        closed: 0,
                        count: 0,
                        completed: 0,
                        failed: 0,
                        pending: 0,
                        pendingClockUids: [],
                    };
                }

                const targetEntries = entries.filter(
                    entry =>
                        entry.running &&
                        isTaskInConfirmedTree(entry.taskUid, taskUid, hierarchy.parentOf)
                );
                const affectedTaskUids = [
                    taskUid,
                    ...targetEntries.map(entry => entry.taskUid),
                    ...pauseTaskUids.filter(candidate =>
                        isTaskInConfirmedTree(candidate, taskUid, hierarchy.parentOf)
                    ),
                ];
                const targetClockUids =
                    retryClockUids === null
                        ? targetEntries.map(entry => entry.clockUid)
                        : targetEntries
                              .filter(entry => retryClockUids.includes(entry.clockUid))
                              .map(entry => entry.clockUid);
                const outcome = await closeEntriesNow(
                    entries,
                    targetClockUids,
                    now,
                    { publish: false }
                );
                for (const closed of outcome.results.filter(item => item.closed)) {
                    const entry = targetEntries.find(item => item.clockUid === closed.clockUid);
                    publishAction({
                        type: 'clock-out',
                        source,
                        clockUid: closed.clockUid,
                        taskUid: entry?.taskUid,
                    });
                }
                const pauseResult = outcome.ok && pruneCompleted
                    ? pruneCompleted([...new Set(affectedTaskUids)])
                    : null;
                if (pauseResult && pauseResult.ok === false) {
                    const result = {
                        ...outcome,
                        action: 'auto-clock-out',
                        source,
                        triggerUid: taskUid,
                        taskUids: [...new Set(affectedTaskUids)],
                        pause: pauseResult,
                        ok: false,
                        uncertain: true,
                        partial: Boolean(outcome.partial || outcome.closed > 0),
                        retry: {
                            ...(outcome.retry || { action: 'auto-clock-out' }),
                            action: 'auto-clock-out',
                            taskUid,
                            retryClockUids: outcome.pendingClockUids,
                        },
                        error: pauseResult.error,
                    };
                    notify();
                    return result;
                }
                notify();
                const retry = outcome.retry
                    ? {
                          ...outcome.retry,
                          action: 'auto-clock-out',
                          taskUid,
                          retryClockUids: outcome.pendingClockUids,
                      }
                    : null;
                return {
                    ...outcome,
                    action: 'auto-clock-out',
                    source,
                    triggerUid: taskUid,
                    taskUids: [...new Set(affectedTaskUids)],
                    pause: pauseResult,
                    retry,
                };
            });
        } catch (error) {
            notice = GRAPH_UNCERTAIN;
            const pendingClockUids = running.map(entry => entry.clockUid);
            return {
                action: 'auto-clock-out',
                source,
                ok: false,
                triggerUid: taskUid,
                closed: 0,
                count: 0,
                completed: 0,
                failed: pendingClockUids.length,
                pending: pendingClockUids.length,
                pendingClockUids,
                uncertain: true,
                partial: false,
                retry: { action: 'auto-clock-out', taskUid, retryClockUids: pendingClockUids },
                error,
            };
        }
    });
}

function confirmedTreeRelation(taskUid, rootUid, parentOf) {
    const seen = new Set();
    let current = taskUid;
    while (current) {
        if (current === rootUid) return { matched: true, cyclic: false };
        if (seen.has(current)) {
            return { matched: false, cyclic: true };
        }
        seen.add(current);
        current = parentOf[current];
    }
    return { matched: false, cyclic: false };
}

function isTaskInConfirmedTree(taskUid, rootUid, parentOf) {
    return confirmedTreeRelation(taskUid, rootUid, parentOf).matched;
}

function hierarchyIssueAffectsTask(issue, rootUid, parentOf) {
    if (issue?.code === 'ancestor-depth-exceeded' && !parentOf[rootUid]) return true;
    if (issue?.code === 'ambiguous-parent') {
        if (issue.taskUid === rootUid) return true;
        const taskToRoot = confirmedTreeRelation(issue.taskUid, rootUid, parentOf);
        const rootToTask = confirmedTreeRelation(rootUid, issue.taskUid, parentOf);
        if (taskToRoot.matched || rootToTask.matched) return true;
        return (issue.parentUids || []).some(candidate =>
            confirmedTreeRelation(candidate, rootUid, parentOf).matched
        );
    }
    const affected = [
        issue?.taskUid,
        issue?.parentUid,
        ...(Array.isArray(issue?.parentUids) ? issue.parentUids : []),
        ...(Array.isArray(issue?.affectedUids) ? issue.affectedUids : []),
    ].filter(uid => typeof uid === 'string' && uid);
    if (affected.length === 0) return true;

    // A cycle can make a direct path traversal inconclusive. Use the connected
    // component only for that malformed path, so an unrelated cycle is isolated
    // while any cycle attached to the root remains conservative.
    const adjacent = new Map();
    const connect = (left, right) => {
        if (!left || !right) return;
        (adjacent.get(left) || adjacent.set(left, new Set()).get(left)).add(right);
        (adjacent.get(right) || adjacent.set(right, new Set()).get(right)).add(left);
    };
    for (const [child, parent] of Object.entries(parentOf || {})) connect(child, parent);
    if (issue?.taskUid) {
        for (const parent of [issue.parentUid, ...(issue.parentUids || [])]) {
            connect(issue.taskUid, parent);
        }
    }

    const component = new Set([rootUid]);
    const frontier = [rootUid];
    while (frontier.length > 0) {
        const current = frontier.pop();
        for (const neighbor of adjacent.get(current) || []) {
            if (component.has(neighbor)) continue;
            component.add(neighbor);
            frontier.push(neighbor);
        }
    }
    return affected.some(uid => {
        const down = confirmedTreeRelation(uid, rootUid, parentOf);
        const up = confirmedTreeRelation(rootUid, uid, parentOf);
        return down.matched || up.matched || down.cyclic || up.cyclic ? component.has(uid) : false;
    });
}

/**
 * Throw away a clock entry — for sessions that were started by mistake.
 * The drawer goes too once it is empty, so abandoned tasks stay clean.
 */
export async function discardClock(clockUid) {
    return enqueueMutation(() =>
        withGraphGuard(async () => {
            const entries = readAllEntries();
            const entry = entries.find(item => item.clockUid === clockUid);
            await deleteBlock(clockUid);

            let confirmation = refreshResult({ notify: false });
            if (!confirmation.ok) {
                return {
                    deleted: true,
                    uncertain: true,
                    partial: true,
                    notice: GRAPH_UNCERTAIN,
                    retry: { action: 'discard', clockUid },
                };
            }

            if (entry) {
                const drawer = getChildren(entry.taskUid).find(child => isDrawerBlock(child.string));
                if (drawer && getChildren(drawer.uid).length === 0) {
                    await deleteBlock(drawer.uid);
                    confirmation = refreshResult({ notify: false });
                    if (!confirmation.ok) {
                        return {
                            deleted: true,
                            uncertain: true,
                            partial: true,
                            notice: GRAPH_UNCERTAIN,
                            retry: { action: 'discard-drawer', drawerUid: drawer.uid },
                        };
                    }
                }
            }

            notify();
            return true;
        })
    );
}

/** True when this block (or the one it references) has an open clock. */
export function isBlockRunning(blockUid) {
    const taskUid = resolveTaskUid(blockUid);
    return running.some(entry => entry.taskUid === taskUid);
}
