import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { installGraph, uninstallGraph } from './helpers/graph-stub.js';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;

const extensionAPI = {
    settings: {
        get: () => undefined,
        set: () => {},
    },
};

const { setExtensionAPI } = await import('../src/settings.js');
const { createDashboard } = await import('../src/dashboard.js');
const clock = await import('../src/clock.js');

let graph;

test.beforeEach(() => {
    graph = installGraph([
        { uid: 'live-parent', string: '{{[[TODO]]}} Parent project', parent: null },
        { uid: 'live-child', string: '{{[[TODO]]}} Child running task', parent: 'live-parent' },
    ]);
    setExtensionAPI(extensionAPI);
    clock.reset();
});

test.afterEach(() => {
    document.body.replaceChildren();
    clock.reset();
    setExtensionAPI(null);
});

test.after(() => uninstallGraph());

test('Dashboard live elapsed updates only running cells without graph reads or tree rebuilds', async () => {
    let nowMs = new Date('2026-08-15T09:00:00').getTime();
    let tick;
    let nextTimer = 0;
    let clearCount = 0;
    let queryCount = 0;
    const query = graph.api.data.q;
    graph.api.data.q = (...args) => {
        queryCount += 1;
        return query(...args);
    };

    await clock.clockIn('live-child', { now: new Date(nowMs) });
    const dashboard = createDashboard({
        now: () => new Date(nowMs),
        setIntervalFn: callback => {
            tick = callback;
            nextTimer += 1;
            return nextTimer;
        },
        clearIntervalFn: () => {
            clearCount += 1;
        },
    });

    dashboard.open();
    const elapsed = document.querySelector('[data-running-elapsed="true"]');
    assert.ok(tick, 'opening a Dashboard with a Running Session starts the injected timer');
    assert.equal(elapsed.dataset.clockUid, clock.getRunning()[0].clockUid);
    assert.equal(elapsed.dataset.startMs, String(nowMs));

    const beforeQueries = queryCount;
    const toggle = document.querySelector('.rlb-tree__toggle');
    assert.ok(toggle, 'the fixture has a collapsible parent Task');
    toggle.click();
    assert.equal(document.querySelectorAll('.rlb-tree__cell').length, 1);
    const collapsedBody = document.querySelector('.rlb-body');

    nowMs += 61_000;
    tick();
    assert.equal(elapsed.textContent, '1:01');
    assert.equal(queryCount, beforeQueries, 'a live tick does not query the graph');
    assert.equal(document.querySelector('.rlb-body'), collapsedBody);
    assert.equal(document.querySelectorAll('.rlb-tree__cell').length, 1);
    assert.equal(document.querySelector('.rlb-tree__toggle').getAttribute('aria-expanded'), 'false');

    dashboard.close();
    assert.equal(clearCount, 1, 'closing clears the injected timer');
    dashboard.destroy();
});

test('Dashboard refresh and range changes replace live handles safely', async () => {
    let nowMs = new Date('2026-08-15T09:00:00').getTime();
    const timers = [];
    const cleared = [];
    await clock.clockIn('live-child', { now: new Date(nowMs) });
    const dashboard = createDashboard({
        now: () => new Date(nowMs),
        setIntervalFn: callback => {
            const timer = { callback };
            timers.push(timer);
            return timer;
        },
        clearIntervalFn: timer => cleared.push(timer),
    });

    dashboard.open();
    assert.equal(timers.length, 1);
    const firstCell = document.querySelector('[data-running-elapsed="true"]');
    document.querySelector('.rlb-icon-button.bp3-icon-refresh').click();
    assert.equal(cleared.length, 1);
    assert.equal(timers.length, 2);
    const refreshedCell = document.querySelector('[data-running-elapsed="true"]');
    assert.notEqual(refreshedCell, firstCell, 'a full refresh creates a fresh DOM handle');

    nowMs += 2_000;
    timers[1].callback();
    assert.equal(refreshedCell.textContent, '0:02');

    const range = document.querySelector('.rlb-header select');
    range.value = 'month';
    range.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.equal(cleared.length, 2);
    assert.equal(timers.length, 3);

    dashboard.destroy();
    assert.equal(cleared.length, 3, 'destroy clears the current live handle');
});

test('Dashboard running actions use neutral stop semantics and confirm CLOCK discard', async () => {
    const nowMs = new Date('2026-08-15T09:00:00').getTime();
    await clock.clockIn('live-child', { now: new Date(nowMs) });
    const clockUid = clock.getRunning()[0].clockUid;
    const dashboard = createDashboard({ now: () => new Date(nowMs) });
    dashboard.open();

    const running = document.querySelector('[data-running-elapsed="true"]').closest('tr');
    const stop = running.querySelector('[data-action="clock-out"]');
    assert.equal(stop.classList.contains('bp3-intent-success'), false);
    assert.equal(stop.getAttribute('aria-label'), stop.title);

    const discard = running.querySelector('[data-action="discard"]');
    discard.click();
    assert.ok(graph.store.has(clockUid));
    const confirm = document.querySelector('[data-action="discard"]');
    assert.match(confirm.title, /confirm discard/i);
    confirm.click();
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(graph.store.has(clockUid), false);
    dashboard.destroy();
});

test('Last 7 days renders seven accessible green intensity cells including zero days', () => {
    graph = installGraph([
        { uid: 'day-task', string: '{{[[TODO]]}} Activity task', parent: null },
        { uid: 'day-drawer', string: 'LOGBOOK::', parent: 'day-task' },
        {
            uid: 'day-zero',
            string: 'CLOCK:: [2026-08-09 Sun 09:00]--[2026-08-09 Sun 09:00] => 0:00',
            parent: 'day-drawer',
        },
        {
            uid: 'day-small',
            string: 'CLOCK:: [2026-08-10 Mon 09:00]--[2026-08-10 Mon 09:30] => 0:30',
            parent: 'day-drawer',
        },
        {
            uid: 'day-large',
            string: 'CLOCK:: [2026-08-12 Wed 09:00]--[2026-08-12 Wed 11:00] => 2:00',
            parent: 'day-drawer',
        },
    ]);
    const nowMs = new Date('2026-08-15T12:00:00').getTime();
    clock.reset();
    const dashboard = createDashboard({ now: () => new Date(nowMs) });
    dashboard.open();

    const bars = document.querySelector('.rlb-bars');
    const cells = [...bars.querySelectorAll('.rlb-bar')];
    assert.equal(bars.dataset.dayCount, '7');
    assert.equal(cells.length, 7);
    assert.ok(cells.every(cell => cell.querySelector('.rlb-bar__label')?.textContent));
    assert.ok(cells.every(cell => /2026-08-\d{2}/.test(cell.getAttribute('aria-label'))));
    assert.ok(cells.every(cell => /\d+(?:h \d{2}m|m)/.test(cell.title)));
    assert.ok(cells.some(cell => cell.classList.contains('rlb-bar--level-0')));
    assert.ok(cells.some(cell => cell.classList.contains('rlb-bar--level-3')));
    assert.ok(cells.some(cell => /(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/.test(cell.textContent)));

    dashboard.destroy();
});
