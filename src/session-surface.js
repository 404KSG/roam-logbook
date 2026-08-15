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

const rowFigures = (entry, now) => {
    const target = pomodoro.targetMinutes(entry.clockUid);
    const elapsed = now.getTime() - entry.start.getTime();
    const total = entry.priorMinutes + Math.floor(elapsed / 60_000);
    return (
        formatElapsed(elapsed) +
        (target ? ` · target ${formatElapsed(target * 60_000)}` : '') +
        ` · ${formatMinutesHuman(total)} total`
    );
};

const fullTaskLabel = title => `Open this block: ${title}`;

const renderTitle = (row, onOpenTask) => {
    const title = row.title || row.taskUid;
    const taskButton = button(
        'bp3-button bp3-minimal bp3-icon-document-open rlb-run__title',
        title,
        () => onOpenTask?.(row.taskUid),
        { title: fullTaskLabel(title) }
    );
    taskButton.setAttribute('aria-label', fullTaskLabel(title));
    return taskButton;
};

const renderRunningRow = (row, now, options) => {
    const entry = row.entry;
    const overrun = pomodoro.isOverrun(entry, now);
    const node = el('div', `rlb-run${overrun ? ' rlb-run--overrun' : ''}`);
    node.dataset.sessionState = 'running';
    node.dataset.clockUid = entry.clockUid;

    const status = el('span', 'rlb-run__status rlb-run__status--running');
    status.setAttribute('aria-hidden', 'true');
    const body = el('div', 'rlb-run__body');
    const meta = el('div', 'rlb-run__meta');
    meta.dataset.clockUid = entry.clockUid;
    meta.appendChild(el('div', 'rlb-run__meta-line rlb-run__meta-primary', rowFigures(entry, now)));

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
    meta.appendChild(startedNode);
    body.append(renderTitle(row, options.onOpenTask), meta);

    const actions = el('div', 'rlb-run__actions');
    const checkout = button(
        'bp3-button bp3-small bp3-minimal bp3-icon-log-out rlb-run__checkout',
        '',
        () => void options.onCheckOut?.(entry),
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
        () => void options.onDiscard?.(entry),
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
    status.setAttribute('aria-label', 'Paused Session');
    const body = el('div', 'rlb-run__body');
    const meta = el('div', 'rlb-run__meta');
    meta.appendChild(el('div', 'rlb-run__meta-line rlb-run__meta-primary', 'Paused'));
    const pausedAt = formatStarted(new Date(item.pausedAtMs), now);
    const pausedDetails = pausedAt.valid ? `Paused since ${pausedAt.raw}` : 'Paused Session';
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
    const state = el('span', 'rlb-run__state', 'Paused');
    state.setAttribute('aria-label', 'Paused Session');
    actions.appendChild(state);
    node.append(status, body, actions);
    return node;
};

/** Build the small, shared model consumed by both the popover and sidebar. */
export function buildSessionSurfaceModel({ entries = [], pausedItems = [], now, staleHours = 8 }) {
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
    return {
        now: currentNow,
        entries: entries.slice(),
        pausedItems: pausedItems.slice(),
        rows: [...runningRows, ...pausedRows],
        runningCount: entries.length,
        pausedCount: pausedItems.length,
        staleEntries: findStaleClocks(entries, currentNow, staleHours),
    };
}

const surfaceTitle = model =>
    model.runningCount > 0
        ? `${sessionCount(model.runningCount)} Running`
        : model.pausedCount > 0
          ? `${sessionCount(model.pausedCount)} Paused`
          : 'Logbook';

/** Render one current-session surface into a supplied popover/sidebar shell. */
export function renderSessionSurface(root, model, options = {}) {
    const title = el('div', 'rlb-popover__title', surfaceTitle(model));
    if (options.titleId) title.id = options.titleId;

    const header = el('header', 'rlb-surface__header');
    header.appendChild(title);
    if (options.onRefresh) {
        header.appendChild(
            button(
                'bp3-button bp3-minimal bp3-small bp3-icon-refresh rlb-surface__refresh',
                '',
                () => void options.onRefresh(),
                { title: 'Refresh current Sessions' }
            )
        );
        header.lastElementChild.dataset.action = 'refresh';
    }
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

    if (model.rows.length === 0) {
        root.appendChild(el('div', 'rlb-popover__empty', options.emptyMessage || 'No Session is running.'));
    } else {
        if (model.staleEntries.length > 0) {
            root.appendChild(
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
            root.appendChild(
                row.kind === 'running'
                    ? renderRunningRow(row, model.now, options)
                    : renderPausedRow(row, model.now, options)
            );
        }
    }

    for (const notice of options.notices || []) {
        if (notice) root.appendChild(el('div', 'rlb-popover__notice bp3-text-small', notice));
    }

    const footer = el('div', 'rlb-popover__footer');
    footer.appendChild(
        button('bp3-button bp3-small', 'Dashboard', () => options.onOpenDashboard?.(), {
            title: 'Open Logbook Dashboard',
        })
    );
    if (model.runningCount > 0 || model.pausedCount > 0) {
        if (model.runningCount > 0) {
            footer.appendChild(
                button('bp3-button bp3-small', 'Pause All', () => options.onPauseAll?.(), {
                    title: 'Pause all running Sessions',
                })
            );
        }
        if (model.pausedCount > 0) {
            footer.appendChild(
                button('bp3-button bp3-small', 'Resume All', () => options.onResumeAll?.(), {
                    title: 'Resume paused Sessions with fresh CLOCK entries',
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
        if (row) row.classList.toggle('rlb-run--overrun', pomodoro.isOverrun(entry, currentNow));
    }
}
