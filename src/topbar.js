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
import { formatElapsed } from './time.js';
import { findStaleClocks } from './stats.js';
import { staleHours } from './settings.js';
import { openBlock, openBlockInRightSidebar, readTodayTodoSnapshot } from './roam.js';
import { GRAPH_SYNC_RETRY_NOTICE, mutationResultNotice } from './action-result.js';
import {
    buildSessionSurfaceModel,
    renderSessionSurface,
    sessionCount,
    updateSessionSurfaceElapsed,
} from './session-surface.js';
import { createSessionPopover } from './session-popover.js';
import { createTopbarHost } from './topbar-host.js';
import { afterNavigation, syncTopbarLayout } from './topbar-placement.js';
import { createRefreshState, REFRESH_MESSAGES } from './refresh-state.js';
import { acquireThemeRuntime, applyRoamThemePalette } from './theme.js';
import { buildTodayTodoTree, currentTodayPath, flattenTodayRows } from './today-todos.js';

const WIDGET_ID = 'roam-logbook-topbar';
const POPOVER_ID = 'roam-logbook-popover';
const POPOVER_TITLE_ID = 'roam-logbook-popover-title';
const TOPBAR_STATUS_ID = 'roam-logbook-topbar-status';
const TOPBAR_LABEL = 'Open Roam Logbook Active Work';
const TOPBAR_TITLE = 'Open Active Work details';
const TOPBAR_SELECTOR = '.rm-topbar';
const TOPBAR_REFRESH_MESSAGES = {
    ...REFRESH_MESSAGES.activeWork,
    loading: 'Refreshing Active Work state from graph…',
};

export { sessionCount };
export const activeCount = count => `${count} Thread${count === 1 ? '' : 's'}`;
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
    let statusNode = null;
    let popover = null;
    let sessionPopover = null;
    let topbarHost = null;
    let ticker = null;
    let unsubscribe = null;
    let destroyed = false;
    let tickCount = 0;
    let layoutMode = null;
    let statusSignature = '';
    let actionNotice = '';
    let pendingOpenRefresh = null;
    let refreshState = { state: 'idle', message: '' };
    let activeSignature = '';
    let themeRuntime = null;
    let surfaceView = 'threads';
    let todaySnapshot = null;
    let todayStatus = 'idle';
    let todayNotice = '';
    let todayExpanded = new Set();
    let todayRequestToken = 0;
    const layoutHosts = new Set();
    const searchHosts = new Set();
    const layoutHostDisplay = new Map();

    const nowDate = () => {
        const value = nowFn();
        return value instanceof Date ? value : new Date(value);
    };

    // ---- popover ----

    const resetPopoverState = () => {
        cancelPendingOpenRefresh();
        confirmation?.reset();
        actionNotice = '';
        surfaceView = 'threads';
        todaySnapshot = null;
        todayStatus = 'idle';
        todayNotice = '';
        todayExpanded = new Set();
        todayRequestToken += 1;
    };

    const cancelPendingOpenRefresh = () => {
        const pending = pendingOpenRefresh;
        if (!pending) return;
        pendingOpenRefresh = null;
        pending.cancel?.();
        if (refreshState.state === 'loading' && !refreshRuntime.inFlight) {
            refreshRuntime.reset();
        }
        pending.resolve({
            ok: false,
            cancelled: true,
            running: clock.getRunning(),
        });
    };

    const closePopover = ({ restoreFocus = true } = {}) => {
        if (sessionPopover?.isOpen) {
            sessionPopover.close({ restoreFocus });
            return;
        }
        resetPopoverState();
        if (restoreFocus && buttonNode?.isConnected) buttonNode.focus();
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

    const todayModel = () => {
        if (!todaySnapshot) return { status: todayStatus, roots: [], nodes: [], count: 0 };
        const tree = buildTodayTodoTree(todaySnapshot.roots, {
            referenceStrings: todaySnapshot.referenceStrings,
        });
        return { ...tree, status: todayStatus, pageTitle: todaySnapshot.pageTitle };
    };

    const todayRows = model => {
        if (!model?.nodes?.length) return [];
        const currentUid = clock.getActiveWork(nowDate()).focused?.taskUid || null;
        return flattenTodayRows(model, {
            expanded: todayExpanded,
            currentPath: currentTodayPath(model, currentUid),
        });
    };

    const surfaceNotices = () =>
        [
            ...(actionNotice ? [{ message: actionNotice, role: 'alert' }] : []),
            ...(!actionNotice && clock.getNotice()
                ? [{ message: clock.getNotice(), role: 'status' }]
                : []),
            ...(todayNotice ? [{ message: todayNotice, role: 'status' }] : []),
        ];

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

    const refreshRuntime = createRefreshState({
        onRender: state => {
            refreshState = state;
            renderRefreshState();
        },
        messages: TOPBAR_REFRESH_MESSAGES,
    });

    const refreshSessions = () => {
        actionNotice = '';
        return refreshRuntime.run(
            async () => {
                const result = await clock.refreshResult();
                if (!result?.ok) return result;
                const snapshot = clock.getEntriesSnapshot();
                const reconciliation = await clock.reconcileOpenClocks({
                    source: 'refresh',
                    entries: snapshot,
                });
                return { ...result, reconciliation };
            },
            {
                isSuccess: result => result?.ok,
                onFailure: result => {
                    actionNotice =
                        mutationResultNotice(result) ||
                        clock.getNotice() ||
                        GRAPH_SYNC_RETRY_NOTICE;
                },
                onError: error => {
                    console.error('[roam-logbook] could not refresh Session surface', error);
                    actionNotice =
                        mutationResultNotice(error) || clock.getNotice() || GRAPH_SYNC_RETRY_NOTICE;
                    return {
                        ok: false,
                        uncertain: true,
                        running: clock.getRunning(),
                        error,
                    };
                },
            }
        );
    };

    const loadToday = async ({ force = false } = {}) => {
        if (!popover) return { ok: false, cancelled: true };
        if (!force && todaySnapshot) return { ok: true, cached: true, snapshot: todaySnapshot };
        const token = ++todayRequestToken;
        // Preserve a successful snapshot while it revalidates. The shared
        // Refresh control already exposes loading state, so blanking Today here
        // would create a needless flash and make the cache look unreliable.
        if (!todaySnapshot) todayStatus = 'loading';
        todayNotice = '';
        renderSurfaces();
        const result = await Promise.resolve().then(() => readTodayTodoSnapshot(nowDate()));
        if (token !== todayRequestToken || !popover) return { ok: false, cancelled: true };
        if (result.ok) {
            todaySnapshot = result;
            todayStatus = result.status;
            todayNotice = '';
        } else {
            // A read failure must not turn the last known task pool into an
            // empty state. Keep the snapshot and expose a quiet notice.
            todayStatus = todaySnapshot?.status || 'error';
            todayNotice = todaySnapshot
                ? 'Today tasks could not be refreshed; showing the last saved view.'
                : 'Today tasks could not be read. Refresh to try again.';
        }
        renderSurfaces();
        return result;
    };

    const requestSessionRefresh = () => {
        const current = pendingOpenRefresh?.promise || refreshSessions();
        const today = loadToday({ force: true });
        return Promise.all([current, today]).then(([result]) => result);
    };

    const scheduleOpenRevalidation = () => {
        if (refreshRuntime.inFlight) return refreshRuntime.inFlight;
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
            void loadToday();
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

    const surfaceOptions = model => {
        const scope = 'session-surface';
        const today = todayModel();
        const discarding = model?.rows?.find(row =>
            confirmation?.isArmed(`discard:${row.entry.clockUid}`, scope)
        );
        return {
            titleId: POPOVER_TITLE_ID,
            staleHours: staleHours(),
            notices: surfaceNotices(),
            clockOutAllConfirm: confirmation?.isArmed('clock-out-all', scope),
            refreshState,
            onRefresh: requestSessionRefresh,
            view: surfaceView,
            todayModel: today,
            todayRows: todayRows(today),
            currentTaskUid: clock.getActiveWork(nowDate()).focused?.taskUid || null,
            onSwitchView: view => {
                surfaceView = view === 'today' ? 'today' : 'threads';
                renderSurfaces();
                if (surfaceView === 'today') void loadToday();
            },
            onToggleToday: uid => {
                const next = new Set(todayExpanded);
                if (next.has(uid)) next.delete(uid);
                else next.add(uid);
                todayExpanded = next;
                renderSurfaces();
            },
            onExpandAllToday: () => {
                // The batch action is intentionally derived from the current
                // model, so the local expansion state can contain parent UIDs
                // only; task leaves and stale graph UIDs never enter it.
                todayExpanded = new Set(
                    (today.nodes || [])
                        .filter(node => node?.children?.length > 0)
                        .map(node => node.uid)
                );
                renderSurfaces();
            },
            onCollapseAllToday: () => {
                // flattenTodayRows() re-applies the current Timing Line path
                // as forced-open, so clearing the local set collapses every
                // other branch while keeping that active branch visible.
                todayExpanded = new Set();
                renderSurfaces();
            },
            onStartToday: taskUid => void run(() => clock.clockIn(taskUid, { source: 'active-work-switch' })),
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
                if (!confirmation?.arm(`discard:${entry.clockUid}`, scope)) {
                    renderSurfaces();
                    return;
                }
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
                void run(() => clock.clockOutAll());
            },
            onClose: null,
            discardingClockUid: discarding?.entry.clockUid || null,
        };
    };

    function renderPopover() {
        if (!popover) return;
        ensureThemeRuntime();
        const model = sessionModel();
        const refreshStatus = clock.getLastRefreshStatus();
        const options = surfaceOptions(model);
        options.openLineWindowMinutes = model.openLineWindowMinutes;
        options.emptyMessage =
            refreshState.state === 'loading'
                ? TOPBAR_REFRESH_MESSAGES.loading
                : refreshStatus.ok
                  ? 'No Timing Line is active. Right-click a TODO bullet and choose Plugins → Logbook: Clock in.'
                  : 'Active Work state could not be confirmed. Retry after Roam finishes syncing.';
        options.todayNotice = todayNotice;
        renderSessionSurface(popover, model, options);
        themeRuntime?.apply(popover);
    }

    sessionPopover = createSessionPopover({
        id: POPOVER_ID,
        titleId: POPOVER_TITLE_ID,
        getTrigger: () => buttonNode,
        onBeforeOpen: () => {
            refreshRuntime.set('loading', TOPBAR_REFRESH_MESSAGES.loading);
        },
        onRender: root => {
            popover = root;
            ensureThemeRuntime();
            renderPopover();
        },
        onBeforeClose: () => {
            popover = null;
            resetPopoverState();
        },
        onOpened: () => {
            void scheduleOpenRevalidation();
        },
    });

    const togglePopover = event => sessionPopover?.toggle(event);

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

    const syncTopbarStatus = ({ running, state, count }) => {
        const normalizedCount = Number.isFinite(Number(count)) ? Math.max(0, Math.floor(Number(count))) : 0;
        const semanticState = running ? state : 'idle';
        const signature = `${semanticState}:${normalizedCount}`;
        if (!statusNode || statusSignature === signature) return;
        statusSignature = signature;

        const countLabel = activeCount(normalizedCount);
        const message = !running
            ? normalizedCount > 0
                ? `${countLabel}. No Timing Line is active.`
                : 'No Active Work.'
            : semanticState === 'overrun'
              ? `${countLabel}. Pomodoro is over its target.`
              : semanticState === 'stale'
                ? `${countLabel}. A clock is likely forgotten.`
                : `${countLabel}. Timing is running.`;
        statusNode.textContent = message;
    };

    const renderButton = (
        entries = clock.getRunning(),
        now = nowDate(),
        { reconcile = true, activeWork: suppliedActiveWork = null } = {}
    ) => {
        if (!buttonNode) return;
        const derived = suppliedActiveWork || clock.getActiveWork(now);
        const focused = derived.focused || entries[0] || null;
        const activeWork = focused === derived.focused
            ? derived
            : focused
              ? { ...derived, focused, items: [focused, ...derived.items], count: derived.count + (derived.items.some(item => item.taskUid === focused.taskUid) ? 0 : 1) }
              : derived;
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
        const nextParallelClass =
            loadTone === 'neutral'
                ? 'rlb-topbar__parallel'
                : `rlb-topbar__parallel rlb-topbar__parallel--load-${loadTone}`;
        if (parallelNode.className !== nextParallelClass) {
            parallelNode.className = nextParallelClass;
        }

        if (!running) {
            const hasActiveWork = activeWork.count > 0;
            buttonNode.classList.toggle('rlb-topbar__button--icon-only', !hasActiveWork);
            buttonNode.classList.toggle('rlb-topbar__button--active', hasActiveWork);
            buttonNode.classList.remove('rlb-topbar__button--parallel');
            iconNode.className = 'bp3-icon bp3-icon-history rlb-topbar__icon';
            timeNode.textContent = '';
            if (timeNode.className !== 'rlb-topbar__time') {
                timeNode.className = 'rlb-topbar__time';
            }
            parallelNode.textContent = hasActiveWork ? activeCount(activeWork.count) : '';
            separatorNode.textContent = '';
            syncButtonLayout(hasActiveWork ? 'active' : 'idle');
            syncTopbarStatus({ running: false, state: 'idle', count: activeWork.count });
            if (activeChanged && popover) renderPopover();
            return;
        }

        buttonNode.classList.remove('rlb-topbar__button--icon-only');
        buttonNode.classList.remove('rlb-topbar__button--active');
        // The topbar is a timing-state entry, not a task summary. Overrun
        // outranks stale, matching the previous status priority without putting
        // either state on the whole button.
        const state = overrun ? 'overrun' : stale ? 'stale' : 'neutral';
        const nextTimeClass = `rlb-topbar__time rlb-topbar__time--${state}`;
        if (timeNode.className !== nextTimeClass) timeNode.className = nextTimeClass;
        timeNode.textContent = formatElapsed(cycleElapsed);
        // Keep the Thread count visible even for a single focused Task. The
        // icon-only state is reserved for zero focused Tasks.
        buttonNode.classList.add('rlb-topbar__button--parallel');
        parallelNode.textContent = activeCount(activeWork.count);
        separatorNode.textContent = '';
        syncButtonLayout('parallel');
        syncTopbarStatus({
            running: true,
            state: state === 'neutral' ? 'running' : state,
            count: activeWork.count,
        });
        if (activeChanged && popover) renderPopover();
    };

    const tick = () => {
        tickCount += 1;
        const entries = clock.getRunning();
        const now = nowDate();
        const activeWork = clock.getActiveWork(now);
        renderButton(entries, now, { activeWork });
        updateSessionSurfaceElapsed(
            popover,
            activeWork.focused ? [activeWork.focused] : entries,
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
        buttonNode.setAttribute('aria-label', TOPBAR_LABEL);
        buttonNode.setAttribute('aria-describedby', TOPBAR_STATUS_ID);
        buttonNode.title = TOPBAR_TITLE;

        statusNode = el('span', 'rlb-visually-hidden');
        statusNode.id = TOPBAR_STATUS_ID;
        statusNode.setAttribute('role', 'status');
        statusNode.setAttribute('aria-live', 'polite');
        statusNode.setAttribute('aria-atomic', 'true');

        buttonNode.appendChild(iconNode);
        container.append(buttonNode, statusNode);
        renderButton();
    };

    const attach = topbar => {
        if (destroyed) return;
        themeRuntime?.refresh();
        startTicker();
        if (!container) build();

        const placement = afterNavigation(topbar, { container });
        syncTopbarLayout(placement, {
            container,
            layoutHosts,
            searchHosts,
            layoutHostDisplay,
            documentRef: document,
        });
        if (
            container.parentNode !== placement.parent ||
            container.nextSibling !== placement.before
        ) {
            placement.parent.insertBefore(container, placement.before);
        }
    };

    topbarHost = createTopbarHost({
        selector: TOPBAR_SELECTOR,
        getContainer: () => container,
        getPopover: () => popover,
        isDestroyed: () => destroyed,
        onAttach: attach,
        onMissing: stopTicker,
        onDisabled: () =>
            console.warn('[roam-logbook] Roam topbar host not found; widget disabled'),
        documentRef: document,
        mutationObserver: MutationObserver,
        clearTimeoutFn: clearTimeout,
    });

    const remove = () => {
        closePopover({ restoreFocus: false });
        syncTopbarLayout(null, {
            container,
            layoutHosts,
            searchHosts,
            layoutHostDisplay,
            documentRef: document,
        });
        container?.remove();
    };

    return {
        mount() {
            unsubscribe = clock.subscribe(() => {
                renderButton();
                renderSurfaces();
            });
            topbarHost.attach();
            ensureThemeRuntime();
        },
        refresh: () => topbarHost.refresh(),
        getPerformanceSnapshot() {
            return { ...topbarHost.getPerformanceSnapshot(), tickCount };
        },
        unmount() {
            destroyed = true;
            confirmation?.setOnChange(null);
            cancelPendingOpenRefresh();
            refreshRuntime.dispose();
            unsubscribe?.();
            unsubscribe = null;
            stopTicker();
            topbarHost.stop();
            remove();
            container = null;
            popover = null;
            statusNode = null;
            themeRuntime?.release();
            themeRuntime = null;
        },
    };
}
