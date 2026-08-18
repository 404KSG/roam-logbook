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
const { createTimingLineSidebarFronting } = await import('../src/timing-line-sidebar.js');

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
    const today = [...document.querySelectorAll('.rlb-overview__item')].find(
        item => item.querySelector('.rlb-overview__label')?.textContent === 'Today'
    );
    assert.equal(today.querySelector('.rlb-overview__context'), null);
    assert.equal(document.querySelector('.rlb-running .rlb-section__title')?.textContent, 'Timing');
    assert.equal(document.querySelector('.rlb-running .rlb-panel__count'), null);

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

test('Dashboard By Task exposes status-aware focus actions and switches the single CLOCK in place', async () => {
    graph = installGraph([
        { uid: 'dash-idle-task', string: '{{[[TODO]]}} Idle TODO task', parent: null },
        { uid: 'dash-idle-drawer', string: 'LOGBOOK::', parent: 'dash-idle-task' },
        {
            uid: 'dash-idle-clock',
            string: 'CLOCK:: [2026-08-15 Sat 08:00]--[2026-08-15 Sat 08:25] => 0:25',
            parent: 'dash-idle-drawer',
        },
        { uid: 'dash-focus-task', string: '{{[[TODO]]}} Focused TODO task', parent: null },
        { uid: 'dash-focus-drawer', string: 'LOGBOOK::', parent: 'dash-focus-task' },
        {
            uid: 'dash-focus-clock',
            string: 'CLOCK:: [2026-08-15 Sat 09:00]',
            parent: 'dash-focus-drawer',
        },
        { uid: 'dash-done-task', string: '{{[[DONE]]}} Done task', parent: null },
        { uid: 'dash-done-drawer', string: 'LOGBOOK::', parent: 'dash-done-task' },
        {
            uid: 'dash-done-clock',
            string: 'CLOCK:: [2026-08-15 Sat 08:30]--[2026-08-15 Sat 08:40] => 0:10',
            parent: 'dash-done-drawer',
        },
    ]);

    const dashboard = createDashboard({
        now: () => new Date('2026-08-15T09:10:00'),
        setIntervalFn: () => 'dashboard-ticker',
        clearIntervalFn: () => {},
    });
    const actions = [];
    const sidebarTasks = [];
    const fronting = createTimingLineSidebarFronting({
        frontBlock: async taskUid => {
            sidebarTasks.push(taskUid);
            return { ok: true };
        },
        isEnabled: () => true,
    });
    const unsubscribe = clock.subscribeActions(action => actions.push(action));
    const unsubscribeFronting = clock.subscribeActions(fronting.handleAction);

    const rowFor = title =>
        [...document.querySelectorAll('.rlb-task-table tbody tr')].find(
            row => row.querySelector('.rlb-task-link__text')?.textContent === title
        );

    try {
        dashboard.open();

        const idleRow = rowFor('Idle TODO task');
        const focusedRow = rowFor('Focused TODO task');
        const doneRow = rowFor('Done task');
        assert.ok(idleRow);
        assert.ok(focusedRow);
        assert.ok(doneRow);

        const play = idleRow.querySelector('[data-action="start-timing"]');
        assert.ok(play);
        assert.equal(play.tagName, 'BUTTON');
        assert.equal(play.textContent, '');
        assert.equal(play.type, 'button');
        assert.ok(play.classList.contains('bp3-icon-play'));
        assert.equal(play.title, 'Start timing: Idle TODO task');
        assert.equal(play.getAttribute('aria-label'), play.title);

        const timing = focusedRow.querySelector('.rlb-task-action--timing');
        assert.ok(timing);
        assert.equal(timing.tagName, 'SPAN');
        assert.equal(timing.getAttribute('role'), 'img');
        assert.equal(timing.title, 'Currently timing');
        assert.equal(timing.getAttribute('aria-label'), 'Currently timing');
        assert.equal(timing.getAttribute('tabindex'), null);
        assert.equal(timing.dataset.action, undefined);
        assert.equal(focusedRow.querySelector('[data-action="start-timing"]'), null);
        assert.equal(doneRow.querySelector('[data-action="start-timing"]'), null);
        assert.equal(doneRow.querySelector('.rlb-task-action--timing'), null);

        const overlay = document.querySelector('.rlb-root');
        const dialog = overlay.querySelector('.rlb-dialog');
        const tableBeforeSwitch = overlay.querySelector('.rlb-task-table');
        play.click();
        await settle();
        await fronting.whenIdle();

        assert.equal(document.querySelector('.rlb-root'), overlay);
        assert.equal(overlay.classList.contains('rlb-root--open'), true);
        assert.equal(overlay.querySelector('.rlb-dialog'), dialog);
        assert.notEqual(overlay.querySelector('.rlb-task-table'), tableBeforeSwitch);
        assert.equal(clock.getRunning().length, 1);
        assert.equal(clock.getRunning()[0].taskUid, 'dash-idle-task');
        assert.equal(
            clock.getEntriesSnapshot().filter(entry => entry.running).length,
            1,
            'switching from Dashboard leaves exactly one open CLOCK'
        );
        assert.equal(
            actions.at(-1)?.source,
            'active-work-switch'
        );
        assert.equal(actions.at(-1)?.taskUid, 'dash-idle-task');
        assert.deepEqual(sidebarTasks, ['dash-idle-task']);
        const switchedRow = rowFor('Idle TODO task');
        assert.ok(switchedRow.querySelector('.rlb-task-action--timing'));
        assert.equal(switchedRow.querySelector('[data-action="start-timing"]'), null);
    } finally {
        unsubscribeFronting();
        unsubscribe();
        fronting.dispose();
        dashboard.destroy();
    }
});

test('Dashboard Running and By Task links preserve Roam page refs and tags without an icon cue', async () => {
    const nowMs = new Date('2026-08-15T09:00:00').getTime();
    graph.store.get('live-parent').string =
        '{{[[TODO]]}} Parent [[Project Page]] #[[project]]';
    graph.store.get('live-child').string =
        '{{[[TODO]]}} Child [[Running Page]] #[[urgent]]';
    await clock.clockIn('live-child', { now: new Date(nowMs) });
    const dashboard = createDashboard({ now: () => new Date(nowMs) });
    dashboard.open();

    const links = [...document.querySelectorAll('.rlb-task-link')];
    assert.ok(links.length >= 2, 'the running and By Task sections both expose the Task');
    for (const link of links) {
        assert.match(link.getAttribute('aria-label'), /^Open this block: .+/);
        assert.equal(link.getAttribute('aria-label'), link.title);
        assert.notEqual(link.getAttribute('aria-label'), 'Open this block');
        assert.equal(link.classList.contains('bp3-icon-document-open'), false);
        assert.equal(link.classList.contains('rlb-task-link--icon'), false);
        assert.equal(link.dataset.navigationCue, undefined);
        assert.equal(link.querySelector('.bp3-icon-document-open'), null);
        assert.equal(link.textContent, link.querySelector('.rlb-task-link__text').textContent);
        assert.equal(link.getAttribute('aria-label'), `Open this block: ${link.textContent}`);
    }
    assert.ok(links.some(link => link.textContent === 'Child [[Running Page]] #[[urgent]]'));
    assert.ok(links.some(link => link.textContent === 'Parent [[Project Page]] #[[project]]'));
    dashboard.destroy();
});

test('Dashboard task links keep ordinary click navigation for formatted titles', async () => {
    const openCalls = [];
    const mainWindow = window.roamAlphaAPI.ui.mainWindow;
    const originalOpenBlock = mainWindow.openBlock;
    mainWindow.openBlock = async spec => openCalls.push(spec);
    try {
        graph.store.get('live-child').string =
            '{{[[TODO]]}} Child [[Running Page]] #[[urgent]]';
        await clock.clockIn('live-child', { now: new Date('2026-08-15T09:00:00') });
        const dashboard = createDashboard({ now: () => new Date('2026-08-15T09:00:00') });
        dashboard.open();
        const link = document.querySelector('.rlb-running .rlb-task-link');
        link.click();
        await new Promise(resolve => setImmediate(resolve));

        assert.deepEqual(openCalls, [{ block: { uid: 'live-child' } }]);
        assert.equal(document.querySelector('.rlb-root--open'), null);
        dashboard.destroy();
    } finally {
        mainWindow.openBlock = originalOpenBlock;
    }
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

test('Dashboard Today metric omits active Session context when empty', () => {
    const dashboard = createDashboard({ now: () => new Date('2026-08-15T09:00:00') });
    dashboard.open();

    const today = document.querySelector('.rlb-overview__item');
    assert.equal(today.querySelector('.rlb-overview__number').textContent, '0m');
    assert.equal(today.querySelector('.rlb-overview__context'), null);

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

const installTaskViewFixture = () => {
    graph = installGraph([
        { uid: 'done-parent', string: '{{[[DONE]]}} Completed project', parent: null },
        { uid: 'todo-child', string: '{{[[TODO]]}} Nested TODO', parent: 'done-parent' },
        { uid: 'todo-root', string: '{{[[TODO]]}} Todo root', parent: null },
        { uid: 'done-root', string: '{{[[DONE]]}} Done root', parent: null },
        { uid: 'unknown-root', string: 'Unclassified root', parent: null },
        { uid: 'todo-child-drawer', string: 'LOGBOOK::', parent: 'todo-child' },
        {
            uid: 'todo-child-clock',
            string: 'CLOCK:: [2026-08-15 Sat 08:00]--[2026-08-15 Sat 08:30] => 0:30',
            parent: 'todo-child-drawer',
        },
        { uid: 'todo-root-drawer', string: 'LOGBOOK::', parent: 'todo-root' },
        {
            uid: 'todo-root-clock',
            string: 'CLOCK:: [2026-08-15 Sat 08:00]--[2026-08-15 Sat 08:20] => 0:20',
            parent: 'todo-root-drawer',
        },
        { uid: 'done-root-drawer', string: 'LOGBOOK::', parent: 'done-root' },
        {
            uid: 'done-root-clock',
            string: 'CLOCK:: [2026-08-15 Sat 08:00]--[2026-08-15 Sat 08:40] => 0:40',
            parent: 'done-root-drawer',
        },
        { uid: 'unknown-root-drawer', string: 'LOGBOOK::', parent: 'unknown-root' },
        {
            uid: 'unknown-root-clock',
            string: 'CLOCK:: [2026-08-15 Sat 08:00]--[2026-08-15 Sat 08:10] => 0:10',
            parent: 'unknown-root-drawer',
        },
    ]);
};

const taskTitles = () =>
    [...document.querySelectorAll('.rlb-task-table .rlb-tree__cell .rlb-task-link__text')].map(
        node => node.textContent
    );

test('Dashboard task filters keep unique counts and context ancestors without changing overview or running', async () => {
    installTaskViewFixture();
    const nowMs = new Date('2026-08-15T12:00:00').getTime();
    await clock.clockIn('todo-root', { now: new Date(nowMs) });
    const dashboard = createDashboard({ now: () => new Date(nowMs) });
    dashboard.open();

    const byTask = document.querySelector('.rlb-by-task');
    const filterGroup = byTask.querySelector('[role="group"]');
    const filterButton = value => byTask.querySelector(`[data-filter="${value}"]`);
    const count = () => byTask.querySelector('.rlb-task-count').textContent;
    const overviewBefore = document.querySelector('.rlb-overview').textContent;
    const runningBefore = document.querySelector('.rlb-running').textContent;

    assert.equal(filterGroup.getAttribute('aria-label'), 'Filter tasks by status');
    assert.equal(filterButton('ALL').getAttribute('aria-pressed'), 'true');
    assert.equal(count(), '5 of 5 Tasks');
    assert.deepEqual(taskTitles(), [
        'Done root',
        'Completed project',
        'Nested TODO',
        'Todo root',
        'Unclassified root',
    ]);

    filterButton('TODO').click();
    assert.equal(filterButton('TODO').getAttribute('aria-pressed'), 'true');
    assert.equal(filterButton('ALL').getAttribute('aria-pressed'), 'false');
    assert.equal(count(), '2 of 5 Tasks');
    assert.deepEqual(taskTitles(), ['Completed project', 'Nested TODO', 'Todo root']);
    assert.ok(
        [...byTask.querySelectorAll('tbody tr')].some(row =>
            row.classList.contains('rlb-row--context')
        ),
        'the required non-matching ancestor is retained as context'
    );
    assert.doesNotMatch(byTask.textContent, /Done root|Unclassified root/);
    assert.equal(document.querySelector('.rlb-overview').textContent, overviewBefore);
    assert.equal(document.querySelector('.rlb-running').textContent, runningBefore);

    filterButton('DONE').click();
    assert.equal(count(), '2 of 5 Tasks');
    assert.deepEqual(taskTitles(), ['Done root', 'Completed project']);
    assert.doesNotMatch(byTask.textContent, /Nested TODO|Todo root|Unclassified root/);
    dashboard.destroy();
});

test('Dashboard shows a status-specific empty state for a filter with no matches', () => {
    graph = installGraph([
        { uid: 'only-done', string: '{{[[DONE]]}} Only done', parent: null },
        { uid: 'only-done-drawer', string: 'LOGBOOK::', parent: 'only-done' },
        {
            uid: 'only-done-clock',
            string: 'CLOCK:: [2026-08-15 Sat 08:00]--[2026-08-15 Sat 08:10] => 0:10',
            parent: 'only-done-drawer',
        },
    ]);
    const dashboard = createDashboard({ now: () => new Date('2026-08-15T12:00:00') });
    dashboard.open();
    document.querySelector('.rlb-by-task [data-filter="TODO"]').click();

    assert.equal(
        document.querySelector('.rlb-task-empty').textContent,
        'No TODO Tasks in the selected range.'
    );
    assert.equal(document.querySelector('.rlb-task-count').textContent, '0 of 1 Tasks');
    dashboard.destroy();
});

test('Dashboard task headers sort recursively with native buttons and expose ARIA state', () => {
    installTaskViewFixture();
    const dashboard = createDashboard({ now: () => new Date('2026-08-15T12:00:00') });
    dashboard.open();

    const header = key => document.querySelector(`.rlb-task-table th[data-sort-key="${key}"]`);
    const buttonFor = key => header(key).querySelector('button');
    const taskHeader = document.querySelector('.rlb-task-table th:first-child');
    const runningHeaderButtons = document.querySelectorAll('.rlb-running thead button');

    assert.equal(header('total').getAttribute('aria-sort'), 'descending');
    assert.equal(buttonFor('total').getAttribute('aria-pressed'), 'true');
    assert.equal(header('sessions').hasAttribute('aria-sort'), false);
    assert.equal(header('own').hasAttribute('aria-sort'), false);
    assert.equal(taskHeader.querySelector('button'), null);
    assert.equal(runningHeaderButtons.length, 0);
    assert.equal(buttonFor('own').title, 'Time recorded directly on this Task');
    assert.equal(buttonFor('total').title, 'Own time plus all sub-tasks');
    assert.equal(
        document.querySelectorAll('.rlb-task-table .rlb-task-sort-arrow[aria-hidden="true"]').length,
        1
    );

    buttonFor('own').click();
    assert.equal(header('own').getAttribute('aria-sort'), 'descending');
    assert.equal(buttonFor('own').getAttribute('aria-pressed'), 'true');
    assert.equal(header('total').hasAttribute('aria-sort'), false);
    assert.equal(buttonFor('own').querySelector('[aria-hidden="true"]').textContent, '↓');

    buttonFor('own').click();
    assert.equal(header('own').getAttribute('aria-sort'), 'ascending');
    assert.equal(buttonFor('own').querySelector('[aria-hidden="true"]').textContent, '↑');
    document.querySelector('.rlb-by-task [data-filter="TODO"]').click();
    assert.equal(header('own').getAttribute('aria-sort'), 'ascending');
    assert.equal(document.querySelector('.rlb-by-task [data-filter="TODO"]').getAttribute('aria-pressed'), 'true');
    dashboard.destroy();
});

test('Dashboard keeps All and filtered collapse state in separate controller-local views', () => {
    installTaskViewFixture();
    const dashboard = createDashboard({ now: () => new Date('2026-08-15T12:00:00') });
    dashboard.open();

    const rowFor = title =>
        [...document.querySelectorAll('.rlb-task-table tbody tr')].find(row =>
            row.querySelector('.rlb-task-link__text')?.textContent === title
        );
    const collapseParent = () => rowFor('Completed project').querySelector('.rlb-tree__toggle');
    const todoFilter = document.querySelector('.rlb-by-task [data-filter="TODO"]');
    const allFilter = document.querySelector('.rlb-by-task [data-filter="ALL"]');

    collapseParent().click();
    assert.equal(rowFor('Nested TODO'), undefined);

    todoFilter.click();
    assert.ok(rowFor('Nested TODO'), 'filtered views start with matching paths expanded');
    collapseParent().click();
    assert.equal(rowFor('Nested TODO'), undefined);

    allFilter.click();
    assert.equal(rowFor('Nested TODO'), undefined, 'All restores its own collapsed state');
    const range = document.querySelector('.rlb-header select');
    range.value = 'month';
    range.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.equal(document.querySelector('.rlb-by-task [data-filter="ALL"]').getAttribute('aria-pressed'), 'true');
    assert.equal(rowFor('Nested TODO'), undefined, 'range changes keep the All collapse state');
    todoFilter.click();
    assert.equal(rowFor('Nested TODO'), undefined, 'TODO restores its own collapsed state');
    dashboard.destroy();
});

test('Dashboard places the accessible Activity chart between Timing and By task', () => {
    graph = installGraph([
        { uid: 'activity-task', string: '{{[[TODO]]}} Activity task', parent: null },
        { uid: 'activity-drawer', string: 'LOGBOOK::', parent: 'activity-task' },
        {
            uid: 'activity-early',
            string: 'CLOCK:: [2026-08-09 Sun 09:00]--[2026-08-09 Sun 10:00] => 1:00',
            parent: 'activity-drawer',
        },
        {
            uid: 'activity-mid',
            string: 'CLOCK:: [2026-08-12 Wed 09:00]--[2026-08-12 Wed 09:45] => 0:45',
            parent: 'activity-drawer',
        },
        {
            uid: 'activity-zero',
            string: 'CLOCK:: [2026-08-15 Sat 11:00]--[2026-08-15 Sat 11:00] => 0:00',
            parent: 'activity-drawer',
        },
        {
            uid: 'activity-running',
            string: 'CLOCK:: [2026-08-15 Sat 11:30]',
            parent: 'activity-drawer',
        },
    ]);
    const dashboard = createDashboard({ now: () => new Date('2026-08-15T12:00:00') });
    dashboard.open();

    const timing = document.querySelector('.rlb-running');
    const activity = document.querySelector('.rlb-activity');
    const byTask = document.querySelector('.rlb-by-task');
    assert.ok(timing, 'a running Session creates the Timing panel');
    assert.ok(activity);
    assert.ok(byTask);
    assert.ok(
        timing.compareDocumentPosition(activity) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
        'Activity appears after Timing'
    );
    assert.ok(
        activity.compareDocumentPosition(byTask) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
        'Activity appears before By task'
    );
    assert.equal(activity.querySelector('.rlb-section__title').textContent, 'Activity');
    const chart = activity.querySelector('.rlb-activity__chart');
    assert.equal(chart.getAttribute('role'), 'group');
    assert.equal(chart.getAttribute('aria-label'), 'Activity for Last 7 days');
    assert.equal(chart.dataset.activityRange, 'week');
    assert.equal(chart.querySelectorAll('[data-activity-bucket]').length, 7);
    assert.equal(
        activity.querySelector('[data-activity-bucket="2026-08-09"] .rlb-activity__duration').textContent,
        '1h 00m'
    );
    assert.equal(
        activity.querySelector('[data-activity-bucket="2026-08-09"] .rlb-activity__date').textContent,
        'Aug 9'
    );
    assert.equal(
        activity.querySelector('[data-activity-bucket="2026-08-10"] .rlb-activity__duration').textContent,
        '0m'
    );
    assert.match(
        activity.querySelector('[data-activity-bucket="2026-08-09"]').getAttribute('aria-label'),
        /Aug 9, 2026.*1h 00m.*1 Session/
    );
    assert.equal(document.querySelector('[data-action="toggle-view"]'), null);
    assert.equal(document.querySelector('.rlb-category'), null);
    assert.equal(document.querySelector('.rlb-insights'), null);

    dashboard.destroy();
});

test('Dashboard Activity changes bucket annotation with the existing range selector without another graph read', () => {
    graph = installGraph([
        { uid: 'activity-range-task', string: '{{[[TODO]]}} Activity range task', parent: null },
        { uid: 'activity-range-drawer', string: 'LOGBOOK::', parent: 'activity-range-task' },
        {
            uid: 'activity-range-clock',
            string: 'CLOCK:: [2026-08-01 Sat 09:00]--[2026-08-01 Sat 10:30] => 1:30',
            parent: 'activity-range-drawer',
        },
    ]);
    let graphReads = 0;
    const query = graph.api.data.q;
    graph.api.data.q = (...args) => {
        graphReads += 1;
        return query(...args);
    };
    const dashboard = createDashboard({ now: () => new Date('2026-08-15T12:00:00') });
    dashboard.open();
    const readsAfterOpen = graphReads;
    const range = document.querySelector('.rlb-header select');

    range.value = 'today';
    range.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.equal(graphReads, readsAfterOpen);
    assert.equal(document.querySelector('.rlb-activity'), null);
    assert.ok(document.querySelector('.rlb-empty'));

    range.value = 'month';
    range.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.equal(graphReads, readsAfterOpen);
    const activity = document.querySelector('.rlb-activity');
    assert.ok(activity);
    assert.equal(activity.querySelectorAll('[data-activity-bucket]').length, 30);
    assert.equal(
        activity.querySelector('[data-activity-bucket="2026-08-01"] .rlb-activity__duration').textContent,
        '1h30'
    );
    assert.equal(
        activity.querySelector('[data-activity-bucket="2026-08-01"] .rlb-activity__date').textContent,
        'Aug 1'
    );

    dashboard.destroy();
});
