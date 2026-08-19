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
                taskString: entry.taskString ?? null,
                title: entry.title,
                status: entry.status ?? null,
                pageTitle: entry.pageTitle,
                minutes: 0,
                sessions: 0,
                running: false,
                lastActivity: entry.start,
            };
            byTask.set(entry.taskUid, row);
        } else if (!row.taskString && entry.taskString) {
            // A later CLOCK row can still carry recoverable task text when an
            // earlier historical row was orphaned; keep the raw string for UI
            // formatting without changing the canonical title.
            row.taskString = entry.taskString;
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
export const MAX_TASK_FOREST_NODES = 5000;

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
    for (let pendingIndex = 0; pendingIndex < pending.length; pendingIndex += 1) {
        const uid = pending[pendingIndex];
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
                    taskString: hierarchy.stringOf[parentUid] ?? null,
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
    let expandedNodes = 0;
    const expand = (uid, path) => {
        const node = nodes.get(uid);
        const base = {
            taskUid: node.taskUid,
            taskString: node.taskString ?? null,
            title: node.title,
            status: node.status ?? null,
            pageTitle: node.pageTitle,
            own: node.own,
            sessions: node.sessions,
            running: node.running,
            occurrences: node.parents.size,
        };
        if (path.has(uid)) return { ...base, total: node.own, children: [], truncated: true };
        if (expandedNodes >= MAX_TASK_FOREST_NODES) {
            return { ...base, total: node.own, children: [], truncated: true };
        }
        expandedNodes += 1;

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

export const TASK_FILTERS = Object.freeze(['ALL', 'TODO', 'DONE']);
export const TASK_SORT_FIELDS = Object.freeze(['sessions', 'own', 'total']);
export const TASK_SORT_DIRECTIONS = Object.freeze(['asc', 'desc']);

const TASK_FILTER_SET = new Set(TASK_FILTERS);
const TASK_SORT_FIELD_SET = new Set(TASK_SORT_FIELDS);
const TASK_SORT_DIRECTION_SET = new Set(TASK_SORT_DIRECTIONS);

function normaliseTaskFilter(filter) {
    const value = String(filter ?? 'ALL').toUpperCase();
    if (!TASK_FILTER_SET.has(value)) {
        throw new RangeError(`Unknown task filter: ${filter}`);
    }
    return value;
}

function normaliseSortBy(sortBy) {
    const value = sortBy ?? 'total';
    if (!TASK_SORT_FIELD_SET.has(value)) {
        throw new RangeError(`Unknown task sort field: ${sortBy}`);
    }
    return value;
}

function normaliseDirection(direction) {
    const value = direction ?? 'desc';
    if (!TASK_SORT_DIRECTION_SET.has(value)) {
        throw new RangeError(`Unknown task sort direction: ${direction}`);
    }
    return value;
}

function taskIdentity(node) {
    return node?.taskUid ? `uid:${node.taskUid}` : node;
}

function taskChildren(node) {
    return Array.isArray(node?.children) ? node.children : [];
}

function statusMatches(node, filter) {
    return filter === 'ALL' || String(node?.status ?? '').toUpperCase() === filter;
}

function collectTaskCounts(forest, filter) {
    const all = new Set();
    const matches = new Set();
    const visit = node => {
        const identity = taskIdentity(node);
        all.add(identity);
        if (statusMatches(node, filter)) matches.add(identity);
        for (const child of taskChildren(node)) visit(child);
    };
    for (const node of forest) visit(node);
    return { totalCount: all.size, matchCount: matches.size };
}

function cloneFilteredNode(node, filter) {
    const children = taskChildren(node)
        .map(child => cloneFilteredNode(child, filter))
        .filter(Boolean);
    const matches = statusMatches(node, filter);
    if (filter !== 'ALL' && !matches && children.length === 0) return null;

    return {
        ...node,
        ...(node.total !== undefined ? { unfilteredTotal: node.total } : {}),
        total: (node.own ?? 0) + children.reduce((sum, child) => sum + (child.total ?? 0), 0),
        context: filter === 'ALL' ? false : !matches,
        children,
    };
}

/**
 * Filter a task forest without changing the source nodes or their child arrays.
 *
 * A matching descendant keeps the minimal ancestor path needed to explain its
 * position. Those non-matching ancestors are returned with `context: true`.
 * Unknown task statuses match only the `ALL` filter.
 *
 * @returns {{forest: Array<object>, filter: 'ALL'|'TODO'|'DONE', matchCount: number, totalCount: number}}
 */
export function filterTaskForest(forest, filter = 'ALL') {
    const normalisedFilter = normaliseTaskFilter(filter);
    const source = Array.isArray(forest) ? forest : [];
    const counts = collectTaskCounts(source, normalisedFilter);
    return {
        forest: source.map(node => cloneFilteredNode(node, normalisedFilter)).filter(Boolean),
        filter: normalisedFilter,
        ...counts,
    };
}

function compareText(left, right) {
    const a = String(left ?? '');
    const b = String(right ?? '');
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}

function numericMetric(node, sortBy) {
    const value = Number(node?.[sortBy]);
    return Number.isFinite(value) ? value : 0;
}

function compareTaskNodes(left, right, sortBy, direction) {
    const difference = numericMetric(left, sortBy) - numericMetric(right, sortBy);
    if (difference !== 0) return direction === 'asc' ? difference : -difference;

    const titleDifference = compareText(left?.title, right?.title);
    if (titleDifference !== 0) return titleDifference;
    return compareText(left?.taskUid, right?.taskUid);
}

function sortTaskNode(node, sortBy, direction) {
    const children = taskChildren(node)
        .map(child => sortTaskNode(child, sortBy, direction))
        .sort((left, right) => compareTaskNodes(left, right, sortBy, direction));
    return { ...node, children };
}

/** Return a recursively sorted copy of a task forest. */
export function sortTaskForest(forest, options = {}) {
    const source = Array.isArray(forest) ? forest : [];
    const sortBy = normaliseSortBy(options?.sortBy);
    const direction = normaliseDirection(options?.direction);
    return source
        .map(node => sortTaskNode(node, sortBy, direction))
        .sort((left, right) => compareTaskNodes(left, right, sortBy, direction));
}

/**
 * Apply the Dashboard's task-tree transformation as a pure data operation.
 * Sorting options are accepted here so the public seam can remain stable while
 * the filter and recursive sibling sort are used together by the Dashboard.
 */
export function transformTaskForest(forest, options = {}) {
    const transformOptions = options ?? {};
    const filtered = filterTaskForest(forest, transformOptions.filter);
    const sortBy = normaliseSortBy(transformOptions.sortBy);
    const direction = normaliseDirection(transformOptions.direction);
    return {
        ...filtered,
        forest: sortTaskForest(filtered.forest, { sortBy, direction }),
        sortBy,
        direction,
    };
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
