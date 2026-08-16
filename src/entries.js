/**
 * Reading every clock entry out of the graph.
 *
 * There is deliberately no cached mirror of this data: the LOGBOOK drawers *are*
 * the state. A running clock survives a reload, a crash, or an edit made on
 * another device, because it is just a `CLOCK:` block with no end stamp. The
 * reader also accepts historical `CLOCK::` and pasted Org drawer variants.
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
    withGraphReadIssue,
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
  [(get-else $ ?t :block/string "") ?task-string]
  [(get-else $ ?t :block/page "") ?p]
  [(get-else $ ?p :node/title "") ?page-title]]`;

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
        throw withGraphReadIssue(error, { source: 'entries' });
    }
}

/**
 * @typedef {object} ClockEntry
 * @property {string} clockUid    uid of the `CLOCK:` block itself
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
 * @property {number|null} effectiveMinutes  timestamp-derived reporting value
 * @property {object|null} issue            explainable data-health issue
 * @property {object[]} issues              all issues attached to this record
 * @property {string} rawClock              original CLOCK block text
 * @property {boolean} running
 */

/** Every parseable clock entry in the graph, newest start first. */
export function readAllEntries() {
    let rows;
    try {
        rows = validateQueryRows(
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
    } catch (error) {
        throw withGraphReadIssue(error, { source: 'entries' });
    }
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
    let rows;
    try {
        rows = validateQueryRows(
            queryOrThrow(BLOCK_STRINGS_QUERY, uids),
            'block string batch',
            row => row.length >= 2 && typeof row[0] === 'string' && typeof row[1] === 'string'
        );
    } catch (error) {
        throw withGraphReadIssue(error, { source: 'block-string', affectedUids: uids });
    }
    for (const [uid, string] of rows) result[uid] = string;
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
 * Only supplied seed tasks and their ancestors are looked up, which keeps this
 * to a handful of small queries no matter how large the graph is. Callers may
 * seed paused or pending-resume Tasks as well as Tasks with clock entries. The
 * flip side is that a *parent* task's own mirrors are not followed — a
 * second-order case left for a later pass.
 */
export function readHierarchy(taskUids, { includeSeedStrings = false } = {}) {
    const parentOf = {};
    const stringOf = {};
    const mirrorsOf = {};
    const issues = [];
    const seeds = new Set(taskUids);

    if (seeds.size === 0) return { parentOf, stringOf, mirrorsOf, issues };

    // Seed Tasks may be paused-only and therefore absent from readAllEntries.
    // Their own status still belongs in the confirmed hierarchy snapshot used
    // by completion reconciliation.
    if (includeSeedStrings) Object.assign(stringOf, readBlockStrings([...seeds]));

    let mirrorRows;
    try {
        mirrorRows = validateQueryRows(
            queryOrThrow(MIRRORS_QUERY, [...seeds]),
            'mirror',
            row => row.length >= 3 && row.every(value => typeof value === 'string')
        );
    } catch (error) {
        throw withGraphReadIssue(error, { source: 'hierarchy', affectedUids: [...seeds] });
    }
    for (const [targetUid, mirrorUid, mirrorString] of mirrorRows) {
        // `:block/refs` also fires for a block that merely mentions the task
        // in passing; only a block that is *nothing but* the reference counts.
        if (referencedBlockUid(mirrorString) !== targetUid) continue;
        (mirrorsOf[targetUid] ||= []).push(mirrorUid);
        stringOf[mirrorUid] = mirrorString;
    }

    let frontier = [...seeds, ...Object.values(mirrorsOf).flat()];
    for (let depth = 0; depth < MAX_ANCESTOR_DEPTH && frontier.length > 0; depth += 1) {
        const next = [];
        let parentRows;
        try {
            parentRows = validateQueryRows(
                query(PARENTS_QUERY, frontier),
                'parent',
                row => row.length >= 3 && row.every(value => typeof value === 'string')
            );
        } catch (error) {
            throw withGraphReadIssue(error, { source: 'parent', affectedUids: frontier });
        }
        const referencedTargets = parentRows
            .map(([, , rawParentString]) => referencedBlockUid(rawParentString))
            .filter(Boolean);
        const referencedStrings = readBlockStrings([...new Set(referencedTargets)]);
        const parentChoices = new Map();
        for (const [uid, rawParentUid] of parentRows) {
            const choices = parentChoices.get(uid) || new Set();
            choices.add(rawParentUid);
            parentChoices.set(uid, choices);
        }
        for (const [uid, choices] of parentChoices) {
            if (choices.size > 1) {
                issues.push({
                    code: 'ambiguous-parent',
                    taskUid: uid,
                    parentUids: [...choices],
                    title: `Ambiguous parent · ${uid}`,
                    rawClock: '',
                    message: `Task ${uid} has more than one confirmed parent; hierarchy roll-up was withheld.`,
                });
            }
        }
        for (const [uid, rawParentUid, rawParentString] of parentRows) {
            // Sub-tasks are routinely written under a `((reference))` to a task
            // rather than under the task itself — pulling a task into a daily note
            // and working beneath it. The reference stands for what it points at,
            // so the walk continues from the original block.
            const referenced = referencedBlockUid(rawParentString);
            const parentUid = referenced || rawParentUid;
            const parentString = referenced ? referencedStrings[parentUid] : rawParentString;

            parentOf[uid] = parentUid;
            if (referenced && typeof parentString !== 'string') {
                issues.push({
                    code: 'unresolved-parent',
                    taskUid: uid,
                    parentUid,
                    title: `Unresolved parent · ${parentUid}`,
                    rawClock: '',
                    message: `Parent Task ${parentUid} could not be resolved; the known hierarchy was retained.`,
                });
                continue;
            }
            if (parentUid in stringOf) continue;
            stringOf[parentUid] = parentString;
            next.push(parentUid);
        }
        frontier = next;
    }

    if (frontier.length > 0) {
        const frontierUids = new Set(frontier);
        const affectedSeeds = [...seeds].filter(seed => {
            const seen = new Set();
            let current = seed;
            while (current && !frontierUids.has(current)) {
                if (seen.has(current)) return true;
                seen.add(current);
                current = parentOf[current];
            }
            return frontierUids.has(current);
        });
        const affectedUids = [...new Set([...frontier, ...affectedSeeds])];
        issues.push({
            code: 'ancestor-depth-exceeded',
            kind: 'hierarchy',
            source: 'ancestor-depth',
            taskUid: affectedUids[0],
            affectedUids,
            seedUids: affectedSeeds,
            title: `Hierarchy depth exceeded · ${affectedUids[0]}`,
            rawClock: '',
            message: `The ancestor chain exceeded the safety depth of ${MAX_ANCESTOR_DEPTH}; cascade scope was withheld.`,
        });
    }

    // A malformed graph can point an ancestor back into the same chain. Keep the
    // map useful for diagnostics, but make the ambiguity explicit to callers that
    // must not guess a cascade scope.
    for (const uid of Object.keys(parentOf)) {
        const seen = new Set();
        let current = uid;
        while (current && parentOf[current]) {
            if (seen.has(current)) {
                issues.push({
                    code: 'cyclic-parent',
                    taskUid: uid,
                    title: `Cyclic parent · ${uid}`,
                    rawClock: '',
                    message: `Task hierarchy for ${uid} contains a cycle; cascade scope was withheld.`,
                });
                break;
            }
            seen.add(current);
            current = parentOf[current];
        }
    }

    return { parentOf, stringOf, mirrorsOf, issues };
}
