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
const TODAY_HOUR_COUNT = 24;
const TODAY_VISIBLE_HOURS = new Set([0, 6, 12, 18]);
const MINUTE_MS = 60 * 1000;
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

const formatHourLabel = hour => (TODAY_VISIBLE_HOURS.has(hour) ? pad(hour) : '');

const fullDateLabelFor = (unit, start) =>
    unit === 'month'
        ? `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`
        : unit === 'year'
          ? String(start.getFullYear())
          : unit === 'hour'
            ? `${formatFullDate(start)} at ${formatTime(start)}`
            : formatFullDate(start);

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

const visibleDurationLabel = (minutes, durationFormat) => {
    if (Math.max(0, Math.round(Number(minutes) || 0)) <= 0) return '';
    return durationFormat === 'hours'
        ? formatActivityHours(minutes)
        : formatActivityDuration(minutes, { compact: durationFormat === 'compact' });
};

/**
 * Explicit density contract shared by the pure model and the DOM/CSS seam.
 * The renderer turns the percentage into a width relative to each bucket
 * slot; the pixel bounds keep sparse and dense views readable at both ends.
 */
export function getActivityDensity(rangeId, unit, bucketCount) {
    const count = Math.max(1, Number(bucketCount) || 1);
    if (rangeId === 'today' || unit === 'hour') {
        return {
            id: 'today-18',
            barWidthPercent: 52,
            barMinWidthPx: 2,
            barMaxWidthPx: 18,
            bucketCount: count,
        };
    }
    if (rangeId === 'week') {
        return {
            id: 'week-42',
            barWidthPercent: 58,
            barMinWidthPx: 42,
            barMaxWidthPx: 144,
            bucketCount: count,
        };
    }
    if (rangeId === 'month') {
        return {
            id: 'month-10',
            barWidthPercent: 68,
            barMinWidthPx: 2,
            barMaxWidthPx: 10,
            bucketCount: count,
        };
    }
    if (count === 1) {
        return {
            id: 'all-month-30',
            barWidthPercent: 72,
            barMinWidthPx: 64,
            barMaxWidthPx: 960,
            bucketCount: count,
        };
    }
    if (count <= 3) {
        return {
            id: 'all-month-30',
            barWidthPercent: 64,
            barMinWidthPx: 32,
            barMaxWidthPx: 320,
            bucketCount: count,
        };
    }
    if (unit === 'year') {
        return {
            id: 'all-year-32',
            barWidthPercent: 56,
            barMinWidthPx: 18,
            barMaxWidthPx: 72,
            bucketCount: count,
        };
    }
    return {
        id: count <= 12 ? 'all-month-30' : 'all-month-18',
        barWidthPercent: count <= 12 ? 56 : 44,
        barMinWidthPx: count <= 12 ? 18 : 6,
        barMaxWidthPx: count <= 12 ? 64 : 24,
        bucketCount: count,
    };
}

const sessionLabel = count => `${count} Session${count === 1 ? '' : 's'}`;

/*
 * A Session is counted once, in the bucket it starts in, so a long Session
 * leaves later buckets holding minutes but no start. "0 Sessions" next to a
 * real duration reads as a contradiction, so name the continuation instead.
 */
const bucketSessionLabel = bucket =>
    bucket.sessionCount === 0 && bucket.minutes > 0
        ? 'continued from an earlier Session'
        : sessionLabel(bucket.sessionCount);

const bucketAriaLabel = (bucket, dateText) =>
    `${dateText} · ${bucket.fullDurationLabel || formatMinutesHuman(bucket.minutes)} · ${bucketSessionLabel(bucket)}`;

const createBucket = ({
    id,
    start,
    end = null,
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
    end,
    minutes: 0,
    fixedMinutes: 0,
    sessionCount: 0,
    fixedSessionCount: 0,
    runningClockUids: [],
    runningEntries: [],
    durationFormat,
    durationLabel: '',
    fullDurationLabel: formatActivityDuration(0),
    dateLabel,
    monthLabel,
    fullDateLabel:
        fullDateLabel || fullDateLabelFor(unit, start),
    ariaLabel: bucketAriaLabel(
        { minutes: 0, fullDurationLabel: formatMinutesHuman(0), sessionCount: 0 },
        fullDateLabel || fullDateLabelFor(unit, start)
    ),
});

const refreshBucketLabels = (bucket, dateText = bucket.fullDateLabel) => {
    bucket.durationLabel = visibleDurationLabel(bucket.minutes, bucket.durationFormat);
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
        bucket.fixedSessionCount += 1;
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

const entryInterval = (entry, now) => {
    if (!isValidDate(entry?.start)) return null;
    const startMs = entry.start.getTime();
    const endDate = entry.running ? now : entry.end;
    if (!isValidDate(endDate)) return null;
    return {
        startMs,
        endMs: Math.max(startMs, endDate.getTime()),
    };
};

const splitMinutes = (totalMinutes, segments) => {
    if (segments.length === 0) return [];
    const totalMs = segments.reduce((sum, segment) => sum + segment.overlapMs, 0);
    const target = Math.min(
        Math.max(0, Math.round(Number(totalMinutes) || 0)),
        Math.floor(totalMs / MINUTE_MS)
    );
    if (target <= 0 || totalMs <= 0) return segments.map(() => 0);

    const allocations = segments.map(segment => {
        const exact = (target * segment.overlapMs) / totalMs;
        return { base: Math.floor(exact), remainder: exact - Math.floor(exact) };
    });
    let remainder = target - allocations.reduce((sum, allocation) => sum + allocation.base, 0);
    const order = allocations
        .map((allocation, index) => ({ ...allocation, index }))
        .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
    for (let index = 0; index < order.length && remainder > 0; index += 1, remainder -= 1) {
        allocations[order[index].index].base += 1;
    }
    return allocations.map(allocation => allocation.base);
};

const todaySegments = (buckets, entry, now) => {
    const interval = entryInterval(entry, now);
    if (!interval) return [];
    return buckets
        .map(bucket => {
            const bucketStartMs = bucket.start.getTime();
            const bucketEndMs = bucket.end.getTime();
            const overlapStart = Math.max(interval.startMs, bucketStartMs);
            const overlapEnd = Math.min(interval.endMs, bucketEndMs);
            const isPointEntry =
                interval.startMs === interval.endMs &&
                interval.startMs >= bucketStartMs &&
                interval.startMs < bucketEndMs;
            if (overlapEnd <= overlapStart && !isPointEntry) return null;
            return { bucket, overlapMs: Math.max(0, overlapEnd - overlapStart) };
        })
        .filter(Boolean);
};

const addTodayEntry = (buckets, entry, now) => {
    const segments = todaySegments(buckets, entry, now);
    const allocations = splitMinutes(entryMinutes(entry, now), segments);
    for (const [index, segment] of segments.entries()) {
        const bucket = segment.bucket;
        bucket.minutes += allocations[index];
        const startsInBucket =
            entry.start.getTime() >= bucket.start.getTime() && entry.start.getTime() < bucket.end.getTime();
        if (startsInBucket) bucket.sessionCount += 1;
        if (entry.running) {
            bucket.runningClockUids.push(entry.clockUid);
            bucket.runningEntries.push(entry);
        } else {
            bucket.fixedMinutes += allocations[index];
            if (startsInBucket) bucket.fixedSessionCount += 1;
        }
        refreshBucketLabels(bucket);
    }
};

const createTodayBuckets = now => {
    const day = startOfDay(now);
    const buckets = [];
    for (let hour = 0; hour < TODAY_HOUR_COUNT; hour += 1) {
        const start = new Date(day);
        start.setHours(hour, 0, 0, 0);
        const end = new Date(day);
        end.setHours(hour + 1, 0, 0, 0);
        const hourText = formatTime(start);
        buckets.push(
            createBucket({
                id: `${dateKey(day)}T${pad(hour)}`,
                start,
                end,
                unit: 'hour',
                durationFormat: 'human',
                dateLabel: formatHourLabel(hour),
                fullDateLabel: `${formatFullDate(start)} at ${hourText}`,
            })
        );
    }
    return buckets;
};

const buildToday = (entries, now) => {
    const buckets = createTodayBuckets(now);
    for (const entry of entries) addTodayEntry(buckets, entry, now);
    for (const bucket of buckets) refreshBucketLabels(bucket);
    return { unit: 'hour', buckets };
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
            unit: selectedRange.id === 'today' ? 'hour' : 'day',
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
        bucket.fullDateLabel
    );
    return bucket;
}

/** Update the fixed 24-hour Today model from the cached running entries only. */
export function refreshActivityBuckets(activity, now) {
    if (activity?.unit !== 'hour' || !activity.buckets?.length) return activity;
    for (const bucket of activity.buckets) {
        bucket.minutes = bucket.fixedMinutes;
        bucket.sessionCount = bucket.fixedSessionCount;
        bucket.runningClockUids = [];
        bucket.runningEntries = [];
    }
    for (const entry of activity.entries || []) {
        if (entry.running) addTodayEntry(activity.buckets, entry, now);
    }
    for (const bucket of activity.buckets) refreshBucketLabels(bucket);
    activity.totalMinutes = activity.buckets.reduce((sum, bucket) => sum + bucket.minutes, 0);
    activity.maxMinutes = activity.buckets.reduce(
        (max, bucket) => Math.max(max, bucket.minutes),
        0
    );
    return activity;
}
