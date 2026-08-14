/**
 * Settings, backed by Roam's `extensionAPI.settings`.
 *
 * Getters are defensive because `settings.get` returns `undefined` for a key the
 * user has never touched, and the switch widget hands back a raw event.
 */

export const SETTING_TOPBAR = 'showTopbarWidget';
export const SETTING_MULTIPLE = 'allowMultipleClocks';
export const SETTING_TODO_ONLY = 'todoBlocksOnly';
export const SETTING_STALE_HOURS = 'staleHours';
export const SETTING_POMODORO_MINUTES = 'pomodoroMinutes';
/** Internal, not shown in the panel: which running clocks have a pomodoro. */
export const SETTING_POMODORO_STATE = 'pomodoroTargets';
/** Internal, graph-scoped state for work deliberately paused as one batch. */
export const SETTING_PAUSED_BATCH = 'pausedBatch';

const DEFAULTS = {
    [SETTING_TOPBAR]: true,
    [SETTING_MULTIPLE]: false,
    [SETTING_TODO_ONLY]: true,
    [SETTING_STALE_HOURS]: '8',
    [SETTING_POMODORO_MINUTES]: '30',
};

let extensionAPI = null;

export function setExtensionAPI(api) {
    extensionAPI = api;
}

function read(key) {
    const value = extensionAPI?.settings?.get(key);
    return value === undefined || value === null ? DEFAULTS[key] : value;
}

function booleanSetting(key) {
    const value = read(key);
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1') return true;
        if (normalized === 'false' || normalized === '0') return false;
    }
    return Boolean(DEFAULTS[key]);
}

export function showTopbarWidget() {
    return booleanSetting(SETTING_TOPBAR);
}

export function allowMultipleClocks() {
    return booleanSetting(SETTING_MULTIPLE);
}

export function todoBlocksOnly() {
    return booleanSetting(SETTING_TODO_ONLY);
}

export function staleHours() {
    const parsed = Number(read(SETTING_STALE_HOURS));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 8;
}

export function pomodoroMinutes() {
    const parsed = Number(read(SETTING_POMODORO_MINUTES));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}

/** Raw access, for state the extension persists rather than the user edits. */
export function readSetting(key) {
    return extensionAPI?.settings?.get(key) ?? null;
}

export function writeSetting(key, value) {
    extensionAPI?.settings?.set(key, value);
}

/** Blueprint switches call `onChange` with an event, the docs suggest a boolean. */
export function normalizeChecked(event) {
    return typeof event === 'boolean' ? event : Boolean(event?.target?.checked);
}

export function normalizeSelected(event) {
    return typeof event === 'string' ? event : String(event?.target?.value ?? '');
}

/** Normalize an arbitrary positive minute input without persisting noisy decimals. */
export function normalizePositiveMinutes(event, fallback = pomodoroMinutes()) {
    const parsed = Number(normalizeSelected(event).trim());
    const candidate = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    const rounded = Number(candidate.toFixed(6));
    return String(rounded > 0 ? rounded : 30);
}
