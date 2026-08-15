import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { installGraph, uninstallGraph } from './helpers/graph-stub.js';

const dom = new JSDOM('<!doctype html><html><body><div class="rm-topbar"></div></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.HTMLElement = dom.window.HTMLElement;

const TASK = { uid: 'action001', string: '{{[[TODO]]}} action task', parent: null };
const OTHER = { uid: 'action002', string: '{{[[TODO]]}} another action task', parent: null };
let graph;
let focused = null;
const contextCommands = new Map();
const paletteCommands = new Map();
const settingsStore = new Map();
const toasts = [];

const extensionAPI = {
    settings: {
        get: key => settingsStore.get(key),
        set: (key, value) => settingsStore.set(key, value),
        panel: { create: () => {} },
    },
    ui: {
        showToast: payload => toasts.push(typeof payload === 'string' ? payload : payload?.content),
        commandPalette: {
            addCommand: spec => paletteCommands.set(spec.label, spec.callback),
            removeCommand: ({ label }) => paletteCommands.delete(label),
        },
    },
};

const install = () => {
    graph = installGraph([TASK, OTHER]);
    focused = null;
    settingsStore.clear();
    settingsStore.set('allowMultipleClocks', true);
    contextCommands.clear();
    paletteCommands.clear();
    toasts.length = 0;
    window.roamAlphaAPI.ui.getFocusedBlock = () => (focused ? { 'block-uid': focused } : null);
    window.roamAlphaAPI.ui.blockContextMenu = {
        addCommand: spec => contextCommands.set(spec.label, spec),
        removeCommand: ({ label }) => contextCommands.delete(label),
    };
};

install();
const extension = (await import('../src/extension.js')).default;
const clock = await import('../src/clock.js');
const paused = await import('../src/paused.js');

const click = node => node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
const settle = async () => {
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
};
const topbarButton = () => document.querySelector('#roam-logbook-topbar button');
const openPopover = () => {
    click(topbarButton());
    return document.querySelector('body > .rlb-popover');
};
const footerAction = label =>
    [...document.querySelectorAll('.rlb-popover__footer button')].find(node => node.textContent === label);

test.beforeEach(() => {
    extension.onunload();
    document.body.innerHTML = '<div class="rm-topbar"></div>';
    install();
    extension.onload({ extensionAPI });
});

test.afterEach(() => extension.onunload());
test.after(() => uninstallGraph());

test('Clock out current block with no focused block only notifies and performs zero writes', async () => {
    await clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') });
    const before = clock.getRunning()[0].clockUid;
    const callback = paletteCommands.get('Logbook: Clock out current block');

    await callback();

    assert.equal(clock.getRunning().length, 1);
    assert.equal(clock.getRunning()[0].clockUid, before);
    assert.match(graph.childrenOf(graph.childrenOf(TASK.uid)[0].uid)[0].string, /^CLOCK:: \[/);
    assert.match(toasts.join(' '), /focused block/i);
});

test('Clock Out All requires a second confirmation and resets when the popover closes', async () => {
    await clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') });
    await clock.clockIn(OTHER.uid, { now: new Date('2026-08-15T09:01:00') });
    assert.equal(clock.getRunning().length, 2);

    openPopover();
    const first = footerAction('Clock Out All');
    assert.ok(first);
    assert.match(first.getAttribute('aria-label'), /permanently close all running Sessions/i);
    click(first);
    await settle();

    assert.equal(clock.getRunning().length, 2, 'the first click must not write to the graph');
    const confirm = footerAction('Confirm Clock Out All');
    assert.ok(confirm);
    assert.match(confirm.title, /confirm/i);
    assert.equal(confirm.getAttribute('aria-label'), confirm.title);

    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(document.querySelector('.rlb-popover'), null);
    openPopover();
    assert.ok(footerAction('Clock Out All'), 'closing the popover resets confirmation');
    assert.equal(footerAction('Confirm Clock Out All'), undefined);

    click(footerAction('Clock Out All'));
    await settle();
    assert.equal(clock.getRunning().length, 2);
    click(footerAction('Confirm Clock Out All'));
    await settle();
    assert.equal(clock.getRunning().length, 0, 'only the confirmed action may close all Sessions');
});

test('Pause All remains a one-click recoverable action', async () => {
    await clock.clockIn(TASK.uid, { now: new Date('2026-08-15T09:00:00') });
    openPopover();

    click(footerAction('Pause All'));
    await settle();

    assert.equal(clock.getRunning().length, 0);
    assert.equal(paused.getPaused().length, 1);
    assert.equal(footerAction('Resume All')?.textContent, 'Resume All');
});
