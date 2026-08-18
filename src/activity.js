/**
 * Pure Activity aggregation for the Dashboard.
 *
 * Activity deliberately works from the already-read CLOCK snapshot. It never
 * queries Roam and keeps the Org reporting rule that an overnight Session is
 * assigned wholly to the day on which it started.
 */

import { entryMinutes, filterByRange, getRange } from './stats.js';
import { dateKey, formatMinutesHuman, startOfDay, startOfDaysAgo } from './time.js';

const DAY_MS = 86_400_000;
const ALL_TIME_WEEK_LIMIT_DAYS = 90;
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

const advanceDays = (date, count) => {
    const result = cloneDay(date);
    result.setDate(result.getDate() + count);
    return result;
};

const nextMonth = date => new Date(date.getFullYear(), date.getMonth() + 1, 1);

const startOfMonth = date => new Date(date.getFullYear(), date.getMonth(), 1);

const startOfWeek = date => {
    const start = startOfDay(date);
    const daysFromMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - daysFromMonday);
    return start;
};

const formatTime = date => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

const formatShortDate = date => `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;

const formatFullDate = date => `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;

/** Compact month labels retain the useful signal while fitting narrow buckets. */
export function formatActivityDuration(minutes, { compact = false } = {}) {
    const safe = Math.max(0, Math.round(Number(minutes) || 0));
    if (!compact) return formatMinutesHuman(safe);
    const hours = Math.floor(safe / 60);
    if (hours === 0) return `${safe}m`;
    const remainder = safe % 60;
    return remainder === 0 ? `${hours}h` : `${hours}h${pad(remainder)}`;
}

const sessionLabel = count => `${count} Session${count === 1 ? '' : 's'}`;

const bucketAriaLabel = (bucket, dateText) =>
    `${dateText} · ${formatMinutesHuman(bucket.minutes)} · ${sessionLabel(bucket.sessionCount)}`;

const createBucket = ({ id, start, unit, compact = false, dateLabel, monthLabel = '' }) => ({
    id,
    unit,
    dateKey: dateKey(start),
    start,
    minutes: 0,
    fixedMinutes: 0,
    sessionCount: 0,
    runningClockUids: [],
    runningEntries: [],
    durationLabel: formatActivityDuration(0, { compact }),
    dateLabel,
    monthLabel,
    fullDateLabel: formatFullDate(start),
    ariaLabel: bucketAriaLabel(
        { minutes: 0, sessionCount: 0 },
        unit === 'session' ? `${formatFullDate(start)} at ${formatTime(start)}` : formatFullDate(start)
    ),
});

const refreshBucketLabels = (bucket, compact, dateText = bucket.fullDateLabel) => {
    bucket.durationLabel = formatActivityDuration(bucket.minutes, { compact });
    bucket.ariaLabel = bucketAriaLabel(bucket, dateText);
    return bucket;
};

const addEntryToBucket = (bucket, entry, now, compact, dateText) => {
    const minutes = entryMinutes(entry, now);
    bucket.minutes += minutes;
    bucket.sessionCount += 1;
    if (entry.running) {
        bucket.runningClockUids.push(entry.clockUid);
        bucket.runningEntries.push(entry);
    } else {
        bucket.fixedMinutes += minutes;
    }
    refreshBucketLabels(bucket, compact, dateText);
};

const emptyDailyBuckets = (start, count, compact) => {
    const buckets = [];
    let cursor = cloneDay(start);
    for (let index = 0; index < count; index += 1) {
        buckets.push(
            createBucket({
                id: dateKey(cursor),
                start: cloneDay(cursor),
                unit: 'day',
                compact,
                dateLabel: compact ? String(cursor.getDate()) : formatShortDate(cursor),
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
        refreshBucketLabels(bucket, true);
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
                dateLabel: formatTime(start),
            });
            addEntryToBucket(bucket, entry, now, false, `${formatFullDate(start)} at ${formatTime(start)}`);
            return bucket;
        });
    return { unit: 'session', buckets };
};

const buildDaily = (entries, now, rangeId) => {
    const count = rangeId === 'today' ? 1 : rangeId === 'month' ? 30 : 7;
    const start = rangeId === 'today' ? startOfDay(now) : startOfDaysAgo(now, count - 1);
    const compact = rangeId === 'month';
    const buckets = emptyDailyBuckets(start, count, compact);
    const byDate = new Map(buckets.map(bucket => [bucket.dateKey, bucket]));
    for (const entry of entries) {
        const bucket = byDate.get(dateKey(entry.start));
        if (!bucket) continue;
        addEntryToBucket(bucket, entry, now, compact, bucket.fullDateLabel);
    }
    if (compact) refreshDailyMonthLabels(buckets);
    return { unit: 'day', buckets };
};

const buildAll = (entries, now) => {
    if (entries.length === 0) return { unit: 'month', buckets: [] };

    const firstDay = startOfDay(entries[0].start);
    const lastDay = startOfDay(entries.at(-1).start);
    const spanDays = Math.floor((lastDay.getTime() - firstDay.getTime()) / DAY_MS) + 1;
    const unit = spanDays <= ALL_TIME_WEEK_LIMIT_DAYS ? 'week' : 'month';
    const first = unit === 'week' ? startOfWeek(firstDay) : startOfMonth(firstDay);
    const last = unit === 'week' ? startOfWeek(lastDay) : startOfMonth(lastDay);
    const buckets = [];
    const byKey = new Map();
    let cursor = first;
    while (cursor.getTime() <= last.getTime()) {
        const bucket = createBucket({
            id: unit === 'week' ? dateKey(cursor) : `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`,
            start: cloneDay(cursor),
            unit,
            compact: unit === 'month',
            dateLabel: unit === 'week' ? formatShortDate(cursor) : MONTH_NAMES[cursor.getMonth()],
        });
        buckets.push(bucket);
        byKey.set(unit === 'week' ? dateKey(cursor) : bucket.id, bucket);
        cursor = unit === 'week' ? advanceDays(cursor, 7) : nextMonth(cursor);
    }

    for (const entry of entries) {
        const start = unit === 'week' ? startOfWeek(entry.start) : startOfMonth(entry.start);
        const key = unit === 'week' ? dateKey(start) : `${start.getFullYear()}-${pad(start.getMonth() + 1)}`;
        const bucket = byKey.get(key);
        if (bucket) addEntryToBucket(bucket, entry, now, unit === 'month', bucket.fullDateLabel);
    }
    if (unit === 'month') {
        for (const bucket of buckets) refreshBucketLabels(bucket, true, `${bucket.dateLabel} ${bucket.start.getFullYear()}`);
    }
    return { unit, buckets };
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
        allTimeWeekLimitDays: ALL_TIME_WEEK_LIMIT_DAYS,
    };
};

/** Build the chart-ready model from one Dashboard snapshot. */
export function buildActivity(entries, { now = new Date(), rangeId = 'week' } = {}) {
    const selectedRange = getRange(rangeId);
    const selectedEntries = filterByRange(Array.isArray(entries) ? entries : [], selectedRange.id, now)
        .filter(entry => isValidDate(entry?.start))
        .sort((left, right) => left.start.getTime() - right.start.getTime());

    if (selectedEntries.length === 0) {
        return finishActivity(selectedRange.id, selectedEntries, { unit: selectedRange.id === 'today' ? 'session' : 'day', buckets: [] });
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
    refreshBucketLabels(bucket, bucket.unit === 'month', bucket.unit === 'session'
        ? `${bucket.fullDateLabel} at ${formatTime(bucket.start)}`
        : bucket.unit === 'week'
          ? bucket.fullDateLabel
          : `${bucket.dateLabel} ${bucket.start.getFullYear()}`);
    return bucket;
}
