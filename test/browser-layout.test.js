import assert from 'node:assert/strict';
import test from 'node:test';

import { STYLES } from '../src/styles.js';
import { findChromium, withChromium } from './helpers/chromium.js';

const HOST_CSS = `
* { box-sizing: border-box; }
body { margin: 0; color: #182026; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.bp3-button { display: inline-flex; align-items: center; justify-content: center; min-width: 30px; white-space: nowrap; }
.bp3-button > * { flex-grow: 0; flex-shrink: 0; }
.bp3-button::before, .bp3-button > * { margin-right: 7px; }
.bp3-button:empty::before, .bp3-button > :last-child { margin-right: 0; }
.bp3-button::before { flex: 0 0 auto; }
.bp3-icon-document-open::before { content: "↗"; margin-right: 7px; }
`;

const html = body => `<!doctype html><html><head><style>${HOST_CSS}</style><style>${STYLES}</style></head><body>${body}</body></html>`;

const geometryExpression = `(() => {
    const rect = node => {
        const value = node.getBoundingClientRect();
        return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
    };
    const ink = node => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const rangeRect = range.getBoundingClientRect();
        const style = getComputedStyle(node);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.font = [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].join(' ');
        const metrics = context.measureText(node.textContent);
        return {
            left: rangeRect.left - metrics.actualBoundingBoxLeft,
            right: rangeRect.left + metrics.actualBoundingBoxRight,
        };
    };
    const time = document.querySelector('.rlb-topbar__time');
    const separator = document.querySelector('.rlb-topbar__separator');
    const parallel = document.querySelector('.rlb-topbar__parallel');
    const timeStyle = getComputedStyle(time);
    const buttonStyle = getComputedStyle(document.querySelector('.rlb-topbar__button'));
    const timeInk = ink(time);
    const parallelInk = ink(parallel);
    const separatorRect = rect(separator);
    return {
        time: rect(time), separator: separatorRect, parallel: rect(parallel),
        timeInk, parallelInk,
        leftGap: separatorRect.left - timeInk.right,
        rightGap: parallelInk.left - separatorRect.right,
        centerDelta: Math.abs((separatorRect.top + separatorRect.height / 2) - (rect(time).top + rect(time).height / 2)),
        computed: {
            timeWidth: timeStyle.width, minWidth: timeStyle.minWidth, flex: timeStyle.flex,
            display: timeStyle.display, margin: timeStyle.margin, padding: timeStyle.padding,
            buttonDisplay: buttonStyle.display, buttonGap: buttonStyle.gap,
        },
    };
})()`;

const taskGeometryExpression = `(() => {
    const rect = node => {
        const value = node.getBoundingClientRect();
        return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
    };
    const pick = selector => {
        const node = document.querySelector(selector);
        const style = getComputedStyle(node);
        return {
            rect: rect(node), display: style.display, minWidth: style.minWidth, width: style.width,
            maxWidth: style.maxWidth, whiteSpace: style.whiteSpace, overflow: style.overflow,
            overflowWrap: style.overflowWrap, wordBreak: style.wordBreak,
        };
    };
    const title = document.querySelector('.rlb-task-link__text');
    const summary = document.querySelector('.rlb-tree__hidden');
    const titleRange = document.createRange();
    titleRange.selectNodeContents(title);
    const lines = [...titleRange.getClientRects()];
    const titlePaintRight = Math.max(...lines.map(line => line.right));
    const summaryRect = summary.getBoundingClientRect();
    return {
        cell: pick('.rlb-tree__cell'), layout: pick('.rlb-tree__layout'), content: pick('.rlb-tree__content'),
        link: pick('.rlb-task-link'), title: pick('.rlb-task-link__text'), summary: pick('.rlb-tree__hidden'),
        lineCount: lines.length, titlePaintRight, summaryLeft: summaryRect.left,
        separation: summaryRect.left - titlePaintRight,
        intersects: titlePaintRight > summaryRect.left,
    };
})()`;

test('topbar visible glyphs keep equal space around the separator', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const geometry = await withChromium(
        html(`<div class="rm-topbar"><div class="rlb-topbar"><button class="bp3-button bp3-minimal rlb-topbar__button rlb-topbar__button--parallel"><span class="rlb-topbar__time rlb-topbar__time--neutral">16:41</span><span class="rlb-topbar__separator" aria-hidden="true"></span><span class="rlb-topbar__parallel">3 Tasks</span></button></div></div>`),
        geometryExpression
    );
    if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify(geometry));
    assert.ok(Math.abs(geometry.leftGap - geometry.rightGap) <= 1, JSON.stringify(geometry));
    assert.ok(geometry.centerDelta <= 1, JSON.stringify(geometry));
});

test('a collapsed long Task wraps without painting into its summary', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const title = "Graph Engineering: How to Build AI Agent Systems That Don't Break at Scale * 这是一个需要完整换行且不能和摘要粘连的超长任务标题";
    const geometry = await withChromium(
        html(`<table class="rlb-table rlb-task-table" style="width:760px"><colgroup><col><col style="width:80px"><col style="width:88px"><col style="width:88px"></colgroup><tbody><tr><td class="rlb-tree__cell"><div class="rlb-tree__layout"><div class="rlb-tree__leading"><button class="bp3-button bp3-minimal bp3-small rlb-tree__toggle">›</button><span class="rlb-status"></span></div><div class="rlb-tree__content"><button class="bp3-button bp3-minimal bp3-small bp3-icon-document-open rlb-task-link"><span class="rlb-task-link__text">${title}</span></button></div><span class="rlb-muted rlb-tree__hidden">+1 sub-task</span></div></td><td class="rlb-table__num">7</td><td class="rlb-table__num">1h 31m</td><td class="rlb-table__num">1h 31m</td></tr></tbody></table>`),
        taskGeometryExpression
    );
    if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify(geometry));
    assert.equal(geometry.intersects, false, JSON.stringify(geometry));
    assert.ok(geometry.separation >= 8, JSON.stringify(geometry));
    assert.ok(geometry.lineCount >= 2, JSON.stringify(geometry));
    assert.ok(geometry.title.rect.height > 20, JSON.stringify(geometry));
});
