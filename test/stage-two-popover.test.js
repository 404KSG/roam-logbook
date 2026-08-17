import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { installGraph, uninstallGraph } from './helpers/graph-stub.js';

const dom = new JSDOM('<!doctype html><html><body><div class="rm-topbar"></div></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.HTMLElement = dom.window.HTMLElement;

const contextCommands = new Map();
const paletteCommands = new Map();
const settingsStore = new Map();
let graph;

const extensionAPI = {
    settings: {
        get: key => settingsStore.get(key),
        set: (key, value) => settingsStore.set(key, value),
        panel: { create: () => {} },
    },
    ui: {
        showToast: () => {},
        commandPalette: {
            addCommand: spec => paletteCommands.set(spec.label, spec.callback),
            removeCommand: ({ label }) => paletteCommands.delete(label),
        },
    },
};

const install = blocks => {
    graph = installGraph(blocks);
    contextCommands.clear();
    paletteCommands.clear();
    settingsStore.clear();
    window.roamAlphaAPI.ui.blockContextMenu = {
        addCommand: spec => contextCommands.set(spec.label, spec),
        removeCommand: ({ label }) => contextCommands.delete(label),
    };
};

install([]);
const extension = (await import('../src/extension.js')).default;
const clock = await import('../src/clock.js');
const pomodoro = await import('../src/pomodoro.js');
const {
    createPostPaintScheduler,
    createTopbar,
    activeCount,
    activeWorkDescription,
    sessionLoadTone,
} =
    await import('../src/topbar.js');
const { renderSessionSurface, updateSessionSurfaceElapsed } = await import('../src/session-surface.js');
const { setExtensionAPI } = await import('../src/settings.js');

const click = node => node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
const shiftClick = node => {
    const event = new dom.window.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        shiftKey: true,
    });
    node.dispatchEvent(event);
    return event;
};
const settle = async () => {
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
};
const settlePostPaint = async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
    await settle();
};
const topbarButton = () => document.querySelector('#roam-logbook-topbar button');
const topbarWidget = () => document.getElementById('roam-logbook-topbar');
const openPopover = () => {
    click(topbarButton());
    return document.querySelector('body > .rlb-popover');
};

test('Active Work accessibility copy names Parallel Threads and explains dynamic expiry', () => {
    assert.equal(
        activeWorkDescription(1, 2, 45),
        '1 timing line · 2 parallel threads · Leave after 45m without focus'
    );
    assert.equal(
        activeWorkDescription(0, 1, 30),
        '0 timing lines · 1 parallel thread · Leave after 30m without focus'
    );
});

const createManualPostPaintScheduler = () => {
    let nextId = 0;
    const pending = new Map();
    return {
        schedule(callback) {
            const id = ++nextId;
            pending.set(id, callback);
            return () => pending.delete(id);
        },
        flush() {
            const callbacks = [...pending.values()];
            pending.clear();
            for (const callback of callbacks) callback();
        },
        get size() {
            return pending.size;
        },
    };
};

const mountControlledTopbar = (
    t,
    { blocks, scheduler, prime = true, setIntervalFn, clearIntervalFn }
) => {
    extension.onunload();
    document.body.innerHTML = '<div class="rm-topbar"></div>';
    install(blocks);
    setExtensionAPI(extensionAPI);
    clock.reset();
    if (prime) clock.refresh();
    const topbar = createTopbar({
        onOpenDashboard: () => {},
        scheduleAfterPaintFn: scheduler.schedule,
        ...(setIntervalFn ? { setIntervalFn } : {}),
        ...(clearIntervalFn ? { clearIntervalFn } : {}),
    });
    topbar.mount();
    t.after(() => {
        topbar.unmount();
        clock.reset();
        setExtensionAPI(null);
    });
    return topbar;
};

const cachedSessionBlocks = ({ title = 'Cached Session' } = {}) => [
    {
        uid: 'popover-task-01',
        string: `{{[[TODO]]}} ${title}`,
        parent: null,
        page: 'Project Page',
    },
    {
        uid: 'popover-drawer-01',
        string: 'LOGBOOK::',
        parent: 'popover-task-01',
    },
    {
        uid: 'popover-clock-01',
        string: 'CLOCK:: [2026-08-15 Sat 08:30]',
        parent: 'popover-drawer-01',
    },
];

const addTask = (uid, title) => {
    graph.store.set(uid, {
        uid,
        string: `{{[[TODO]]}} ${title}`,
        parent: null,
        page: 'Project Page',
    });
};

test.beforeEach(() => {
    extension.onunload();
    document.body.innerHTML = '<div class="rm-topbar"></div>';
    install([
        {
            uid: 'popover-task-01',
            string:
                '{{[[TODO]]}} Graph Engineering: a deliberately long task title that must remain accessible',
            parent: null,
            page: 'Project Page',
        },
    ]);
    extension.onload({ extensionAPI });
});

test.afterEach(t => {
    extension.onunload();
    t.mock.timers.reset();
});
test.after(() => uninstallGraph());

test('ordinary click paints cached Sessions and loading before post-paint graph revalidation', async t => {
    const scheduler = createManualPostPaintScheduler();
    mountControlledTopbar(t, { blocks: cachedSessionBlocks(), scheduler });

    let graphReads = 0;
    const originalQuery = graph.api.data.q;
    graph.api.data.q = (...args) => {
        if (String(args[0]).includes('LOGBOOK:')) graphReads += 1;
        return originalQuery(...args);
    };
    t.after(() => {
        graph.api.data.q = originalQuery;
    });

    click(document.querySelector('#roam-logbook-topbar button'));
    const popover = document.querySelector('body > .rlb-popover');
    const refresh = popover.querySelector('[data-action="refresh"]');

    assert.ok(popover, 'Popover exists on the click stack');
    assert.match(popover.textContent, /Cached Session/);
    assert.equal(refresh.closest('.rlb-surface__refresh-cell').dataset.refreshState, 'loading');
    assert.equal(refresh.getAttribute('aria-busy'), 'true');
    assert.equal(refresh.textContent, '');
    assert.equal(graphReads, 0, 'graph read waits for the post-paint scheduler');
    assert.equal(scheduler.size, 1);

    scheduler.flush();
    await settle();

    assert.equal(graphReads, 1);
    assert.equal(
        popover.querySelector('.rlb-surface__refresh-cell').dataset.refreshState,
        'success'
    );
});

test('post-paint scheduler waits for animation frame and a following task and can cancel either phase', () => {
    let nextId = 0;
    const frames = new Map();
    const tasks = new Map();
    const scheduler = createPostPaintScheduler({
        view: {
            requestAnimationFrame: callback => {
                const id = ++nextId;
                frames.set(id, callback);
                return id;
            },
            cancelAnimationFrame: id => frames.delete(id),
        },
        setTimeoutFn: callback => {
            const id = ++nextId;
            tasks.set(id, callback);
            return id;
        },
        clearTimeoutFn: id => tasks.delete(id),
    });
    let calls = 0;

    const cancelBeforeFrame = scheduler(() => {
        calls += 1;
    });
    assert.equal(frames.size, 1);
    assert.equal(tasks.size, 0);
    cancelBeforeFrame();
    assert.equal(frames.size, 0);

    const cancelAfterFrame = scheduler(() => {
        calls += 1;
    });
    const frame = [...frames.values()][0];
    frames.clear();
    frame();
    assert.equal(tasks.size, 1);
    assert.equal(calls, 0);
    cancelAfterFrame();
    assert.equal(tasks.size, 0);

    scheduler(() => {
        calls += 1;
    });
    const finalFrame = [...frames.values()][0];
    frames.clear();
    finalFrame();
    const followingTask = [...tasks.values()][0];
    tasks.clear();
    followingTask();
    assert.equal(calls, 1);

    const fallbackTasks = new Map();
    const fallbackScheduler = createPostPaintScheduler({
        view: null,
        setTimeoutFn: callback => {
            const id = ++nextId;
            fallbackTasks.set(id, callback);
            return id;
        },
        clearTimeoutFn: id => fallbackTasks.delete(id),
    });
    fallbackScheduler(() => {
        calls += 1;
    });
    const firstFallbackTask = [...fallbackTasks.values()][0];
    fallbackTasks.clear();
    firstFallbackTask();
    assert.equal(calls, 1, 'fallback still waits through its first task');
    const secondFallbackTask = [...fallbackTasks.values()][0];
    fallbackTasks.clear();
    secondFallbackTask();
    assert.equal(calls, 2);
});

test('external graph Sessions appear only after open-time revalidation settles', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    const scheduler = createManualPostPaintScheduler();
    mountControlledTopbar(t, { blocks: cachedSessionBlocks(), scheduler });
    graph.store.set('popover-task-02', {
        uid: 'popover-task-02',
        string: '{{[[TODO]]}} External Session',
        parent: null,
        page: 'Project Page',
    });
    graph.store.set('popover-drawer-02', {
        uid: 'popover-drawer-02',
        string: 'LOGBOOK::',
        parent: 'popover-task-02',
    });
    graph.store.set('popover-clock-02', {
        uid: 'popover-clock-02',
        string: 'CLOCK:: [2026-08-15 Sat 08:45]',
        parent: 'popover-drawer-02',
    });

    click(topbarButton());
    const popover = document.querySelector('body > .rlb-popover');
    assert.equal(popover.querySelectorAll('.rlb-run').length, 1);
    assert.doesNotMatch(popover.textContent, /External Session/);

    scheduler.flush();
    await settle();

    assert.equal(popover.querySelectorAll('.rlb-run').length, 2);
    assert.match(popover.textContent, /External Session/);
});

test('failed open-time revalidation preserves cached rows and reports retryable uncertainty', async t => {
    const scheduler = createManualPostPaintScheduler();
    mountControlledTopbar(t, { blocks: cachedSessionBlocks(), scheduler });
    const originalQuery = graph.api.data.q;
    graph.api.data.q = () => {
        throw new Error('temporary graph read failure');
    };
    t.after(() => {
        graph.api.data.q = originalQuery;
    });

    click(topbarButton());
    const popover = document.querySelector('body > .rlb-popover');
    assert.match(popover.textContent, /Cached Session/);
    scheduler.flush();
    await settle();

    assert.equal(popover.querySelectorAll('.rlb-run').length, 1);
    assert.match(popover.textContent, /Cached Session/);
    assert.match(popover.textContent, /retry|could not be confirmed|last valid snapshot/i);
    assert.doesNotMatch(popover.textContent, /No Session is running/);
});

test('closing before the post-paint callback cancels revalidation', async t => {
    const scheduler = createManualPostPaintScheduler();
    mountControlledTopbar(t, { blocks: cachedSessionBlocks(), scheduler });
    let graphReads = 0;
    const originalQuery = graph.api.data.q;
    graph.api.data.q = (...args) => {
        if (String(args[0]).includes('LOGBOOK:')) graphReads += 1;
        return originalQuery(...args);
    };
    t.after(() => {
        graph.api.data.q = originalQuery;
    });

    click(topbarButton());
    assert.equal(scheduler.size, 1);
    click(topbarButton());
    assert.equal(document.querySelector('body > .rlb-popover'), null);
    assert.equal(scheduler.size, 0);
    scheduler.flush();
    await settle();

    assert.equal(graphReads, 0);
    assert.equal(document.querySelector('body > .rlb-popover'), null);
});

test('closing after graph revalidation starts updates shared cache without reopening Popover', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    const scheduler = createManualPostPaintScheduler();
    mountControlledTopbar(t, { blocks: cachedSessionBlocks(), scheduler });
    graph.store.set('popover-task-02', {
        uid: 'popover-task-02',
        string: '{{[[TODO]]}} External Session',
        parent: null,
        page: 'Project Page',
    });
    graph.store.set('popover-drawer-02', {
        uid: 'popover-drawer-02',
        string: 'LOGBOOK::',
        parent: 'popover-task-02',
    });
    graph.store.set('popover-clock-02', {
        uid: 'popover-clock-02',
        string: 'CLOCK:: [2026-08-15 Sat 08:45]',
        parent: 'popover-drawer-02',
    });
    let graphReads = 0;
    const originalQuery = graph.api.data.q;
    graph.api.data.q = (...args) => {
        if (String(args[0]).includes('LOGBOOK:')) {
            graphReads += 1;
            if (graphReads === 1) click(topbarButton());
        }
        return originalQuery(...args);
    };
    t.after(() => {
        graph.api.data.q = originalQuery;
    });

    click(topbarButton());
    scheduler.flush();
    await settle();

    assert.equal(graphReads, 2, 'one discovery read plus one post-reconciliation confirmation');
    assert.equal(clock.getRunning().length, 1);
    assert.equal(document.querySelector('body > .rlb-popover'), null);
    assert.match(topbarButton().textContent, /2 Threads/);
});

test('unmount cancels a pending open-time revalidation callback', async t => {
    const scheduler = createManualPostPaintScheduler();
    const topbar = mountControlledTopbar(t, { blocks: cachedSessionBlocks(), scheduler });
    let graphReads = 0;
    const originalQuery = graph.api.data.q;
    graph.api.data.q = (...args) => {
        if (String(args[0]).includes('LOGBOOK:')) graphReads += 1;
        return originalQuery(...args);
    };
    t.after(() => {
        graph.api.data.q = originalQuery;
    });

    click(topbarButton());
    assert.equal(scheduler.size, 1);
    topbar.unmount();
    assert.equal(scheduler.size, 0);
    scheduler.flush();
    await settle();

    assert.equal(graphReads, 0);
    assert.equal(document.querySelector('body > .rlb-popover'), null);
});

test('manual Refresh during pending and in-flight open revalidation reuses one graph read', async t => {
    const scheduler = createManualPostPaintScheduler();
    mountControlledTopbar(t, { blocks: cachedSessionBlocks(), scheduler });
    let graphReads = 0;
    const originalQuery = graph.api.data.q;
    graph.api.data.q = (...args) => {
        if (String(args[0]).includes('LOGBOOK:')) graphReads += 1;
        return originalQuery(...args);
    };
    t.after(() => {
        graph.api.data.q = originalQuery;
    });

    click(topbarButton());
    const popover = document.querySelector('body > .rlb-popover');
    click(popover.querySelector('[data-action="refresh"]'));
    assert.equal(graphReads, 0);

    scheduler.flush();
    click(popover.querySelector('[data-action="refresh"]'));
    await settle();

    assert.equal(graphReads, 1);
    assert.equal(
        popover.querySelector('.rlb-surface__refresh-cell').dataset.refreshState,
        'success'
    );
});

test('Active Work header keeps Dashboard and Refresh together with no empty footer', () => {
    const root = document.createElement('div');
    renderSessionSurface(
        root,
        { rows: [], focusedRows: [], recentRows: [], runningCount: 0, staleEntries: [], now: Date.now() },
        { onOpenDashboard: () => {}, onRefresh: () => {}, refreshState: { state: 'loading' } }
    );

    const header = root.querySelector('.rlb-surface__header');
    const actions = [...header.querySelectorAll('.rlb-surface__actions > *')];
    const dashboard = header.querySelector('[data-action="dashboard"]');
    const refresh = header.querySelector('[data-action="refresh"]');

    assert.deepEqual(actions.map(action => action.dataset.action || 'refresh-cell'), [
        'dashboard',
        'refresh-cell',
    ]);
    assert.ok(dashboard.classList.contains('bp3-icon-dashboard'));
    assert.equal(dashboard.title, 'Open Roam Logbook Dashboard');
    assert.equal(dashboard.getAttribute('aria-label'), dashboard.title);
    assert.equal(dashboard.type, 'button');
    assert.ok(refresh.classList.contains('bp3-icon-refresh'));
    assert.equal(refresh.title, 'Refresh Active Work from graph');
    assert.equal(refresh.getAttribute('aria-label'), refresh.title);
    assert.equal(refresh.disabled, true);
    assert.equal(refresh.getAttribute('aria-busy'), 'true');
    assert.equal(refresh.closest('.rlb-surface__refresh-cell').dataset.refreshState, 'loading');
    assert.equal(root.querySelector('.rlb-surface__refresh-status').classList.contains('rlb-visually-hidden'), true);
    assert.equal(root.querySelector('.rlb-surface__footer'), null);
});

test('shared Active Work header orders Dashboard, Refresh, and Close actions', () => {
    const root = document.createElement('div');
    renderSessionSurface(
        root,
        { rows: [], focusedRows: [], recentRows: [], runningCount: 1, staleEntries: [], now: Date.now() },
        { onOpenDashboard: () => {}, onRefresh: () => {}, onClose: () => {} }
    );

    const actions = [...root.querySelectorAll('.rlb-surface__actions > *')];
    assert.deepEqual(actions.map(action => action.dataset.action || 'refresh-cell'), [
        'dashboard',
        'refresh-cell',
        'close',
    ]);
    assert.equal(root.querySelector('.rlb-surface__footer'), null);
    for (const action of root.querySelectorAll('.rlb-surface__actions button')) {
        assert.equal(action.type, 'button');
        assert.equal(action.tabIndex, 0);
        assert.ok(action.title);
        assert.equal(action.getAttribute('aria-label'), action.title);
    }
});

test('single Focused Task has no bulk footer while retaining header actions', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });

    const topbar = topbarButton();
    const elapsed = topbar.querySelector('.rlb-topbar__time');
    const count = topbar.querySelector('.rlb-topbar__parallel');
    assert.match(topbar.textContent.trim(), /^\d+:\d{2}(?::\d{2})?1 Thread$/);
    assert.equal(`${elapsed.textContent} · ${count.textContent}`, `${elapsed.textContent} · 1 Thread`);
    assert.equal(topbar.querySelector('.rlb-topbar__separator').getAttribute('aria-hidden'), 'true');
    assert.equal(count.textContent, '1 Thread');
    assert.match(topbar.title, /^1 Thread\n/);
    assert.equal(topbar.getAttribute('aria-label'), topbar.title);
    assert.equal(
        [...count.classList].some(className =>
            className.startsWith('rlb-topbar__parallel--load-')
        ),
        false
    );

    const popover = openPopover();
    assert.deepEqual(
        [...popover.querySelectorAll('.rlb-surface__header .rlb-surface__actions > *')].map(
            action => action.dataset.action || 'refresh-cell'
        ),
        ['dashboard', 'refresh-cell']
    );
    assert.equal(popover.querySelector('.rlb-surface__footer'), null);
    assert.ok(popover.querySelector('[data-action="clock-out"]'), 'individual Check Out remains available');
});

test('multi-Active Work footer retains the explicit Clock Out All confirmation path', () => {
    const root = document.createElement('div');
    let clockOutAllCalls = 0;
    const model = {
        rows: [],
        focusedRows: [],
        recentRows: [],
        runningCount: 2,
        staleEntries: [],
        now: Date.now(),
    };

    renderSessionSurface(root, model, {
        onClockOutAll: () => {
            clockOutAllCalls += 1;
        },
        onRefresh: () => {},
    });

    const footer = root.querySelector('.rlb-surface__footer');
    const bulk = [...footer.querySelectorAll('button')].find(button =>
        /Clock Out All/i.test(button.textContent)
    );
    assert.ok(bulk);
    bulk.click();
    assert.equal(clockOutAllCalls, 1);

    renderSessionSurface(root, model, {
        clockOutAllConfirm: true,
        onClockOutAll: () => {},
        onRefresh: () => {},
    });
    assert.match(root.textContent, /Confirm Clock Out All/);
});

test('multi-Active Work keeps header icons distinct from the Clock Out All footer', () => {
    const root = document.createElement('div');
    renderSessionSurface(
        root,
        { rows: [], focusedRows: [], recentRows: [], runningCount: 2, staleEntries: [], now: Date.now() },
        { onOpenDashboard: () => {}, onClockOutAll: () => {}, onRefresh: () => {} }
    );

    const footer = root.querySelector('.rlb-surface__footer');
    assert.deepEqual([...footer.querySelectorAll('button')].map(button => button.textContent.trim()), [
        'Clock Out All',
    ]);
    assert.deepEqual(
        [...root.querySelectorAll('.rlb-surface__header .rlb-surface__actions > *')].map(
            action => action.dataset.action || 'refresh-cell'
        ),
        ['dashboard', 'refresh-cell']
    );
    assert.equal(
        root.querySelector('[data-action="refresh"]')?.title,
        'Refresh Active Work from graph'
    );
});

test('Refresh loading state is disabled in the header without changing live status semantics', () => {
    const root = document.createElement('div');
    renderSessionSurface(
        root,
        { rows: [], focusedRows: [], recentRows: [], runningCount: 2, staleEntries: [], now: Date.now() },
        { onRefresh: () => {}, refreshState: { state: 'loading' } }
    );

    const refresh = root.querySelector('[data-action="refresh"]');
    assert.ok(refresh?.disabled);
    assert.equal(refresh?.getAttribute('aria-busy'), 'true');
    assert.equal(root.querySelector('.rlb-surface__refresh-cell')?.dataset.refreshState, 'loading');
    assert.equal(root.querySelector('.rlb-surface__footer'), null);
});

test('Thread count uses singular/plural grammar while keeping Active Work load tones', () => {
    const cases = [
        [0, 'neutral', '0 Threads'],
        [1, 'neutral', '1 Thread'],
        [2, 'neutral', '2 Threads'],
        [3, 'neutral', '3 Threads'],
        [4, 'yellow', '4 Threads'],
        [5, 'yellow', '5 Threads'],
        [6, 'yellow', '6 Threads'],
        [7, 'red', '7 Threads'],
        [99, 'red', '99 Threads'],
    ];

    for (const [count, tone, label] of cases) {
        assert.equal(sessionLoadTone(count), tone, `${count} Threads should be ${tone}`);
        assert.equal(activeCount(count), label);
    }
});

test('live Thread count reclassifies only the count node without duplicate DOM', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    settingsStore.set('allowMultipleClocks', true);
    for (let index = 2; index <= 7; index += 1) {
        const uid = `popover-load-${index}`;
        graph.store.set(uid, {
            uid,
            string: `{{[[TODO]]}} Load task ${index}`,
            parent: null,
            page: 'Project Page',
        });
    }

    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-load-2', { now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-load-3', { now: new Date('2026-08-15T09:00:00') });

    const button = topbarButton();
    const countNode = () => button.querySelector('.rlb-topbar__parallel');
    const timeNode = () => button.querySelector('.rlb-topbar__time');
    assert.equal(countNode().textContent, '3 Threads');
    assert.match(button.title, /^3 Threads\n/);
    assert.equal(button.getAttribute('aria-label'), button.title);
    assert.equal(
        [...countNode().classList].some(className => className.startsWith('rlb-topbar__parallel--load-')),
        false
    );
    assert.ok(timeNode().classList.contains('rlb-topbar__time--neutral'));

    await clock.clockIn('popover-load-4', { now: new Date('2026-08-15T09:00:00') });
    assert.equal(countNode().textContent, '4 Threads');
    assert.ok(countNode().classList.contains('rlb-topbar__parallel--load-yellow'));

    await clock.clockIn('popover-load-5', { now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-load-6', { now: new Date('2026-08-15T09:00:00') });
    assert.equal(countNode().textContent, '6 Threads');
    assert.ok(countNode().classList.contains('rlb-topbar__parallel--load-yellow'));

    await clock.clockIn('popover-load-7', { now: new Date('2026-08-15T09:00:00') });
    assert.equal(countNode().textContent, '7 Threads');
    assert.ok(countNode().classList.contains('rlb-topbar__parallel--load-red'));
    assert.equal(button.querySelectorAll('.rlb-topbar__parallel').length, 1);
    assert.ok(timeNode().classList.contains('rlb-topbar__time--neutral'));
    assert.doesNotMatch(button.title, /normal|high|overloaded|limit/i);
});

test('Pomodoro overrun stays on the timer and remains independent of Active Work tone', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:46:00') });
    settingsStore.set('allowMultipleClocks', true);
    for (let index = 2; index <= 4; index += 1) {
        const uid = `popover-threshold-${index}`;
        graph.store.set(uid, {
            uid,
            string: `{{[[TODO]]}} Threshold task ${index}`,
            parent: null,
            page: 'Project Page',
        });
    }

    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-threshold-2', { now: new Date('2026-08-15T09:43:00') });
    await clock.clockIn('popover-threshold-3', { now: new Date('2026-08-15T09:44:00') });

    const button = topbarButton();
    const time = button.querySelector('.rlb-topbar__time');
    const count = button.querySelector('.rlb-topbar__parallel');
    assert.ok(time.classList.contains('rlb-topbar__time--overrun'));
    assert.equal(
        [...count.classList].some(className => className.startsWith('rlb-topbar__parallel--load-')),
        false
    );
    assert.equal(count.classList.contains('rlb-topbar__parallel--load-red'), false);
    assert.equal(button.querySelector('.rlb-topbar__separator').className, 'rlb-topbar__separator');

    await clock.clockIn('popover-threshold-4', { now: new Date('2026-08-15T09:45:00') });
    assert.ok(button.querySelector('.rlb-topbar__time--overrun'));
    assert.ok(button.querySelector('.rlb-topbar__parallel--load-yellow'));
    assert.equal(button.querySelector('.rlb-topbar__parallel--load-overrun'), null);
});

test('running rows expose compact cycle metadata without misleading per-session targets', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });

    const popover = openPopover();
    const row = popover.querySelector('.rlb-run');
    const taskButton = row.querySelector('.rlb-run__title');

    assert.equal(row.querySelector('.rlb-dot'), null, 'the header already communicates Running');
    assert.equal(taskButton.tagName, 'BUTTON');
    assert.equal(taskButton.type, 'button');
    assert.equal(taskButton.tabIndex, 0);
    assert.equal(taskButton.classList.contains('bp3-icon-document-open'), false);
    assert.equal(row.querySelector('.bp3-icon-document-open'), null);
    assert.match(taskButton.title, /Graph Engineering: a deliberately long task title/);
    assert.match(taskButton.title, /Open this block/i);
    assert.match(taskButton.getAttribute('aria-label'), /Graph Engineering: a deliberately long task title/);
    assert.match(taskButton.getAttribute('aria-label'), /Open this block/i);
    assert.equal(row.classList.contains('rlb-run--inline-meta'), true);

    const meta = row.querySelector('.rlb-run__meta');
    const started = row.querySelector('.rlb-run__started');
    assert.deepEqual([...meta.children].map(node => node.className), [
        'rlb-run__meta-line rlb-run__meta-primary',
        'rlb-run__meta-separator',
        'rlb-run__meta-line rlb-run__started',
    ]);
    assert.equal(meta.querySelectorAll('.rlb-run__meta-line').length, 2);
    assert.equal(meta.querySelector('.rlb-run__meta-separator').getAttribute('aria-hidden'), 'true');
    assert.match(
        row.querySelector('.rlb-run__meta-primary').textContent,
        /^\d+:\d{2} · \d+m total$/
    );
    assert.doesNotMatch(row.textContent, /target|Pomodoro/i);
    assert.match(
        started.textContent,
        /^(Today|[A-Z][a-z]{2} \d{1,2}) \d{2}:\d{2}$/
    );
    assert.equal(started.tagName, 'TIME');
    assert.equal(started.dateTime, '2026-08-15T09:00');
    assert.match(started.title, /^Started \[/);
    assert.match(started.getAttribute('aria-label'), /^Started \[/);
    assert.doesNotMatch(row.textContent, /Project Page|\[2026-08-15 Sat 09:00\]/);

    const checkout = row.querySelector('[data-action="clock-out"]');
    assert.equal(checkout.textContent, '');
    assert.ok(checkout.classList.contains('bp3-icon-log-out'));
    assert.equal(checkout.classList.contains('bp3-icon-stop'), false);
    assert.equal(checkout.classList.contains('bp3-intent-success'), false);
    assert.equal(checkout.title, 'Check Out');
    assert.equal(checkout.getAttribute('aria-label'), 'Check Out');

    const discard = row.querySelector('[data-action="discard"]');
    assert.match(discard.title, /Discard this CLOCK|discard this Session/i);
    assert.equal(discard.getAttribute('aria-label'), discard.title);
    await settle();
});

test('Session task titles preserve ordinary click and native keyboard activation', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    const openCalls = [];
    const mainWindow = window.roamAlphaAPI.ui.mainWindow;
    const originalOpenBlock = mainWindow.openBlock;
    mainWindow.openBlock = async spec => {
        openCalls.push(spec);
    };

    try {
        await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });

        const popover = openPopover();
        click(popover.querySelector('.rlb-run__title'));
        await settle();
        assert.deepEqual(openCalls, [{ block: { uid: 'popover-task-01' } }]);
        assert.equal(document.querySelector('.rlb-popover'), null);

        const keyboardPopover = openPopover();
        const keyboardTitle = keyboardPopover.querySelector('.rlb-run__title');
        keyboardTitle.focus();
        assert.equal(document.activeElement, keyboardTitle);
        // jsdom does not synthesize the browser's default click after an Enter
        // keydown; the native button is what supplies that activation in Roam.
        keyboardTitle.dispatchEvent(
            new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
        );
        keyboardTitle.click();
        await settle();
        assert.deepEqual(openCalls, [
            { block: { uid: 'popover-task-01' } },
            { block: { uid: 'popover-task-01' } },
        ]);
    } finally {
        mainWindow.openBlock = originalOpenBlock;
    }
});

test('topbar keeps one shared Work Cycle across task switches and ignores Roam sync indicator color', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:31:00') });
    settingsStore.set('allowMultipleClocks', true);
    graph.store.set('popover-task-02', {
        uid: 'popover-task-02',
        string: '{{[[TODO]]}} A second cycle task',
        parent: null,
        page: 'Project Page',
    });
    const firstStart = new Date('2026-08-15T09:00:00');
    const secondStart = new Date('2026-08-15T09:28:00');
    await clock.clockIn('popover-task-01', { now: firstStart });
    const syncIndicator = document.createElement('span');
    syncIndicator.className = 'rm-sync-indicator';
    syncIndicator.style.color = 'rgb(220, 50, 50)';
    document.querySelector('.rm-topbar').appendChild(syncIndicator);

    assert.equal(topbarButton().querySelector('.rlb-topbar__time').textContent, '31:00');
    assert.ok(topbarButton().querySelector('.rlb-topbar__time--neutral'));
    await clock.clockIn('popover-task-02', { now: secondStart });
    assert.equal(topbarButton().querySelector('.rlb-topbar__time').textContent, '31:00');
    assert.ok(topbarButton().querySelector('.rlb-topbar__time--neutral'));
    assert.equal(document.querySelector('.rm-sync-indicator').style.color, 'rgb(220, 50, 50)');

    await clock.clockOut(clock.getRunning()[0].clockUid, { now: new Date('2026-08-15T09:31:00') });
    assert.equal(clock.getRunning().length, 0);
    assert.equal(pomodoro.getCycle(), null);
});

test('Active Work header keeps Refresh copy hidden while preserving accessible state feedback', async t => {
    t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date('2026-08-15T09:00:00') });
    settingsStore.set('allowMultipleClocks', true);
    graph.store.set('popover-task-02', {
        uid: 'popover-task-02',
        string: '{{[[TODO]]}} A second task',
        parent: null,
        page: 'Project Page',
    });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-task-02', { now: new Date('2026-08-15T09:00:00') });

    const popover = openPopover();
    const refresh = popover.querySelector('.rlb-surface__header [data-action="refresh"]');
    const checkout = popover.querySelector('[data-action="clock-out"]');

    assert.ok(refresh, 'Refresh belongs in the surface header');
    assert.equal(popover.querySelectorAll('[data-action="refresh"]').length, 1);
    assert.equal(refresh.title, 'Refresh Active Work from graph');
    assert.equal(refresh.getAttribute('aria-label'), 'Refresh Active Work from graph');
    assert.ok(refresh.classList.contains('bp3-icon-refresh'));
    assert.equal(refresh.closest('.rlb-surface__refresh-cell').dataset.refreshState, 'loading');
    const live = popover.querySelector('.rlb-surface__refresh-status');
    assert.equal(live.getAttribute('role'), 'status');
    assert.equal(live.getAttribute('aria-live'), 'polite');
    assert.equal(live.getAttribute('aria-atomic'), 'true');
    assert.ok(live.classList.contains('rlb-visually-hidden'));
    assert.equal(popover.querySelector('.rlb-surface__footer'), null);
    assert.equal(checkout.textContent, '');
    assert.ok(checkout.classList.contains('bp3-icon-log-out'));
    assert.equal(checkout.title, 'Check Out');
    assert.equal(checkout.getAttribute('aria-label'), 'Check Out');

    click(refresh);
    const loading = popover.querySelector('.rlb-surface__header [data-action="refresh"]');
    assert.equal(loading.closest('.rlb-surface__refresh-cell').dataset.refreshState, 'loading');
    assert.equal(loading.disabled, true);
    assert.equal(loading.getAttribute('aria-busy'), 'true');
    assert.ok(
        loading
            .closest('.rlb-surface__refresh-cell')
            .querySelector('.rlb-surface__refresh-status')
            .classList.contains('rlb-visually-hidden')
    );
    assert.match(
        loading.closest('.rlb-surface__refresh-cell').querySelector('.rlb-surface__refresh-status').textContent,
        /refreshing/i
    );
    t.mock.timers.tick(0);
    t.mock.timers.tick(0);
    await settle();
    assert.equal(popover.parentElement, document.body);
    assert.equal(popover.querySelectorAll('[data-action="refresh"]').length, 1);
    const success = popover.querySelector('.rlb-surface__header [data-action="refresh"]');
    assert.equal(success.closest('.rlb-surface__refresh-cell').dataset.refreshState, 'success');
    assert.equal(success.getAttribute('aria-busy'), null);
    assert.ok(
        success
            .closest('.rlb-surface__refresh-cell')
            .querySelector('.rlb-surface__refresh-status')
            .classList.contains('rlb-visually-hidden')
    );
    assert.match(
        success.closest('.rlb-surface__refresh-cell').querySelector('.rlb-surface__refresh-status').textContent,
        /Updated just now/
    );

    t.mock.timers.tick(2_000);
    await settle();
    const idle = popover.querySelector('.rlb-surface__header [data-action="refresh"]');
    assert.equal(idle.closest('.rlb-surface__refresh-cell').dataset.refreshState, 'idle');
    assert.equal(
        idle.closest('.rlb-surface__refresh-cell').querySelector('.rlb-surface__refresh-status').textContent,
        ''
    );

});

test('Refresh reconciles an external graph CLOCK into Recent Active Work without closing the popover', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });
    const popover = openPopover();

    graph.store.set('popover-task-02', {
        uid: 'popover-task-02',
        string: '{{[[TODO]]}} External graph task',
        parent: null,
        page: 'Project Page',
        order: 10,
    });
    graph.store.set('popover-drawer-02', {
        uid: 'popover-drawer-02',
        string: 'LOGBOOK::',
        parent: 'popover-task-02',
        order: 11,
    });
    graph.store.set('popover-clock-02', {
        uid: 'popover-clock-02',
        string: 'CLOCK:: [2026-08-15 Sat 08:30]',
        parent: 'popover-drawer-02',
        order: 12,
    });

    click(popover.querySelector('[data-action="refresh"]'));
    await settlePostPaint();

    assert.equal(document.querySelector('body > .rlb-popover'), popover);
    assert.equal(popover.querySelectorAll('.rlb-run').length, 2);
    assert.equal(popover.querySelector('.rlb-popover__title').textContent, 'ACTIVE WORK · 2');
    assert.match(popover.textContent, /External graph task/);
});

test('fast Refresh clicks coalesce into one graph read', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });
    const popover = openPopover();
    let reads = 0;
    const originalQuery = graph.api.data.q;
    graph.api.data.q = (...args) => {
        if (String(args[0]).includes('LOGBOOK:')) reads += 1;
        return originalQuery(...args);
    };
    let notifications = 0;
    const unsubscribe = clock.subscribe(() => {
        notifications += 1;
    });
    notifications = 0;

    try {
        const refresh = popover.querySelector('[data-action="refresh"]');
        click(refresh);
        const loading = popover.querySelector('[data-action="refresh"]');
        click(loading);
        assert.equal(loading.disabled, true);
        await settlePostPaint();
        assert.equal(reads, 1);
        assert.equal(notifications, 1, 'explicit Refresh announces the confirmed reconciliation');
        assert.match(
            popover.querySelector('.rlb-surface__refresh-status').textContent,
            /Updated just now/
        );
    } finally {
        graph.api.data.q = originalQuery;
        unsubscribe();
    }
});

test('failed Refresh preserves the previous snapshot and announces a retryable error', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });
    const popover = openPopover();
    const beforeUid = popover.querySelector('.rlb-run').dataset.clockUid;
    const originalQuery = graph.api.data.q;
    graph.api.data.q = () => {
        throw new Error('temporary graph read failure');
    };

    try {
        click(popover.querySelector('[data-action="refresh"]'));
        await settlePostPaint();
    } finally {
        graph.api.data.q = originalQuery;
    }

    assert.equal(popover.querySelectorAll('.rlb-run').length, 1);
    assert.equal(popover.querySelector('.rlb-run').dataset.clockUid, beforeUid);
    assert.equal(
        popover.querySelector('.rlb-surface__refresh-cell').dataset.refreshState,
        'error'
    );
    assert.equal(
        popover.querySelector('.rlb-surface__refresh-status').classList.contains('rlb-visually-hidden'),
        true
    );
    assert.match(popover.querySelector('.rlb-surface__refresh-status').textContent, /last valid snapshot/i);
    assert.match(popover.querySelector('.rlb-popover__notice').textContent, /Retry after Roam finishes syncing/i);
    assert.equal(popover.querySelector('.rlb-popover__notice').getAttribute('role'), 'alert');
    assert.equal(popover.querySelector('.rlb-popover__notice').getAttribute('aria-live'), 'assertive');
});

test('Refresh does not mutate CLOCK data or the shared Pomodoro cycle', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });
    const popover = openPopover();
    const cycleBefore = pomodoro.getCycle();
    const clockStringsBefore = [...graph.store.values()]
        .filter(block => /^CLOCK:{1,2} \[/.test(String(block.string)))
        .map(block => [block.uid, block.string]);
    const writes = { create: 0, update: 0, delete: 0 };
    const originals = {
        create: graph.api.data.block.create,
        update: graph.api.data.block.update,
        delete: graph.api.data.block.delete,
    };
    for (const name of Object.keys(writes)) {
        graph.api.data.block[name] = async (...args) => {
            writes[name] += 1;
            return originals[name](...args);
        };
    }

    try {
        click(popover.querySelector('[data-action="refresh"]'));
        await settle();
    } finally {
        for (const name of Object.keys(writes)) graph.api.data.block[name] = originals[name];
    }

    assert.deepEqual(writes, { create: 0, update: 0, delete: 0 });
    assert.deepEqual(pomodoro.getCycle(), cycleBefore);
    assert.deepEqual(
        [...graph.store.values()]
            .filter(block => /^CLOCK:{1,2} \[/.test(String(block.string)))
            .map(block => [block.uid, block.string]),
        clockStringsBefore
    );
});

test('Active Work labels Timing and Parallel Threads without warning banners', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:05:00') });
    graph.store.set('popover-task-02', {
        uid: 'popover-task-02',
        string: '{{[[TODO]]}} A second task',
        parent: null,
        page: 'Project Page',
    });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-task-02', { now: new Date('2026-08-15T09:02:00') });

    const surface = openPopover();
    const list = surface.querySelector('.rlb-surface__list');
    assert.ok(list, 'Active Work rows share one accessible surface');
    assert.equal(surface.querySelectorAll('.rlb-surface__list').length, 1);
    assert.equal(list.getAttribute('role'), 'group');
    assert.equal(list.getAttribute('aria-label'), 'Active Work');
    assert.deepEqual(
        [...list.querySelectorAll('.rlb-surface__section-label')].map(node => node.textContent),
        ['TIMING', 'PARALLEL THREADS · 1 Leave after 45m without focus']
    );
    assert.equal(surface.querySelector('.rlb-popover__title').textContent, 'ACTIVE WORK · 2');
    assert.equal(
        list.querySelector('.rlb-surface__section--open-lines').getAttribute('aria-label'),
        'PARALLEL THREADS · 1, Leave after 45m without focus'
    );
    assert.equal(surface.querySelector('.rlb-popover__notice'), null);

    const focusedSection = list.querySelector('.rlb-surface__section--focused');
    const recentSection = list.querySelector('.rlb-surface__section--recent');
    const focused = focusedSection.querySelector('[data-session-state="running"]');
    const recent = recentSection.querySelector('[data-session-state="recent"]');
    assert.ok(focused.classList.contains('rlb-run--focused'));
    assert.ok(recent.classList.contains('rlb-run--recent'));
    assert.equal(focusedSection.querySelectorAll('.rlb-run').length, 1);
    assert.equal(recentSection.querySelectorAll('.rlb-run').length, 1);
    assert.ok(focused.querySelector('.rlb-run__actions'));
    const recentTitle = recent.querySelector('.rlb-run__title');
    assert.equal(recentTitle.title, 'Open this block: Graph Engineering: a deliberately long task title that must remain accessible');
    assert.equal(recentTitle.getAttribute('aria-label'), 'Open this block: Graph Engineering: a deliberately long task title that must remain accessible');
    const recentFocus = recent.querySelector('[data-action="focus-recent"]');
    assert.ok(recentFocus);
    assert.equal(recentFocus.title, 'Switch Focus to Graph Engineering: a deliberately long task title that must remain accessible');
    assert.equal(recentFocus.getAttribute('aria-label'), 'Switch Focus to Graph Engineering: a deliberately long task title that must remain accessible');
    assert.ok(recentFocus.classList.contains('bp3-icon-play'));
    assert.equal(focused.querySelector('.rlb-run__elapsed').textContent, '3:00');

    const recentMeta = recent.querySelector('.rlb-run__recent-meta');
    assert.equal(recentMeta.tagName, 'TIME');
    assert.equal(recentMeta.textContent, '2m total · leaves in 42m');
    assert.equal(recentMeta.dateTime, '2026-08-15T09:02');
    assert.equal(recentMeta.title, '2m total · leaves in 42m; Last active [2026-08-15 Sat 09:02]');
    assert.equal(
        recentMeta.getAttribute('aria-label'),
        '2m total; leaves in 42m; Last active [2026-08-15 Sat 09:02]'
    );
    assert.doesNotMatch(surface.textContent, /Recent|RECENT|ago/);
    assert.equal(surface.querySelectorAll('.rlb-run__status').length, 0);

    const atWindowEdge = new Date('2026-08-15T09:45:00');
    updateSessionSurfaceElapsed(surface, clock.getRunning(), atWindowEdge, clock.getActiveWork(atWindowEdge).recent);
    assert.ok(focused.classList.contains('rlb-run--overrun'));
    assert.ok(focusedSection.classList.contains('rlb-surface__section--overrun'));
    assert.equal(recentMeta.textContent, '2m total · leaves in 2m');
    assert.match(focusedSection.querySelector('.rlb-run__elapsed').textContent, /^\d+:\d{2}$/);
    assert.match(focusedSection.querySelector('.rlb-run__total').textContent, /^\d+\w+ total$/);
});

test('clicking a Recent title opens its block without switching Focus', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:05:00') });
    graph.store.set('popover-task-02', {
        uid: 'popover-task-02',
        string: '{{[[TODO]]}} A second task',
        parent: null,
        page: 'Project Page',
    });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-task-02', { now: new Date('2026-08-15T09:02:00') });

    const openCalls = [];
    const mainWindow = window.roamAlphaAPI.ui.mainWindow;
    const originalOpenBlock = mainWindow.openBlock;
    mainWindow.openBlock = async spec => openCalls.push(spec);
    try {
        const surface = openPopover();
        const recentTitle = surface.querySelector('.rlb-surface__section--recent .rlb-run__title');
        click(recentTitle);
        await settle();

        assert.deepEqual(openCalls, [{ block: { uid: 'popover-task-01' } }]);
        assert.equal(clock.getRunning().length, 1);
        assert.equal(clock.getRunning()[0].taskUid, 'popover-task-02');
    } finally {
        mainWindow.openBlock = originalOpenBlock;
    }
});

test('the Recent Focus action switches it to the one Focused CLOCK', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:05:00') });
    graph.store.set('popover-task-02', {
        uid: 'popover-task-02',
        string: '{{[[TODO]]}} A second task',
        parent: null,
        page: 'Project Page',
    });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-task-02', { now: new Date('2026-08-15T09:02:00') });

    const surface = openPopover();
    const recentFocus = surface.querySelector(
        '.rlb-surface__section--recent [data-action="focus-recent"]'
    );
    assert.equal(recentFocus.getAttribute('aria-label'), 'Switch Focus to Graph Engineering: a deliberately long task title that must remain accessible');
    const sidebarCalls = [];
    const previousSidebar = window.roamAlphaAPI.ui.rightSidebar;
    window.roamAlphaAPI.ui.rightSidebar = {
        open: async () => sidebarCalls.push({ action: 'open' }),
        getWindows: () => [
            { type: 'block', 'block-uid': 'popover-task-01', order: 2, 'collapsed?': true },
        ],
        addWindow: async spec => sidebarCalls.push({ action: 'addWindow', spec }),
        setWindowOrder: async spec => sidebarCalls.push({ action: 'setWindowOrder', spec }),
        expandWindow: async spec => sidebarCalls.push({ action: 'expandWindow', spec }),
    };
    try {
        click(recentFocus);
        await settle();
    } finally {
        window.roamAlphaAPI.ui.rightSidebar = previousSidebar;
    }

    assert.deepEqual(sidebarCalls, [
        { action: 'open' },
        {
            action: 'setWindowOrder',
            spec: {
                window: { type: 'block', 'block-uid': 'popover-task-01', order: 0 },
            },
        },
        {
            action: 'expandWindow',
            spec: { window: { type: 'block', 'block-uid': 'popover-task-01' } },
        },
    ]);

    assert.equal(clock.getRunning().length, 1);
    assert.equal(clock.getRunning()[0].taskUid, 'popover-task-01');
    assert.equal(
        clock.getEntriesSnapshot().filter(entry => entry.running).length,
        1,
        'Recent switching never creates overlapping CLOCKs'
    );
    assert.equal(
        surface.querySelector('.rlb-surface__section--focused .rlb-run').dataset.taskUid,
        'popover-task-01'
    );
});

test('Check Out icon ends only the clicked Focused Task; Recent Tasks have no timer to close', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    settingsStore.set('allowMultipleClocks', true);
    graph.store.set('popover-task-02', {
        uid: 'popover-task-02',
        string: '{{[[TODO]]}} A second task',
        parent: null,
        page: 'Project Page',
    });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });
    const singlePopover = openPopover();
    const singleCheckout = singlePopover.querySelector('[data-action="clock-out"]');
    assert.equal(singleCheckout.textContent, '');
    assert.equal(singleCheckout.title, 'Check Out');
    click(singleCheckout);
    await settle();
    assert.equal(clock.getRunning().length, 0);
    click(topbarButton());

    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:01:00') });
    await clock.clockIn('popover-task-02', { now: new Date('2026-08-15T09:02:00') });
    const parallelPopover = openPopover();
    const rows = [...parallelPopover.querySelectorAll('.rlb-run')];
    assert.equal(rows.length, 2);
    assert.equal(rows[0].querySelector('[data-action="clock-out"]')?.title, 'Check Out');
    assert.equal(rows[1].querySelector('[data-action="clock-out"]'), null);
    click(rows[0].querySelector('[data-action="clock-out"]'));
    await settle();
    assert.equal(clock.getRunning().length, 0);
});

test('Clock Out keeps the open popover and exposes the ended Focus plus prior Recent Tasks', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-17T09:00:00') });
    addTask('popover-task-02', 'A prior Recent task');
    addTask('popover-task-03', 'The current Focus task');

    await clock.clockIn('popover-task-02', { now: new Date('2026-08-17T08:30:00') });
    await clock.clockOut(clock.getRunning()[0].clockUid, { now: new Date('2026-08-17T08:40:00') });
    await clock.clockIn('popover-task-03', { now: new Date('2026-08-17T08:50:00') });

    const surface = openPopover();
    const checkout = surface.querySelector('[data-action="clock-out"]');
    click(checkout);
    await settle();

    assert.equal(clock.getRunning().length, 0);
    assert.equal(surface.querySelector('.rlb-surface__section--focused'), null);
    assert.deepEqual(
        [...surface.querySelectorAll('[data-session-state="recent"]')].map(row => row.dataset.taskUid),
        ['popover-task-03', 'popover-task-02']
    );
    assert.equal(surface.querySelectorAll('[data-task-uid="popover-task-03"]').length, 1);
    assert.equal(surface.querySelectorAll('[data-task-uid="popover-task-02"]').length, 1);
    assert.equal(topbarButton().querySelector('.rlb-topbar__parallel').textContent, '2 Threads');
    assert.equal(topbarButton().querySelector('.rlb-topbar__time'), null);
    assert.equal(topbarButton().textContent, '2 Threads');
});

test('pure Recent Active Work expires on the ticker without another graph read', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-17T09:00:00') });
    const scheduler = createManualPostPaintScheduler();
    const tickerCallbacks = [];
    const topbar = mountControlledTopbar(t, {
        blocks: [],
        scheduler,
        setIntervalFn: callback => {
            tickerCallbacks.push(callback);
            return callback;
        },
        clearIntervalFn: callback => {
            const index = tickerCallbacks.indexOf(callback);
            if (index >= 0) tickerCallbacks.splice(index, 1);
        },
    });
    addTask('popover-task-02', 'A Recent task');

    await clock.clockIn('popover-task-02', { now: new Date('2026-08-17T09:00:00') });
    t.mock.timers.tick(60_000);
    await clock.clockOut(clock.getRunning()[0].clockUid);
    const surface = openPopover();
    scheduler.flush();
    await settle();

    assert.equal(surface.querySelectorAll('[data-session-state="recent"]').length, 1);
    let graphReads = 0;
    const originalQuery = graph.api.data.q;
    graph.api.data.q = (...args) => {
        if (String(args[0]).includes('LOGBOOK:')) graphReads += 1;
        return originalQuery(...args);
    };
    try {
        const readsBeforeExpiry = graphReads;
        t.mock.timers.tick(45 * 60_000);
        for (let index = 0; index < 45 * 60; index += 1) tickerCallbacks[0]?.();

        assert.equal(graphReads, readsBeforeExpiry, 'ticker expiry is derived from the cached snapshot');
        assert.equal(surface.querySelectorAll('[data-session-state="recent"]').length, 0);
        assert.ok(surface.querySelector('.rlb-popover__empty'));
        assert.equal(topbarButton().querySelector('.rlb-topbar__parallel'), null);
        assert.equal(topbarButton().querySelector('.rlb-topbar__time'), null);
        assert.ok(topbarButton().querySelector('.bp3-icon-history'));
        assert.equal(topbarButton().textContent, '');
        assert.equal(topbar.getPerformanceSnapshot().tickCount >= 45, true);
    } finally {
        graph.api.data.q = originalQuery;
    }
});

test('pure Recent rows keep navigation and an independent Focus action', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-17T09:05:00') });
    addTask('popover-task-02', 'A Recent task');
    await clock.clockIn('popover-task-02', { now: new Date('2026-08-17T09:00:00') });
    await clock.clockOut(clock.getRunning()[0].clockUid, { now: new Date('2026-08-17T09:01:00') });

    const openCalls = [];
    const mainWindow = window.roamAlphaAPI.ui.mainWindow;
    const originalOpenBlock = mainWindow.openBlock;
    mainWindow.openBlock = async spec => openCalls.push(spec);
    try {
        const surface = openPopover();
        const row = surface.querySelector('[data-session-state="recent"]');
        const title = row.querySelector('.rlb-run__title');
        const focus = row.querySelector('[data-action="focus-recent"]');

        click(title);
        await settle();
        assert.deepEqual(openCalls, [{ block: { uid: 'popover-task-02' } }]);
        assert.equal(clock.getRunning().length, 0, 'navigation does not start timing');

        click(focus);
        await settle();
        assert.equal(clock.getRunning().length, 1);
        assert.equal(clock.getRunning()[0].taskUid, 'popover-task-02');
    } finally {
        mainWindow.openBlock = originalOpenBlock;
    }
});

test('Pause removal regression keeps commands and footer clean while Clock Out leaves Recent focusable', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-17T09:05:00') });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-17T09:00:00') });
    await clock.clockOut(clock.getRunning()[0].clockUid, { now: new Date('2026-08-17T09:01:00') });

    const registeredLabels = [...contextCommands.keys(), ...paletteCommands.keys()].join(' ');
    assert.doesNotMatch(registeredLabels, /\b(?:Pause|Resume)\b/i);

    const surface = openPopover();
    assert.doesNotMatch(surface.textContent, /\b(?:Pause|Resume)\b/i);
    assert.doesNotMatch(
        [...surface.querySelectorAll('.rlb-surface__footer button')].map(button => button.textContent).join(' '),
        /\b(?:Pause|Resume)\b/i
    );
    const recent = surface.querySelector('[data-session-state="recent"]');
    assert.ok(recent, 'Clock Out retains the task in Recent');
    assert.ok(recent.querySelector('[data-action="focus-recent"]'), 'Recent remains focusable');
});

test('Topbar Shift+Click is inert and cannot open a popover or sidebar', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });
    const nativeCalls = [];
    window.roamAlphaAPI.ui.rightSidebar = {
        open: () => nativeCalls.push('open'),
        addWindow: async spec => nativeCalls.push(spec),
    };

    const trigger = topbarButton();
    let parentClicks = 0;
    trigger.parentElement.addEventListener('click', () => {
        parentClicks += 1;
    });
    const before = document.body.innerHTML;
    const event = shiftClick(trigger);
    await settle();

    assert.equal(event.defaultPrevented, true);
    assert.equal(parentClicks, 0, 'Shift+Click stops before the topbar parent');
    assert.equal(document.querySelector('.rlb-popover'), null);
    assert.equal(document.body.innerHTML, before, 'the inert gesture does not mutate layout');
    assert.deepEqual(nativeCalls, []);

    click(trigger);
    assert.ok(document.querySelector('.rlb-popover'), 'ordinary click still opens the popover');
    click(trigger);
    assert.equal(document.querySelector('.rlb-popover'), null);
});

test('Shift+Click on a Session task uses Roam native block-sidebar API and action icons do not navigate', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });

    const nativeCalls = [];
    window.roamAlphaAPI.ui.rightSidebar = {
        open: () => nativeCalls.push({ action: 'open' }),
        addWindow: async spec => nativeCalls.push({ action: 'addWindow', spec }),
    };

    const popover = openPopover();
    const row = popover.querySelector('.rlb-run');
    let rowClicks = 0;
    row.addEventListener('click', () => {
        rowClicks += 1;
    });

    const event = shiftClick(row.querySelector('.rlb-run__title'));
    await settle();

    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(nativeCalls, [
        { action: 'open' },
        {
            action: 'addWindow',
            spec: { window: { type: 'block', 'block-uid': 'popover-task-01' } },
        },
    ]);
    assert.equal(document.querySelector('.rlb-popover'), null);
    assert.equal(rowClicks, 0, 'task navigation should not bubble into the Session row');

    // A per-session action is an action, not a task navigation gesture.
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:01:00') });
    const refreshed = openPopover();
    const refreshedRow = refreshed.querySelector('.rlb-run');
    let actionRowClicks = 0;
    refreshedRow.addEventListener('click', () => {
        actionRowClicks += 1;
    });
    click(refreshedRow.querySelector('[data-action="clock-out"]'));
    await settle();
    assert.equal(actionRowClicks, 0);
});

test('Session Shift+Click keeps the popover open with a visible retry notice when native sidebar fails', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });
    const nativeCalls = [];
    const mainCalls = [];
    const originalOpenBlock = window.roamAlphaAPI.ui.mainWindow.openBlock;
    window.roamAlphaAPI.ui.mainWindow.openBlock = async spec => mainCalls.push(spec);
    window.roamAlphaAPI.ui.rightSidebar = {
        open: () => nativeCalls.push('open'),
        addWindow: async () => {
            nativeCalls.push('addWindow');
            throw new Error('native sidebar rejected the block');
        },
    };

    const popover = openPopover();
    const title = popover.querySelector('.rlb-run__title');
    const event = shiftClick(title);
    await settle();

    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(nativeCalls, ['open', 'addWindow']);
    assert.equal(document.querySelector('.rlb-popover'), popover);
    assert.match(popover.textContent, /native sidebar rejected the block/i);
    assert.deepEqual(mainCalls, []);
    window.roamAlphaAPI.ui.mainWindow.openBlock = originalOpenBlock;
});

test('Session Shift+Click shows a concise notice when Roam has no sidebar API', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });
    window.roamAlphaAPI.ui.rightSidebar = undefined;

    const popover = openPopover();
    const event = shiftClick(popover.querySelector('.rlb-run__title'));
    await settle();
    assert.equal(event.defaultPrevented, true);
    assert.equal(document.querySelector('.rlb-popover'), popover);
    assert.match(popover.textContent, /right-sidebar block windows are unavailable/i);
});

test('extension unload removes the regular Session popover and topbar cleanly', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });
    openPopover();
    assert.ok(document.querySelector('.rlb-popover'));

    extension.onunload();

    assert.equal(document.querySelector('.rlb-popover'), null);
    assert.equal(document.querySelector('#roam-logbook-topbar'), null);
});

test('topbar does not present a confirmed empty state when graph refresh fails', async t => {
    clock.reset();
    const originalQuery = graph.api.data.q;
    graph.api.data.q = () => {
        throw new Error('graph refresh unavailable');
    };
    t.after(() => {
        graph.api.data.q = originalQuery;
    });

    const popover = openPopover();
    assert.doesNotMatch(popover.textContent, /No Session is running/);
    assert.match(popover.textContent, /Refreshing Active Work state/i);
    await settlePostPaint();
    assert.doesNotMatch(popover.textContent, /No Session is running/);
    assert.match(popover.textContent, /state could not be confirmed|retry/i);

});

test('topbar shows a running Session for a confirmed open CLOCK', async () => {
    install([
        {
            uid: 'popover-task-01',
            string: '{{[[TODO]]}} Graph Engineering: confirmed running task',
            parent: null,
            page: 'Project Page',
        },
        { uid: 'popover-drawer-01', string: 'LOGBOOK::', parent: 'popover-task-01' },
        {
            uid: 'popover-clock-01',
            string: 'CLOCK:: [2026-08-15 Sat 12:38]',
            parent: 'popover-drawer-01',
        },
    ]);
    clock.reset();

    const popover = openPopover();
    assert.doesNotMatch(popover.textContent, /No Session is running/);
    await settlePostPaint();
    assert.equal(popover.querySelector('.rlb-popover__title').textContent, 'ACTIVE WORK · 1');
    assert.ok(popover.querySelector('.rlb-run'));
    assert.doesNotMatch(popover.textContent, /No Session is running/);
});

test('discarding a CLOCK entry is a two-step low-level cleanup action', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });
    const clockUid = clock.getRunning()[0].clockUid;

    const popover = openPopover();
    click(popover.querySelector('[data-action="discard"]'));
    await settle();

    assert.ok(graph.store.has(clockUid), 'the first click must not delete the CLOCK');
    const confirm = document.querySelector('[data-action="discard"]');
    assert.match(confirm.title, /confirm discard/i);
    assert.match(confirm.getAttribute('aria-label'), /confirm discard/i);

    click(confirm);
    await settle();
    assert.equal(graph.store.has(clockUid), false, 'the confirmed action removes the CLOCK entry');
    assert.equal(clock.getRunning().length, 0);
});

test('a Session without a Pomodoro target does not leave an empty metadata separator', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });
    pomodoro.suppress(clock.getRunning()[0].clockUid);

    const row = openPopover().querySelector('.rlb-run');
    assert.match(row.querySelector('.rlb-run__meta-primary').textContent, /^\d+:\d{2} · \d+m total$/);
    assert.doesNotMatch(row.querySelector('.rlb-run__meta-primary').textContent, /target|· ·/);
});

test('popover is a labelled dialog and returns focus to its trigger on every close path', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });

    const trigger = topbarButton();
    assert.equal(trigger.tagName, 'BUTTON');
    assert.equal(trigger.type, 'button');
    assert.equal(trigger.getAttribute('aria-haspopup'), 'dialog');
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');

    click(trigger);
    const popover = document.querySelector('body > .rlb-popover');
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(trigger.getAttribute('aria-controls'), popover.id);
    assert.equal(popover.getAttribute('role'), 'dialog');
    assert.ok(popover.id);
    assert.ok(popover.getAttribute('aria-labelledby'));
    assert.equal(
        document.getElementById(popover.getAttribute('aria-labelledby')).textContent,
        'ACTIVE WORK · 1'
    );
    assert.equal(document.activeElement, popover.querySelector('button'));

    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(document.querySelector('body > .rlb-popover'), null);
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(document.activeElement, trigger);

    click(trigger);
    document.body.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
    assert.equal(document.querySelector('body > .rlb-popover'), null);
    assert.equal(document.activeElement, trigger);

    click(trigger);
    window.dispatchEvent(new dom.window.Event('resize'));
    assert.equal(document.querySelector('body > .rlb-popover'), null);
    assert.equal(document.activeElement, trigger);
});

test('popover is modal to keyboard focus and falls back to the dialog when empty', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });

    const trigger = topbarButton();
    click(trigger);
    const popover = document.querySelector('body > .rlb-popover');
    assert.equal(popover.getAttribute('aria-modal'), 'true');
    const focusables = () =>
        [...popover.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])')].filter(
            node => !node.disabled && node.getAttribute('aria-hidden') !== 'true'
        );
    const first = focusables()[0];
    const last = focusables().at(-1);
    last.focus();
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    assert.equal(document.activeElement, first);
    first.focus();
    document.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })
    );
    assert.equal(document.activeElement, last);

    popover.querySelectorAll('button').forEach(control => control.remove());
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    assert.equal(document.activeElement, popover);

    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(document.activeElement, trigger);
});

test('dashboard traps focus and returns it to both topbar and command entry points', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });

    const trigger = topbarButton();
    click(trigger);
    const dashboardButton = document.querySelector('.rlb-surface__header [data-action="dashboard"]');
    click(dashboardButton);

    const root = document.getElementById('roam-logbook-dashboard');
    const dialog = root.querySelector('.rlb-dialog');
    assert.equal(root.getAttribute('aria-hidden'), 'false');
    assert.equal(dialog.getAttribute('role'), 'dialog');
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    assert.equal(document.activeElement, dialog.querySelector('select'));

    const focusables = () => [...dialog.querySelectorAll('select, button, [href], [tabindex]:not([tabindex="-1"])')];
    const first = focusables()[0];
    const last = focusables().at(-1);
    last.focus();
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    assert.equal(document.activeElement, first);
    first.focus();
    document.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })
    );
    assert.equal(document.activeElement, last);

    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(root.classList.contains('rlb-root--open'), false);
    assert.equal(document.activeElement, trigger);

    trigger.focus();
    paletteCommands.get('Logbook: Open dashboard')();
    assert.equal(document.activeElement, root.querySelector('select'));
    const dashboardDialog = root.querySelector('.rlb-dialog');
    root.querySelectorAll('select, button').forEach(control => control.remove());
    dashboardDialog.focus();
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    assert.equal(document.activeElement, dashboardDialog, 'an empty dialog remains keyboard reachable');
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(document.activeElement, trigger);
});

test('Topbar and Dashboard expose the same injected elapsed instant', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });
    const topbarElapsed = topbarWidget().querySelector('.rlb-topbar__time').textContent;

    paletteCommands.get('Logbook: Open dashboard')();
    const dashboardElapsed = document.querySelector('[data-running-elapsed="true"]').textContent;
    assert.equal(dashboardElapsed, topbarElapsed);
});
