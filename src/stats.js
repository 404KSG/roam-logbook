/**
 * Pure aggregation over clock entries for the dashboard.
 *
 * Entries are bucketed by their *start* day. An entry that runs across midnight
 * counts wholly against the day it began, which is how org's own clock reports
 * read and keeps a session an indivisible thing.
 */

import { dateKey, startOfDay, startOfDaysAgo } from './time.js';

export const RANGES = [
    { id: 'today', label: 'Today', days: 1 },
    { id: 'week', label: 'Last 7 days', days: 7 },
    { id: 'month', label: 'Last 30 days', days: 30 },
    { id: 'all', label: 'All time', days: null },
];

export function getRange(id) {
    return RANGES.find(range => range.id === id) || RANGES[1];
}

/** Minutes an entry is worth right now — running clocks count up to `now`. */
export function entryMinutes(entry, now) {
    if (!entry.running) return entry.minutes ?? 0;
    return Math.max(0, Math.floor((now.getTime() - entry.start.getTime()) / 60000));
}

/** Entries whose start falls on or after the range's first midnight. */
export function filterByRange(entries, rangeId, now) {
    const { days } = getRange(rangeId);
    if (days === null) return entries.slice();
    const from = days === 1 ? startOfDay(now) : startOfDaysAgo(now, days - 1);
    return entries.filter(entry => entry.start.getTime() >= from.getTime());
}

function totalMinutes(entries, now) {
    return entries.reduce((sum, entry) => sum + entryMinutes(entry, now), 0);
}

/** One row per task, heaviest first. */
export function summariseByTask(entries, now) {
    const byTask = new Map();

    for (const entry of entries) {
        let row = byTask.get(entry.taskUid);
        if (!row) {
            row = {
                taskUid: entry.taskUid,
                title: entry.title,
                pageTitle: entry.pageTitle,
                minutes: 0,
                sessions: 0,
                running: false,
                lastActivity: entry.start,
            };
            byTask.set(entry.taskUid, row);
        }
        row.minutes += entryMinutes(entry, now);
        row.sessions += 1;
        row.running = row.running || entry.running;
        const activity = entry.end ?? entry.start;
        if (activity.getTime() > row.lastActivity.getTime()) row.lastActivity = activity;
    }

    return [...byTask.values()].sort((a, b) => b.minutes - a.minutes);
}

/** Contiguous per-day totals, oldest first — a gapless series to draw bars from. */
export function summariseByDay(entries, now, days) {
    const buckets = new Map();
    for (const entry of entries) {
        const key = dateKey(entry.start);
        buckets.set(key, (buckets.get(key) || 0) + entryMinutes(entry, now));
    }

    const series = [];
    for (let offset = days - 1; offset >= 0; offset -= 1) {
        const date = startOfDaysAgo(now, offset);
        const key = dateKey(date);
        series.push({ date, key, minutes: buckets.get(key) || 0 });
    }
    return series;
}

/** Everything the dashboard renders, computed in one pass. */
export function buildDashboard(entries, { now, rangeId }) {
    const inRange = filterByRange(entries, rangeId, now);
    return {
        rangeId,
        entries: inRange,
        totalMinutes: totalMinutes(inRange, now),
        todayMinutes: totalMinutes(filterByRange(entries, 'today', now), now),
        weekMinutes: totalMinutes(filterByRange(entries, 'week', now), now),
        tasks: summariseByTask(inRange, now),
        days: summariseByDay(inRange, now, getRange(rangeId).days ?? 30),
        running: entries.filter(entry => entry.running),
    };
}

/**
 * Running clocks older than `staleHours` — almost always a session someone
 * forgot to close, so the UI surfaces them for an explicit decision.
 */
export function findStaleClocks(entries, now, staleHours) {
    const cutoff = now.getTime() - staleHours * 3600_000;
    return entries.filter(entry => entry.running && entry.start.getTime() < cutoff);
}
