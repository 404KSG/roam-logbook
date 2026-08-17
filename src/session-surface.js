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
import { formatElapsed, formatMinutesHuman, formatRelativeTime, formatStarted } from './time.js';

const sessionCount = count => `${count} Session${count === 1 ? '' : 's'}`;
const SURFACE_TITLE = 'ACTIVE WORK';

const rowFigures = (entry, now) => {
    const elapsed = now.getTime() - entry.start.getTime();
    const total = (entry.priorMinutes || 0) + Math.floor(elapsed / 60_000);
    return {
        elapsed: formatElapsed(elapsed),
        total: formatMinutesHuman(total),
    };
};

const fullTaskLabel = title => `Open this block: ${title}`;
const focusRecentLabel = title => `Focus this recent Task: ${title}`;
const refreshLabel = 'Refresh Active Work from graph';

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

const renderTitle = (row, onOpenTask, onFocusRecent) => {
    const title = row.title || row.taskUid;
    const recent = row.kind === 'recent';
    const taskButton = button(
        `bp3-button bp3-minimal rlb-run__title${recent ? ' rlb-run__title--recent' : ''}`,
        title,
        event => {
            if (recent && !event?.shiftKey) {
                event.stopPropagation();
                void onFocusRecent?.(row.entry, event);
                return;
            }
            onOpenTask?.(row.taskUid, event);
        },
        { title: recent ? focusRecentLabel(title) : fullTaskLabel(title) }
    );
    taskButton.setAttribute('aria-label', recent ? focusRecentLabel(title) : fullTaskLabel(title));
    if (recent) taskButton.dataset.action = 'focus-recent';
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
    body.append(renderTitle(row, options.onOpenTask, options.onFocusRecent), meta);

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

    const body = el('div', 'rlb-run__body');
    const meta = el('div', 'rlb-run__meta');
    const ended = formatStarted(entry.end, now);
    const total = formatMinutesHuman(entry.priorMinutes || entry.minutes || 0);
    const lastActiveLabel = `Last active ${ended.raw}`;
    const endedNode = el(
        'time',
        'rlb-run__meta-line rlb-run__recent-meta',
        `${total} total · ${formatRelativeTime(entry.end, now)}`
    );
    endedNode.title = lastActiveLabel;
    endedNode.setAttribute('aria-label', `${total} total; last active ${ended.raw}`);
    if (ended.datetime) endedNode.dateTime = ended.datetime;
    meta.appendChild(endedNode);
    body.append(renderTitle(row, options.onOpenTask, options.onFocusRecent), meta);
    node.appendChild(body);
    return node;
};

const renderPausedRow = (row, now, options) => {
    const item = row.item;
    const node = el('div', 'rlb-run rlb-run--paused');
    node.dataset.sessionState = 'paused';
    node.dataset.taskUid = item.taskUid;

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
    node.append(body, actions);
    return node;
};

const renderRecoveryRow = (row, options) => {
    const item = row.item;
    const node = el('div', 'rlb-run rlb-run--recovery');
    node.dataset.sessionState = 'recovery';
    node.dataset.recoveryState = item.recoveryState || 'conflict';
    node.dataset.taskUid = item.taskUid;

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
    node.append(body, actions);
    return node;
};

/** Build the small, shared model consumed by both the popover and sidebar. */
export function buildSessionSurfaceModel({
    entries = [],
    recentItems = [],
    pausedItems = [],
    pendingItems = [],
    recoveryState = null,
    now,
    staleHours = 8,
}) {
    const currentNow = now instanceof Date ? now : new Date(now);
    const runningRows = entries.map(entry => ({
        kind: 'focused',
        key: `focused:${entry.clockUid}`,
        taskUid: entry.taskUid,
        title: entry.title,
        entry,
    }));
    const recentRows = recentItems.map(entry => ({
        kind: 'recent',
        key: `recent:${entry.taskUid}`,
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
        rows: [...runningRows, ...recentRows, ...pausedRows, ...recoveryRows],
        focusedRows: runningRows,
        recentRows,
        pausedRows,
        recoveryRows,
        focusedCount: runningRows.length,
        activeCount: runningRows.length + recentRows.length,
        runningCount: runningRows.length,
        pausedCount: pausedItems.length,
        recoveryCount: recoveryRows.length,
        staleEntries: findStaleClocks(entries, currentNow, staleHours),
    };
}

const surfaceTitle = () => SURFACE_TITLE;

const appendSection = (list, label, rows, renderRow, modifier = '') => {
    if (!rows.length) return;
    const section = el('section', `rlb-surface__section ${modifier}`.trim());
    const labelNode = el('div', 'rlb-surface__section-label', label);
    section.setAttribute('aria-label', label);
    section.appendChild(labelNode);
    for (const row of rows) section.appendChild(renderRow(row));
    list.appendChild(section);
};

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
    sessionList.setAttribute('aria-label', 'Active Work');
    root.appendChild(sessionList);

    if (model.rows.length === 0) {
        sessionList.appendChild(
            el('div', 'rlb-popover__empty', options.emptyMessage || 'No Focused Task is running.')
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
        appendSection(
            sessionList,
            'FOCUSED',
            model.focusedRows,
            row => renderRunningRow(row, model.now, options),
            `rlb-surface__section--focused${pomodoro.isCycleOverrun(model.now) ? ' rlb-surface__section--overrun' : ''}`
        );
        appendSection(
            sessionList,
            `RECENT · ${model.recentRows.length}`,
            model.recentRows,
            row => renderRecentRow(row, model.now, options),
            'rlb-surface__section--recent'
        );
        appendSection(
            sessionList,
            'PAUSED',
            model.pausedRows,
            row => renderPausedRow(row, model.now, options),
            'rlb-surface__section--paused'
        );
        appendSection(
            sessionList,
            'RECOVERY',
            model.recoveryRows,
            row => renderRecoveryRow(row, options),
            'rlb-surface__section--recovery'
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
            const resumeLabel = model.pausedCount === 1 ? 'Resume' : 'Resume All';
            const resumeTitle = model.pausedCount === 1
                ? 'Resume the paused Task'
                : 'Resume all paused Tasks';
            const resumeAll = button('bp3-button bp3-small', resumeLabel, () => options.onResumeAll?.(), {
                title: resumeTitle,
            });
            resumeAll.dataset.action = 'resume-all';
            footer.appendChild(
                resumeAll
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
}
