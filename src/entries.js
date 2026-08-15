/**
 * Reading every clock entry out of the graph.
 *
 * There is deliberately no cached mirror of this data: the LOGBOOK drawers *are*
 * the state. A running clock survives a reload, a crash, or an edit made on
 * another device, because it is just a `CLOCK::` block with no end stamp.
 */

import {
    isDrawerBlock,
    parseClockLineDetailed,
    referencedBlockUid,
    taskStatus,
    taskTitle,
} from './org.js';
import {
    query,
    queryOrThrow,
    validateQueryRows,
} from './roam.js';

// Filter on the drawer rather than on `CLOCK:` so that hand-written entries with
// odd spacing still come back; the JS parser is the real gate.
const entriesQuery = predicate =>
    `[:find ?clock-uid ?clock-string ?drawer-string ?task-uid ?task-string ?page-title
  :where
  [?d :block/string ?drawer-string]
  [(clojure.string/${predicate} ?drawer-string "LOGBOOK:")]
  [?d :block/children ?c]
  [?c :block/uid ?clock-uid]
  [?c :block/string ?clock-string]
  [?t :block/children ?d]
  [?t :block/uid ?task-uid]
  [(get-else $ ?t :block/string nil) ?task-string]
  [(get-else $ ?t :block/page nil) ?p]
  [(get-else $ ?p :node/title nil) ?page-title]]`;

/**
 * `includes?` also catches org's own `:LOGBOOK:` spelling, but it is the less
 * commonly whitelisted predicate — fall back rather than go silently inert.
 */
function queryEntryRows() {
    try {
        return queryOrThrow(entriesQuery('includes?'));
    } catch (error) {
        console.warn('[roam-logbook] includes? unavailable, using starts-with?', error);
    }
    try {
        return queryOrThrow(entriesQuery('starts-with?'));
    } catch (error) {
        console.error('[roam-logbook] could not read logbook entries', error);
        throw error;
    }
}

/**
 * @typedef {object} ClockEntry
 * @property {string} clockUid    uid of the `CLOCK::` block itself
 * @property {string} taskUid     uid of the task the drawer hangs under
 * @property {string|null} taskString  raw task block text, when recoverable
 * @property {string} title       display title for the task
 * @property {'TODO'|'DONE'|null} status
 * @property {string|null} pageTitle
 * @property {Date} start
 * @property {Date|null} end      null while the clock is running
 * @property {number|null} minutes
 * @property {number|null} computedMinutes  duration from the timestamps
 * @property {number|null} declaredMinutes  hand-written `=> H:MM`, if present
 * @property {number|null} effectiveMinutes  compatible reporting value
 * @property {object|null} issue            explainable data-health issue
 * @property {object[]} issues              all issues attached to this record
 * @property {string} rawClock              original CLOCK block text
 * @property {boolean} running
 */

/** Every parseable clock entry in the graph, newest start first. */
export function readAllEntries() {
    const rows = validateQueryRows(
        queryEntryRows(),
        'logbook entry',
        row =>
            row.length >= 6 &&
            typeof row[0] === 'string' &&
            typeof row[1] === 'string' &&
            typeof row[2] === 'string' &&
            typeof row[3] === 'string' &&
            (typeof row[4] === 'string' || row[4] === null || row[4] === undefined) &&
            (typeof row[5] === 'string' || row[5] === null || row[5] === undefined)
    );
    const entries = [];

    for (const [clockUid, clockString, drawerString, taskUid, taskString, pageTitle] of rows) {
        if (!isDrawerBlock(drawerString)) continue;
        const parsed = parseClockLineDetailed(clockString);
        if (!parsed.issue && !parsed.ok) continue;
        const value = parsed.ok ? parsed.value : null;
        const issues = [];
        const timingIssue = parsed.ok ? parsed.value.issue : parsed.issue;
        if (typeof taskString !== 'string' || taskString.trim() === '') {
            issues.push({
                code: 'orphan-task',
                message: 'Task metadata is missing; the Session is retained under Deleted task.',
                rawClock: clockString,
            });
        }
        if (timingIssue) issues.push({ ...timingIssue, rawClock: clockString });
        const title =
            typeof taskString === 'string' && taskString.trim() !== ''
                ? taskTitle(taskString)
                : `Deleted task · ${taskUid}`;
        entries.push({
            clockUid,
            taskUid,
            taskString: taskString ?? null,
            title,
            status: typeof taskString === 'string' ? taskStatus(taskString) : null,
            pageTitle: pageTitle ?? null,
            rawClock: clockString,
            start: value?.start ?? null,
            end: value?.end ?? null,
            minutes: value?.effectiveMinutes ?? null,
            computedMinutes: value?.computedMinutes ?? null,
            declaredMinutes: value?.declaredMinutes ?? null,
            effectiveMinutes: value?.effectiveMinutes ?? null,
            issue: issues[0] ?? null,
            issues,
            running: value?.running ?? false,
        });
    }

    entries.sort((a, b) => (b.start?.getTime() ?? -Infinity) - (a.start?.getTime() ?? -Infinity));
    return entries;
}

/** Just the open clocks — what the topbar counts and what "unfinished" means. */
export function readRunningEntries() {
    return readAllEntries().filter(entry => entry.running);
}

/**
 * Read the graph inputs needed by one dashboard operation.
 *
 * Keeping the entries and hierarchy together makes the snapshot boundary
 * explicit: callers can derive clock state and render from the same read rather
 * than asking the graph-backed clock module to read the entries a second time.
 */
export function readDashboardSnapshot() {
    const entries = readAllEntries();
    const hierarchy = readHierarchy([...new Set(entries.map(entry => entry.taskUid))]);
    return { entries, hierarchy };
}

// ---- hierarchy, for the dashboard's roll-up ----

/** Ancestor chains are walked a level at a time; a guard against a pathological graph. */
const MAX_ANCESTOR_DEPTH = 24;

// Requiring `:block/string` on the parent stops the walk at the page, which has
// a `:node/title` instead — exactly where a task tree should end.
const PARENTS_QUERY = `[:find ?uid ?parent-uid ?parent-string
  :in $ [?uid ...]
  :where
  [?b :block/uid ?uid]
  [?p :block/children ?b]
  [?p :block/uid ?parent-uid]
  [?p :block/string ?parent-string]]`;

const MIRRORS_QUERY = `[:find ?target-uid ?mirror-uid ?mirror-string
  :in $ [?target-uid ...]
  :where
  [?t :block/uid ?target-uid]
  [?m :block/refs ?t]
  [?m :block/uid ?mirror-uid]
  [?m :block/string ?mirror-string]]`;

const BLOCK_STRINGS_QUERY = `[:find ?uid ?string
  :in $ [?uid ...]
  :where
  [?b :block/uid ?uid]
  [?b :block/string ?string]]`;

const readBlockStrings = uids => {
    if (uids.length === 0) return {};
    const result = {};
    try {
        const rows = validateQueryRows(
            queryOrThrow(BLOCK_STRINGS_QUERY, uids),
            'block string batch',
            row => row.length >= 2 && typeof row[0] === 'string' && typeof row[1] === 'string'
        );
        for (const [uid, string] of rows) result[uid] = string;
    } catch (error) {
        console.warn('[roam-logbook] referenced task strings unavailable for roll-up', error);
    }
    return result;
};

/**
 * The block structure the dashboard needs to nest tasks under each other.
 *
 * @typedef {object} Hierarchy
 * @property {Record<string,string>} parentOf  block uid → its parent's uid
 * @property {Record<string,string>} stringOf  block uid → its text
 * @property {Record<string,string[]>} mirrorsOf  task uid → blocks that are pure
 *   references to it, so a task referenced under another task rolls up there too
 *
 * Only tasks that actually carry clock entries are looked up, which keeps this to
 * a handful of small queries no matter how large the graph is. The flip side is
 * that a *parent* task's own mirrors are not followed — a second-order case left
 * for a later pass.
 */
export function readHierarchy(taskUids) {
    const parentOf = {};
    const stringOf = {};
    const mirrorsOf = {};
    const seeds = new Set(taskUids);

    if (seeds.size === 0) return { parentOf, stringOf, mirrorsOf };

    try {
        const mirrorRows = validateQueryRows(
            queryOrThrow(MIRRORS_QUERY, [...seeds]),
            'mirror',
            row => row.length >= 3 && row.every(value => typeof value === 'string')
        );
        for (const [targetUid, mirrorUid, mirrorString] of mirrorRows) {
            // `:block/refs` also fires for a block that merely mentions the task
            // in passing; only a block that is *nothing but* the reference counts.
            if (referencedBlockUid(mirrorString) !== targetUid) continue;
            (mirrorsOf[targetUid] ||= []).push(mirrorUid);
            stringOf[mirrorUid] = mirrorString;
        }
    } catch (error) {
        // Roll-up degrades to real block structure only, rather than going blank.
        console.warn('[roam-logbook] block references unavailable for roll-up', error);
    }

    let frontier = [...seeds, ...Object.values(mirrorsOf).flat()];
    for (let depth = 0; depth < MAX_ANCESTOR_DEPTH && frontier.length > 0; depth += 1) {
        const next = [];
        const parentRows = validateQueryRows(
            query(PARENTS_QUERY, frontier),
            'parent',
            row => row.length >= 3 && row.every(value => typeof value === 'string')
        );
        const referencedTargets = parentRows
            .map(([, , rawParentString]) => referencedBlockUid(rawParentString))
            .filter(Boolean);
        const referencedStrings = readBlockStrings([...new Set(referencedTargets)]);
        for (const [uid, rawParentUid, rawParentString] of parentRows) {
            // Sub-tasks are routinely written under a `((reference))` to a task
            // rather than under the task itself — pulling a task into a daily note
            // and working beneath it. The reference stands for what it points at,
            // so the walk continues from the original block.
            const referenced = referencedBlockUid(rawParentString);
            const parentUid = referenced || rawParentUid;
            const parentString = referenced ? referencedStrings[parentUid] : rawParentString;

            parentOf[uid] = parentUid;
            if (parentUid in stringOf) continue;
            stringOf[parentUid] = parentString;
            next.push(parentUid);
        }
        frontier = next;
    }

    return { parentOf, stringOf, mirrorsOf };
}
