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
    const fixedNow = new Date('2026-08-19T10:00:00');
    let tick;
    const topbar = createTopbar({
        onOpenDashboard: () => {},
        now: () => fixedNow,
        setIntervalFn: callback => {
            tick = callback;
            return 1;
        },
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

    const trigger = document.querySelector('#roam-logbook-topbar button');
    trigger.click();
    const popover = document.querySelector('body > .rlb-popover');
    assert.ok(popover);
    const todaySwitch = popover.querySelector('[data-view="today"]');
    assert.equal(todaySwitch.textContent, 'Today · …');
    const beforeTodayRead = graph.fastQueryCount();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(graph.fastQueryCount() >= beforeTodayRead, 'post-paint Today load may read the page');

    popover.querySelector('[data-view="today"]').click();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(document.querySelector('body > .rlb-popover'), popover);
    assert.equal(popover.querySelector('[data-view="today"]').getAttribute('aria-pressed'), 'true');
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

    const refresh = popover.querySelector('[data-action="refresh"]');
    refresh.click();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(graph.fastQueryCount() > afterTodayRead, 'Refresh reloads the Today page');
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
    popover.querySelector('[data-action="refresh"]').click();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.deepEqual(
        [...popover.querySelectorAll('.rlb-today__row')].map(row => row.dataset.taskUid),
        rowsBeforeFailure
    );
    assert.match(popover.textContent, /last saved view/);
    graph.api.data.q = originalQuery;

    const readsBeforeCachedSwitch = graph.fastQueryCount();
    popover.querySelector('[data-view="threads"]').click();
    popover.querySelector('[data-view="today"]').click();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(graph.fastQueryCount(), readsBeforeCachedSwitch);
});
