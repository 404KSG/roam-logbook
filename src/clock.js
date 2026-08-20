/**
 * Clock in / clock out, and the observable list of running clocks.
 *
 * State is derived: every mutation writes to the graph and then re-reads it, so
 * what the UI shows is what a reload would show. Mutations are serialized for this
 * graph instance, and each queued action re-reads before it writes.
 */

import { readAllEntries, readHierarchy } from './entries.js';
import { buildActiveWork, chooseFocusedEntry } from './active-work.js';
import { DRAWER_LABEL, formatClockLine, isDrawerBlock, isTaskBlock, taskStatus } from './org.js';
import { createBlock, deleteBlock, GraphReadError, getBlockString, getChildren, resolveReferencedUid, updateBlock } from './roam.js';
import {
    enqueueMutation,
    resetMutationQueue,
    scheduleMutationStart,
} from './mutations.js';

let running = [];
let entriesSnapshot = [];
let lastRefreshStatus = { ok: true, error: null };
let notice = '';
const listeners = new Set();
const actionListeners = new Set();
const clockInIntentListeners = new Set();

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

/** Observe confirmed clock actions without coupling graph state to the UI. */
export function subscribeActions(listener) {
    actionListeners.add(listener);
    return () => actionListeners.delete(listener);
}

/** Observe immediate user Clock In intent before graph confirmation begins. */
export function subscribeClockInIntents(listener) {
    clockInIntentListeners.add(listener);
    return () => clockInIntentListeners.delete(listener);
}

function publishClockInIntent(intent) {
    let handled = false;
    for (const listener of clockInIntentListeners) {
        try {
            handled = listener(intent) === true || handled;
        } catch (error) {
            console.error('[roam-logbook] Clock In intent listener failed', error);
        }
    }
    return handled;
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

const uncertainCloseResult = (
    error,
    entries = running,
    clockUids = null,
    { preflight = false } = {}
) => {
    const scope = clockUids === null ? null : new Set(clockUids);
    const pendingClockUids = entries
        .filter(entry => entry.running && (scope === null || scope.has(entry.clockUid)))
        .map(entry => entry.clockUid);
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

/**
 * Re-read the graph and publish the current set of open clocks.
 *
 * A failed read leaves the last valid snapshot untouched. Active Work derives
 * `priorMinutes` from this snapshot when it is requested.
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

    entriesSnapshot = all;
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
    clockInIntentListeners.clear();
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

function postWriteConfirmationError(clockUid, action) {
    return new GraphReadError(`${action} for CLOCK ${clockUid} was not confirmed after graph refresh.`, {
        issue: {
            kind: 'post-write-confirmation',
            source: action,
            affectedUids: [clockUid],
        },
    });
}

/**
 * Close a confirmed set of entries inside an already-queued mutation.
 *
 * Failed writes are returned per entry so Clock Out All can preserve the exact
 * retry set. A read failure before this function is called is still thrown
 * by the public action and therefore produces zero writes.
 */
async function closeEntriesNow(entries, clockUids, now, { publish = true } = {}) {
    const byUid = new Map(entries.filter(entry => entry.running).map(entry => [entry.clockUid, entry]));
    const ids = clockUids === null ? [...byUid.keys()] : [...new Set(clockUids)];
    const resultByUid = new Map();
    const writtenClockUids = [];

    let uncertain = null;
    for (const clockUid of ids) {
        const entry = byUid.get(clockUid);
        if (!entry) {
            resultByUid.set(clockUid, { clockUid, closed: false, reason: 'not-running' });
            continue;
        }
        try {
            const closed = await closeEntry(entry, now);
            if (!closed) {
                resultByUid.set(clockUid, { clockUid, closed: false, reason: 'not-running' });
                continue;
            }
            writtenClockUids.push(clockUid);
        } catch (error) {
            resultByUid.set(clockUid, { clockUid, closed: false, error });
        }
    }

    // Confirm the whole write batch with one graph read. A failed read leaves
    // every successfully written UID retryable because its final state is
    // unknown; a successful read verifies each requested UID from one snapshot.
    if (writtenClockUids.length > 0) {
        const confirmation = refreshResult({ notify: false });
        if (!confirmation.ok) {
            uncertain = confirmation;
            for (const clockUid of writtenClockUids) {
                resultByUid.set(clockUid, { clockUid, closed: false, uncertain: true });
            }
        } else {
            const confirmedClosedClockUids = new Set(
                entriesSnapshot.filter(item => item.running === false).map(item => item.clockUid)
            );
            for (const clockUid of writtenClockUids) {
                if (confirmedClosedClockUids.has(clockUid)) {
                    resultByUid.set(clockUid, { clockUid, closed: true });
                    continue;
                }
                const error = postWriteConfirmationError(clockUid, 'Clock Out');
                resultByUid.set(clockUid, { clockUid, closed: false, uncertain: true });
                uncertain = { ok: false, uncertain: true, error, notice: GRAPH_UNCERTAIN };
            }
        }
    }

    const results = ids.map(clockUid =>
        resultByUid.get(clockUid) || { clockUid, closed: false, uncertain: true }
    );
    const retryClockUids = results
        .filter(result => !result || Boolean(result.error) || result.uncertain === true)
        .map(result => result.clockUid);
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
export async function clockIn(
    blockUid,
    {
        now = new Date(),
        source = 'user',
        scheduleMutationStartFn = scheduleMutationStart,
    } = {}
) {
    // Sidebar navigation is a reversible response to the user's click, not a
    // graph mutation. Publish it before the mutation queue performs drawer,
    // CLOCK, and post-write confirmation work so the native block can begin
    // rendering immediately. The queued action resolves the target again and
    // remains the sole authority for whether timing actually starts.
    let intentTaskUid = null;
    try {
        intentTaskUid = resolveTaskUid(blockUid);
    } catch {
        // The queued, graph-guarded resolution below remains authoritative and
        // will preserve the existing uncertainty result. A failed speculative
        // lookup must not change Clock In error semantics.
    }
    const hasSidebarIntent =
        intentTaskUid &&
        publishClockInIntent({ type: 'clock-in-intent', source, taskUid: intentTaskUid });

    const mutation = () =>
        withGraphGuard(async () => {
            const taskUid = resolveTaskUid(blockUid);
            if (!taskUid) throw new Error('No block to clock in');

            // This read is deliberately inside the queue. It is the boundary that
            // prevents two concurrent actions, or an external fresh write observed
            // from both deciding that the task is free.
            const entries = readAllEntries();
            const open = entries.filter(entry => entry.running);
            const taskString = getBlockString(taskUid);
            if (!isTaskBlock(taskString) || taskStatus(taskString) !== 'TODO') {
                const error = new Error('Clock In is only available on unfinished TODO blocks.');
                error.code = 'todo-only';
                error.taskUid = taskUid;
                throw error;
            }
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
                const result = { clockUid: open[0].clockUid, taskUid, alreadyFocused: true };
                publishAction({
                    type: 'clock-in',
                    source,
                    clockUid: open[0].clockUid,
                    taskUid,
                    alreadyFocused: true,
                    newCycle: false,
                    cycleStartedAt: null,
                });
                return result;
            }
            // There is exactly one real CLOCK by design. A Clock In on another
            // Task is an atomic focus switch: close every confirmed open legacy
            // entry at this instant, then create the new Focused CLOCK.
            let closedClockUids = [];
            if (open.length > 0) {
                const outcome = await closeEntriesNow(entries, open.map(entry => entry.clockUid), now, {
                    publish: false,
                });
                closedClockUids = outcome.results.filter(result => result.closed).map(result => result.clockUid);
                if (outcome.uncertain) {
                    return {
                        taskUid,
                        uncertain: true,
                        partial: true,
                        notice: GRAPH_UNCERTAIN,
                        retry: outcome.retry,
                    };
                }
                if (outcome.failed > 0) throw outcome.results.find(result => result.error).error;
            }

            let drawer;
            let clockUid;
            const retry = details => ({
                action: 'clock-in',
                taskUid,
                ...(open.length > 0 ? { closedClockUids } : {}),
                ...details,
            });
            try {
                drawer = await ensureDrawer(taskUid);
                if (drawer.confirmation && !drawer.confirmation.ok) {
                    return {
                        taskUid,
                        drawerUid: drawer.uid,
                        uncertain: true,
                        partial: true,
                        notice: GRAPH_UNCERTAIN,
                        retry: retry({ drawerUid: drawer.uid }),
                    };
                }
                clockUid = await createBlock({
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
                        retry: retry({ drawerUid: drawer.uid, clockUid }),
                    };
                }
                const confirmed = entriesSnapshot.find(
                    item => item.clockUid === clockUid && item.running === true
                );
                if (!confirmed) {
                    return {
                        clockUid,
                        taskUid,
                        uncertain: true,
                        partial: true,
                        notice: GRAPH_UNCERTAIN,
                        retry: retry({ drawerUid: drawer.uid, clockUid }),
                    };
                }
            } catch (error) {
                if (open.length === 0) throw error;
                return {
                    ...(clockUid ? { clockUid } : {}),
                    taskUid,
                    ...(drawer?.uid ? { drawerUid: drawer.uid } : {}),
                    uncertain: true,
                    partial: true,
                    notice: GRAPH_UNCERTAIN,
                    retry: retry({
                        ...(drawer?.uid ? { drawerUid: drawer.uid } : {}),
                        ...(clockUid ? { clockUid } : {}),
                    }),
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
        });

    return enqueueMutation(mutation, {
        deferStart: Boolean(hasSidebarIntent),
        scheduleStart: scheduleMutationStartFn,
    });
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
                const outcome = await closeEntriesNow(entries, clockUids, now, { publish: false });
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
                // closeEntriesNow is silent for this batch; publish one final
                // snapshot notification after all results and actions settle.
                notify();
                return result;
            });
        } catch (error) {
            notice = GRAPH_UNCERTAIN;
            return uncertainCloseResult(error, readCompleted ? entries : running, clockUids, {
                preflight: prepareStarted,
            });
        }
    });
}

/** Close all currently running clocks and return a structured batch result. */
export async function clockOutAll({ now = new Date(), source = 'user' } = {}) {
    const outcome = await clockOutEntries(null, { now, source });
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
 * The graph scope is always confirmed here from a fresh hierarchy read while
 * inside the mutation queue.
 */
export async function clockOutCompletedTask(
    taskUid,
    {
        now = new Date(),
        source = 'auto-complete',
        retryClockUids = null,
    } = {}
) {
    return enqueueMutation(async () => {
        try {
            return await withGraphGuard(async () => {
                const entries = readAllEntries();
                const runningEntries = entries.filter(entry => entry.running);
                const taskUids = [...new Set([taskUid, ...runningEntries.map(entry => entry.taskUid)].filter(Boolean))];
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
                const affectedTaskUids = [taskUid, ...targetEntries.map(entry => entry.taskUid)];
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
            if (!entry) return { deleted: false, reason: 'not-found' };
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

            let drawer;
            try {
                drawer = getChildren(entry.taskUid).find(child => isDrawerBlock(child.string));
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
            } catch {
                return {
                    deleted: true,
                    uncertain: true,
                    partial: true,
                    notice: GRAPH_UNCERTAIN,
                    retry: {
                        action: 'discard-drawer',
                        taskUid: entry.taskUid,
                        clockUid,
                        ...(drawer?.uid ? { drawerUid: drawer.uid } : {}),
                    },
                };
            }

            notify();
            return true;
        })
    );
}

/** True when this block (or the one it references) has an open clock. */
export function isBlockRunning(blockUid) {
    try {
        const taskUid = resolveTaskUid(blockUid);
        return running.some(entry => entry.taskUid === taskUid);
    } catch {
        return true;
    }
}
