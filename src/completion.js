/**
 * Event-driven TODO/DONE completion handling.
 *
 * This module owns Pull Watch lifecycle. Graph mutations remain in the public
 * Clock action so they use the same mutation queue as manual actions.
 */

import * as clock from './clock.js';
import { readHierarchy } from './entries.js';
import { taskStatus } from './org.js';
import { watchBlockString } from './roam.js';

export function attachCompletionHandling({ pauseApi = null } = {}) {
    let disposed = false;
    const watches = new Map();
    const active = new Set();
    let pending = new Set();
    let scheduled = false;

    const detachAll = () => {
        for (const watch of watches.values()) watch.detach();
        watches.clear();
    };

    const schedule = uid => {
        if (disposed || active.has(uid)) return;
        pending.add(uid);
        if (scheduled) return;
        scheduled = true;
        Promise.resolve().then(async () => {
            while (!disposed && pending.size > 0) {
                const current = [...pending];
                pending = new Set();
                for (const taskUid of current) {
                    if (active.has(taskUid)) continue;
                    active.add(taskUid);
                    try {
                        await clock.clockOutCompletedTask(taskUid, {
                            source: 'auto-complete',
                            getPauseTaskUids: () => [
                                ...(pauseApi?.getPaused?.() || []),
                                ...(pauseApi?.getPendingResume?.() || []),
                            ].map(item => item.taskUid),
                            pruneCompleted: taskUids => pauseApi?.pruneCompleted?.(taskUids),
                        });
                    } catch (error) {
                        console.error('[roam-logbook] automatic completion action failed', error);
                    } finally {
                        active.delete(taskUid);
                    }
                }
            }
            scheduled = false;
        }).catch(error => {
            scheduled = false;
            console.error('[roam-logbook] automatic completion reconciliation failed', error);
        });
    };

    const sync = entries => {
        if (disposed || !Array.isArray(entries)) return;
        const pauseTaskUids = [
            ...(pauseApi?.getPaused?.() || []),
            ...(pauseApi?.getPendingResume?.() || []),
        ].map(item => item.taskUid);
        const seeds = [
            ...new Set([...entries.map(entry => entry.taskUid), ...pauseTaskUids].filter(Boolean)),
        ];
        let hierarchy;
        try {
            hierarchy = readHierarchy(seeds);
        } catch (error) {
            console.warn('[roam-logbook] completion hierarchy could not be confirmed', error);
            return;
        }
        if (hierarchy.issues.length > 0) {
            console.warn('[roam-logbook] completion hierarchy is ambiguous; watches were retained');
            return;
        }
        const desired = new Set(seeds);
        for (const seed of seeds) {
            const seen = new Set();
            let current = seed;
            while (current && hierarchy.parentOf[current]) {
                if (seen.has(current)) {
                    console.warn('[roam-logbook] completion hierarchy contains a cycle', seed);
                    return;
                }
                seen.add(current);
                current = hierarchy.parentOf[current];
                desired.add(current);
            }
        }

        for (const uid of desired) {
            if (watches.has(uid)) continue;
            const result = watchBlockString(uid, () => schedule(uid));
            if (result.ok) watches.set(uid, result);
            else console.warn('[roam-logbook] completion watch unavailable', uid, result.error);
        }
        for (const [uid, watch] of watches) {
            if (!desired.has(uid)) {
                watch.detach();
                watches.delete(uid);
            }
        }

        const statusOf = new Map([
            ...entries.map(entry => [entry.taskUid, entry.status]),
            ...Object.entries(hierarchy.stringOf).map(([uid, string]) => [
                uid,
                taskStatus(string),
            ]),
        ]);
        for (const uid of desired) {
            if (statusOf.get(uid) === 'DONE') schedule(uid);
        }
    };

    const unsubscribe = clock.subscribe(sync);
    return () => {
        if (disposed) return;
        disposed = true;
        pending.clear();
        unsubscribe();
        detachAll();
    };
}
