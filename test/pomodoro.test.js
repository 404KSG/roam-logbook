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

const cycleEntry = (clockUid, startedAt, extra = {}) => ({
    clockUid,
    taskUid: clockUid,
    start: new Date(startedAt),
    ...extra,
});

test.beforeEach(() => {
    useSettings();
    pomodoro.reset();
});
test.after(() => uninstallGraph());

test('shared cycle uses one frozen threshold with exact boundary semantics', () => {
    const startedAt = Date.parse('2026-08-15T09:00:00Z');
    const now = startedAt + 45 * 60_000;
    const cycle = pomodoro.reconcileCycle([cycleEntry('cycle-1', startedAt)], { now });

    assert.equal(cycle.startedAt, startedAt);
    assert.equal(cycle.thresholdMinutes, 45);
    assert.equal(pomodoro.cycleElapsedMs(startedAt + 3 * 60_000), 3 * 60_000);
    assert.equal(pomodoro.isCycleOverrun(startedAt + 44 * 60_000 + 59_000), false);
    assert.equal(pomodoro.isCycleOverrun(now), true);
    assert.equal(pomodoro.isCycleOverrun(now + 1_000), true);
});

test('historical totals and legacy per-clock targets cannot turn a short shared cycle red', () => {
    const now = Date.parse('2026-08-15T09:03:00Z');
    pomodoro.start('legacy-3-minute-target', 3);
    pomodoro.start('legacy-13-minute-target', 13);
    pomodoro.reconcileCycle([
        cycleEntry('legacy-3-minute-target', now - 3 * 60_000, { priorMinutes: 600 }),
        cycleEntry('legacy-13-minute-target', now - 2 * 60_000, { priorMinutes: 900 }),
    ], { now });

    assert.equal(pomodoro.cycleElapsedMs(now), 3 * 60_000);
    assert.equal(pomodoro.isCycleOverrun(now), false);
    assert.equal(pomodoro.targetMinutes('legacy-3-minute-target'), 3);
    assert.equal(pomodoro.targetMinutes('legacy-13-minute-target'), 13);
});

test('Focused clock changes retain one cycle, while empty running state resets it', () => {
    const startedAt = Date.parse('2026-08-15T09:00:00Z');
    const first = cycleEntry('parallel-1', startedAt);
    const second = cycleEntry('parallel-2', startedAt + 8 * 60_000);
    const third = cycleEntry('parallel-3', startedAt + 12 * 60_000);

    const initial = pomodoro.reconcileCycle([first]);
    assert.equal(pomodoro.reconcileCycle([first, second]).startedAt, initial.startedAt);
    assert.equal(pomodoro.reconcileCycle([second, third]).startedAt, initial.startedAt);
    assert.equal(pomodoro.reconcileCycle([third]).startedAt, initial.startedAt);
    assert.equal(pomodoro.reconcileCycle([]), null);
    assert.equal(pomodoro.getCycle(), null);

    const switchedCycle = pomodoro.reconcileCycle([third], { now: startedAt + 20 * 60_000 });
    assert.equal(switchedCycle.startedAt, third.start.getTime());
    assert.notEqual(switchedCycle.startedAt, initial.startedAt);
});

test('cycle reload restores a valid persisted cycle and falls back to the earliest open CLOCK', () => {
    const startedAt = Date.parse('2026-08-15T09:00:00Z');
    const store = useSettings();
    pomodoro.reconcileCycle([cycleEntry('reload-1', startedAt)]);
    const persisted = JSON.parse(store.get('pomodoroCycle'));
    assert.equal(persisted.data.startedAt, startedAt);

    pomodoro.reset();
    setExtensionAPI({ settings: { get: key => store.get(key), set: (key, value) => store.set(key, value) } });
    pomodoro.load();
    assert.equal(pomodoro.reconcileCycle([cycleEntry('reload-1', startedAt + 4 * 60_000)]).startedAt, startedAt);

    // A confirmed empty graph is authoritative: a reload with no open CLOCK
    // cannot keep presenting the previous cycle as active.
    assert.equal(pomodoro.reconcileCycle([]), null);
    assert.equal(pomodoro.getCycle(), null);

    pomodoro.reset();
    useSettings();
    const later = cycleEntry('fallback-later', startedAt + 6 * 60_000);
    const earliest = cycleEntry('fallback-earliest', startedAt + 2 * 60_000);
    assert.equal(pomodoro.reconcileCycle([later, earliest]).startedAt, earliest.start.getTime());
});

test('active cycle threshold stays frozen until the next cycle', () => {
    const startedAt = Date.parse('2026-08-15T09:00:00Z');
    const store = useSettings({ pomodoroMinutes: '30' });
    const cycle = pomodoro.reconcileCycle([cycleEntry('freeze-1', startedAt)]);
    store.set('pomodoroMinutes', '45');
    assert.equal(pomodoro.reconcileCycle([cycleEntry('freeze-1', startedAt)]).thresholdMinutes, cycle.thresholdMinutes);
    pomodoro.reconcileCycle([]);
    assert.equal(pomodoro.reconcileCycle([cycleEntry('freeze-2', startedAt + 60_000)]).thresholdMinutes, 45);
});

test('reconciling an unchanged compatibility state is idempotent', () => {
    const startedAt = Date.parse('2026-08-15T09:00:00Z');
    const running = [cycleEntry('compat-1', startedAt)];

    assert.equal(pomodoro.reconcile(running), true);
    assert.equal(pomodoro.reconcile(running), false);
});

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

test('an unset or nonsense length still yields the 45-minute default', () => {
    useSettings({ pomodoroMinutes: 'not a number' });
    pomodoro.start('c1');
    assert.equal(pomodoro.targetMinutes('c1'), 45);
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
    assert.equal(pomodoro.targetMinutes(clockUid), 45, 'Clock In is assigned automatically');

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
