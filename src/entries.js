/**
 * Reading every clock entry out of the graph.
 *
 * There is deliberately no cached mirror of this data: the LOGBOOK drawers *are*
 * the state. A running clock survives a reload, a crash, or an edit made on
 * another device, because it is just a `CLOCK::` block with no end stamp.
 */

import { isDrawerBlock, parseClockLine, taskTitle } from './org.js';
import { queryOrThrow } from './roam.js';

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
