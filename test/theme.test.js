import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

import {
    acquireThemeRuntime,
    DARK_PAGE_LINK,
    DARK_SYNC_GREEN,
    LIGHT_PAGE_LINK,
    readRoamPageLinkPalette,
    readRoamSyncPalette,
} from '../src/theme.js';

const domFor = body => new JSDOM(`<!doctype html><html><body>${body || ''}</body></html>`);

test('page-ref palette prefers visible real links and excludes tag/namespace refs', () => {
    const dom = domFor(
        '<div class="rlb-popover"><span class="rm-page-ref rm-page-ref--link" style="color: rgb(220, 80, 80)">Plugin ref</span></div>' +
            '<div class="roam-body-main">' +
            '<span class="rm-page-ref rm-page-ref--tag" style="color: rgb(220, 80, 80)">#tag</span>' +
            '<span class="rm-page-ref rm-page-ref--namespace" style="color: rgb(220, 80, 80)">ns/</span>' +
            '<span class="rm-page-ref rm-page-ref--link" style="color: rgb(49, 106, 159)">Page</span>' +
        '</div>'
    );
    const palette = readRoamPageLinkPalette(dom.window.document);
    assert.equal(palette.color, 'rgb(49, 106, 159)');
    assert.equal(palette.source, 'visible');
});

test('page-ref fallback walks the Roam host custom-property chain', () => {
    const dom = domFor(
        '<div style="--page-link-color: rgb(12, 34, 56)"><div class="roam-body-main"></div></div>'
    );
    const palette = readRoamPageLinkPalette(dom.window.document);
    assert.equal(palette.color, 'rgb(12, 34, 56)');
    assert.equal(palette.source, 'custom-property');
});

test('page-ref probe is hidden, offscreen, hosted by Roam, and cleaned up', () => {
    const dom = domFor('<div class="roam-body-main"></div>');
    const style = dom.window.document.createElement('style');
    style.textContent = '.rm-page-ref--link { color: rgb(49, 106, 159); }';
    dom.window.document.head.appendChild(style);
    const host = dom.window.document.querySelector('.roam-body-main');
    const before = host.childElementCount;
    const palette = readRoamPageLinkPalette(dom.window.document);
    assert.equal(palette.color, 'rgb(49, 106, 159)');
    assert.equal(palette.source, 'probe');
    assert.equal(host.childElementCount, before);
    assert.equal(dom.window.document.querySelector('[data-rlb-palette-probe]'), null);
});

test('page-ref fallback follows dark theme without the old generic blue', () => {
    const dom = domFor();
    dom.window.document.documentElement.classList.add('bp3-dark');
    const palette = readRoamPageLinkPalette(dom.window.document);
    assert.equal(palette.color, DARK_PAGE_LINK);
    assert.notEqual(palette.color, '#2d72d2');
});

test('sync palette chooses semantic synced green and rejects transient red', () => {
    const dom = domFor('<div class="rm-topbar"></div>');
    const topbar = dom.window.document.querySelector('.rm-topbar');
    const indicator = dom.window.document.createElement('span');
    indicator.className = 'rm-saving-icon';
    indicator.style.backgroundColor = 'rgb(15, 153, 96)';
    topbar.appendChild(indicator);
    const green = readRoamSyncPalette(dom.window.document);
    assert.equal(green.color, 'rgb(15, 153, 96)');
    indicator.style.backgroundColor = 'rgb(220, 80, 80)';
    const red = readRoamSyncPalette(dom.window.document);
    assert.equal(red.source, 'fallback');
    assert.equal(red.color, '#7eb794');
});

test('theme runtime applies only plugin variables and releases observers cleanly', () => {
    const dom = domFor(
        '<div class="roam-body-main"><span class="rm-page-ref--link" style="color:#316a9f">Page</span></div>' +
            '<div class="rm-topbar"><span class="rm-saving-icon" style="color:#0f9960"></span></div>'
    );
    const root = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(root);
    let updates = 0;
    const runtime = acquireThemeRuntime({
        documentRef: dom.window.document,
        onChange: () => {
            updates += 1;
        },
    });
    runtime.apply(root);
    assert.equal(root.style.getPropertyValue('--rlb-surface-link'), 'rgb(49, 106, 159)');
    assert.equal(root.style.getPropertyValue('--rlb-session-running'), 'rgb(15, 153, 96)');
    assert.equal(root.style.getPropertyValue('--page-link-color'), '');
    assert.ok(updates >= 1);
    runtime.release();
    const stable = updates;
    root.remove();
    assert.equal(updates, stable);
});

test('dark fallback values are available for sync status', () => {
    const dom = domFor();
    dom.window.document.body.classList.add('bp3-dark');
    const palette = readRoamSyncPalette(dom.window.document);
    assert.equal(palette.color, DARK_SYNC_GREEN);
    assert.notEqual(LIGHT_PAGE_LINK, '#2d72d2');
});
