/**
 * The dashboard dialog: a compact overview, running sessions, and a per-task
 * breakdown.
 *
 * Reads the graph on open and on refresh only — there is no live subscription,
 * because a dialog that reshuffles under the cursor is worse than a stale one.
 */

import * as clock from './clock.js';
import { buildActivity } from './activity.js';
import { renderActivity, syncActivityView } from './activity-view.js';
import { button, el } from './dom.js';
import { readDashboardSnapshot } from './entries.js';
import { createConfirmationController } from './confirmation.js';
import { createFocusTrap } from './focus-trap.js';
import { dataIssuesSection, issueRow } from './dashboard-issues.js';
import { headerRow, statusMark, taskLink as renderTaskLinkBase } from './dashboard-table.js';
import { runningSection as renderRunningSection } from './dashboard-running.js';
import { tasksSection as renderTasksSection } from './dashboard-task-tree.js';
import {
    buildDashboard,
    entryMinutes,
    filterByRange,
    getRange,
    RANGES,
    summariseSessionMetrics,
} from './stats.js';
import { formatDisplayTitle } from './task-display.js';
import { acquireThemeRuntime, applyRoamThemePalette } from './theme.js';
import { formatElapsed, formatMinutesHuman } from './time.js';
import { acquireDocumentScrollLock } from './scroll-lock.js';
import { createRefreshState, REFRESH_MESSAGES } from './refresh-state.js';

const ROOT_ID = 'roam-logbook-dashboard';
const DASHBOARD_TITLE = 'Task Tracker';

export function createDashboard({
    now: nowFn = () => new Date(),
    setIntervalFn = (callback, delay) => setInterval(callback, delay),
    clearIntervalFn = ticker => clearInterval(ticker),
    confirmation = createConfirmationController(),
    scheduleMutationStartFn = null,
} = {}) {
    let root = null;
    let summaryNode = null;
    let bodyNode = null;
    let activityNode = null;
    let rangeId = 'week';
    let returnFocusTo = null;
    let liveTicker = null;
    let refreshButton = null;
    let refreshStatusNode = null;
    let refreshAlertNode = null;
    let lastSnapshot = null;
    let lastModel = null;
    let lastTransientIssues = [];
    let lastRefreshNotice = '';
    let focusInFlight = null;
    let themeRuntime = null;
    let releaseScrollLock = null;
    const focusTrap = createFocusTrap(() => root?.querySelector('.rlb-dialog'));
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

    const syncRefreshUi = state => {
        const current = state || refreshRuntime.state;
        if (refreshButton) {
            refreshButton.dataset.refreshState = current.state;
            refreshButton.disabled = current.state === 'loading';
            if (current.state === 'loading') refreshButton.setAttribute('aria-busy', 'true');
            else refreshButton.removeAttribute('aria-busy');
        }
        if (refreshStatusNode && refreshAlertNode) {
            const isError = current.state === 'error';
            refreshStatusNode.textContent = isError ? '' : current.message;
            refreshAlertNode.textContent = isError ? current.message : '';
        }
    };

    const refreshRuntime = createRefreshState({
        onRender: syncRefreshUi,
        messages: REFRESH_MESSAGES.dashboard,
    });

    const resetDiscardConfirmation = () => confirmation?.reset();

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
        syncActivityView(activityNode, lastModel?.activity, nowDateValue);
    };

    const startLiveTicker = () => {
        clearLiveTicker();
        if (!root?.classList.contains('rlb-root--open')) return;
        if (!bodyNode?.querySelector('[data-running-elapsed="true"]') && !lastModel?.running?.length) {
            return;
        }
        liveTicker = setIntervalFn(updateRunningElapsed, 1000);
    };

    const paintDashboard = now => {
        if (!bodyNode || !lastModel) return;
        clearLiveTicker();
        const model = lastModel;
        const hierarchy = lastSnapshot?.hierarchy || {};
        const transientIssues = lastTransientIssues;
        const refreshNotice = lastRefreshNotice;
        summaryNode.replaceChildren();
        summaryNode.appendChild(overviewBar(model));
        bodyNode.replaceChildren();
        activityNode = null;

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

        if (model.running.length > 0) {
            bodyNode.appendChild(
                renderRunningSection({
                    running: model.running,
                    now,
                    isDiscarding: uid => confirmation?.isArmed(`discard:${uid}`, 'dashboard'),
                    onDiscard: handleDiscard,
                    onClockOut: entry => act(() => clock.clockOut(entry.clockUid)),
                    headerRow,
                    statusMark,
                    taskLink: renderTaskLink,
                })
            );
        }
        if (model.entries.length === 0) {
            bodyNode.appendChild(el('div', 'rlb-empty', 'No clock entries in this range yet.'));
            if (issues.length > 0) bodyNode.appendChild(dataIssuesSection(issues));
            startLiveTicker();
            return;
        }

        activityNode = renderActivity(model.activity);
        if (activityNode) bodyNode.appendChild(activityNode);
        bodyNode.appendChild(
            renderTasksSection(model.tree, {
                taskView,
                collapsedByFilter,
                taskLink: renderTaskLink,
                statusMark,
                taskTimingAction,
            })
        );
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
        lastModel.activity = buildActivity(lastModel.entries, { now, rangeId });
        lastTransientIssues = transientIssues;
        lastRefreshNotice = refreshNotice;
        paintDashboard(now);
        return { ok: true, refreshFailed };
    };

    const refreshDashboard = () =>
        refreshRuntime.run(() => render(), {
            isSuccess: result => result?.ok && !result.refreshFailed,
            onError: error => {
                console.error('[roam-logbook] could not refresh Dashboard', error);
                return { ok: false, error };
            },
        });

    const overviewBar = model => {
        const wrapper = el('dl', 'rlb-overview rlb-overview--compact');
        wrapper.setAttribute('role', 'group');
        wrapper.setAttribute('aria-label', `${DASHBOARD_TITLE} overview`);
        const rangeLabel = getRange(model.rangeId).label;
        const metrics = [
            ['Today', formatMinutesHuman(model.todayMinutes), null, 'today'],
            [rangeLabel, formatMinutesHuman(model.totalMinutes), null, 'selected'],
            ['Sessions', String(model.sessionMetrics?.sessions || 0), rangeLabel, 'sessions'],
            ['Tasks tracked', String(model.tasks.length), rangeLabel, 'tasks'],
        ];
        for (const [label, value, context, key] of metrics) {
            const item = el('div', 'rlb-overview__item rlb-overview__panel rlb-overview__heading');
            const valueNode = el('dd', 'rlb-overview__value');
            const number = el('span', 'rlb-overview__number', value);
            number.dataset.liveMetric = key;
            valueNode.append(number);
            if (context) valueNode.append(el('span', 'rlb-overview__context', context));
            item.append(el('dt', 'rlb-overview__label', label), valueNode);
            wrapper.appendChild(item);
        }
        return wrapper;
    };

    const renderTaskLink = row =>
        renderTaskLinkBase(row, { onClose: () => close() });

    const act = async action => {
        try {
            await action();
        } catch (error) {
            console.error('[roam-logbook]', error);
        }
        render();
    };

    const handleDiscard = entry => {
        const key = `discard:${entry.clockUid}`;
        if (!confirmation?.arm(key, 'dashboard')) {
            render({ readGraph: false });
            return;
        }
        void act(() => clock.discardClock(entry.clockUid));
    };

    const startTaskTiming = taskUid => {
        if (!taskUid || focusInFlight) return focusInFlight;
        const request = act(() =>
            clock.clockIn(taskUid, {
                source: 'active-work-switch',
                ...(typeof scheduleMutationStartFn === 'function'
                    ? { scheduleMutationStartFn }
                    : {}),
            })
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

    const onKeyDown = event => {
        if (!root?.classList.contains('rlb-root--open') || event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        close();
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
        refreshStatusNode.setAttribute('role', 'status');
        refreshStatusNode.setAttribute('aria-live', 'polite');
        refreshStatusNode.setAttribute('aria-atomic', 'true');
        refreshAlertNode = el('span', 'rlb-dashboard__refresh-alert rlb-visually-hidden');
        refreshAlertNode.setAttribute('role', 'alert');
        refreshAlertNode.setAttribute('aria-live', 'assertive');
        refreshAlertNode.setAttribute('aria-atomic', 'true');

        header.append(
            selectWrapper,
            refreshButton,
            button(
                'bp3-dialog-close-button bp3-button bp3-minimal bp3-icon-cross rlb-icon-button',
                '',
                close,
                { title: 'Close' }
            ),
            refreshStatusNode,
            refreshAlertNode
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
        focusTrap.deactivate();
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
                focusTrap.activate();
                render();
                const dialog = root.querySelector('.rlb-dialog');
                const initial = dialog.querySelector(
                    'button, select, input, textarea, a[href], [tabindex]:not([tabindex="-1"])'
                );
                (initial || dialog)?.focus();
            } catch (error) {
                root?.classList.remove('rlb-root--open');
                root?.setAttribute('aria-hidden', 'true');
                document.removeEventListener('keydown', onKeyDown, true);
                focusTrap.deactivate();
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
            activityNode = null;
            lastModel = null;
            refreshRuntime.dispose();
            focusTrap.deactivate();
            focusInFlight = null;
            refreshButton = null;
            refreshStatusNode = null;
            refreshAlertNode = null;
        },
    };
}
