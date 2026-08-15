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
        htmlWithLateHost(`<div class="rm-topbar" style="width:360px"><div class="rlb-topbar__layout" style="width:100%"><div class="rlb-nav" style="flex:0 0 72px">‹ ›</div><div class="rlb-topbar"><button class="bp3-button bp3-minimal rlb-topbar__button rlb-topbar__button--icon-only" aria-label="Logbook"><span class="bp3-icon bp3-icon-history rlb-topbar__icon"></span></button></div><div class="rlb-topbar__search" style="flex:1 1 auto"><input style="width:100%" aria-label="Find or create a page" /></div><div class="rlb-right" style="flex:0 0 56px">?</div></div></div>`),
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
                `<button class="rlb-activity__bucket rlb-activity__bucket--level-${minutes === 0 ? 0 : index === 3 ? 3 : 1}${minutes === 0 ? ' rlb-activity__bucket--empty' : ''}" aria-label="2026-08-${String(index + 9).padStart(2, '0')}, day, ${minutes}m" title="2026-08-${String(index + 9).padStart(2, '0')} · ${minutes}m"><span class="rlb-activity__fill" style="height:${minutes}%"></span><span class="rlb-activity__label">Aug ${index + 9} ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][index]}</span></button>`
        )
        .join('');
    const geometry = await withChromium(
        htmlWithLateHost(`<div class="rlb-root rlb-root--open rlb-dashboard"><div style="width:320px"><div class="rlb-summary"><div class="rlb-stats"><div class="rlb-stat rlb-stat--activity"><strong class="rlb-stat__value">13h 47m</strong><span class="rlb-stat__label">Last 7 days</span><div class="rlb-activity-rail" data-day-count="7" style="--rlb-activity-count:7" role="list">${cells}</div></div></div></div></div></div>`),
        `(() => {
            const chart = document.querySelector('.rlb-activity-rail');
            const cells = [...chart.querySelectorAll('.rlb-activity__bucket')];
            const rect = node => { const value = node.getBoundingClientRect(); return { left:value.left, right:value.right, top:value.top, bottom:value.bottom, width:value.width, height:value.height }; };
            const rects = cells.map(rect);
            return {
                chart: rect(chart),
                count: cells.length,
                columns: getComputedStyle(chart).gridTemplateColumns,
                labels: cells.map(cell => cell.querySelector('.rlb-activity__label').textContent),
                colors: cells.map(cell => getComputedStyle(cell.querySelector('.rlb-activity__fill')).backgroundColor),
                accessible: cells.every(cell => cell.title.includes('2026-08-') && cell.getAttribute('aria-label').includes('m')),
                keyboard: cells.every(cell => cell.tagName === 'BUTTON' && cell.tabIndex >= 0),
                overlap: rects.some((item, index) => index > 0 && item.left < rects[index - 1].right),
                labelsInside: cells.every(cell => { const cellRect = rect(cell); const labelRect = rect(cell.querySelector('.rlb-activity__label')); return labelRect.left >= cellRect.left && labelRect.right <= cellRect.right + 0.5; })
            };
        })()`
    );
    if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify(geometry));
    assert.equal(geometry.count, 7, JSON.stringify(geometry));
    assert.ok(geometry.chart.height >= 28 && geometry.chart.height <= 40, JSON.stringify(geometry));
    assert.match(geometry.columns, /\d+(?:\.\d+)?px\s+\d+(?:\.\d+)?px\s+\d+(?:\.\d+)?px/, JSON.stringify(geometry));
    assert.equal(geometry.accessible, true, JSON.stringify(geometry));
    assert.equal(geometry.keyboard, true, JSON.stringify(geometry));
    assert.equal(geometry.overlap, false, JSON.stringify(geometry));
    assert.equal(geometry.labelsInside, true, JSON.stringify(geometry));
    assert.ok(new Set(geometry.colors).size >= 3, JSON.stringify(geometry));
    assert.ok(geometry.colors.every(color => !color.includes('45, 114, 210')), JSON.stringify(geometry));
});

test('beta.7 dashboard removes the standalone activity section and border soup', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const geometry = await withChromium(
            htmlWithLateHost(`<div class="rlb-root rlb-root--open rlb-dashboard"><div class="rlb-dialog" style="width:760px;height:700px"><header class="rlb-header bp3-dialog-header"><div class="rlb-header__heading"><h2 class="rlb-header__title">Logbook</h2><p class="rlb-header__subtitle">Focus sessions, activity, and task rollups</p></div></header><div class="rlb-summary"><div class="rlb-stats"><div class="rlb-stat"><strong class="rlb-stat__value">2h 17m</strong><span class="rlb-stat__label">Today</span></div><div class="rlb-stat rlb-stat--activity"><strong class="rlb-stat__value">13h 47m</strong><span class="rlb-stat__label">Last 7 days</span><div class="rlb-activity-rail" role="group"><button class="rlb-activity__bucket rlb-activity__bucket--level-3" title="2026-08-15 · 2h"> <span class="rlb-activity__fill" style="height:100%"></span><span class="rlb-activity__label">Sat</span></button></div></div><div class="rlb-stat"><strong class="rlb-stat__value">3</strong><span class="rlb-stat__label">Tasks tracked</span></div></div></div><div class="rlb-body"><section class="rlb-dashboard-section rlb-running"><h3 class="rlb-section__title">Running</h3><table class="rlb-table"><thead><tr><th>Task</th><th>Started</th><th>Elapsed</th></tr></thead><tbody><tr><td>Graph Engineering</td><td>Today 12:38</td><td>2:17</td></tr></tbody></table></section><section class="rlb-dashboard-section rlb-by-task"><div class="rlb-section__heading"><h3 class="rlb-section__title">By task</h3></div><table class="rlb-table"><tbody><tr><td>记得早点购买护肤品。</td><td>2</td><td>1h</td><td>1h</td></tr><tr><td>Graph Engineering: a long task title</td><td>7</td><td>1h</td><td>2h</td></tr></tbody></table></section></div></div></div>`),
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

test('beta.7 integrated summary stays three-column, embeds activity, and keeps the task list first', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const buckets = [0, 30, 0, 120, 0, 60, 15]
        .map(
            (minutes, index) =>
                `<button class="rlb-activity__bucket rlb-activity__bucket--level-${minutes ? (index === 3 ? 3 : 1) : 0}${minutes ? '' : ' rlb-activity__bucket--empty'}" aria-label="2026-08-${String(index + 9).padStart(2, '0')}, ${minutes}m" title="2026-08-${String(index + 9).padStart(2, '0')} · ${minutes}m"><span class="rlb-activity__fill" style="height:${minutes ? Math.max(8, Math.round((minutes / 120) * 100)) : 0}%"></span><span class="rlb-activity__label">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][index]}</span></button>`
        )
        .join('');

    for (const width of [960, 640, 360]) {
        const geometry = await withChromium(
            htmlWithLateHost(`<div class="rlb-root rlb-root--open rlb-dashboard"><div class="rlb-dialog" style="width:${width}px"><header class="rlb-header bp3-dialog-header"><div class="rlb-header__heading"><h2 class="rlb-header__title">Logbook</h2><p class="rlb-header__subtitle">Focus sessions, activity, and task rollups</p></div></header><div class="rlb-summary"><div class="rlb-stats"><div class="rlb-stat"><strong class="rlb-stat__value">2h 17m</strong><span class="rlb-stat__label">Today</span></div><div class="rlb-stat rlb-stat--activity"><strong class="rlb-stat__value">13h 47m</strong><span class="rlb-stat__label">Last 7 days</span><div class="rlb-activity-rail" data-day-count="7" role="list" aria-label="Last 7 days activity">${buckets}</div></div><div class="rlb-stat"><strong class="rlb-stat__value">3</strong><span class="rlb-stat__label">Tasks tracked</span></div></div></div><div class="rlb-body"><section class="rlb-dashboard-section rlb-by-task"><div class="rlb-section__heading"><h3 class="rlb-section__title">By task</h3></div><table class="rlb-table"><tbody><tr><td>一个很长的中文任务标题</td><td>2</td><td>1h</td><td>1h</td></tr></tbody></table></section></div></div></div>`),
            `(() => {
                const rect = node => { const r = node.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
                const dialog = document.querySelector('.rlb-dialog');
                const summary = document.querySelector('.rlb-summary');
                const stats = [...document.querySelectorAll('.rlb-stat')];
                const activity = document.querySelector('.rlb-activity-rail');
                const buckets = [...document.querySelectorAll('.rlb-activity__bucket')];
                const task = document.querySelector('.rlb-by-task');
                const statRects = stats.map(rect);
                const activityRect = rect(activity);
                const summaryRect = rect(summary);
                const taskRect = rect(task);
                const dialogRect = rect(dialog);
                const bucketRects = buckets.map(rect);
                const activityStyle = getComputedStyle(activity);
                const summaryStyle = getComputedStyle(summary);
                return {
                    width: ${width},
                    statCount: stats.length,
                    activityInsideSelected: activity.closest('.rlb-stat') === stats[1],
                    selectedWider: statRects[1]?.width >= statRects[0]?.width,
                    activityInsideSummary: activityRect.left >= summaryRect.left && activityRect.right <= summaryRect.right + .5,
                    bucketsInside: bucketRects.every(item => item.left >= activityRect.left && item.right <= activityRect.right + .5),
                    bucketsFit: bucketRects.every(item => item.width >= 2 && item.height >= 12),
                    noBucketOverlap: bucketRects.every((item, index) => bucketRects.slice(index + 1).every(other => item.right <= other.left || other.right <= item.left || item.bottom <= other.top || other.bottom <= item.top)),
                    activityDisplay: activityStyle.display,
                    activityColumns: activityStyle.gridTemplateColumns,
                    summaryOverflowX: summaryStyle.overflowX,
                    taskAfterSummary: taskRect.top >= summaryRect.bottom - .5,
                    noStandaloneDay: !document.querySelector('.rlb-by-day, .rlb-bars, .rlb-bars__range'),
                    noModalOverflow: dialog.scrollWidth <= dialog.clientWidth + 1,
                    taskInside: taskRect.left >= dialogRect.left && taskRect.right <= dialogRect.right + .5
                };
            })()`
        );
        if (process.env.RLB_LAYOUT_DIAGNOSTICS) t.diagnostic(JSON.stringify({ width, geometry }));
        assert.equal(geometry.statCount, 3, JSON.stringify({ width, geometry }));
        assert.equal(geometry.activityInsideSelected, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.selectedWider, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.activityInsideSummary, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.bucketsInside, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.bucketsFit, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.noBucketOverlap, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.activityDisplay, 'grid', JSON.stringify({ width, geometry }));
        assert.notEqual(geometry.activityColumns, 'none', JSON.stringify({ width, geometry }));
        assert.notEqual(geometry.summaryOverflowX, 'auto', JSON.stringify({ width, geometry }));
        assert.equal(geometry.taskAfterSummary, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.noStandaloneDay, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.noModalOverflow, true, JSON.stringify({ width, geometry }));
        assert.equal(geometry.taskInside, true, JSON.stringify({ width, geometry }));
    }
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

test('paused icon-only topbar keeps clock identity with only a quiet background state', async t => {
    if (!(await findChromium())) return t.skip('Chromium is unavailable');
    const geometry = await withChromium(
        htmlWithLateHost(`<div class="rlb-topbar"><button class="bp3-button bp3-minimal rlb-topbar__button rlb-topbar__button--icon-only" aria-label="Logbook — no Session running"><span class="bp3-icon bp3-icon-history rlb-topbar__icon"></span></button><button class="bp3-button bp3-minimal rlb-topbar__button rlb-topbar__button--icon-only rlb-topbar__button--paused" aria-label="2 Sessions Paused — click to resume or review."><span class="bp3-icon bp3-icon-history rlb-topbar__icon"></span></button></div>`),
        `(() => {
            const buttons = [...document.querySelectorAll('.rlb-topbar__button')];
            const rect = node => { const r = node.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
            const idle = buttons[0];
            const paused = buttons[1];
            const idleRect = rect(idle);
            const pausedRect = rect(paused);
            const pausedStyle = getComputedStyle(paused);
            return {
                idle: idleRect,
                paused: pausedRect,
                idleHasBadge: Boolean(idle.querySelector('.rlb-topbar__pause-badge')),
                pausedHasBadge: Boolean(paused.querySelector('.rlb-topbar__pause-badge')),
                pausedHasClock: Boolean(paused.querySelector('.bp3-icon-history')),
                pausedLabel: paused.getAttribute('aria-label'),
                pausedBackground: pausedStyle.backgroundColor,
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
    assert.notEqual(geometry.pausedBackground, 'rgba(0, 0, 0, 0)', JSON.stringify(geometry));
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
            htmlWithLateHost(`<div class="rlb-popover" style="width:${width}px"><header class="rlb-surface__header"><div class="rlb-popover__title">1 Session Running</div></header><div class="rlb-run"><span class="rlb-run__status rlb-run__status--running" aria-hidden="true"></span><div class="rlb-run__body"><button class="bp3-button bp3-minimal bp3-icon-document-open rlb-run__title" title="Open this block: ${longTitle}" aria-label="Open this block: ${longTitle}">${longTitle}</button><div class="rlb-run__meta"><div class="rlb-run__meta-line rlb-run__meta-primary">12:34 · target 30:00 · 2h 05m total</div><time class="rlb-run__meta-line rlb-run__started" title="Started [2026-08-14 Fri 21:30] · Page: Project Page" aria-label="Started [2026-08-14 Fri 21:30] · Page: Project Page">Aug 14 21:30</time></div></div><div class="rlb-run__actions"><button class="bp3-button bp3-small bp3-minimal bp3-icon-log-out rlb-run__checkout" data-action="clock-out" title="Check Out" aria-label="Check Out"></button><button class="bp3-button bp3-minimal bp3-small bp3-icon-trash" data-action="discard" title="Discard this CLOCK entry (cannot be undone)" aria-label="Discard this CLOCK entry (cannot be undone)"></button></div></div><div class="rlb-popover__footer"><button class="bp3-button bp3-small">Dashboard</button><button class="bp3-button bp3-small">Pause All</button><button class="bp3-button bp3-small bp3-intent-danger">Clock Out All</button><button class="bp3-button bp3-small bp3-minimal bp3-icon-refresh" data-action="refresh" title="Refresh" aria-label="Refresh"></button></div></div>`),
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
