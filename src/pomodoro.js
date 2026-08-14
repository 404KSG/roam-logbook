/**
 * Automatic Pomodoro targets layered on top of running clocks.
 *
 * A target is an *intention*, not a record, and nothing about it belongs in the
 * LOGBOOK drawer, which stays a
 * faithful org clock log. So unlike clock state, this lives in extension
 * settings — keyed by clock uid, which is enough to survive a reload while a
 * session is still open.
 *
 * Overrunning never stops the clock. The target is a prompt to decide, not a
 * timer that decides for you; time keeps accruing until the user clocks out.
 */

import * as clock from './clock.js';
import {
    pomodoroMinutes,
    readSetting,
    SETTING_POMODORO_STATE,
    writeSetting,
} from './settings.js';

/** @type {Map<string, number>} clock uid → positive minutes, or 0 when suppressed */
let targets = new Map();

/** Read persisted targets. Bad state is discarded, never thrown. */
export function load() {
    targets = new Map();
    const raw = readSetting(SETTING_POMODORO_STATE);
    if (!raw) return;
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        for (const [clockUid, minutes] of Object.entries(parsed || {})) {
            const value = Number(minutes);
            if (Number.isFinite(value) && value >= 0) targets.set(clockUid, value);
        }
    } catch (error) {
        console.warn('[roam-logbook] could not read pomodoro state', error);
    }
}

function persist() {
    // Stringified rather than stored as an object: settings round-trip through
    // Roam, and a plain string is the one shape guaranteed to come back intact.
    writeSetting(SETTING_POMODORO_STATE, JSON.stringify(Object.fromEntries(targets)));
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
    targets.set(clockUid, minutes);
    persist();
    return true;
}

/** Start a target from an exact saved duration without exposing decimal minutes. */
export function startDurationMs(clockUid, durationMs) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) return false;
    return start(clockUid, durationMs / 60_000);
}

/** Mark a Session as intentionally having no active target (used after overrun resume). */
export function suppress(clockUid) {
    if (!clockUid) return false;
    targets.set(clockUid, 0);
    persist();
    return true;
}

export function cancel(clockUid) {
    if (!targets.delete(clockUid)) return false;
    persist();
    return true;
}

/** Assign new Sessions and forget assignments whose clock has closed. */
export function reconcile(running) {
    const live = new Set(running.map(entry => entry.clockUid));
    let changed = false;
    for (const clockUid of [...targets.keys()]) {
        if (!live.has(clockUid)) {
            targets.delete(clockUid);
            changed = true;
        }
    }
    for (const entry of running) {
        if (!targets.has(entry.clockUid)) {
            targets.set(entry.clockUid, pomodoroMinutes());
            changed = true;
        }
    }
    if (changed) persist();
    return changed;
}

/** Backward-compatible explicit pruning seam used by older integrations/tests. */
export function prune(runningClockUids) {
    const live = new Set(runningClockUids);
    let changed = false;
    for (const clockUid of [...targets.keys()]) {
        if (!live.has(clockUid)) {
            targets.delete(clockUid);
            changed = true;
        }
    }
    if (changed) persist();
    return changed;
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
 * `clock.subscribe` replays the current list the moment a listener registers,
 * and at startup that list is empty — the graph has not been read yet. Pruning
 * against it would delete every target `load()` had just restored, and persist
 * the loss. So the replay is skipped; the first real prune arrives with the
 * refresh that follows.
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
}
