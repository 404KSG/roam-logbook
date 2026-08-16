/**
 * Pure aggregation over clock entries for the Dashboard.
 *
 * Range filtering uses each entry's start day. An entry that runs across
 * midnight counts wholly against the day it began, which is how org's own
 * clock reports read and keeps a session indivisible.
 */

import { isTaskBlock, taskStatus, taskTitle } from './org.js';
import { dateKey, startOfDay, startOfDaysAgo } from './time.js';

export const EMPTY_HIERARCHY = { parentOf: {}, stringOf: {}, mirrorsOf: {} };

export const RANGES = [
    { id: 'today', label: 'Today', days: 1 },
    { id: 'week', label: 'Last 7 days', days: 7 },
    { id: 'month', label: 'Last 30 days', days: 30 },
    { id: 'all', label: 'All time', days: null },
];

export function getRange(id) {
    return RANGES.find(range => range.id === id) || RANGES[1];
}

/** Minutes an entry is worth right now — running clocks count up to `now`. */
export function entryMinutes(entry, now) {
    if (!entry?.start) return 0;
    if (!entry.running) return entry.effectiveMinutes ?? entry.minutes ?? 0;
    return Math.max(0, Math.floor((now.getTime() - entry.start.getTime()) / 60000));
}

/** Entries whose start falls on or after the range's first midnight. */
export function filterByRange(entries, rangeId, now) {
    const { days } = getRange(rangeId);
    if (days === null) return entries.slice();
    const from = days === 1 ? startOfDay(now) : startOfDaysAgo(now, days - 1);
    return entries.filter(entry => entry.start && entry.start.getTime() >= from.getTime());
}

function totalMinutes(entries, now) {
    return entries.reduce((sum, entry) => sum + entryMinutes(entry, now), 0);
}

/** One row per task, heaviest first. */
export function summariseByTask(entries, now) {
    const byTask = new Map();

    for (const entry of entries) {
        if (!entry.start) continue;
        let row = byTask.get(entry.taskUid);
        if (!row) {
            row = {
                taskUid: entry.taskUid,
                title: entry.title,
                status: entry.status ?? null,
                pageTitle: entry.pageTitle,
                minutes: 0,
                sessions: 0,
                running: false,
                lastActivity: entry.start,
            };
            byTask.set(entry.taskUid, row);
        }
        row.minutes += entryMinutes(entry, now);
        row.sessions += 1;
        row.running = row.running || entry.running;
        const activity = entry.end ?? entry.start;
        if (activity.getTime() > row.lastActivity.getTime()) row.lastActivity = activity;
    }

    return [...byTask.values()].sort((a, b) => b.minutes - a.minutes);
}

/**
 * Session-level metrics. Each CLOCK entry is counted exactly once; this is
 * deliberately independent from the task forest because parent rollups may
 * show a child in more than one branch.
 */
export function summariseSessionMetrics(entries, now) {
    const durations = entries
        .filter(entry => entry?.start)
        .map(entry => entryMinutes(entry, now))
        .map(minutes => Math.max(0, minutes));
    const sorted = durations.slice().sort((a, b) => a - b);
    const sessions = durations.length;
    const focusMinutes = durations.reduce((sum, minutes) => sum + minutes, 0);
    const middle = Math.floor(sorted.length / 2);
    const medianMinutes =
        sorted.length === 0
            ? 0
            : sorted.length % 2 === 1
              ? sorted[middle]
              : (sorted[middle - 1] + sorted[middle]) / 2;
    const activeDays = new Set(
        entries.filter(entry => entry?.start).map(entry => dateKey(entry.start))
    );

    return {
        focusMinutes,
        sessions,
        completedSessions: entries.filter(entry => entry?.start && !entry.running).length,
        runningSessions: entries.filter(entry => entry?.start && entry.running).length,
        activeDays: activeDays.size,
        averageMinutes: sessions === 0 ? 0 : focusMinutes / sessions,
        longestMinutes: sorted.at(-1) || 0,
        medianMinutes,
    };
}

// ---- task tree ----

/** Guard for a graph where references have been chained into a loop. */
const MAX_WALK = 50;

/**
 * The closest ancestor that is itself a task.
 *
 * Plain blocks between two tasks are skipped rather than becoming tree levels —
 * a note or a heading under a TODO is context, not a unit of work.
 */
function nearestTaskAncestor(uid, { parentOf, stringOf }) {
    let current = parentOf[uid];
    for (let steps = 0; current && steps < MAX_WALK; steps += 1) {
        if (isTaskBlock(stringOf[current])) return current;
        current = parentOf[current];
    }
    return null;
}

/**
 * Nest task rollups under their parent tasks.
 *
 * A task is nested under a parent by real block structure *and* by any block that
 * is a bare `((reference))` to it — referencing a task under a project is how Roam
 * users express the same relationship, so the roll-up has to honour both. That
 * makes multiple parents possible, and a task then appears under each of them:
 * `total` deliberately overlaps between branches, which is why the dashboard's
 * headline figures are summed from entries instead of from this tree.
 *
 * @returns {Array<object>} root nodes, heaviest first, each with `own`, `total`,
 *   `children` and `occurrences` (how many parents it hangs under).
 */
export function buildTaskForest(taskRows, hierarchy = EMPTY_HIERARCHY) {
    const nodes = new Map();
    for (const row of taskRows) {
        nodes.set(row.taskUid, { ...row, own: row.minutes, children: [], parents: new Set() });
    }

    // Ancestors join the tree even with no time of their own — a project whose
    // work all happened in its sub-tasks still has to show up as the parent.
    const pending = [...nodes.keys()];
    while (pending.length > 0) {
        const uid = pending.shift();
        const parents = new Set();

        const structural = nearestTaskAncestor(uid, hierarchy);
        if (structural) parents.add(structural);
        for (const mirrorUid of hierarchy.mirrorsOf[uid] || []) {
            const viaReference = nearestTaskAncestor(mirrorUid, hierarchy);
            if (viaReference) parents.add(viaReference);
        }

        for (const parentUid of parents) {
            if (parentUid === uid) continue;
            if (!nodes.has(parentUid)) {
                nodes.set(parentUid, {
                    taskUid: parentUid,
                    title: taskTitle(hierarchy.stringOf[parentUid]),
                    status: taskStatus(hierarchy.stringOf[parentUid]),
                    pageTitle: null,
                    minutes: 0,
                    own: 0,
                    sessions: 0,
                    running: false,
                    children: [],
                    parents: new Set(),
                });
                pending.push(parentUid);
            }
            nodes.get(uid).parents.add(parentUid);
            const siblings = nodes.get(parentUid).children;
            if (!siblings.includes(uid)) siblings.push(uid);
        }
    }

    // `path` rather than a global seen-set: a task reached down two branches is
    // counted in both (intended overlap), while a true cycle is cut off.
    const expand = (uid, path) => {
        const node = nodes.get(uid);
        const base = {
            taskUid: node.taskUid,
            title: node.title,
            status: node.status ?? null,
            pageTitle: node.pageTitle,
            own: node.own,
            sessions: node.sessions,
            running: node.running,
            occurrences: node.parents.size,
        };
        if (path.has(uid)) return { ...base, total: node.own, children: [], truncated: true };

        const nextPath = new Set(path).add(uid);
        const children = node.children
            .map(childUid => expand(childUid, nextPath))
            .sort((a, b) => b.total - a.total);
        return {
            ...base,
            total: node.own + children.reduce((sum, child) => sum + child.total, 0),
            children,
            truncated: false,
        };
    };

    const forest = [];
    const covered = new Set();
    const addRoot = uid => {
        const tree = expand(uid, new Set());
        forest.push(tree);
        (function cover(node) {
            covered.add(node.taskUid);
            node.children.forEach(cover);
        })(tree);
    };

    for (const [uid, node] of nodes) if (node.parents.size === 0) addRoot(uid);
    // Inside a reference cycle every node has a parent, so nothing qualifies as a
    // root and the whole component would silently drop out of the view. Promote
    // whatever is left instead — showing it oddly beats losing the time.
    for (const uid of nodes.keys()) if (!covered.has(uid)) addRoot(uid);

    return forest.sort((a, b) => b.total - a.total);
}

/**
 * Depth-first flattening, for rendering the tree as indented table rows.
 *
 * @param {object} [options]
 * @param {(node: object) => boolean} [options.isCollapsed] hides a node's
 *   descendants without hiding the node itself
 */
export function flattenForest(forest, options = {}, depth = 0) {
    return forest.flatMap(node => {
        const collapsed = node.children.length > 0 && Boolean(options.isCollapsed?.(node));
        const row = { ...node, depth, collapsed, hasChildren: node.children.length > 0 };
        return collapsed ? [row] : [row, ...flattenForest(node.children, options, depth + 1)];
    });
}

/** Everything the dashboard renders, computed in one pass. */
export function buildDashboard(entries, { now, rangeId, hierarchy = EMPTY_HIERARCHY }) {
    const inRange = filterByRange(entries, rangeId, now);
    const tasks = summariseByTask(inRange, now);
    return {
        rangeId,
        entries: inRange,
        // Summed from entries, so this stays the honest figure even when the tree
        // shows the same task under more than one parent.
        totalMinutes: totalMinutes(inRange, now),
        todayMinutes: totalMinutes(filterByRange(entries, 'today', now), now),
        weekMinutes: totalMinutes(filterByRange(entries, 'week', now), now),
        tasks,
        tree: buildTaskForest(tasks, hierarchy),
        running: entries.filter(entry => entry.running),
        sessionMetrics: summariseSessionMetrics(inRange, now),
        issues: entries.filter(entry => entry.issue),
    };
}

/**
 * Running clocks older than `staleHours` — almost always a session someone
 * forgot to close, so the UI surfaces them for an explicit decision.
 */
export function findStaleClocks(entries, now, staleHours) {
    const cutoff = now.getTime() - staleHours * 3600_000;
    return entries.filter(entry => entry.running && entry.start.getTime() < cutoff);
}
