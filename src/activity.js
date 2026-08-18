/**
 * Pure Activity aggregation for the Dashboard.
 *
 * Activity deliberately works from the already-read CLOCK snapshot. It never
 * queries Roam and keeps the Org reporting rule that an overnight Session is
 * assigned wholly to the day on which it started.
 */

import { entryMinutes, filterByRange, getRange } from './stats.js';
import { dateKey, formatMinutesHuman, startOfDay, startOfDaysAgo } from './time.js';

const ALL_TIME_MONTH_LIMIT = 24;
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

const isValidDate = value => value instanceof Date && !Number.isNaN(value.getTime());

const pad = value => String(value).padStart(2, '0');

const cloneDay = date => new Date(date.getTime());

const nextDay = date => {
    const next = cloneDay(date);
    next.setDate(next.getDate() + 1);
    return next;
};

const nextMonth = date => new Date(date.getFullYear(), date.getMonth() + 1, 1);

const startOfMonth = date => new Date(date.getFullYear(), date.getMonth(), 1);

const formatTime = date => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

const formatShortDate = date => `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;

const formatFullDate = date => `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;

const formatYearPeriod = year => `Jan 1, ${year} – Dec 31, ${year}`;

/** Compact month labels retain the useful signal while fitting narrow buckets. */
export function formatActivityDuration(minutes, { compact = false } = {}) {
    const safe = Math.max(0, Math.round(Number(minutes) || 0));
    if (!compact) return formatMinutesHuman(safe);
    const hours = Math.floor(safe / 60);
    if (hours === 0) return `${safe}m`;
    const remainder = safe % 60;
    return remainder === 0 ? `${hours}h` : `${hours}h${pad(remainder)}`;
}

/** One decimal-place hours for the dense 30-day Activity view. */
export function formatActivityHours(minutes) {
    const safe = Math.max(0, Math.round(Number(minutes) || 0));
    const hours = Math.round((safe / 60) * 10) / 10;
    return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

/**
 * Explicit density contract shared by the pure model and the DOM/CSS seam.
 * Short ranges get visual weight; dense ranges keep every bucket visible.
 */
export function getActivityDensity(rangeId, unit, bucketCount) {
    const count = Math.max(1, Number(bucketCount) || 1);
    if (rangeId === 'today' || unit === 'session') {
        const barWidthPx =
            count <= 4 ? 42 : count <= 8 ? 32 : count <= 16 ? 24 : count <= 24 ? 18 : 14;
        return { id: `today-${barWidthPx}`, barWidthPx, bucketCount: count };
    }
    if (rangeId === 'week') return { id: 'week-42', barWidthPx: 42, bucketCount: count };
    if (rangeId === 'month') return { id: 'month-10', barWidthPx: 10, bucketCount: count };
    if (unit === 'year') return { id: 'all-year-32', barWidthPx: 32, bucketCount: count };
    return {
        id: count <= 12 ? 'all-month-30' : 'all-month-18',
        barWidthPx: count <= 12 ? 30 : 18,
        bucketCount: count,
    };
}

const sessionLabel = count => `${count} Session${count === 1 ? '' : 's'}`;

const bucketAriaLabel = (bucket, dateText) =>
    `${dateText} · ${bucket.fullDurationLabel || formatMinutesHuman(bucket.minutes)} · ${sessionLabel(bucket.sessionCount)}`;

const createBucket = ({
    id,
    start,
    unit,
    durationFormat = 'human',
    dateLabel,
    monthLabel = '',
    fullDateLabel,
}) => ({
    id,
    unit,
    dateKey: dateKey(start),
    start,
    minutes: 0,
    fixedMinutes: 0,
    sessionCount: 0,
    runningClockUids: [],
    runningEntries: [],
    durationFormat,
    durationLabel:
        durationFormat === 'hours'
            ? formatActivityHours(0)
            : formatActivityDuration(0, { compact: durationFormat === 'compact' }),
    fullDurationLabel: formatActivityDuration(0),
    dateLabel,
    monthLabel,
    fullDateLabel:
        fullDateLabel ||
        (unit === 'month'
            ? `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`
            : unit === 'year'
              ? String(start.getFullYear())
              : formatFullDate(start)),
    ariaLabel: bucketAriaLabel(
        { minutes: 0, fullDurationLabel: formatMinutesHuman(0), sessionCount: 0 },
        unit === 'session'
            ? `${formatFullDate(start)} at ${formatTime(start)}`
            : fullDateLabel ||
                  (unit === 'month'
                      ? `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`
                      : unit === 'year'
                        ? String(start.getFullYear())
                        : formatFullDate(start))
    ),
});

const refreshBucketLabels = (bucket, dateText = bucket.fullDateLabel) => {
    bucket.durationLabel =
        bucket.durationFormat === 'hours'
            ? formatActivityHours(bucket.minutes)
            : formatActivityDuration(bucket.minutes, { compact: bucket.durationFormat === 'compact' });
    bucket.fullDurationLabel = formatActivityDuration(bucket.minutes);
    bucket.ariaLabel = bucketAriaLabel(bucket, dateText);
    return bucket;
};

const addEntryToBucket = (bucket, entry, now, dateText) => {
    const minutes = entryMinutes(entry, now);
    bucket.minutes += minutes;
    bucket.sessionCount += 1;
    if (entry.running) {
        bucket.runningClockUids.push(entry.clockUid);
        bucket.runningEntries.push(entry);
    } else {
        bucket.fixedMinutes += minutes;
    }
    refreshBucketLabels(bucket, dateText);
};

const emptyDailyBuckets = (start, count, durationFormat) => {
    const buckets = [];
    let cursor = cloneDay(start);
    for (let index = 0; index < count; index += 1) {
        buckets.push(
            createBucket({
                id: dateKey(cursor),
                start: cloneDay(cursor),
                unit: 'day',
                durationFormat,
                dateLabel:
                    durationFormat === 'hours' ? String(cursor.getDate()) : formatShortDate(cursor),
            })
        );
        cursor = nextDay(cursor);
    }
    return buckets;
};

const refreshDailyMonthLabels = buckets => {
    for (const [index, bucket] of buckets.entries()) {
        const isFirstVisibleBucket = index === 0;
        const isMonthStart = bucket.start.getDate() === 1;
        bucket.monthLabel = isFirstVisibleBucket || isMonthStart ? MONTH_NAMES[bucket.start.getMonth()] : '';
        refreshBucketLabels(bucket);
    }
    return buckets;
};

const buildToday = (entries, now) => {
    const buckets = entries
        .slice()
        .sort((left, right) => {
            const difference = left.start.getTime() - right.start.getTime();
            return difference || String(left.clockUid ?? '').localeCompare(String(right.clockUid ?? ''));
        })
        .map((entry, index) => {
            const start = cloneDay(entry.start);
            const bucket = createBucket({
                id: entry.clockUid || `session-${index + 1}`,
                start,
                unit: 'session',
                durationFormat: 'human',
                dateLabel: formatTime(start),
            });
            addEntryToBucket(bucket, entry, now, `${formatFullDate(start)} at ${formatTime(start)}`);
            return bucket;
        });
    return { unit: 'session', buckets };
};

const buildDaily = (entries, now, rangeId) => {
    const count = rangeId === 'today' ? 1 : rangeId === 'month' ? 30 : 7;
    const start = rangeId === 'today' ? startOfDay(now) : startOfDaysAgo(now, count - 1);
    const durationFormat = rangeId === 'month' ? 'hours' : 'human';
    const buckets = emptyDailyBuckets(start, count, durationFormat);
    const byDate = new Map(buckets.map(bucket => [bucket.dateKey, bucket]));
    for (const entry of entries) {
        const bucket = byDate.get(dateKey(entry.start));
        if (!bucket) continue;
        addEntryToBucket(bucket, entry, now, bucket.fullDateLabel);
    }
    if (rangeId === 'month') refreshDailyMonthLabels(buckets);
    return { unit: 'day', durationFormat, buckets };
};

const buildAll = (entries, now) => {
    if (entries.length === 0) return { unit: 'month', buckets: [] };

    const first = startOfMonth(entries[0].start);
    const last = startOfMonth(now);
    const monthSpan =
        (last.getFullYear() - first.getFullYear()) * 12 + last.getMonth() - first.getMonth() + 1;
    const unit = monthSpan <= ALL_TIME_MONTH_LIMIT ? 'month' : 'year';
    const firstBucket = unit === 'month' ? first : new Date(first.getFullYear(), 0, 1);
    const lastBucket = unit === 'month' ? last : new Date(last.getFullYear(), 0, 1);
    const monthCount =
        (lastBucket.getFullYear() - firstBucket.getFullYear()) * 12 +
        lastBucket.getMonth() -
        firstBucket.getMonth() +
        1;
    const durationFormat = unit === 'month' && monthCount > 12 ? 'compact' : 'human';
    const buckets = [];
    const byKey = new Map();
    let cursor = firstBucket;
    while (cursor.getTime() <= lastBucket.getTime()) {
        const id =
            unit === 'month'
                ? `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`
                : `${cursor.getFullYear()}`;
        const dateLabel =
            unit === 'month'
                ? cursor.getMonth() === 0
                    ? `${MONTH_NAMES[cursor.getMonth()]} ’${String(cursor.getFullYear()).slice(-2)}`
                    : MONTH_NAMES[cursor.getMonth()]
                : String(cursor.getFullYear());
        const bucket = createBucket({
            id,
            start: cloneDay(cursor),
            unit,
            durationFormat,
            dateLabel,
            fullDateLabel:
                unit === 'month'
                    ? `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`
                    : formatYearPeriod(cursor.getFullYear()),
        });
        buckets.push(bucket);
        byKey.set(bucket.id, bucket);
        cursor = unit === 'month' ? nextMonth(cursor) : new Date(cursor.getFullYear() + 1, 0, 1);
    }

    for (const entry of entries) {
        const start = unit === 'month' ? startOfMonth(entry.start) : new Date(entry.start.getFullYear(), 0, 1);
        const key =
            unit === 'month'
                ? `${start.getFullYear()}-${pad(start.getMonth() + 1)}`
                : `${start.getFullYear()}`;
        const bucket = byKey.get(key);
        if (bucket) addEntryToBucket(bucket, entry, now, bucket.fullDateLabel);
    }
    return { unit, durationFormat, buckets };
};

const finishActivity = (rangeId, entries, result) => {
    const buckets = result.buckets;
    const totalMinutes = buckets.reduce((sum, bucket) => sum + bucket.minutes, 0);
    const maxMinutes = buckets.reduce((max, bucket) => Math.max(max, bucket.minutes), 0);
    return {
        rangeId,
        unit: result.unit,
        entries,
        buckets,
        totalMinutes,
        maxMinutes,
        durationFormat: result.durationFormat || 'human',
        density: getActivityDensity(rangeId, result.unit, buckets.length),
        allTimeMonthLimit: ALL_TIME_MONTH_LIMIT,
    };
};

/** Build the chart-ready model from one Dashboard snapshot. */
export function buildActivity(entries, { now = new Date(), rangeId = 'week' } = {}) {
    const selectedRange = getRange(rangeId);
    const selectedEntries = filterByRange(Array.isArray(entries) ? entries : [], selectedRange.id, now)
        .filter(entry => isValidDate(entry?.start))
        .sort((left, right) => left.start.getTime() - right.start.getTime());

    if (selectedEntries.length === 0) {
        return finishActivity(selectedRange.id, selectedEntries, {
            unit: selectedRange.id === 'today' ? 'session' : 'day',
            durationFormat: selectedRange.id === 'month' ? 'hours' : 'human',
            buckets: [],
        });
    }
    if (selectedRange.id === 'today') return finishActivity(selectedRange.id, selectedEntries, buildToday(selectedEntries, now));
    if (selectedRange.id === 'all') return finishActivity(selectedRange.id, selectedEntries, buildAll(selectedEntries, now));
    return finishActivity(selectedRange.id, selectedEntries, buildDaily(selectedEntries, now, selectedRange.id));
}

/** Update only live Activity labels; this is called by the Dashboard ticker. */
export function refreshActivityBucket(bucket, now) {
    if (!bucket?.runningEntries?.length) return bucket;
    bucket.minutes = bucket.fixedMinutes + bucket.runningEntries.reduce(
        (sum, entry) => sum + entryMinutes(entry, now),
        0
    );
    refreshBucketLabels(
        bucket,
        bucket.unit === 'session'
            ? `${bucket.fullDateLabel} at ${formatTime(bucket.start)}`
            : bucket.fullDateLabel
    );
    return bucket;
}
