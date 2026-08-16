/**
 * Timestamp and duration helpers, in org-mode's shapes.
 *
 * Everything here is pure and works on local time — org timestamps carry no zone,
 * so `[2026-08-05 Wed 15:58]` always means 15:58 wherever the reader is.
 */

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
];

const pad = n => String(n).padStart(2, '0');

/** `2026-08-05 Wed 15:58` — the inside of an org timestamp. */
export function formatTimestamp(date) {
    return (
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
        `${DAY_NAMES[date.getDay()]} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
}

/** `[2026-08-05 Wed 15:58]` — the bracketed (inactive) org timestamp. */
export function formatStamp(date) {
    return `[${formatTimestamp(date)}]`;
}

const isValidDate = value => value instanceof Date && !Number.isNaN(value.getTime());

/**
 * Compact, local Started metadata for the Running table.
 *
 * The graph stores org timestamps without a timezone. Keep the original text
 * for the title/fallback, and only expose a datetime attribute when the local
 * date is known to be valid.
 */
export function formatStarted(start, now = new Date()) {
    const raw = isValidDate(start) ? formatStamp(start) : String(start ?? '');
    const candidate = isValidDate(start)
        ? start
        : parseTimestamp(raw.replace(/^\[|\]$/g, ''));
    if (!isValidDate(candidate)) {
        return { valid: false, raw, dateLabel: raw, timeLabel: '', datetime: null };
    }

    const sameDay =
        isValidDate(now) &&
        candidate.getFullYear() === now.getFullYear() &&
        candidate.getMonth() === now.getMonth() &&
        candidate.getDate() === now.getDate();
    return {
        valid: true,
        raw,
        dateLabel: sameDay
            ? 'Today'
            : `${MONTH_NAMES[candidate.getMonth()]} ${candidate.getDate()}`,
        timeLabel: `${pad(candidate.getHours())}:${pad(candidate.getMinutes())}`,
        datetime:
            `${candidate.getFullYear()}-${pad(candidate.getMonth() + 1)}-${pad(candidate.getDate())}` +
            `T${pad(candidate.getHours())}:${pad(candidate.getMinutes())}`,
    };
}

// The day name is optional and free-form so that graphs written in a non-English
// locale still round-trip; the trailing `HH:MM` anchors the match.
const STAMP_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\S+))?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Parse the inside of an org timestamp into a local `Date`.
 *
 * @returns {Date|null} null when the text isn't a timestamp or names a day that
 *   doesn't exist (`2026-02-31`), which `new Date` would silently roll over.
 */
export function parseTimestamp(text) {
    if (typeof text !== 'string') return null;
    const match = STAMP_RE.exec(text.trim());
    if (!match) return null;

    const [, yearText, monthText, dayText, , hourText, minuteText, secondText] = match;
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    const second = Number(secondText || 0);
    if (
        month < 1 ||
        month > 12 ||
        hour > 23 ||
        minute > 59 ||
        second > 59 ||
        hour < 0 ||
        minute < 0 ||
        second < 0
    ) {
        return null;
    }

    // Construct through setFullYear so four-digit years 0000–0099 are not
    // silently reinterpreted as 1900–1999 by the multi-argument Date constructor.
    const date = new Date(0);
    date.setFullYear(year, month - 1, day);
    date.setHours(hour, minute, second, 0);
    const rolledOver =
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day ||
        date.getHours() !== hour ||
        date.getMinutes() !== minute ||
        date.getSeconds() !== second;
    if (rolledOver) return null;
    return date;
}

/** Elapsed whole minutes, truncated the way org's clock summaries are. */
export function durationMinutes(startMs, endMs) {
    return Math.max(0, Math.floor((endMs - startMs) / 60000));
}

/** `1:00`, `0:07`, `26:30` — org's `=> H:MM`, hours unpadded and uncapped. */
export function formatDurationMinutes(minutes) {
    const safe = Math.max(0, Math.round(minutes));
    return `${Math.floor(safe / 60)}:${pad(safe % 60)}`;
}

/** Inverse of `formatDurationMinutes`. */
export function parseDurationMinutes(text) {
    if (typeof text !== 'string') return null;
    const match = /^(\d+):([0-5]\d)$/.exec(text.trim());
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
}

/** Live counter for the topbar: `12:34` under an hour, `1:02:34` past it. */
export function formatElapsed(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return hours > 0
        ? `${hours}:${pad(minutes)}:${pad(seconds)}`
        : `${minutes}:${pad(seconds)}`;
}

/** `2h 05m` / `45m` — for dashboard totals, where seconds are noise. */
export function formatMinutesHuman(minutes) {
    const safe = Math.max(0, Math.round(minutes));
    const hours = Math.floor(safe / 60);
    if (hours === 0) return `${safe}m`;
    return `${hours}h ${pad(safe % 60)}m`;
}

/** Local `YYYY-MM-DD`, the bucket key used everywhere in the dashboard. */
export function dateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Midnight of `date`'s day, local time. */
export function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

/** Midnight `days` days back from `date`'s day. */
export function startOfDaysAgo(date, days) {
    const start = startOfDay(date);
    start.setDate(start.getDate() - days);
    return start;
}
