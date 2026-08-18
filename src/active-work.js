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

/**
 * Build the current Active Work set from a confirmed graph snapshot.
 *
 * The result is intentionally small and immutable-by-convention: callers may
 * render it or retain it until the next graph refresh without changing the
 * source entries.
 */
export function buildActiveWork(
    entries = [],
    {
        now = Date.now(),
        windowMinutes = ACTIVE_WORK_WINDOW_MINUTES,
    } = {}
) {
    const snapshot = Array.isArray(entries) ? entries : [];
    const nowMs = instantOf(now) ?? Date.now();
    const normalizedWindow = normalizeWindowMinutes(windowMinutes);
    const windowMs = normalizedWindow * 60_000;
    const focusedEntry = chooseFocusedEntry(snapshot);
    const completedMinutesByTask = new Map();
    for (const entry of snapshot) {
        if (!entry || entry.running || !entry.taskUid) continue;
        completedMinutesByTask.set(
            entry.taskUid,
            (completedMinutesByTask.get(entry.taskUid) || 0) + (Number(entry.minutes) || 0)
        );
    }

    const recentByTask = new Map();
    for (const candidate of snapshot) {
        if (
            !candidate ||
            candidate.running ||
            candidate.taskUid === focusedEntry?.taskUid
        ) continue;
        const endedAt = instantOf(candidate.end);
        if (endedAt === null) continue;
        const age = nowMs - endedAt;
        if (age < 0 || age >= windowMs) continue;
        const previous = recentByTask.get(candidate.taskUid);
        if (!previous || endedAt > instantOf(previous.end)) recentByTask.set(candidate.taskUid, candidate);
    }

    const recent = [...recentByTask.values()].sort(
        (left, right) => (instantOf(right.end) ?? -Infinity) - (instantOf(left.end) ?? -Infinity)
    );
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
}
