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
    /^\s*:?CLOCK:{1,2}\s*\[([^\]]+)\](?:\s*--\s*\[([^\]]+)\])?(?:\s*=>\s*(\d+:\d+))?\s*$/i;
const CLOCK_LIKE_RE = /^\s*:?CLOCK:{1,2}(?:\s|$)/i;

const TODO_RE = /\{\{\[\[(TODO|DONE)\]\]\}\}|\{\{(TODO|DONE)\}\}/;
const BLOCK_REF_ONLY_RE = /^\s*\(\(([a-zA-Z0-9_-]{6,})\)\)\s*$/;
const EMBED_ONLY_RE =
    /^\s*\{\{\[?\[?embed(?:-path|-children)?\]?\]?\s*:\s*\(\(([a-zA-Z0-9_-]{6,})\)\)\s*\}\}\s*$/i;

export function isDrawerBlock(string) {
    return typeof string === 'string' && DRAWER_RE.test(string);
}

export function isClockBlock(string) {
    return parseClockLineDetailed(string).ok;
}

/** True for `{{[[TODO]]}}` and `{{[[DONE]]}}` blocks, plain-brace variants too. */
export function isTaskBlock(string) {
    return typeof string === 'string' && TODO_RE.test(string);
}

/**
 * A task's checkbox state.
 *
 * `taskTitle` strips the marker so the text reads cleanly, which loses the one
 * thing a time report most needs alongside a total: whether the work is finished.
 *
 * @returns {'TODO'|'DONE'|null} null when the block is not a task at all
 */
export function taskStatus(string) {
    if (typeof string !== 'string') return null;
    const match = TODO_RE.exec(string);
    if (!match) return null;
    return (match[1] || match[2]).toUpperCase();
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
    const result = parseClockLineDetailed(string);
    return result.ok ? result.value : null;
}

/**
 * Parse a CLOCK line without losing the reason a clock-shaped record is invalid.
 * `parseClockLine` keeps its historical nullable contract; graph readers use this
 * richer seam to surface data issues without changing valid totals.
 */
export function parseClockLineDetailed(string) {
    if (typeof string !== 'string') return { ok: false, issue: null };
    const match = CLOCK_RE.exec(string);
    if (!match) {
        return CLOCK_LIKE_RE.test(string)
            ? {
                  ok: false,
                  issue: {
                      code: 'malformed-clock',
                      message: 'CLOCK record does not match the expected Org format.',
                  },
              }
            : { ok: false, issue: null };
    }

    const start = parseTimestamp(match[1]);
    if (!start) {
        return {
            ok: false,
            issue: {
                code: 'invalid-timestamp',
                field: 'start',
                raw: match[1],
                message: `Start timestamp is invalid: ${match[1]}`,
            },
        };
    }

    const end = match[2] ? parseTimestamp(match[2]) : null;
    if (match[2] && !end) {
        return {
            ok: false,
            issue: {
                code: 'invalid-timestamp',
                field: 'end',
                raw: match[2],
                message: `End timestamp is invalid: ${match[2]}`,
            },
        };
    }
    if (end && end.getTime() < start.getTime()) {
        return {
            ok: false,
            issue: {
                code: 'negative-duration',
                message: 'End timestamp is earlier than the start timestamp.',
            },
        };
    }

    const declaredMinutes = match[3] ? parseDurationMinutes(match[3]) : null;
    if (match[3] && declaredMinutes === null) {
        return {
            ok: false,
            issue: {
                code: 'invalid-declared-duration',
                raw: match[3],
                message: `Declared duration is invalid: ${match[3]}`,
            },
        };
    }
    const computedMinutes = end ? durationMinutes(start.getTime(), end.getTime()) : null;
    const effectiveMinutes = end ? (declaredMinutes ?? computedMinutes) : null;
    const issue =
        end && declaredMinutes !== null && declaredMinutes !== computedMinutes
            ? {
                  code: 'declared-duration-mismatch',
                  message: `Declared ${match[3]} differs from the ${formatDurationMinutes(computedMinutes)} computed from timestamps.`,
              }
            : null;

    return {
        ok: true,
        value: {
            start,
            end,
            computedMinutes,
            declaredMinutes,
            effectiveMinutes,
            minutes: effectiveMinutes,
            running: !end,
            issue,
        },
    };
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

/** Readable task text. Callers may opt into truncation for constrained surfaces. */
export function taskTitle(string, { maxLength = Infinity } = {}) {
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
    return Number.isFinite(maxLength) && cleaned.length > maxLength
        ? `${cleaned.slice(0, maxLength - 1)}…`
        : cleaned;
}
