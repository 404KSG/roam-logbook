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

test('Session title links inherit Roam theme colors and keep a current-color underline', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const geometry = await withChromium(
        htmlWithLateHost(
            `<div class="rlb-popover" style="--rlb-surface-link: rgb(123, 45, 67)"><div class="rlb-run"><button class="bp3-button bp3-minimal rlb-run__title" title="Open this block: Reading" aria-label="Open this block: Reading">Reading</button></div></div>`
        ),
        `(() => {
            const title = document.querySelector('.rlb-run__title');
            const normalColor = getComputedStyle(title).color;
            title.focus();
            const style = getComputedStyle(title);
            return {
                normalColor,
                color: style.color,
                underline: style.textDecorationColor,
                decoration: style.textDecorationLine,
                outline: style.outlineColor,
            };
        })()`
    );
    assert.equal(geometry.normalColor, 'rgb(123, 45, 67)', JSON.stringify(geometry));
    assert.match(geometry.decoration, /underline/, JSON.stringify(geometry));
    assert.equal(geometry.underline, geometry.color, JSON.stringify(geometry));
    assert.equal(geometry.outline, geometry.color, JSON.stringify(geometry));
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

test('activity rail keeps accessible green intensity cells compact on a narrow panel', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const cells = [0, 25, 50, 100, 0, 75, 10]
        .map(
            (minutes, index) =>
                `<button class="rlb-activity__bucket rlb-activity__bucket--level-${minutes === 0 ? 0 : index === 3 ? 3 : 1}${minutes === 0 ? ' rlb-activity__bucket--empty' : ''}" aria-label="2026-08-${String(index + 9).padStart(2, '0')}, day, ${minutes}m" title="2026-08-${String(index + 9).padStart(2, '0')} · ${minutes}m"><span class="rlb-activity__fill" style="height:${minutes}%"></span></button>`
        )
        .join('');
    const geometry = await withChromium(
        htmlWithLateHost(`<div class="rlb-root rlb-root--open rlb-dashboard"><div style="width:320px"><div class="rlb-summary"><dl class="rlb-overview rlb-overview--strip"><div class="rlb-overview__item rlb-overview__item--selected"><dt class="rlb-overview__label">Last 7 days</dt><dd class="rlb-overview__value">13h 47m<div class="rlb-activity-rail" data-day-count="7" style="--rlb-activity-count:7" role="group">${cells}</div></dd></div></dl></div></div></div>`),
        `(() => {
            const chart = document.querySelector('.rlb-activity-rail');
            const cells = [...chart.querySelectorAll('.rlb-activity__bucket')];
            const rect = node => { const value = node.getBoundingClientRect(); return { left:value.left, right:value.right, top:value.top, bottom:value.bottom, width:value.width, height:value.height }; };
            const rects = cells.map(rect);
            return {
                chart: rect(chart),
                count: cells.length,
                columns: getComputedStyle(chart).gridTemplateColumns,
                labels: [...document.querySelectorAll('.rlb-activity__label')].filter(node => node.getClientRects().length).length,
                colors: cells.map(cell => getComputedStyle(cell.querySelector('.rlb-activity__fill')).backgroundColor),
                accessible: cells.every(cell => cell.title.includes('2026-08-') && cell.getAttribute('aria-label').includes('m')),
                keyboard: cells.every(cell => cell.tagName === 'BUTTON' && cell.tabIndex >= 0),
                overlap: rects.some((item, index) => index > 0 && item.left < rects[index - 1].right),
            };
        })()`
    );
    if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify(geometry));
    assert.equal(geometry.count, 7, JSON.stringify(geometry));
    assert.ok(geometry.chart.height >= 26 && geometry.chart.height <= 30, JSON.stringify(geometry));
    assert.match(geometry.columns, /\d+(?:\.\d+)?px\s+\d+(?:\.\d+)?px\s+\d+(?:\.\d+)?px/, JSON.stringify(geometry));
    assert.equal(geometry.accessible, true, JSON.stringify(geometry));
    assert.equal(geometry.keyboard, true, JSON.stringify(geometry));
    assert.equal(geometry.overlap, false, JSON.stringify(geometry));
    assert.equal(geometry.labels, 0, JSON.stringify(geometry));
    assert.ok(new Set(geometry.colors).size >= 3, JSON.stringify(geometry));
    assert.ok(geometry.colors.every(color => !color.includes('45, 114, 210')), JSON.stringify(geometry));
});

test('beta.7 dashboard removes the standalone activity section and border soup', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const geometry = await withChromium(
            htmlWithLateHost(`<div class="rlb-root rlb-root--open rlb-dashboard"><div class="rlb-dialog" style="width:760px;height:700px"><header class="rlb-header bp3-dialog-header"><div class="rlb-header__heading"><h2 class="rlb-header__title">Roam Logbook</h2><p class="rlb-header__subtitle">Focus sessions, activity, and task rollups</p></div></header><div class="rlb-summary"><div class="rlb-stats"><div class="rlb-stat"><strong class="rlb-stat__value">2h 17m</strong><span class="rlb-stat__label">Today</span></div><div class="rlb-stat rlb-stat--activity"><strong class="rlb-stat__value">13h 47m</strong><span class="rlb-stat__label">Last 7 days</span><div class="rlb-activity-rail" role="group"><button class="rlb-activity__bucket rlb-activity__bucket--level-3" title="2026-08-15 · 2h"> <span class="rlb-activity__fill" style="height:100%"></span><span class="rlb-activity__label">Sat</span></button></div></div><div class="rlb-stat"><strong class="rlb-stat__value">3</strong><span class="rlb-stat__label">Tasks tracked</span></div></div></div><div class="rlb-body"><section class="rlb-dashboard-section rlb-running"><h3 class="rlb-section__title">Running</h3><table class="rlb-table"><thead><tr><th>Task</th><th>Started</th><th>Elapsed</th></tr></thead><tbody><tr><td>Graph Engineering</td><td>Today 12:38</td><td>2:17</td></tr></tbody></table></section><section class="rlb-dashboard-section rlb-by-task"><div class="rlb-section__heading"><h3 class="rlb-section__title">By task</h3></div><table class="rlb-table"><tbody><tr><td>记得早点购买护肤品。</td><td>2</td><td>1h</td><td>1h</td></tr><tr><td>Graph Engineering: a long task title</td><td>7</td><td>1h</td><td>2h</td></tr></tbody></table></section></div></div></div>`),
        `(() => {
            const style = selector => getComputedStyle(document.querySelector(selector));
            const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { top:r.top, bottom:r.bottom, height:r.height, left:r.left, right:r.right }; };
            const rows = [...document.querySelectorAll('.rlb-running tbody tr, .rlb-by-task tbody tr')];
            const task = document.querySelector('.rlb-by-task');
            const summary = document.querySelector('.rlb-summary');
            return {
                headerBorder: style('.rlb-header').borderBottomStyle,
                summaryBorder: style('.rlb-summary').borderBottomStyle,
                statDividers: [...document.querySelectorAll('.rlb-stat')].map(node => getComputedStyle(node).borderRightStyle),
                rowBorders: rows.map(row => getComputedStyle(row.querySelector('td')).borderBottomStyle),
                standaloneDay: Boolean(document.querySelector('.rlb-by-day, .rlb-bars, .rlb-bars__range')),
                activityBaseline: getComputedStyle(document.querySelector('.rlb-activity-rail'), '::after').content,
                taskAfterSummary: rect('.rlb-by-task').top >= rect('.rlb-summary').bottom - .5,
                taskInside: rect('.rlb-by-task').right <= document.querySelector('.rlb-body').getBoundingClientRect().right + .5,
                summary: rect('.rlb-summary'),
                task: rect('.rlb-by-task')
            };
        })()`
    );
    if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify(geometry));
    assert.equal(geometry.headerBorder, 'none', JSON.stringify(geometry));
    assert.equal(geometry.summaryBorder, 'none', JSON.stringify(geometry));
    assert.ok(geometry.statDividers.every(value => value === 'none'), JSON.stringify(geometry));
    assert.ok(geometry.rowBorders.every(value => value === 'none'), JSON.stringify(geometry));
    assert.equal(geometry.standaloneDay, false, JSON.stringify(geometry));
    assert.equal(geometry.activityBaseline, 'none', JSON.stringify(geometry));
    assert.equal(geometry.taskAfterSummary, true, JSON.stringify(geometry));
    assert.equal(geometry.taskInside, true, JSON.stringify(geometry));
});

test('beta.14 overview stays four-column desktop and chart-free', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const markup = `<div class="rlb-root rlb-root--open rlb-dashboard"><div class="rlb-dialog" style="width:960px"><header class="rlb-header bp3-dialog-header"><div class="rlb-header__heading"><h2 class="rlb-header__title">Roam Logbook</h2></div><button class="rlb-dashboard__view-toggle bp3-icon-chart" aria-label="Open Analytics" aria-controls="roam-logbook-dashboard-view" aria-pressed="false"></button><select aria-label="Dashboard date range"><option>Last 7 days</option></select></header><div class="rlb-summary"><dl class="rlb-overview rlb-overview--compact" aria-label="Roam Logbook overview"><div class="rlb-overview__item"><dt class="rlb-overview__label">Today</dt><dd class="rlb-overview__value">2h 17m</dd></div><div class="rlb-overview__item"><dt class="rlb-overview__label">Last 7 days</dt><dd class="rlb-overview__value">13h 47m</dd></div><div class="rlb-overview__item"><dt class="rlb-overview__label">Sessions</dt><dd class="rlb-overview__value">7</dd></div><div class="rlb-overview__item"><dt class="rlb-overview__label">Tasks tracked</dt><dd class="rlb-overview__value">6</dd></div></dl></div><div class="rlb-body" id="roam-logbook-dashboard-view"><section class="rlb-dashboard-section rlb-by-task"><table class="rlb-table"><tbody><tr><td>Reading</td><td>2</td><td>1h</td><td>1h</td></tr></tbody></table></section></div></div></div>`;
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
                chart: Boolean(document.querySelector('.rlb-activity-rail, .rlb-analytics__svg, svg')),
                overflow: dialog.scrollWidth > dialog.clientWidth + 1 || body.scrollWidth > body.clientWidth + 1,
                toggle: document.querySelector('[aria-label="Open Analytics"]').getAttribute('aria-pressed'),
            };
        })()`
    );
    assert.equal(geometry.metrics, 4, JSON.stringify(geometry));
    assert.equal(geometry.grid.trim().split(/\s+/).length, 4, JSON.stringify(geometry));
    assert.ok(geometry.height >= 64 && geometry.height <= 72, JSON.stringify(geometry));
    assert.equal(geometry.chart, false, JSON.stringify(geometry));
    assert.equal(geometry.overflow, false, JSON.stringify(geometry));
    assert.equal(geometry.toggle, 'false', JSON.stringify(geometry));
});

test('beta.14 compact overview becomes two-by-two on mobile without overflow', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const markup = `<div class="rlb-root rlb-root--open rlb-dashboard"><div class="rlb-dialog"><div class="rlb-summary"><dl class="rlb-overview rlb-overview--compact"><div class="rlb-overview__item"><dt>Today</dt><dd>2h</dd></div><div class="rlb-overview__item"><dt>Range</dt><dd>13h</dd></div><div class="rlb-overview__item"><dt>Sessions</dt><dd>7</dd></div><div class="rlb-overview__item"><dt>Tasks tracked</dt><dd>6</dd></div></dl></div><div class="rlb-body" id="roam-logbook-dashboard-view"></div></div></div>`;
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

test('session status bullet aligns with the title row rather than the whole row', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const geometry = await withChromium(
        htmlWithLateHost(`<div class="rlb-popover" style="width:340px"><div class="rlb-run rlb-run--paused" data-session-state="paused"><span class="rlb-run__status rlb-run__status--paused" aria-label="Paused Session"></span><div class="rlb-run__body"><button class="bp3-button bp3-minimal rlb-run__title">一个需要完整保留且视觉省略的中文任务标题 Graph Engineering</button><div class="rlb-run__meta"><div class="rlb-run__meta-line">Paused since [2026-08-15 Sat 12:38]</div><div class="rlb-run__meta-line">A second metadata line</div></div></div><div class="rlb-run__actions"><button class="bp3-button bp3-minimal bp3-icon-play rlb-run__resume" title="Resume" aria-label="Resume"></button></div></div></div>`),
        `(() => {
            const rect = node => { const r = node.getBoundingClientRect(); return { top:r.top, bottom:r.bottom, left:r.left, right:r.right, width:r.width, height:r.height }; };
            const row = document.querySelector('.rlb-run');
            const status = document.querySelector('.rlb-run__status');
            const title = document.querySelector('.rlb-run__title');
            const meta = document.querySelector('.rlb-run__meta');
            const actions = document.querySelector('.rlb-run__actions');
            const bodyStyle = getComputedStyle(document.querySelector('.rlb-run__body'));
            const statusStyle = getComputedStyle(status);
            const titleRect = rect(title);
            const statusRect = rect(status);
            const rowRect = rect(row);
            return {
                status: statusRect,
                title: titleRect,
                meta: rect(meta),
                actions: rect(actions),
                row: rowRect,
                bodyDisplay: bodyStyle.display,
                statusGridRow: statusStyle.gridRow,
                statusAlign: statusStyle.alignSelf,
                statusMarginTop: statusStyle.marginTop,
                centeredOnTitle: Math.abs((statusRect.top + statusRect.height / 2) - (titleRect.top + titleRect.height / 2)) <= 2,
                notCenteredOnWholeRow: Math.abs((statusRect.top + statusRect.height / 2) - (rowRect.top + rowRect.height / 2)) > 2,
                metadataBelowTitle: meta.getBoundingClientRect().top >= titleRect.bottom - .5,
                titleBeforeActions: titleRect.right <= rect(actions).left + .5
            };
        })()`
    );
    if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify(geometry));
    assert.equal(geometry.bodyDisplay, 'contents', JSON.stringify(geometry));
    assert.equal(geometry.statusGridRow, '1', JSON.stringify(geometry));
    assert.equal(geometry.statusAlign, 'center', JSON.stringify(geometry));
    assert.equal(geometry.statusMarginTop, '0px', JSON.stringify(geometry));
    assert.equal(geometry.centeredOnTitle, true, JSON.stringify(geometry));
    assert.equal(geometry.notCenteredOnWholeRow, true, JSON.stringify(geometry));
    assert.equal(geometry.metadataBelowTitle, true, JSON.stringify(geometry));
    assert.equal(geometry.titleBeforeActions, true, JSON.stringify(geometry));
});

test('Session task title is the restrained link target without a leading open icon', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const longTitle = 'A long Session title that remains accessible while truncating cleanly';
    const geometry = await withChromium(
        htmlWithLateHost(
            `<div class="rlb-popover" style="width:320px"><div class="rlb-surface__list" role="group" aria-label="Current Sessions"><div class="rlb-run"><span class="rlb-run__status rlb-run__status--running" aria-hidden="true"></span><div class="rlb-run__body"><button class="bp3-button bp3-minimal rlb-run__title" type="button" title="Open this block: ${longTitle}" aria-label="Open this block: ${longTitle}">${longTitle}</button><div class="rlb-run__meta"><div class="rlb-run__meta-line">12:34 · 2h 05m total</div><time class="rlb-run__meta-line">Today 09:12</time></div></div><div class="rlb-run__actions"><button class="bp3-button bp3-small bp3-minimal bp3-icon-log-out rlb-run__checkout" data-action="clock-out" title="Check Out" aria-label="Check Out"></button><button class="bp3-button bp3-small bp3-minimal bp3-icon-trash" data-action="discard" title="Discard this CLOCK entry" aria-label="Discard this CLOCK entry"></button></div></div></div></div>`
        ),
        `(() => {
            const rect = node => { const r = node.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
            const title = document.querySelector('.rlb-run__title');
            const status = document.querySelector('.rlb-run__status');
            const actions = document.querySelector('.rlb-run__actions');
            const titleStyle = getComputedStyle(title);
            const beforeStyle = getComputedStyle(title, '::before');
            title.focus();
            const focusStyle = getComputedStyle(title);
            const titleRect = rect(title);
            const statusRect = rect(status);
            const actionsRect = rect(actions);
            return {
                hasOpenIconClass: title.classList.contains('bp3-icon-document-open'),
                beforeContent: beforeStyle.content,
                beforeDisplay: beforeStyle.display,
                title: titleRect,
                status: statusRect,
                actions: actionsRect,
                titleStartsAfterStatus: titleRect.left >= statusRect.right,
                titleEndsBeforeActions: titleRect.right <= actionsRect.left + .5,
                titleClips: title.scrollWidth > title.clientWidth,
                linkCue: titleStyle.textDecorationLine.includes('underline'),
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
    assert.equal(geometry.titleStartsAfterStatus, true, JSON.stringify(geometry));
    assert.equal(geometry.titleEndsBeforeActions, true, JSON.stringify(geometry));
    assert.equal(geometry.titleClips, true, JSON.stringify(geometry));
    assert.equal(geometry.linkCue, true, JSON.stringify(geometry));
    assert.equal(geometry.focusRing, true, JSON.stringify(geometry));
    assert.match(geometry.accessibleName, /^Open this block:/, JSON.stringify(geometry));
    assert.match(geometry.tooltip, /^Open this block:/, JSON.stringify(geometry));
});

test('paused icon-only topbar keeps clock identity with only a quiet background state', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const geometry = await withChromium(
        htmlWithLateHost(`<div class="rlb-topbar"><button class="bp3-button bp3-minimal rlb-topbar__button rlb-topbar__button--icon-only" aria-label="Roam Logbook — no Session running"><span class="bp3-icon bp3-icon-history rlb-topbar__icon"></span></button><button class="bp3-button bp3-minimal rlb-topbar__button rlb-topbar__button--icon-only rlb-topbar__button--paused" aria-label="2 Sessions Paused — click to resume or review."><span class="bp3-icon bp3-icon-history rlb-topbar__icon"></span></button></div>`),
        `(() => {
            const buttons = [...document.querySelectorAll('.rlb-topbar__button')];
            const rect = node => { const r = node.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
            const idle = buttons[0];
            const paused = buttons[1];
            const idleRect = rect(idle);
            const pausedRect = rect(paused);
            const idleIconStyle = getComputedStyle(idle.querySelector('.rlb-topbar__icon'));
            const pausedIconStyle = getComputedStyle(paused.querySelector('.rlb-topbar__icon'));
            const pausedStyle = getComputedStyle(paused);
            return {
                idle: idleRect,
                paused: pausedRect,
                idleHasBadge: Boolean(idle.querySelector('.rlb-topbar__pause-badge')),
                pausedHasBadge: Boolean(paused.querySelector('.rlb-topbar__pause-badge')),
                pausedHasClock: Boolean(paused.querySelector('.bp3-icon-history')),
                pausedLabel: paused.getAttribute('aria-label'),
                pausedBackground: pausedStyle.backgroundColor,
                idleBackground: getComputedStyle(idle).backgroundColor,
                idleIconColor: idleIconStyle.color,
                pausedIconColor: pausedIconStyle.color,
                pausedRing: pausedStyle.boxShadow,
                square: Math.abs(pausedRect.width - pausedRect.height) <= 1
            };
        })()`
    );
    if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify(geometry));
    assert.equal(geometry.idleHasBadge, false, JSON.stringify(geometry));
    assert.equal(geometry.pausedHasBadge, false, JSON.stringify(geometry));
    assert.equal(geometry.pausedHasClock, true, JSON.stringify(geometry));
    assert.match(geometry.pausedLabel, /2 Sessions Paused/i, JSON.stringify(geometry));
    assert.equal(geometry.pausedBackground, geometry.idleBackground, JSON.stringify(geometry));
    assert.notEqual(geometry.pausedIconColor, geometry.idleIconColor, JSON.stringify(geometry));
    assert.equal(geometry.pausedRing, 'none', JSON.stringify(geometry));
    assert.equal(geometry.square, true, JSON.stringify(geometry));
});

test('popover rows stay within 340px and 320px with two metadata lines and a two-row footer', async t => {
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
            const footer = popover.querySelector('.rlb-popover__footer');
            const footerRect = rect(footer);
            const refresh = popover.querySelector('.rlb-popover__footer [data-action="refresh"]');
            const refreshRect = rect(refresh);
            const footerStyles = getComputedStyle(footer);
            const footerColumns = footerStyles.gridTemplateColumns.split(' ').map(Number);
            const footerGap = parseFloat(footerStyles.columnGap) || 0;
            const expectedRefreshCenter = footerRect.left + footerColumns[0] + footerGap + footerColumns[1] / 2;
            const footerButtons = [...popover.querySelectorAll('.rlb-popover__footer button')];
            const footerRects = footerButtons.map(rect);
            return {
                popover: popRect,
                title: rect(title), body: rect(body), actions: rect(actions), meta: rect(meta),
                lines: row.querySelectorAll('.rlb-run__meta-line').length,
                titleClips: title.scrollWidth > title.clientWidth,
                rowHasDot: Boolean(row.querySelector('.rlb-dot')),
                headerRefresh: Boolean(popover.querySelector('.rlb-surface__header [data-action="refresh"]')),
                refreshCenterDelta: Math.abs(refreshRect.left + refreshRect.width / 2 - expectedRefreshCenter),
                footerLabels: footerButtons.map(button => button.textContent),
                footerInside: footerRects.every(item => item.left >= popRect.left && item.right <= popRect.right && item.top >= popRect.top && item.bottom <= popRect.bottom),
                footerOverlap: footerRects.some((item, index) => footerRects.slice(index + 1).some(other => item.left < other.right && item.right > other.left && item.top < other.bottom && item.bottom > other.top)),
                iconLabels: [...popover.querySelectorAll('.bp3-icon-log-out, .bp3-icon-trash, .bp3-icon-refresh')].every(button => button.title && button.getAttribute('aria-label')),
            };
        })()`;
        const longTitle = 'A very long Session title that should ellipsize visually while remaining available to assistive technology';
        const geometry = await withChromium(
            htmlWithLateHost(`<div class="rlb-popover" style="width:${width}px"><header class="rlb-surface__header"><div class="rlb-popover__title">1 Session Running</div></header><div class="rlb-run"><span class="rlb-run__status rlb-run__status--running" aria-hidden="true"></span><div class="rlb-run__body"><button class="bp3-button bp3-minimal rlb-run__title" title="Open this block: ${longTitle}" aria-label="Open this block: ${longTitle}">${longTitle}</button><div class="rlb-run__meta"><div class="rlb-run__meta-line rlb-run__meta-primary">12:34 · target 30:00 · 2h 05m total</div><time class="rlb-run__meta-line rlb-run__started" title="Started [2026-08-14 Fri 21:30] · Page: Project Page" aria-label="Started [2026-08-14 Fri 21:30] · Page: Project Page">Aug 14 21:30</time></div></div><div class="rlb-run__actions"><button class="bp3-button bp3-small bp3-minimal bp3-icon-log-out rlb-run__checkout" data-action="clock-out" title="Check Out" aria-label="Check Out"></button><button class="bp3-button bp3-minimal bp3-small bp3-icon-trash" data-action="discard" title="Discard this CLOCK entry (cannot be undone)" aria-label="Discard this CLOCK entry (cannot be undone)"></button></div></div><div class="rlb-popover__footer"><button class="bp3-button bp3-small">Dashboard</button><button class="bp3-button bp3-small">Pause All</button><button class="bp3-button bp3-small bp3-intent-danger">Clock Out All</button><button class="bp3-button bp3-small bp3-minimal bp3-icon-refresh" data-action="refresh" title="Refresh Sessions from graph" aria-label="Refresh Sessions from graph"></button></div></div>`),
            expression
        );
        if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify({ width, geometry }));
        assert.ok(geometry.popover.width <= width + 0.5, JSON.stringify({ width, geometry }));
        assert.equal(geometry.lines, 2, JSON.stringify({ width, geometry }));
        assert.equal(geometry.titleClips, true, JSON.stringify({ width, geometry }));
        assert.ok(geometry.meta.height <= 34, JSON.stringify({ width, geometry }));
        assert.ok(geometry.title.right <= geometry.actions.left + 0.5, JSON.stringify({ width, geometry }));
        assert.equal(geometry.rowHasDot, false, JSON.stringify({ width, geometry }));
        assert.equal(geometry.headerRefresh, false, JSON.stringify({ width, geometry }));
        assert.ok(geometry.refreshCenterDelta <= 1, JSON.stringify({ width, geometry }));
        assert.deepEqual(geometry.footerLabels, ['Dashboard', 'Pause All', 'Clock Out All', ''], JSON.stringify({ width, geometry }));
        assert.equal(geometry.footerInside, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.footerOverlap, false, JSON.stringify({ width, geometry }));
        assert.equal(geometry.iconLabels, true, JSON.stringify({ width, geometry }));
    }
});

test('beta.9 surface footer uses one action height across both rows', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const geometry = await withChromium(
            htmlWithLateHost(`<div class="rlb-popover" style="width:340px"><div class="rlb-popover__footer"><button class="bp3-button bp3-small">Dashboard</button><button class="bp3-button bp3-small">Pause All</button><button class="bp3-button bp3-small bp3-intent-danger">Clock Out All</button><button class="bp3-button bp3-minimal bp3-small bp3-icon-refresh rlb-surface__refresh" aria-label="Refresh Sessions from graph" title="Refresh Sessions from graph"></button></div></div>`),
        `(() => {
            const rect = node => { const r = node.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
            const footer = document.querySelector('.rlb-popover__footer');
            const buttons = [...footer.querySelectorAll('button')];
            const rows = getComputedStyle(footer).gridTemplateRows.split(' ').map(value => parseFloat(value));
            const refreshStyle = getComputedStyle(buttons[3]);
            const rects = buttons.map(rect);
            return {
                rows,
                heights: rects.map(item => item.height),
                equal: Math.max(...rects.map(item => item.height)) - Math.min(...rects.map(item => item.height)) <= 1,
                refreshCenter: Math.abs(rects[3].left + rects[3].width / 2 - (rects[1].left + rects[1].width / 2)) <= 1,
                refreshGrid: [refreshStyle.gridColumnStart, refreshStyle.gridRowStart],
                inside: rects.every(item => item.left >= rect(footer).left && item.right <= rect(footer).right + .5),
                token: getComputedStyle(footer).getPropertyValue('--rlb-surface-action-height').trim()
            };
        })()`
    );
    if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify(geometry));
    assert.equal(geometry.equal, true, JSON.stringify(geometry));
    assert.equal(geometry.rows.length, 2, JSON.stringify(geometry));
    assert.ok(geometry.rows.every(row => row >= 31), JSON.stringify(geometry));
    assert.equal(geometry.refreshCenter, true, JSON.stringify(geometry));
    assert.deepEqual(geometry.refreshGrid, ['2', '2'], JSON.stringify(geometry));
    assert.equal(geometry.inside, true, JSON.stringify(geometry));
    assert.match(geometry.token, /\d+px/, JSON.stringify(geometry));
});

test('beta.12 refresh states keep the footer geometry stable and the live status visually hidden', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const geometry = await withChromium(
        htmlWithLateHost(`<div class="rlb-popover" style="width:340px"><div class="rlb-popover__footer"><button class="bp3-button bp3-small">Dashboard</button><button class="bp3-button bp3-small">Pause All</button><button class="bp3-button bp3-small bp3-intent-danger">Clock Out All</button><div class="rlb-surface__refresh-cell" data-refresh-state="idle"><button class="bp3-button bp3-minimal bp3-small bp3-icon-refresh rlb-surface__refresh rlb-surface__refresh--idle" data-action="refresh" aria-label="Refresh Sessions from graph" title="Refresh Sessions from graph"></button><span class="rlb-surface__refresh-status rlb-surface__refresh-status--idle rlb-visually-hidden" role="status" aria-live="polite" aria-atomic="true"></span></div></div><div class="rlb-popover__notice" role="alert">Retry after Roam finishes syncing</div></div>`),
        `(() => {
            const rect = node => { const r = node.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
            const footer = document.querySelector('.rlb-popover__footer');
            const cell = document.querySelector('.rlb-surface__refresh-cell');
            const refresh = cell.querySelector('[data-action="refresh"]');
            const status = cell.querySelector('.rlb-surface__refresh-status');
            const notice = document.querySelector('.rlb-popover__notice');
            const stateRects = {};
            const messages = { idle: '', loading: 'Refreshing from graph', success: 'Updated just now', error: 'Showing last valid snapshot' };
            for (const state of Object.keys(messages)) {
                cell.dataset.refreshState = state;
                refresh.className = 'bp3-button bp3-minimal bp3-small bp3-icon-refresh rlb-surface__refresh rlb-surface__refresh--' + state;
                refresh.disabled = state === 'loading';
                if (state === 'loading') refresh.setAttribute('aria-busy', 'true');
                else refresh.removeAttribute('aria-busy');
                status.className = 'rlb-surface__refresh-status rlb-surface__refresh-status--' + state + ' rlb-visually-hidden';
                status.textContent = messages[state];
                stateRects[state] = { footer: rect(footer), cell: rect(cell), refresh: rect(refresh) };
            }
            const baseline = stateRects.idle;
            const stable = state => ['footer', 'cell', 'refresh'].every(key => {
                const before = baseline[key];
                const after = stateRects[state][key];
                return ['left', 'right', 'top', 'bottom', 'width', 'height'].every(field => Math.abs(before[field] - after[field]) <= 1);
            });
            const statusStyle = getComputedStyle(status);
            return {
                stateRects,
                stable: Object.keys(messages).every(stable),
                statusRole: status.getAttribute('role'),
                statusLive: status.getAttribute('aria-live'),
                statusAtomic: status.getAttribute('aria-atomic'),
                statusHidden: statusStyle.clip !== 'auto' && statusStyle.width === '1px' && statusStyle.height === '1px',
                failureNoticeVisible: Boolean(notice.getClientRects().length) && /Retry after Roam finishes syncing/.test(notice.textContent),
            };
        })()`
    );
    if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify(geometry));
    assert.equal(geometry.stable, true, JSON.stringify(geometry));
    assert.equal(geometry.statusRole, 'status', JSON.stringify(geometry));
    assert.equal(geometry.statusLive, 'polite', JSON.stringify(geometry));
    assert.equal(geometry.statusAtomic, 'true', JSON.stringify(geometry));
    assert.equal(geometry.statusHidden, true, JSON.stringify(geometry));
    assert.equal(geometry.failureNoticeVisible, true, JSON.stringify(geometry));
});

test('beta.15 empty Session footer stays on one row at narrow widths across Refresh states', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    for (const width of [320, 360]) {
        const geometry = await withChromium(
            htmlWithLateHost(`<div class="rlb-popover" style="width:${width}px"><div class="rlb-popover__footer rlb-popover__footer--empty"><button class="bp3-button bp3-small">Dashboard</button><div class="rlb-surface__refresh-cell" data-refresh-state="idle"><button class="bp3-button bp3-minimal bp3-small bp3-icon-refresh rlb-surface__refresh rlb-surface__refresh--idle" data-action="refresh" aria-label="Refresh Sessions from graph" title="Refresh Sessions from graph"></button><span class="rlb-surface__refresh-status rlb-visually-hidden" role="status" aria-live="polite" aria-atomic="true"></span></div></div></div>`),
            `(() => {
                const rect = node => { const r = node.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
                const popover = document.querySelector('.rlb-popover');
                const footer = popover.querySelector('.rlb-popover__footer');
                const dashboard = footer.querySelector('button');
                const cell = footer.querySelector('.rlb-surface__refresh-cell');
                const refresh = cell.querySelector('[data-action="refresh"]');
                const footerStyle = getComputedStyle(footer);
                const states = ['idle', 'loading', 'success', 'error'];
                const stateRects = {};
                for (const state of states) {
                    cell.dataset.refreshState = state;
                    refresh.className = 'bp3-button bp3-minimal bp3-small bp3-icon-refresh rlb-surface__refresh rlb-surface__refresh--' + state;
                    refresh.disabled = state === 'loading';
                    stateRects[state] = { footer: rect(footer), dashboard: rect(dashboard), cell: rect(cell), refresh: rect(refresh) };
                }
                const baseline = stateRects.idle;
                const stable = state => ['footer', 'dashboard', 'cell', 'refresh'].every(key => ['left', 'right', 'top', 'bottom', 'width', 'height'].every(field => Math.abs(stateRects[state][key][field] - baseline[key][field]) <= 1));
                return {
                    footer: rect(footer), dashboard: rect(dashboard), cell: rect(cell), refresh: rect(refresh),
                    rows: footerStyle.gridTemplateRows.split(' '), columns: footerStyle.gridTemplateColumns.split(' '),
                    oneRow: footerStyle.gridTemplateRows.split(' ').length === 1,
                    cellWidth: rect(cell).width,
                    aligned: Math.abs(rect(dashboard).top - rect(cell).top) <= 1 && Math.abs(rect(dashboard).bottom - rect(cell).bottom) <= 1,
                    inside: [dashboard, cell, refresh].every(node => { const item = rect(node); const outer = rect(footer); return item.left >= outer.left && item.right <= outer.right + .5 && item.top >= outer.top && item.bottom <= outer.bottom + .5; }),
                    overflow: popover.scrollWidth > popover.clientWidth + 1,
                    stable: states.every(stable),
                    refreshWidth: rect(refresh).width,
                };
            })()`
        );
        if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify({ width, geometry }));
        assert.equal(geometry.oneRow, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.cellWidth, 40, JSON.stringify({ width, geometry }));
        assert.equal(geometry.aligned, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.inside, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.overflow, false, JSON.stringify({ width, geometry }));
        assert.equal(geometry.stable, true, JSON.stringify({ width, geometry }));
        assert.ok(geometry.refreshWidth >= 30 && geometry.refreshWidth <= 32, JSON.stringify({ width, geometry }));
    }
});

test('beta.15 analytics uses one Focus time header and compact Linear panels', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const bars = [0, 18, 0, 42, 76, 0, 28]
        .map((height, index) => `<rect class="rlb-analytics__bar" x="${index * 92 + 16}" y="${190 - height}" width="12" height="${height}" aria-label="Aug ${9 + index}, ${height}m"><title>Aug ${9 + index}: ${height} minutes</title></rect><text class="rlb-analytics__label" x="${index * 92 + 22}" y="166" text-anchor="middle">Aug ${9 + index}</text>`)
        .join('');
    const distribution = ['Reading', 'Writing', 'Planning', 'Review', 'Research']
        .map((title, index) => `<div class="rlb-analytics__distribution-row"><div class="rlb-analytics__distribution-header"><a class="rlb-task-link" href="#">${title}</a><span class="rlb-analytics__distribution-duration">${30 - index * 4}% · ${12 - index}h</span></div><div class="rlb-analytics__distribution-track"><span class="rlb-analytics__distribution-fill" style="width:${30 - index * 4}%"></span></div></div>`)
        .join('') + `<div class="rlb-analytics__distribution-row"><div class="rlb-analytics__distribution-header"><span class="rlb-analytics__other-label">Other</span><span class="rlb-analytics__distribution-duration">10% · 2h</span></div><div class="rlb-analytics__distribution-track"><span class="rlb-analytics__distribution-fill" style="width:10%"></span></div></div>`;
    const profile = [['Sessions', '18'], ['Active days', '4'], ['Median session', '54m']]
        .map(([label, value]) => `<div class="rlb-analytics__profile-row"><span class="rlb-analytics__profile-label">${label}</span><strong>${value}</strong></div>`)
        .join('');
    const markup = `<div class="rlb-root rlb-root--open rlb-dashboard"><div class="rlb-dialog" style="width:1120px"><header class="rlb-header"><h2>Roam Logbook</h2><button class="rlb-dashboard__view-toggle" aria-label="Back to Overview" aria-controls="roam-logbook-dashboard-view" aria-pressed="true"></button></header><div class="rlb-body" id="roam-logbook-dashboard-view"><section class="rlb-analytics"><section class="rlb-analytics__chart rlb-dashboard-panel"><div class="rlb-analytics__activity-header"><div class="rlb-analytics__activity-heading"><h3 class="rlb-analytics__section-title">Activity</h3><span class="rlb-analytics__activity-range">Last 7 days</span></div><div class="rlb-analytics__focus"><span class="rlb-analytics__focus-label">Focus time</span><strong class="rlb-analytics__focus-value">21h 04m</strong></div></div><svg class="rlb-analytics__svg" role="img" aria-labelledby="activity-title activity-description" viewBox="0 0 760 190"><title id="activity-title">Activity over time</title><desc id="activity-description">Daily focus time for the selected range.</desc>${bars}</svg></section><div class="rlb-analytics__panels"><section class="rlb-analytics__panel rlb-dashboard-panel"><h3 class="rlb-analytics__section-title">Task time distribution</h3><div class="rlb-analytics__distribution">${distribution}</div></section><section class="rlb-analytics__panel rlb-dashboard-panel"><h3 class="rlb-analytics__section-title">Session profile</h3><div class="rlb-analytics__profile">${profile}</div></section></div></section></div></div></div>`;
    const geometry = await withChromium(
        htmlWithLateHost(markup),
        `(() => {
            const chart = document.querySelector('.rlb-analytics__chart');
            const svg = document.querySelector('.rlb-analytics__svg');
            const bars = [...svg.querySelectorAll('.rlb-analytics__bar')];
            const panels = [...document.querySelectorAll('.rlb-analytics__panels > section')];
            const taskLink = document.querySelector('.rlb-task-link');
            const analytics = document.querySelector('.rlb-analytics');
            const profileRows = [...document.querySelectorAll('.rlb-analytics__profile-row')];
            const labels = [...svg.querySelectorAll('.rlb-analytics__label')];
            const rect = node => { const r = node.getBoundingClientRect(); return { width:r.width, height:r.height, left:r.left, right:r.right }; };
            return {
                kpis: document.querySelectorAll('.rlb-analytics__kpis').length,
                focusCount: document.querySelectorAll('.rlb-analytics__focus-value').length,
                activity: document.querySelector('.rlb-analytics__activity-heading')?.textContent.trim(),
                chart: rect(chart), svg: rect(svg), svgRole: svg.getAttribute('role'), labelled: svg.getAttribute('aria-labelledby'),
                barCount: bars.length, barWidths: bars.map(bar => parseFloat(bar.getAttribute('width'))), titles: bars.every(bar => bar.querySelector('title')),
                labelCount: labels.length, lastLabel: labels.at(-1)?.textContent,
                panels: panels.length, distribution: Boolean(document.querySelector('.rlb-analytics__distribution')),
                distributionRows: document.querySelectorAll('.rlb-analytics__distribution-row').length,
                taskLinks: document.querySelectorAll('.rlb-analytics__distribution .rlb-task-link').length,
                profile: Boolean(document.querySelector('.rlb-analytics__profile')), profileRows: profileRows.length,
                taskLinkColor: getComputedStyle(taskLink).color,
                analyticsFont: getComputedStyle(analytics).fontFamily,
                svgFont: getComputedStyle(svg).fontFamily,
                labelFontSize: getComputedStyle(labels[0]).fontSize,
                panelBorder: getComputedStyle(panels[0]).borderWidth,
                panelRadius: getComputedStyle(panels[0]).borderTopLeftRadius,
                panelShadow: getComputedStyle(panels[0]).boxShadow,
                noOverflow: document.querySelector('.rlb-dialog').scrollWidth <= document.querySelector('.rlb-dialog').clientWidth + 1,
            };
        })()`
    );
    if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify(geometry));
    assert.equal(geometry.kpis, 0, JSON.stringify(geometry));
    assert.equal(geometry.focusCount, 1, JSON.stringify(geometry));
    assert.match(geometry.activity, /Activity.*Last 7 days/, JSON.stringify(geometry));
    assert.ok(geometry.chart.height >= 210 && geometry.chart.height <= 224, JSON.stringify(geometry));
    assert.ok(geometry.svg.height >= 175 && geometry.svg.height <= 177, JSON.stringify(geometry));
    assert.equal(geometry.svgRole, 'img', JSON.stringify(geometry));
    assert.equal(geometry.labelled, 'activity-title activity-description', JSON.stringify(geometry));
    assert.equal(geometry.barCount, 7, JSON.stringify(geometry));
    assert.ok(geometry.barWidths.every(width => width >= 8 && width <= 16), JSON.stringify(geometry));
    assert.equal(geometry.titles, true, JSON.stringify(geometry));
    assert.ok(geometry.labelCount <= 7, JSON.stringify(geometry));
    assert.ok(geometry.lastLabel, JSON.stringify(geometry));
    assert.equal(geometry.panels, 2, JSON.stringify(geometry));
    assert.equal(geometry.distribution, true, JSON.stringify(geometry));
    assert.equal(geometry.distributionRows, 6, JSON.stringify(geometry));
    assert.equal(geometry.taskLinks, 5, JSON.stringify(geometry));
    assert.equal(geometry.profile, true, JSON.stringify(geometry));
    assert.equal(geometry.profileRows, 3, JSON.stringify(geometry));
    assert.equal(geometry.svgFont, geometry.analyticsFont, JSON.stringify(geometry));
    assert.equal(geometry.labelFontSize, '10px', JSON.stringify(geometry));
    assert.equal(geometry.panelBorder, '1px', JSON.stringify(geometry));
    assert.equal(geometry.panelRadius, '6px', JSON.stringify(geometry));
    assert.equal(geometry.panelShadow, 'none', JSON.stringify(geometry));
    assert.equal(geometry.noOverflow, true, JSON.stringify(geometry));

    const mobile = await withChromium(
        htmlWithLateHost(markup.replace('width:1120px', 'width:500px')),
        `(() => {
            const dialog = document.querySelector('.rlb-dialog');
            const chart = document.querySelector('.rlb-analytics__chart');
            const svg = document.querySelector('.rlb-analytics__svg');
            const panels = document.querySelector('.rlb-analytics__panels');
            const style = getComputedStyle(panels);
            return {
                chartHeight: chart.getBoundingClientRect().height,
                svgHeight: svg.getBoundingClientRect().height,
                columns: style.gridTemplateColumns,
                overflow: dialog.scrollWidth > dialog.clientWidth + 1,
            };
        })()`,
        { width: 500, height: 800 }
    );
    if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify({ mobile }));
    assert.ok(mobile.chartHeight >= 190 && mobile.chartHeight <= 196, JSON.stringify(mobile));
    assert.ok(mobile.svgHeight >= 147 && mobile.svgHeight <= 149, JSON.stringify(mobile));
    assert.equal(mobile.columns.split(' ').length, 1, JSON.stringify(mobile));
    assert.equal(mobile.overflow, false, JSON.stringify(mobile));
});

test('beta.10 Popover keeps two compact Sessions inside one low-contrast group', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const longTitle = 'A long Session title that remains accessible while ellipsizing visually';
    const geometry = await withChromium(
        htmlWithLateHost(
            `<div class="rlb-popover" style="width:340px"><header class="rlb-surface__header"><div class="rlb-popover__title">2 Sessions Running</div></header><div class="rlb-surface__list" role="group" aria-label="Current Sessions"><div class="rlb-run"><span class="rlb-run__status rlb-run__status--running" aria-hidden="true"></span><div class="rlb-run__body"><button class="bp3-button bp3-minimal rlb-run__title" title="Open this block: ${longTitle}" aria-label="Open this block: ${longTitle}">${longTitle}</button><div class="rlb-run__meta"><div class="rlb-run__meta-line">12:34 · 2h 05m total</div><time class="rlb-run__meta-line">Today 09:12</time></div></div><div class="rlb-run__actions"><button class="bp3-button bp3-small bp3-minimal bp3-icon-log-out rlb-run__checkout" title="Check Out" aria-label="Check Out"></button><button class="bp3-button bp3-small bp3-minimal bp3-icon-trash" title="Discard this CLOCK entry" aria-label="Discard this CLOCK entry"></button></div></div><div class="rlb-run"><span class="rlb-run__status rlb-run__status--running" aria-hidden="true"></span><div class="rlb-run__body"><button class="bp3-button bp3-minimal rlb-run__title" title="Open this block: Another Session" aria-label="Open this block: Another Session">Another Session</button><div class="rlb-run__meta"><div class="rlb-run__meta-line">1:02 · 30m total</div><time class="rlb-run__meta-line">Today 09:30</time></div></div><div class="rlb-run__actions"><button class="bp3-button bp3-small bp3-minimal bp3-icon-log-out rlb-run__checkout" title="Check Out" aria-label="Check Out"></button><button class="bp3-button bp3-small bp3-minimal bp3-icon-trash" title="Discard this CLOCK entry" aria-label="Discard this CLOCK entry"></button></div></div></div><div class="rlb-popover__footer"><button class="bp3-button bp3-small">Dashboard</button><button class="bp3-button bp3-small">Pause All</button><button class="bp3-button bp3-small bp3-intent-danger">Clock Out All</button><button class="bp3-button bp3-small bp3-minimal bp3-icon-refresh rlb-surface__refresh" title="Refresh Sessions from graph" aria-label="Refresh Sessions from graph"></button></div></div>`
        ),
        `(() => {
            const rect = node => { const r = node.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
            const surface = document.querySelector('.rlb-popover');
            const list = surface.querySelector('.rlb-surface__list');
            const rows = [...list.querySelectorAll('.rlb-run')];
            const footer = surface.querySelector('.rlb-popover__footer');
            const rowRects = rows.map(rect);
            const footerRects = [...footer.querySelectorAll('button')].map(rect);
            const first = rows[0];
            const bullet = rect(first.querySelector('.rlb-run__status'));
            const title = rect(first.querySelector('.rlb-run__title'));
            const listStyle = getComputedStyle(list);
            const footerStyle = getComputedStyle(footer);
            return {
                listBorder: listStyle.borderTopWidth,
                listRadius: parseFloat(listStyle.borderTopLeftRadius),
                groupRole: list.getAttribute('role'),
                groupLabel: list.getAttribute('aria-label'),
                rowCount: rows.length,
                rowHeights: rowRects.map(item => item.height),
                rowGap: parseFloat(listStyle.rowGap) || 0,
                bulletTitleDelta: Math.abs((bullet.top + bullet.height / 2) - (title.top + title.height / 2)),
                footerListGap: rect(footer).top - rect(list).bottom,
                footerHeights: footerRects.map(item => item.height),
                footerHeightDelta: Math.max(...footerRects.map(item => item.height)) - Math.min(...footerRects.map(item => item.height)),
                footerRows: footerStyle.gridTemplateRows
            };
        })()`
    );
    if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify(geometry));
    assert.equal(geometry.listBorder, '1px', JSON.stringify(geometry));
    assert.ok(geometry.listRadius >= 5, JSON.stringify(geometry));
    assert.equal(geometry.groupRole, 'group', JSON.stringify(geometry));
    assert.equal(geometry.groupLabel, 'Current Sessions', JSON.stringify(geometry));
    assert.equal(geometry.rowCount, 2, JSON.stringify(geometry));
    assert.ok(geometry.rowHeights.every(height => height >= 42 && height <= 76), JSON.stringify(geometry));
    assert.ok(geometry.rowGap <= 8, JSON.stringify(geometry));
    assert.ok(geometry.bulletTitleDelta <= 2, JSON.stringify(geometry));
    assert.ok(geometry.footerListGap <= 14, JSON.stringify(geometry));
    assert.ok(geometry.footerHeightDelta <= 1, JSON.stringify(geometry));
    assert.match(geometry.footerRows, /32px/);
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
