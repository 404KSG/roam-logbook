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
            addCommand: ({ label, callback }) => paletteCommands.set(label, callback),
            removeCommand: ({ label }) => paletteCommands.delete(label),
        },
    },
};

const extension = (await import('../src/extension.js')).default;

const topbarWidget = () => document.getElementById('roam-logbook-topbar');
const dialog = () => document.getElementById('roam-logbook-dashboard');
const click = node => node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

test.before(() => extension.onload({ extensionAPI }));
test.after(() => extension.onunload());

test('onload mounts the topbar widget and registers every command', () => {
    assert.ok(topbarWidget(), 'widget should be attached to .rm-topbar');
    assert.equal(settingsPanel.tabTitle, 'Logbook');
    assert.equal(paletteCommands.size, 5);
    assert.deepEqual([...contextCommands.keys()], ['Logbook: Clock in', 'Logbook: Clock out']);
});

test('the context menu offers clock in on a TODO block only', () => {
    const clockIn = contextCommands.get('Logbook: Clock in');
    assert.equal(clockIn['display-conditional']({ 'block-uid': 'taskone01' }), true);

    graph.store.set('plain0001', { uid: 'plain0001', string: 'just a note', parent: null, order: 9 });
    assert.equal(clockIn['display-conditional']({ 'block-uid': 'plain0001' }), false);
});

test('clocking in through the context menu writes the drawer and lights the widget', async () => {
    await contextCommands.get('Logbook: Clock in').callback({ 'block-uid': 'taskone01' });

    const drawer = graph.childrenOf('taskone01')[0];
    assert.equal(drawer.string, 'LOGBOOK::');
    assert.ok(graph.childrenOf(drawer.uid)[0].string.startsWith('CLOCK:: ['));

    const label = topbarWidget().textContent;
    assert.match(label, /this is a test task/);
    assert.ok(
        topbarWidget().querySelector('.rlb-topbar__button--running'),
        'widget should show the running state'
    );
});

test('clock in is hidden and clock out offered while the clock runs', () => {
    const context = { 'block-uid': 'taskone01' };
    assert.equal(contextCommands.get('Logbook: Clock in')['display-conditional'](context), false);
    assert.equal(contextCommands.get('Logbook: Clock out')['display-conditional'](context), true);
});

test('the popover lists the running clock', () => {
    click(topbarWidget().querySelector('button'));
    // It is anchored on <body>, not inside the widget, so the topbar cannot clip it.
    const popover = document.querySelector('body > .rlb-popover');

    assert.ok(popover, 'clicking the widget should open the popover');
    assert.equal(popover.querySelectorAll('.rlb-run').length, 1);
    assert.match(popover.textContent, /Running clocks/);

    click(topbarWidget().querySelector('button'));
    assert.equal(document.querySelector('.rlb-popover'), null, 'second click closes it');
});

test('the dashboard renders totals and the task breakdown', () => {
    paletteCommands.get('Logbook: Open dashboard')();

    assert.ok(dialog().classList.contains('rlb-root--open'));
    assert.match(dialog().textContent, /Today/);
    assert.match(dialog().textContent, /this is a test task/);
    // The running session is listed separately from the by-task rollup.
    assert.equal(dialog().querySelectorAll('.rlb-table').length, 2);
});

test('Escape closes the dashboard', () => {
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.ok(!dialog().classList.contains('rlb-root--open'));
});

test('clocking out through the palette closes the entry', async () => {
    await paletteCommands.get('Logbook: Clock out all running clocks')();

    const drawer = graph.childrenOf('taskone01')[0];
    assert.match(graph.childrenOf(drawer.uid)[0].string, /\]--\[.*\] => \d+:\d\d$/);
    assert.ok(!topbarWidget().querySelector('.rlb-topbar__button--running'));
    assert.match(topbarWidget().textContent, /Logbook/);
});

test('onunload removes every trace of the extension', () => {
    extension.onunload();

    assert.equal(topbarWidget(), null);
    assert.equal(dialog(), null);
    assert.equal(document.getElementById('roam-logbook-styles'), null);
    assert.equal(contextCommands.size, 0);
    assert.equal(paletteCommands.size, 0);
});
