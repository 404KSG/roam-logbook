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

const sessionCount = count => `${count} Session${count === 1 ? '' : 's'}`;
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
const refreshLabel = 'Refresh Active Work from graph';
const dashboardLabel = 'Open Roam Logbook Dashboard';

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
        { title: fullTaskLabel(title) }
    );
    taskButton.setAttribute('aria-label', fullTaskLabel(title));
    return taskButton;
};

const renderRunningRow = (row, now, options) => {
    const entry = row.entry;
    const overrun = pomodoro.isCycleOverrun(now);
    const node = el(
        'div',
        `rlb-run rlb-run--focused rlb-run--inline-meta${overrun ? ' rlb-run--overrun' : ''}`
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

const surfaceTitle = count => `${SURFACE_TITLE} · ${count}`;

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

const renderRefreshControl = options => {
    const refreshState = options.refreshState || {};
    const state = ['idle', 'loading', 'success', 'error'].includes(refreshState.state)
        ? refreshState.state
        : 'idle';
    const refreshCell = el('div', 'rlb-surface__refresh-cell');
    refreshCell.dataset.refreshState = state;
    const refresh = button(
        `bp3-button bp3-minimal bp3-small bp3-icon-refresh rlb-surface__icon-button rlb-surface__refresh rlb-surface__refresh--${state}`,
        '',
        () => void options.onRefresh(),
        { title: refreshLabel }
    );
    refresh.dataset.action = 'refresh';
    if (state === 'loading') {
        refresh.disabled = true;
        refresh.setAttribute('aria-busy', 'true');
    }
    const refreshStatus = el(
        'span',
        `rlb-surface__refresh-status rlb-surface__refresh-status--${state} rlb-visually-hidden`,
        refreshState.message || ''
    );
    refreshStatus.setAttribute('role', 'status');
    refreshStatus.setAttribute('aria-live', 'polite');
    refreshStatus.setAttribute('aria-atomic', 'true');
    refreshCell.append(refresh, refreshStatus);
    return refreshCell;
};

/** Render one current-session surface into a supplied popover/sidebar shell. */
export function renderSessionSurface(root, model, options = {}) {
    const title = el('div', 'rlb-popover__title', surfaceTitle(model.activeCount ?? model.rows.length));
    if (options.titleId) title.id = options.titleId;

    const header = el('header', 'rlb-surface__header');
    header.appendChild(title);
    const headerActions = el('div', 'rlb-surface__actions');
    if (options.onOpenDashboard) {
        const dashboard = button(
            'bp3-button bp3-minimal bp3-small bp3-icon-home rlb-surface__icon-button rlb-surface__dashboard',
            '',
            () => options.onOpenDashboard(),
            { title: dashboardLabel }
        );
        dashboard.dataset.action = 'dashboard';
        headerActions.appendChild(dashboard);
    }
    if (options.onRefresh) headerActions.appendChild(renderRefreshControl(options));
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
    if (headerActions.childElementCount > 0) header.appendChild(headerActions);
    root.replaceChildren(header);

    const sessionList = el('div', 'rlb-surface__list');
    sessionList.setAttribute('role', 'group');
    sessionList.setAttribute('aria-label', 'Active Threads');
    root.appendChild(sessionList);

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
            `rlb-surface__section--focused${pomodoro.isCycleOverrun(model.now) ? ' rlb-surface__section--overrun' : ''}`
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

    if (model.runningCount > 1 && options.onClockOutAll) {
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
            row.closest('.rlb-surface__section--focused')
                ?.classList.toggle('rlb-surface__section--overrun', overrun);
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
