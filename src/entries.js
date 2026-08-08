/**
 * Reading every clock entry out of the graph.
 *
 * There is deliberately no cached mirror of this data: the LOGBOOK drawers *are*
 * the state. A running clock survives a reload, a crash, or an edit made on
 * another device, because it is just a `CLOCK::` block with no end stamp.
 */

import { isDrawerBlock, parseClockLine, referencedBlockUid, taskTitle } from './org.js';
import { query, queryOrThrow } from './roam.js';

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
  [?t :block/string ?task-string]
  [?t :block/page ?p]
  [?p :node/title ?page-title]]`;

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
        return [];
    }
}

/**
 * @typedef {object} ClockEntry
 * @property {string} clockUid    uid of the `CLOCK::` block itself
 * @property {string} taskUid     uid of the task the drawer hangs under
 * @property {string} taskString  raw task block text
 * @property {string} title       display title for the task
 * @property {string|null} pageTitle
 * @property {Date} start
 * @property {Date|null} end      null while the clock is running
 * @property {number|null} minutes
 * @property {boolean} running
 */

/** Every parseable clock entry in the graph, newest start first. */
export function readAllEntries() {
    const rows = queryEntryRows();
    const entries = [];

    for (const [clockUid, clockString, drawerString, taskUid, taskString, pageTitle] of rows) {
        if (!isDrawerBlock(drawerString)) continue;
        const parsed = parseClockLine(clockString);
        if (!parsed) continue;
        entries.push({
            clockUid,
            taskUid,
            taskString,
            title: taskTitle(taskString),
            pageTitle: pageTitle ?? null,
            start: parsed.start,
            end: parsed.end,
            minutes: parsed.minutes,
            running: parsed.running,
        });
    }

    entries.sort((a, b) => b.start.getTime() - a.start.getTime());
    return entries;
}

/** Just the open clocks — what the topbar counts and what "unfinished" means. */
export function readRunningEntries() {
    return readAllEntries().filter(entry => entry.running);
}

// ---- hierarchy, for the dashboard's roll-up ----

/** Ancestor chains are walked a level at a time; a guard against a pathological graph. */
const MAX_ANCESTOR_DEPTH = 24;

// Both of these bind a single uid, the same shape as `getChildren` — a collection
// binding (`:in $ [?uid ...]`) came back empty against a real graph, and this is
// not the place to be the only code relying on an unproven query form.
//
// Requiring `:block/string` on the parent stops the walk at the page, which has
// a `:node/title` instead — exactly where a task tree should end.
const PARENT_QUERY = `[:find ?parent-uid ?parent-string
  :in $ ?uid
  :where
  [?b :block/uid ?uid]
  [?p :block/children ?b]
  [?p :block/uid ?parent-uid]
  [?p :block/string ?parent-string]]`;

const MIRRORS_QUERY = `[:find ?mirror-uid ?mirror-string
  :in $ ?uid
  :where
  [?t :block/uid ?uid]
  [?m :block/refs ?t]
  [?m :block/uid ?mirror-uid]
  [?m :block/string ?mirror-string]]`;

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

    for (const taskUid of seeds) {
        let rows;
        try {
            rows = queryOrThrow(MIRRORS_QUERY, taskUid);
        } catch (error) {
            // Roll-up degrades to real block structure only, rather than going blank.
            console.warn('[roam-logbook] block references unavailable for roll-up', error);
            break;
        }
        for (const [mirrorUid, mirrorString] of rows) {
            // `:block/refs` also fires for a block that merely mentions the task
            // in passing; only a block that is *nothing but* the reference counts.
            if (referencedBlockUid(mirrorString) !== taskUid) continue;
            (mirrorsOf[taskUid] ||= []).push(mirrorUid);
            stringOf[mirrorUid] = mirrorString;
        }
    }

    let frontier = [...seeds, ...Object.values(mirrorsOf).flat()];
    for (let depth = 0; depth < MAX_ANCESTOR_DEPTH && frontier.length > 0; depth += 1) {
        const next = [];
        for (const uid of frontier) {
            const [parentUid, parentString] = query(PARENT_QUERY, uid)[0] || [];
            if (!parentUid) continue;
            parentOf[uid] = parentUid;
            if (parentUid in stringOf) continue;
            stringOf[parentUid] = parentString;
            next.push(parentUid);
        }
        frontier = next;
    }

    return { parentOf, stringOf, mirrorsOf };
}
