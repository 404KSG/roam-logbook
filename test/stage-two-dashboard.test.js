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
const { openBlockInRightSidebar } = await import('../src/roam.js');

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
    const checkout = running.querySelector('[data-action="clock-out"]');
    assert.equal(checkout.textContent, '');
    assert.ok(checkout.classList.contains('bp3-icon-log-out'));
    assert.equal(checkout.title, 'Check Out');
    assert.equal(checkout.getAttribute('aria-label'), 'Check Out');
    assert.equal(checkout.classList.contains('bp3-intent-success'), false);

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

test('Dashboard Running and By Task links expose the complete Task title', async () => {
    const nowMs = new Date('2026-08-15T09:00:00').getTime();
    await clock.clockIn('live-child', { now: new Date(nowMs) });
    const dashboard = createDashboard({ now: () => new Date(nowMs) });
    dashboard.open();

    const links = [...document.querySelectorAll('.rlb-task-link')];
    assert.ok(links.length >= 2, 'the running and By Task sections both expose the Task');
    for (const link of links) {
        assert.match(link.getAttribute('aria-label'), /^Open this block: .+/);
        assert.equal(link.getAttribute('aria-label'), link.title);
        assert.notEqual(link.getAttribute('aria-label'), 'Open this block');
    }
    assert.ok(links.some(link => /Child running task/.test(link.title)));
    dashboard.destroy();
});

test('Shift+Click Dashboard task entries opens the matching block in Roam right sidebar', async () => {
    const nativeCalls = [];
    window.roamAlphaAPI.ui.rightSidebar = {
        open: () => nativeCalls.push({ action: 'open' }),
        addWindow: async spec => nativeCalls.push({ action: 'addWindow', spec }),
    };
    const nowMs = new Date('2026-08-15T09:00:00').getTime();
    await clock.clockIn('live-child', { now: new Date(nowMs) });
    const dashboard = createDashboard({ now: () => new Date(nowMs) });
    dashboard.open();

    const runningLink = document.querySelector('.rlb-running .rlb-task-link');
    runningLink.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, shiftKey: true }));
    await new Promise(resolve => setImmediate(resolve));

    assert.deepEqual(nativeCalls, [
        { action: 'open' },
        {
            action: 'addWindow',
            spec: { window: { type: 'block', 'block-uid': 'live-child' } },
        },
    ]);
    assert.equal(document.querySelector('.rlb-root--open') !== null, true);
    dashboard.destroy();
});

test('native task sidebar seam rejects missing UIDs and dedupes repeated block windows', async () => {
    const missing = await openBlockInRightSidebar('');
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, 'missing-uid');

    const calls = [];
    window.roamAlphaAPI.ui.rightSidebar = {
        open: () => calls.push('open'),
        addWindow: async spec => calls.push(spec),
    };
    assert.equal((await openBlockInRightSidebar('live-child')).ok, true);
    assert.equal((await openBlockInRightSidebar('live-child')).deduped, true);
    assert.deepEqual(calls, [
        'open',
        { window: { type: 'block', 'block-uid': 'live-child' } },
        'open',
    ]);
});

test('Integrated summary owns the selected-range activity rail and keeps three metrics', () => {
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

    const summary = document.querySelector('.rlb-summary');
    const metrics = [...summary.querySelectorAll('.rlb-overview__item')];
    assert.equal(metrics.length, 3, 'the summary has a stable three-metric contract');
    assert.deepEqual(
        metrics.map(metric => metric.querySelector('.rlb-overview__label')?.textContent),
        ['Today', 'Last 7 days', 'Tasks tracked']
    );

    const bars = summary.querySelector('.rlb-activity-rail');
    assert.ok(bars, 'activity is embedded in the selected-range metric');
    const cells = [...bars.querySelectorAll('.rlb-activity__bucket')];
    assert.equal(bars.dataset.dayCount, '7');
    assert.equal(bars.getAttribute('role'), 'group');
    assert.equal(cells.length, 7);
    assert.equal(document.querySelector('.rlb-by-day'), null, 'By Day is no longer a standalone section');
    assert.equal(document.querySelector('.rlb-bars__range'), null, 'the range is not repeated below the summary');
    assert.ok(cells.every(cell => cell.querySelector('.rlb-activity__fill')));
    assert.ok(cells.every(cell => /2026-08-\d{2}/.test(cell.getAttribute('aria-label'))));
    assert.ok(cells.every(cell => /\d+(?:h \d{2}m|m)/.test(cell.title)));
    assert.ok(cells.every(cell => cell.tagName === 'BUTTON'));
    assert.ok(cells.every(cell => cell.getAttribute('role') !== 'listitem'));
    assert.ok(cells.some(cell => cell.classList.contains('rlb-activity__bucket--level-0')));
    assert.ok(cells.some(cell => cell.classList.contains('rlb-activity__bucket--level-3')));
    assert.ok(cells.every(cell => cell.textContent === ''));

    const byTask = document.querySelector('.rlb-by-task');
    assert.ok(byTask, 'By Task remains the primary follow-up list');
    assert.ok(
        summary.compareDocumentPosition(byTask) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING
    );

    dashboard.destroy();
});

test('beta.9 exposes three semantic overview panels and keeps activity buckets accessible without a visible axis', () => {
    graph = installGraph([
        { uid: 'compact-task', string: '{{[[TODO]]}} Compact dashboard task', parent: null },
        { uid: 'compact-drawer', string: 'LOGBOOK::', parent: 'compact-task' },
        {
            uid: 'compact-clock',
            string: 'CLOCK:: [2026-08-15 Sat 09:00]--[2026-08-15 Sat 09:30] => 0:30',
            parent: 'compact-drawer',
        },
    ]);
    const dashboard = createDashboard({ now: () => new Date('2026-08-15T12:00:00') });
    dashboard.open();

    const overview = document.querySelector('.rlb-overview');
    assert.ok(overview, 'Dashboard exposes a single semantic overview bar');
    assert.equal(overview.tagName, 'DL');
    assert.equal(overview.getAttribute('aria-label'), 'Logbook overview');
    assert.equal(overview.querySelectorAll('.rlb-overview__item').length, 3);
    assert.equal(overview.querySelectorAll('dt').length, 3);
    assert.equal(overview.querySelectorAll('dd').length, 3);
    assert.equal(document.querySelectorAll('.rlb-stat').length, 0);

    const rail = overview.querySelector('.rlb-activity-rail');
    assert.ok(rail, 'the selected-range metric owns the activity rail');
    assert.equal(rail.querySelectorAll('.rlb-activity__bucket').length, 7);
    assert.equal(rail.querySelectorAll('.rlb-activity__label').length, 0);
    assert.ok(
        [...rail.querySelectorAll('.rlb-activity__bucket')].every(
            bucket =>
                bucket.tagName === 'BUTTON' &&
                bucket.tabIndex >= 0 &&
                /2026-08-\d{2}/.test(bucket.title) &&
                /\d+(?:h \d{2}m|m)/.test(bucket.getAttribute('aria-label'))
        )
    );

    dashboard.destroy();
});

test('beta.10 Dashboard exposes compact-card structure and keeps the activity rail in the range card', async () => {
    graph.store.set('compact-dashboard-task', {
        uid: 'compact-dashboard-task',
        string: '{{[[TODO]]}} Compact dashboard task',
        parent: null,
    });
    await clock.clockIn('compact-dashboard-task', { now: new Date('2026-08-15T09:00:00') });
    const dashboard = createDashboard({ now: () => new Date('2026-08-15T09:00:00') });
    dashboard.open();

    const overview = document.querySelector('.rlb-overview');
    const panels = [...overview.querySelectorAll('.rlb-overview__panel')];
    const rangePanel = panels[1];
    const chart = rangePanel.querySelector('.rlb-activity-rail');

    assert.equal(panels.length, 3);
    assert.ok(panels.every(panel => panel.querySelector('.rlb-overview__heading')));
    assert.ok(panels.every(panel => panel.querySelector('.rlb-overview__value')));
    assert.ok(rangePanel.querySelector('.rlb-overview__heading'));
    assert.equal(rangePanel.querySelector('.rlb-overview__value > .rlb-activity-rail'), null);
    assert.equal(chart.querySelectorAll('.rlb-activity__bucket').length, 7);
    assert.ok(document.querySelector('.rlb-by-task'));

    dashboard.destroy();
});

test('beta.10 zero-time overview uses a quiet empty context instead of a primary visual', () => {
    const dashboard = createDashboard({ now: () => new Date('2026-08-15T09:00:00') });
    dashboard.open();

    const today = document.querySelector('.rlb-overview__item');
    assert.equal(today.querySelector('.rlb-overview__number').textContent, '0m');
    assert.ok(today.querySelector('.rlb-overview__value--quiet'));
    assert.match(today.querySelector('.rlb-overview__context').textContent, /No active Sessions/);

    dashboard.destroy();
});

test('activity rail labels finite ranges and the All time fallback honestly', () => {
    graph = installGraph([
        { uid: 'range-task', string: '{{[[TODO]]}} Range activity', parent: null },
        { uid: 'range-drawer', string: 'LOGBOOK::', parent: 'range-task' },
        {
            uid: 'range-old',
            string: 'CLOCK:: [2026-07-01 Wed 09:00]--[2026-07-01 Wed 10:00] => 1:00',
            parent: 'range-drawer',
        },
        {
            uid: 'range-recent',
            string: 'CLOCK:: [2026-08-10 Mon 09:00]--[2026-08-10 Mon 10:30] => 0:30',
            parent: 'range-drawer',
        },
    ]);
    const nowMs = new Date('2026-08-15T12:00:00').getTime();
    const dashboard = createDashboard({ now: () => new Date(nowMs) });
    dashboard.open();

    const select = document.querySelector('.rlb-header select');
    select.value = 'month';
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    let rail = document.querySelector('.rlb-activity-rail');
    assert.equal(rail.dataset.dayCount, '30');
    assert.match(rail.getAttribute('aria-label'), /Last 30 days activity/i);

    select.value = 'all';
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    rail = document.querySelector('.rlb-activity-rail');
    assert.equal(
        document.querySelectorAll('.rlb-overview__item')[1].querySelector('.rlb-overview__label').textContent,
        'All time'
    );
    assert.equal(rail.dataset.activityScope, 'recent-30-days');
    assert.match(rail.getAttribute('aria-label'), /Recent 30 days activity/i);
    assert.equal(rail.querySelectorAll('.rlb-activity__bucket').length, 30);

    dashboard.destroy();
});

test('the Dashboard is list-first when idle and keeps rollup help accessible without a footer block', () => {
    graph = installGraph([
        { uid: 'idle-parent', string: '{{[[TODO]]}} Idle parent', parent: null },
        { uid: 'idle-child', string: '{{[[TODO]]}} Idle child', parent: 'idle-parent' },
        { uid: 'idle-drawer', string: 'LOGBOOK::', parent: 'idle-child' },
        {
            uid: 'idle-clock',
            string: 'CLOCK:: [2026-08-15 Sat 09:00]--[2026-08-15 Sat 09:30] => 0:30',
            parent: 'idle-drawer',
        },
    ]);
    const dashboard = createDashboard({ now: () => new Date('2026-08-15T12:00:00') });
    dashboard.open();

    assert.equal(document.querySelector('.rlb-running'), null);
    assert.equal(document.querySelector('.rlb-by-day'), null);
    assert.equal(document.querySelector('.rlb-tree__note'), null);
    const byTask = document.querySelector('.rlb-by-task');
    const info = byTask.querySelector('.rlb-tree__info');
    assert.ok(info);
    assert.equal(info.getAttribute('aria-label'), info.title);
    assert.equal(info.getAttribute('aria-describedby'), 'roam-logbook-task-rollup-help');
    assert.ok(document.getElementById('roam-logbook-task-rollup-help'));
    assert.equal(document.querySelectorAll('.rlb-activity-rail').length, 1);

    dashboard.destroy();
});
