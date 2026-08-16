/**
 * End-to-end smoke test of the extension lifecycle against jsdom.
 *
 * The unit tests cover the pure layers; this one exists to catch the mistakes
 * they cannot see — a mount path that throws, a widget that never attaches, a
 * command that references something undefined, state left behind on unload.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { installGraph } from './helpers/graph-stub.js';

const dom = new JSDOM('<!doctype html><html><body><div class="rm-topbar"></div></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.HTMLElement = dom.window.HTMLElement;

const TASK = { uid: 'taskone01', string: '{{[[TODO]]}} this is a test task', parent: null };

// installGraph hangs roamAlphaAPI off the jsdom window it finds.
const graph = installGraph([TASK]);
globalThis.window.roamAlphaAPI.ui.blockContextMenu = {
    addCommand: spec => contextCommands.set(spec.label, spec),
    removeCommand: ({ label }) => contextCommands.delete(label),
};

const contextCommands = new Map();
const paletteCommands = new Map();
const paletteCommandSpecs = new Map();
const settingsStore = new Map();
let settingsPanel = null;

const extensionAPI = {
    settings: {
        get: key => settingsStore.get(key),
        set: (key, value) => settingsStore.set(key, value),
        panel: { create: config => (settingsPanel = config) },
    },
    ui: {
        commandPalette: {
            addCommand: spec => {
                paletteCommands.set(spec.label, spec.callback);
                paletteCommandSpecs.set(spec.label, spec);
            },
            removeCommand: ({ label }) => {
                paletteCommands.delete(label);
                paletteCommandSpecs.delete(label);
            },
        },
    },
};

const extension = (await import('../src/extension.js')).default;
const clock = await import('../src/clock.js');
const pomodoro = await import('../src/pomodoro.js');
const { formatElapsed, formatStamp } = await import('../src/time.js');

const topbarWidget = () => document.getElementById('roam-logbook-topbar');
const dialog = () => document.getElementById('roam-logbook-dashboard');
const click = node => node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

test.before(() => {
    const stale = document.createElement('style');
    stale.id = 'roam-logbook-styles';
    stale.textContent = '.rlb-topbar__time { min-width: 4ch; }';
    document.head.appendChild(stale);
    extension.onload({ extensionAPI });
});
test.after(() => extension.onunload());

test('onload mounts the topbar widget and registers every command', () => {
    assert.ok(topbarWidget(), 'widget should be attached to .rm-topbar');
    assert.equal(topbarWidget().textContent, '', 'idle stays icon-only');
    assert.ok(topbarWidget().querySelector('.rlb-topbar__icon.bp3-icon-history'));
    assert.ok(
        topbarWidget().querySelector('button.rlb-topbar__button--icon-only'),
        'idle trigger exposes a stable icon-only hit target'
    );
    assert.equal(topbarWidget().querySelector('.bp3-icon-stopwatch'), null);
    assert.equal(topbarWidget().querySelector('.bp3-icon-timeline-events'), null);
    assert.equal(settingsPanel.tabTitle, 'Roam Logbook');
    assert.equal(paletteCommands.size, 5);
    assert.equal(paletteCommands.has('Logbook: Start pomodoro on current block'), false);
    assert.deepEqual(
        [...contextCommands.keys()],
        ['Logbook: Clock in', 'Logbook: Clock out']
    );
    const pomodoroSetting = settingsPanel.settings.find(setting => setting.id === 'pomodoroMinutes');
    assert.equal(pomodoroSetting.name, 'Pomodoro duration (minutes)');
    assert.equal(pomodoroSetting.action.type, 'input');
    assert.equal(pomodoroSetting.action.placeholder, '30');
    assert.equal(pomodoroSetting.action.defaultValue, '30');
});

test('stylesheet exposes the approved dashboard shell and minimal topbar contract', () => {
    const css = document.getElementById('roam-logbook-styles').textContent;
    assert.equal(document.querySelectorAll('#roam-logbook-styles').length, 1);
    assert.match(css, /width: min\(1120px, calc\(100vw - 48px\)\)/);
    assert.match(css, /max-height: min\(84vh, calc\(100vh - 48px\)\)/);
    assert.doesNotMatch(css, /height: min\(860px, calc\(100vh - 32px\)\)/);
    assert.match(css, /\.rlb-root\s*\{[^}]*position: fixed[^}]*inset: 0[^}]*overflow: hidden[^}]*overscroll-behavior: none/s);
    assert.match(css, /\.rlb-dialog\s*\{[^}]*display: flex[^}]*flex-direction: column[^}]*min-height: 0[^}]*overflow: hidden/s);
    assert.match(css, /\.rlb-body,\s*\.rlb-body__scroll\s*\{[^}]*min-height: 0[^}]*max-height: none[^}]*overflow-y: auto[^}]*overscroll-behavior: contain/s);
    assert.match(css, /--rlb-surface-link:\s*#316a9f/);
    assert.match(css, /--rlb-session-running:\s*#7eb794/);
    assert.doesNotMatch(css, /#2d72d2|rgba\(45, 114, 210/);
    assert.match(css, /\.bp3-button\.bp3-minimal\.rlb-run__title:hover[\s\S]*?text-decoration-color: currentColor/);
    assert.match(css, /\.rlb-dashboard \.rlb-header\.bp3-dialog-header\s*{[^}]*min-height: 48px[^}]*height: auto[^}]*overflow: visible[^}]*padding: 6px 14px 6px 16px/s);
    assert.match(css, /\.rlb-dashboard \.rlb-header__heading\s*{[^}]*overflow: visible/s);
    assert.match(css, /\.rlb-dashboard \.rlb-header__title\.bp3-heading\s*{[^}]*font-size: 17px[^}]*font-weight: 600[^}]*line-height: 1\.35[^}]*overflow: visible[^}]*white-space: normal/s);
    assert.match(css, /\.rlb-visually-hidden\s*{[^}]*position: absolute/s);
    assert.match(css, /\.rlb-overview\s*{/);
    assert.match(css, /\.rlb-overview--strip\s*{/);
    assert.match(css, /\.rlb-overview\s*{[^}]*height: 80px[^}]*border: 1px solid[^}]*border-radius: 8px/s);
    assert.match(css, /\.rlb-overview__item\s*{[^}]*padding: 9px 14px[^}]*border: 0[^}]*background: transparent/s);
    assert.match(css, /\.rlb-overview__item \+ \.rlb-overview__item\s*{[^}]*border-left: 1px solid/s);
    assert.match(css, /\.rlb-overview__label\s*{/);
    assert.match(css, /\.rlb-overview__value\s*{/);
    assert.match(css, /\.rlb-activity-rail\s*{[^}]*gap: 6px[^}]*height: 28px/s);
    assert.match(css, /\.rlb-activity__fill\s*{[^}]*width: min\(10px, 100%\)/s);
    assert.doesNotMatch(css, /\.rlb-stats\s*{/);
    assert.match(css, /\.rlb-body__scroll[^}]*overflow-y: auto/s);
    assert.match(css, /\.rlb-root[^}]*--rlb-surface:/s);
    assert.match(css, /\.bp3-dark \.rlb-root[^}]*--rlb-surface:/s);
    assert.match(css, /\.rlb-topbar__time[^}]*font-size: 14px/s);
    assert.match(css, /\.rlb-topbar__time[^}]*font-weight: 500/s);
    assert.match(css, /\.rlb-topbar__time[^}]*font-variant-numeric: tabular-nums/s);
    assert.match(css, /\.rlb-topbar__button--parallel[^}]*display: inline-grid[^}]*grid-template-columns: max-content 3px max-content[^}]*column-gap: 5px/s);
    assert.match(css, /\.rlb-topbar__button\.rlb-topbar__button--parallel > \.rlb-topbar__time,[^}]*flex: 0 0 auto[^}]*width: max-content[^}]*min-width: 0[^}]*max-width: none[^}]*margin: 0[^}]*padding: 0/s);
    const timeRule = css.match(/\.rlb-topbar__time\s*\{([^}]*)\}/)?.[1] ?? '';
    assert.doesNotMatch(timeRule, /min-width:/, 'elapsed text has no invisible width reservation');
    assert.match(css, /\.rlb-topbar__separator\s*{[^}]*width: 3px[^}]*height: 3px[^}]*border-radius: 50%[^}]*background: currentColor[^}]*justify-self: center/s);
    assert.match(css, /\.rlb-topbar__time--neutral[^}]*#5c7080/s);
    assert.match(css, /\.bp3-dark \.rlb-topbar__time--neutral[^}]*#a7b6c2/s);
    assert.match(css, /\.rlb-topbar__icon[^}]*color: #5c7080/s);
    assert.match(css, /\.bp3-dark \.rlb-topbar__icon[^}]*color: #a7b6c2/s);
    assert.match(css, /\.rlb-topbar__button--paused\s*{[^}]*background: transparent/s);
    assert.match(css, /\.rlb-topbar__button--paused > \.rlb-topbar__icon\s*{[^}]*color: #b7791f/s);
    assert.match(css, /\.rlb-topbar__parallel\s*{[^}]*color: #5c7080/s);
    assert.match(css, /\.rlb-topbar__separator\s*{[^}]*color: #5c7080/s);
    assert.match(css, /\.bp3-dark \.rlb-topbar__parallel,[^}]*color: #a7b6c2/s);
    for (const state of ['neutral', 'overrun', 'stale']) {
        assert.match(css, new RegExp(`\\.rlb-topbar__time--${state}\\s*{`));
    }
    assert.doesNotMatch(css, /\.rlb-topbar__button--running\s*{/);
    assert.doesNotMatch(css, /\.rlb-topbar__button--overrun\s*{/);
    assert.match(css, /\.rlb-surface__refresh-cell[^}]*grid-column: 2[^}]*grid-row: 2/s);
    assert.match(css, /\.rlb-surface__refresh-cell \.rlb-surface__refresh[^}]*min-width: var\(--rlb-surface-action-height\)[^}]*min-height: var\(--rlb-surface-action-height\)/s);
    assert.match(css, /\.rlb-popover__footer--empty\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) 40px[^}]*grid-template-rows: var\(--rlb-surface-action-height\)/s);
    assert.match(css, /\.rlb-popover__footer--empty \.rlb-surface__refresh-cell\s*\{[^}]*grid-column: 2[^}]*grid-row: 1[^}]*width: 40px/s);
    assert.match(css, /\.rlb-popover__footer--single-running\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\) 40px[^}]*grid-template-rows: var\(--rlb-surface-action-height\)/s);
    assert.match(css, /\.rlb-popover__footer--single-running \.rlb-surface__refresh-cell\s*\{[^}]*grid-column: 3[^}]*grid-row: 1[^}]*width: 40px/s);
    assert.match(css, /\.rlb-surface__refresh--loading::before[^}]*animation: rlb-surface-refresh-spin/s);
    assert.doesNotMatch(css, /\.rlb-surface__refresh-status[^}]*position: absolute/s);
});

test('clock commands leave shortcut selection to Roam Hotkeys', () => {
    for (const label of [
        'Logbook: Clock in current block',
        'Logbook: Clock out current block',
        'Logbook: Clock out all running clocks',
    ]) {
        const spec = paletteCommandSpecs.get(label);
        assert.ok(spec, `${label} should be registered`);
        assert.equal('default-hotkey' in spec, false);
        assert.equal('defaultHotkey' in spec, false);
    }
});

test('the context menu offers clock in on a TODO block only', () => {
    const clockIn = contextCommands.get('Logbook: Clock in');
    assert.equal(clockIn['display-conditional']({ 'block-uid': 'taskone01' }), true);

    graph.store.set('plain0001', { uid: 'plain0001', string: 'just a note', parent: null, order: 9 });
    assert.equal(clockIn['display-conditional']({ 'block-uid': 'plain0001' }), false);
});

test('clocking in shows only the primary live elapsed time in the topbar', async () => {
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': 'taskone01' });

    const drawer = graph.childrenOf('taskone01')[0];
    assert.equal(drawer.string, 'LOGBOOK::');
    assert.ok(graph.childrenOf(drawer.uid)[0].string.startsWith('CLOCK:: ['));
    const [running] = clock.getRunning();
    assert.equal(pomodoro.targetMinutes(running.clockUid), 30, 'Clock In assigns the global target');

    assert.match(topbarWidget().textContent.trim(), /^\d+:\d{2}(?::\d{2})?$/);
    assert.equal(topbarWidget().querySelector('.rlb-dot'), null);
    assert.equal(topbarWidget().querySelector('.bp3-icon'), null);
    assert.equal(topbarWidget().querySelector('.rlb-topbar__target'), null);
    assert.equal(topbarWidget().querySelector('.rlb-topbar__total'), null);
    assert.equal(topbarWidget().querySelector('.rlb-topbar__label'), null);
    assert.doesNotMatch(topbarWidget().textContent, /this is a test task|\/|·|clocks/);
    assert.ok(topbarWidget().querySelector('.rlb-topbar__time--neutral'));
    assert.match(topbarWidget().querySelector('button').title, /^1 Session Running\n/);
    assert.equal(
        topbarWidget().querySelector('button').getAttribute('aria-label'),
        topbarWidget().querySelector('button').title
    );
});

test('banked task time stays available in the tooltip, not the visible topbar', () => {
    // A closed session already banked against the same task.
    graph.store.set('drawerOld1', { uid: 'drawerOld1', string: 'LOGBOOK::', parent: 'taskone01', order: 0 });
    graph.store.set('clockOld01', {
        uid: 'clockOld01',
        string: 'CLOCK:: [2026-08-08 Sat 09:00]--[2026-08-08 Sat 11:00] => 2:00',
        parent: 'drawerOld1',
        order: 0,
    });
    clock.refresh();

    const [entry] = clock.getRunning();
    assert.equal(entry.priorMinutes, 120, 'banked time is derived on refresh, not queried per tick');
    assert.equal(topbarWidget().querySelector('.rlb-topbar__total'), null);
    assert.match(topbarWidget().querySelector('button').title, /2h 0\dm on this task in total/);
    assert.match(topbarWidget().textContent.trim(), /^\d+:\d{2}(?::\d{2})?$/);
});

test('the shared Pomodoro cycle stays overrun when a running CLOCK is edited', () => {
    const [entry] = clock.getRunning();
    assert.equal(pomodoro.targetMinutes(entry.clockUid), 30);

    assert.equal(topbarWidget().querySelector('.rlb-topbar__target'), null);
    assert.ok(topbarWidget().querySelector('.rlb-topbar__time--neutral'));

    // Backdate the CLOCK block itself — refresh re-reads from the graph, so
    // mutating the in-memory entry would simply be overwritten.
    pomodoro.reconcileCycle([]);
    graph.store.get(entry.clockUid).string = `CLOCK:: ${formatStamp(new Date(Date.now() - 31 * 60_000))}`;
    clock.refresh();

    assert.ok(topbarWidget().querySelector('.rlb-topbar__time--overrun'));
    assert.equal(topbarWidget().querySelector('.rlb-topbar__time--stale'), null);
    assert.equal(topbarWidget().querySelector('.rlb-dot'), null);
    assert.equal(topbarWidget().querySelector('.rlb-topbar__button--overrun'), null);
    assert.match(topbarWidget().querySelector('button').title, /over by/);

    graph.store.get(entry.clockUid).string = `CLOCK:: ${formatStamp(new Date(Date.now() - 60_000))}`;
    clock.refresh();
    assert.ok(topbarWidget().querySelector('.rlb-topbar__time--overrun'));
});

test('the shared overrun state takes priority over stale metadata', () => {
    const [entry] = clock.getRunning();
    pomodoro.suppress(entry.clockUid);
    graph.store.get(entry.clockUid).string = `CLOCK:: ${formatStamp(new Date(Date.now() - 9 * 60 * 60_000))}`;
    clock.refresh();

    assert.equal(topbarWidget().querySelector('.rlb-topbar__time--stale'), null);
    assert.ok(topbarWidget().querySelector('.rlb-topbar__time--overrun'));
    assert.equal(topbarWidget().querySelector('.rlb-dot'), null);
    const cycle = pomodoro.getCycle();
    assert.ok(cycle, 'an external timestamp edit does not reset the shared cycle');
    assert.equal(topbarWidget().textContent.trim(), formatElapsed(Date.now() - cycle.startedAt));
    assert.doesNotMatch(topbarWidget().querySelector('button').title, /likely forgotten/);

    click(topbarWidget().querySelector('button'));
    const popover = document.querySelector('body > .rlb-popover');
    assert.equal(popover.querySelector('.rlb-popover__title').textContent, '1 Session Running');
    assert.match(popover.textContent, /1 Session has been open for over 8h/);
    assert.doesNotMatch(popover.textContent, /clock has been open/i);
    click(topbarWidget().querySelector('button'));

    graph.store.get(entry.clockUid).string = `CLOCK:: ${formatStamp(new Date(Date.now() - 60_000))}`;
    clock.refresh();
    assert.ok(topbarWidget().querySelector('.rlb-topbar__time--overrun'));
});

test('a long task name stays in the tooltip without entering visible topbar text', () => {
    const longName = '把这个非常非常长的任务名字放进标题栏里看看会不会把整个顶栏撑坏掉真的很长';
    graph.store.get('taskone01').string = `{{[[TODO]]}} ${longName}`;
    clock.refresh();

    assert.equal(topbarWidget().querySelector('.rlb-topbar__label'), null);
    assert.match(topbarWidget().textContent.trim(), /^\d+:\d{2}(?::\d{2})?$/);
    assert.match(topbarWidget().querySelector('button').title, new RegExp(longName.slice(0, 20)));

    graph.store.get('taskone01').string = '{{[[TODO]]}} this is a test task';
    clock.refresh();
});

test('clock in is hidden and clock out offered while the clock runs', () => {
    const context = { 'block-uid': 'taskone01' };
    assert.equal(contextCommands.get('Logbook: Clock in')['display-conditional'](context), false);
    assert.equal(contextCommands.get('Logbook: Clock out')['display-conditional'](context), true);
});

test('multiple-clock mode leads with elapsed time and follows with a compact Session count', async () => {
    const [primary] = clock.getRunning();
    pomodoro.reconcileCycle([]);
    graph.store.get(primary.clockUid).string = `CLOCK:: ${formatStamp(new Date(Date.now() - 10 * 60_000))}`;
    graph.store.set('tasktwo002', {
        uid: 'tasktwo002',
        string: '{{[[TODO]]}} parallel task',
        parent: null,
        order: 10,
    });
    graph.store.set('taskthree3', {
        uid: 'taskthree3',
        string: '{{[[TODO]]}} third parallel task',
        parent: null,
        order: 11,
    });
    settingsStore.set('allowMultipleClocks', true);
    clock.refresh();

    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': 'tasktwo002' });
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': 'taskthree3' });
    try {
        assert.equal(clock.getRunning().length, 3);
        // Keep the exact primary-session ordering supplied by the current clock
        // reader; the topbar must not invent a sum or expose task titles.
        const visible = [...topbarWidget().querySelector('button').children];
        assert.deepEqual(visible.map(node => node.className.split(' ')[0]), [
            'rlb-topbar__time',
            'rlb-topbar__separator',
            'rlb-topbar__parallel',
        ]);
        assert.match(visible[0].textContent, /^\d+:\d{2}(?::\d{2})?$/);
        assert.equal(topbarWidget().querySelector('.rlb-topbar__parallel').textContent, '3 Sessions');
        assert.equal(topbarWidget().querySelector('.rlb-topbar__separator').textContent, '');
        assert.equal(topbarWidget().querySelector('.rlb-topbar__separator').getAttribute('aria-hidden'), 'true');
        assert.ok(topbarWidget().querySelector('.rlb-topbar__time--neutral'));
        assert.equal(topbarWidget().querySelector('.rlb-topbar__parallel--overrun'), null);
        assert.equal(topbarWidget().querySelector('.rlb-topbar__parallel--stale'), null);
        assert.equal(topbarWidget().querySelector('.rlb-dot'), null);
        assert.doesNotMatch(topbarWidget().textContent, /parallel task|third parallel task|this is a test task|clocks|\//);
        assert.match(topbarWidget().querySelector('button').title, /^3 Sessions Running\n/);
        assert.doesNotMatch(topbarWidget().querySelector('button').title, /clocks running/i);

        click(topbarWidget().querySelector('button'));
        const popover = document.querySelector('body > .rlb-popover');
        assert.equal(popover.querySelectorAll('.rlb-run').length, 3);
        assert.equal(popover.querySelector('.rlb-popover__title').textContent, '3 Sessions Running');
        const footer = [...popover.querySelectorAll('.rlb-popover__footer button')];
        assert.deepEqual(footer.map(node => node.textContent), [
            'Dashboard',
            'Pause All',
            'Clock Out All',
            '',
        ]);
        assert.ok(footer.slice(0, 3).every(node => !/\bbp3-icon-/.test(node.className)));
        const footerRefresh = popover.querySelector('.rlb-popover__footer [data-action="refresh"]');
        assert.match(footerRefresh.className, /\bbp3-icon-refresh\b/);
        assert.equal(popover.querySelector('.rlb-surface__header [data-action="refresh"]'), null);
        assert.equal(footerRefresh.title, 'Refresh Sessions from graph');
        assert.equal(footerRefresh.getAttribute('aria-label'), 'Refresh Sessions from graph');
        click(topbarWidget().querySelector('button'));
    } finally {
        if (document.querySelector('body > .rlb-popover')) click(topbarWidget().querySelector('button'));
        await contextCommands.get('Logbook: Clock out').callback({ 'block-uid': 'tasktwo002' });
        await contextCommands.get('Logbook: Clock out').callback({ 'block-uid': 'taskthree3' });
        settingsStore.set('allowMultipleClocks', false);
        for (const drawer of graph.childrenOf('tasktwo002')) {
            for (const child of graph.childrenOf(drawer.uid)) graph.store.delete(child.uid);
            graph.store.delete(drawer.uid);
        }
        graph.store.delete('tasktwo002');
        for (const drawer of graph.childrenOf('taskthree3')) {
            for (const child of graph.childrenOf(drawer.uid)) graph.store.delete(child.uid);
            graph.store.delete(drawer.uid);
        }
        graph.store.delete('taskthree3');
        graph.store.get(primary.clockUid).string = `CLOCK:: ${formatStamp(new Date(Date.now() - 60_000))}`;
        clock.refresh();
    }
});

test('the popover lists the running clock', () => {
    click(topbarWidget().querySelector('button'));
    // It is anchored on <body>, not inside the widget, so the topbar cannot clip it.
    const popover = document.querySelector('body > .rlb-popover');

    assert.ok(popover, 'clicking the widget should open the popover');
    assert.equal(popover.querySelectorAll('.rlb-run').length, 1);
    assert.equal(popover.querySelector('.rlb-popover__title').textContent, '1 Session Running');
    const taskTitle = popover.querySelector('.rlb-run__title');
    assert.ok(taskTitle);
    assert.equal(taskTitle.tagName, 'BUTTON');
    assert.equal(taskTitle.type, 'button');
    assert.equal(taskTitle.classList.contains('bp3-icon-document-open'), false);
    assert.equal(popover.querySelector('.bp3-icon-stopwatch'), null);
    const checkout = popover.querySelector('[data-action="clock-out"]');
    assert.equal(checkout.textContent, '');
    assert.ok(checkout.classList.contains('bp3-icon-log-out'));
    assert.equal(checkout.title, 'Check Out');
    assert.ok(checkout.title);
    assert.equal(checkout.getAttribute('aria-label'), checkout.title);
    const discard = popover.querySelector('.bp3-icon-trash');
    assert.ok(discard, 'discard action should be present');
    assert.ok(discard.title);
    assert.equal(discard.getAttribute('aria-label'), discard.title);
    const footerActions = [...popover.querySelectorAll('.rlb-popover__footer button')];
    assert.deepEqual(footerActions.map(action => action.textContent), [
        'Dashboard',
        'Pause',
        '',
    ]);
    for (const action of footerActions.slice(0, 2)) {
        assert.doesNotMatch(action.className, /\bbp3-icon-/);
    }
    const refresh = popover.querySelector('.rlb-popover__footer [data-action="refresh"]');
    assert.match(refresh.className, /\bbp3-icon-refresh\b/);
    assert.equal(popover.querySelector('.rlb-surface__header [data-action="refresh"]'), null);
    assert.equal(refresh.title, 'Refresh Sessions from graph');
    assert.equal(refresh.getAttribute('aria-label'), 'Refresh Sessions from graph');

    click(topbarWidget().querySelector('button'));
    assert.equal(document.querySelector('.rlb-popover'), null, 'second click closes it');
});

test('the dashboard renders totals and the task breakdown', () => {
    const fullTitle =
        "Graph Engineering: How to Build AI Agent Systems That Don't Break at Scale * — complete continuation beyond eighty characters";
    graph.store.get('taskone01').string = `{{[[TODO]]}} ${fullTitle}`;
    clock.refresh();
    paletteCommands.get('Logbook: Open dashboard')();

    assert.ok(dialog().classList.contains('rlb-root--open'));
    assert.ok(dialog().classList.contains('rlb-dashboard'), 'dashboard styles have a host-scoped root');
    const shell = dialog().querySelector('.rlb-dialog');
    assert.equal(shell.getAttribute('aria-modal'), 'true');
    assert.equal(dialog().querySelector('.rlb-header__title').textContent, 'Roam Logbook');
    assert.equal(
        dialog().querySelector('.rlb-header__subtitle').textContent,
        'Focus sessions, activity, and task rollups'
    );
    assert.equal(
        dialog().querySelector('.rlb-header__subtitle').getBoundingClientRect().width,
        0
    );
    assert.equal(dialog().querySelector('.rlb-header__heading .bp3-icon'), null, 'header has no decorative icon');
    assert.equal(dialog().querySelector('select').getAttribute('aria-label'), 'Dashboard date range');
    assert.equal(dialog().querySelector('.rlb-overview').getAttribute('aria-label'), 'Roam Logbook overview');
    assert.equal(dialog().querySelectorAll('.rlb-overview__item').length, 4);
    const viewToggle = dialog().querySelector('[data-action="toggle-view"]');
    assert.ok(viewToggle, 'Overview exposes the Analytics view toggle');
    assert.equal(viewToggle.getAttribute('aria-label'), 'Open Analytics');
    assert.equal(viewToggle.getAttribute('aria-pressed'), 'false');
    assert.equal(viewToggle.getAttribute('aria-controls'), 'roam-logbook-dashboard-view');
    assert.ok(dialog().querySelector('.rlb-body__scroll'));
    for (const selector of ['.bp3-icon-refresh', '.bp3-icon-cross']) {
        const action = dialog().querySelector(selector);
        assert.ok(action.classList.contains('rlb-icon-button'));
        assert.ok(action.title);
        assert.equal(action.getAttribute('aria-label'), action.title);
    }
    assert.match(dialog().textContent, /Today/);
    assert.match(dialog().textContent, /Graph Engineering:/);
    assert.ok(dialog().querySelector('.rlb-task-link.bp3-icon-document-open'));
    // The running session is listed separately from the by-task rollup.
    assert.equal(dialog().querySelectorAll('.rlb-table').length, 2);
    const runningTable = dialog().querySelector('.rlb-table');
    const started = runningTable.querySelector('.rlb-started');
    assert.ok(started, 'Running exposes a semantic Started time');
    assert.equal(started.tagName, 'TIME');
    assert.equal(started.title, formatStamp(clock.getRunning()[0].start));
    assert.equal(started.querySelector('.rlb-started__date')?.textContent, 'Today');
    assert.match(started.querySelector('.rlb-started__time')?.textContent ?? '', /^\d{2}:\d{2}$/);
    assert.equal(started.dateTime, started.getAttribute('datetime'));
    const taskTable = dialog().querySelector('.rlb-task-table');
    assert.ok(taskTable, 'By Task uses its own stable column contract');
    assert.deepEqual(
        [...taskTable.querySelectorAll('col')].map(column => column.className),
        ['rlb-task-table__task', 'rlb-task-table__sessions', 'rlb-task-table__own', 'rlb-task-table__total']
    );
    const longLink = [...taskTable.querySelectorAll('.rlb-task-link')].find(link =>
        link.textContent.startsWith('Graph Engineering:')
    );
    assert.equal(longLink.textContent, fullTitle, 'the complete stored Task title stays readable');
    assert.equal(longLink.querySelector('.rlb-task-link__text').textContent, fullTitle);
    const css = document.getElementById('roam-logbook-styles').textContent;
    assert.match(css, /\.rlb-task-table \.rlb-task-link[^}]*overflow: visible/s);
    assert.match(css, /\.rlb-task-table \.rlb-task-link > \.rlb-task-link__text[^}]*white-space: normal/s);
    assert.match(css, /\.bp3-button\.bp3-minimal\.rlb-task-link--icon\s*\{[^}]*color: var\(--rlb-text\)[^}]*text-decoration: none/s);
    assert.match(css, /\.bp3-button\.bp3-minimal\.rlb-task-link--icon::before\s*\{[^}]*color: var\(--rlb-muted\)/s);
    assert.match(css, /\.bp3-button\.bp3-minimal\.rlb-task-link--icon:focus-visible\s*\{[^}]*outline:/s);
    assert.doesNotMatch(css, /\.rlb-analytics__distribution-header \.rlb-task-link\s*\{[^}]*color: var\(--rlb-surface-link\)/s);

    graph.store.get('taskone01').string = '{{[[TODO]]}} this is a test task';
    click(dialog().querySelector('.rlb-header .bp3-icon-refresh'));
});

test('the task tree collapses and expands from the caret', () => {
    const collapsedTitle =
        'Graph Engineering: How to Build AI Agent Systems That Do Not Break at Scale * 这是一个需要完整换行且不能和摘要粘连的超长任务标题';
    graph.store.get('taskone01').string = `{{[[TODO]]}} ${collapsedTitle}`;
    // Give the tracked task a sub-task with time of its own.
    graph.store.set('steps00001', {
        uid: 'steps00001',
        string: 'Steps::',
        parent: 'taskone01',
        order: 5,
        page: 'Test Page',
    });
    graph.store.set('subtask001', {
        uid: 'subtask001',
        string: '{{[[TODO]]}} a sub task',
        parent: 'steps00001',
        order: 0,
        page: 'Test Page',
    });
    graph.store.set('drawer0001', {
        uid: 'drawer0001',
        string: 'LOGBOOK::',
        parent: 'subtask001',
        order: 0,
        page: 'Test Page',
    });
    const end = new Date();
    const start = new Date(end.getTime() - 60 * 60_000);
    graph.store.set('clock00001', {
        uid: 'clock00001',
        string: `CLOCK:: ${formatStamp(start)}--${formatStamp(end)} => 1:00`,
        parent: 'drawer0001',
        order: 0,
        page: 'Test Page',
    });

    paletteCommands.get('Logbook: Open dashboard')();

    const taskRows = () => [...dialog().querySelectorAll('.rlb-tree__cell')].map(cell => cell.textContent);
    assert.equal(taskRows().length, 2, 'parent and sub-task both listed');

    const caret = dialog().querySelector('.rlb-tree__toggle');
    assert.equal(caret.getAttribute('aria-expanded'), 'true');
    caret.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

    assert.equal(taskRows().length, 1, 'the sub-task row is hidden');
    assert.match(taskRows()[0], /\+1 sub-task/);
    assert.equal(dialog().querySelector('.rlb-tree__toggle').getAttribute('aria-expanded'), 'false');
    const collapsedCell = dialog().querySelector('.rlb-tree__cell');
    const collapsedLayout = collapsedCell.querySelector('.rlb-tree__layout');
    assert.deepEqual([...collapsedCell.children].map(child => child.className), ['rlb-tree__layout']);
    assert.deepEqual(
        [...collapsedLayout.children].map(child => child.className.split(' ')[0]),
        ['rlb-tree__leading', 'rlb-tree__content', 'rlb-muted'],
        'leading controls, wrapping title, and summary are independent layout items'
    );
    assert.equal(collapsedCell.querySelector('.rlb-task-link__text').textContent, collapsedTitle);
    assert.equal(collapsedCell.querySelector('.rlb-tree__hidden').textContent, '+1 sub-task');
    assert.equal(
        collapsedCell.querySelector('.rlb-tree__content').contains(collapsedCell.querySelector('.rlb-tree__hidden')),
        false,
        'the fixed summary cannot overlap inside the wrapping title box'
    );
    const css = document.getElementById('roam-logbook-styles').textContent;
    assert.match(css, /\.rlb-tree__layout\s*{[^}]*display: grid[^}]*grid-template-columns: auto minmax\(0, 1fr\) max-content[^}]*column-gap: 12px[^}]*width: 100%/s);
    assert.match(css, /\.rlb-tree__content\s*{[^}]*min-width: 0[^}]*flex-wrap: wrap/s);
    assert.match(css, /\.rlb-tree__hidden\s*{[^}]*white-space: nowrap/s);
    assert.match(css, /\.rlb-task-table \.rlb-task-link > \.rlb-task-link__text\s*{[^}]*flex: 1 1 auto[^}]*width: auto[^}]*min-width: 0[^}]*max-width: 100%[^}]*white-space: normal[^}]*overflow-wrap: anywhere[^}]*word-break: break-word/s);

    graph.store.get('taskone01').string = '{{[[TODO]]}} this is a test task';
    dialog().querySelector('.rlb-tree__toggle').dispatchEvent(
        new dom.window.MouseEvent('click', { bubbles: true })
    );
    assert.equal(taskRows().length, 2, 'expanding brings it back');
});

test('each task row shows its checkbox state', () => {
    graph.store.get('subtask001').string = '{{[[DONE]]}} a sub task';
    paletteCommands.get('Logbook: Open dashboard')();

    const marks = [...dialog().querySelectorAll('.rlb-tree__cell .rlb-status')];
    assert.equal(marks.length, 2, 'one per task row');
    assert.deepEqual(marks.map(mark => mark.getAttribute('aria-label')), ['To do', 'Done']);
    // The finished row is dimmed rather than hidden.
    assert.equal(dialog().querySelectorAll('tr.rlb-row--done').length, 1);
});

test('collapsed state survives a re-render', () => {
    dialog().querySelector('.rlb-tree__toggle').dispatchEvent(
        new dom.window.MouseEvent('click', { bubbles: true })
    );
    // Changing the range rebuilds the body from scratch.
    const select = dialog().querySelector('select');
    select.value = 'all';
    select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    assert.equal(dialog().querySelectorAll('.rlb-tree__cell').length, 1, 'still collapsed');
});

test('Escape closes the dashboard', () => {
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.ok(!dialog().classList.contains('rlb-root--open'));
});

test('clocking out through the palette closes the entry', async () => {
    await paletteCommands.get('Logbook: Clock out all running clocks')();
    await paletteCommands.get('Logbook: Clock out all running clocks')();

    const drawer = graph.childrenOf('taskone01')[0];
    assert.match(graph.childrenOf(drawer.uid)[0].string, /\]--\[.*\] => \d+:\d\d$/);
    assert.ok(!topbarWidget().querySelector('.rlb-topbar__button--running'));
    // Idle is icon-only — it earns no words in Roam's topbar — so the state
    // shows up in the icon and the tooltip rather than in the text.
    assert.equal(topbarWidget().textContent, '');
    assert.ok(topbarWidget().querySelector('.bp3-icon-history'));
    assert.equal(topbarWidget().querySelector('.bp3-icon-timeline-events'), null);
    assert.match(topbarWidget().querySelector('button').title, /no Session running/);
});

test('legacy targets remain compatible while the shared cycle controls the topbar', async () => {
    const duration = settingsPanel.settings.find(setting => setting.id === 'pomodoroMinutes');
    duration.action.onChange({ target: { value: '45' } });
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': 'taskone01' });
    const before = clock.getRunning()[0];
    assert.ok(before, 'a clock should be running');
    assert.equal(pomodoro.isActive(before.clockUid), true);
    assert.equal(pomodoro.targetMinutes(before.clockUid), 45);
    assert.equal(topbarWidget().querySelector('.rlb-topbar__target'), null);
    assert.match(topbarWidget().querySelector('button').title, /Pomodoro cycle 45:00/);
    assert.match(topbarWidget().textContent.trim(), /^\d+:\d{2}(?::\d{2})?$/);

    duration.action.onChange({ target: { value: '20' } });
    assert.equal(pomodoro.targetMinutes(before.clockUid), 45, 'an active Session keeps its captured target');
    await contextCommands.get('Logbook: Clock out').callback({ 'block-uid': 'taskone01' });
    const originalFocusedBlock = window.roamAlphaAPI.ui.getFocusedBlock;
    window.roamAlphaAPI.ui.getFocusedBlock = () => ({ 'block-uid': 'taskone01' });
    try {
        await paletteCommands.get('Logbook: Clock in current block')();
    } finally {
        window.roamAlphaAPI.ui.getFocusedBlock = originalFocusedBlock;
    }
    const next = clock.getRunning()[0];
    assert.notEqual(next.clockUid, before.clockUid);
    assert.equal(pomodoro.targetMinutes(next.clockUid), 20, 'the next Session gets the new duration');

    // A real reload with a running graph CLOCK but no target assignment: the
    // legacy assignment is repaired for compatibility, while the cycle uses
    // the open CLOCK as its fallback when no persisted cycle exists.
    graph.store.get(next.clockUid).string = `CLOCK:: ${formatStamp(new Date(Date.now() - 21 * 60_000))}`;
    settingsStore.set('pomodoroTargets', '{}');
    settingsStore.delete('pomodoroCycle');
    extension.onunload();
    extension.onload({ extensionAPI });

    const after = clock.getRunning()[0];
    assert.equal(after.clockUid, next.clockUid, 'the open clock comes back from the graph');
    assert.equal(pomodoro.targetMinutes(after.clockUid), 20, 'missing assignment is repaired on discovery');
    assert.equal(clock.getRunning().length, 1, 'passing the repaired target never closes the CLOCK');
    assert.ok(topbarWidget().querySelector('.rlb-topbar__time--overrun'));
    assert.equal(topbarWidget().querySelector('.rlb-topbar__target'), null);
    assert.match(topbarWidget().querySelector('button').title, /Pomodoro cycle 20:00/);

    duration.action.onChange({ target: { value: '-4' } });
    assert.equal(settingsStore.get('pomodoroMinutes'), '20', 'invalid input keeps the current safe value');
    duration.action.onChange({ target: { value: '12.3456789' } });
    assert.equal(settingsStore.get('pomodoroMinutes'), '12.345679');
    assert.equal(pomodoro.targetMinutes(after.clockUid), 20, 'settings edits never rewrite an active target');
});

test('onunload removes every trace of the extension', () => {
    const html = document.documentElement;
    const body = document.body;
    const htmlStyle = 'overflow: auto; color: rebeccapurple;';
    const bodyStyle = 'padding-right: 4px; overflow: auto;';
    html.setAttribute('style', htmlStyle);
    body.setAttribute('style', bodyStyle);
    paletteCommands.get('Logbook: Open dashboard')();
    assert.equal(html.style.overflow, 'hidden');
    assert.equal(body.style.overflow, 'hidden');

    extension.onunload();

    assert.equal(topbarWidget(), null);
    assert.equal(dialog(), null);
    assert.equal(document.getElementById('roam-logbook-styles'), null);
    assert.equal(html.getAttribute('style'), htmlStyle);
    assert.equal(body.getAttribute('style'), bodyStyle);
    assert.equal(contextCommands.size, 0);
    assert.equal(paletteCommands.size, 0);
});
