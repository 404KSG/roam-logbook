/**
 * Shared view model and renderer for the current-session surfaces.
 *
 * Popover and right-sidebar are two shells around this one surface. The module
 * owns only DOM structure and accessible labels; graph mutations remain injected
 * callbacks so neither surface can grow a second copy of session behavior.
 */

import { button, el } from './dom.js';
import { ACTIVE_WORK_WINDOW_MINUTES, openLineMinutesLeft } from './active-work.js';
import * as pomodoro from './pomodoro.js';
import { findStaleClocks } from './stats.js';
import { formatDisplayTitle } from './task-display.js';
import { formatElapsed, formatMinutesHuman, formatStarted } from './time.js';
import { flattenTodayRows } from './today-todos.js';

export const sessionCount = count => `${count} Session${count === 1 ? '' : 's'}`;
const SURFACE_TITLE = 'ACTIVE THREADS';

const rowFigures = (entry, now) => {
    const elapsed = now.getTime() - entry.start.getTime();
    const total = (entry.priorMinutes || 0) + Math.floor(elapsed / 60_000);
    return {
        elapsed: formatElapsed(elapsed),
        total: formatMinutesHuman(total),
    };
};

const fullTaskLabel = title => `Open this block: ${title}`;
const focusRecentLabel = title => `Switch Focus to ${title}`;
const dashboardLabel = 'Open Roam Logbook Dashboard';
const expandTodayLabel = 'Expand all Today tasks';
const collapseTodayLabel = 'Collapse all Today tasks';
const switchLabel = view => `Show ${view === 'today' ? 'Today tasks' : 'Active Threads'}`;

/** Backward-compatible seam; Active Work and Dashboard now share one formatter. */
export const activeWorkDisplayTitle = formatDisplayTitle;

const appendMetaNodes = (meta, nodes) => {
    nodes.forEach((node, index) => {
        if (index > 0) {
            const separator = el('span', 'rlb-run__meta-separator', '·');
            separator.setAttribute('aria-hidden', 'true');
            meta.appendChild(separator);
        }
        meta.appendChild(node);
    });
};

const renderRunningFigures = (entry, now) => {
    const figures = rowFigures(entry, now);
    const primary = el('div', 'rlb-run__meta-line rlb-run__meta-primary');
    primary.append(
        el('span', 'rlb-run__elapsed', figures.elapsed),
        el('span', 'rlb-run__meta-separator', ' · '),
        el('span', 'rlb-run__total', `${figures.total} total`)
    );
    primary.querySelector('.rlb-run__meta-separator').setAttribute('aria-hidden', 'true');
    return primary;
};

const renderTitle = (row, onOpenTask) => {
    const title = formatDisplayTitle(row);
    const recent = row.kind === 'recent';
    const taskButton = button(
        `bp3-button bp3-minimal rlb-run__title${recent ? ' rlb-run__title--recent' : ''}`,
        title,
        event => onOpenTask?.(row.taskUid, event),
        // The visible text is the task title alone; the accessible name has to
        // add the action, so this is an override rather than a duplicate.
        { title: fullTaskLabel(title), ariaLabel: fullTaskLabel(title) }
    );
    return taskButton;
};

const renderTodayRow = (row, options) => {
    const node = row.node;
    const title = formatDisplayTitle({ taskString: node.string, taskUid: node.uid });
    const rowNode = el('div', 'rlb-today__row');
    rowNode.dataset.taskUid = node.uid;
    rowNode.style.setProperty('--rlb-today-depth', String(row.depth));
    rowNode.setAttribute('role', 'treeitem');
    rowNode.setAttribute('aria-level', String(row.depth + 1));
    if (node.children.length > 0) {
        rowNode.setAttribute('aria-expanded', String(row.expanded));
    }

    const rail = el('div', 'rlb-today__rail');
    if (node.children.length > 0) {
        const toggle = button(
            `bp3-button bp3-minimal bp3-small bp3-icon-chevron-${row.expanded ? 'down' : 'right'} rlb-today__toggle`,
            '',
            event => {
                event.stopPropagation();
                options.onToggleToday?.(node.uid);
            },
            { title: row.expanded ? 'Collapse sub-tasks' : 'Expand sub-tasks' }
        );
        toggle.setAttribute('aria-label', row.expanded ? `Collapse ${title}` : `Expand ${title}`);
        toggle.dataset.action = 'today-toggle';
        rail.appendChild(toggle);
    } else {
        rail.appendChild(el('span', 'rlb-today__spacer'));
    }

    const titleButton = button(
        'bp3-button bp3-minimal rlb-today__title',
        title,
        event => options.onOpenTask?.(node.uid, event, { today: true }),
        { title: fullTaskLabel(title), ariaLabel: fullTaskLabel(title) }
    );
    titleButton.dataset.action = 'today-open';
    rail.appendChild(titleButton);
    rowNode.appendChild(rail);

    const action = el('div', 'rlb-today__action');
    if (node.uid === options.currentTaskUid) {
        const timing = el('span', 'bp3-icon bp3-icon-time rlb-today__timing');
        timing.setAttribute('role', 'img');
        timing.setAttribute('aria-label', 'Currently timing');
        timing.title = 'Currently timing';
        action.appendChild(timing);
    } else {
        const play = button(
            'bp3-button bp3-minimal bp3-small bp3-icon-play rlb-today__play',
            '',
            event => {
                event.stopPropagation();
                options.onStartToday?.(node.uid, event);
            },
            { title: `Start timing ${title}` }
        );
        play.setAttribute('aria-label', `Start timing ${title}`);
        play.dataset.action = 'today-play';
        action.appendChild(play);
    }
    rowNode.appendChild(action);
    return rowNode;
};

const renderRunningRow = (row, now, options) => {
    const entry = row.entry;
    const overrun = pomodoro.isCycleOverrun(now);
    const node = el(
        'div',
        `rlb-run rlb-run--inline-meta${overrun ? ' rlb-run--overrun' : ''}`
    );
    node.dataset.sessionState = 'running';
    node.dataset.clockUid = entry.clockUid;
    node.dataset.taskUid = entry.taskUid;

    const body = el('div', 'rlb-run__body');
    const meta = el('div', 'rlb-run__meta');
    meta.dataset.clockUid = entry.clockUid;
    const primary = renderRunningFigures(entry, now);

    const started = formatStarted(entry.start, now);
    const startedDetails =
        `Started ${started.raw}` + (entry.pageTitle ? ` · Page: ${entry.pageTitle}` : '');
    const startedNode = el(
        'time',
        'rlb-run__meta-line rlb-run__started',
        started.valid ? `${started.dateLabel} ${started.timeLabel}` : started.raw
    );
    startedNode.title = startedDetails;
    startedNode.setAttribute('aria-label', startedDetails);
    if (started.datetime) startedNode.dateTime = started.datetime;
    appendMetaNodes(meta, [primary, startedNode]);
    body.append(renderTitle(row, options.onOpenTask), meta);

    const actions = el('div', 'rlb-run__actions');
    const checkout = button(
        'bp3-button bp3-small bp3-minimal bp3-icon-log-out rlb-run__checkout',
        '',
        event => {
            event.stopPropagation();
            void options.onCheckOut?.(entry, event);
        },
        { title: 'Check Out' }
    );
    checkout.dataset.action = 'clock-out';

    const discarding = options.discardingClockUid === entry.clockUid;
    const discardTitle = discarding
        ? 'Confirm discard of this CLOCK entry'
        : 'Discard this CLOCK entry (cannot be undone)';
    const discard = button(
        `bp3-button bp3-minimal bp3-small bp3-icon-trash${discarding ? ' bp3-intent-danger' : ''}`,
        '',
        event => {
            event.stopPropagation();
            void options.onDiscard?.(entry, event);
        },
        { title: discardTitle }
    );
    discard.dataset.action = 'discard';
    actions.append(checkout, discard);
    node.append(body, actions);
    return node;
};

const renderRecentRow = (row, now, options) => {
    const entry = row.entry;
    const node = el('div', 'rlb-run rlb-run--recent rlb-run--inline-meta');
    node.dataset.sessionState = 'recent';
    node.dataset.taskUid = entry.taskUid;
    node.dataset.clockUid = entry.clockUid;
    if (row.status) node.dataset.taskStatus = row.status;

    const body = el('div', 'rlb-run__body');
    const meta = el('div', 'rlb-run__meta');
    const ended = formatStarted(entry.end, now);
    const total = formatMinutesHuman(entry.priorMinutes || entry.minutes || 0);
    const minutesLeft = Math.max(
        1,
        openLineMinutesLeft(entry, now, options.openLineWindowMinutes)
    );
    const metadata = `${total} total · leaves in ${minutesLeft}m`;
    const lastActiveLabel = `Last active ${ended.raw}`;
    const endedNode = el(
        'time',
        'rlb-run__meta-line rlb-run__recent-meta',
        metadata
    );
    endedNode.title = `${metadata}; ${lastActiveLabel}`;
    endedNode.setAttribute('aria-label', `${total} total; leaves in ${minutesLeft}m; ${lastActiveLabel}`);
    if (ended.datetime) endedNode.dateTime = ended.datetime;
    endedNode.dataset.openLineEnd = String(entry.end instanceof Date ? entry.end.getTime() : entry.end);
    meta.appendChild(endedNode);
    body.append(renderTitle(row, options.onOpenTask), meta);

    const actions = el('div', 'rlb-run__actions');
    if (row.status === 'DONE') {
        const completed = el('span', 'bp3-icon bp3-icon-tick-circle rlb-run__completed');
        completed.title = 'Completed';
        completed.setAttribute('role', 'img');
        completed.setAttribute('aria-label', 'Completed');
        actions.appendChild(completed);
    } else {
        const focus = button(
            'bp3-button bp3-small bp3-minimal bp3-icon-play rlb-run__focus',
            '',
            event => {
                event.stopPropagation();
                void options.onFocusRecent?.(entry, event);
            },
            { title: focusRecentLabel(formatDisplayTitle(row)) }
        );
        focus.dataset.action = 'focus-recent';
        actions.appendChild(focus);
    }
    node.append(body, actions);
    return node;
};

/** Build the small, shared model consumed by both the popover and sidebar. */
export function buildSessionSurfaceModel({
    entries = [],
    recentItems = [],
    now,
    windowMinutes = ACTIVE_WORK_WINDOW_MINUTES,
    staleHours = 8,
}) {
    const currentNow = now instanceof Date ? now : new Date(now);
    const normalizedWindow = Number.isFinite(Number(windowMinutes)) && Number(windowMinutes) > 0
        ? Number(windowMinutes)
        : ACTIVE_WORK_WINDOW_MINUTES;
    const runningRows = entries.map(entry => ({
        kind: 'focused',
        key: `focused:${entry.clockUid}`,
        taskUid: entry.taskUid,
        taskString: entry.taskString,
        title: entry.title,
        status: entry.status ?? null,
        entry,
    }));
    const recentRows = recentItems.map(entry => ({
        kind: 'recent',
        key: `recent:${entry.taskUid}`,
        taskUid: entry.taskUid,
        taskString: entry.taskString,
        title: entry.title,
        status: entry.status ?? null,
        entry,
    }));
    return {
        now: currentNow,
        entries: entries.slice(),
        rows: [...runningRows, ...recentRows],
        focusedRows: runningRows,
        recentRows,
        focusedCount: runningRows.length,
        activeCount: runningRows.length + recentRows.length,
        runningCount: runningRows.length,
        openLineWindowMinutes: normalizedWindow,
        staleEntries: findStaleClocks(entries, currentNow, staleHours),
    };
}

const appendSection = (list, label, rows, renderRow, modifier = '', context = '') => {
    if (!rows.length) return;
    const section = el('section', `rlb-surface__section ${modifier}`.trim());
    const labelNode = el('div', 'rlb-surface__section-label');
    labelNode.appendChild(el('span', 'rlb-surface__section-label-text', label));
    if (context) {
        labelNode.appendChild(el('span', 'rlb-surface__section-context', context));
    }
    section.setAttribute('aria-label', context ? `${label}, ${context}` : label);
    section.appendChild(labelNode);
    for (const row of rows) section.appendChild(renderRow(row));
    list.appendChild(section);
};

const appendInlineRetry = (list, message, onRefresh) => {
    const status = el('div', 'rlb-surface__inline-status');
    status.setAttribute('role', 'alert');
    status.setAttribute('aria-live', 'assertive');
    status.setAttribute('aria-atomic', 'true');
    status.append(
        el('span', 'rlb-surface__inline-message', message),
        el('span', 'rlb-surface__inline-separator', ' · ')
    );
    status.querySelector('.rlb-surface__inline-separator').setAttribute('aria-hidden', 'true');
    const retry = button(
        'bp3-button bp3-minimal bp3-small rlb-surface__retry',
        'Retry',
        () => void onRefresh?.(),
        { title: 'Retry update' }
    );
    retry.dataset.action = 'retry';
    status.appendChild(retry);
    list.appendChild(status);
};

/** Render one current-session surface into a supplied popover/sidebar shell. */
export function renderSessionSurface(root, model, options = {}) {
    const activeView = options.view === 'today' ? 'today' : 'threads';
    const todayExpandableNodes =
        activeView === 'today' && Array.isArray(options.todayModel?.nodes)
            ? options.todayModel.nodes.filter(node => node?.children?.length > 0)
            : [];
    const visibleTodayRows = activeView === 'today'
        ? options.todayRows || flattenTodayRows(options.todayModel)
        : [];
    const visibleTodayExpandableRows = visibleTodayRows.filter(row => row?.node?.children?.length > 0);
    const todayAllExpanded = todayExpandableNodes.length > 0 &&
        visibleTodayExpandableRows.length === todayExpandableNodes.length &&
        visibleTodayExpandableRows.every(row => row.expanded);
    const todayToggleLabel = todayAllExpanded ? collapseTodayLabel : expandTodayLabel;
    const title = el('div', 'rlb-popover__title rlb-visually-hidden', SURFACE_TITLE);
    if (options.titleId) title.id = options.titleId;

    const header = el('header', 'rlb-surface__header');
    header.appendChild(title);
    if (options.onSwitchView) {
        const switcher = el('nav', 'rlb-surface__view-switch');
        switcher.setAttribute('aria-label', 'Logbook view');
        const todayModel = options.todayModel || { count: 0 };
        const todayLoading = todayModel.loading === true || ['idle', 'loading'].includes(todayModel.status);
        const todayColdError =
            (todayModel.error === true || todayModel.status === 'error') &&
            todayModel.hasSnapshot !== true;
        for (const [view, label, count, loading, failed] of [
            ['threads', 'Threads', model.activeCount ?? model.rows.length, false, false],
            ['today', 'Today', todayModel.count ?? 0, todayLoading, todayColdError],
        ]) {
            const selected = activeView === view;
            const control = button(
                `bp3-button bp3-minimal rlb-surface__view-control${selected ? ' is-selected' : ''}`,
                '',
                () => options.onSwitchView(view),
                { title: switchLabel(view) }
            );
            control.dataset.action = 'switch-view';
            control.dataset.view = view;
            control.setAttribute('aria-pressed', String(selected));
            control.append(el('span', 'rlb-surface__view-label', label), document.createTextNode(' '));
            const status = el(
                'span',
                `rlb-surface__view-count${loading ? ' rlb-surface__view-count--loading' : ''}${failed ? ' rlb-surface__view-count--error' : ''}`,
                loading ? '' : failed ? '!' : String(count)
            );
            if (loading) {
                const spinner = el('span', 'rlb-surface__spinner');
                spinner.setAttribute('aria-hidden', 'true');
                status.appendChild(spinner);
                control.setAttribute('aria-busy', 'true');
                control.setAttribute('aria-label', `${switchLabel(view)}, updating`);
            } else if (failed) {
                control.setAttribute('aria-label', `${switchLabel(view)}, update failed`);
            }
            control.appendChild(status);
            switcher.appendChild(control);
        }
        header.appendChild(switcher);
    }
    const headerActions = el('div', 'rlb-surface__actions');
    if (options.onClose) {
        const close = button(
            'bp3-button bp3-minimal bp3-small bp3-icon-cross rlb-surface__icon-button rlb-surface__close',
            '',
            () => options.onClose(),
            { title: 'Close Current Sessions' }
        );
        close.dataset.action = 'close';
        headerActions.appendChild(close);
    }
    if (todayExpandableNodes.length > 0) {
        const toggleAll = button(
            `bp3-button bp3-minimal bp3-small bp3-icon-${todayAllExpanded ? 'collapse-all' : 'expand-all'} rlb-surface__icon-button rlb-today__control`,
            '',
            () => options.onToggleAllToday?.(),
            { title: todayToggleLabel, ariaLabel: todayToggleLabel }
        );
        toggleAll.dataset.action = 'today-toggle-all';
        toggleAll.setAttribute('aria-expanded', String(todayAllExpanded));
        toggleAll.setAttribute('aria-controls', 'rlb-today-tree');
        headerActions.appendChild(toggleAll);
    }
    if (options.onOpenDashboard) {
        const dashboard = button(
            'bp3-button bp3-minimal bp3-small bp3-icon-dashboard rlb-surface__icon-button rlb-surface__dashboard',
            '',
            () => options.onOpenDashboard(),
            { title: dashboardLabel }
        );
        dashboard.dataset.action = 'dashboard';
        headerActions.appendChild(dashboard);
    }
    if (headerActions.childElementCount > 0) header.appendChild(headerActions);
    root.replaceChildren(header);

    const sessionList = el('div', 'rlb-surface__list');
    sessionList.setAttribute('role', 'group');
    sessionList.setAttribute('aria-label', activeView === 'today' ? 'Today TODOs' : 'Active Threads');
    root.appendChild(sessionList);

    if (activeView === 'today') {
        const todayModel = options.todayModel;
        const rows = visibleTodayRows;
        const todayFailed = todayModel?.error === true || todayModel?.status === 'error';
        const hasTodaySnapshot = todayModel?.hasSnapshot === true;
        if (todayFailed) {
            appendInlineRetry(
                sessionList,
                hasTodaySnapshot ? 'Couldn’t update' : 'Couldn’t read Today',
                options.onRefresh
            );
        }
        if (todayFailed && !hasTodaySnapshot) {
            // The inline retry is the complete cold-read state.
        } else if (!todayModel || ['idle', 'loading'].includes(todayModel.status)) {
            sessionList.appendChild(el('div', 'rlb-popover__empty', 'Loading today…'));
        } else if (rows.length === 0) {
            sessionList.appendChild(el('div', 'rlb-popover__empty', 'No unfinished TODOs today.'));
        } else {
            const tree = el('div', 'rlb-today__tree');
            tree.id = 'rlb-today-tree';
            tree.setAttribute('role', 'tree');
            tree.setAttribute('aria-label', 'Today unfinished TODOs');
            for (const row of rows) tree.appendChild(renderTodayRow(row, options));
            sessionList.appendChild(tree);
        }
    } else {
        if (options.refreshState?.state === 'error') {
            appendInlineRetry(sessionList, 'Couldn’t update', options.onRefresh);
        }
        if (model.rows.length === 0) {
            sessionList.appendChild(
                el('div', 'rlb-popover__empty', options.emptyMessage || 'No Timing Line is active.')
            );
        } else {
            if (model.staleEntries?.length > 0) {
                sessionList.appendChild(
                    el(
                        'div',
                        'rlb-popover__empty bp3-text-small',
                        `${sessionCount(model.staleEntries.length)} ${
                            model.staleEntries.length > 1 ? 'have' : 'has'
                        } been open for over ${options.staleHours || 8}h — likely forgotten.`
                    )
                );
            }
            appendSection(
                sessionList,
                'TIMING',
                model.focusedRows,
                row => renderRunningRow(row, model.now, options),
                'rlb-surface__section--focused'
            );
            appendSection(
                sessionList,
                `PARALLEL THREADS · ${model.recentRows.length}`,
                model.recentRows,
                row => renderRecentRow(row, model.now, options),
                'rlb-surface__section--open-lines rlb-surface__section--recent',
                `Leave after ${model.openLineWindowMinutes ?? ACTIVE_WORK_WINDOW_MINUTES}m without focus`
            );
        }
    }

    for (const notice of options.notices || []) {
        const message = typeof notice === 'string' ? notice : notice?.message;
        if (!message) continue;
        const role = notice?.role === 'alert' ? 'alert' : 'status';
        const node = el('div', 'rlb-popover__notice bp3-text-small', message);
        node.setAttribute('role', role);
        node.setAttribute('aria-live', role === 'alert' ? 'assertive' : 'polite');
        node.setAttribute('aria-atomic', 'true');
        root.appendChild(node);
    }

    if (activeView === 'threads' && model.runningCount > 1 && options.onClockOutAll) {
        const footer = el('footer', 'rlb-surface__footer');
        const confirming = Boolean(options.clockOutAllConfirm);
        footer.appendChild(
            button(
                `bp3-button bp3-small${confirming ? ' bp3-intent-danger' : ''}`,
                confirming ? 'Confirm Clock Out All' : 'Clock Out All',
                () => options.onClockOutAll(),
                {
                    title: confirming ? 'Confirm permanent Clock Out All' : 'Close all running Sessions',
                }
            )
        );
        root.appendChild(footer);
    }
    return root;
}

/** Update only live elapsed handles; callers use this from their one-second tick. */
export function updateSessionSurfaceElapsed(
    root,
    entries,
    now,
    openLines = [],
    openLineWindowMinutes = ACTIVE_WORK_WINDOW_MINUTES
) {
    if (!root) return;
    const currentNow = now instanceof Date ? now : new Date(now);
    const byUid = new Map(entries.map(entry => [entry.clockUid, entry]));
    for (const meta of root.querySelectorAll('.rlb-run[data-session-state="running"] .rlb-run__meta')) {
        const entry = byUid.get(meta.dataset.clockUid);
        if (!entry) continue;
        const primary = meta.querySelector('.rlb-run__meta-primary');
        if (primary) {
            const figures = rowFigures(entry, currentNow);
            const elapsed = primary.querySelector('.rlb-run__elapsed');
            const total = primary.querySelector('.rlb-run__total');
            if (elapsed && total) {
                elapsed.textContent = figures.elapsed;
                total.textContent = `${figures.total} total`;
            } else {
                primary.textContent = `${figures.elapsed} · ${figures.total} total`;
            }
        }
        const row = meta.closest('.rlb-run');
        if (row) {
            const overrun = pomodoro.isCycleOverrun(currentNow);
            row.classList.toggle('rlb-run--overrun', overrun);
        }
    }

    const openLinesByTask = new Map(openLines.map(entry => [entry.taskUid, entry]));
    for (const meta of root.querySelectorAll('.rlb-run[data-session-state="recent"] .rlb-run__meta')) {
        const row = meta.closest('.rlb-run');
        const entry = openLinesByTask.get(row?.dataset.taskUid);
        const recentMeta = meta.querySelector('.rlb-run__recent-meta');
        if (!entry || !recentMeta) continue;
        const total = formatMinutesHuman(entry.priorMinutes || entry.minutes || 0);
        const minutesLeft = Math.max(
            1,
            openLineMinutesLeft(entry, currentNow, openLineWindowMinutes)
        );
        const metadata = `${total} total · leaves in ${minutesLeft}m`;
        const ended = formatStarted(entry.end, currentNow);
        const lastActiveLabel = `Last active ${ended.raw}`;
        recentMeta.textContent = metadata;
        recentMeta.title = `${metadata}; ${lastActiveLabel}`;
        recentMeta.setAttribute('aria-label', `${total} total; leaves in ${minutesLeft}m; ${lastActiveLabel}`);
    }
}
