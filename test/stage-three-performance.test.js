import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { installGraph, uninstallGraph } from './helpers/graph-stub.js';

const dom = new JSDOM('<!doctype html><html><body><div class="rm-topbar"><button aria-label="Back"></button><button aria-label="Forward"></button><input aria-label="Find or Create Page"></div></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.HTMLElement = dom.window.HTMLElement;

const TASK = { uid: 'perf-task1', string: '{{[[TODO]]}} performance task', parent: null };
const settings = new Map([['showTopbarWidget', true]]);
const extensionAPI = {
    settings: {
        get: key => settings.get(key),
        set: (key, value) => settings.set(key, value),
    },
};

const clock = await import('../src/clock.js');
const { setExtensionAPI } = await import('../src/settings.js');
const { createTopbar } = await import('../src/topbar.js');
const { createDashboard } = await import('../src/dashboard.js');
const { readDashboardSnapshot } = await import('../src/entries.js');
const { buildDashboard } = await import('../src/stats.js');

const settleMutations = async () => {
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
};

test.beforeEach(() => {
    installGraph([TASK]);
    setExtensionAPI(extensionAPI);
    clock.reset();
    document.body.innerHTML = '<div class="rm-topbar"><button aria-label="Back"></button><button aria-label="Forward"></button><input aria-label="Find or Create Page"></div>';
});

test.after(() => {
    clock.reset();
    setExtensionAPI(null);
    uninstallGraph();
});

test('unrelated document mutations do not cause repeated attachment work', async () => {
    const topbar = createTopbar({ onOpenDashboard: () => {} });
    topbar.mount();
    const initial = topbar.getPerformanceSnapshot().attachCount;

    for (let index = 0; index < 1000; index += 1) {
        const node = document.createElement('div');
        node.textContent = `unrelated-${index}`;
        document.body.appendChild(node);
    }
    await settleMutations();

    assert.equal(topbar.getPerformanceSnapshot().attachCount, initial);
    topbar.unmount();
});

test('plugin-owned DOM mutations do not schedule a re-attach', async () => {
    const topbar = createTopbar({ onOpenDashboard: () => {} });
    topbar.mount();
    const initial = topbar.getPerformanceSnapshot().attachCount;
    const widget = document.querySelector('#roam-logbook-topbar');
    widget.appendChild(document.createElement('span'));
    await settleMutations();

    assert.equal(topbar.getPerformanceSnapshot().attachCount, initial);
    topbar.unmount();
});

test('boot recovery stops after bounded misses and disables the widget', async () => {
    document.body.innerHTML = '';
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = message => warnings.push(message);
    const topbar = createTopbar({ onOpenDashboard: () => {} });

    try {
        topbar.mount();
        for (let index = 0; index < 31; index += 1) topbar.refresh();
        assert.deepEqual(warnings, [
            '[roam-logbook] Roam topbar host not found; widget disabled',
        ]);

        document.body.innerHTML = '<div class="rm-topbar"></div>';
        await settleMutations();
        assert.equal(document.querySelector('#roam-logbook-topbar'), null);
    } finally {
        topbar.unmount();
        console.warn = originalWarn;
    }
});

test('the retired topbar setting cannot disable the core widget or duplicate its ticker', async () => {
    settings.set('showTopbarWidget', false);
    const timers = [];
    const cleared = [];
    const topbar = createTopbar({
        onOpenDashboard: () => {},
        setIntervalFn: callback => {
            const timer = { callback };
            timers.push(timer);
            return timer;
        },
        clearIntervalFn: timer => cleared.push(timer),
    });

    topbar.mount();
    assert.equal(timers.length, 1, 'mount registers one ticker');
    topbar.refresh();
    assert.equal(timers.length, 1, 'legacy false is ignored and refresh does not duplicate the ticker');
    assert.equal(cleared.length, 0);
    assert.ok(document.querySelector('#roam-logbook-topbar'));

    topbar.unmount();
    assert.equal(cleared.length, 1, 'unmount clears the one active ticker');
});

test('outer navigation shell replacement is recovered with one debounced attach', async () => {
    document.body.innerHTML =
        '<div class="rlb-outer-shell"><div class="rlb-nav-shell"><div class="rm-topbar">' +
        '<button aria-label="Back"></button><button aria-label="Forward"></button>' +
        '<input aria-label="Find or Create Page"></div></div></div>';
    const topbar = createTopbar({ onOpenDashboard: () => {} });
    topbar.mount();
    const initial = topbar.getPerformanceSnapshot().attachCount;
    const outer = document.querySelector('.rlb-outer-shell');
    const replacement = document.createElement('div');
    replacement.className = 'rlb-nav-shell';
    replacement.innerHTML =
        '<div class="rm-topbar"><button aria-label="Back"></button>' +
        '<button aria-label="Forward"></button><input aria-label="Find or Create Page"></div>';
    outer.replaceChildren(replacement);
    await settleMutations();

    assert.equal(topbar.getPerformanceSnapshot().attachCount, initial + 1);
    assert.ok(document.querySelector('.rm-topbar #roam-logbook-topbar'));
    topbar.unmount();
});

test('direct Roam topbar replacement is recovered without an attach loop', async () => {
    const topbar = createTopbar({ onOpenDashboard: () => {} });
    topbar.mount();
    const initial = topbar.getPerformanceSnapshot().attachCount;
    const parent = document.querySelector('.rm-topbar').parentElement;
    const replacement = document.createElement('div');
    replacement.className = 'rm-topbar';
    replacement.innerHTML =
        '<button aria-label="Back"></button><button aria-label="Forward"></button>' +
        '<input aria-label="Find or Create Page">';
    parent.replaceChildren(replacement);
    await settleMutations();

    assert.equal(topbar.getPerformanceSnapshot().attachCount, initial + 1);
    assert.ok(replacement.querySelector('#roam-logbook-topbar'));

    await settleMutations();
    assert.equal(
        topbar.getPerformanceSnapshot().attachCount,
        initial + 1,
        're-attaching into the replacement host does not create an attach loop'
    );
    topbar.unmount();
});

test('the one-second tick updates existing DOM handles without a graph read or replacement', async () => {
    let tick;
    const started = new Date('2026-08-15T09:00:00');
    const graph = installGraph([
        TASK,
        { uid: 'perf-drawer', string: 'LOGBOOK::', parent: TASK.uid },
        { uid: 'perf-clock', string: 'CLOCK:: [2026-08-15 Sat 09:00]', parent: 'perf-drawer' },
    ]);
    clock.refresh();
    const topbar = createTopbar({
        onOpenDashboard: () => {},
        now: () => new Date(started.getTime() + 61_000),
        setIntervalFn: callback => {
            tick = callback;
            return 'ticker';
        },
        clearIntervalFn: () => {},
    });
    topbar.mount();
    const button = document.querySelector('#roam-logbook-topbar button');
    const children = [...button.children];
    let queries = 0;
    const originalQuery = graph.api.data.q;
    graph.api.data.q = (...args) => {
        queries += 1;
        return originalQuery(...args);
    };

    tick();

    assert.equal(queries, 0);
    assert.deepEqual([...button.children], children);
    assert.equal(button.querySelector('.rlb-topbar__time').textContent, '1:01');
    assert.equal(button.querySelector('.rlb-topbar__parallel').textContent, '1 Thread');
    topbar.unmount();
});

test('opening the dashboard consumes one entries snapshot for clock state and rendering', () => {
    const graph = installGraph([
        TASK,
        { uid: 'perf-drawer', string: 'LOGBOOK::', parent: TASK.uid },
        {
            uid: 'perf-clock',
            string: 'CLOCK:: [2026-08-15 Sat 09:00]--[2026-08-15 Sat 10:00] => 1:00',
            parent: 'perf-drawer',
        },
    ]);
    let entryQueries = 0;
    const originalQuery = graph.api.data.q;
    graph.api.data.q = (...args) => {
        const result = originalQuery(...args);
        if (String(args[0]).includes(':in $ [?drawer-string ...]')) entryQueries += 1;
        return result;
    };
    const dashboard = createDashboard({
        now: () => new Date('2026-08-15T12:00:00'),
        setIntervalFn: () => 'dashboard-ticker',
        clearIntervalFn: () => {},
    });

    dashboard.open();

    assert.equal(entryQueries, 1);
    dashboard.destroy();
});

test('Activity running totals update from the cached snapshot without replacing the chart or querying Roam', async () => {
    let nowMs = new Date('2026-08-15T09:00:00').getTime();
    let tick;
    const graph = installGraph([
        TASK,
        { uid: 'activity-live-drawer', string: 'LOGBOOK::', parent: TASK.uid },
        { uid: 'activity-live-clock', string: 'CLOCK:: [2026-08-15 Sat 09:00]', parent: 'activity-live-drawer' },
    ]);
    let queryCount = 0;
    const query = graph.api.data.q;
    graph.api.data.q = (...args) => {
        queryCount += 1;
        return query(...args);
    };
    clock.refresh();
    const dashboard = createDashboard({
        now: () => new Date(nowMs),
        setIntervalFn: callback => {
            tick = callback;
            return 'activity-ticker';
        },
        clearIntervalFn: () => {},
    });

    dashboard.open();
    const readsAfterOpen = queryCount;
    const chart = document.querySelector('.rlb-activity__chart');
    const bucket = chart.querySelector('[data-activity-bucket="2026-08-15"]');
    assert.equal(bucket.dataset.activityDuration, '');

    nowMs += 61_000;
    tick();
    assert.equal(queryCount, readsAfterOpen);
    assert.strictEqual(document.querySelector('.rlb-activity__chart'), chart);
    assert.equal(bucket.dataset.activityDuration, '1m');
    assert.match(bucket.getAttribute('aria-label'), /1m.*1 Session/);

    dashboard.destroy();
});

test('Today Activity splits a running Session across local hours without another graph read', () => {
    let nowMs = new Date('2026-08-15T10:00:00').getTime();
    let tick;
    const graph = installGraph([
        TASK,
        { uid: 'activity-hourly-drawer', string: 'LOGBOOK::', parent: TASK.uid },
        {
            uid: 'activity-hourly-clock',
            string: 'CLOCK:: [2026-08-15 Sat 09:30]',
            parent: 'activity-hourly-drawer',
        },
    ]);
    let queryCount = 0;
    const query = graph.api.data.q;
    graph.api.data.q = (...args) => {
        queryCount += 1;
        return query(...args);
    };
    clock.refresh();
    const dashboard = createDashboard({
        now: () => new Date(nowMs),
        setIntervalFn: callback => {
            tick = callback;
            return 'hourly-activity-ticker';
        },
        clearIntervalFn: () => {},
    });

    dashboard.open();
    const range = document.querySelector('.rlb-header select');
    range.value = 'today';
    range.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    const readsAfterRange = queryCount;
    const chart = document.querySelector('.rlb-activity__chart');
    const hourNine = chart.querySelector('[data-activity-bucket="2026-08-15T09"]');
    const hourTen = chart.querySelector('[data-activity-bucket="2026-08-15T10"]');
    assert.equal(chart.dataset.activityBucketCount, '24');
    assert.equal(hourNine.dataset.activityDuration, '30m');
    assert.equal(hourTen.dataset.activityDuration, '');

    nowMs += 61_000;
    tick();

    assert.equal(queryCount, readsAfterRange);
    assert.equal(document.querySelector('.rlb-activity__chart'), chart);
    assert.equal(hourNine.dataset.activityDuration, '30m');
    assert.equal(hourTen.dataset.activityDuration, '1m');
    // The Session started in hour nine, so hour ten carries its minutes without
    // being announced as a second Session.
    assert.match(hourTen.getAttribute('aria-label'), /1m.*continued from an earlier Session/);
    assert.match(hourNine.getAttribute('aria-label'), /30m.*1 Session/);

    dashboard.destroy();
});

test('1000 and 10000 CLOCK snapshots keep graph query count fixed and render linearly', () => {
    const queryCounts = [];
    const durations = [];
    for (const count of [1000, 10000]) {
        const blocks = [
            TASK,
            { uid: 'perf-large-drawer', string: 'LOGBOOK::', parent: TASK.uid },
        ];
        for (let index = 0; index < count; index += 1) {
            const minute = String(index % 60).padStart(2, '0');
            blocks.push({
                uid: `perf-large-${index}`,
                string: `CLOCK:: [2026-08-15 Sat 09:${minute}]--[2026-08-15 Sat 10:${minute}] => 1:00`,
                parent: 'perf-large-drawer',
            });
        }
        const graph = installGraph(blocks);
        let queries = 0;
        const originalQuery = graph.api.data.q;
        graph.api.data.q = (...args) => {
            queries += 1;
            return originalQuery(...args);
        };
        const before = performance.now();
        const snapshot = readDashboardSnapshot();
        const model = buildDashboard(snapshot.entries, {
            now: new Date('2026-08-15T12:00:00'),
            rangeId: 'all',
            hierarchy: snapshot.hierarchy,
        });
        durations.push(performance.now() - before);
        queryCounts.push(queries);
        assert.equal(snapshot.entries.length, count);
        assert.equal(model.totalMinutes, count * 60);
    }

    assert.deepEqual(queryCounts, [3, 3], 'entries, mirrors, and parents stay batched');
    assert.ok(durations[1] < durations[0] * 30 + 2000, JSON.stringify(durations));
});
