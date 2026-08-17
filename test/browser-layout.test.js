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

// Roam can leave a more specific Blueprint rule in the page after an extension
// reload. Keep this late layer in the fixture so the test catches the failure
// users actually see, rather than only proving our preferred rules in isolation.
const LATE_HOST_CSS = `
.bp3-button.bp3-minimal.rlb-topbar__button--parallel > * {
    margin: 0 12px 0 4px;
    min-width: 4ch;
}
.rlb-task-table .rlb-task-link > .rlb-task-link__text {
    flex: 0 0 auto;
    white-space: nowrap;
}
`;

const htmlWithLateHost = body => `<!doctype html><html><head><style>${HOST_CSS}</style><style>${STYLES}</style><style>${LATE_HOST_CSS}</style></head><body>${body}</body></html>`;

const geometryExpression = `(() => {
    const rect = node => {
        const value = node.getBoundingClientRect();
        return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
    };
    const ink = node => {
        const range = document.createRange();
        range.selectNodeContents(node);
        const rangeRect = range.getBoundingClientRect();
        return {
            left: rangeRect.left,
            right: rangeRect.right,
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

const startedGeometryExpression = `(() => {
    const rect = node => {
        const value = node.getBoundingClientRect();
        return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
    };
    const started = document.querySelector('.rlb-started');
    const date = started.querySelector('.rlb-started__date');
    const time = started.querySelector('.rlb-started__time');
    const dateRect = rect(date);
    const timeRect = rect(time);
    const startedStyle = getComputedStyle(started);
    const cellStyle = getComputedStyle(started.closest('td'));
    return {
        started: rect(started), date: dateRect, time: timeRect,
        display: startedStyle.display, alignItems: startedStyle.alignItems,
        gap: startedStyle.gap, whiteSpace: startedStyle.whiteSpace,
        fontVariantNumeric: startedStyle.fontVariantNumeric,
        cellMinWidth: cellStyle.minWidth, cellWhiteSpace: cellStyle.whiteSpace,
        sameLine: Math.max(dateRect.top, timeRect.top) < Math.min(dateRect.bottom, timeRect.bottom),
    };
})()`;

test('topbar visible glyphs keep equal space around the separator', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const geometry = await withChromium(
        htmlWithLateHost(`<div class="rm-topbar"><div class="rlb-topbar"><button class="bp3-button bp3-minimal rlb-topbar__button rlb-topbar__button--parallel"><span class="rlb-topbar__time rlb-topbar__time--neutral">16:41</span><span class="rlb-topbar__separator" aria-hidden="true"></span><span class="rlb-topbar__parallel">3 Sessions</span></button></div></div>`),
        geometryExpression
    );
    if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify(geometry));
    assert.ok(Math.abs(geometry.leftGap - geometry.rightGap) <= 1, JSON.stringify(geometry));
    assert.ok(geometry.centerDelta <= 1, JSON.stringify(geometry));
    assert.equal(geometry.separator.width, 3, JSON.stringify(geometry));
});

test('Session count keeps 0–3 neutral while higher load uses boundary colors', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    for (const theme of ['', 'bp3-dark']) {
        const geometry = await withChromium(
            htmlWithLateHost(
                `<div class="${theme}"><div class="rlb-topbar"><button class="bp3-button bp3-minimal rlb-topbar__button rlb-topbar__button--parallel"><span class="rlb-topbar__time rlb-topbar__time--neutral">16:41</span><span class="rlb-topbar__separator" aria-hidden="true"></span><span class="rlb-topbar__parallel">3 Sessions</span></button><span class="rlb-topbar__parallel rlb-topbar__parallel--load-yellow">4 Sessions</span><span class="rlb-topbar__parallel rlb-topbar__parallel--load-red">7 Sessions</span></div></div>`
            ),
            `(() => {
                const values = [...document.querySelectorAll('.rlb-topbar__parallel')];
                const separator = document.querySelector('.rlb-topbar__separator');
                return {
                    neutral: getComputedStyle(values[0]).color,
                    yellow: getComputedStyle(values[1]).color,
                    red: getComputedStyle(values[2]).color,
                    separator: getComputedStyle(separator).color,
                    timer: getComputedStyle(document.querySelector('.rlb-topbar__time')).color,
                };
            })()`
        );
        if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify({ theme, geometry }));
        const expected = theme === 'bp3-dark'
            ? {
                  yellow: 'rgb(230, 195, 92)',
                  red: 'rgb(255, 115, 115)',
                  neutral: 'rgb(167, 182, 194)',
              }
            : {
                  yellow: 'rgb(179, 134, 0)',
                  red: 'rgb(194, 48, 48)',
                  neutral: 'rgb(92, 112, 128)',
              };
        assert.deepEqual(
            geometry,
            {
                neutral: expected.neutral,
                yellow: expected.yellow,
                red: expected.red,
                separator: expected.neutral,
                timer: expected.neutral,
            },
            JSON.stringify({ theme, geometry })
        );
    }
});

test('Active Work titles inherit Roam colors without resting or keyboard-focus underlines', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const geometry = await withChromium(
        htmlWithLateHost(
            `<div class="rlb-popover" style="--rlb-surface-link: rgb(123, 45, 67)"><div class="rlb-run"><button class="bp3-button bp3-minimal rlb-run__title" title="Open this block: Reading" aria-label="Open this block: Reading">Reading</button></div></div>`
        ),
        `(() => {
            const title = document.querySelector('.rlb-run__title');
            const normal = getComputedStyle(title);
            const normalColor = normal.color;
            const normalDecoration = normal.textDecorationLine;
            title.focus();
            const style = getComputedStyle(title);
            return {
                normalColor,
                normalDecoration,
                color: style.color,
                decoration: style.textDecorationLine,
                outline: style.outlineColor,
            };
        })()`
    );
    assert.equal(geometry.normalColor, 'rgb(123, 45, 67)', JSON.stringify(geometry));
    assert.equal(geometry.normalDecoration, 'none', JSON.stringify(geometry));
    assert.equal(geometry.decoration, 'none', JSON.stringify(geometry));
    assert.equal(geometry.outline, geometry.color, JSON.stringify(geometry));
});

test('Dashboard task links keep Roam reference text, sampled link colors, and narrow wrapping without icon cues', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const title = 'Build [[Project Page]] #[[urgent]] with a title that wraps in a narrow Dashboard';
    for (const theme of ['', 'bp3-dark']) {
        const geometry = await withChromium(
            htmlWithLateHost(
                `<div class="${theme}"><div class="rlb-root rlb-root--open rlb-dashboard" style="width:360px"><div class="rlb-dialog" style="width:320px"><section class="rlb-dashboard-section rlb-dashboard-panel rlb-by-task"><table class="rlb-table rlb-task-table" style="width:100%"><tbody><tr><td class="rlb-tree__cell"><div class="rlb-tree__layout"><div class="rlb-tree__leading"></div><div class="rlb-tree__content"><button class="bp3-button bp3-minimal bp3-small rlb-task-link" title="Open this block: ${title}" aria-label="Open this block: ${title}"><span class="rlb-task-link__text">${title}</span></button></div></div></td><td class="rlb-table__num">1</td><td class="rlb-table__num">1m</td><td class="rlb-table__num">1m</td></tr></tbody></table></section></div></div></div>`
            ),
            `(() => {
                const link = document.querySelector('.rlb-task-link');
                const text = link.querySelector('.rlb-task-link__text');
                const normal = getComputedStyle(link);
                const before = getComputedStyle(link, '::before');
                const rect = link.getBoundingClientRect();
                return {
                    text: text.textContent,
                    title: link.title,
                    aria: link.getAttribute('aria-label'),
                    hasIconClass: link.classList.contains('bp3-icon-document-open'),
                    hasIconCueClass: link.classList.contains('rlb-task-link--icon'),
                    navigationCue: link.dataset.navigationCue,
                    pseudoContent: before.content,
                    color: normal.color,
                    decoration: normal.textDecorationLine,
                    width: rect.width,
                    scrollWidth: link.scrollWidth,
                };
            })()`
        );
        const expectedColor = theme === 'bp3-dark' ? 'rgb(126, 183, 213)' : 'rgb(49, 106, 159)';
        if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify({ theme, geometry }));
        assert.equal(geometry.text, title, JSON.stringify({ theme, geometry }));
        assert.equal(geometry.title, `Open this block: ${title}`, JSON.stringify({ theme, geometry }));
        assert.equal(geometry.aria, geometry.title, JSON.stringify({ theme, geometry }));
        assert.equal(geometry.hasIconClass, false, JSON.stringify({ theme, geometry }));
        assert.equal(geometry.hasIconCueClass, false, JSON.stringify({ theme, geometry }));
        assert.equal(geometry.navigationCue, undefined, JSON.stringify({ theme, geometry }));
        assert.ok(['none', 'normal'].includes(geometry.pseudoContent), JSON.stringify({ theme, geometry }));
        assert.equal(geometry.color, expectedColor, JSON.stringify({ theme, geometry }));
        assert.equal(geometry.decoration, 'none', JSON.stringify({ theme, geometry }));
        assert.ok(geometry.width > 0, JSON.stringify({ theme, geometry }));
        assert.ok(geometry.scrollWidth <= geometry.width + 1, JSON.stringify({ theme, geometry }));
    }
});

test('DONE Parallel Threads use a non-interactive completed indicator while TODO keeps focus', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const geometry = await withChromium(
        htmlWithLateHost(`
            <div class="rlb-popover" style="width:360px">
                <div class="rlb-run rlb-run--recent" data-session-state="recent" data-task-status="DONE">
                    <div class="rlb-run__body">
                        <button class="bp3-button bp3-minimal rlb-run__title" title="Open this block: Done line" aria-label="Open this block: Done line">Done line</button>
                    </div>
                    <div class="rlb-run__actions">
                        <span class="bp3-icon bp3-icon-tick-circle rlb-run__completed" role="img" title="Completed" aria-label="Completed"></span>
                    </div>
                </div>
                <div class="rlb-run rlb-run--recent" data-session-state="recent" data-task-status="TODO">
                    <div class="rlb-run__body">
                        <button class="bp3-button bp3-minimal rlb-run__title" title="Open this block: Todo line" aria-label="Open this block: Todo line">Todo line</button>
                    </div>
                    <div class="rlb-run__actions">
                        <button class="bp3-button bp3-small bp3-minimal bp3-icon-play rlb-run__focus" data-action="focus-recent" title="Switch Focus to Todo line" aria-label="Switch Focus to Todo line"></button>
                    </div>
                </div>
            </div>
        `),
        `(() => {
            const done = document.querySelector('[data-task-status="DONE"]');
            const todo = document.querySelector('[data-task-status="TODO"]');
            const completed = done.querySelector('.rlb-run__completed');
            const focus = todo.querySelector('[data-action="focus-recent"]');
            const completedStyle = getComputedStyle(completed);
            const completedRect = completed.getBoundingClientRect();
            return {
                completedTag: completed.tagName,
                completedRole: completed.getAttribute('role'),
                completedTitle: completed.title,
                completedAria: completed.getAttribute('aria-label'),
                completedAction: completed.dataset.action,
                doneFocus: done.querySelector('[data-action="focus-recent"]'),
                completedIcon: completed.classList.contains('bp3-icon-tick-circle'),
                completedPointerEvents: completedStyle.pointerEvents,
                completedWidth: completedRect.width,
                completedHeight: completedRect.height,
                todoFocusTag: focus.tagName,
                todoFocusAction: focus.dataset.action,
            };
        })()`
    );

    assert.equal(geometry.completedTag, 'SPAN', JSON.stringify(geometry));
    assert.equal(geometry.completedRole, 'img', JSON.stringify(geometry));
    assert.equal(geometry.completedTitle, 'Completed', JSON.stringify(geometry));
    assert.equal(geometry.completedAria, 'Completed', JSON.stringify(geometry));
    assert.equal(geometry.completedAction, undefined, JSON.stringify(geometry));
    assert.equal(geometry.doneFocus, null, JSON.stringify(geometry));
    assert.equal(geometry.completedIcon, true, JSON.stringify(geometry));
    assert.equal(geometry.completedPointerEvents, 'none', JSON.stringify(geometry));
    assert.ok(geometry.completedWidth >= 28, JSON.stringify(geometry));
    assert.ok(geometry.completedHeight >= 28, JSON.stringify(geometry));
    assert.equal(geometry.todoFocusTag, 'BUTTON', JSON.stringify(geometry));
    assert.equal(geometry.todoFocusAction, 'focus-recent', JSON.stringify(geometry));
});

test('topbar remains a stable unit while Roam search expands and at narrow widths', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    for (const width of [720, 480, 360]) {
        const geometry = await withChromium(
            htmlWithLateHost(`<div class="rm-topbar" style="width:${width}px"><div class="rlb-topbar__layout" style="width:100%"><div class="rlb-nav" style="flex:0 0 72px">‹ ›</div><div class="rlb-topbar rlb-topbar__widget"><button class="bp3-button bp3-minimal rlb-topbar__button rlb-topbar__button--parallel"><span class="rlb-topbar__time rlb-topbar__time--neutral">16:41</span><span class="rlb-topbar__separator" aria-hidden="true"></span><span class="rlb-topbar__parallel">3 Sessions</span></button></div><div class="rlb-topbar__search"><input style="width:100%" aria-label="Find or create a page" /></div><div class="rlb-right" style="flex:0 0 56px">?</div></div></div>`),
            `(() => {
                const rect = node => { const r = node.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
                const layout = document.querySelector('.rlb-topbar__layout');
                const widget = document.querySelector('.rlb-topbar__widget');
                const search = document.querySelector('.rlb-topbar__search');
                const right = document.querySelector('.rlb-right');
                const time = document.querySelector('.rlb-topbar__time');
                const separator = document.querySelector('.rlb-topbar__separator');
                const parallel = document.querySelector('.rlb-topbar__parallel');
                const range = document.createRange();
                range.selectNodeContents(time);
                const timeInk = range.getBoundingClientRect();
                range.selectNodeContents(parallel);
                const parallelInk = range.getBoundingClientRect();
                const separatorRect = separator.getBoundingClientRect();
                return {
                    width: ${width}, layout: rect(layout), widget: rect(widget), search: rect(search), right: rect(right),
                    noOverlap: rect(widget).left >= rect(layout).left && rect(widget).right <= rect(search).left + .5 && rect(search).right <= rect(right).left + .5,
                    widgetFits: rect(widget).right <= rect(layout).right + .5,
                    timeVisible: timeInk.width > 0 && timeInk.right <= rect(widget).right + .5,
                    narrowKeepsTime: timeInk.width > 0 && timeInk.right <= rect(widget).right + .5,
                    centeredDot: parallel.getBoundingClientRect().width === 0 || Math.abs((separatorRect.top + separatorRect.height / 2) - (time.getBoundingClientRect().top + time.getBoundingClientRect().height / 2)) <= 1,
                    fullLabel: ${width} > 420 ? parallelInk.width > 0 && parallel.textContent === '3 Sessions' : true,
                    computed: { widgetFlex:getComputedStyle(widget).flex, widgetMin:getComputedStyle(widget).minWidth, widgetWhiteSpace:getComputedStyle(widget).whiteSpace, searchFlex:getComputedStyle(search).flex, searchMin:getComputedStyle(search).minWidth }
                };
            })()`
        );
        if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify(geometry));
        assert.equal(geometry.noOverlap, true, JSON.stringify(geometry));
        assert.equal(geometry.widgetFits, true, JSON.stringify(geometry));
        assert.equal(geometry.timeVisible, true, JSON.stringify(geometry));
        assert.equal(geometry.narrowKeepsTime, true, JSON.stringify(geometry));
        assert.equal(geometry.fullLabel, true, JSON.stringify(geometry));
        assert.equal(geometry.computed.widgetFlex, '0 0 auto', JSON.stringify(geometry));
        assert.equal(geometry.computed.widgetMin, 'max-content', JSON.stringify(geometry));
        assert.equal(geometry.computed.widgetWhiteSpace, 'nowrap', JSON.stringify(geometry));
        assert.equal(geometry.computed.searchMin, '0px', JSON.stringify(geometry));
    }
});

test('idle topbar icon keeps a square hit target through focus and narrow search layout', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const geometry = await withChromium(
        htmlWithLateHost(`<div class="rm-topbar" style="width:360px"><div class="rlb-topbar__layout" style="width:100%"><div class="rlb-nav" style="flex:0 0 72px">‹ ›</div><div class="rlb-topbar"><button class="bp3-button bp3-minimal rlb-topbar__button rlb-topbar__button--icon-only" aria-label="Roam Logbook"><span class="bp3-icon bp3-icon-history rlb-topbar__icon"></span></button></div><div class="rlb-topbar__search" style="flex:1 1 auto"><input style="width:100%" aria-label="Find or create a page" /></div><div class="rlb-right" style="flex:0 0 56px">?</div></div></div>`),
        `(() => {
            const button = document.querySelector('.rlb-topbar__button');
            const icon = document.querySelector('.rlb-topbar__icon');
            const rect = node => { const r = node.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
            const before = getComputedStyle(button, '::before');
            button.focus();
            const focused = getComputedStyle(button);
            const buttonRect = rect(button);
            const layoutRect = rect(document.querySelector('.rlb-topbar__layout'));
            const searchRect = rect(document.querySelector('.rlb-topbar__search'));
            return {
                button: buttonRect,
                icon: rect(icon),
                layout: layoutRect,
                search: searchRect,
                square: Math.abs(buttonRect.width - buttonRect.height) <= 1,
                target: buttonRect.width >= 30 && buttonRect.width <= 34 && buttonRect.height >= 30 && buttonRect.height <= 34,
                noPseudoContent: before.content === 'none' || before.content === 'normal' || before.width === 'auto',
                focusedBackground: focused.backgroundColor,
                noOverlap: buttonRect.right <= searchRect.left + .5 && searchRect.right <= layoutRect.right + .5,
                centered: Math.abs((buttonRect.left + buttonRect.width / 2) - (layoutRect.left + 72 + buttonRect.width / 2)) < 100
            };
        })()`
    );
    if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify(geometry));
    assert.equal(geometry.square, true, JSON.stringify(geometry));
    assert.equal(geometry.target, true, JSON.stringify(geometry));
    assert.equal(geometry.noPseudoContent, true, JSON.stringify(geometry));
    assert.notEqual(geometry.focusedBackground, 'rgba(0, 0, 0, 0)', JSON.stringify(geometry));
    assert.equal(geometry.noOverlap, true, JSON.stringify(geometry));
});

test('a collapsed long Task wraps without painting into its summary', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const title = "Graph Engineering: How to Build AI Agent Systems That Don't Break at Scale * 这是一个需要完整换行且不能和摘要粘连的超长任务标题";
    const geometry = await withChromium(
        htmlWithLateHost(`<table class="rlb-table rlb-task-table" style="width:760px"><colgroup><col><col style="width:80px"><col style="width:88px"><col style="width:88px"></colgroup><tbody><tr><td class="rlb-tree__cell"><div class="rlb-tree__layout"><div class="rlb-tree__leading"><button class="bp3-button bp3-minimal bp3-small rlb-tree__toggle">›</button><span class="rlb-status"></span></div><div class="rlb-tree__content"><button class="bp3-button bp3-minimal bp3-small bp3-icon-document-open rlb-task-link"><span class="rlb-task-link__text">${title}</span></button></div><span class="rlb-muted rlb-tree__hidden">+1 sub-task</span></div></td><td class="rlb-table__num">7</td><td class="rlb-table__num">1h 31m</td><td class="rlb-table__num">1h 31m</td></tr></tbody></table>`),
        taskGeometryExpression
    );
    if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify(geometry));
    assert.equal(geometry.intersects, false, JSON.stringify(geometry));
    assert.ok(geometry.separation >= 8, JSON.stringify(geometry));
    assert.ok(geometry.lineCount >= 2, JSON.stringify(geometry));
    assert.ok(geometry.title.rect.height > 20, JSON.stringify(geometry));
});

test('Started date and time stay on one baseline-aligned compact line', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const geometry = await withChromium(
        htmlWithLateHost(`<table class="rlb-table" style="width:760px"><tbody><tr><td class="rlb-cell">Task</td><td class="rlb-muted rlb-started-cell"><time class="rlb-started" datetime="2026-08-14T21:30" title="[2026-08-14 Fri 21:30]"><span class="rlb-started__date">Aug 14</span><span class="rlb-started__time">21:30</span></time></td><td class="rlb-table__num">5:44</td></tr></tbody></table>`),
        startedGeometryExpression
    );
    if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify(geometry));
    assert.equal(geometry.display, 'inline-flex', JSON.stringify(geometry));
    assert.equal(geometry.alignItems, 'baseline', JSON.stringify(geometry));
    assert.equal(geometry.gap, '8px', JSON.stringify(geometry));
    assert.equal(geometry.whiteSpace, 'nowrap', JSON.stringify(geometry));
    assert.equal(geometry.cellWhiteSpace, 'nowrap', JSON.stringify(geometry));
    assert.match(geometry.fontVariantNumeric, /tabular-nums/, JSON.stringify(geometry));
    assert.equal(geometry.sameLine, true, JSON.stringify(geometry));
    assert.ok(Number.parseFloat(geometry.cellMinWidth) >= 120, JSON.stringify(geometry));
});

test('dashboard overview stays four-column desktop without a secondary view', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const markup = `<div class="rlb-root rlb-root--open rlb-dashboard"><div class="rlb-dialog" style="width:960px"><header class="rlb-header bp3-dialog-header"><div class="rlb-header__heading"><h2 class="rlb-header__title">Roam Logbook</h2></div><select aria-label="Dashboard date range"><option>Last 7 days</option></select></header><div class="rlb-summary"><dl class="rlb-overview rlb-overview--compact" aria-label="Roam Logbook overview"><div class="rlb-overview__item"><dt class="rlb-overview__label">Today</dt><dd class="rlb-overview__value">2h 17m</dd></div><div class="rlb-overview__item"><dt class="rlb-overview__label">Last 7 days</dt><dd class="rlb-overview__value">13h 47m</dd></div><div class="rlb-overview__item"><dt class="rlb-overview__label">Sessions</dt><dd class="rlb-overview__value">7</dd></div><div class="rlb-overview__item"><dt class="rlb-overview__label">Tasks tracked</dt><dd class="rlb-overview__value">6</dd></div></dl></div><div class="rlb-body"><section class="rlb-dashboard-section rlb-by-task"><table class="rlb-table"><tbody><tr><td>Reading</td><td>2</td><td>1h</td><td>1h</td></tr></tbody></table></section></div></div></div>`;
    const geometry = await withChromium(
        htmlWithLateHost(markup),
        `(() => {
            const overview = document.querySelector('.rlb-overview');
            const dialog = document.querySelector('.rlb-dialog');
            const body = document.querySelector('.rlb-body');
            const rect = node => { const r = node.getBoundingClientRect(); return { width:r.width, height:r.height, left:r.left, right:r.right }; };
            return {
                metrics: overview.querySelectorAll('.rlb-overview__item').length,
                grid: getComputedStyle(overview).gridTemplateColumns,
                height: rect(overview).height,
                overflow: dialog.scrollWidth > dialog.clientWidth + 1 || body.scrollWidth > body.clientWidth + 1,
                secondaryView: Boolean(document.querySelector('[data-action="toggle-view"], .rlb-dashboard__view-toggle, svg')),
            };
        })()`
    );
    assert.equal(geometry.metrics, 4, JSON.stringify(geometry));
    assert.equal(geometry.grid.trim().split(/\s+/).length, 4, JSON.stringify(geometry));
    assert.ok(geometry.height >= 64 && geometry.height <= 72, JSON.stringify(geometry));
    assert.equal(geometry.overflow, false, JSON.stringify(geometry));
    assert.equal(geometry.secondaryView, false, JSON.stringify(geometry));
});

test('beta.14 compact overview becomes two-by-two on mobile without overflow', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const markup = `<div class="rlb-root rlb-root--open rlb-dashboard"><div class="rlb-dialog"><div class="rlb-summary"><dl class="rlb-overview rlb-overview--compact"><div class="rlb-overview__item"><dt>Today</dt><dd>2h</dd></div><div class="rlb-overview__item"><dt>Range</dt><dd>13h</dd></div><div class="rlb-overview__item"><dt>Sessions</dt><dd>7</dd></div><div class="rlb-overview__item"><dt>Tasks tracked</dt><dd>6</dd></div></dl></div><div class="rlb-body"></div></div></div>`;
    const geometry = await withChromium(
        htmlWithLateHost(markup),
        `(() => {
            const overview = document.querySelector('.rlb-overview');
            const items = [...overview.querySelectorAll('.rlb-overview__item')];
            const rect = node => { const r = node.getBoundingClientRect(); return { top:r.top, left:r.left, right:r.right, height:r.height }; };
            const first = rect(items[0]);
            const third = rect(items[2]);
            return {
                count: items.length,
                height: rect(overview).height,
                grid: getComputedStyle(overview).gridTemplateColumns,
                twoColumns: first.left !== rect(items[1]).left && first.top !== third.top,
                noOverflow: document.querySelector('.rlb-dialog').scrollWidth <= document.querySelector('.rlb-dialog').clientWidth + 1,
            };
        })()`,
        { width: 480, height: 900 }
    );
    if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify(geometry));
    assert.equal(geometry.count, 4, JSON.stringify(geometry));
    assert.ok(geometry.height >= 110 && geometry.height <= 120, JSON.stringify(geometry));
    assert.equal(geometry.twoColumns, true, JSON.stringify(geometry));
    assert.equal(geometry.noOverflow, true, JSON.stringify(geometry));
});

test('Session rows omit status bullets and align content in a two-column grid', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const geometry = await withChromium(
        htmlWithLateHost(`<div class="rlb-popover" style="width:340px"><div class="rlb-run rlb-run--recent" data-session-state="recent"><div class="rlb-run__body"><button class="bp3-button bp3-minimal rlb-run__title">一个需要完整保留且视觉省略的中文任务标题 Graph Engineering</button><div class="rlb-run__meta"><div class="rlb-run__meta-line">30m total · 4m ago</div><div class="rlb-run__meta-line">A second metadata line</div></div></div><div class="rlb-run__actions"><button class="bp3-button bp3-minimal bp3-icon-play rlb-run__focus" title="Switch Focus" aria-label="Switch Focus"></button></div></div></div>`),
        `(() => {
            const rect = node => { const r = node.getBoundingClientRect(); return { top:r.top, bottom:r.bottom, left:r.left, right:r.right, width:r.width, height:r.height }; };
            const row = document.querySelector('.rlb-run');
            const title = document.querySelector('.rlb-run__title');
            const meta = document.querySelector('.rlb-run__meta');
            const actions = document.querySelector('.rlb-run__actions');
            const bodyStyle = getComputedStyle(document.querySelector('.rlb-run__body'));
            const titleRect = rect(title);
            const rowRect = rect(row);
            return {
                statusCount: document.querySelectorAll('.rlb-run__status').length,
                title: titleRect,
                meta: rect(meta),
                actions: rect(actions),
                row: rowRect,
                bodyDisplay: bodyStyle.display,
                titleGridColumn: getComputedStyle(title).gridColumn,
                titleGridRow: getComputedStyle(title).gridRow,
                metaGridColumn: getComputedStyle(meta).gridColumn,
                metaGridRow: getComputedStyle(meta).gridRow,
                actionsGridColumn: getComputedStyle(actions).gridColumn,
                actionsGridRow: getComputedStyle(actions).gridRow,
                titleStartsAtRowContent: Math.abs(titleRect.left - (rowRect.left + 6)) <= 1,
                metadataBelowTitle: meta.getBoundingClientRect().top >= titleRect.bottom - .5,
                titleBeforeActions: titleRect.right <= rect(actions).left + .5
            };
        })()`
    );
    if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify(geometry));
    assert.equal(geometry.bodyDisplay, 'contents', JSON.stringify(geometry));
    assert.equal(geometry.statusCount, 0, JSON.stringify(geometry));
    assert.equal(geometry.titleGridColumn, '1', JSON.stringify(geometry));
    assert.equal(geometry.titleGridRow, '1', JSON.stringify(geometry));
    assert.equal(geometry.metaGridColumn, '1', JSON.stringify(geometry));
    assert.equal(geometry.metaGridRow, '2', JSON.stringify(geometry));
    assert.equal(geometry.actionsGridColumn, '2', JSON.stringify(geometry));
    assert.equal(geometry.actionsGridRow, '1 / span 2', JSON.stringify(geometry));
    assert.equal(geometry.titleStartsAtRowContent, true, JSON.stringify(geometry));
    assert.equal(geometry.metadataBelowTitle, true, JSON.stringify(geometry));
    assert.equal(geometry.titleBeforeActions, true, JSON.stringify(geometry));
});

test('Session task title is the restrained link target without a leading open icon', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const longTitle = 'A long Session title that remains accessible while truncating cleanly';
    const geometry = await withChromium(
        htmlWithLateHost(
            `<div class="rlb-popover" style="width:320px"><div class="rlb-surface__list" role="group" aria-label="Current Sessions"><div class="rlb-run rlb-run--inline-meta"><div class="rlb-run__body"><button class="bp3-button bp3-minimal rlb-run__title" type="button" title="Open this block: ${longTitle}" aria-label="Open this block: ${longTitle}">${longTitle}</button><div class="rlb-run__meta"><div class="rlb-run__meta-line">12:34 · 2h 05m total</div><time class="rlb-run__meta-line">Today 09:12</time></div></div><div class="rlb-run__actions"><button class="bp3-button bp3-small bp3-minimal bp3-icon-log-out rlb-run__checkout" data-action="clock-out" title="Check Out" aria-label="Check Out"></button><button class="bp3-button bp3-small bp3-minimal bp3-icon-trash" data-action="discard" title="Discard this CLOCK entry" aria-label="Discard this CLOCK entry"></button></div></div></div></div>`
        ),
        `(() => {
            const rect = node => { const r = node.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
            const title = document.querySelector('.rlb-run__title');
            const actions = document.querySelector('.rlb-run__actions');
            const row = document.querySelector('.rlb-run');
            const titleStyle = getComputedStyle(title);
            const beforeStyle = getComputedStyle(title, '::before');
            title.focus();
            const focusStyle = getComputedStyle(title);
            const titleRect = rect(title);
            const actionsRect = rect(actions);
            const rowRect = rect(row);
            return {
                hasOpenIconClass: title.classList.contains('bp3-icon-document-open'),
                beforeContent: beforeStyle.content,
                beforeDisplay: beforeStyle.display,
                title: titleRect,
                actions: actionsRect,
                statusCount: document.querySelectorAll('.rlb-run__status').length,
                titleGridColumn: getComputedStyle(title).gridColumn,
                actionsGridColumn: getComputedStyle(actions).gridColumn,
                titleStartsAtRowContent: Math.abs(titleRect.left - (rowRect.left + 6)) <= 1,
                titleEndsBeforeActions: titleRect.right <= actionsRect.left + .5,
                titleClips: title.scrollWidth > title.clientWidth,
                rowInsidePopover: rowRect.left >= 0 && rowRect.right <= 320.5,
                noUnderline: titleStyle.textDecorationLine === 'none' && focusStyle.textDecorationLine === 'none',
                focusRing: focusStyle.outlineStyle !== 'none' && parseFloat(focusStyle.outlineWidth) > 0,
                accessibleName: title.getAttribute('aria-label'),
                tooltip: title.title
            };
        })()`
    );
    if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify(geometry));
    assert.equal(geometry.hasOpenIconClass, false, JSON.stringify(geometry));
    assert.equal(geometry.beforeContent, 'none', JSON.stringify(geometry));
    assert.equal(geometry.beforeDisplay, 'none', JSON.stringify(geometry));
    assert.equal(geometry.statusCount, 0, JSON.stringify(geometry));
    assert.equal(geometry.titleGridColumn, '1', JSON.stringify(geometry));
    assert.equal(geometry.actionsGridColumn, '2', JSON.stringify(geometry));
    assert.equal(geometry.titleStartsAtRowContent, true, JSON.stringify(geometry));
    assert.equal(geometry.titleEndsBeforeActions, true, JSON.stringify(geometry));
    assert.equal(geometry.titleClips, true, JSON.stringify(geometry));
    assert.equal(geometry.rowInsidePopover, true, JSON.stringify(geometry));
    assert.equal(geometry.noUnderline, true, JSON.stringify(geometry));
    assert.equal(geometry.focusRing, true, JSON.stringify(geometry));
    assert.match(geometry.accessibleName, /^Open this block:/, JSON.stringify(geometry));
    assert.match(geometry.tooltip, /^Open this block:/, JSON.stringify(geometry));
});

test('shared session header actions and bulk footer stay usable at 340px and 320px', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    for (const width of [340, 320]) {
        const expression = `(() => {
            const popover = document.querySelector('.rlb-popover');
            const row = popover.querySelector('.rlb-run');
            const title = row.querySelector('.rlb-run__title');
            const body = row.querySelector('.rlb-run__body');
            const actions = row.querySelector('.rlb-run__actions');
            const meta = row.querySelector('.rlb-run__meta');
            const rect = node => {
                const value = node.getBoundingClientRect();
                return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
            };
            const popRect = rect(popover);
            const header = popover.querySelector('.rlb-surface__header');
            const headerActions = popover.querySelector('.rlb-surface__actions');
            const headerActionNodes = [...headerActions.children];
            const dashboard = popover.querySelector('[data-action="dashboard"]');
            const refreshCell = popover.querySelector('.rlb-surface__refresh-cell');
            const refresh = refreshCell.querySelector('[data-action="refresh"]');
            const close = popover.querySelector('[data-action="close"]');
            const footer = popover.querySelector('.rlb-surface__footer');
            const footerButtons = [...footer.querySelectorAll('button')];
            const footerRects = footerButtons.map(rect);
            const actionRects = headerActionNodes.map(rect);
            const status = refreshCell.querySelector('.rlb-surface__refresh-status');
            return {
                popover: popRect,
                title: rect(title), body: rect(body), actions: rect(actions), meta: rect(meta),
                lines: row.querySelectorAll('.rlb-run__meta-line').length,
                titleClips: title.scrollWidth > title.clientWidth,
                rowHasDot: Boolean(row.querySelector('.rlb-dot')),
                headerActionCount: headerActionNodes.length,
                headerTitleBeforeActions: rect(header.querySelector('.rlb-popover__title')).right <= rect(headerActions).left + .5,
                headerActionsInside: actionRects.every(item => item.left >= popRect.left && item.right <= popRect.right + .5 && item.top >= popRect.top && item.bottom <= popRect.bottom + .5),
                iconGeometry: actionRects.map(item => ({ width: item.width, height: item.height })),
                headerOrder: [dashboard.dataset.action, 'refresh-cell', close.dataset.action],
                iconLabels: [dashboard, refresh, close].every(button => button.title && button.getAttribute('aria-label') && button.type === 'button'),
                refreshLoading: refresh.classList.contains('rlb-surface__refresh--loading') && refresh.disabled && refresh.getAttribute('aria-busy') === 'true',
                statusHidden: getComputedStyle(status).width === '1px' && getComputedStyle(status).height === '1px',
                footerLabels: footerButtons.map(button => button.textContent),
                footerInside: footerRects.every(item => item.left >= popRect.left && item.right <= popRect.right && item.top >= popRect.top && item.bottom <= popRect.bottom),
                footerHeight: rect(footer).height,
                overflow: popover.scrollWidth > popover.clientWidth + 1,
            };
        })()`;
        const longTitle = 'A very long Session title that should ellipsize visually while remaining available to assistive technology';
        const geometry = await withChromium(
            htmlWithLateHost(`<div class="rlb-popover" style="width:${width}px"><header class="rlb-surface__header"><div class="rlb-popover__title">ACTIVE WORK</div><div class="rlb-surface__actions"><button type="button" class="bp3-button bp3-minimal bp3-small bp3-icon-dashboard rlb-surface__icon-button" data-action="dashboard" title="Open Roam Logbook Dashboard" aria-label="Open Roam Logbook Dashboard"></button><div class="rlb-surface__refresh-cell" data-refresh-state="loading"><button type="button" class="bp3-button bp3-minimal bp3-small bp3-icon-refresh rlb-surface__icon-button rlb-surface__refresh rlb-surface__refresh--loading" data-action="refresh" title="Refresh Active Work from graph" aria-label="Refresh Active Work from graph" aria-busy="true" disabled></button><span class="rlb-surface__refresh-status rlb-visually-hidden" role="status" aria-live="polite" aria-atomic="true">Refreshing</span></div><button type="button" class="bp3-button bp3-minimal bp3-small bp3-icon-cross rlb-surface__icon-button" data-action="close" title="Close Current Sessions" aria-label="Close Current Sessions"></button></div></header><div class="rlb-run rlb-run--inline-meta"><div class="rlb-run__body"><button class="bp3-button bp3-minimal rlb-run__title" title="Open this block: ${longTitle}" aria-label="Open this block: ${longTitle}">${longTitle}</button><div class="rlb-run__meta"><div class="rlb-run__meta-line rlb-run__meta-primary">12:34 · target 30:00 · 2h 05m total</div><span class="rlb-run__meta-separator" aria-hidden="true">·</span><time class="rlb-run__meta-line rlb-run__started" title="Started [2026-08-14 Fri 21:30] · Page: Project Page" aria-label="Started [2026-08-14 Fri 21:30] · Page: Project Page">Aug 14 21:30</time></div></div><div class="rlb-run__actions"><button class="bp3-button bp3-small bp3-minimal bp3-icon-log-out rlb-run__checkout" data-action="clock-out" title="Check Out" aria-label="Check Out"></button><button class="bp3-button bp3-minimal bp3-small bp3-icon-trash" data-action="discard" title="Discard this CLOCK entry (cannot be undone)" aria-label="Discard this CLOCK entry (cannot be undone)"></button></div></div><footer class="rlb-surface__footer"><button class="bp3-button bp3-small bp3-intent-danger">Clock Out All</button></footer></div>`),
            expression
        );
        if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify({ width, geometry }));
        assert.ok(geometry.popover.width <= width + 0.5, JSON.stringify({ width, geometry }));
        assert.equal(geometry.lines, 2, JSON.stringify({ width, geometry }));
        assert.equal(geometry.titleClips, true, JSON.stringify({ width, geometry }));
        assert.ok(geometry.meta.height <= 20, JSON.stringify({ width, geometry }));
        assert.ok(geometry.title.right <= geometry.actions.left + 0.5, JSON.stringify({ width, geometry }));
        assert.equal(geometry.rowHasDot, false, JSON.stringify({ width, geometry }));
        assert.equal(geometry.headerActionCount, 3, JSON.stringify({ width, geometry }));
        assert.equal(geometry.headerTitleBeforeActions, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.headerActionsInside, true, JSON.stringify({ width, geometry }));
        assert.deepEqual(geometry.headerOrder, ['dashboard', 'refresh-cell', 'close'], JSON.stringify({ width, geometry }));
        assert.ok(geometry.iconGeometry.every(item => item.width >= 30 && item.width <= 32 && item.height >= 30 && item.height <= 32), JSON.stringify({ width, geometry }));
        assert.equal(geometry.iconLabels, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.refreshLoading, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.statusHidden, true, JSON.stringify({ width, geometry }));
        assert.deepEqual(geometry.footerLabels, ['Clock Out All'], JSON.stringify({ width, geometry }));
        assert.equal(geometry.footerInside, true, JSON.stringify({ width, geometry }));
        assert.ok(geometry.footerHeight >= 32, JSON.stringify({ width, geometry }));
        assert.equal(geometry.overflow, false, JSON.stringify({ width, geometry }));
    }
});

test('Session metadata stays on one inline row without crowding actions', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    for (const width of [340, 320]) {
        const geometry = await withChromium(
            htmlWithLateHost(`
                <div class="rlb-popover" style="width:${width}px">
                    <div class="rlb-surface__list" role="group" aria-label="Current Sessions">
                        <div class="rlb-run rlb-run--inline-meta" data-session-state="running">
                            <div class="rlb-run__body">
                                <button class="bp3-button bp3-minimal rlb-run__title" type="button" title="Open this block: A long Session title" aria-label="Open this block: A long Session title">A long Session title</button>
                                <div class="rlb-run__meta">
                                    <div class="rlb-run__meta-line rlb-run__meta-primary">27:02 · 13h 33m total</div>
                                    <span class="rlb-run__meta-separator" aria-hidden="true">·</span>
                                    <time class="rlb-run__meta-line rlb-run__started" datetime="2026-08-15T15:05" title="Started [2026-08-15 Sat 15:05]" aria-label="Started [2026-08-15 Sat 15:05]">Today 15:05</time>
                                </div>
                            </div>
                            <div class="rlb-run__actions">
                                <button class="bp3-button bp3-small bp3-minimal bp3-icon-log-out rlb-run__checkout" data-action="clock-out" title="Check Out" aria-label="Check Out"></button>
                                <button class="bp3-button bp3-small bp3-minimal bp3-icon-trash" data-action="discard" title="Discard this CLOCK entry" aria-label="Discard this CLOCK entry"></button>
                            </div>
                        </div>
                        <div class="rlb-run rlb-run--recent" data-session-state="recent">
                            <div class="rlb-run__body">
                                <button class="bp3-button bp3-minimal rlb-run__title" type="button" title="Open this block: Reading" aria-label="Open this block: Reading">Reading</button>
                                <div class="rlb-run__meta">
                                    <time class="rlb-run__meta-line rlb-run__started" datetime="2026-08-15T15:05" title="Last active [2026-08-15 Sat 15:05]" aria-label="Last active [2026-08-15 Sat 15:05]">Today 15:05</time>
                                </div>
                            </div>
                            <div class="rlb-run__actions">
                                <button class="bp3-button bp3-small bp3-minimal bp3-icon-play rlb-run__focus" data-action="focus-recent" title="Switch Focus" aria-label="Switch Focus"></button>
                            </div>
                        </div>
                    </div>
                </div>
            `),
            `(() => {
                const rect = node => {
                    const value = node.getBoundingClientRect();
                    return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
                };
                const running = document.querySelector('[data-session-state="running"]');
                const meta = running.querySelector('.rlb-run__meta');
                const primary = running.querySelector('.rlb-run__meta-primary');
                const separator = running.querySelector('.rlb-run__meta-separator');
                const started = running.querySelector('.rlb-run__started');
                const actions = running.querySelector('.rlb-run__actions');
                const title = running.querySelector('.rlb-run__title');
                const metaItems = [primary, started].map(rect);
                const metaRect = rect(meta);
                const actionRect = rect(actions);
                const titleRect = rect(title);
                const rowRect = rect(running);
                const popoverRect = rect(document.querySelector('.rlb-popover'));
                const ink = node => {
                    const range = document.createRange();
                    range.selectNodeContents(node);
                    const value = range.getBoundingClientRect();
                    return { left: value.left, right: value.right, top: value.top, bottom: value.bottom };
                };
                const primaryInk = ink(primary);
                const startedInk = ink(started);
                const separatorRect = rect(separator);
                return {
                    width: ${width},
                    metaDisplay: getComputedStyle(meta).display,
                    metaWrap: getComputedStyle(meta).flexWrap,
                    primaryFlex: getComputedStyle(primary).flex,
                    runningInlineMeta: running.classList.contains('rlb-run--inline-meta'),
                    metaGridColumn: getComputedStyle(meta).gridColumn,
                    metaGridRow: getComputedStyle(meta).gridRow,
                    statusCount: document.querySelectorAll('.rlb-run__status').length,
                    titleGridColumn: getComputedStyle(title).gridColumn,
                    titleGridRow: getComputedStyle(title).gridRow,
                    actionsGridColumn: getComputedStyle(actions).gridColumn,
                    actionsGridRow: getComputedStyle(actions).gridRow,
                    childOrder: [...meta.children].map(node => node.className),
                    semanticNodeCount: meta.querySelectorAll('.rlb-run__meta-line').length,
                    separatorText: separator.textContent,
                    separatorHidden: separator.getAttribute('aria-hidden'),
                    startedTag: started.tagName,
                    startedDatetime: started.dateTime,
                    startedTitle: started.title,
                    startedAria: started.getAttribute('aria-label'),
                    primaryText: primary.textContent,
                    startedText: started.textContent,
                    primaryInk,
                    separator: separatorRect,
                    startedInk,
                    primaryToSeparatorGap: separatorRect.left - primaryInk.right,
                    separatorToStartedGap: startedInk.left - separatorRect.right,
                    sameLine: Math.max(...metaItems.map(item => item.top)) < Math.min(...metaItems.map(item => item.bottom)),
                    metaBelowTitle: metaRect.top >= titleRect.bottom - 0.5,
                    metaExtendsUnderActions: metaRect.right >= actionRect.right - 0.5,
                    titleInsideActions: titleRect.right <= actionRect.left + 0.5,
                    metaInsideRow: metaRect.left >= rowRect.left - 0.5 && metaRect.right <= rowRect.right + 0.5 && metaRect.top >= rowRect.top - 0.5 && metaRect.bottom <= rowRect.bottom + 0.5,
                    metaInsidePopover: metaRect.left >= popoverRect.left - 0.5 && metaRect.right <= popoverRect.right + 0.5 && metaRect.top >= popoverRect.top - 0.5 && metaRect.bottom <= popoverRect.bottom + 0.5,
                    rowInsidePopover: rowRect.left >= popoverRect.left - 0.5 && rowRect.right <= popoverRect.right + 0.5,
                    metaNoScrollOverflow: meta.scrollWidth <= meta.clientWidth + 0.5,
                    primaryNoScrollOverflow: primary.scrollWidth <= primary.clientWidth + 0.5,
                    startedNoScrollOverflow: started.scrollWidth <= started.clientWidth + 0.5,
                    actionsRemainUsable: actionRect.width >= 64,
                };
            })()`
        );
        if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify({ width, geometry }));
        assert.equal(geometry.metaDisplay, 'flex', JSON.stringify({ width, geometry }));
        assert.equal(geometry.metaWrap, 'nowrap', JSON.stringify({ width, geometry }));
        assert.equal(geometry.primaryFlex, '0 1 auto', JSON.stringify({ width, geometry }));
        assert.equal(geometry.runningInlineMeta, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.metaGridColumn, '1 / 3', JSON.stringify({ width, geometry }));
        assert.equal(geometry.metaGridRow, '2', JSON.stringify({ width, geometry }));
        assert.equal(geometry.statusCount, 0, JSON.stringify({ width, geometry }));
        assert.equal(geometry.titleGridColumn, '1', JSON.stringify({ width, geometry }));
        assert.equal(geometry.titleGridRow, '1', JSON.stringify({ width, geometry }));
        assert.equal(geometry.actionsGridColumn, '2', JSON.stringify({ width, geometry }));
        assert.equal(geometry.actionsGridRow, '1', JSON.stringify({ width, geometry }));
        assert.deepEqual(
            geometry.childOrder,
            ['rlb-run__meta-line rlb-run__meta-primary', 'rlb-run__meta-separator', 'rlb-run__meta-line rlb-run__started'],
            JSON.stringify({ width, geometry })
        );
        assert.equal(geometry.semanticNodeCount, 2, JSON.stringify({ width, geometry }));
        assert.equal(geometry.separatorText, '·', JSON.stringify({ width, geometry }));
        assert.equal(geometry.separatorHidden, 'true', JSON.stringify({ width, geometry }));
        assert.equal(geometry.startedTag, 'TIME', JSON.stringify({ width, geometry }));
        assert.equal(geometry.startedDatetime, '2026-08-15T15:05', JSON.stringify({ width, geometry }));
        assert.match(geometry.startedTitle, /^Started \[/, JSON.stringify({ width, geometry }));
        assert.match(geometry.startedAria, /^Started \[/, JSON.stringify({ width, geometry }));
        assert.equal(geometry.primaryText, '27:02 · 13h 33m total', JSON.stringify({ width, geometry }));
        assert.equal(geometry.startedText, 'Today 15:05', JSON.stringify({ width, geometry }));
        assert.ok(geometry.primaryToSeparatorGap >= 5 && geometry.primaryToSeparatorGap <= 8, JSON.stringify({ width, geometry }));
        assert.ok(geometry.separatorToStartedGap >= 5 && geometry.separatorToStartedGap <= 8, JSON.stringify({ width, geometry }));
        assert.equal(geometry.sameLine, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.metaBelowTitle, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.metaExtendsUnderActions, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.titleInsideActions, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.rowInsidePopover, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.metaInsideRow, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.metaInsidePopover, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.metaNoScrollOverflow, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.primaryNoScrollOverflow, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.startedNoScrollOverflow, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.actionsRemainUsable, true, JSON.stringify({ width, geometry }));
    }
});

test('Active Work keeps Timing and Parallel Threads readable at narrow widths', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const longTitle = 'A long Focused task title that remains accessible while ellipsizing visually';
    const recentTitle = 'A recent task that can be focused again';
    const markup = (theme, width) =>
        `<div class="${theme}"><div class="rlb-popover" style="width:${width}px"><header class="rlb-surface__header"><div class="rlb-popover__title">ACTIVE WORK · 2</div><div class="rlb-surface__actions"><button class="bp3-button bp3-minimal bp3-small bp3-icon-dashboard rlb-surface__icon-button" data-action="dashboard" title="Open Roam Logbook Dashboard" aria-label="Open Roam Logbook Dashboard"></button><div class="rlb-surface__refresh-cell" data-refresh-state="idle"><button class="bp3-button bp3-minimal bp3-small bp3-icon-refresh rlb-surface__icon-button rlb-surface__refresh" data-action="refresh" title="Refresh Active Work from graph" aria-label="Refresh Active Work from graph"></button><span class="rlb-surface__refresh-status rlb-visually-hidden" role="status" aria-live="polite" aria-atomic="true"></span></div></div></header><div class="rlb-surface__list" role="group" aria-label="Active Work"><section class="rlb-surface__section rlb-surface__section--focused rlb-surface__section--overrun" aria-label="TIMING"><div class="rlb-surface__section-label">TIMING</div><div class="rlb-run rlb-run--focused rlb-run--inline-meta rlb-run--overrun" data-session-state="running"><div class="rlb-run__body"><button class="bp3-button bp3-minimal rlb-run__title" title="Open this block: ${longTitle}" aria-label="Open this block: ${longTitle}">${longTitle}</button><div class="rlb-run__meta"><div class="rlb-run__meta-line rlb-run__meta-primary"><span class="rlb-run__elapsed">12:34</span><span class="rlb-run__meta-separator" aria-hidden="true"> · </span><span class="rlb-run__total">2h 05m total</span></div><time class="rlb-run__meta-line rlb-run__started">Today 09:12</time></div></div><div class="rlb-run__actions"><button class="bp3-button bp3-small bp3-minimal bp3-icon-log-out rlb-run__checkout" title="Check Out" aria-label="Check Out"></button><button class="bp3-button bp3-small bp3-minimal bp3-icon-trash" title="Discard this CLOCK entry" aria-label="Discard this CLOCK entry"></button></div></div></section><section class="rlb-surface__section rlb-surface__section--open-lines rlb-surface__section--recent" aria-label="PARALLEL THREADS · 1, Leave after 45m without focus"><div class="rlb-surface__section-label"><span class="rlb-surface__section-label-text">PARALLEL THREADS · 1</span> <span class="rlb-surface__section-context">Leave after 45m without focus</span></div><div class="rlb-run rlb-run--recent" data-session-state="recent"><div class="rlb-run__body"><button class="bp3-button bp3-minimal rlb-run__title rlb-run__title--recent" title="Open this block: ${recentTitle}" aria-label="Open this block: ${recentTitle}">${recentTitle}</button><div class="rlb-run__meta"><time class="rlb-run__meta-line rlb-run__recent-meta" title="30m total · leaves in 41m; Last active [2026-08-15 Sat 09:09]" aria-label="30m total; leaves in 41m; Last active [2026-08-15 Sat 09:09]" datetime="2026-08-15T09:09">30m total · leaves in 41m</time></div></div><div class="rlb-run__actions"><button class="bp3-button bp3-small bp3-minimal bp3-icon-play rlb-run__focus" data-action="focus-recent" title="Switch Focus to ${recentTitle}" aria-label="Switch Focus to ${recentTitle}"></button></div></div></section></div><footer class="rlb-surface__footer"><button class="bp3-button bp3-small bp3-intent-danger">Clock Out All</button></footer></div></div>`;

    const expression = `(() => {
            const rect = node => { const r = node.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
            const surface = document.querySelector('.rlb-popover');
            const list = surface.querySelector('.rlb-surface__list');
            const focusedSection = list.querySelector('.rlb-surface__section--focused');
            const recentSection = list.querySelector('.rlb-surface__section--recent');
            const focused = focusedSection.querySelector('.rlb-run');
            const recent = recentSection.querySelector('.rlb-run');
            const header = surface.querySelector('.rlb-surface__header');
            const headerActions = surface.querySelector('.rlb-surface__actions');
            const headerActionRects = [...headerActions.children].map(rect);
            const footer = surface.querySelector('.rlb-surface__footer');
            const footerRects = [...footer.querySelectorAll('button')].map(rect);
            const listStyle = getComputedStyle(list);
            const focusedStyle = getComputedStyle(focusedSection);
            const recentStyle = getComputedStyle(recentSection);
            const focusedElapsedStyle = getComputedStyle(focused.querySelector('.rlb-run__elapsed'));
            const focusedTotalStyle = getComputedStyle(focused.querySelector('.rlb-run__total'));
            const focusedStartedStyle = getComputedStyle(focused.querySelector('.rlb-run__started'));
            const focusedTitle = focused.querySelector('.rlb-run__title');
            const focusedTitleRect = rect(focusedTitle);
            const focusedActionsRect = rect(focused.querySelector('.rlb-run__actions'));
            const focusedRect = rect(focused);
            const recentMeta = recent.querySelector('.rlb-run__recent-meta');
            const openLinesLabel = recentSection.querySelector('.rlb-surface__section-label');
            const openLinesText = openLinesLabel.querySelector('.rlb-surface__section-label-text');
            const openLinesContext = openLinesLabel.querySelector('.rlb-surface__section-context');
            return {
                listBorder: listStyle.borderTopWidth,
                listRadius: parseFloat(listStyle.borderTopLeftRadius),
                focusedBorders: {
                    top: focusedStyle.borderTopWidth,
                    right: focusedStyle.borderRightWidth,
                    bottom: focusedStyle.borderBottomWidth,
                    left: focusedStyle.borderLeftWidth,
                    colors: [focusedStyle.borderTopColor, focusedStyle.borderRightColor, focusedStyle.borderBottomColor, focusedStyle.borderLeftColor],
                },
                focusedBackground: focusedStyle.backgroundColor,
                recentBorder: recentStyle.borderTopWidth,
                recentBorders: [recentStyle.borderTopWidth, recentStyle.borderRightWidth, recentStyle.borderBottomWidth, recentStyle.borderLeftWidth],
                recentBackground: recentStyle.backgroundColor,
                overrunElapsedColor: focusedElapsedStyle.color,
                overrunTotalColor: focusedTotalStyle.color,
                overrunStartedColor: focusedStartedStyle.color,
                groupRole: list.getAttribute('role'),
                groupLabel: list.getAttribute('aria-label'),
                surfaceTitle: header.querySelector('.rlb-popover__title').textContent,
                timingLabel: focusedSection.querySelector('.rlb-surface__section-label').textContent,
                openLinesLabel: openLinesText.textContent,
                openLinesContext: openLinesContext.textContent,
                openLinesAria: recentSection.getAttribute('aria-label'),
                openLinesTextRight: rect(openLinesText).right,
                openLinesContextLeft: rect(openLinesContext).left,
                openLinesContextRight: rect(openLinesContext).right,
                openLinesLabelRight: rect(openLinesLabel).right,
                focusedCount: focusedSection.querySelectorAll('.rlb-run').length,
                recentCount: recentSection.querySelectorAll('.rlb-run').length,
                statusCount: list.querySelectorAll('.rlb-run__status').length,
                titleStartsAtRowContent: focusedTitleRect.left >= focusedRect.left,
                titleBeforeActions: focusedTitleRect.right <= focusedActionsRect.left + .5,
                focusedElapsedWeight: getComputedStyle(focused.querySelector('.rlb-run__elapsed')).fontWeight,
                recentTitleWeight: getComputedStyle(recent.querySelector('.rlb-run__title')).fontWeight,
                recentMeta: recentMeta.textContent,
                recentMetaTitle: recentMeta.title,
                recentMetaLabel: recentMeta.getAttribute('aria-label'),
                recentMetaDateTime: recentMeta.dateTime,
                recentHasRestingBackground: recentStyle.backgroundColor,
                headerActionCount: headerActions.children.length,
                headerTitleBeforeActions: rect(header.querySelector('.rlb-popover__title')).right <= rect(headerActions).left + .5,
                headerActionsInside: headerActionRects.every(item => item.left >= rect(surface).left && item.right <= rect(surface).right + .5),
                footerHeights: footerRects.map(item => item.height),
                footerHeightDelta: Math.max(...footerRects.map(item => item.height)) - Math.min(...footerRects.map(item => item.height)),
                footerLabels: [...footer.querySelectorAll('button')].map(button => button.textContent),
                overflow: surface.scrollWidth > surface.clientWidth + .5,
            };
        })()`;

    for (const theme of ['', 'bp3-dark']) {
        for (const width of [320, 340]) {
            const geometry = await withChromium(
                htmlWithLateHost(markup(theme, width)),
                expression,
                { width, height: 600 }
            );
            if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify({ theme, width, geometry }));
            const context = JSON.stringify({ theme, width, geometry });
            assert.equal(geometry.listBorder, '0px', context);
            assert.equal(geometry.listRadius, 0, context);
            assert.deepEqual(
                geometry.focusedBorders,
                {
                    top: '1px',
                    right: '1px',
                    bottom: '1px',
                    left: '1px',
                    colors: [geometry.focusedBorders.colors[0], geometry.focusedBorders.colors[0], geometry.focusedBorders.colors[0], geometry.focusedBorders.colors[0]],
                },
                context
            );
            assert.notEqual(geometry.focusedBackground, 'rgba(0, 0, 0, 0)', context);
            assert.doesNotMatch(geometry.focusedBackground, /126, 183, 148|142, 208, 170/, context);
            assert.deepEqual(geometry.recentBorders, ['0px', '0px', '0px', '0px'], context);
            assert.equal(geometry.recentBorder, '0px', context);
            assert.equal(geometry.recentBackground, 'rgba(0, 0, 0, 0)', context);
            assert.equal(geometry.groupRole, 'group', context);
            assert.equal(geometry.groupLabel, 'Active Work', context);
            assert.equal(geometry.surfaceTitle, 'ACTIVE WORK · 2', context);
            assert.equal(geometry.timingLabel, 'TIMING', context);
            assert.equal(geometry.openLinesLabel, 'PARALLEL THREADS · 1', context);
            assert.equal(geometry.openLinesContext, 'Leave after 45m without focus', context);
            assert.equal(geometry.openLinesAria, 'PARALLEL THREADS · 1, Leave after 45m without focus', context);
            assert.ok(geometry.openLinesContextLeft >= geometry.openLinesTextRight, context);
            assert.ok(geometry.openLinesContextRight <= geometry.openLinesLabelRight + 0.5, context);
            assert.doesNotMatch(
                `${geometry.surfaceTitle} ${geometry.timingLabel} ${geometry.openLinesLabel} ${geometry.openLinesAria}`,
                /recent/i,
                context
            );
            assert.equal(geometry.focusedCount, 1, context);
            assert.equal(geometry.recentCount, 1, context);
            assert.equal(geometry.statusCount, 0, context);
            assert.equal(geometry.titleStartsAtRowContent, true, context);
            assert.equal(geometry.titleBeforeActions, true, context);
            assert.ok(Number(geometry.focusedElapsedWeight) >= 600, context);
            assert.ok(Number(geometry.recentTitleWeight) < Number(geometry.focusedElapsedWeight), context);
            assert.equal(geometry.overrunElapsedColor, theme === 'bp3-dark' ? 'rgb(255, 115, 115)' : 'rgb(205, 66, 70)', context);
            assert.notEqual(geometry.overrunElapsedColor, geometry.overrunTotalColor, context);
            assert.notEqual(geometry.overrunElapsedColor, geometry.overrunStartedColor, context);
            assert.equal(geometry.recentMeta, '30m total · leaves in 41m', context);
            assert.equal(geometry.recentMetaTitle, '30m total · leaves in 41m; Last active [2026-08-15 Sat 09:09]', context);
            assert.equal(geometry.recentMetaLabel, '30m total; leaves in 41m; Last active [2026-08-15 Sat 09:09]', context);
            assert.equal(geometry.recentMetaDateTime, '2026-08-15T09:09', context);
            assert.equal(geometry.headerActionCount, 2, context);
            assert.equal(geometry.headerTitleBeforeActions, true, context);
            assert.equal(geometry.headerActionsInside, true, context);
            assert.ok(geometry.footerHeightDelta <= 1, context);
            assert.deepEqual(geometry.footerLabels, ['Clock Out All'], context);
            assert.equal(geometry.overflow, false, context);
        }
    }
});

test('Dashboard overlay keeps background and dialog chrome fixed while body content scrolls', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const geometry = await withChromium(
        htmlWithLateHost(`
            <style>
                html, body { margin: 0; min-height: 2400px; }
                #background { height: 2200px; }
            </style>
            <div id="background"></div>
            <div class="rlb-root rlb-root--open rlb-dashboard" aria-hidden="false">
                <div class="rlb-dialog" role="dialog" aria-modal="true" aria-labelledby="dashboard-title" style="height:680px">
                    <header class="rlb-header bp3-dialog-header"><h2 id="dashboard-title" class="rlb-header__title">Roam Logbook</h2></header>
                    <div class="rlb-summary"><div class="rlb-overview"><div class="rlb-overview__item">Summary</div></div></div>
                    <div class="rlb-body rlb-body__scroll"><div style="height:1400px">Long dashboard content</div></div>
                </div>
            </div>
        `),
        `(() => {
            const root = document.querySelector('.rlb-root');
            const dialog = document.querySelector('.rlb-dialog');
            const header = document.querySelector('.rlb-header');
            const body = document.querySelector('.rlb-body');
            document.documentElement.style.overflow = 'hidden';
            document.body.style.overflow = 'hidden';
            const before = { documentY: scrollY, rootY: root.scrollTop, dialogY: dialog.scrollTop };
            header.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 800 }));
            const afterHeader = { documentY: scrollY, rootY: root.scrollTop, dialogY: dialog.scrollTop };
            body.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 600 }));
            body.scrollTop = 240;
            const afterBody = { documentY: scrollY, rootY: root.scrollTop, dialogY: dialog.scrollTop, bodyY: body.scrollTop };
            const rootStyle = getComputedStyle(root);
            const dialogStyle = getComputedStyle(dialog);
            const bodyStyle = getComputedStyle(body);
            return {
                before, afterHeader, afterBody,
                rootPosition: rootStyle.position,
                rootOverflow: rootStyle.overflow,
                rootOverscroll: rootStyle.overscrollBehavior,
                dialogDisplay: dialogStyle.display,
                dialogOverflow: dialogStyle.overflow,
                bodyOverflow: bodyStyle.overflowY,
                bodyOverscroll: bodyStyle.overscrollBehavior,
                a11y: {
                    role: dialog.getAttribute('role'),
                    modal: dialog.getAttribute('aria-modal'),
                    labelledBy: dialog.getAttribute('aria-labelledby'),
                },
            };
        })()`
    );
    if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify(geometry));
    assert.deepEqual(geometry.afterHeader, geometry.before, JSON.stringify(geometry));
    assert.equal(geometry.afterBody.documentY, geometry.before.documentY, JSON.stringify(geometry));
    assert.equal(geometry.afterBody.rootY, geometry.before.rootY, JSON.stringify(geometry));
    assert.equal(geometry.afterBody.dialogY, geometry.before.dialogY, JSON.stringify(geometry));
    assert.equal(geometry.afterBody.bodyY, 240, JSON.stringify(geometry));
    assert.equal(geometry.rootPosition, 'fixed', JSON.stringify(geometry));
    assert.equal(geometry.rootOverflow, 'hidden', JSON.stringify(geometry));
    assert.equal(geometry.rootOverscroll, 'none', JSON.stringify(geometry));
    assert.equal(geometry.dialogDisplay, 'flex', JSON.stringify(geometry));
    assert.equal(geometry.dialogOverflow, 'hidden', JSON.stringify(geometry));
    assert.equal(geometry.bodyOverflow, 'auto', JSON.stringify(geometry));
    assert.equal(geometry.bodyOverscroll, 'contain', JSON.stringify(geometry));
    assert.deepEqual(geometry.a11y, {
        role: 'dialog',
        modal: 'true',
        labelledBy: 'dashboard-title',
    });
});

test('Dashboard task controls flow naturally at every width without overlap', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const markup = `
        <div class="rlb-root rlb-root--open rlb-dashboard">
            <div class="rlb-dialog" style="height:560px">
                <div class="rlb-body rlb-body__scroll">
                    <section class="rlb-dashboard-section rlb-dashboard-panel rlb-by-task">
                        <div class="rlb-section__heading rlb-panel__header">
                            <h3 class="rlb-section__title">By task</h3>
                            <span class="rlb-task-count">12 of 34 Tasks</span>
                            <button class="rlb-tree__info" type="button">i</button>
                            <div class="rlb-task-filters" role="group" aria-label="Filter tasks by status">
                                <button type="button" data-filter="ALL" aria-pressed="true">All</button>
                                <button type="button" data-filter="TODO" aria-pressed="false">TODO</button>
                                <button type="button" data-filter="DONE" aria-pressed="false">DONE</button>
                            </div>
                            <button class="rlb-tree__collapse-all" type="button">Collapse all</button>
                        </div>
                        <table class="rlb-table rlb-task-table">
                            <thead><tr>
                                <th scope="col">Task</th>
                                <th scope="col" data-sort-key="sessions" class="rlb-table__num"><button type="button">Sessions</button></th>
                                <th scope="col" data-sort-key="own" class="rlb-table__num"><button type="button">Own</button></th>
                                <th scope="col" data-sort-key="total" class="rlb-table__num"><button type="button">Total <span class="rlb-task-sort-arrow" aria-hidden="true">↓</span></button></th>
                            </tr></thead>
                            <tbody>${Array.from({ length: 16 }, (_, index) => `<tr><td>Task ${index}</td><td class="rlb-table__num">${index}</td><td class="rlb-table__num">${index}m</td><td class="rlb-table__num">${index}m</td></tr>`).join('')}</tbody>
                        </table>
                    </section>
                </div>
            </div>
        </div>`;
    const expression = `(() => {
        const rect = node => {
            const value = node.getBoundingClientRect();
            return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height };
        };
        const toolbar = document.querySelector('.rlb-by-task > .rlb-section__heading');
        const controls = [...toolbar.querySelectorAll('.rlb-task-count, .rlb-task-filters button, .rlb-tree__collapse-all')];
        const controlRects = controls.map(rect);
        const overlaps = controlRects.some((left, index) => controlRects.slice(index + 1).some(right =>
            left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top
        ));
        const tableHeader = document.querySelector('.rlb-task-table thead th');
        const byTask = document.querySelector('.rlb-by-task');
        const body = document.querySelector('.rlb-body');
        const toolbarStyle = getComputedStyle(toolbar);
        const headerStyle = getComputedStyle(tableHeader);
        const beforeToolbarTop = toolbar.getBoundingClientRect().top;
        const beforeHeaderTop = tableHeader.getBoundingClientRect().top;
        const maxScrollTop = Math.max(0, body.scrollHeight - body.clientHeight);
        body.scrollTop = Math.min(160, maxScrollTop);
        const afterToolbarTop = toolbar.getBoundingClientRect().top;
        const afterHeaderTop = tableHeader.getBoundingClientRect().top;
        return {
            toolbar: rect(toolbar),
            controls: controlRects,
            overlaps,
            toolbarPosition: toolbarStyle.position,
            toolbarDisplay: toolbarStyle.display,
            toolbarTop: toolbarStyle.top,
            tableHeaderPosition: headerStyle.position,
            tableHeaderTop: headerStyle.top,
            bodyScrollTop: body.scrollTop,
            toolbarMovedWithBody: afterToolbarTop < beforeToolbarTop,
            tableHeaderMovedWithBody: afterHeaderTop < beforeHeaderTop,
            byTaskOverflow: getComputedStyle(byTask).overflow,
            bodyOverflowY: getComputedStyle(body).overflowY,
        };
    })()`;

    for (const width of [320, 340]) {
        const geometry = await withChromium(htmlWithLateHost(markup), expression, { width, height: 600 });
        if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify({ width, geometry }));
        assert.equal(geometry.toolbarPosition, 'static', JSON.stringify({ width, geometry }));
        assert.equal(geometry.tableHeaderPosition, 'static', JSON.stringify({ width, geometry }));
        assert.equal(geometry.overlaps, false, JSON.stringify({ width, geometry }));
        assert.ok(
            geometry.controls.every(control => control.left >= geometry.toolbar.left - 1 && control.right <= geometry.toolbar.right + 1),
            JSON.stringify({ width, geometry })
        );
    }

    const desktop = await withChromium(htmlWithLateHost(markup), expression, { width: 960, height: 600 });
    if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify({ desktop }));
    assert.equal(desktop.toolbarPosition, 'static', JSON.stringify(desktop));
    assert.equal(desktop.tableHeaderPosition, 'static', JSON.stringify(desktop));
    assert.equal(desktop.bodyScrollTop > 0, true, JSON.stringify(desktop));
    assert.equal(desktop.toolbarMovedWithBody, true, JSON.stringify(desktop));
    assert.equal(desktop.tableHeaderMovedWithBody, true, JSON.stringify(desktop));
    assert.equal(desktop.byTaskOverflow, 'visible', JSON.stringify(desktop));
    assert.equal(desktop.bodyOverflowY, 'auto', JSON.stringify(desktop));
});
