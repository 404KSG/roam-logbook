/**
 * Reading and writing the org-mode LOGBOOK drawer as Roam blocks.
 *
 * The on-graph shape mirrors org, one drawer entry per block:
 *
 *   {{[[TODO]]}} this is a test task
 *     - LOGBOOK::
 *       - CLOCK:: [2026-08-05 Wed 15:58]--[2026-08-05 Wed 16:58] => 1:00
 *
 * A clock with no `--[end]` is *running*. That is the whole persistence story:
 * the graph, not extension state, is what survives a reload or a crash.
 */

import {
    formatDurationMinutes,
    formatStamp,
    durationMinutes,
    parseDurationMinutes,
    parseTimestamp,
} from './time.js';

export const DRAWER_LABEL = 'LOGBOOK::';
export const CLOCK_LABEL = 'CLOCK::';

// A leading `:` is accepted so drawers pasted straight out of an org file parse.
const DRAWER_RE = /^\s*:?LOGBOOK:{1,2}\s*$/i;
const CLOCK_RE =
    /^\s*:?CLOCK:{1,2}\s*\[([^\]]+)\](?:\s*--\s*\[([^\]]+)\])?(?:\s*=>\s*(\d+:[0-5]\d))?\s*$/i;

const TODO_RE = /\{\{\[\[(TODO|DONE)\]\]\}\}|\{\{(TODO|DONE)\}\}/;
const BLOCK_REF_ONLY_RE = /^\s*\(\(([a-zA-Z0-9_-]{6,})\)\)\s*$/;
const EMBED_ONLY_RE =
    /^\s*\{\{\[?\[?embed(?:-path|-children)?\]?\]?\s*:\s*\(\(([a-zA-Z0-9_-]{6,})\)\)\s*\}\}\s*$/i;

export function isDrawerBlock(string) {
    return typeof string === 'string' && DRAWER_RE.test(string);
}

export function isClockBlock(string) {
    return typeof string === 'string' && CLOCK_RE.test(string);
}

/** True for `{{[[TODO]]}}` and `{{[[DONE]]}}` blocks, plain-brace variants too. */
export function isTaskBlock(string) {
    return typeof string === 'string' && TODO_RE.test(string);
}

/**
 * Parse one `CLOCK::` block.
 *
 * The stored `=> H:MM` is authoritative when present — a hand-edited summary is
 * the user telling us what the entry is worth — and recomputed otherwise.
 *
 * @returns {{start: Date, end: Date|null, minutes: number|null, running: boolean}|null}
 */
export function parseClockLine(string) {
    if (typeof string !== 'string') return null;
    const match = CLOCK_RE.exec(string);
    if (!match) return null;

    const start = parseTimestamp(match[1]);
    if (!start) return null;

    const end = match[2] ? parseTimestamp(match[2]) : null;
    if (match[2] && !end) return null;
    if (end && end.getTime() < start.getTime()) return null;

    const stated = match[3] ? parseDurationMinutes(match[3]) : null;
    const minutes = end ? (stated ?? durationMinutes(start.getTime(), end.getTime())) : null;

    return { start, end, minutes, running: !end };
}

/** Serialise a clock entry. Omitting `end` writes the running form. */
export function formatClockLine(start, end) {
    if (!end) return `${CLOCK_LABEL} ${formatStamp(start)}`;
    const minutes = durationMinutes(start.getTime(), end.getTime());
    return `${CLOCK_LABEL} ${formatStamp(start)}--${formatStamp(end)} => ${formatDurationMinutes(minutes)}`;
}

/**
 * The uid a right-clicked block should actually log against.
 *
 * A block whose whole content is `((uid))` or `{{embed: ((uid))}}` is a view of
 * another block, so the drawer belongs on the original, not on the mirror.
 *
 * @returns {string|null} null when the block is not a bare reference.
 */
export function referencedBlockUid(string) {
    if (typeof string !== 'string') return null;
    const match = BLOCK_REF_ONLY_RE.exec(string) || EMBED_ONLY_RE.exec(string);
    return match ? match[1] : null;
}

/** Readable one-liner for menus, the topbar and the dashboard. */
export function taskTitle(string, { maxLength = 80 } = {}) {
    if (typeof string !== 'string') return '(untitled)';
    const cleaned = string
        .replace(TODO_RE, '')
        .replace(/\{\{\[\[?[^}]*\}\}/g, '')
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[\[([^\]]+)\]\]/g, '$1')
        .replace(/#\[\[([^\]]+)\]\]/g, '$1')
        .replace(/\(\([a-zA-Z0-9_-]{6,}\)\)/g, '')
        .replace(/\^\^|\*\*|__|~~/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!cleaned) return '(untitled)';
    return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}
