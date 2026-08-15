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

const click = node => node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
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

test('running rows expose compact explicit target metadata and complete accessible task names', async t => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn('popover-task-01', { now: new Date('2026-08-15T09:00:00') });

    const popover = openPopover();
    const row = popover.querySelector('.rlb-run');
    const taskButton = row.querySelector('.rlb-run__title');

    assert.equal(row.querySelector('.rlb-dot'), null, 'the header already communicates Running');
    assert.match(taskButton.title, /Graph Engineering: a deliberately long task title/);
    assert.match(taskButton.title, /Open this block/i);
    assert.match(taskButton.getAttribute('aria-label'), /Graph Engineering: a deliberately long task title/);
    assert.match(taskButton.getAttribute('aria-label'), /Open this block/i);

    assert.equal(row.querySelectorAll('.rlb-run__meta-line').length, 2);
    assert.match(
        row.querySelector('.rlb-run__meta-primary').textContent,
        /^\d+:\d{2} · target \d+:\d{2} · \d+m total$/
    );
    assert.match(
        row.querySelector('.rlb-run__started').textContent,
        /^(Today|[A-Z][a-z]{2} \d{1,2}) \d{2}:\d{2}$/
    );
    assert.doesNotMatch(row.textContent, /Project Page|\[2026-08-15 Sat 09:00\]/);

    const stop = row.querySelector('[data-action="clock-out"]');
    assert.ok(stop.classList.contains('bp3-icon-stop'));
    assert.equal(stop.classList.contains('bp3-intent-success'), false);
    assert.equal(stop.getAttribute('aria-label'), stop.title);

    const discard = row.querySelector('[data-action="discard"]');
    assert.match(discard.title, /Discard this CLOCK|discard this Session/i);
    assert.equal(discard.getAttribute('aria-label'), discard.title);
    await settle();
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
