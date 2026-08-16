/**
 * Shared view model and renderer for the current-session surfaces.
 *
 * Popover and right-sidebar are two shells around this one surface. The module
 * owns only DOM structure and accessible labels; graph mutations remain injected
 * callbacks so neither surface can grow a second copy of session behavior.
 */

import { button, el } from './dom.js';
import * as pomodoro from './pomodoro.js';
import { findStaleClocks } from './stats.js';
import { formatElapsed, formatMinutesHuman, formatStarted } from './time.js';

const sessionCount = count => `${count} Session${count === 1 ? '' : 's'}`;
const taskCount = count => `${count} Task${count === 1 ? '' : 's'}`;
const SURFACE_TITLE = 'Roam Logbook';

const rowFigures = (entry, now) => {
    const elapsed = now.getTime() - entry.start.getTime();
    const total = entry.priorMinutes + Math.floor(elapsed / 60_000);
    return `${formatElapsed(elapsed)} · ${formatMinutesHuman(total)} total`;
};

const fullTaskLabel = title => `Open this block: ${title}`;
const refreshLabel = 'Refresh Sessions from graph';

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

const renderTitle = (row, onOpenTask) => {
    const title = row.title || row.taskUid;
    const taskButton = button(
        'bp3-button bp3-minimal rlb-run__title',
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
    const node = el('div', `rlb-run rlb-run--inline-meta${overrun ? ' rlb-run--overrun' : ''}`);
    node.dataset.sessionState = 'running';
    node.dataset.clockUid = entry.clockUid;

    const status = el('span', 'rlb-run__status rlb-run__status--running');
    status.setAttribute('aria-hidden', 'true');
    const body = el('div', 'rlb-run__body');
    const meta = el('div', 'rlb-run__meta');
    meta.dataset.clockUid = entry.clockUid;
    const primary = el('div', 'rlb-run__meta-line rlb-run__meta-primary', rowFigures(entry, now));

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
    node.append(status, body, actions);
    return node;
};

const renderPausedRow = (row, now, options) => {
    const item = row.item;
    const node = el('div', 'rlb-run rlb-run--paused');
    node.dataset.sessionState = 'paused';
    node.dataset.taskUid = item.taskUid;

    const status = el('span', 'rlb-run__status rlb-run__status--paused');
    status.setAttribute('aria-label', 'Paused Task');
    const body = el('div', 'rlb-run__body');
    const meta = el('div', 'rlb-run__meta');
    const pausedAt = formatStarted(new Date(item.pausedAtMs), now);
    const pausedDetails = pausedAt.valid ? `Paused since ${pausedAt.raw}` : 'Paused Task';
    const pausedNode = el(
        'time',
        'rlb-run__meta-line rlb-run__started',
        pausedAt.valid ? `${pausedAt.dateLabel} ${pausedAt.timeLabel}` : pausedDetails
    );
    pausedNode.title = pausedDetails;
    pausedNode.setAttribute('aria-label', pausedDetails);
    if (pausedAt.datetime) pausedNode.dateTime = pausedAt.datetime;
    meta.appendChild(pausedNode);
    body.append(renderTitle(row, options.onOpenTask), meta);

    const actions = el('div', 'rlb-run__actions');
    const resume = button(
        'bp3-button bp3-small bp3-minimal bp3-icon-play rlb-run__resume',
        '',
        event => {
            event.stopPropagation();
            void options.onResume?.(item, event);
        },
        { title: 'Resume' }
    );
    resume.dataset.action = 'resume';
    actions.appendChild(resume);
    node.append(status, body, actions);
    return node;
};

const renderRecoveryRow = (row, options) => {
    const item = row.item;
    const node = el('div', 'rlb-run rlb-run--recovery');
    node.dataset.sessionState = 'recovery';
    node.dataset.recoveryState = item.recoveryState || 'conflict';
    node.dataset.taskUid = item.taskUid;

    const status = el('span', 'rlb-run__status rlb-run__status--recovery');
    status.setAttribute('aria-label', 'Recovery');
    const body = el('div', 'rlb-run__body');
    const meta = el('div', 'rlb-run__meta');
    const reason = item.recoveryIssue === 'missing-clockUid'
        ? 'Exact Session association is missing.'
        : 'Exact Session association needs review.';
    meta.append(
        el('div', 'rlb-run__meta-line rlb-run__meta-primary', 'Recovery required'),
        el('div', 'rlb-run__meta-line rlb-run__started', reason)
    );
    body.append(renderTitle(row, options.onOpenTask), meta);

    const actions = el('div', 'rlb-run__actions');
    const retry = button(
        'bp3-button bp3-small bp3-minimal bp3-icon-refresh rlb-run__recovery',
        '',
        event => {
            event.stopPropagation();
            void options.onRecovery?.(item, event);
        },
        { title: 'Retry Recovery' }
    );
    retry.dataset.action = 'recovery';
    actions.appendChild(retry);
    node.append(status, body, actions);
    return node;
};

/** Build the small, shared model consumed by both the popover and sidebar. */
export function buildSessionSurfaceModel({
    entries = [],
    pausedItems = [],
    pendingItems = [],
    recoveryState = null,
    now,
    staleHours = 8,
}) {
    const currentNow = now instanceof Date ? now : new Date(now);
    const runningRows = entries.map(entry => ({
        kind: 'running',
        key: `running:${entry.clockUid}`,
        taskUid: entry.taskUid,
        title: entry.title,
        entry,
    }));
    const pausedRows = pausedItems.map(item => ({
        kind: 'paused',
        key: `paused:${item.taskUid}`,
        taskUid: item.taskUid,
        title: item.title,
        item,
    }));
    const recoveryRows = pendingItems
        .filter(item => item?.recoveryState === 'conflict')
        .map(item => ({
            kind: 'recovery',
            key: `recovery:${item.taskUid}`,
            taskUid: item.taskUid,
            title: item.title,
            item,
        }));
    return {
        now: currentNow,
        entries: entries.slice(),
        pausedItems: pausedItems.slice(),
        pendingItems: pendingItems.slice(),
        recoveryState: recoveryState ? { ...recoveryState } : null,
        rows: [...runningRows, ...pausedRows, ...recoveryRows],
        runningCount: entries.length,
        pausedCount: pausedItems.length,
        recoveryCount: recoveryRows.length,
        staleEntries: findStaleClocks(entries, currentNow, staleHours),
    };
}

const surfaceTitle = model =>
    model.runningCount > 0
        ? `${sessionCount(model.runningCount)} Running`
        : model.pausedCount > 0
          ? `${taskCount(model.pausedCount)} Paused`
          : model.recoveryCount > 0
            ? `${model.recoveryCount} Recover${model.recoveryCount === 1 ? 'y' : 'ies'} Required`
            : model.recoveryState
              ? 'Pause Batch Recovery Required'
          : SURFACE_TITLE;

/** Render one current-session surface into a supplied popover/sidebar shell. */
export function renderSessionSurface(root, model, options = {}) {
    const title = el('div', 'rlb-popover__title', surfaceTitle(model));
    if (options.titleId) title.id = options.titleId;

    const header = el('header', 'rlb-surface__header');
    header.appendChild(title);
    if (options.onClose) {
        header.appendChild(
            button(
                'bp3-button bp3-minimal bp3-small bp3-icon-cross rlb-surface__close',
                '',
                () => options.onClose(),
                { title: 'Close Current Sessions' }
            )
        );
        header.lastElementChild.dataset.action = 'close';
    }
    root.replaceChildren(header);

    const sessionList = el('div', 'rlb-surface__list');
    sessionList.setAttribute('role', 'group');
    sessionList.setAttribute('aria-label', 'Current Sessions');
    root.appendChild(sessionList);

    if (model.rows.length === 0) {
        sessionList.appendChild(
            el('div', 'rlb-popover__empty', options.emptyMessage || 'No Session is running.')
        );
    } else {
        if (model.staleEntries.length > 0) {
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
        for (const row of model.rows) {
            sessionList.appendChild(
                row.kind === 'running'
                    ? renderRunningRow(row, model.now, options)
                    : row.kind === 'paused'
                      ? renderPausedRow(row, model.now, options)
                      : renderRecoveryRow(row, options)
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

    const singleRunning = model.runningCount === 1 && model.pausedCount === 0;
    const footerModifiers = [
        model.rows.length === 0 ? 'rlb-popover__footer--empty' : '',
        singleRunning ? 'rlb-popover__footer--single-running' : '',
    ].filter(Boolean);
    const footer = el('div', `rlb-popover__footer ${footerModifiers.join(' ')}`.trim());
    footer.appendChild(
        button('bp3-button bp3-small', 'Dashboard', () => options.onOpenDashboard?.(), {
            title: 'Open Roam Logbook Dashboard',
        })
    );
    if (model.recoveryState) {
        const recovery = button(
            'bp3-button bp3-small',
            'Retry Pause Batch cleanup',
            () => options.onRetryRecovery?.(),
            {
                title: 'Commit the saved Pause Batch cleanup without resuming paused Tasks',
            }
        );
        recovery.dataset.action = 'retry-pause-batch';
        footer.appendChild(recovery);
    }
    if (model.runningCount > 0 || model.pausedCount > 0 || model.recoveryState) {
        if (model.runningCount > 0) {
            footer.appendChild(
                button('bp3-button bp3-small', singleRunning ? 'Pause' : 'Pause All', () => options.onPauseAll?.(), {
                    title: singleRunning ? 'Pause the running Session' : 'Pause all running Sessions',
                })
            );
        }
        if (model.pausedCount > 0) {
            footer.appendChild(
                button('bp3-button bp3-small', 'Resume paused Tasks', () => options.onResumeAll?.(), {
                    title: 'Resume paused Tasks with fresh CLOCK entries',
                })
            );
        }
        if (model.runningCount > 1 || model.pausedCount > 0) {
            const confirming = Boolean(options.clockOutAllConfirm);
            footer.appendChild(
                button(
                    `bp3-button bp3-small${confirming ? ' bp3-intent-danger' : ''}`,
                    confirming ? 'Confirm Clock Out All' : 'Clock Out All',
                    () => options.onClockOutAll?.(),
                    {
                        title: confirming
                            ? 'Confirm permanent Clock Out All'
                            : 'Permanently close all running Sessions and clear the Pause Batch',
                    }
                )
            );
        }
    }
    if (options.onRefresh) {
        const refreshState = options.refreshState || {};
        const state = ['idle', 'loading', 'success', 'error'].includes(refreshState.state)
            ? refreshState.state
            : 'idle';
        const refreshCell = el('div', 'rlb-surface__refresh-cell');
        refreshCell.dataset.refreshState = state;
        const refresh = button(
            `bp3-button bp3-minimal bp3-small bp3-icon-refresh rlb-surface__refresh rlb-surface__refresh--${state}`,
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
        footer.appendChild(refreshCell);
    }
    root.appendChild(footer);
    return root;
}

/** Update only live elapsed handles; callers use this from their one-second tick. */
export function updateSessionSurfaceElapsed(root, entries, now) {
    if (!root) return;
    const currentNow = now instanceof Date ? now : new Date(now);
    const byUid = new Map(entries.map(entry => [entry.clockUid, entry]));
    for (const meta of root.querySelectorAll('.rlb-run[data-session-state="running"] .rlb-run__meta')) {
        const entry = byUid.get(meta.dataset.clockUid);
        if (!entry) continue;
        const primary = meta.querySelector('.rlb-run__meta-primary');
        if (primary) primary.textContent = rowFigures(entry, currentNow);
        const row = meta.closest('.rlb-run');
        if (row) row.classList.toggle('rlb-run--overrun', pomodoro.isCycleOverrun(currentNow));
    }
}
