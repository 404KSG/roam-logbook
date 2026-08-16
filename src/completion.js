/**
 * Event-driven TODO/DONE completion handling.
 *
 * This module owns Pull Watch lifecycle. Graph mutations remain in the public
 * Clock action so they use the same mutation queue as manual actions.
 */

import * as clock from './clock.js';
import { readAllEntries, readHierarchy } from './entries.js';
import { taskStatus } from './org.js';
import { watchBlockString } from './roam.js';

// A reload can destroy the controller while Roam temporarily refuses a
// removePullWatch call. Keep that disposer at module scope so the next
// lifecycle can retry it before installing another set of completion watches.
const retryableDetachers = new Set();

const retryOrphanedDetachers = () => {
    for (const detach of [...retryableDetachers]) {
        try {
            const result = detach();
            if (result?.ok) retryableDetachers.delete(detach);
        } catch (error) {
            console.warn('[roam-logbook] deferred completion watch cleanup failed', error);
        }
    }
    return retryableDetachers.size === 0;
};

const issueUids = issue =>
    new Set([
        issue?.taskUid,
        issue?.parentUid,
        ...(Array.isArray(issue?.affectedUids) ? issue.affectedUids : []),
    ].filter(uid => typeof uid === 'string' && uid));

/** Whether an issue lies on the confirmed portion of one seed's ancestor path. */
const seedHasIssue = (seed, parentOf, issues) => {
    const affected = issues.flatMap(issue => [...issueUids(issue)]);
    const blocked = new Set(affected);
    const seen = new Set();
    let current = seed;
    while (current) {
        if (blocked.has(current)) return true;
        if (seen.has(current)) return true;
        seen.add(current);
        current = parentOf[current];
    }
    return false;
};

const ancestorsOf = (seed, parentOf) => {
    const result = [];
    const seen = new Set();
    let current = seed;
    while (current) {
        if (seen.has(current)) return null;
        seen.add(current);
        result.push(current);
        current = parentOf[current];
    }
    return result;
};

export function attachCompletionHandling({ pauseApi = null, onResult = null, onWatchIssue = null } = {}) {
    let watchCleanupReady = retryOrphanedDetachers();
    let disposed = false;
    const watches = new Map();
    const active = new Set();
    const retryClockUids = new Map();
    const retryAttempts = new Map();
    const lastStatus = new Map();
    let pending = new Set();
    let scheduled = false;

    const reportWatchIssue = issue => {
        try {
            onWatchIssue?.(issue);
        } catch (error) {
            console.error('[roam-logbook] completion watcher issue listener failed', error);
        }
    };

    const reportResult = result => {
        try {
            onResult?.(result);
        } catch (error) {
            console.error('[roam-logbook] completion result listener failed', error);
        }
    };

    const schedule = (uid, explicitRetryClockUids = null) => {
        if (disposed || !uid || active.has(uid)) return;
        if (Array.isArray(explicitRetryClockUids) && explicitRetryClockUids.length > 0) {
            const retry = retryClockUids.get(uid) || new Set();
            for (const clockUid of explicitRetryClockUids) {
                if (typeof clockUid === 'string' && clockUid) retry.add(clockUid);
            }
            retryClockUids.set(uid, retry);
        }
        pending.add(uid);
        if (scheduled) return;
        scheduled = true;
        Promise.resolve()
            .then(async () => {
                while (!disposed && pending.size > 0) {
                    const current = [...pending];
                    pending = new Set();
                    for (const taskUid of current) {
                        if (active.has(taskUid)) continue;
                        active.add(taskUid);
                        const retry = retryClockUids.get(taskUid);
                        retryClockUids.delete(taskUid);
                        try {
                            const result = await clock.clockOutCompletedTask(taskUid, {
                                source: 'auto-complete',
                                retryClockUids: retry ? [...retry] : null,
                                getPauseTaskUids: () => [
                                    ...(pauseApi?.getPaused?.() || []),
                                    ...(pauseApi?.getPendingResume?.() || []),
                                ].map(item => item.taskUid),
                                pruneCompleted: taskUids => pauseApi?.pruneCompleted?.(taskUids),
                            });
                            reportResult(result);

                            const remaining = [
                                ...(Array.isArray(result?.retry?.retryClockUids)
                                    ? result.retry.retryClockUids
                                    : []),
                                ...(Array.isArray(result?.pendingClockUids) ? result.pendingClockUids : []),
                            ].filter((clockUid, index, all) => typeof clockUid === 'string' && all.indexOf(clockUid) === index);
                            if (!result?.ok && remaining.length > 0) {
                                retryClockUids.set(taskUid, new Set(remaining));
                                // One bounded automatic retry handles a transient write failure. A
                                // persistent failure remains available for the next graph event,
                                // rather than spinning on the same watch notification forever.
                                const attempts = retryAttempts.get(taskUid) || 0;
                                if (attempts < 1 && !disposed) {
                                    retryAttempts.set(taskUid, attempts + 1);
                                    pending.add(taskUid);
                                }
                            } else if (result?.ok) {
                                retryAttempts.delete(taskUid);
                                retryClockUids.delete(taskUid);
                            }
                        } catch (error) {
                            const result = {
                                action: 'auto-clock-out',
                                source: 'auto-complete',
                                ok: false,
                                triggerUid: taskUid,
                                failed: 1,
                                pending: 1,
                                pendingClockUids: retry ? [...retry] : [],
                                uncertain: true,
                                partial: false,
                                retry: {
                                    action: 'auto-clock-out',
                                    taskUid,
                                    retryClockUids: retry ? [...retry] : [],
                                },
                                error,
                            };
                            reportResult(result);
                            if (retry) retryClockUids.set(taskUid, retry);
                            console.error('[roam-logbook] automatic completion action failed', error);
                        } finally {
                            active.delete(taskUid);
                        }
                    }
                }
                scheduled = false;
                if (!disposed && pending.size > 0) schedule([...pending][0]);
            })
            .catch(error => {
                scheduled = false;
                console.error('[roam-logbook] automatic completion reconciliation failed', error);
            });
    };

    const sync = (entries, event = {}) => {
        if (disposed || !Array.isArray(entries)) return;
        if (!watchCleanupReady) {
            watchCleanupReady = retryOrphanedDetachers();
            if (!watchCleanupReady) return;
        }
        const pauseTaskUids = [
            ...(pauseApi?.getPaused?.() || []),
            ...(pauseApi?.getPendingResume?.() || []),
        ].map(item => item.taskUid);
        const seeds = [
            ...new Set([...entries.map(entry => entry.taskUid), ...pauseTaskUids].filter(Boolean)),
        ];
        let hierarchy;
        try {
            hierarchy = readHierarchy(seeds, { includeSeedStrings: true });
        } catch (error) {
            reportWatchIssue({ type: 'hierarchy-read', error, affectedUids: seeds });
            console.warn('[roam-logbook] completion hierarchy could not be confirmed', error);
            return;
        }

        const desired = new Set();
        for (const seed of seeds) {
            if (seedHasIssue(seed, hierarchy.parentOf, hierarchy.issues)) continue;
            const component = ancestorsOf(seed, hierarchy.parentOf);
            if (!component) continue;
            for (const uid of component) desired.add(uid);
        }

        let installed = false;
        for (const uid of desired) {
            if (watches.has(uid)) continue;
            const result = watchBlockString(uid, () => schedule(uid));
            if (result.ok) {
                watches.set(uid, result);
                installed = true;
            } else {
                reportWatchIssue({ type: 'install', uid, error: result.error, result });
                console.warn('[roam-logbook] completion watch unavailable', uid, result.error);
            }
        }

        // An issue means this is not a complete hierarchy snapshot. Keep old
        // watches until the next clean read; healthy independent components still
        // get installed above.
        if (hierarchy.issues.length === 0) {
            for (const [uid, watch] of watches) {
                if (!desired.has(uid)) {
                    const result = watch.detach();
                    if (result?.ok) watches.delete(uid);
                    else {
                        reportWatchIssue({ type: 'remove', uid, error: result?.error, result });
                        console.warn('[roam-logbook] completion watch could not be removed', uid, result?.error);
                    }
                }
            }
        } else {
            for (const issue of hierarchy.issues) {
                reportWatchIssue({ type: 'hierarchy', issue });
            }
            console.warn('[roam-logbook] completion hierarchy is ambiguous; affected watches were retained');
        }

        const statusOf = new Map([
            ...entries.map(entry => [entry.taskUid, entry.status]),
            ...Object.entries(hierarchy.stringOf).map(([uid, string]) => [uid, taskStatus(string)]),
        ]);
        for (const uid of [...lastStatus.keys()]) {
            if (!desired.has(uid)) {
                lastStatus.delete(uid);
                retryAttempts.delete(uid);
                retryClockUids.delete(uid);
            }
        }
        const explicitReconciliation = event.explicit === true || event.reason === 'refresh' || event.reason === 'reconcile';
        for (const uid of desired) {
            const status = statusOf.get(uid);
            const previous = lastStatus.get(uid);
            lastStatus.set(uid, status);
            if (status !== 'DONE') {
                retryAttempts.delete(uid);
                retryClockUids.delete(uid);
            } else if (previous !== 'DONE' || (explicitReconciliation && retryClockUids.has(uid))) {
                if (explicitReconciliation) retryAttempts.delete(uid);
                schedule(uid);
            }
        }

        // The first graph read and watch installation are not atomic in Roam. A
        // second confirmed graph read closes the gap where a Task can become DONE
        // after the first snapshot but before its Pull Watch is active.
        const postInstallPass = Number(event.postInstallPass || 0);
        if (installed && postInstallPass < 2) {
            try {
                const confirmedEntries = readAllEntries().filter(entry => entry.running);
                sync(confirmedEntries, {
                    ...event,
                    postInstallPass: postInstallPass + 1,
                });
            } catch (error) {
                reportWatchIssue({ type: 'post-install-read', error, affectedUids: [...desired] });
                console.warn('[roam-logbook] completion post-install reconciliation failed', error);
            }
        }
    };

    const unsubscribe = clock.subscribe(sync);

    const detachAll = () => {
        const failedUids = [];
        for (const [uid, watch] of watches) {
            const result = watch.detach();
            if (result?.ok) watches.delete(uid);
            else {
                failedUids.push(uid);
                reportWatchIssue({ type: 'remove', uid, error: result?.error, result });
            }
        }
        const result = { ok: failedUids.length === 0, failedUids };
        if (result.ok) retryableDetachers.delete(detachAll);
        else retryableDetachers.add(detachAll);
        return result;
    };

    return () => {
        if (!disposed) {
            disposed = true;
            pending.clear();
            retryClockUids.clear();
            retryAttempts.clear();
            lastStatus.clear();
            unsubscribe();
        }
        return detachAll();
    };
}
