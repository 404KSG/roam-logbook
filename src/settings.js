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

export function showTopbarWidget() {
    return read(SETTING_TOPBAR) !== false;
}

export function allowMultipleClocks() {
    return read(SETTING_MULTIPLE) === true;
}

export function todoBlocksOnly() {
    return read(SETTING_TODO_ONLY) !== false;
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
