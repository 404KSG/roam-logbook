import test from 'node:test';
import assert from 'node:assert/strict';

import { installGraph, uninstallGraph } from './helpers/graph-stub.js';

installGraph();

const pomodoro = await import('../src/pomodoro.js');
const clock = await import('../src/clock.js');
const { setExtensionAPI, SETTING_POMODORO_STATE } = await import('../src/settings.js');

/** A settings double that round-trips values the way Roam's does. */
function useSettings(seed = {}) {
    const store = new Map(Object.entries(seed));
    setExtensionAPI({ settings: { get: key => store.get(key), set: (key, value) => store.set(key, value) } });
    return store;
}

const entry = (clockUid, startedMinutesAgo, now) => ({
    clockUid,
    start: new Date(now - startedMinutesAgo * 60_000),
});

test.beforeEach(() => {
    useSettings();
    pomodoro.reset();
});
test.after(() => uninstallGraph());

test('a session without a pomodoro can never be overrun', () => {
    const now = Date.now();
    assert.equal(pomodoro.targetMinutes('c1'), null);
    assert.equal(pomodoro.isOverrun(entry('c1', 600, now), now), false);
    assert.equal(pomodoro.overrunMs(entry('c1', 600, now), now), 0);
});

test('overrun is measured from the target, not the session start', () => {
    const now = Date.now();
    pomodoro.start('c1', 30);

    assert.equal(pomodoro.isOverrun(entry('c1', 29, now), now), false);
    assert.equal(pomodoro.isOverrun(entry('c1', 31, now), now), true);
    assert.equal(pomodoro.overrunMs(entry('c1', 35, now), now), 5 * 60_000);
});

test('the clock is never stopped by the target — overrun just keeps growing', () => {
    const now = Date.now();
    pomodoro.start('c1', 30);
    // Hours past the target and the session is still simply a session.
    assert.equal(pomodoro.overrunMs(entry('c1', 210, now), now), 180 * 60_000);
    assert.equal(pomodoro.isActive('c1'), true);
});

test('the length falls back to the configured default', () => {
    useSettings({ pomodoroMinutes: '45' });
    pomodoro.start('c1');
    assert.equal(pomodoro.targetMinutes('c1'), 45);
});

test('an unset or nonsense length still yields 30 minutes', () => {
    useSettings({ pomodoroMinutes: 'not a number' });
    pomodoro.start('c1');
    assert.equal(pomodoro.targetMinutes('c1'), 30);
});

test('a suppressed assignment is durable and distinct from an active target', () => {
    const store = useSettings();
    assert.equal(pomodoro.suppress('c1'), true);
    assert.equal(pomodoro.isAssigned('c1'), true);
    assert.equal(pomodoro.isActive('c1'), false);
    assert.equal(pomodoro.targetMinutes('c1'), null);

    pomodoro.reset();
    setExtensionAPI({ settings: { get: key => store.get(key), set: (key, value) => store.set(key, value) } });
    pomodoro.load();
    assert.equal(pomodoro.isAssigned('c1'), true);
    assert.equal(pomodoro.isActive('c1'), false);
});

test('targets survive a reload', () => {
    const store = useSettings();
    pomodoro.start('c1', 25);

    // Stand in for a restart: drop memory, keep what was written to settings.
    pomodoro.reset();
    assert.equal(pomodoro.targetMinutes('c1'), null);
    setExtensionAPI({ settings: { get: key => store.get(key), set: (k, v) => store.set(k, v) } });
    pomodoro.load();

    assert.equal(pomodoro.targetMinutes('c1'), 25);
});

test('corrupt stored state is retained rather than silently discarded', () => {
    const corruptStore = useSettings({ [SETTING_POMODORO_STATE]: '{not json' });
    pomodoro.load();
    assert.equal(pomodoro.targetMinutes('c1'), null);
    assert.equal(corruptStore.get(SETTING_POMODORO_STATE), '{not json');
    assert.match(pomodoro.getNotice(), /unsupported or invalid version and was kept/);

    useSettings({ [SETTING_POMODORO_STATE]: JSON.stringify({ c1: -5, c2: 'x', c3: 30 }) });
    pomodoro.load();
    assert.equal(pomodoro.targetMinutes('c1'), null, 'a negative length is not a target');
    assert.equal(pomodoro.targetMinutes('c2'), null);
    assert.equal(pomodoro.targetMinutes('c3'), 30);
});

test('targets are dropped once their clock stops running', () => {
    pomodoro.start('c1', 30);
    pomodoro.start('c2', 30);

    pomodoro.prune(['c2']);

    assert.equal(pomodoro.isActive('c1'), false, 'the closed session is forgotten');
    assert.equal(pomodoro.isActive('c2'), true);
});

test('clocking out prunes the target through the clock subscription', async () => {
    installGraph([{ uid: 'taskone01', string: '{{[[TODO]]}} a task', parent: null }]);
    clock.refresh();
    const detach = pomodoro.attach();

    const { clockUid } = await clock.clockIn('taskone01', { now: new Date(2026, 7, 8, 9, 0) });
    assert.equal(pomodoro.isActive(clockUid), true);
    assert.equal(pomodoro.targetMinutes(clockUid), 30, 'Clock In is assigned automatically');

    await clock.clockOut(clockUid, { now: new Date(2026, 7, 8, 10, 0) });

    assert.equal(pomodoro.isActive(clockUid), false, 'no target should outlive its session');
    detach();
});

test('attaching does not wipe targets before the first graph read', () => {
    const store = useSettings();
    pomodoro.start('c1', 30);

    // A reload: settings survive, memory does not.
    pomodoro.reset();
    clock.reset();
    setExtensionAPI({ settings: { get: k => store.get(k), set: (k, v) => store.set(k, v) } });
    pomodoro.load();
    assert.equal(pomodoro.targetMinutes('c1'), 30, 'load reads it back');

    // subscribe() replays the current running list on registration, and at this
    // point the graph has not been read yet, so that list is empty. Pruning
    // against it would delete every target the reload just restored.
    const detach = pomodoro.attach();

    assert.equal(pomodoro.targetMinutes('c1'), 30, 'attach must not prune against a pre-read list');
    detach();
});
