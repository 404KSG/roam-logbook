/**
 * The dashboard dialog: a compact overview, running sessions, and a per-task
 * breakdown.
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
    transformTaskForest,
} from './stats.js';
import { staleHours } from './settings.js';
import { formatDisplayTitle } from './task-display.js';
import { acquireThemeRuntime, applyRoamThemePalette } from './theme.js';
import { formatElapsed, formatMinutesHuman, formatStarted } from './time.js';

const ROOT_ID = 'roam-logbook-dashboard';
const DASHBOARD_TITLE = 'Roam Logbook';
const REFRESH_LOADING_MESSAGE = 'Refreshing Dashboard from graph…';
const REFRESH_SUCCESS_MESSAGE = 'Dashboard updated just now';
const REFRESH_ERROR_MESSAGE = 'Dashboard refresh failed; last valid snapshot kept. Retry.';

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
    let refreshInFlight = null;
    let refreshButton = null;
    let refreshStatusNode = null;
    let refreshState = { state: 'idle', message: '' };
    let lastSnapshot = null;
    let lastModel = null;
    let lastTransientIssues = [];
    let lastRefreshNotice = '';
    let focusInFlight = null;
    let themeRuntime = null;
    let releaseScrollLock = null;
    // Kept across re-renders and reopens, keyed by task: changing the range or
    // clocking out should not throw away how the user arranged the tree.
    const collapsed = new Set();
    // Filtered task views are deliberately independent from the persisted All
    // view. A first visit to TODO/DONE starts expanded, while returning to All
    // restores exactly the user's original tree arrangement.
    const taskView = {
        filter: 'ALL',
        sortBy: 'total',
        direction: 'desc',
    };
    const collapsedByFilter = {
        ALL: collapsed,
        TODO: new Set(),
        DONE: new Set(),
    };

    const clearLiveTicker = () => {
        if (liveTicker !== null) clearIntervalFn(liveTicker);
        liveTicker = null;
    };

    const syncRefreshUi = () => {
        if (refreshButton) {
            refreshButton.dataset.refreshState = refreshState.state;
            refreshButton.disabled = refreshState.state === 'loading';
            if (refreshState.state === 'loading') refreshButton.setAttribute('aria-busy', 'true');
            else refreshButton.removeAttribute('aria-busy');
        }
        if (refreshStatusNode) {
            refreshStatusNode.textContent = refreshState.message;
            refreshStatusNode.setAttribute(
                'role',
                refreshState.state === 'error' ? 'alert' : 'status'
            );
            refreshStatusNode.setAttribute(
                'aria-live',
                refreshState.state === 'error' ? 'assertive' : 'polite'
            );
            refreshStatusNode.setAttribute('aria-atomic', 'true');
        }
    };

    const setRefreshState = (state, message) => {
        refreshState = { state, message };
        syncRefreshUi();
    };

    const resetDiscardConfirmation = () => {
        discardConfirmUid = null;
        if (discardConfirmTimer) clearTimeout(discardConfirmTimer);
        discardConfirmTimer = null;
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
        const hierarchy = lastSnapshot?.hierarchy || {};
        const transientIssues = lastTransientIssues;
        const refreshNotice = lastRefreshNotice;
        summaryNode.replaceChildren();
        summaryNode.appendChild(overviewBar(model, now));
        bodyNode.replaceChildren();

        if (refreshNotice) {
            const notice = el('div', 'rlb-dashboard__notice', refreshNotice);
            notice.setAttribute('role', 'status');
            notice.setAttribute('aria-live', 'polite');
            notice.setAttribute('aria-atomic', 'true');
            bodyNode.appendChild(notice);
        }

        const issues = [
            ...model.issues,
            ...(hierarchy.issues || []).map(issueRow),
            ...transientIssues.map(issueRow),
        ];

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

    const render = ({ readGraph = true } = {}) => {
        if (!bodyNode) return { ok: false, reason: 'not-mounted' };
        clearLiveTicker();
        const now = nowFn();
        let snapshot = readGraph ? null : lastSnapshot;
        let refreshNotice = '';
        let transientIssues = [];
        let refreshFailed = false;
        if (readGraph) {
            try {
                const candidate = readDashboardSnapshot();
                lastSnapshot = candidate;
                snapshot = candidate;
            } catch (error) {
                refreshFailed = true;
                transientIssues = error.issue ? [error.issue] : error.issues || [];
                if (!lastSnapshot) {
                    summaryNode.hidden = false;
                    summaryNode.setAttribute('aria-hidden', 'false');
                    summaryNode.replaceChildren();
                    const notice = el(
                        'div',
                        'rlb-dashboard__notice',
                        'Graph data could not be refreshed; no successful snapshot is available yet.'
                    );
                    notice.setAttribute('role', 'alert');
                    notice.setAttribute('aria-live', 'assertive');
                    notice.setAttribute('aria-atomic', 'true');
                    const issueRows = transientIssues.map(issueRow);
                    bodyNode.replaceChildren(
                        notice,
                        ...(issueRows.length > 0 ? [dataIssuesSection(issueRows)] : [])
                    );
                    lastModel = null;
                    lastTransientIssues = transientIssues;
                    lastRefreshNotice = '';
                    return { ok: false, reason: 'no-snapshot' };
                }
                snapshot = lastSnapshot;
                refreshNotice =
                    'Graph data could not be refreshed; showing last successful snapshot.';
            }
        }
        if (!snapshot) return { ok: false, reason: 'no-snapshot' };
        summaryNode.hidden = false;
        summaryNode.setAttribute('aria-hidden', 'false');
        const entries = snapshot.entries;
        const hierarchy = snapshot.hierarchy || {};
        // Publish the exact snapshot to the clock seam. This updates running
        // state without issuing the entries query a second time.
        clock.refresh({ entries, notify: false });
        lastModel = buildDashboard(entries, { now, rangeId, hierarchy });
        lastTransientIssues = transientIssues;
        lastRefreshNotice = refreshNotice;
        paint(now);
        return { ok: true, refreshFailed };
    };

    const refreshDashboard = () => {
        if (refreshInFlight) return refreshInFlight;
        setRefreshState('loading', REFRESH_LOADING_MESSAGE);
        const request = Promise.resolve()
            .then(() => render())
            .then(
                result => {
                    if (result?.ok && !result.refreshFailed) {
                        setRefreshState('success', REFRESH_SUCCESS_MESSAGE);
                    } else {
                        setRefreshState('error', REFRESH_ERROR_MESSAGE);
                    }
                    return result;
                },
                error => {
                    console.error('[roam-logbook] could not refresh Dashboard', error);
                    setRefreshState('error', REFRESH_ERROR_MESSAGE);
                    return { ok: false, error };
                }
            );
        refreshInFlight = request.finally(() => {
            refreshInFlight = null;
        });
        return refreshInFlight;
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
            [rangeLabel, formatMinutesHuman(model.totalMinutes), null, 'selected'],
            ['Sessions', String(model.sessionMetrics?.sessions || 0), rangeLabel, 'sessions'],
            ['Tasks tracked', String(model.tasks.length), rangeLabel, 'tasks'],
        ];
        for (const [label, value, context, key] of metrics) {
            const item = el('div', 'rlb-overview__item rlb-overview__panel');
            const heading = el('div', 'rlb-overview__heading');
            const valueNode = el('dd', 'rlb-overview__value');
            const number = el('span', 'rlb-overview__number', value);
            number.dataset.liveMetric = key;
            valueNode.append(number);
            if (context) valueNode.append(el('span', 'rlb-overview__context', context));
            heading.append(el('dt', 'rlb-overview__label', label), valueNode);
            item.appendChild(heading);
            wrapper.appendChild(item);
        }
        return wrapper;
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
            headerRow([
                'Task',
                'Started',
                { label: 'Elapsed', numeric: true },
                { label: 'Actions', visuallyHidden: true },
            ])
        );
        const tbody = el('tbody');
        for (const entry of running) {
            const row = el('tr');
            const task = el('td', 'rlb-cell');
            const mark = statusMark(entry.status);
            if (mark) task.appendChild(mark);
            task.appendChild(taskLink(entry));
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
        const section = el('section', 'rlb-dashboard-section rlb-dashboard-panel rlb-by-task');
        const heading = el('div', 'rlb-section__heading rlb-panel__header');
        heading.appendChild(el('h3', 'rlb-section__title', 'By task'));

        const taskCount = el('span', 'rlb-task-count');
        heading.appendChild(taskCount);

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

        const filterGroup = el('div', 'rlb-task-filters');
        filterGroup.setAttribute('role', 'group');
        filterGroup.setAttribute('aria-label', 'Filter tasks by status');
        for (const [value, label] of [
            ['ALL', 'All'],
            ['TODO', 'TODO'],
            ['DONE', 'DONE'],
        ]) {
            const filterButton = button(
                'bp3-button bp3-minimal bp3-small rlb-task-filter',
                label,
                () => {
                    taskView.filter = value;
                    paint();
                },
                { title: `Show ${label === 'All' ? 'all tasks' : `${label} tasks`}` }
            );
            filterButton.dataset.filter = value;
            filterButton.setAttribute('aria-pressed', String(taskView.filter === value));
            filterGroup.appendChild(filterButton);
        }
        heading.appendChild(filterGroup);

        let visibleParentUids = [];
        const toggleAll = button('bp3-button bp3-minimal bp3-small rlb-tree__collapse-all', '', () => {
            const viewCollapsed = collapsedByFilter[taskView.filter];
            const anyExpanded = visibleParentUids.some(uid => !viewCollapsed.has(uid));
            if (anyExpanded) {
                for (const uid of visibleParentUids) viewCollapsed.add(uid);
            } else {
                for (const uid of visibleParentUids) viewCollapsed.delete(uid);
            }
            paint();
        });
        heading.appendChild(toggleAll);
        section.appendChild(heading);

        const tableHost = el('div', 'rlb-task-table-host');
        section.appendChild(tableHost);

        function paint() {
            const transformed = transformTaskForest(tree, {
                filter: taskView.filter,
                sortBy: taskView.sortBy,
                direction: taskView.direction,
            });
            const viewCollapsed = collapsedByFilter[taskView.filter];
            const completeViewRows = flattenForest(transformed.forest);
            visibleParentUids = [
                ...new Set(
                    completeViewRows
                        .filter(node => node.hasChildren)
                        .map(node => node.taskUid)
                ),
            ];
            const rows = flattenForest(transformed.forest, {
                isCollapsed: node => viewCollapsed.has(node.taskUid),
            });
            const anyExpanded = visibleParentUids.some(uid => !viewCollapsed.has(uid));
            taskCount.textContent = `${transformed.matchCount} of ${transformed.totalCount} Tasks`;
            for (const filterButton of filterGroup.querySelectorAll('[data-filter]')) {
                filterButton.setAttribute(
                    'aria-pressed',
                    String(filterButton.dataset.filter === taskView.filter)
                );
            }
            toggleAll.textContent = anyExpanded ? 'Collapse all' : 'Expand all';
            toggleAll.hidden = visibleParentUids.length === 0;

            if (transformed.forest.length === 0) {
                const emptyMessage =
                    taskView.filter === 'TODO'
                        ? 'No TODO Tasks in the selected range.'
                        : taskView.filter === 'DONE'
                          ? 'No DONE Tasks in the selected range.'
                          : 'No tasks in the selected range.';
                tableHost.replaceChildren(el('div', 'rlb-task-empty', emptyMessage));
                return;
            }

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
                    {
                        label: 'Sessions',
                        numeric: true,
                        sortKey: 'sessions',
                        title: 'Sort by Sessions',
                    },
                    {
                        label: 'Own',
                        numeric: true,
                        sortKey: 'own',
                        title: 'Time recorded directly on this Task',
                    },
                    {
                        label: 'Total',
                        numeric: true,
                        sortKey: 'total',
                        title: 'Own time plus all sub-tasks',
                    },
                ], {
                    sortBy: taskView.sortBy,
                    direction: taskView.direction,
                    onSort: sortBy => {
                        if (taskView.sortBy === sortBy) {
                            taskView.direction = taskView.direction === 'desc' ? 'asc' : 'desc';
                        } else {
                            taskView.sortBy = sortBy;
                            taskView.direction = 'desc';
                        }
                        paint();
                    },
                })
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
                            if (viewCollapsed.has(node.taskUid)) viewCollapsed.delete(node.taskUid);
                            else viewCollapsed.add(node.taskUid);
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
                if (node.context) row.classList.add('rlb-row--context');
                content.appendChild(taskLink(node));
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
                // Keep the third layout item compatible with the existing
                // collapsed-summary rail; actions live inside that rail so a
                // play/status cue never steals width from the wrapped title.
                const actions = el('div', 'rlb-muted rlb-tree__actions');
                if (node.collapsed) {
                    const hidden = countDescendants(node);
                    actions.appendChild(
                        el(
                            'span',
                            'rlb-muted rlb-tree__hidden',
                            `+${hidden} sub-task${hidden > 1 ? 's' : ''}`
                        )
                    );
                }
                const timingAction = taskTimingAction(node);
                if (timingAction) actions.appendChild(timingAction);
                layout.append(leading, content, actions);
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
    const headerRow = (columns, { sortBy = null, direction = 'desc', onSort = null } = {}) => {
        const thead = el('thead');
        const row = el('tr');
        for (const column of columns) {
            const config = typeof column === 'object' ? column : { label: column };
            const numeric = config.numeric;
            const visuallyHidden = config.visuallyHidden;
            const classes = [numeric ? 'rlb-table__num' : '', visuallyHidden ? 'rlb-visually-hidden' : '']
                .filter(Boolean)
                .join(' ');
            const header = el('th', classes);
            header.setAttribute('scope', 'col');
            if (config.sortKey) header.dataset.sortKey = config.sortKey;
            if (config.sortKey && onSort) {
                const active = config.sortKey === sortBy;
                if (active) {
                    header.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');
                }
                const sortButton = button(
                    'bp3-button bp3-minimal bp3-small rlb-task-sort-button',
                    '',
                    () => onSort(config.sortKey),
                    { title: config.title || `Sort by ${config.label}` }
                );
                sortButton.setAttribute('aria-pressed', String(active));
                sortButton.appendChild(el('span', 'rlb-task-sort-label', config.label));
                if (active) {
                    const arrow = el(
                        'span',
                        'rlb-task-sort-arrow',
                        direction === 'asc' ? '↑' : '↓'
                    );
                    arrow.setAttribute('aria-hidden', 'true');
                    sortButton.appendChild(arrow);
                }
                header.appendChild(sortButton);
            } else {
                header.textContent = config.label;
            }
            row.appendChild(header);
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

    const taskLink = row => {
        const title = formatDisplayTitle(row);
        const accessibleName = `Open this block: ${title}`;
        const link = button(
            'bp3-button bp3-minimal bp3-small rlb-task-link',
            '',
            event => {
                event.stopPropagation();
                if (event.shiftKey) {
                    event.preventDefault();
                    void openBlockInRightSidebar(row.taskUid);
                    return;
                }
                close();
                void openBlock(row.taskUid);
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

    const startTaskTiming = taskUid => {
        if (!taskUid || focusInFlight) return focusInFlight;
        const request = act(() =>
            clock.clockIn(taskUid, { source: 'active-work-switch' })
        );
        focusInFlight = request.finally(() => {
            focusInFlight = null;
        });
        return focusInFlight;
    };

    const taskTimingAction = node => {
        if (node.running) {
            const timing = el(
                'span',
                'bp3-icon bp3-icon-time rlb-task-action rlb-task-action--timing'
            );
            timing.title = 'Currently timing';
            timing.setAttribute('role', 'img');
            timing.setAttribute('aria-label', 'Currently timing');
            timing.dataset.taskAction = 'timing';
            return timing;
        }
        if (node.status !== 'TODO' || !node.taskUid) return null;
        const title = formatDisplayTitle(node);
        const play = button(
            'bp3-button bp3-minimal bp3-small bp3-icon-play rlb-task-action rlb-task-action--play',
            '',
            event => {
                event.stopPropagation();
                play.disabled = true;
                void startTaskTiming(node.taskUid);
            },
            { title: `Start timing: ${title}` }
        );
        play.dataset.action = 'start-timing';
        play.dataset.taskUid = node.taskUid;
        return play;
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
            'Focus sessions, timing, and task rollups'
        );
        subtitle.id = 'roam-logbook-dashboard-description';
        heading.append(title, subtitle);
        dialog.setAttribute('aria-describedby', subtitle.id);
        header.appendChild(heading);

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
            render({ readGraph: false });
        });
        selectWrapper.appendChild(select);

        refreshButton = button(
            'bp3-button bp3-minimal bp3-small bp3-icon-refresh rlb-icon-button',
            '',
            () => void refreshDashboard(),
            { title: 'Reload from the graph' }
        );
        refreshButton.dataset.action = 'refresh';
        refreshStatusNode = el('span', 'rlb-dashboard__refresh-status rlb-visually-hidden');

        header.append(
            selectWrapper,
            refreshButton,
            button(
                'bp3-dialog-close-button bp3-button bp3-minimal bp3-icon-cross rlb-icon-button',
                '',
                close,
                { title: 'Close' }
            ),
            refreshStatusNode
        );

        summaryNode = el('div', 'rlb-summary');
        bodyNode = el('div', 'rlb-body rlb-body__scroll');
        dialog.append(header, summaryNode, bodyNode);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        themeRuntime = acquireThemeRuntime({
            documentRef: document,
            onChange: palette => applyRoamThemePalette(overlay, palette),
        });
        themeRuntime.apply(overlay);
        syncRefreshUi();
        return overlay;
    };

    function close({ restoreFocus = true } = {}) {
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
            if (!alreadyOpen) {
                const active = document.activeElement;
                returnFocusTo = requestedFocus?.isConnected
                    ? requestedFocus
                    : active && active !== document.body && active.isConnected
                      ? active
                      : null;
            }
            try {
                if (!root) root = build();
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
            lastModel = null;
            refreshInFlight = null;
            refreshButton = null;
            refreshStatusNode = null;
        },
    };
}
