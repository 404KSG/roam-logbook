/**
 * Pure Active Work derivation.
 *
 * A Session is a persisted CLOCK interval. Active Work is the short-lived
 * navigation set around the one currently focused interval: the Focused Task
 * plus distinct Tasks whose most recent Session ended within the work window.
 * Recent items never imply a second running CLOCK.
 */

export const ACTIVE_WORK_WINDOW_MINUTES = 45;
export const ACTIVE_WORK_WINDOW_MS = ACTIVE_WORK_WINDOW_MINUTES * 60_000;

const instantOf = value => {
    if (value instanceof Date) return value.getTime();
    const timestamp = Number(value);
    return Number.isFinite(timestamp) ? timestamp : null;
};

const normalizeWindowMinutes = value =>
    Number.isFinite(Number(value)) && Number(value) > 0
        ? Number(value)
        : ACTIVE_WORK_WINDOW_MINUTES;

/**
 * Return the whole minutes left in an Open Line's activity window.
 *
 * Callers should filter out zero before rendering: an exact boundary is no
 * longer Active Work, while any visible fraction is shown as at least 1m.
 */
export function openLineMinutesLeft(
    entry,
    now = Date.now(),
    windowMinutes = ACTIVE_WORK_WINDOW_MINUTES
) {
    const endedAt = instantOf(entry?.end);
    const nowMs = instantOf(now) ?? Date.now();
    if (endedAt === null) return 0;
    const remainingMs = normalizeWindowMinutes(windowMinutes) * 60_000 - (nowMs - endedAt);
    if (remainingMs <= 0) return 0;
    return Math.max(1, Math.ceil(remainingMs / 60_000));
}

const compareNewest = (left, right) =>
    (instantOf(right?.start) ?? -Infinity) - (instantOf(left?.start) ?? -Infinity);

/** Choose a deterministic Focused entry when a legacy graph has overlap. */
export function chooseFocusedEntry(entries = []) {
    return entries
        .filter(entry => entry?.running && instantOf(entry.start) !== null)
        .sort(compareNewest)[0] || null;
}

const buildInvariantIndex = snapshot => {
    const focusedEntry = chooseFocusedEntry(snapshot);
    const completedMinutesByTask = new Map();
    const recentCandidates = [];

    for (let sourceIndex = 0; sourceIndex < snapshot.length; sourceIndex += 1) {
        const entry = snapshot[sourceIndex];
        if (!entry || entry.running) continue;

        if (entry.taskUid) {
            completedMinutesByTask.set(
                entry.taskUid,
                (completedMinutesByTask.get(entry.taskUid) || 0) + (Number(entry.minutes) || 0)
            );
        }

        const endedAt = instantOf(entry.end);
        if (endedAt === null) continue;
        recentCandidates.push({ entry, endedAt, sourceIndex });
    }

    recentCandidates.sort((left, right) =>
        (right.endedAt ?? -Infinity) - (left.endedAt ?? -Infinity) ||
        left.sourceIndex - right.sourceIndex
    );

    return {
        focusedEntry,
        completedMinutesByTask,
        recentCandidates,
    };
};

/**
 * Create an Active Work deriver with a weak, immutable-snapshot index cache.
 *
 * The cache is scoped to one deriver so callers that reset their state can
 * discard the deriver without sharing any derived data with a later state.
 * The default `buildActiveWork` export below uses one module-local deriver.
 */
export function createActiveWorkDeriver() {
    const snapshotIndexes = new WeakMap();
    let snapshotBuilds = 0;

    const getSnapshotIndex = snapshot => {
        const cached = snapshotIndexes.get(snapshot);
        if (cached) return cached;

        const index = buildInvariantIndex(snapshot);
        snapshotIndexes.set(snapshot, index);
        snapshotBuilds += 1;
        return index;
    };

    const build = (
        entries = [],
        {
            now = Date.now(),
            windowMinutes = ACTIVE_WORK_WINDOW_MINUTES,
        } = {}
    ) => {
        const snapshot = Array.isArray(entries) ? entries : [];
        const nowMs = instantOf(now) ?? Date.now();
        const normalizedWindow = normalizeWindowMinutes(windowMinutes);
        const windowMs = normalizedWindow * 60_000;
        const {
            focusedEntry,
            completedMinutesByTask,
            recentCandidates,
        } = getSnapshotIndex(snapshot);

        const recentByTask = new Map();
        const firstEligibleIndexByTask = new Map();
        for (const candidate of recentCandidates) {
            const age = nowMs - candidate.endedAt;
            if (age < 0) continue;
            if (age >= windowMs) break;
            if (candidate.entry.taskUid === focusedEntry?.taskUid) continue;

            const taskUid = candidate.entry.taskUid;
            const firstEligibleIndex = firstEligibleIndexByTask.get(taskUid);
            if (firstEligibleIndex === undefined || candidate.sourceIndex < firstEligibleIndex) {
                firstEligibleIndexByTask.set(taskUid, candidate.sourceIndex);
            }
            const previous = recentByTask.get(taskUid);
            if (!previous || candidate.endedAt > previous.endedAt) {
                recentByTask.set(taskUid, candidate);
            }
        }
        const recent = [...recentByTask.values()]
            .sort(
                (left, right) =>
                    right.endedAt - left.endedAt ||
                    firstEligibleIndexByTask.get(left.entry.taskUid) -
                        firstEligibleIndexByTask.get(right.entry.taskUid)
            )
            .map(candidate => candidate.entry);

        const focused = focusedEntry
            ? {
                  ...focusedEntry,
                  priorMinutes: completedMinutesByTask.get(focusedEntry.taskUid) || 0,
                  activeKind: 'focused',
              }
            : null;
        const recentItems = recent.map(item => ({
            ...item,
            priorMinutes: completedMinutesByTask.get(item.taskUid) || 0,
            remainingMinutes: openLineMinutesLeft(item, nowMs, normalizedWindow),
            activeKind: 'recent',
        }));
        const allItems = [focused, ...recentItems].filter(Boolean);
        const uniqueItems = [...new Map(allItems.map(item => [item.taskUid, item])).values()];
        return {
            focused,
            recent: recentItems,
            items: uniqueItems,
            count: uniqueItems.length,
            windowMinutes: normalizedWindow,
        };
    };

    return {
        build,
        getCacheStats: () => ({ snapshotBuilds }),
    };
}

const defaultDeriver = createActiveWorkDeriver();

/**
 * Build the current Active Work set from a confirmed graph snapshot.
 *
 * The result is intentionally small and immutable-by-convention: callers may
 * render it or retain it until the next graph refresh without changing the
 * source entries.
 */
export function buildActiveWork(
    entries = [],
    options = {}
) {
    return defaultDeriver.build(entries, options);
}
