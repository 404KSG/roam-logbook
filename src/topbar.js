/**
 * The topbar widget: a live counter plus a popover for the open clocks.
 *
 * Roam re-renders its topbar on navigation, so the widget is re-attached from a
 * MutationObserver rather than mounted once.
 */

import * as clock from './clock.js';
import { ACTIVE_WORK_WINDOW_MINUTES } from './active-work.js';
import { createConfirmationController } from './confirmation.js';
import { button, el } from './dom.js';
import * as pomodoro from './pomodoro.js';
import { formatElapsed, formatMinutesHuman } from './time.js';
import { findStaleClocks } from './stats.js';
import { showTopbarWidget, staleHours } from './settings.js';
import { openBlock, openBlockInRightSidebar } from './roam.js';
import { GRAPH_SYNC_RETRY_NOTICE, mutationResultNotice } from './action-result.js';
import {
    buildSessionSurfaceModel,
    renderSessionSurface,
    updateSessionSurfaceElapsed,
} from './session-surface.js';
import { acquireThemeRuntime, applyRoamThemePalette } from './theme.js';

const WIDGET_ID = 'roam-logbook-topbar';
const POPOVER_ID = 'roam-logbook-popover';
const POPOVER_TITLE_ID = 'roam-logbook-popover-title';
const TOPBAR_SELECTOR = '.rm-topbar';
const REFRESH_SUCCESS_DURATION = 1800;
const REFRESH_LOADING_MESSAGE = 'Refreshing Active Work from graph…';
const REFRESH_SUCCESS_MESSAGE = 'Updated just now';
const REFRESH_ERROR_MESSAGE = 'Refresh failed; last valid snapshot kept. Retry.';

export const sessionCount = count => `${count} Session${count === 1 ? '' : 's'}`;
export const activeCount = count => `${count} Active`;
export const taskCount = count => `${count} Task${count === 1 ? '' : 's'}`;
export const activeWorkDescription = (
    timingCount,
    openLineCount,
    windowMinutes = ACTIVE_WORK_WINDOW_MINUTES
) => {
    const timing = Number.isFinite(Number(timingCount)) ? Math.max(0, Math.floor(Number(timingCount))) : 0;
    const openLines = Number.isFinite(Number(openLineCount))
        ? Math.max(0, Math.floor(Number(openLineCount)))
        : 0;
    const window = Number.isFinite(Number(windowMinutes)) && Number(windowMinutes) > 0
        ? Number(windowMinutes)
        : ACTIVE_WORK_WINDOW_MINUTES;
    return `${timing} timing line${timing === 1 ? '' : 's'} · ${openLines} parallel thread${openLines === 1 ? '' : 's'} · Leave after ${window}m without focus`;
};

export const sessionLoadTone = count => {
    const normalized = Number.isFinite(Number(count))
        ? Math.max(0, Math.floor(Number(count)))
        : 0;
    if (normalized >= 7) return 'red';
    if (normalized >= 4) return 'yellow';
    return 'neutral';
};

export function createPostPaintScheduler({
    view = typeof window === 'undefined' ? null : window,
    setTimeoutFn = (callback, delay) => setTimeout(callback, delay),
    clearTimeoutFn = timerId => clearTimeout(timerId),
} = {}) {
    return callback => {
        let cancelled = false;
        let frameId = null;
        let firstTaskId = null;
        let followingTaskId = null;

        const run = () => {
            followingTaskId = null;
            if (!cancelled) callback();
        };
        const scheduleFollowingTask = () => {
            frameId = null;
            firstTaskId = null;
            if (!cancelled) followingTaskId = setTimeoutFn(run, 0);
        };

        if (typeof view?.requestAnimationFrame === 'function') {
            frameId = view.requestAnimationFrame(scheduleFollowingTask);
        } else {
            firstTaskId = setTimeoutFn(scheduleFollowingTask, 0);
        }

        return () => {
            cancelled = true;
            if (frameId !== null && typeof view?.cancelAnimationFrame === 'function') {
                view.cancelAnimationFrame(frameId);
            }
            if (firstTaskId !== null) clearTimeoutFn(firstTaskId);
            if (followingTaskId !== null) clearTimeoutFn(followingTaskId);
            frameId = null;
            firstTaskId = null;
            followingTaskId = null;
        };
    };
}

/**
 * Where Roam's own left-hand navigation ends.
 *
 * Nothing about the topbar's markup is a public contract, and a guessed class
 * name already put this widget in front of the hamburger once. So the anchor is
 * found by what the controls *are* — Forward, else Back, else the menu/nav —
 * using Blueprint names and accessible metadata so nested variants still land.
 */
const FORWARD_PATTERN = /\b(forward|arrow-right|chevron-right)\b/i;
const BACK_PATTERN = /\b(back|arrow-left|chevron-left)\b/i;
const MENU_PATTERN = /\b(menu|left-sidebar|navigation)\b/i;
const MAIN_CONTROL_PATTERN = /\b(find-or-create|search|topbar(?:__|-)?(?:main|right))\b/i;

export function createTopbar({
    onOpenDashboard,
    onMutationResult = () => {},
    confirmation = createConfirmationController(),
    now: nowFn = () => new Date(),
    setIntervalFn = (callback, delay) => setInterval(callback, delay),
    clearIntervalFn = tickerId => clearInterval(tickerId),
    scheduleAfterPaintFn = createPostPaintScheduler(),
}) {
    let container = null;
    let timeNode = null;
    let iconNode = null;
    let parallelNode = null;
    let separatorNode = null;
    let buttonNode = null;
    let popover = null;
    let observer = null;
    let hostObserver = null;
    let recoveryObserver = null;
    let outerRecoveryObserver = null;
    let recoveryTarget = null;
    let outerRecoveryTarget = null;
    let observedTopbar = null;
    let ticker = null;
    let unsubscribe = null;
    let destroyed = false;
    let discardConfirmUid = null;
    let discardConfirmTimer = null;
    let attachQueued = false;
    let attachTimer = null;
    let attachCount = 0;
    let tickCount = 0;
    let layoutMode = null;
    let actionNotice = '';
    let refreshInFlight = null;
    let pendingOpenRefresh = null;
    let refreshClearTimer = null;
    let refreshState = { state: 'idle', message: '' };
    let activeSignature = '';
    let themeRuntime = null;
    const layoutHosts = new Set();
    const searchHosts = new Set();

    const nowDate = () => {
        const value = nowFn();
        return value instanceof Date ? value : new Date(value);
    };

    // ---- popover ----

    const resetClockOutConfirmation = () => {
        confirmation?.reset();
    };

    const resetDiscardConfirmation = () => {
        discardConfirmUid = null;
        if (discardConfirmTimer) clearTimeout(discardConfirmTimer);
        discardConfirmTimer = null;
    };

    const cancelPendingOpenRefresh = () => {
        const pending = pendingOpenRefresh;
        if (!pending) return;
        pendingOpenRefresh = null;
        pending.cancel?.();
        if (refreshState.state === 'loading' && !refreshInFlight) {
            refreshState = { state: 'idle', message: '' };
        }
        pending.resolve({
            ok: false,
            cancelled: true,
            running: clock.getRunning(),
        });
    };

    const closePopover = ({ restoreFocus = true } = {}) => {
        cancelPendingOpenRefresh();
        resetClockOutConfirmation();
        resetDiscardConfirmation();
        actionNotice = '';
        popover?.remove();
        popover = null;
        document.removeEventListener('mousedown', onDocumentMouseDown, true);
        document.removeEventListener('keydown', onPopoverKeyDown, true);
        window.removeEventListener('resize', closePopover);
        syncSurfaceAria(null);
        if (restoreFocus && buttonNode?.isConnected) buttonNode.focus();
    };

    function onDocumentMouseDown(event) {
        if (!popover) return;
        if (container?.contains(event.target) || popover.contains(event.target)) return;
        closePopover();
    }

    function onPopoverKeyDown(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            closePopover();
            return;
        }
        if (event.key !== 'Tab' || !popover) return;

        const focusables = [
            ...popover.querySelectorAll(
                'button, select, input, textarea, a[href], [tabindex]:not([tabindex="-1"])'
            ),
        ].filter(node => !node.disabled && node.getAttribute('aria-hidden') !== 'true');
        event.preventDefault();
        event.stopPropagation();
        if (focusables.length === 0) {
            popover.tabIndex = -1;
            popover.focus();
            return;
        }

        const first = focusables[0];
        const last = focusables.at(-1);
        const index = focusables.indexOf(document.activeElement);
        if (event.shiftKey) {
            if (index <= 0) last.focus();
            else focusables[index - 1].focus();
        } else if (index < 0 || index === focusables.length - 1) {
            first.focus();
        } else {
            focusables[index + 1].focus();
        }
    }

    /**
     * Anchor the popover to the button in viewport coordinates.
     *
     * It lives on `document.body` rather than inside the widget because the
     * topbar is free to clip its overflow, which would hide the panel entirely.
     */
    const positionPopover = () => {
        const anchor = buttonNode?.getBoundingClientRect();
        if (!anchor || !popover) return;
        const width = popover.offsetWidth || 340;
        const viewport = window.innerWidth || width + 16;
        popover.style.top = `${anchor.bottom + 6}px`;
        // Hangs from the button's left edge, then pulls back if that would run
        // off-screen — the widget sits at the left of the topbar, so the old
        // right-edge alignment pointed the panel away from its anchor.
        popover.style.left = `${Math.max(8, Math.min(anchor.left, viewport - width - 8))}px`;
    };

    const sessionModel = () => {
        const activeWork = clock.getActiveWork(nowDate());
        return buildSessionSurfaceModel({
            entries: activeWork.focused ? [activeWork.focused] : [],
            recentItems: activeWork.recent,
            now: nowDate(),
            windowMinutes: activeWork.windowMinutes,
            staleHours: staleHours(),
        });
    };

    const surfaceNotices = () =>
        actionNotice
            ? [{ message: actionNotice, role: 'alert' }]
            : [clock.getNotice()]
                  .filter(Boolean)
                  .map(message => ({ message, role: 'status' }));

    const renderSurfaces = () => {
        if (popover) renderPopover();
    };

    const ensureThemeRuntime = () => {
        if (themeRuntime) return themeRuntime;
        themeRuntime = acquireThemeRuntime({
            documentRef: document,
            onChange: palette => {
                if (popover) applyRoamThemePalette(popover, palette);
            },
        });
        return themeRuntime;
    };

    const renderRefreshState = () => {
        if (destroyed) return;
        renderButton(clock.getRunning(), nowDate(), { reconcile: false });
        renderSurfaces();
    };

    const setRefreshState = (state, message, { clearAfter = false } = {}) => {
        if (refreshClearTimer) clearTimeout(refreshClearTimer);
        refreshClearTimer = null;
        refreshState = { state, message };
        renderRefreshState();
        if (clearAfter && !destroyed) {
            refreshClearTimer = setTimeout(() => {
                refreshClearTimer = null;
                if (refreshState.state !== 'success') return;
                refreshState = { state: 'idle', message: '' };
                renderRefreshState();
            }, REFRESH_SUCCESS_DURATION);
        }
    };

    const refreshSessions = () => {
        if (refreshInFlight) return refreshInFlight;

        const request = Promise.resolve()
            .then(() => clock.refreshResult())
            .then(async result => {
                if (!result?.ok) return result;
                const snapshot = clock.getEntriesSnapshot();
                const reconciliation = await clock.reconcileOpenClocks({
                    source: 'refresh',
                    entries: snapshot,
                });
                return { ...result, reconciliation };
            })
            .then(
                result => {
                    if (result?.ok) {
                        actionNotice = '';
                        setRefreshState('success', REFRESH_SUCCESS_MESSAGE, { clearAfter: true });
                    } else {
                        actionNotice =
                            mutationResultNotice(result) ||
                            clock.getNotice() ||
                            GRAPH_SYNC_RETRY_NOTICE;
                        setRefreshState('error', REFRESH_ERROR_MESSAGE);
                    }
                    return result;
                },
                error => {
                    console.error('[roam-logbook] could not refresh Session surface', error);
                    actionNotice =
                        mutationResultNotice(error) || clock.getNotice() || GRAPH_SYNC_RETRY_NOTICE;
                    setRefreshState('error', REFRESH_ERROR_MESSAGE);
                    return {
                        ok: false,
                        uncertain: true,
                        running: clock.getRunning(),
                        error,
                    };
                }
            );
        refreshInFlight = request.finally(() => {
            refreshInFlight = null;
        });
        actionNotice = '';
        setRefreshState('loading', REFRESH_LOADING_MESSAGE);
        return refreshInFlight;
    };

    const requestSessionRefresh = () =>
        pendingOpenRefresh?.promise || refreshSessions();

    const scheduleOpenRevalidation = () => {
        if (refreshInFlight) return refreshInFlight;
        if (pendingOpenRefresh) return pendingOpenRefresh.promise;

        let resolvePending;
        const promise = new Promise(resolve => {
            resolvePending = resolve;
        });
        const pending = {
            promise,
            resolve: resolvePending,
            cancel: null,
        };
        pendingOpenRefresh = pending;
        pending.cancel = scheduleAfterPaintFn(() => {
            if (pendingOpenRefresh !== pending) return;
            pendingOpenRefresh = null;
            if (destroyed || !popover) {
                pending.resolve({
                    ok: false,
                    cancelled: true,
                    running: clock.getRunning(),
                });
                return;
            }
            void refreshSessions().then(pending.resolve);
        });
        return promise;
    };

    const run = async action => {
        cancelPendingOpenRefresh();
        try {
            const result = await action();
            actionNotice = mutationResultNotice(result);
            onMutationResult(result);
            renderSurfaces();
            return result;
        } catch (error) {
            console.error('[roam-logbook]', error);
            actionNotice = mutationResultNotice(error);
            onMutationResult(error);
        }
        renderSurfaces();
    };

    const surfaceOptions = () => {
        const scope = 'session-surface';
        return {
            titleId: POPOVER_TITLE_ID,
            staleHours: staleHours(),
            notices: surfaceNotices(),
            clockOutAllConfirm: confirmation?.isArmed('clock-out-all', scope),
            refreshState,
            onRefresh: requestSessionRefresh,
            onOpenTask: (taskUid, event) => {
                if (event?.shiftKey) {
                    event.preventDefault();
                    event.stopPropagation();
                    cancelPendingOpenRefresh();
                    void openBlockInRightSidebar(taskUid).then(result => {
                        if (result?.ok) {
                            closePopover({ restoreFocus: false });
                            return;
                        }
                        if (!result?.ok) {
                            actionNotice = result.message || 'Could not open this Task in the right sidebar.';
                            renderSurfaces();
                        }
                    });
                    return;
                }
                event?.stopPropagation();
                closePopover({ restoreFocus: false });
                void openBlock(taskUid);
            },
            onFocusRecent: entry => void run(() => clock.clockIn(entry.taskUid, { source: 'active-work-switch' })),
            onCheckOut: entry => run(() => clock.clockOut(entry.clockUid)),
            onDiscard: entry => {
                if (discardConfirmUid !== entry.clockUid) {
                    discardConfirmUid = entry.clockUid;
                    if (discardConfirmTimer) clearTimeout(discardConfirmTimer);
                    discardConfirmTimer = setTimeout(() => {
                        resetDiscardConfirmation();
                        renderSurfaces();
                    }, 5000);
                    renderSurfaces();
                    return;
                }
                resetDiscardConfirmation();
                void run(() => clock.discardClock(entry.clockUid));
            },
            onOpenDashboard: () => {
                closePopover({ restoreFocus: false });
                onOpenDashboard?.(buttonNode);
            },
            onClockOutAll: () => {
                if (!confirmation?.arm('clock-out-all', scope)) {
                    renderSurfaces();
                    return;
                }
                resetClockOutConfirmation();
                void run(() => clock.clockOutAll());
            },
            onClose: null,
            discardingClockUid: discardConfirmUid,
        };
    };

    function renderPopover() {
        if (!popover) return;
        ensureThemeRuntime();
        const model = sessionModel();
        const refreshStatus = clock.getLastRefreshStatus();
        const options = surfaceOptions();
        options.openLineWindowMinutes = model.openLineWindowMinutes;
        options.emptyMessage =
            refreshState.state === 'loading'
                ? 'Refreshing Active Work state from graph…'
                : refreshStatus.ok
                  ? 'No Timing Line is active. Right-click a TODO bullet and choose Plugins → Logbook: Clock in.'
                  : 'Active Work state could not be confirmed. Retry after Roam finishes syncing.';
        renderSessionSurface(popover, model, options);
        themeRuntime?.apply(popover);
    }

    const syncSurfaceAria = expanded => {
        buttonNode?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        buttonNode?.setAttribute('aria-controls', POPOVER_ID);
    };

    const togglePopover = event => {
        if (event?.shiftKey) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        if (popover) {
            closePopover();
            return;
        }
        setRefreshState('loading', REFRESH_LOADING_MESSAGE);
        popover = el('div', 'bp3-card bp3-elevation-3 rlb-popover');
        popover.id = POPOVER_ID;
        popover.setAttribute('role', 'dialog');
        popover.setAttribute('aria-modal', 'true');
        popover.setAttribute('aria-labelledby', POPOVER_TITLE_ID);
        document.body.appendChild(popover);
        ensureThemeRuntime().apply(popover);
        buttonNode?.setAttribute('aria-haspopup', 'dialog');
        syncSurfaceAria(POPOVER_ID);
        renderPopover();
        positionPopover();
        document.addEventListener('mousedown', onDocumentMouseDown, true);
        document.addEventListener('keydown', onPopoverKeyDown, true);
        window.addEventListener('resize', closePopover);
        const firstFocusable = popover.querySelector('button');
        if (firstFocusable) firstFocusable.focus();
        else {
            popover.tabIndex = -1;
            popover.focus();
        }
        void scheduleOpenRevalidation();
    };

    confirmation?.setOnChange(() => {
        renderSurfaces();
    });

    // ---- widget ----

    const syncButtonLayout = mode => {
        if (layoutMode === mode) return;
        if (mode === 'idle') buttonNode.replaceChildren(iconNode);
        else if (mode === 'active') buttonNode.replaceChildren(iconNode, parallelNode);
        else if (mode === 'parallel') buttonNode.replaceChildren(timeNode, separatorNode, parallelNode);
        else buttonNode.replaceChildren(timeNode);
        layoutMode = mode;
    };

    const renderButton = (
        entries = clock.getRunning(),
        now = nowDate(),
        { reconcile = true } = {}
    ) => {
        if (!buttonNode) return;
        const derived = clock.getActiveWork(now);
        const focused = derived.focused || entries[0] || null;
        const activeWork = focused === derived.focused
            ? derived
            : focused
              ? { ...derived, focused, items: [focused, ...derived.items], count: derived.count + (derived.items.some(item => item.taskUid === focused.taskUid) ? 0 : 1) }
              : derived;
        const composition = activeWorkDescription(
            focused ? 1 : 0,
            activeWork.recent.length,
            activeWork.windowMinutes
        );
        const focusedEntries = focused ? [focused] : [];
        const running = focusedEntries.length > 0;
        if (running && reconcile) pomodoro.reconcileCycle(focusedEntries, { now });
        const cycleElapsed = pomodoro.cycleElapsedMs(now);
        const overrun = pomodoro.isCycleOverrun(now);
        const stale = findStaleClocks(focusedEntries, now, staleHours()).length > 0;
        const loadTone = sessionLoadTone(activeWork.count);
        const signature = activeWork.items
            .map(item => `${item.activeKind || 'focused'}:${item.taskUid}`)
            .join('|');
        const activeChanged = signature !== activeSignature;
        activeSignature = signature;
        parallelNode.className =
            loadTone === 'neutral'
                ? 'rlb-topbar__parallel'
                : `rlb-topbar__parallel rlb-topbar__parallel--load-${loadTone}`;

        if (!running) {
            const hasActiveWork = activeWork.count > 0;
            buttonNode.classList.toggle('rlb-topbar__button--icon-only', !hasActiveWork);
            buttonNode.classList.toggle('rlb-topbar__button--active', hasActiveWork);
            buttonNode.classList.remove('rlb-topbar__button--parallel');
            iconNode.className = 'bp3-icon bp3-icon-history rlb-topbar__icon';
            timeNode.textContent = '';
            timeNode.className = 'rlb-topbar__time';
            parallelNode.textContent = hasActiveWork ? activeCount(activeWork.count) : '';
            separatorNode.textContent = '';
            syncButtonLayout(hasActiveWork ? 'active' : 'idle');
            buttonNode.title = hasActiveWork
                ? `${activeCount(activeWork.count)}\n${composition}\nNo Timing Line is active. Click for details.`
                : `${activeCount(0)}\n${composition}\nNo Active Work is available. Click for details.`;
            buttonNode.setAttribute('aria-label', buttonNode.title);
            if (activeChanged && popover) renderPopover();
            return;
        }

        buttonNode.classList.remove('rlb-topbar__button--icon-only');
        buttonNode.classList.remove('rlb-topbar__button--active');
        const [first] = focusedEntries;
        // The topbar is a timing-state entry, not a task summary. Overrun
        // outranks stale, matching the previous status priority without putting
        // either state on the whole button.
        const state = overrun ? 'overrun' : stale ? 'stale' : 'neutral';
        timeNode.className = `rlb-topbar__time rlb-topbar__time--${state}`;
        timeNode.textContent = formatElapsed(cycleElapsed);
        // Keep the Active count visible even for a single focused Task. The
        // icon-only state is reserved for zero focused Tasks.
        buttonNode.classList.add('rlb-topbar__button--parallel');
        parallelNode.textContent = activeCount(activeWork.count);
        separatorNode.textContent = '';
        syncButtonLayout('parallel');

        if (activeWork.count > 1) {
            const threshold = pomodoro.cycleThresholdMinutes();
            buttonNode.title =
                `${activeCount(activeWork.count)}\n` +
                `${composition}\n` +
                `Primary timer: ${first.title}\n` +
                `Shared cycle ${formatElapsed(cycleElapsed)}` +
                (threshold
                    ? `\nPomodoro cycle ${formatElapsed(threshold * 60_000)} — ${
                          overrun
                              ? `over by ${formatElapsed(pomodoro.cycleOverrunMs(now))}`
                              : `${formatElapsed(threshold * 60_000 - cycleElapsed)} left`
                      }`
                    : '') +
                (overrun ? '\nA Pomodoro is over its target.' : '') +
                (!overrun && stale ? '\nA clock is likely forgotten.' : '') +
                '\nClick for all clock details.';
        } else {
            const totalMinutes = (first.priorMinutes || 0) + Math.floor((now - first.start.getTime()) / 60_000);
            const threshold = pomodoro.cycleThresholdMinutes();
            buttonNode.title =
                `${activeCount(activeWork.count)}\n` +
                `${composition}\n` +
                `Clocked in: ${first.title}\n` +
                `Shared cycle ${formatElapsed(cycleElapsed)} · ${formatMinutesHuman(totalMinutes)} on this task in total` +
                (threshold
                    ? `\nPomodoro cycle ${formatElapsed(threshold * 60_000)} — ${
                          overrun
                              ? `over by ${formatElapsed(pomodoro.cycleOverrunMs(now))}`
                              : `${formatElapsed(threshold * 60_000 - cycleElapsed)} left`
                      }`
                    : '') +
                (!overrun && stale ? '\nThis clock is likely forgotten.' : '');
        }
        buttonNode.setAttribute('aria-label', buttonNode.title);
        if (activeChanged && popover) renderPopover();
    };

    const tick = () => {
        tickCount += 1;
        const entries = clock.getRunning();
        const now = nowDate();
        const activeWork = clock.getActiveWork(now);
        renderButton(entries, now);
        updateSessionSurfaceElapsed(
            popover,
            entries,
            now,
            activeWork.recent,
            activeWork.windowMinutes
        );
    };

    const stopTicker = () => {
        if (ticker !== null) clearIntervalFn(ticker);
        ticker = null;
    };

    const startTicker = () => {
        if (destroyed || ticker !== null) return;
        ticker = setIntervalFn(tick, 1000);
    };

    const stopAttachmentObservers = () => {
        observer?.disconnect();
        observer = null;
        hostObserver?.disconnect();
        hostObserver = null;
        recoveryObserver?.disconnect();
        recoveryObserver = null;
        outerRecoveryObserver?.disconnect();
        outerRecoveryObserver = null;
        recoveryTarget = null;
        outerRecoveryTarget = null;
        observedTopbar = null;
    };

    const build = () => {
        container = el('div', 'rlb-topbar');
        container.id = WIDGET_ID;

        iconNode = el('span', 'bp3-icon bp3-icon-history rlb-topbar__icon');
        parallelNode = el('span', 'rlb-topbar__parallel');
        separatorNode = el('span', 'rlb-topbar__separator');
        separatorNode.setAttribute('aria-hidden', 'true');
        timeNode = el('span', 'rlb-topbar__time');

        buttonNode = button('bp3-button bp3-minimal rlb-topbar__button', '', togglePopover);
        buttonNode.setAttribute('aria-haspopup', 'dialog');
        buttonNode.setAttribute('aria-controls', POPOVER_ID);
        buttonNode.setAttribute('aria-expanded', 'false');
        buttonNode.appendChild(iconNode);
        container.appendChild(buttonNode);
        renderButton();
    };

    const attach = () => {
        if (destroyed) return;
        attachCount += 1;
        if (!showTopbarWidget()) {
            stopTicker();
            stopAttachmentObservers();
            remove();
            return;
        }
        const topbar = document.querySelector(TOPBAR_SELECTOR);
        observeRecoveryTarget(topbar);
        if (!topbar) {
            stopTicker();
            return;
        }
        startTicker();
        if (topbar !== observedTopbar) observeTopbar(topbar);
        if (!container) build();

        const placement = afterNavigation(topbar);
        syncTopbarLayout(placement);
        if (
            container.parentNode !== placement.parent ||
            container.nextSibling !== placement.before
        ) {
            placement.parent.insertBefore(container, placement.before);
        }
    };

    const isPluginNode = node =>
        Boolean(
            node &&
                (node === container ||
                    node === popover ||
                    container?.contains(node) ||
                    popover?.contains(node))
        );

    const hasNonPluginMutation = record => {
        if (isPluginNode(record.target)) return false;
        const nodes = [...record.addedNodes, ...record.removedNodes];
        return nodes.length === 0 || nodes.some(node => !isPluginNode(node));
    };

    const touchesTopbar = record => {
        if (isPluginNode(record.target)) return false;
        const nodes = [...record.addedNodes, ...record.removedNodes];
        // Inserting or updating our widget is expected to happen inside the
        // observed host. Do not let that self-mutation trigger a re-attach.
        if (nodes.length > 0 && nodes.every(isPluginNode)) return false;
        if (record.target?.closest?.(TOPBAR_SELECTOR)) return true;
        return nodes.some(
            node => node?.matches?.(TOPBAR_SELECTOR) || node?.querySelector?.(TOPBAR_SELECTOR)
        );
    };

    const scheduleAttach = () => {
        if (destroyed || attachQueued) return;
        attachQueued = true;
        const flush = () => {
            attachQueued = false;
            attachTimer = null;
            attach();
        };
        if (typeof queueMicrotask === 'function') queueMicrotask(flush);
        else attachTimer = setTimeout(flush, 0);
    };

    const observeTopbar = topbar => {
        hostObserver?.disconnect();
        observedTopbar = topbar;
        hostObserver = new MutationObserver(records => {
            if (records.some(hasNonPluginMutation)) scheduleAttach();
        });
        // The topbar is the stable host seam. We only observe its descendants;
        // the recovery observer below is filtered to host replacement signals.
        hostObserver.observe(topbar, { childList: true, subtree: true });
    };

    /**
     * Observe only the shell that owns the topbar after the host is found.
     *
     * A body-wide subtree observer is useful during the initial boot, when
     * Roam has not mounted its shell yet. Once the shell exists, its immediate
     * parent is enough to notice replacement; the topbar's own descendants are
     * handled by hostObserver above. This keeps ordinary page mutations out of
     * the re-attach path altogether.
     */
    const observeRecoveryTarget = topbar => {
        const target = topbar?.parentElement || document.body;
        const subtree = !topbar;
        const outerTarget = topbar?.parentElement?.parentElement || null;
        if (
            recoveryObserver &&
            recoveryTarget === target &&
            outerRecoveryTarget === outerTarget
        ) return;
        recoveryObserver?.disconnect();
        outerRecoveryObserver?.disconnect();
        recoveryObserver = new MutationObserver(records => {
            if (records.some(touchesTopbar)) scheduleAttach();
        });
        recoveryTarget = target;
        recoveryObserver.observe(target, { childList: true, ...(subtree ? { subtree: true } : {}) });

        // Observe only the direct outer shell. This catches replacement of the
        // navigation wrapper while avoiding a document.body subtree observer once
        // Roam's topbar has been found.
        outerRecoveryTarget = outerTarget;
        if (outerTarget && outerTarget !== target) {
            outerRecoveryObserver = new MutationObserver(records => {
                if (records.some(touchesTopbar)) scheduleAttach();
            });
            outerRecoveryObserver.observe(outerTarget, { childList: true });
        } else {
            outerRecoveryObserver = null;
        }
        observer = recoveryObserver;
    };

    /**
     * The node to insert before, so the widget lands just past the navigation.
     *
     * Roam currently nests Back/Forward inside a left-navigation wrapper, but
     * older layouts expose the buttons directly. Search by observable control
     * signals, then resolve the match back to the smallest navigation cluster
     * whose parent also owns the main controls.
     */
    const afterNavigation = topbar => {
        const descendants = [...topbar.querySelectorAll('*')].filter(
            node => node !== container && !container?.contains(node)
        );
        const mainIndex = descendants.findIndex(isMainControl);
        const leading = mainIndex >= 0 ? descendants.slice(0, mainIndex) : descendants;
        const signal =
            leading.find(node => FORWARD_PATTERN.test(controlSignals(node))) ||
            leading.find(node => BACK_PATTERN.test(controlSignals(node))) ||
            leading.find(node => MENU_PATTERN.test(controlSignals(node)));

        if (signal) {
            const anchor = navigationCluster(signal, topbar);
            const next = anchor.nextSibling;
            return {
                parent: anchor.parentNode,
                before: next === container ? container.nextSibling : next,
            };
        }

        // Unknown layouts still stay on the left. Prefer the first recognisable
        // main/search surface; if none exists, preserve the leading control and
        // insert after it rather than falling through to the far-right actions.
        const main = descendants.find(isMainControl);
        if (main) {
            const boundary = surfaceChild(main, topbar);
            return { parent: boundary.parentNode, before: boundary };
        }

        let surface = topbar;
        while (
            surface.children.length === 1 &&
            surface.firstElementChild !== container &&
            surface.firstElementChild.children.length > 0
        ) {
            surface = surface.firstElementChild;
        }
        return { parent: surface, before: surface.firstElementChild?.nextSibling ?? null };
    };

    /** Classes and accessible metadata are more stable than one Roam class name. */
    const controlSignals = element =>
        [
            element.className,
            element.getAttribute?.('data-icon'),
            element.getAttribute?.('aria-label'),
            element.getAttribute?.('title'),
            element.getAttribute?.('data-name'),
        ]
            .filter(value => typeof value === 'string')
            .join(' ')
            .replaceAll('_', '-')
            .toLowerCase();

    const isMainControl = element =>
        element.matches?.('input, textarea, select, [contenteditable="true"]') ||
        MAIN_CONTROL_PATTERN.test(controlSignals(element));

    const containsMainControl = element =>
        isMainControl(element) ||
        Boolean(
            element.querySelector?.('input, textarea, select, [contenteditable="true"]') ||
                [...(element.querySelectorAll?.('*') || [])].some(isMainControl)
        );

    const syncTopbarLayout = placement => {
        for (const host of layoutHosts) host.classList.remove('rlb-topbar__layout');
        for (const host of searchHosts) host.classList.remove('rlb-topbar__search');
        layoutHosts.clear();
        searchHosts.clear();

        const host = placement.parent;
        if (!host?.classList) return;
        host.classList.add('rlb-topbar__layout');
        layoutHosts.add(host);
        for (const child of host.children) {
            if (child === container || !containsMainControl(child)) continue;
            child.classList.add('rlb-topbar__search');
            searchHosts.add(child);
            break;
        }
    };

    /** Climb through icon/button wrappers, but stop before the main/right shell. */
    const navigationCluster = (signal, topbar) => {
        let anchor = signal.closest?.('button, a, [role="button"]') || signal;
        while (
            anchor.parentElement &&
            anchor.parentElement !== topbar &&
            ![...anchor.parentElement.querySelectorAll('*')].some(isMainControl)
        ) {
            anchor = anchor.parentElement;
        }
        return anchor;
    };

    /** Resolve a nested search/main signal to the sibling owned by its layout surface. */
    const surfaceChild = (signal, topbar) => {
        let boundary = signal;
        while (
            boundary.parentElement &&
            boundary.parentElement !== topbar &&
            !boundary.previousElementSibling
        ) {
            boundary = boundary.parentElement;
        }
        return boundary;
    };

    const remove = () => {
        closePopover();
        for (const host of layoutHosts) host.classList.remove('rlb-topbar__layout');
        for (const host of searchHosts) host.classList.remove('rlb-topbar__search');
        layoutHosts.clear();
        searchHosts.clear();
        container?.remove();
    };

    return {
        mount() {
            ensureThemeRuntime();
            unsubscribe = clock.subscribe(() => {
                renderButton();
                renderSurfaces();
            });
            attach();
        },
        refresh: attach,
        getPerformanceSnapshot() {
            return { attachCount, tickCount };
        },
        unmount() {
            destroyed = true;
            cancelPendingOpenRefresh();
            if (refreshClearTimer) clearTimeout(refreshClearTimer);
            refreshClearTimer = null;
            refreshInFlight = null;
            unsubscribe?.();
            unsubscribe = null;
            stopTicker();
            stopAttachmentObservers();
            attachQueued = false;
            if (attachTimer) clearTimeout(attachTimer);
            attachTimer = null;
            remove();
            container = null;
            themeRuntime?.release();
            themeRuntime = null;
        },
    };
}
