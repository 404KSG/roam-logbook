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
const paused = await import('../src/paused.js');

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
const topbarButton = () => document.querySelector('#roam-logbook-topbar button');
const topbarWidget = () => document.getElementById('roam-logbook-topbar');
const openPopover = () => {
    click(topbarButton());
    return document.querySelector('body > .rlb-popover');
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

    assert.equal(row.querySelectorAll('.rlb-run__meta-line').length, 2);
    assert.match(
        row.querySelector('.rlb-run__meta-primary').textContent,
        /^\d+:\d{2} · \d+m total$/
    );
    assert.doesNotMatch(row.textContent, /target|Pomodoro/i);
    assert.match(
        row.querySelector('.rlb-run__started').textContent,
        /^(Today|[A-Z][a-z]{2} \d{1,2}) \d{2}:\d{2}$/
    );
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

test('topbar uses one shared cycle across parallel Sessions and ignores Roam sync indicator color', async t => {
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
    assert.ok(topbarButton().querySelector('.rlb-topbar__time--overrun'));
    await clock.clockIn('popover-task-02', { now: secondStart });
    assert.equal(topbarButton().querySelector('.rlb-topbar__time').textContent, '31:00');
    assert.ok(topbarButton().querySelector('.rlb-topbar__time--overrun'));
    assert.equal(document.querySelector('.rm-sync-indicator').style.color, 'rgb(220, 50, 50)');

    await clock.clockOut(clock.getRunning()[0].clockUid, { now: new Date('2026-08-15T09:31:00') });
    assert.equal(clock.getRunning().length, 1);
    assert.equal(topbarButton().querySelector('.rlb-topbar__time').textContent, '31:00');
    await clock.clockOut(clock.getRunning()[0].clockUid, { now: new Date('2026-08-15T09:31:00') });
    assert.equal(clock.getRunning().length, 0);
    assert.equal(pomodoro.getCycle(), null);
});

test('Session surfaces keep Refresh copy hidden while preserving accessible state feedback', async t => {
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
    const refresh = popover.querySelector('.rlb-popover__footer [data-action="refresh"]');
    const checkout = popover.querySelector('[data-action="clock-out"]');

    assert.ok(refresh, 'Refresh belongs in the surface footer');
    assert.equal(popover.querySelectorAll('[data-action="refresh"]').length, 1);
    assert.equal(popover.querySelector('.rlb-surface__header [data-action="refresh"]'), null);
    assert.equal(refresh.title, 'Refresh Sessions from graph');
    assert.equal(refresh.getAttribute('aria-label'), 'Refresh Sessions from graph');
    assert.ok(refresh.classList.contains('bp3-icon-refresh'));
    assert.equal(refresh.closest('.rlb-surface__refresh-cell').dataset.refreshState, 'idle');
    const live = popover.querySelector('.rlb-surface__refresh-status');
    assert.equal(live.getAttribute('role'), 'status');
    assert.equal(live.getAttribute('aria-live'), 'polite');
    assert.equal(live.getAttribute('aria-atomic'), 'true');
    assert.ok(live.classList.contains('rlb-visually-hidden'));
    assert.deepEqual(
        [...popover.querySelectorAll('.rlb-popover__footer button')].map(node => node.textContent),
        ['Dashboard', 'Pause All', 'Clock Out All', '']
    );
    assert.equal(checkout.textContent, '');
    assert.ok(checkout.classList.contains('bp3-icon-log-out'));
    assert.equal(checkout.title, 'Check Out');
    assert.equal(checkout.getAttribute('aria-label'), 'Check Out');

    click(refresh);
    const loading = popover.querySelector('.rlb-popover__footer [data-action="refresh"]');
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
    await settle();
    assert.equal(popover.parentElement, document.body);
    assert.equal(popover.querySelectorAll('[data-action="refresh"]').length, 1);
    const success = popover.querySelector('.rlb-popover__footer [data-action="refresh"]');
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
    const idle = popover.querySelector('.rlb-popover__footer [data-action="refresh"]');
    assert.equal(idle.closest('.rlb-surface__refresh-cell').dataset.refreshState, 'idle');
    assert.equal(
        idle.closest('.rlb-surface__refresh-cell').querySelector('.rlb-surface__refresh-status').textContent,
        ''
    );

});

test('Refresh rereads an external graph Session without closing the popover', async t => {
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
    await settle();

    assert.equal(document.querySelector('body > .rlb-popover'), popover);
    assert.equal(popover.querySelectorAll('.rlb-run').length, 2);
    assert.equal(popover.querySelector('.rlb-popover__title').textContent, '2 Sessions Running');
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
        await settle();
        assert.equal(reads, 1);
        assert.equal(notifications, 0, 'explicit Refresh suppresses the subscriber rerender path');
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
        await settle();
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
});

test('Refresh does not mutate CLOCK data, the shared Pomodoro cycle, or pause state', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });
    const popover = openPopover();
    const cycleBefore = pomodoro.getCycle();
    const pausedBefore = paused.getPaused();
    const clockStringsBefore = [...graph.store.values()]
        .filter(block => String(block.string).startsWith('CLOCK::'))
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
    assert.deepEqual(paused.getPaused(), pausedBefore);
    assert.deepEqual(
        [...graph.store.values()]
            .filter(block => String(block.string).startsWith('CLOCK::'))
            .map(block => [block.uid, block.string]),
        clockStringsBefore
    );
});

test('shared Session surfaces use one compact accessible list group for session rows', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    settingsStore.set('allowMultipleClocks', true);
    graph.store.set('popover-task-02', {
        uid: 'popover-task-02',
        string: '{{[[TODO]]}} A second task',
        parent: null,
        page: 'Project Page',
    });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-task-02', { now: new Date('2026-08-15T09:00:00') });

    const surface = openPopover();
    const list = surface.querySelector('.rlb-surface__list');
    assert.ok(list, 'session rows are grouped in a shared surface list');
    assert.equal(surface.querySelectorAll('.rlb-surface__list').length, 1);
    assert.equal(list.getAttribute('role'), 'group');
    assert.equal(list.getAttribute('aria-label'), 'Current Sessions');
    const rows = [...list.querySelectorAll('.rlb-run')];
    assert.equal(rows.length, 2);
    assert.ok(
        rows.every(
            row =>
                row.querySelector('.rlb-run__status') &&
                row.querySelector('.rlb-run__title') &&
                row.querySelector('.rlb-run__meta') &&
                row.querySelector('.rlb-run__actions')
        )
    );
    assert.equal(surface.querySelectorAll('.bp3-card.rlb-run').length, 0);
});

test('Check Out icon ends only its clicked Session in single and parallel mode', async t => {
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
    assert.ok(rows.every(row => row.querySelector('[data-action="clock-out"]')?.title === 'Check Out'));
    const retainedUid = clock.getRunning()[1].clockUid;
    click(rows[0].querySelector('[data-action="clock-out"]'));
    await settle();
    assert.equal(clock.getRunning().length, 1);
    assert.equal(clock.getRunning()[0].clockUid, retainedUid);
});

test('paused rows expose an icon-only Resume action and restore only the clicked Session', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    settingsStore.set('allowMultipleClocks', true);
    graph.store.set('popover-task-02', {
        uid: 'popover-task-02',
        string: '{{[[TODO]]}} A second paused task',
        parent: null,
        page: 'Project Page',
    });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-task-02', { now: new Date('2026-08-15T09:00:00') });

    const surface = openPopover();
    const pause = [...surface.querySelectorAll('.rlb-popover__footer button')].find(
        node => node.textContent === 'Pause All'
    );
    click(pause);
    await settle();

    const pausedRows = [...surface.querySelectorAll('[data-session-state="paused"]')];
    assert.equal(pausedRows.length, 2);
    assert.ok(pausedRows.every(row => row.querySelector('[data-action="resume"]')));
    assert.ok(
        pausedRows.every(row => {
            const resume = row.querySelector('[data-action="resume"]');
            return resume.textContent === '' && resume.classList.contains('bp3-icon-play') && resume.title === 'Resume' && resume.getAttribute('aria-label') === 'Resume';
        })
    );
    assert.ok(pausedRows.every(row => !row.querySelector('.rlb-run__state')));
    assert.ok(pausedRows.every(row => !/\bPaused\b/.test(row.textContent)));

    const firstTaskUid = pausedRows[0].dataset.taskUid;
    click(pausedRows[0].querySelector('[data-action="resume"]'));
    await settle();
    assert.equal(clock.getRunning().length, 1);
    assert.equal(clock.getRunning()[0].taskUid, firstTaskUid);
    assert.equal(surface.querySelectorAll('[data-session-state="paused"]').length, 1);
    assert.ok(surface.querySelector('[data-session-state="paused"] [data-action="resume"]'));

    click(surface.querySelector('[data-session-state="paused"] [data-action="resume"]'));
    await settle();
    assert.equal(clock.getRunning().length, 2);
    assert.equal(surface.querySelectorAll('[data-session-state="paused"]').length, 0);
    assert.ok([...surface.querySelectorAll('.rlb-popover__footer button')].some(node => node.textContent === 'Pause All'));
    assert.equal([...surface.querySelectorAll('.rlb-popover__footer button')].some(node => node.textContent === 'Resume All'), false);
});

test('paused topbar keeps its clock identity while visibly distinguishing paused state from idle', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    const idleButton = topbarButton();
    assert.equal(idleButton.classList.contains('rlb-topbar__button--paused'), false);
    assert.equal(idleButton.querySelector('.rlb-topbar__pause-badge'), null);

    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });
    const surface = openPopover();
    click([...surface.querySelectorAll('.rlb-popover__footer button')].find(node => node.textContent === 'Pause All'));
    await settle();

    const pausedButton = topbarButton();
    assert.ok(pausedButton.classList.contains('rlb-topbar__button--icon-only'));
    assert.ok(pausedButton.classList.contains('rlb-topbar__button--paused'));
    assert.ok(pausedButton.querySelector('.bp3-icon-history'), 'paused state keeps the clock identity');
    assert.equal(pausedButton.querySelector('.rlb-topbar__pause-badge'), null);
    assert.match(pausedButton.getAttribute('aria-label'), /1 Session Paused/i);
    assert.equal(pausedButton.textContent, '');
});

test('individual Resume is idempotent under double click and retains the paused row after a write failure', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    settingsStore.set('allowMultipleClocks', true);
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });
    const surface = openPopover();
    click([...surface.querySelectorAll('.rlb-popover__footer button')].find(node => node.textContent === 'Pause All'));
    await settle();

    const row = surface.querySelector('[data-session-state="paused"]');
    const resume = row.querySelector('[data-action="resume"]');
    click(resume);
    click(resume);
    await settle();
    assert.equal(clock.getRunning().length, 1, 'double click does not create two running CLOCKs');
    assert.equal(surface.querySelectorAll('[data-session-state="paused"]').length, 0);

    await clock.clockOut(clock.getRunning()[0].clockUid);
    await settle();
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:01:00') });
    await settle();
    click([...surface.querySelectorAll('.rlb-popover__footer button')].find(node => node.textContent === 'Pause All'));
    await settle();
    const retryRow = surface.querySelector('[data-session-state="paused"]');
    const originalCreate = graph.api.data.block.create;
    graph.api.data.block.create = async () => {
        throw new Error('individual resume write failed');
    };
    try {
        click(retryRow.querySelector('[data-action="resume"]'));
        await settle();
    } finally {
        graph.api.data.block.create = originalCreate;
    }
    assert.equal(clock.getRunning().length, 0);
    assert.ok(surface.querySelector('[data-session-state="paused"] [data-action="resume"]'));
    assert.match(surface.textContent, /individual resume write failed/i);
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
    const nativeCalls = [];
    window.roamAlphaAPI.ui.rightSidebar = {
        open: () => nativeCalls.push({ action: 'open' }),
        addWindow: async spec => nativeCalls.push({ action: 'addWindow', spec }),
    };
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });

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

test('external clock activity during a pause is not duplicated by individual Resume', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    settingsStore.set('allowMultipleClocks', true);
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });
    const surface = openPopover();
    click([...surface.querySelectorAll('.rlb-popover__footer button')].find(node => node.textContent === 'Pause All'));
    await settle();

    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:01:00') });
    await clock.clockOut(clock.getRunning()[0].clockUid, { now: new Date('2026-08-15T09:02:00') });
    await settle();
    const resume = surface.querySelector('[data-session-state="paused"] [data-action="resume"]');
    click(resume);
    await settle();
    assert.equal(clock.getRunning().length, 0);
    assert.equal(surface.querySelector('[data-session-state="paused"]'), null);
    assert.match(surface.textContent, /already clocked out|not reopened|reconciled/i);
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

test('topbar does not present a confirmed empty state when graph refresh fails', () => {
    clock.reset();
    const originalQuery = graph.api.data.q;
    graph.api.data.q = () => {
        throw new Error('graph refresh unavailable');
    };

    const popover = openPopover();
    assert.doesNotMatch(popover.textContent, /No Session is running/);
    assert.match(popover.textContent, /Graph state could not be confirmed/i);

    graph.api.data.q = originalQuery;
});

test('topbar shows a running Session for a confirmed open CLOCK', () => {
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
    assert.match(popover.querySelector('.rlb-popover__title').textContent, /1 Session Running/);
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
        '1 Session Running'
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
    const focusables = () => [...popover.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])')];
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
    const dashboardButton = [...document.querySelectorAll('.rlb-popover__footer button')].find(
        node => node.textContent === 'Dashboard'
    );
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
    const topbarElapsed = topbarWidget().textContent.trim();

    paletteCommands.get('Logbook: Open dashboard')();
    const dashboardElapsed = document.querySelector('[data-running-elapsed="true"]').textContent;
    assert.equal(dashboardElapsed, topbarElapsed);
});
