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

/** Mount into Roam's nested topbar shell and expose only user-visible placement. */
async function mountIntoNestedTopbar() {
    const dom = new JSDOM(`<!doctype html><html><body>
        <div class="rm-topbar">
            <div class="rm-topbar__inner" data-name="shell">
                <nav class="rm-topbar__navigation" data-name="navigation" aria-label="Page navigation">
                    <button title="Open left sidebar"><span class="bp3-icon bp3-icon-menu"></span></button>
                    <button aria-label="Back"><span class="bp3-icon bp3-icon-chevron-left"></span></button>
                    <button aria-label="Forward"><span class="bp3-icon bp3-icon-chevron-right"></span></button>
                </nav>
                <div class="rm-topbar__main" data-name="main">
                    <div class="rm-find-or-create-wrapper"><input aria-label="Find or create a page" /></div>
                </div>
                <div class="rm-topbar__right" data-name="right"><button>Help</button></div>
            </div>
        </div>
    </body></html>`);
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

    const shell = document.querySelector('[data-name="shell"]');
    return {
        topbarOrder: [...document.querySelector('.rm-topbar').children].map(child =>
            child.id === 'roam-logbook-topbar' ? 'WIDGET' : child.dataset.name
        ),
        shellOrder: [...shell.children].map(child =>
            child.id === 'roam-logbook-topbar' ? 'WIDGET' : child.dataset.name
        ),
    };
}

const named = (name, className = '') => `<button data-name="${name}" class="${className}"></button>`;

test.after(() => loaded?.onunload());

test('lands after a nested Back/Forward navigation wrapper and before main controls', async () => {
    const placement = await mountIntoNestedTopbar();

    assert.deepEqual(placement.topbarOrder, ['shell']);
    assert.deepEqual(placement.shellOrder, ['navigation', 'WIDGET', 'main', 'right']);
    assert.equal(document.querySelector('[data-name="shell"]').classList.contains('rlb-topbar__layout'), true);
    assert.equal(document.querySelector('[data-name="main"]').classList.contains('rlb-topbar__search'), true);
});

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

test('clears arrows that carry no Blueprint icon name', async () => {
    // Roam's own back/forward are not `bp3-icon-arrow-*`; they are icon-only
    // controls with an svg inside and no text, which is the general test.
    const order = await mountInto(
        named('menu', 'bp3-button bp3-icon-menu') +
            `<button data-name="back"><svg></svg></button>` +
            `<button data-name="forward"><svg></svg></button>` +
            `<div data-name="search" class="rm-find-or-create-wrapper"><svg></svg><input /></div>` +
            named('right')
    );

    assert.deepEqual(order, ['menu', 'back', 'forward', 'WIDGET', 'search', 'right']);
});

test('a control with a label of its own ends the cluster', async () => {
    const order = await mountInto(
        named('menu', 'bp3-button bp3-icon-menu') +
            `<button data-name="labelled"><svg></svg>All Pages</button>` +
            named('other')
    );

    assert.deepEqual(order, ['menu', 'WIDGET', 'labelled', 'other']);
});

test('falls back to the menu toggle when there are no arrows', async () => {
    const order = await mountInto(
        named('menu', 'bp3-button bp3-icon-menu') + named('search')
    );

    assert.deepEqual(order, ['menu', 'WIDGET', 'search']);
});

test('an unrecognised topbar stays near the leading control instead of the far right', async () => {
    const order = await mountInto(named('mystery') + named('other'));

    assert.deepEqual(order, ['mystery', 'WIDGET', 'other']);
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

test('reattaches once after Roam rebuilds the nested navigation shell', async () => {
    await mountIntoNestedTopbar();
    const topbar = document.querySelector('.rm-topbar');
    topbar.innerHTML = `
        <div class="rm-topbar__inner" data-name="replacement-shell">
            <nav aria-label="Page navigation" data-name="replacement-navigation">
                <button aria-label="Back"><span class="bp3-icon-chevron-left"></span></button>
                <button aria-label="Forward"><span class="bp3-icon-chevron-right"></span></button>
            </nav>
            <div class="rm-topbar__main" data-name="replacement-main">
                <input aria-label="Find or create a page" />
            </div>
            <div class="rm-topbar__right" data-name="replacement-right"></div>
        </div>`;

    await new Promise(resolve => setTimeout(resolve, 0));

    const shell = document.querySelector('[data-name="replacement-shell"]');
    const order = [...shell.children].map(child =>
        child.id === 'roam-logbook-topbar' ? 'WIDGET' : child.dataset.name
    );
    assert.deepEqual(order, [
        'replacement-navigation',
        'WIDGET',
        'replacement-main',
        'replacement-right',
    ]);
    assert.equal(document.querySelectorAll('#roam-logbook-topbar').length, 1);
});
