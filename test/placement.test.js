/**
 * Where the widget lands in Roam's topbar.
 *
 * This shipped wrong once: a guessed class name missed, the fallback prepended,
 * and the widget ended up in front of the hamburger, pushing Roam's own
 * navigation across. None of the topbar's markup is a public contract, so the
 * anchor is found by what the controls are — and every shape it might take is
 * pinned here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import { installGraph } from './helpers/graph-stub.js';

const extensionAPI = {
    settings: { get: () => undefined, set: () => {}, panel: { create: () => {} } },
    ui: { commandPalette: { addCommand: () => {}, removeCommand: () => {} } },
};

let loaded = null;

/** Mount the extension into a topbar of the given shape; return the child order. */
async function mountInto(topbarHtml) {
    const dom = new JSDOM(
        `<!doctype html><html><body><div class="rm-topbar">${topbarHtml}</div></body></html>`
    );
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.MutationObserver = dom.window.MutationObserver;
    installGraph([]);
    globalThis.window.roamAlphaAPI.ui.blockContextMenu = {
        addCommand: () => {},
        removeCommand: () => {},
    };

    loaded?.onunload();
    loaded = (await import('../src/extension.js')).default;
    loaded.onload({ extensionAPI });

    return [...document.querySelector('.rm-topbar').children].map(child =>
        child.id === 'roam-logbook-topbar' ? 'WIDGET' : child.dataset.name
    );
}

const named = (name, className = '') => `<button data-name="${name}" class="${className}"></button>`;

test.after(() => loaded?.onunload());

test('lands after the back/forward arrows, before the rest of the topbar', async () => {
    const order = await mountInto(
        named('menu', 'bp3-button bp3-icon-menu') +
            named('back', 'bp3-button bp3-icon-arrow-left') +
            named('forward', 'bp3-button bp3-icon-arrow-right') +
            named('search', 'rm-find-or-create-wrapper') +
            named('right', 'rm-topbar__right')
    );

    assert.deepEqual(order, ['menu', 'back', 'forward', 'WIDGET', 'search', 'right']);
});

test('finds the anchor even when the arrow is wrapped in other elements', async () => {
    const order = await mountInto(
        `<div data-name="menu"><span class="bp3-icon-menu"></span></div>` +
            `<div data-name="back"><span class="bp3-icon-arrow-left"></span></div>` +
            `<div data-name="forward"><span class="bp3-icon-arrow-right"></span></div>` +
            named('search')
    );

    // The insertion point is the topbar's own child, not the matched icon.
    assert.deepEqual(order, ['menu', 'back', 'forward', 'WIDGET', 'search']);
});

test('falls back to the menu toggle when there are no arrows', async () => {
    const order = await mountInto(
        named('menu', 'bp3-button bp3-icon-menu') + named('search')
    );

    assert.deepEqual(order, ['menu', 'WIDGET', 'search']);
});

test('an unrecognised topbar appends rather than displacing anything', async () => {
    const order = await mountInto(named('mystery') + named('other'));

    // Guessing wrong on the left shoves controls the user needs; on the right the
    // widget is merely in a less convenient place.
    assert.deepEqual(order, ['mystery', 'other', 'WIDGET']);
});

test('an arrow further right does not drag the widget across', async () => {
    const order = await mountInto(
        named('menu', 'bp3-button bp3-icon-menu') +
            named('search') +
            named('sidebar', 'bp3-button bp3-icon-arrow-right')
    );

    // Matching the first arrow, not the last, keeps the right sidebar toggle
    // from being mistaken for forward navigation.
    assert.deepEqual(order, ['menu', 'WIDGET', 'search', 'sidebar']);
});
