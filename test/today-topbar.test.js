import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import { installGraph, uninstallGraph } from './helpers/graph-stub.js';

test('Today is lazy/cacheable, stays in the popover, and the ticker never reads the graph', async t => {
    const dom = new JSDOM('<!doctype html><html><body><div class="rm-topbar"></div></body></html>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.MutationObserver = dom.window.MutationObserver;
    globalThis.HTMLElement = dom.window.HTMLElement;
    const graph = installGraph([
        {
            uid: 'daily-root',
            page: 'August 19th, 2026',
            parent: null,
            order: 0,
            string: '{{[[TODO]]}} Today project',
        },
        {
            uid: 'daily-child',
            page: 'August 19th, 2026',
            parent: 'daily-root',
            order: 0,
            string: '{{[[TODO]]}} Today child',
        },
    ]);
    const clock = await import('../src/clock.js');
    const { createTopbar } = await import('../src/topbar.js');
    clock.reset();
    let fixedNow = new Date('2026-08-19T10:00:00');
    let tick;
    const intervalDelays = [];
    const topbar = createTopbar({
        onOpenDashboard: () => {},
        now: () => fixedNow,
        setIntervalFn: (callback, delay) => {
            tick = callback;
            intervalDelays.push(delay);
            return 1;
        },
        clearIntervalFn: () => {},
    });
    topbar.mount();
    assert.deepEqual(intervalDelays, [1000], 'Today adds no polling interval beyond the existing ticker');
    t.after(() => {
        topbar.unmount();
        clock.reset();
        uninstallGraph();
        dom.window.close();
        delete globalThis.document;
        delete globalThis.window;
        delete globalThis.MutationObserver;
        delete globalThis.HTMLElement;
    });

    const trigger = document.querySelector('#roam-logbook-topbar button');
    trigger.click();
    const popover = document.querySelector('body > .rlb-popover');
    assert.ok(popover);
    const todaySwitch = popover.querySelector('[data-view="today"]');
    assert.equal(todaySwitch.textContent.trim(), 'Today');
    assert.equal(todaySwitch.getAttribute('aria-busy'), 'true');
    assert.equal(todaySwitch.getAttribute('aria-label'), 'Show Today tasks, updating');
    assert.ok(todaySwitch.querySelector('.rlb-surface__spinner'));
    assert.equal(popover.querySelector('[data-action="refresh"]'), null);
    const beforeTodayRead = graph.fastQueryCount();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(graph.fastQueryCount() >= beforeTodayRead, 'post-paint Today load may read the page');

    popover.querySelector('[data-view="today"]').click();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(document.querySelector('body > .rlb-popover'), popover);
    assert.equal(popover.querySelector('[data-view="today"]').getAttribute('aria-pressed'), 'true');
    assert.equal(popover.querySelector('[data-view="today"]').textContent, 'Today 2');
    assert.equal(popover.querySelector('[data-view="today"]').getAttribute('aria-busy'), null);
    assert.equal(popover.querySelectorAll('.rlb-today__row').length, 1);
    assert.equal(popover.querySelector('.rlb-today__hidden-count'), null);

    let toggle = popover.querySelector('[data-action="today-toggle-all"]');
    assert.equal(popover.querySelectorAll('[data-action="today-toggle-all"]').length, 1);
    assert.equal(toggle.title, 'Expand all Today tasks');
    assert.equal(toggle.getAttribute('aria-label'), 'Expand all Today tasks');
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.ok(toggle.classList.contains('bp3-icon-expand-all'));
    toggle.click();
    assert.equal(popover.querySelectorAll('.rlb-today__row').length, 2);
    toggle = popover.querySelector('[data-action="today-toggle-all"]');
    assert.equal(toggle.title, 'Collapse all Today tasks');
    assert.equal(toggle.getAttribute('aria-label'), 'Collapse all Today tasks');
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.ok(toggle.classList.contains('bp3-icon-collapse-all'));
    toggle.click();
    assert.equal(popover.querySelectorAll('.rlb-today__row').length, 1);
    toggle = popover.querySelector('[data-action="today-toggle-all"]');
    assert.equal(toggle.title, 'Expand all Today tasks');
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');

    popover.querySelector('[data-action="today-play"]').click();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(document.querySelector('body > .rlb-popover'), popover, 'Play keeps the task pool open');
    assert.ok(popover.querySelector('[data-task-uid="daily-root"] .rlb-today__timing'));
    assert.equal(popover.querySelector('[data-task-uid="daily-root"] [data-action="today-play"]'), null);

    const afterTodayRead = graph.fastQueryCount();
    tick();
    assert.equal(graph.fastQueryCount(), afterTodayRead, 'one-second ticker uses cached Active Work only');

    fixedNow = new Date('2026-08-19T10:00:30.001');
    popover.querySelector('[data-view="threads"]').click();
    popover.querySelector('[data-view="today"]').click();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(graph.fastQueryCount() > afterTodayRead, 'stale Today entry reloads the page');
    const rowsBeforeFailure = [...popover.querySelectorAll('.rlb-today__row')].map(
        row => row.dataset.taskUid
    );

    const originalQuery = graph.api.data.q;
    graph.api.data.q = (datalog, ...args) => {
        if (datalog.includes(':find ?page-uid ?uid ?string ?order ?parent-uid')) {
            throw new Error('Today refresh failed');
        }
        return originalQuery(datalog, ...args);
    };
    fixedNow = new Date('2026-08-19T10:01:00.002');
    popover.querySelector('[data-view="threads"]').click();
    popover.querySelector('[data-view="today"]').click();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.deepEqual(
        [...popover.querySelectorAll('.rlb-today__row')].map(row => row.dataset.taskUid),
        rowsBeforeFailure
    );
    const retry = popover.querySelector('[data-action="retry"]');
    assert.equal(retry.closest('.rlb-surface__inline-status').textContent, 'Couldn’t update · Retry');
    assert.equal(retry.closest('.rlb-surface__inline-status').getAttribute('role'), 'alert');
    graph.api.data.q = originalQuery;

    const readsBeforeRetry = graph.fastQueryCount();
    retry.click();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(graph.fastQueryCount() > readsBeforeRetry, 'Retry uses the existing refresh path');
    assert.equal(popover.querySelector('[data-action="retry"]'), null);
    assert.equal(popover.querySelector('[data-action="refresh"]'), null);

    const readsBeforeCachedSwitch = graph.fastQueryCount();
    popover.querySelector('[data-view="threads"]').click();
    popover.querySelector('[data-view="today"]').click();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(graph.fastQueryCount(), readsBeforeCachedSwitch);
    assert.deepEqual(intervalDelays, [1000], 'view switches and retries add no polling interval');
});

test('a failed first Today read shows compact Retry and recovers without a header refresh', async t => {
    const dom = new JSDOM('<!doctype html><html><body><div class="rm-topbar"></div></body></html>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.MutationObserver = dom.window.MutationObserver;
    globalThis.HTMLElement = dom.window.HTMLElement;
    const graph = installGraph([]);
    const originalQuery = graph.api.data.q;
    graph.api.data.q = (datalog, ...args) => {
        if (String(datalog).includes(':find ?page-uid ?uid ?string ?order ?parent-uid')) {
            throw new Error('Today unavailable');
        }
        return originalQuery(datalog, ...args);
    };
    const clock = await import('../src/clock.js');
    const { createTopbar } = await import('../src/topbar.js');
    clock.reset();
    const topbar = createTopbar({
        now: () => new Date('2026-08-19T10:00:00'),
        setIntervalFn: () => 1,
        clearIntervalFn: () => {},
    });
    topbar.mount();
    t.after(() => {
        graph.api.data.q = originalQuery;
        topbar.unmount();
        clock.reset();
        uninstallGraph();
        dom.window.close();
        delete globalThis.document;
        delete globalThis.window;
        delete globalThis.MutationObserver;
        delete globalThis.HTMLElement;
    });

    document.querySelector('#roam-logbook-topbar button').click();
    const popover = document.querySelector('body > .rlb-popover');
    await new Promise(resolve => setTimeout(resolve, 10));
    popover.querySelector('[data-view="today"]').click();
    await new Promise(resolve => setTimeout(resolve, 5));

    const status = popover.querySelector('.rlb-surface__inline-status');
    assert.equal(status.textContent, 'Couldn’t read Today · Retry');
    assert.equal(status.getAttribute('role'), 'alert');
    assert.equal(popover.querySelector('[data-view="today"]').textContent, 'Today !');
    assert.equal(
        popover.querySelector('[data-view="today"]').getAttribute('aria-label'),
        'Show Today tasks, update failed'
    );
    assert.equal(popover.querySelector('.rlb-popover__empty'), null);
    assert.equal(popover.querySelector('[data-action="refresh"]'), null);

    graph.api.data.q = originalQuery;
    status.querySelector('[data-action="retry"]').click();
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(popover.querySelector('.rlb-surface__inline-status'), null);
    assert.match(popover.textContent, /No unfinished TODOs today/);
});

test('entering Today revalidates only when its successful snapshot is older than 30 seconds', async t => {
    const dom = new JSDOM('<!doctype html><html><body><div class="rm-topbar"></div></body></html>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.MutationObserver = dom.window.MutationObserver;
    globalThis.HTMLElement = dom.window.HTMLElement;
    const graph = installGraph([
        {
            uid: 'freshness-root',
            page: 'August 19th, 2026',
            parent: null,
            order: 0,
            string: '{{[[TODO]]}} Fresh task',
        },
    ]);
    const clock = await import('../src/clock.js');
    const { createTopbar } = await import('../src/topbar.js');
    clock.reset();
    let currentNow = new Date('2026-08-19T10:00:00.000');
    const topbar = createTopbar({
        now: () => currentNow,
        setIntervalFn: () => 1,
        clearIntervalFn: () => {},
    });
    topbar.mount();
    t.after(() => {
        topbar.unmount();
        clock.reset();
        uninstallGraph();
        dom.window.close();
        delete globalThis.document;
        delete globalThis.window;
        delete globalThis.MutationObserver;
        delete globalThis.HTMLElement;
    });

    document.querySelector('#roam-logbook-topbar button').click();
    const popover = document.querySelector('body > .rlb-popover');
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(popover.querySelector('[data-view="today"]').textContent, 'Today 1');

    currentNow = new Date('2026-08-19T10:00:30.000');
    const atBoundary = graph.fastQueryCount();
    popover.querySelector('[data-view="today"]').click();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(graph.fastQueryCount(), atBoundary, 'exactly 30 seconds remains fresh');

    popover.querySelector('[data-view="threads"]').click();
    currentNow = new Date('2026-08-19T10:00:30.001');
    const pastBoundary = graph.fastQueryCount();
    popover.querySelector('[data-view="today"]').click();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(graph.fastQueryCount() > pastBoundary, 'older than 30 seconds revalidates');
});

test('reopening during an in-flight Active Work refresh starts a fresh Today lifecycle', async t => {
    const dom = new JSDOM('<!doctype html><html><body><div class="rm-topbar"></div></body></html>');
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.MutationObserver = dom.window.MutationObserver;
    globalThis.HTMLElement = dom.window.HTMLElement;
    const graph = installGraph([
        {
            uid: 'reopen-root',
            page: 'August 19th, 2026',
            parent: null,
            order: 0,
            string: '{{[[TODO]]}} Reopen task',
        },
    ]);
    const originalQuery = graph.api.data.q;
    let todayReads = 0;
    graph.api.data.q = (datalog, ...args) => {
        if (String(datalog).includes(':find ?page-uid ?uid ?string ?order ?parent-uid')) {
            todayReads += 1;
        }
        return originalQuery(datalog, ...args);
    };
    const clock = await import('../src/clock.js');
    const { createTopbar } = await import('../src/topbar.js');
    clock.reset();
    const scheduled = [];
    const topbar = createTopbar({
        now: () => new Date('2026-08-19T10:00:00'),
        setIntervalFn: () => 1,
        clearIntervalFn: () => {},
        scheduleAfterPaintFn: callback => {
            scheduled.push(callback);
            return () => {
                const index = scheduled.indexOf(callback);
                if (index >= 0) scheduled.splice(index, 1);
            };
        },
    });
    topbar.mount();
    t.after(() => {
        graph.api.data.q = originalQuery;
        topbar.unmount();
        clock.reset();
        uninstallGraph();
        dom.window.close();
        delete globalThis.document;
        delete globalThis.window;
        delete globalThis.MutationObserver;
        delete globalThis.HTMLElement;
    });

    const trigger = document.querySelector('#roam-logbook-topbar button');
    trigger.click();
    assert.equal(scheduled.length, 1, 'the first open schedules post-paint revalidation');
    scheduled.shift()();

    trigger.click();
    assert.equal(document.querySelector('body > .rlb-popover'), null);
    trigger.click();
    assert.equal(
        scheduled.length,
        1,
        'a reopened popover schedules Today even while Active Work refresh is coalesced'
    );
    scheduled.shift()();

    await new Promise(resolve => setTimeout(resolve, 10));
    const popover = document.querySelector('body > .rlb-popover');
    assert.equal(popover.querySelector('[data-view="today"]').textContent, 'Today 1');
    assert.equal(popover.querySelector('.rlb-surface__spinner'), null);
    assert.ok(todayReads >= 1, 'the reopened lifecycle performs a Today read');
});
