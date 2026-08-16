/**
 * The dashboard dialog: a compact overview, running sessions, and a per-task
 * breakdown. Analytics is an opt-in second view so opening the dashboard stays
 * list-first and quiet.
 *
 * Reads the graph on open and on refresh only — there is no live subscription,
 * because a dialog that reshuffles under the cursor is worse than a stale one.
 */

import * as clock from './clock.js';
import { button, el } from './dom.js';
import { readDashboardSnapshot } from './entries.js';
import { openBlock, openBlockInRightSidebar } from './roam.js';
import {
    buildDashboard,
    entryMinutes,
    filterByRange,
    findStaleClocks,
    flattenForest,
    getRange,
    RANGES,
    summariseSessionMetrics,
} from './stats.js';
import { staleHours } from './settings.js';
import { acquireThemeRuntime, applyRoamThemePalette } from './theme.js';
import { formatDayLabel, formatElapsed, formatMinutesHuman, formatStarted } from './time.js';

const ROOT_ID = 'roam-logbook-dashboard';
const DASHBOARD_TITLE = 'Roam Logbook';
const VIEW_HOST_ID = 'roam-logbook-dashboard-view';
const SVG_NS = 'http://www.w3.org/2000/svg';

// Dashboard overlays are allowed to outlive a single render, and hot reloads
// can briefly create more than one controller. Keep the document lock shared
// and reference-counted so the last close restores the exact pre-open state.
const documentScrollLocks = new WeakMap();

const restoreInlineStyle = (node, value) => {
    if (!node) return;
    if (value === null) node.removeAttribute('style');
    else node.setAttribute('style', value);
};

const releaseDocumentScrollLock = (documentRef, state) => {
    const current = documentScrollLocks.get(documentRef);
    if (current !== state) return;
    current.count -= 1;
    if (current.count > 0) return;

    restoreInlineStyle(current.html, current.htmlStyle);
    restoreInlineStyle(current.body, current.bodyStyle);
    try {
        window.scrollTo(current.scrollX, current.scrollY);
    } catch {
        // jsdom and older embedded WebViews may not implement scrollTo.
    }
    documentScrollLocks.delete(documentRef);
};

const acquireDocumentScrollLock = () => {
    const documentRef = document;
    const html = documentRef.documentElement;
    const body = documentRef.body;
    if (!html || !body) return () => {};

    let state = documentScrollLocks.get(documentRef);
    if (!state) {
        const scrollX = Number(window.scrollX) || 0;
        const scrollY = Number(window.scrollY) || 0;
        const scrollbarWidth = Math.max(0, (Number(window.innerWidth) || 0) - html.clientWidth);
        const computedPadding = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
        state = {
            count: 0,
            html,
            body,
            htmlStyle: html.getAttribute('style'),
            bodyStyle: body.getAttribute('style'),
            scrollX,
            scrollY,
        };
        documentScrollLocks.set(documentRef, state);
        try {
            html.style.overflow = 'hidden';
            body.style.overflow = 'hidden';
            if (scrollbarWidth > 0) {
                body.style.paddingRight = `${computedPadding + scrollbarWidth}px`;
            }
        } catch (error) {
            restoreInlineStyle(html, state.htmlStyle);
            restoreInlineStyle(body, state.bodyStyle);
            documentScrollLocks.delete(documentRef);
            throw error;
        }
    }

    state.count += 1;
    let released = false;
    return () => {
        if (released) return;
        released = true;
        releaseDocumentScrollLock(documentRef, state);
    };
};

export function createDashboard({
    now: nowFn = () => new Date(),
    setIntervalFn = (callback, delay) => setInterval(callback, delay),
    clearIntervalFn = ticker => clearInterval(ticker),
} = {}) {
    let root = null;
    let summaryNode = null;
    let bodyNode = null;
    let rangeId = 'week';
    let returnFocusTo = null;
    let liveTicker = null;
    let discardConfirmUid = null;
    let discardConfirmTimer = null;
    let lastSnapshot = null;
    let lastModel = null;
    let lastHierarchy = null;
    let lastTransientIssues = [];
    let lastRefreshNotice = '';
    let view = 'overview';
    let viewToggle = null;
    let themeRuntime = null;
    let releaseScrollLock = null;
    // Kept across re-renders and reopens, keyed by task: changing the range or
    // clocking out should not throw away how the user arranged the tree.
    const collapsed = new Set();

    const clearLiveTicker = () => {
        if (liveTicker !== null) clearIntervalFn(liveTicker);
        liveTicker = null;
    };

    const resetDiscardConfirmation = () => {
        discardConfirmUid = null;
        if (discardConfirmTimer) clearTimeout(discardConfirmTimer);
        discardConfirmTimer = null;
    };

    const focusWithoutScroll = node => {
        if (!node?.focus) return;
        try {
            node.focus({ preventScroll: true });
        } catch {
            node.focus();
        }
    };

    const updateLiveMetricNodes = now => {
        if (!lastModel) return;
        const metrics = summariseSessionMetrics(lastModel.entries, now);
        const todayMinutes = filterByRange(lastSnapshot?.entries || [], 'today', now).reduce(
            (sum, entry) => sum + entryMinutes(entry, now),
            0
        );
        const values = {
            today: formatMinutesHuman(todayMinutes),
            selected: formatMinutesHuman(metrics.focusMinutes),
            sessions: String(metrics.sessions),
            tasks: String(lastModel.tasks.length),
            focus: formatMinutesHuman(metrics.focusMinutes),
            average: formatMinutesHuman(metrics.averageMinutes),
            longest: formatMinutesHuman(metrics.longestMinutes),
        };
        for (const node of bodyNode?.querySelectorAll('[data-live-metric]') || []) {
            const value = values[node.dataset.liveMetric];
            if (value !== undefined) node.textContent = value;
        }
        for (const node of summaryNode?.querySelectorAll('[data-live-metric]') || []) {
            const value = values[node.dataset.liveMetric];
            if (value !== undefined) node.textContent = value;
        }
    };

    const updateRunningElapsed = () => {
        if (!root?.classList.contains('rlb-root--open')) return;
        const nowDateValue = nowFn();
        const now = nowDateValue.getTime();
        for (const cell of bodyNode?.querySelectorAll('[data-running-elapsed="true"]') || []) {
            cell.textContent = formatElapsed(now - Number(cell.dataset.startMs));
        }
        updateLiveMetricNodes(nowDateValue);
    };

    const startLiveTicker = () => {
        clearLiveTicker();
        if (!root?.classList.contains('rlb-root--open')) return;
        if (!bodyNode?.querySelector('[data-running-elapsed="true"]') && !lastModel?.running?.length) {
            return;
        }
        liveTicker = setIntervalFn(updateRunningElapsed, 1000);
    };

    const paint = now => {
        if (!bodyNode || !lastModel) return;
        clearLiveTicker();
        const model = lastModel;
        const hierarchy = lastHierarchy || {};
        const transientIssues = lastTransientIssues;
        const refreshNotice = lastRefreshNotice;
        summaryNode.replaceChildren(overviewBar(model, now));
        bodyNode.replaceChildren();

        if (refreshNotice) {
            const notice = el('div', 'rlb-dashboard__notice', refreshNotice);
            notice.setAttribute('role', 'status');
            bodyNode.appendChild(notice);
        }

        const issues = [
            ...model.issues,
            ...(hierarchy.issues || []).map(issueRow),
            ...transientIssues.map(issueRow),
        ];

        if (view === 'analytics') {
            bodyNode.appendChild(analyticsSection(model, now));
            if (issues.length > 0) bodyNode.appendChild(dataIssuesSection(issues));
            startLiveTicker();
            return;
        }

        if (model.running.length > 0) bodyNode.appendChild(runningSection(model.running, now));
        if (model.entries.length === 0) {
            bodyNode.appendChild(el('div', 'rlb-empty', 'No clock entries in this range yet.'));
            if (issues.length > 0) bodyNode.appendChild(dataIssuesSection(issues));
            startLiveTicker();
            return;
        }

        bodyNode.appendChild(tasksSection(model.tree));
        if (issues.length > 0) bodyNode.appendChild(dataIssuesSection(issues));
        startLiveTicker();
    };

    const render = () => {
        if (!bodyNode) return;
        clearLiveTicker();
        const now = nowFn();
        let snapshot;
        let refreshNotice = '';
        let transientIssues = [];
        try {
            const candidate = readDashboardSnapshot();
            lastSnapshot = candidate;
            snapshot = candidate;
        } catch (error) {
            transientIssues = error.issue ? [error.issue] : error.issues || [];
            if (!lastSnapshot) {
                summaryNode.replaceChildren();
                const notice = el(
                    'div',
                    'rlb-dashboard__notice',
                    'Graph data could not be refreshed; no successful snapshot is available yet.'
                );
                notice.setAttribute('role', 'alert');
                const issueRows = transientIssues.map(issueRow);
                bodyNode.replaceChildren(
                    notice,
                    ...(issueRows.length > 0 ? [dataIssuesSection(issueRows)] : [])
                );
                lastModel = null;
                return;
            }
            snapshot = lastSnapshot;
            refreshNotice =
                'Graph data could not be refreshed; showing last successful snapshot.';
        }
        const entries = snapshot.entries;
        const hierarchy = snapshot.hierarchy;
        // Publish the exact snapshot to the clock seam. This updates running
        // state without issuing the entries query a second time.
        clock.refresh({ entries });
        lastModel = buildDashboard(entries, { now, rangeId, hierarchy });
        lastHierarchy = hierarchy;
        lastTransientIssues = transientIssues;
        lastRefreshNotice = refreshNotice;
        paint(now);
    };

    const issueRow = issue => ({
        title: issue.title || issue.parentUid || issue.affectedUid || 'Unresolved graph data',
        rawClock:
            issue.rawClock ||
            (issue.source ? `(graph ${issue.source} read)` : '(hierarchy query)'),
        issues: [issue],
    });

    const dataIssuesSection = issues => {
        const details = el('details', 'rlb-data-issues rlb-dashboard__inline-status');
        const issueGroups = issues.map(entry => (entry.issues || [entry.issue]).filter(Boolean));
        const graphReadCount = issueGroups.filter(group =>
            group.some(issue => issue.kind === 'graph-read')
        ).length;
        const timingCount = issueGroups.length - graphReadCount;
        const summaryParts = [];
        if (timingCount > 0) {
            summaryParts.push(
                `${timingCount} timing record${timingCount === 1 ? '' : 's'} ${
                    timingCount === 1 ? 'needs' : 'need'
                } review`
            );
        }
        if (graphReadCount > 0) {
            summaryParts.push(
                `${graphReadCount} graph read issue${graphReadCount === 1 ? '' : 's'} ${
                    graphReadCount === 1 ? 'needs' : 'need'
                } review`
            );
        }
        const summary = el(
            'summary',
            'rlb-data-issues__summary',
            summaryParts.join(' · ')
        );
        details.appendChild(summary);
        const list = el('div', 'rlb-data-issues__list');
        for (const entry of issues) {
            const entryIssues = (entry.issues || [entry.issue]).filter(Boolean);
            const issueText = entryIssues
                .map(issue => `${issue.source ? `${issue.source}: ` : ''}${issue.message}`)
                .join(' ');
            const raw = entry.rawClock || '(CLOCK text unavailable)';
            const label = `Task: ${entry.title} · CLOCK: ${raw} · Issue: ${issueText}`;
            const item = el('div', 'rlb-data-issues__item', label);
            item.title = label;
            item.setAttribute('aria-label', label);
            list.appendChild(item);
        }
        details.appendChild(list);
        return details;
    };

    const overviewBar = (model, now) => {
        const wrapper = el('dl', 'rlb-overview rlb-overview--compact');
        wrapper.setAttribute('aria-label', `${DASHBOARD_TITLE} overview`);
        const rangeLabel = getRange(model.rangeId).label;
        const todayContext =
            model.running.length > 0
                ? `${model.running.length} active Session${model.running.length === 1 ? '' : 's'}`
                : 'No active Sessions';
        const metrics = [
            ['Today', formatMinutesHuman(model.todayMinutes), todayContext, 'today'],
            [rangeLabel, formatMinutesHuman(model.totalMinutes), 'selected range', 'selected'],
            ['Sessions', String(model.sessionMetrics?.sessions || 0), 'selected range', 'sessions'],
            ['Tasks tracked', String(model.tasks.length), 'selected range', 'tasks'],
        ];
        for (const [label, value, context, key] of metrics) {
            const item = el('div', 'rlb-overview__item rlb-overview__panel');
            const heading = el('div', 'rlb-overview__heading');
            const valueNode = el('dd', 'rlb-overview__value');
            const number = el('span', 'rlb-overview__number', value);
            number.dataset.liveMetric = key;
            valueNode.append(number, el('span', 'rlb-overview__context', context));
            heading.append(el('dt', 'rlb-overview__label', label), valueNode);
            item.appendChild(heading);
            wrapper.appendChild(item);
        }
        return wrapper;
    };

    const svgNode = (name, attributes = {}, textContent = '') => {
        const node = document.createElementNS(SVG_NS, name);
        for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
        if (textContent) node.textContent = textContent;
        return node;
    };

    const activityChart = (model, now) => {
        const section = el('section', 'rlb-analytics__chart rlb-dashboard-panel');
        const title = el('h3', 'rlb-analytics__section-title', `Activity · ${model.activityLabel}`);
        section.appendChild(title);
        const series = model.activity || [];
        const titleId = 'roam-logbook-activity-title';
        const descriptionId = 'roam-logbook-activity-description';
        const svg = svgNode('svg', {
            class: 'rlb-analytics__svg',
            viewBox: '0 0 760 236',
            role: 'img',
            'aria-labelledby': `${titleId} ${descriptionId}`,
            preserveAspectRatio: 'none',
        });
        svg.appendChild(svgNode('title', { id: titleId }, `Activity over time · ${model.activityLabel}`));
        svg.appendChild(
            svgNode(
                'desc',
                { id: descriptionId },
                series.length > 0
                    ? `${series.length} daily activity bars. All time is shown as ${model.activityLabel}.`
                    : 'No activity data is available for this range.'
            )
        );
        const peak = Math.max(1, ...series.map(day => day.minutes));
        const left = 18;
        const chartWidth = 724;
        const chartHeight = 154;
        const barWidth = series.length > 0 ? Math.min(28, Math.max(8, chartWidth / series.length - 8)) : 12;
        const labelStep = series.length <= 7 ? 1 : series.length <= 14 ? 2 : 5;
        svg.appendChild(
            svgNode('line', {
                class: 'rlb-analytics__axis',
                x1: left,
                y1: chartHeight + 8,
                x2: left + chartWidth,
                y2: chartHeight + 8,
            })
        );
        series.forEach((day, index) => {
            const slot = chartWidth / Math.max(1, series.length);
            const x = left + slot * index + (slot - barWidth) / 2;
            const height = day.minutes === 0 ? 3 : Math.max(8, (day.minutes / peak) * chartHeight);
            const y = chartHeight + 8 - height;
            const rect = svgNode('rect', {
                class: day.minutes === 0 ? 'rlb-analytics__bar rlb-analytics__bar--empty' : 'rlb-analytics__bar',
                x,
                y,
                width: barWidth,
                height,
                rx: 3,
                'data-date': day.key,
                'data-minutes': day.minutes,
            });
            rect.appendChild(svgNode('title', {}, `${day.key} · ${formatMinutesHuman(day.minutes)}`));
            svg.appendChild(rect);
            if (index % labelStep === 0 || index === series.length - 1) {
                svg.appendChild(
                    svgNode(
                        'text',
                        { class: 'rlb-analytics__label', x: x + barWidth / 2, y: 206, 'text-anchor': 'middle' },
                        formatDayLabel(day.date, now)
                    )
                );
            }
        });
        section.appendChild(svg);
        if (series.length === 0 || series.every(day => day.minutes === 0)) {
            section.appendChild(el('p', 'rlb-analytics__empty-note', 'No Sessions in this range yet.'));
        }
        return section;
    };

    const analyticsMetric = (label, value, key, context = '') => {
        const item = el('div', 'rlb-analytics__metric');
        item.appendChild(el('dt', 'rlb-analytics__metric-label', label));
        const valueNode = el('dd', 'rlb-analytics__metric-value', value);
        if (key) valueNode.dataset.liveMetric = key;
        item.append(valueNode, el('span', 'rlb-analytics__metric-context', context));
        return item;
    };

    const analyticsKpis = (model, metrics) => {
        const list = el('dl', 'rlb-analytics__kpis');
        list.append(
            analyticsMetric('Focus time', formatMinutesHuman(metrics.focusMinutes), 'focus', 'selected range'),
            analyticsMetric('Sessions', String(metrics.sessions), 'sessions', 'selected range'),
            analyticsMetric('Average session', formatMinutesHuman(metrics.averageMinutes), 'average', 'per Session'),
            analyticsMetric('Longest session', formatMinutesHuman(metrics.longestMinutes), 'longest', 'single Session')
        );
        list.setAttribute('aria-label', `${DASHBOARD_TITLE} analytics summary`);
        return list;
    };

    const taskDistribution = model => {
        const panel = el('section', 'rlb-analytics__panel rlb-dashboard-panel');
        panel.appendChild(el('h3', 'rlb-analytics__section-title', 'Task time distribution'));
        const rows = model.tasks.filter(task => task.minutes > 0);
        const top = rows.slice(0, 6);
        const otherMinutes = rows.slice(6).reduce((sum, task) => sum + task.minutes, 0);
        if (otherMinutes > 0) top.push({ taskUid: null, title: 'Other', minutes: otherMinutes });
        const total = rows.reduce((sum, task) => sum + task.minutes, 0);
        if (top.length === 0) {
            panel.appendChild(el('p', 'rlb-analytics__empty-note', 'No task time in this range yet.'));
            return panel;
        }
        const list = el('div', 'rlb-analytics__distribution');
        for (const task of top) {
            const percentage = total > 0 ? (task.minutes / total) * 100 : 0;
            const row = el('div', 'rlb-analytics__distribution-row');
            const header = el('div', 'rlb-analytics__distribution-header');
            if (task.taskUid) header.appendChild(taskLink(task.title, task.taskUid));
            else header.appendChild(el('span', 'rlb-analytics__other-label', task.title));
            header.append(
                el('span', 'rlb-analytics__distribution-duration', `${Math.round(percentage)}% · ${formatMinutesHuman(task.minutes)}`)
            );
            const track = el('div', 'rlb-analytics__distribution-track');
            const fill = el('span', 'rlb-analytics__distribution-fill');
            fill.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
            track.appendChild(fill);
            row.append(header, track);
            list.appendChild(row);
        }
        panel.appendChild(list);
        return panel;
    };

    const profileMetric = (label, value) => {
        const row = el('div', 'rlb-analytics__profile-row');
        row.append(el('span', 'rlb-analytics__profile-label', label), el('strong', '', value));
        return row;
    };

    const sessionProfile = metrics => {
        const panel = el('section', 'rlb-analytics__panel rlb-dashboard-panel');
        panel.appendChild(el('h3', 'rlb-analytics__section-title', 'Session profile'));
        const profile = el('div', 'rlb-analytics__profile');
        profile.append(
            profileMetric('Completed', String(metrics.completedSessions)),
            profileMetric('Running', String(metrics.runningSessions)),
            profileMetric('Active days', String(metrics.activeDays)),
            profileMetric('Median session', formatMinutesHuman(metrics.medianMinutes))
        );
        panel.appendChild(profile);
        return panel;
    };

    const analyticsSection = (model, now) => {
        const section = el('section', 'rlb-analytics');
        const metrics = model.sessionMetrics || summariseSessionMetrics(model.entries, now);
        section.appendChild(analyticsKpis(model, metrics));
        section.appendChild(activityChart(model, now));
        const panels = el('div', 'rlb-analytics__panels');
        panels.append(taskDistribution(model), sessionProfile(metrics));
        section.appendChild(panels);
        return section;
    };

    const runningSection = (running, now) => {
        const stale = new Set(findStaleClocks(running, now, staleHours()).map(e => e.clockUid));
        const section = el('section', 'rlb-dashboard-section rlb-running');
        section.classList.add('rlb-dashboard-panel');
        const heading = el('div', 'rlb-panel__header');
        heading.appendChild(el('h3', 'rlb-section__title', 'Running'));
        heading.appendChild(
            el(
                'span',
                'rlb-panel__count',
                `${running.length} Session${running.length === 1 ? '' : 's'}`
            )
        );
        if (stale.size > 0) {
            heading.appendChild(
                el('span', 'bp3-tag bp3-minimal bp3-intent-warning rlb-panel__notice', `${stale.size} stale`)
            );
        }
        section.appendChild(heading);

        const table = el('table', 'rlb-table');
        table.appendChild(
            headerRow(['Task', 'Started', { label: 'Elapsed', numeric: true }, ''])
        );
        const tbody = el('tbody');
        for (const entry of running) {
            const row = el('tr');
            const task = el('td', 'rlb-cell');
            const mark = statusMark(entry.status);
            if (mark) task.appendChild(mark);
            task.appendChild(taskLink(entry.title, entry.taskUid));
            if (stale.has(entry.clockUid)) {
                task.appendChild(el('span', 'bp3-tag bp3-minimal bp3-intent-warning', 'stale'));
            }

            const actions = el('td', 'rlb-table__num');
            const discarding = discardConfirmUid === entry.clockUid;
            const discardTitle = discarding
                ? 'Confirm discard of this CLOCK entry'
                : 'Discard this CLOCK entry (cannot be undone)';
            const discard = button(
                `bp3-button bp3-minimal bp3-small bp3-icon-trash${discarding ? ' bp3-intent-danger' : ''}`,
                '',
                event => {
                    event.stopPropagation();
                    if (!discarding) {
                        discardConfirmUid = entry.clockUid;
                        if (discardConfirmTimer) clearTimeout(discardConfirmTimer);
                        discardConfirmTimer = setTimeout(() => {
                            resetDiscardConfirmation();
                            render();
                        }, 5000);
                        render();
                        return;
                    }
                    resetDiscardConfirmation();
                    void act(() => clock.discardClock(entry.clockUid));
                },
                { title: discardTitle }
            );
            discard.dataset.action = 'discard';
            actions.append(
                button(
                    'bp3-button bp3-minimal bp3-small bp3-icon-log-out rlb-running__checkout',
                    '',
                    event => {
                        event.stopPropagation();
                        void act(() => clock.clockOut(entry.clockUid));
                    },
                    { title: 'Check Out' }
                ),
                discard
            );
            actions.firstElementChild.dataset.action = 'clock-out';

            const started = formatStarted(entry.start, now);
            const startedTime = el('time', 'rlb-started', '');
            startedTime.title = started.raw;
            startedTime.setAttribute('aria-label', started.raw);
            if (started.datetime) startedTime.dateTime = started.datetime;
            if (started.valid) {
                startedTime.append(
                    el('span', 'rlb-started__date', started.dateLabel),
                    el('span', 'rlb-started__time', started.timeLabel)
                );
            } else {
                startedTime.textContent = started.raw;
            }

            const startedCell = el('td', 'rlb-muted rlb-started-cell');
            startedCell.appendChild(startedTime);

            const elapsed = el(
                'td',
                'rlb-table__num rlb-running-elapsed',
                formatElapsed(now.getTime() - entry.start.getTime())
            );
            elapsed.dataset.runningElapsed = 'true';
            elapsed.dataset.clockUid = entry.clockUid;
            elapsed.dataset.startMs = String(entry.start.getTime());
            row.append(task, startedCell, elapsed, actions);
            tbody.appendChild(row);
        }
        table.appendChild(tbody);
        section.appendChild(table);
        return section;
    };

    const tasksSection = tree => {
        const everyRow = flattenForest(tree);
        const parentUids = everyRow.filter(node => node.hasChildren).map(node => node.taskUid);

        const section = el('section', 'rlb-dashboard-section rlb-dashboard-panel rlb-by-task');
        const heading = el('div', 'rlb-section__heading rlb-panel__header');
        heading.appendChild(el('h3', 'rlb-section__title', 'By task'));

        const rollupHelp =
            'Totals include sub-tasks. A task shown under more than one parent may overlap between branches; headline totals count each Session once.';
        const info = button(
            'bp3-button bp3-minimal bp3-small bp3-icon-info-sign rlb-tree__info',
            '',
            () => {},
            { title: rollupHelp }
        );
        info.setAttribute('aria-describedby', 'roam-logbook-task-rollup-help');
        heading.appendChild(info);
        const help = el('span', 'rlb-visually-hidden', rollupHelp);
        help.id = 'roam-logbook-task-rollup-help';
        section.appendChild(help);

        const toggleAll = button('bp3-button bp3-minimal bp3-small', '', () => {
            const anyExpanded = parentUids.some(uid => !collapsed.has(uid));
            if (anyExpanded) for (const uid of parentUids) collapsed.add(uid);
            else collapsed.clear();
            paint();
        });
        if (parentUids.length > 0) heading.appendChild(toggleAll);
        section.appendChild(heading);

        const tableHost = el('div');
        section.appendChild(tableHost);

        function paint() {
            const rows = flattenForest(tree, { isCollapsed: node => collapsed.has(node.taskUid) });
            const anyExpanded = parentUids.some(uid => !collapsed.has(uid));
            toggleAll.textContent = anyExpanded ? 'Collapse all' : 'Expand all';

            const table = el('table', 'rlb-table rlb-task-table');
            const columns = el('colgroup');
            for (const className of [
                'rlb-task-table__task',
                'rlb-task-table__sessions',
                'rlb-task-table__own',
                'rlb-task-table__total',
            ]) {
                columns.appendChild(el('col', className));
            }
            table.appendChild(columns);
            table.appendChild(
                headerRow([
                    'Task',
                    { label: 'Sessions', numeric: true },
                    { label: 'Own', numeric: true },
                    { label: 'Total', numeric: true },
                ])
            );
            const tbody = el('tbody');

            for (const node of rows) {
                const row = el('tr');
                const name = el('td', 'rlb-tree__cell');
                const layout = el('div', 'rlb-tree__layout');
                const leading = el('div', 'rlb-tree__leading');
                const content = el('div', 'rlb-tree__content');
                name.style.paddingLeft = `${8 + node.depth * 20}px`;

                if (node.hasChildren) {
                    const caret = button(
                        `bp3-button bp3-minimal bp3-small rlb-tree__toggle bp3-icon-chevron-${
                            node.collapsed ? 'right' : 'down'
                        }`,
                        '',
                        () => {
                            if (collapsed.has(node.taskUid)) collapsed.delete(node.taskUid);
                            else collapsed.add(node.taskUid);
                            paint();
                        },
                        { title: node.collapsed ? 'Expand sub-tasks' : 'Collapse sub-tasks' }
                    );
                    caret.setAttribute('aria-expanded', String(!node.collapsed));
                    leading.appendChild(caret);
                } else {
                    // Keeps every title on the same left edge, caret or not.
                    leading.appendChild(el('span', 'rlb-tree__toggle rlb-tree__toggle--empty'));
                }

                const mark = statusMark(node.status);
                if (mark) leading.appendChild(mark);
                if (node.status === 'DONE') row.classList.add('rlb-row--done');
                content.appendChild(taskLink(node.title, node.taskUid));
                // A task reachable from more than one parent is counted under each
                // of them; say so on the row rather than let the columns look wrong.
                if (node.occurrences > 1) {
                    const badge = el('span', 'bp3-tag bp3-minimal rlb-tree__badge', `×${node.occurrences}`);
                    badge.title = `Also rolls up under ${node.occurrences - 1} other task(s)`;
                    content.appendChild(badge);
                }
                if (node.truncated) {
                    content.appendChild(el('span', 'bp3-tag bp3-minimal bp3-intent-warning', 'loop'));
                }
                layout.append(leading, content);
                if (node.collapsed) {
                    const hidden = countDescendants(node);
                    layout.appendChild(
                        el('span', 'rlb-muted rlb-tree__hidden', `+${hidden} sub-task${hidden > 1 ? 's' : ''}`)
                    );
                }
                name.appendChild(layout);

                row.append(
                    name,
                    el('td', 'rlb-table__num rlb-muted', node.sessions ? String(node.sessions) : ''),
                    el('td', 'rlb-table__num rlb-muted', node.own > 0 ? formatMinutesHuman(node.own) : ''),
                    el('td', 'rlb-table__num rlb-tree__total', formatMinutesHuman(node.total))
                );
                tbody.appendChild(row);
            }

            table.appendChild(tbody);
            tableHost.replaceChildren(table);
        }

        paint();

        return section;
    };

    const countDescendants = node =>
        node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);

    // Numeric headers have to be right-aligned like their cells, or the column
    // label and the figures under it sit against opposite edges.
    const headerRow = columns => {
        const thead = el('thead');
        const row = el('tr');
        for (const column of columns) {
            const numeric = typeof column === 'object' && column.numeric;
            row.appendChild(el('th', numeric ? 'rlb-table__num' : '', column.label ?? column));
        }
        thead.appendChild(row);
        return thead;
    };

    /** A checkbox drawn in CSS, so it does not depend on Blueprint's icon font. */
    const statusMark = status => {
        if (!status) return null;
        const done = status === 'DONE';
        const mark = el('span', `rlb-status rlb-status--${done ? 'done' : 'todo'}`);
        mark.title = done ? 'DONE' : 'TODO';
        mark.setAttribute('role', 'img');
        mark.setAttribute('aria-label', done ? 'Done' : 'To do');
        return mark;
    };

    const taskLink = (title, taskUid) => {
        const accessibleName = `Open this block: ${title}`;
        const link = button(
            'bp3-button bp3-minimal bp3-small bp3-icon-document-open rlb-task-link',
            '',
            event => {
                event.stopPropagation();
                if (event.shiftKey) {
                    event.preventDefault();
                    void openBlockInRightSidebar(taskUid);
                    return;
                }
                close();
                void openBlock(taskUid);
            },
            { title: accessibleName }
        );
        link.appendChild(el('span', 'rlb-task-link__text', title));
        return link;
    };

    const act = async action => {
        try {
            await action();
        } catch (error) {
            console.error('[roam-logbook]', error);
        }
        render();
    };

    const dialogFocusables = dialog =>
        [...dialog.querySelectorAll('button, select, input, textarea, a[href], [tabindex]:not([tabindex="-1"])')].filter(
            node => !node.disabled && node.getAttribute('aria-hidden') !== 'true'
        );

    const onKeyDown = event => {
        if (!root?.classList.contains('rlb-root--open')) return;
        const dialog = root.querySelector('.rlb-dialog');
        if (!dialog) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
            return;
        }
        if (event.key !== 'Tab') return;

        const focusables = dialogFocusables(dialog);
        event.preventDefault();
        event.stopPropagation();
        if (focusables.length === 0) {
            dialog.focus();
            return;
        }

        const first = focusables[0];
        const last = focusables.at(-1);
        const active = document.activeElement;
        const index = focusables.indexOf(active);
        if (event.shiftKey) {
            if (index <= 0) last.focus();
            else focusables[index - 1].focus();
        } else if (index < 0 || index === focusables.length - 1) {
            first.focus();
        } else {
            focusables[index + 1].focus();
        }
    };

    const syncViewToggle = () => {
        if (!viewToggle) return;
        const analytics = view === 'analytics';
        viewToggle.className =
            `bp3-button bp3-minimal bp3-small rlb-icon-button rlb-dashboard__view-toggle ` +
            `bp3-icon-${analytics ? 'arrow-left' : 'chart'}`;
        const label = analytics ? 'Back to Overview' : 'Open Analytics';
        viewToggle.title = label;
        viewToggle.setAttribute('aria-label', label);
        viewToggle.setAttribute('aria-pressed', String(analytics));
        viewToggle.setAttribute('aria-controls', VIEW_HOST_ID);
    };

    const toggleView = event => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        view = view === 'overview' ? 'analytics' : 'overview';
        syncViewToggle();
        if (bodyNode) {
            bodyNode.dataset.dashboardView = view;
            bodyNode.scrollTop = 0;
        }
        paint(nowFn());
        focusWithoutScroll(viewToggle);
    };

    const build = () => {
        const overlay = el('div', 'rlb-root rlb-dashboard');
        overlay.id = ROOT_ID;
        overlay.setAttribute('aria-hidden', 'true');
        overlay.addEventListener('mousedown', event => {
            if (event.target === overlay) close();
        });

        const dialog = el('div', 'bp3-dialog rlb-dialog');
        dialog.tabIndex = -1;
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'roam-logbook-dashboard-title');

        const header = el('header', 'bp3-dialog-header rlb-header');
        const heading = el('div', 'rlb-header__heading');
        const title = el('h2', 'bp3-heading rlb-header__title', DASHBOARD_TITLE);
        title.id = 'roam-logbook-dashboard-title';
        const subtitle = el(
            'p',
            'rlb-header__subtitle rlb-visually-hidden',
            'Focus sessions, activity, and task rollups'
        );
        subtitle.id = 'roam-logbook-dashboard-description';
        heading.append(title, subtitle);
        dialog.setAttribute('aria-describedby', subtitle.id);
        header.appendChild(heading);

        viewToggle = button(
            'bp3-button bp3-minimal bp3-small rlb-icon-button rlb-dashboard__view-toggle bp3-icon-chart',
            '',
            toggleView,
            { title: 'Open Analytics' }
        );
        viewToggle.dataset.action = 'toggle-view';
        viewToggle.setAttribute('aria-controls', VIEW_HOST_ID);
        viewToggle.setAttribute('aria-pressed', 'false');

        const selectWrapper = el('div', 'bp3-select bp3-small');
        const select = el('select');
        select.setAttribute('aria-label', 'Dashboard date range');
        for (const range of RANGES) {
            const option = el('option', '', range.label);
            option.value = range.id;
            if (range.id === rangeId) option.selected = true;
            select.appendChild(option);
        }
        select.addEventListener('change', event => {
            rangeId = event.target.value;
            render();
        });
        selectWrapper.appendChild(select);

        header.append(
            viewToggle,
            selectWrapper,
            button('bp3-button bp3-minimal bp3-small bp3-icon-refresh rlb-icon-button', '', () => {
                render();
            }, { title: 'Reload from the graph' }),
            button(
                'bp3-dialog-close-button bp3-button bp3-minimal bp3-icon-cross rlb-icon-button',
                '',
                close,
                { title: 'Close' }
            )
        );

        summaryNode = el('div', 'rlb-summary');
        bodyNode = el('div', 'rlb-body rlb-body__scroll');
        bodyNode.id = VIEW_HOST_ID;
        bodyNode.dataset.dashboardView = view;
        dialog.append(header, summaryNode, bodyNode);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        themeRuntime = acquireThemeRuntime({
            documentRef: document,
            onChange: palette => applyRoamThemePalette(overlay, palette),
        });
        themeRuntime.apply(overlay);
        syncViewToggle();
        return overlay;
    };

    function close({ restoreFocus = true } = {}) {
        view = 'overview';
        syncViewToggle();
        if (!root) {
            releaseScrollLock?.();
            releaseScrollLock = null;
            return;
        }
        clearLiveTicker();
        resetDiscardConfirmation();
        root.classList.remove('rlb-root--open');
        root.setAttribute('aria-hidden', 'true');
        document.removeEventListener('keydown', onKeyDown, true);
        try {
            if (restoreFocus && returnFocusTo?.isConnected) returnFocusTo.focus();
        } finally {
            releaseScrollLock?.();
            releaseScrollLock = null;
        }
        returnFocusTo = null;
    }

    return {
        open({ returnFocusTo: requestedFocus } = {}) {
            const alreadyOpen = root?.classList.contains('rlb-root--open');
            const active = document.activeElement;
            returnFocusTo = requestedFocus?.isConnected
                ? requestedFocus
                : active && active !== document.body && active.isConnected
                  ? active
                  : null;
            try {
                if (!root) root = build();
                if (!alreadyOpen) {
                    view = 'overview';
                    syncViewToggle();
                }
                if (!alreadyOpen) releaseScrollLock = acquireDocumentScrollLock();
                root.classList.add('rlb-root--open');
                root.setAttribute('aria-hidden', 'false');
                document.addEventListener('keydown', onKeyDown, true);
                render();
                const dialog = root.querySelector('.rlb-dialog');
                const initial = dialogFocusables(dialog)[0];
                (initial || dialog)?.focus();
            } catch (error) {
                root?.classList.remove('rlb-root--open');
                root?.setAttribute('aria-hidden', 'true');
                document.removeEventListener('keydown', onKeyDown, true);
                releaseScrollLock?.();
                releaseScrollLock = null;
                returnFocusTo = null;
                throw error;
            }
        },
        close,
        destroy() {
            close({ restoreFocus: false });
            root?.remove();
            themeRuntime?.release();
            themeRuntime = null;
            root = null;
            summaryNode = null;
            bodyNode = null;
            viewToggle = null;
            lastModel = null;
        },
    };
}
