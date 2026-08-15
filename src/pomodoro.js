/**
 * Automatic Pomodoro targets layered on top of running clocks.
 *
 * A target is an intention, not a record, and nothing about it belongs in the
 * LOGBOOK drawer. It lives in extension settings keyed by clock uid, while the
 * graph remains the source of truth for the Session itself.
 */

import * as clock from './clock.js';
import { STATE_FORMATS } from './version.js';
import {
    pomodoroMinutes,
    readSetting,
    SETTING_POMODORO_STATE,
    preserveStateBackup,
    writeSetting,
} from './settings.js';

const VERSION = STATE_FORMATS.pomodoroTargets;
/** @type {Map<string, number>} clock uid → positive minutes, or 0 when suppressed */
let targets = new Map();
let notice = '';
let unsupportedRaw = null;

const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);

const mapFromData = (data, { strict = false } = {}) => {
    if (!isRecord(data)) throw new Error('pomodoro data must be an object');
    const next = new Map();
    for (const [clockUid, minutes] of Object.entries(data)) {
        const value = Number(minutes);
        if (Number.isFinite(value) && value >= 0) next.set(clockUid, value);
        else if (strict) throw new Error(`invalid Pomodoro target for ${clockUid}`);
    }
    return next;
};

const serialized = values =>
    JSON.stringify({ version: VERSION, data: Object.fromEntries(values) });

function writeTargets(next) {
    if (unsupportedRaw !== null) {
        notice = 'Saved Pomodoro state uses an unsupported version and was kept.';
        return false;
    }
    writeSetting(SETTING_POMODORO_STATE, serialized(next));
    targets = next;
    return true;
}

/** Read persisted targets, accepting the original flat map as a legacy format. */
export function load() {
    targets = new Map();
    notice = '';
    unsupportedRaw = null;
    const raw = readSetting(SETTING_POMODORO_STATE);
    if (!raw) return;

    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        let next;
        if (isRecord(parsed) && parsed.version === VERSION && 'data' in parsed) {
            next = mapFromData(parsed.data, { strict: true });
        } else if (isRecord(parsed) && !('version' in parsed)) {
            next = mapFromData(parsed);
        } else {
            throw new Error('unsupported pomodoro state version');
        }
        try {
            // This also upgrades the old flat map to the explicit version/data
            // shape. If settings are temporarily read-only, keep the in-memory
            // values and let the next successful write finish the migration.
            writeTargets(next);
        } catch (error) {
            targets = next;
            notice = 'Pomodoro state was read, but its migration could not be saved yet.';
            console.warn('[roam-logbook] could not migrate pomodoro state', error);
        }
    } catch (error) {
        unsupportedRaw = raw;
        const firstWarning = preserveStateBackup(SETTING_POMODORO_STATE, raw);
        notice = firstWarning
            ? 'Saved Pomodoro state uses an unsupported or invalid version and was kept.'
            : '';
        if (firstWarning) console.warn('[roam-logbook] could not read pomodoro state', error);
    }
}

export function getNotice() {
    return notice;
}

export function targetMinutes(clockUid) {
    const minutes = targets.get(clockUid);
    return minutes > 0 ? minutes : null;
}

/** Exact target duration, including a resumed sub-minute remainder. */
export function targetDurationMs(clockUid) {
    const minutes = targetMinutes(clockUid);
    return minutes === null ? null : minutes * 60_000;
}

export function isActive(clockUid) {
    return (targets.get(clockUid) ?? 0) > 0;
}

/** Whether this Session has been assigned, including an explicit suppression. */
export function isAssigned(clockUid) {
    return targets.has(clockUid);
}

export function start(clockUid, minutes = pomodoroMinutes()) {
    if (!clockUid || !(minutes > 0)) return false;
    const next = new Map(targets);
    next.set(clockUid, minutes);
    return writeTargets(next);
}

/** Start a target from an exact saved duration without exposing decimal minutes. */
export function startDurationMs(clockUid, durationMs) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return false;
    return start(clockUid, durationMs / 60_000);
}

/** Mark a Session as intentionally having no active target (used after overrun resume). */
export function suppress(clockUid) {
    if (!clockUid) return false;
    const next = new Map(targets);
    next.set(clockUid, 0);
    return writeTargets(next);
}

export function cancel(clockUid) {
    if (!targets.has(clockUid)) return false;
    const next = new Map(targets);
    next.delete(clockUid);
    return writeTargets(next);
}

/** Assign new Sessions and forget assignments whose clock has closed. */
export function reconcile(running) {
    if (unsupportedRaw !== null) return false;
    const live = new Set(running.map(entry => entry.clockUid));
    const next = new Map(targets);
    for (const clockUid of [...next.keys()]) {
        if (!live.has(clockUid)) next.delete(clockUid);
    }
    for (const entry of running) {
        if (!next.has(entry.clockUid)) next.set(entry.clockUid, pomodoroMinutes());
    }
    if (next.size === targets.size && [...next].every(([uid, value]) => targets.get(uid) === value)) {
        return false;
    }
    writeTargets(next);
    return true;
}

/** Backward-compatible explicit pruning seam used by older integrations/tests. */
export function prune(runningClockUids) {
    const live = new Set(runningClockUids);
    const next = new Map([...targets].filter(([clockUid]) => live.has(clockUid)));
    if (next.size === targets.size) return false;
    return writeTargets(next);
}

/**
 * How far past its target a session has run.
 *
 * @returns {number} milliseconds over, or 0 when inside the target or when the
 *   session has no pomodoro at all
 */
export function overrunMs(entry, now = Date.now()) {
    const minutes = entry && targets.get(entry.clockUid);
    if (!minutes) return 0;
    return Math.max(0, now - entry.start.getTime() - minutes * 60_000);
}

export function isOverrun(entry, now = Date.now()) {
    return overrunMs(entry, now) > 0;
}

/**
 * Keep the stored targets in step with what is actually running.
 *
 * `clock.subscribe` replays the current list before the graph has been read. The
 * replay is skipped so a reload cannot prune valid assignments prematurely.
 */
export function attach() {
    let sawInitialReplay = false;
    return clock.subscribe(running => {
        if (!sawInitialReplay) {
            sawInitialReplay = true;
            return;
        }
        reconcile(running);
    });
}

export function reset() {
    targets = new Map();
    notice = '';
    unsupportedRaw = null;
}
