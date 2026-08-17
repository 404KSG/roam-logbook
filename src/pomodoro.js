/**
 * A shared Pomodoro cycle layered on top of running clocks.
 *
 * `cycle` is the active user-facing timer: one frozen threshold and one start
 * instant for the current continuous Focused work period. Seamless task
 * switches retain the same cycle. The old
 * clock-UID target map remains only as a versioned compatibility read/write
 * seam for older integrations; it no longer drives the topbar or session UI.
 */

import * as clock from './clock.js';
import { STATE_FORMATS } from './version.js';
import {
    pomodoroMinutes,
    readSetting,
    SETTING_POMODORO_CYCLE,
    SETTING_POMODORO_STATE,
    preserveStateBackup,
    writeSetting,
} from './settings.js';

const VERSION = STATE_FORMATS.pomodoroTargets;
const CYCLE_VERSION = STATE_FORMATS.pomodoroCycle;
/** @type {Map<string, number>} Deprecated clock uid → positive minutes, or 0 when suppressed. */
let targets = new Map();
/** @type {{version: number, startedAt: number, thresholdMinutes: number}|null} */
let cycle = null;
let notice = '';
let unsupportedRaw = null;
let unsupportedCycleRaw = null;

const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);

const mapFromData = (data, { strict = false } = {}) => {
    if (!isRecord(data)) throw new Error('pomodoro data must be an object');
    const next = new Map();
    const invalid = [];
    for (const [clockUid, minutes] of Object.entries(data)) {
        const value = Number(minutes);
        if (Number.isFinite(value) && value >= 0) next.set(clockUid, value);
        else invalid.push(clockUid);
    }
    if (strict && invalid.length > 0) {
        throw new Error(`invalid Pomodoro target for ${invalid[0]}`);
    }
    return { next, invalid };
};

const serialized = values =>
    JSON.stringify({ version: VERSION, data: Object.fromEntries(values) });

const serializedCycle = value =>
    JSON.stringify({
        version: CYCLE_VERSION,
        data: value
            ? {
                  startedAt: value.startedAt,
                  thresholdMinutes: value.thresholdMinutes,
              }
            : null,
    });

const validCycle = value => {
    if (!isRecord(value)) return false;
    const startedAt = Number(value.startedAt);
    const thresholdMinutes = Number(value.thresholdMinutes);
    return Number.isFinite(startedAt) && startedAt >= 0 && Number.isFinite(thresholdMinutes) && thresholdMinutes > 0;
};

const cycleFromData = data => {
    if (data === null) return null;
    if (!validCycle(data)) throw new Error('invalid Pomodoro cycle');
    return {
        version: CYCLE_VERSION,
        startedAt: Number(data.startedAt),
        thresholdMinutes: Number(data.thresholdMinutes),
    };
};

function writeCycle(next) {
    if (unsupportedCycleRaw !== null) {
        notice ||= 'Saved Pomodoro cycle uses an unsupported version and was kept.';
        return false;
    }
    try {
        writeSetting(SETTING_POMODORO_CYCLE, serializedCycle(next));
        cycle = next ? { ...next } : null;
        return true;
    } catch (error) {
        notice ||= 'Pomodoro cycle could not be saved yet; the current cycle remains in memory.';
        console.warn('[roam-logbook] could not persist Pomodoro cycle', error);
        cycle = next ? { ...next } : null;
        return false;
    }
}

function loadCycle() {
    const raw = readSetting(SETTING_POMODORO_CYCLE);
    if (!raw) return;
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!isRecord(parsed) || parsed.version !== CYCLE_VERSION || !('data' in parsed)) {
            throw new Error('unsupported pomodoro cycle version');
        }
        cycle = cycleFromData(parsed.data);
    } catch (error) {
        unsupportedCycleRaw = raw;
        const firstWarning = preserveStateBackup(SETTING_POMODORO_CYCLE, raw);
        if (!notice && firstWarning) {
            notice = 'Saved Pomodoro cycle uses an unsupported or invalid version and was kept.';
        }
        if (firstWarning) console.warn('[roam-logbook] could not read Pomodoro cycle', error);
    }
}

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
    cycle = null;
    notice = '';
    unsupportedRaw = null;
    unsupportedCycleRaw = null;
    loadCycle();
    const raw = readSetting(SETTING_POMODORO_STATE);
    if (!raw) return;

    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        let next;
        if (isRecord(parsed) && parsed.version === VERSION && 'data' in parsed) {
            next = mapFromData(parsed.data, { strict: true }).next;
        } else if (isRecord(parsed) && !('version' in parsed)) {
            const legacy = mapFromData(parsed);
            if (legacy.invalid.length > 0) {
                // Do not migrate a mixed map by silently dropping the bad keys.
                // Valid values remain usable in memory, while the complete raw
                // source is backed up and left untouched for manual recovery.
                targets = legacy.next;
                unsupportedRaw = raw;
                const firstWarning = preserveStateBackup(SETTING_POMODORO_STATE, raw);
                notice = firstWarning
                    ? 'Legacy Pomodoro state contains invalid entries; its raw value was backed up and kept.'
                    : '';
                if (firstWarning) {
                    console.warn('[roam-logbook] could not safely migrate mixed Pomodoro state', legacy.invalid);
                }
                return;
            }
            next = legacy.next;
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

/** Return the active shared cycle without exposing mutable module state. */
export function getCycle() {
    return cycle ? { ...cycle } : null;
}

const instantMs = value =>
    value instanceof Date ? value.getTime() : Number.isFinite(Number(value)) ? Number(value) : Date.now();

/** Milliseconds elapsed since the shared cycle began. */
export function cycleElapsedMs(now = Date.now()) {
    return cycle ? Math.max(0, instantMs(now) - cycle.startedAt) : 0;
}

export function cycleThresholdMinutes() {
    return cycle?.thresholdMinutes ?? null;
}

export function cycleThresholdMs() {
    return cycle ? cycle.thresholdMinutes * 60_000 : null;
}

/** The shared Pomodoro turns red at the exact threshold and keeps counting. */
export function isCycleOverrun(now = Date.now()) {
    const threshold = cycleThresholdMs();
    return threshold !== null && cycleElapsedMs(now) >= threshold;
}

export function cycleOverrunMs(now = Date.now()) {
    const threshold = cycleThresholdMs();
    return threshold === null ? 0 : Math.max(0, cycleElapsedMs(now) - threshold);
}

/**
 * Reconcile one graph snapshot with the shared Pomodoro cycle.
 *
 * A non-empty snapshot starts a cycle only when no cycle is active. The cycle
 * then survives Focused task switches until the graph confirms that no Focused
 * work remains. On reload, a valid persisted cycle wins; otherwise
 * the earliest open CLOCK is the conservative fallback.
 */
export function reconcileCycle(running = [], { now = Date.now() } = {}) {
    const entries = Array.isArray(running) ? running : [];
    if (entries.length === 0) {
        if (cycle !== null) writeCycle(null);
        return null;
    }
    if (cycle) return getCycle();

    const starts = entries
        .map(entry => (entry?.start instanceof Date ? entry.start.getTime() : Number(entry?.start)))
        .filter(value => Number.isFinite(value));
    const startedAt = starts.length > 0 ? Math.min(...starts) : instantMs(now);
    const next = {
        version: CYCLE_VERSION,
        startedAt,
        thresholdMinutes: pomodoroMinutes(),
    };
    writeCycle(next);
    return getCycle();
}

/** Align a newly created cycle to the action instant, not minute-only Org text. */
export function startCycleAt(running = [], startedAt = Date.now()) {
    if (!Array.isArray(running) || running.length === 0) return null;
    const instant = instantMs(startedAt);
    const next = {
        version: CYCLE_VERSION,
        startedAt: instant,
        thresholdMinutes: pomodoroMinutes(),
    };
    writeCycle(next);
    return getCycle();
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

/**
 * Keep deprecated clock-UID assignments in step with the graph for old
 * integrations. The shared cycle above is deliberately independent of this
 * compatibility map.
 */
export function reconcile(running) {
    const cycleBefore = getCycle();
    const cycleAfter = reconcileCycle(running);
    if (unsupportedRaw !== null) return cycleBefore !== cycleAfter;
    const live = new Set(running.map(entry => entry.clockUid));
    const next = new Map(targets);
    for (const clockUid of [...next.keys()]) {
        if (!live.has(clockUid)) next.delete(clockUid);
    }
    for (const entry of running) {
        if (!next.has(entry.clockUid)) next.set(entry.clockUid, pomodoroMinutes());
    }
    if (next.size === targets.size && [...next].every(([uid, value]) => targets.get(uid) === value)) {
        return cycleBefore?.startedAt !== cycleAfter?.startedAt || cycleBefore?.thresholdMinutes !== cycleAfter?.thresholdMinutes;
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
    const unsubscribe = clock.subscribe(running => {
        if (!sawInitialReplay) {
            sawInitialReplay = true;
            return;
        }
        reconcile(running);
    });
    const unsubscribeActions = clock.subscribeActions(action => {
        if (action?.type !== 'clock-in' || !action.newCycle || !Number.isFinite(action.cycleStartedAt)) {
            return;
        }
        startCycleAt(clock.getRunning(), action.cycleStartedAt);
    });
    return () => {
        unsubscribe();
        unsubscribeActions();
    };
}

export function reset() {
    targets = new Map();
    cycle = null;
    notice = '';
    unsupportedRaw = null;
    unsupportedCycleRaw = null;
}
