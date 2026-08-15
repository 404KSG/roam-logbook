/**
 * The topbar widget: a live counter plus a popover for the open clocks.
 *
 * Roam re-renders its topbar on navigation, so the widget is re-attached from a
 * MutationObserver rather than mounted once.
 */

import * as clock from './clock.js';
import { createConfirmationController } from './confirmation.js';
import { button, el } from './dom.js';
import * as pomodoro from './pomodoro.js';
import * as paused from './paused.js';
import { formatElapsed, formatMinutesHuman, formatStarted } from './time.js';
import { findStaleClocks } from './stats.js';
import { showTopbarWidget, staleHours } from './settings.js';
import { openBlock } from './roam.js';
import { mutationResultNotice } from './action-result.js';

const WIDGET_ID = 'roam-logbook-topbar';
const POPOVER_ID = 'roam-logbook-popover';
const POPOVER_TITLE_ID = 'roam-logbook-popover-title';
const TOPBAR_SELECTOR = '.rm-topbar';

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
    let unsubscribePaused = null;
    let destroyed = false;
    let discardConfirmUid = null;
    let discardConfirmTimer = null;
    let attachQueued = false;
    let attachTimer = null;
    let attachCount = 0;
    let tickCount = 0;
    let layoutMode = null;
    let actionNotice = '';

    const nowDate = () => {
        const value = nowFn();
        return value instanceof Date ? value : new Date(value);
    };

    const taskCount = count => `${count} Task${count === 1 ? '' : 's'}`;
    const sessionCount = count => `${count} Session${count === 1 ? '' : 's'}`;
    const pomodoroLabel = minutes =>
        Number.isInteger(minutes) ? `${minutes}m` : formatElapsed(minutes * 60_000);

    // ---- popover ----

    const resetClockOutConfirmation = () => {
        confirmation?.reset();
    };

    const resetDiscardConfirmation = () => {
        discardConfirmUid = null;
        if (discardConfirmTimer) clearTimeout(discardConfirmTimer);
        discardConfirmTimer = null;
    };

    const closePopover = ({ restoreFocus = true } = {}) => {
        resetClockOutConfirmation();
        resetDiscardConfirmation();
        actionNotice = '';
        popover?.remove();
        popover = null;
        document.removeEventListener('mousedown', onDocumentMouseDown, true);
        document.removeEventListener('keydown', onPopoverKeyDown, true);
        window.removeEventListener('resize', closePopover);
        buttonNode?.setAttribute('aria-expanded', 'false');
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

    /** `12:34 · target 30:00 · 2h 05m total` — the live half of a row's meta line. */
    const rowFigures = (entry, now) => {
        const target = pomodoro.targetMinutes(entry.clockUid);
        const elapsed = now - entry.start.getTime();
        const total = entry.priorMinutes + Math.floor(elapsed / 60_000);
        return (
            formatElapsed(elapsed) +
            (target ? ` · target ${formatElapsed(target * 60_000)}` : '') +
            ` · ${formatMinutesHuman(total)} total`
        );
    };

    const runningRow = (entry, now = nowDate()) => {
        const overrun = pomodoro.isOverrun(entry, now);
        const row = el('div', `rlb-run${overrun ? ' rlb-run--overrun' : ''}`);

        const body = el('div', 'rlb-run__body');
        const taskLabel = `Open this block: ${entry.title}`;
        const title = button(
            'bp3-button bp3-minimal bp3-icon-document-open rlb-run__title',
            entry.title,
            () => {
                closePopover();
                void openBlock(entry.taskUid);
            },
            { title: taskLabel }
        );
        const started = formatStarted(entry.start, new Date(now));
        const startedDetails =
            `Started ${started.raw}` + (entry.pageTitle ? ` · Page: ${entry.pageTitle}` : '');
        const meta = el('div', 'rlb-run__meta');
        const primary = el('div', 'rlb-run__meta-line rlb-run__meta-primary', rowFigures(entry, now));
        const startedNode = el(
            'time',
            'rlb-run__meta-line rlb-run__started',
            started.valid ? `${started.dateLabel} ${started.timeLabel}` : started.raw
        );
        startedNode.title = startedDetails;
        startedNode.setAttribute('aria-label', startedDetails);
        if (started.datetime) startedNode.dateTime = started.datetime;
        meta.append(primary, startedNode);
        meta.dataset.clockUid = entry.clockUid;
        body.append(title, meta);

        const actions = el('div', 'rlb-run__actions');
        const discarding = discardConfirmUid === entry.clockUid;
        const discardTitle = discarding
            ? 'Confirm discard of this CLOCK entry'
            : 'Discard this CLOCK entry (cannot be undone)';
        const discard = button(
            `bp3-button bp3-minimal bp3-small bp3-icon-trash${discarding ? ' bp3-intent-danger' : ''}`,
            '',
            () => {
                if (!discarding) {
                    discardConfirmUid = entry.clockUid;
                    if (discardConfirmTimer) clearTimeout(discardConfirmTimer);
                    discardConfirmTimer = setTimeout(() => {
                        resetDiscardConfirmation();
                        renderPopover();
                    }, 5000);
                    renderPopover();
                    return;
                }
                resetDiscardConfirmation();
                void run(() => clock.discardClock(entry.clockUid));
            },
            { title: discardTitle }
        );
        discard.dataset.action = 'discard';
        actions.append(
            button(
                'bp3-button bp3-minimal bp3-small bp3-icon-stop rlb-run__stop',
                '',
                () => void run(() => clock.clockOut(entry.clockUid)),
                { title: 'Clock out this Session' }
            ),
            discard
        );
        actions.firstElementChild.dataset.action = 'clock-out';

        row.append(body, actions);
        return row;
    };

    const run = async action => {
        try {
            const result = await action();
            actionNotice = mutationResultNotice(result);
            onMutationResult(result);
            if (popover) renderPopover();
            return result;
        } catch (error) {
            console.error('[roam-logbook]', error);
            actionNotice = mutationResultNotice(error);
            onMutationResult(error);
        }
        if (popover) renderPopover();
    };

    function renderPopover() {
        if (!popover) return;
        const entries = clock.getRunning();
        const pausedItems = paused.getPaused();
        if (entries.length <= 1 && confirmation?.isArmed('clock-out-all', 'popover')) {
            resetClockOutConfirmation();
        }
        popover.replaceChildren();

        const titleText = entries.length
            ? `${sessionCount(entries.length)} Running`
            : pausedItems.length
              ? `${taskCount(pausedItems.length)} Paused`
              : 'Logbook';
        const heading = el('div', 'rlb-popover__title', titleText);
        heading.id = POPOVER_TITLE_ID;
        popover.appendChild(heading);

        if (entries.length === 0 && pausedItems.length === 0) {
            popover.appendChild(
                el(
                    'div',
                    'rlb-popover__empty',
                    'No Session is running. Right-click a TODO bullet and choose Plugins → Logbook: Clock in.'
                )
            );
        } else {
            const stale = findStaleClocks(entries, nowDate(), staleHours());
            if (stale.length > 0) {
                popover.appendChild(
                    el(
                        'div',
                        'rlb-popover__empty bp3-text-small',
                        `${sessionCount(stale.length)} ${stale.length > 1 ? 'have' : 'has'} been open for over ` +
                            `${staleHours()}h — likely forgotten.`
                    )
                );
            }
            for (const entry of entries) popover.appendChild(runningRow(entry, nowDate()));
        }

        if (pausedItems.length > 0) {
            if (entries.length > 0) {
                popover.appendChild(
                    el('div', 'rlb-popover__subheading', `${taskCount(pausedItems.length)} Paused`)
                );
            }
            const list = el('div', 'rlb-paused-list');
            for (const item of pausedItems) {
                list.appendChild(el('div', 'rlb-paused-row', item.title || item.taskUid));
            }
            popover.appendChild(list);
        }

        const notices = actionNotice ? [actionNotice] : [clock.getNotice(), paused.getNotice()].filter(Boolean);
        for (const notice of notices) {
            popover.appendChild(
                el('div', 'rlb-popover__notice bp3-text-small', notice)
            );
        }

        const footer = el('div', 'rlb-popover__footer');
        footer.appendChild(
            button('bp3-button bp3-small', 'Dashboard', () => {
                closePopover({ restoreFocus: false });
                onOpenDashboard?.(buttonNode);
            })
        );
        if (entries.length > 0) {
            footer.appendChild(
                button('bp3-button bp3-small', 'Pause All', () =>
                    run(() => paused.pauseAll())
                )
            );
        }
        if (entries.length > 1) {
            const clockOutAllConfirm = confirmation?.isArmed('clock-out-all', 'popover');
            const confirmLabel = clockOutAllConfirm ? 'Confirm Clock Out All' : 'Clock Out All';
            const confirmTitle = clockOutAllConfirm
                ? 'Confirm permanent Clock Out All'
                : 'Permanently close all running Sessions';
            footer.appendChild(
                button(
                    `bp3-button bp3-small${clockOutAllConfirm ? ' bp3-intent-danger' : ''}`,
                    confirmLabel,
                    () => {
                        if (!confirmation?.arm('clock-out-all', 'popover')) {
                            renderPopover();
                            return;
                        }
                        resetClockOutConfirmation();
                        void run(() => paused.clockOutAll());
                    },
                    { title: confirmTitle }
                )
            );
        }
        if (pausedItems.length > 0) {
            footer.appendChild(button(
                'bp3-button bp3-small',
                'Resume All',
                () => run(() => paused.resumeAll()),
                { title: 'Resume paused Tasks with fresh Sessions' }
            ));
        }
        footer.appendChild(
            button('bp3-button bp3-small bp3-minimal bp3-icon-refresh', '', () => run(async () => clock.refresh()), {
                title: 'Re-read clocks from the graph',
            })
        );
        popover.appendChild(footer);
    }

    const togglePopover = () => {
        if (popover) {
            closePopover();
            return;
        }
        clock.refresh();
        popover = el('div', 'bp3-card bp3-elevation-3 rlb-popover');
        popover.id = POPOVER_ID;
        popover.setAttribute('role', 'dialog');
        popover.setAttribute('aria-modal', 'true');
        popover.setAttribute('aria-labelledby', POPOVER_TITLE_ID);
        document.body.appendChild(popover);
        buttonNode?.setAttribute('aria-haspopup', 'dialog');
        buttonNode?.setAttribute('aria-controls', POPOVER_ID);
        buttonNode?.setAttribute('aria-expanded', 'true');
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
    };

    confirmation?.setOnChange(() => {
        if (popover) renderPopover();
    });

    // ---- widget ----

    const syncButtonLayout = mode => {
        if (layoutMode === mode) return;
        if (mode === 'idle') buttonNode.replaceChildren(iconNode);
        else if (mode === 'parallel') buttonNode.replaceChildren(timeNode, separatorNode, parallelNode);
        else buttonNode.replaceChildren(timeNode);
        layoutMode = mode;
    };

    const renderButton = (entries = clock.getRunning(), now = nowDate()) => {
        if (!buttonNode) return;
        const pausedItems = paused.getPaused();
        const running = entries.length > 0;
        const overrun = entries.some(entry => pomodoro.isOverrun(entry, now));
        const stale = findStaleClocks(entries, now, staleHours()).length > 0;

        if (!running) {
            buttonNode.classList.remove('rlb-topbar__button--parallel');
            iconNode.className = 'bp3-icon bp3-icon-history rlb-topbar__icon';
            timeNode.textContent = '';
            timeNode.className = 'rlb-topbar__time';
            parallelNode.textContent = '';
            separatorNode.textContent = '';
            syncButtonLayout('idle');
            buttonNode.title = pausedItems.length
                ? `${taskCount(pausedItems.length)} Paused — click to resume or review.`
                : 'Logbook — no Session running. Click for details.';
            buttonNode.setAttribute('aria-label', buttonNode.title);
            return;
        }

        const [first] = entries;
        const elapsed = now - first.start.getTime();
        // The topbar is a timing-state entry, not a task summary. Overrun
        // outranks stale, matching the previous status priority without putting
        // either state on the whole button.
        const state = overrun ? 'overrun' : stale ? 'stale' : 'neutral';
        timeNode.className = `rlb-topbar__time rlb-topbar__time--${state}`;
        timeNode.textContent = formatElapsed(elapsed);
        if (entries.length > 1) {
            buttonNode.classList.add('rlb-topbar__button--parallel');
            parallelNode.textContent = sessionCount(entries.length);
            separatorNode.textContent = '';
            syncButtonLayout('parallel');
        } else {
            buttonNode.classList.remove('rlb-topbar__button--parallel');
            parallelNode.textContent = '';
            separatorNode.textContent = '';
            syncButtonLayout('single');
        }

        if (entries.length > 1) {
            buttonNode.title =
                `${sessionCount(entries.length)} Running\n` +
                `Primary timer: ${first.title}\n` +
                `This session ${formatElapsed(elapsed)}` +
                (overrun ? '\nA Pomodoro is over its target.' : '') +
                (!overrun && stale ? '\nA clock is likely forgotten.' : '') +
                '\nClick for all clock details.';
        } else {
            const target = pomodoro.targetMinutes(first.clockUid);
            const totalMinutes = first.priorMinutes + Math.floor(elapsed / 60_000);
            buttonNode.title =
                `${sessionCount(entries.length)} Running\n` +
                `Clocked in: ${first.title}\n` +
                `This session ${formatElapsed(elapsed)} · ${formatMinutesHuman(totalMinutes)} on this task in total` +
                (target
                    ? `\nPomodoro ${pomodoroLabel(target)} — ${
                          overrun
                              ? `over by ${formatElapsed(pomodoro.overrunMs(first, now))}`
                              : `${formatElapsed(target * 60_000 - elapsed)} left`
                      }`
                    : '') +
                (!overrun && stale ? '\nThis clock is likely forgotten.' : '');
        }
        buttonNode.setAttribute('aria-label', buttonNode.title);
    };

    const tick = () => {
        tickCount += 1;
        const entries = clock.getRunning();
        if (entries.length === 0) return;
        const now = nowDate();
        renderButton(entries, now);
        if (popover) {
            const byUid = new Map(entries.map(entry => [entry.clockUid, entry]));
            for (const meta of popover.querySelectorAll('.rlb-run__meta')) {
                const entry = byUid.get(meta.dataset.clockUid);
                if (!entry) continue;
                const primary = meta.querySelector('.rlb-run__meta-primary');
                if (primary) primary.textContent = rowFigures(entry, now);
                // Crossing the target mid-tick has to repaint the row, not just the text.
                const row = meta.closest('.rlb-run');
                if (row) {
                    row.classList.toggle('rlb-run--overrun', pomodoro.isOverrun(entry, now));
                }
            }
        }
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
            observeRecoveryTarget(null);
            remove();
            return;
        }
        const topbar = document.querySelector(TOPBAR_SELECTOR);
        observeRecoveryTarget(topbar);
        if (!topbar) return;
        if (topbar !== observedTopbar) observeTopbar(topbar);
        if (!container) build();

        const placement = afterNavigation(topbar);
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
        // observed host. Do not let that self-mutation enter the recovery path.
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
     * the recovery path altogether.
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
        container?.remove();
    };

    return {
        mount() {
            unsubscribe = clock.subscribe(() => {
                renderButton();
                if (popover) renderPopover();
            });
            unsubscribePaused = paused.subscribe(() => {
                renderButton();
                if (popover) renderPopover();
            });
            ticker = setIntervalFn(tick, 1000);
            attach();
        },
        refresh: attach,
        getPerformanceSnapshot() {
            return { attachCount, tickCount };
        },
        unmount() {
            destroyed = true;
            unsubscribe?.();
            unsubscribe = null;
            unsubscribePaused?.();
            unsubscribePaused = null;
            if (ticker) clearIntervalFn(ticker);
            ticker = null;
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
            attachQueued = false;
            if (attachTimer) clearTimeout(attachTimer);
            attachTimer = null;
            remove();
            container = null;
        },
    };
}
