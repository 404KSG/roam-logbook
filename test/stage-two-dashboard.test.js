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
const { STYLES } = await import('../src/styles.js');
const clock = await import('../src/clock.js');
const { openBlockInRightSidebar } = await import('../src/roam.js');

let graph;
const settle = async () => {
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
};

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
    let graphReads = 0;
    const query = graph.api.data.q;
    graph.api.data.q = (...args) => {
        if (String(args[0]).includes('LOGBOOK:')) graphReads += 1;
        return query(...args);
    };
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
    const readsAfterOpen = graphReads;
    const firstCell = document.querySelector('[data-running-elapsed="true"]');
    const refresh = document.querySelector('.rlb-icon-button.bp3-icon-refresh');
    const refreshStatus = document.querySelector('.rlb-dashboard__refresh-status');
    refresh.click();
    refresh.click();
    assert.equal(refresh.disabled, true);
    assert.equal(refresh.getAttribute('aria-busy'), 'true');
    assert.equal(refreshStatus.getAttribute('role'), 'status');
    assert.equal(refreshStatus.getAttribute('aria-live'), 'polite');
    assert.match(refreshStatus.textContent, /Refreshing Dashboard/i);
    await settle();
    assert.equal(graphReads, readsAfterOpen + 1, 'fast Dashboard Refresh clicks coalesce');
    assert.equal(cleared.length, 1);
    assert.equal(timers.length, 2);
    assert.equal(refresh.disabled, false);
    assert.equal(refresh.dataset.refreshState, 'success');
    assert.match(refreshStatus.textContent, /Dashboard updated just now/);
    const refreshedCell = document.querySelector('[data-running-elapsed="true"]');
    assert.notEqual(refreshedCell, firstCell, 'a full refresh creates a fresh DOM handle');

    nowMs += 2_000;
    timers[1].callback();
    assert.equal(refreshedCell.textContent, '0:02');

    const range = document.querySelector('.rlb-header select');
    const readsBeforeRange = graphReads;
    range.value = 'month';
    range.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.equal(graphReads, readsBeforeRange, 'range changes reuse the open hierarchy snapshot');
    assert.equal(cleared.length, 2);
    assert.equal(timers.length, 3);

    dashboard.destroy();
    assert.equal(cleared.length, 3, 'destroy clears the current live handle');
});

test('Dashboard Refresh announces a retryable error while retaining the last snapshot', async () => {
    const nowMs = new Date('2026-08-15T09:00:00').getTime();
    await clock.clockIn('live-child', { now: new Date(nowMs) });
    const dashboard = createDashboard({ now: () => new Date(nowMs) });
    dashboard.open();
    const beforeUid = document.querySelector('[data-running-elapsed="true"]').dataset.clockUid;
    const originalQuery = graph.api.data.q;
    graph.api.data.q = () => {
        throw new Error('temporary Dashboard graph failure');
    };

    try {
        const refresh = document.querySelector('[data-action="refresh"]');
        refresh.click();
        await settle();
        const status = document.querySelector('.rlb-dashboard__refresh-status');
        assert.equal(refresh.dataset.refreshState, 'error');
        assert.equal(status.getAttribute('role'), 'alert');
        assert.equal(status.getAttribute('aria-live'), 'assertive');
        assert.match(status.textContent, /last valid snapshot|Retry/i);
        assert.equal(
            document.querySelector('[data-running-elapsed="true"]').dataset.clockUid,
            beforeUid
        );
    } finally {
        graph.api.data.q = originalQuery;
        dashboard.destroy();
    }
});

test('repeated Dashboard open preserves the original outside focus target', () => {
    const originalTrigger = document.createElement('button');
    originalTrigger.textContent = 'Original trigger';
    const laterTrigger = document.createElement('button');
    laterTrigger.textContent = 'Later trigger';
    document.body.append(originalTrigger, laterTrigger);
    const dashboard = createDashboard({ now: () => new Date('2026-08-15T09:00:00') });

    originalTrigger.focus();
    dashboard.open({ returnFocusTo: originalTrigger });
    laterTrigger.focus();
    dashboard.open({ returnFocusTo: laterTrigger });
    dashboard.close();

    assert.equal(document.activeElement, originalTrigger);
    dashboard.destroy();
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
        assert.ok(link.classList.contains('rlb-task-link--icon'));
        assert.equal(link.dataset.navigationCue, 'icon');
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

test('native sidebar window list is authoritative after a user closes a block window', async () => {
    const windows = [];
    const calls = [];
    window.roamAlphaAPI.ui.rightSidebar = {
        open: () => calls.push({ action: 'open' }),
        getWindows: async () => {
            calls.push({ action: 'getWindows' });
            return windows;
        },
        addWindow: async spec => {
            calls.push({ action: 'addWindow', spec });
            windows.push(spec.window);
        },
    };

    assert.deepEqual(await openBlockInRightSidebar('live-child'), { ok: true });
    assert.deepEqual(await openBlockInRightSidebar('live-child'), { ok: true, deduped: true });

    // Simulate closing the native Roam sidebar window outside the extension.
    windows.splice(0, windows.length);
    assert.deepEqual(await openBlockInRightSidebar('live-child'), { ok: true });

    assert.deepEqual(calls, [
        { action: 'open' },
        { action: 'getWindows' },
        { action: 'addWindow', spec: { window: { type: 'block', 'block-uid': 'live-child' } } },
        { action: 'open' },
        { action: 'getWindows' },
        { action: 'open' },
        { action: 'getWindows' },
        { action: 'addWindow', spec: { window: { type: 'block', 'block-uid': 'live-child' } } },
    ]);
});

test('legacy native sidebar fallback clears a failed request so the next click can retry', async () => {
    let attempts = 0;
    const payloads = [];
    window.roamAlphaAPI.ui.rightSidebar = {
        open: () => {},
        addWindow: async spec => {
            attempts += 1;
            payloads.push(spec);
            if (attempts === 1) throw new Error('first sidebar request failed');
        },
    };

    const first = await openBlockInRightSidebar('live-child');
    const second = await openBlockInRightSidebar('live-child');
    assert.equal(first.ok, false);
    assert.equal(second.ok, true);
    assert.equal(attempts, 2);
    assert.deepEqual(payloads, [
        { window: { type: 'block', 'block-uid': 'live-child' } },
        { window: { type: 'block', 'block-uid': 'live-child' } },
    ]);
});

test('Dashboard locks document scroll reversibly without moving the dialog root', () => {
    const html = document.documentElement;
    const body = document.body;
    const style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);
    const originalHtmlStyle = 'overflow:auto; color: rebeccapurple;';
    const originalBodyStyle = 'padding-right: 4px; overflow: auto;';
    html.setAttribute('style', originalHtmlStyle);
    body.setAttribute('style', originalBodyStyle);

    const originalScrollTo = window.scrollTo;
    const scrollCalls = [];
    const scrollXDescriptor = Object.getOwnPropertyDescriptor(window, 'scrollX');
    const scrollYDescriptor = Object.getOwnPropertyDescriptor(window, 'scrollY');
    const clientWidthDescriptor = Object.getOwnPropertyDescriptor(html, 'clientWidth');
    Object.defineProperty(window, 'scrollX', { configurable: true, value: 19 });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 407 });
    Object.defineProperty(html, 'clientWidth', { configurable: true, value: 1000 });
    window.scrollTo = (x, y) => scrollCalls.push([x, y]);

    const dashboard = createDashboard({ now: () => new Date('2026-08-15T12:00:00') });
    try {
        dashboard.open();
        const root = document.querySelector('.rlb-root--open');
        const dialog = root.querySelector('.rlb-dialog');
        const bodyScroll = root.querySelector('.rlb-body');
        assert.equal(window.getComputedStyle(root).overflow, 'hidden');
        assert.equal(window.getComputedStyle(root).overscrollBehavior, 'none');
        assert.equal(window.getComputedStyle(root).position, 'fixed');
        assert.equal(window.getComputedStyle(dialog).display, 'flex');
        assert.equal(window.getComputedStyle(bodyScroll).overflowY, 'auto');
        assert.equal(html.style.overflow, 'hidden');
        assert.equal(body.style.overflow, 'hidden');
        assert.equal(body.style.paddingRight, '28px');

        // Re-rendering an already open dashboard must not acquire a second lock.
        dashboard.open();
        dashboard.close();
        assert.equal(html.getAttribute('style'), originalHtmlStyle);
        assert.equal(body.getAttribute('style'), originalBodyStyle);
        assert.deepEqual(scrollCalls, [[19, 407]]);

        Object.defineProperty(window, 'scrollX', { configurable: true, value: 23 });
        Object.defineProperty(window, 'scrollY', { configurable: true, value: 512 });
        dashboard.open();
        dashboard.destroy();
        assert.equal(html.getAttribute('style'), originalHtmlStyle);
        assert.equal(body.getAttribute('style'), originalBodyStyle);
        assert.deepEqual(scrollCalls, [
            [19, 407],
            [23, 512],
        ]);
    } finally {
        dashboard.destroy();
        style.remove();
        window.scrollTo = originalScrollTo;
        if (scrollXDescriptor) Object.defineProperty(window, 'scrollX', scrollXDescriptor);
        else delete window.scrollX;
        if (scrollYDescriptor) Object.defineProperty(window, 'scrollY', scrollYDescriptor);
        else delete window.scrollY;
        if (clientWidthDescriptor) Object.defineProperty(html, 'clientWidth', clientWidthDescriptor);
        else delete html.clientWidth;
        html.setAttribute('style', originalHtmlStyle);
        body.setAttribute('style', originalBodyStyle);
    }
});

test('Overview keeps four compact metrics and a list-first task surface', () => {
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
    assert.equal(metrics.length, 4, 'the overview has a stable four-metric contract');
    assert.deepEqual(
        metrics.map(metric => metric.querySelector('.rlb-overview__label')?.textContent),
        ['Today', 'Last 7 days', 'Sessions', 'Tasks tracked']
    );
    assert.equal(summary.querySelector('[data-action]'), null);

    const byTask = document.querySelector('.rlb-by-task');
    assert.ok(byTask, 'By Task remains the primary follow-up list');
    assert.ok(
        summary.compareDocumentPosition(byTask) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING
    );

    dashboard.destroy();
});

test('Dashboard exposes one semantic overview with four metrics', () => {
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
    assert.ok(overview.classList.contains('rlb-overview--compact'));
    assert.equal(overview.getAttribute('aria-label'), 'Roam Logbook overview');
    assert.equal(overview.querySelectorAll('.rlb-overview__item').length, 4);
    assert.equal(overview.querySelectorAll('dt').length, 4);
    assert.equal(overview.querySelectorAll('dd').length, 4);
    assert.equal(document.querySelectorAll('.rlb-stat').length, 0);
    assert.equal(overview.querySelector('[data-action]'), null);

    dashboard.destroy();
});

test('Dashboard overview names the active date range without abstract helper copy', () => {
    graph = installGraph([
        { uid: 'range-week-task', string: '{{[[TODO]]}} Week task', parent: null },
        { uid: 'range-week-drawer', string: 'LOGBOOK::', parent: 'range-week-task' },
        {
            uid: 'range-week-clock',
            string: 'CLOCK:: [2026-08-15 Sat 09:00]--[2026-08-15 Sat 09:30] => 0:30',
            parent: 'range-week-drawer',
        },
        { uid: 'range-month-task', string: '{{[[TODO]]}} Month task', parent: null },
        { uid: 'range-month-drawer', string: 'LOGBOOK::', parent: 'range-month-task' },
        {
            uid: 'range-month-clock',
            string: 'CLOCK:: [2026-08-01 Sat 09:00]--[2026-08-01 Sat 09:30] => 0:30',
            parent: 'range-month-drawer',
        },
        { uid: 'range-all-task', string: '{{[[TODO]]}} All-time task', parent: null },
        { uid: 'range-all-drawer', string: 'LOGBOOK::', parent: 'range-all-task' },
        {
            uid: 'range-all-clock',
            string: 'CLOCK:: [2026-01-01 Thu 09:00]--[2026-01-01 Thu 09:30] => 0:30',
            parent: 'range-all-drawer',
        },
    ]);
    const dashboard = createDashboard({ now: () => new Date('2026-08-15T12:00:00') });
    dashboard.open();

    const metric = label =>
        [...document.querySelectorAll('.rlb-overview__item')].find(
            item => item.querySelector('.rlb-overview__label')?.textContent === label
        );
    const context = label => metric(label)?.querySelector('.rlb-overview__context')?.textContent;
    const assertNoAbstractRangeCopy = () => {
        assert.doesNotMatch(document.documentElement.outerHTML, /selected range/i);
    };

    assert.equal(context('Last 7 days'), undefined, 'the total already names its range');
    assert.equal(context('Sessions'), 'Last 7 days');
    assert.equal(context('Tasks tracked'), 'Last 7 days');
    assertNoAbstractRangeCopy();

    const range = document.querySelector('.rlb-header select');
    range.value = 'month';
    range.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.equal(context('Last 30 days'), undefined);
    assert.equal(context('Sessions'), 'Last 30 days');
    assert.equal(context('Tasks tracked'), 'Last 30 days');
    assertNoAbstractRangeCopy();

    range.value = 'all';
    range.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.equal(context('All time'), undefined);
    assert.equal(context('Sessions'), 'All time');
    assert.equal(context('Tasks tracked'), 'All time');
    assertNoAbstractRangeCopy();

    dashboard.destroy();
});

test('beta.10 zero-time overview uses a quiet empty context instead of a primary visual', () => {
    const dashboard = createDashboard({ now: () => new Date('2026-08-15T09:00:00') });
    dashboard.open();

    const today = document.querySelector('.rlb-overview__item');
    assert.equal(today.querySelector('.rlb-overview__number').textContent, '0m');
    assert.match(today.querySelector('.rlb-overview__context').textContent, /No active Sessions/);

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
    assert.equal(document.querySelectorAll('[data-action="toggle-view"]').length, 0);

    dashboard.destroy();
});
