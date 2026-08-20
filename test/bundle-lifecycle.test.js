import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { installGraph, uninstallGraph } from './helpers/graph-stub.js';

const dom = new JSDOM('<!doctype html><html><head></head><body><div class="rm-topbar"><button aria-label="Back"></button><button aria-label="Forward"></button><input aria-label="Find or Create Page"></div></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.HTMLElement = dom.window.HTMLElement;

const TASK = { uid: 'bundle-task1', string: '{{[[TODO]]}} bundle lifecycle task', parent: null };
const settingsStore = new Map();
const palette = new Map();
const context = new Map();
const extensionAPI = {
    settings: {
        get: key => settingsStore.get(key),
        set: (key, value) => settingsStore.set(key, value),
        panel: { create: () => {} },
    },
    ui: {
        commandPalette: {
            addCommand: spec => palette.set(spec.label, spec.callback),
            removeCommand: ({ label }) => palette.delete(label),
        },
    },
};

const graph = installGraph([TASK]);
graph.api.ui.blockContextMenu = {
    addCommand: spec => context.set(spec.label, spec),
    removeCommand: ({ label }) => context.delete(label),
};

const extension = (await import(`../extension.js?lifecycle=${Date.now()}`)).default;

test('the final bundle completes onload → clock-in → dashboard → onunload cleanly', async () => {
    const activeTimers = new Set();
    const originalSetInterval = globalThis.setInterval;
    const originalClearInterval = globalThis.clearInterval;
    globalThis.setInterval = (callback, delay) => {
        const timer = originalSetInterval(callback, delay);
        activeTimers.add(timer);
        return timer;
    };
    globalThis.clearInterval = timer => {
        activeTimers.delete(timer);
        return originalClearInterval(timer);
    };

    try {
        extension.onload({ extensionAPI });
        assert.ok(document.querySelector('#roam-logbook-topbar'));
        await context.get('Task Tracker: Clock in').callback({ 'block-uid': TASK.uid });
        assert.equal(document.querySelectorAll('.rlb-topbar__time').length, 1);

        await palette.get('Task Tracker: Open dashboard')();
        assert.equal(document.querySelector('#roam-logbook-dashboard').classList.contains('rlb-root--open'), true);
        assert.ok(document.querySelector('.rlb-dialog'));
    } finally {
        extension.onunload();
        globalThis.setInterval = originalSetInterval;
        globalThis.clearInterval = originalClearInterval;
    }

    assert.equal(document.querySelector('#roam-logbook-topbar'), null);
    assert.equal(document.querySelector('#roam-logbook-dashboard'), null);
    assert.equal(document.querySelector('#roam-logbook-styles'), null);
    assert.equal(activeTimers.size, 0, 'all bundle timers are cleared on unload');
    assert.equal(context.size, 0);
    assert.equal(palette.size, 0);
});

test.after(() => uninstallGraph());
