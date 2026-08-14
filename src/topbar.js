/**
 * The topbar widget: a live counter plus a popover for the open clocks.
 *
 * Roam re-renders its topbar on navigation, so the widget is re-attached from a
 * MutationObserver rather than mounted once.
 */

import * as clock from './clock.js';
import { button, el } from './dom.js';
import * as pomodoro from './pomodoro.js';
import { formatElapsed, formatMinutesHuman, formatStamp } from './time.js';
import { findStaleClocks } from './stats.js';
import { pomodoroMinutes, showTopbarWidget, staleHours } from './settings.js';
import { openBlock } from './roam.js';

const WIDGET_ID = 'roam-logbook-topbar';
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

export function createTopbar({ onOpenDashboard }) {
    let container = null;
    let timeNode = null;
    let iconNode = null;
    let parallelNode = null;
    let separatorNode = null;
    let buttonNode = null;
    let popover = null;
    let observer = null;
    let ticker = null;
    let unsubscribe = null;
    let destroyed = false;

    const isStale = entry =>
        findStaleClocks([entry], new Date(), staleHours()).length > 0;

    const taskCount = count => `${count} Task${count === 1 ? '' : 's'}`;

    // ---- popover ----

    const closePopover = () => {
        popover?.remove();
        popover = null;
        document.removeEventListener('mousedown', onDocumentMouseDown, true);
        window.removeEventListener('resize', closePopover);
    };

    function onDocumentMouseDown(event) {
        if (!popover) return;
        if (container?.contains(event.target) || popover.contains(event.target)) return;
        closePopover();
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

    /** `12:34 / 30:00 · 2h 05m total` — the live half of a row's meta line. */
    const rowFigures = (entry, now) => {
        const target = pomodoro.targetMinutes(entry.clockUid);
        const elapsed = now - entry.start.getTime();
        const total = entry.priorMinutes + Math.floor(elapsed / 60_000);
        return (
            formatElapsed(elapsed) +
            (target ? ` / ${formatElapsed(target * 60_000)}` : '') +
            ` · ${formatMinutesHuman(total)} total`
        );
    };

    const runningRow = entry => {
        const now = Date.now();
        const overrun = pomodoro.isOverrun(entry, now);
        const row = el('div', `rlb-run${overrun ? ' rlb-run--overrun' : ''}`);
        row.appendChild(
            el('span', `rlb-dot${overrun ? ' rlb-dot--overrun' : isStale(entry) ? ' rlb-dot--stale' : ''}`)
        );

        const body = el('div', 'rlb-run__body');
        const title = button(
            'bp3-button bp3-minimal bp3-icon-document-open rlb-run__title',
            entry.title,
            () => {
                closePopover();
                void openBlock(entry.taskUid);
            },
            { title: 'Open this block' }
        );
        const suffix =
            ` · since ${formatStamp(entry.start)}` + (entry.pageTitle ? ` · ${entry.pageTitle}` : '');
        const meta = el('div', 'rlb-run__meta', rowFigures(entry, now) + suffix);
        meta.dataset.clockUid = entry.clockUid;
        meta.dataset.suffix = suffix;
        body.append(title, meta);

        const target = pomodoro.targetMinutes(entry.clockUid);
        const actions = el('div', 'rlb-run__actions');
        actions.append(
            button(
                `bp3-button bp3-minimal bp3-small bp3-icon-stopwatch${
                    target ? ' rlb-run__pomodoro--on' : ''
                }`,
                '',
                () => {
                    pomodoro.toggle(entry.clockUid);
                    renderButton();
                    renderPopover();
                },
                {
                    title: target
                        ? `Pomodoro ${target}m — click to cancel`
                        : `Start a ${pomodoroMinutes()}m pomodoro on this session`,
                }
            ),
            button(
                'bp3-button bp3-minimal bp3-small bp3-icon-stop bp3-intent-success',
                '',
                () => void run(() => clock.clockOut(entry.clockUid)),
                { title: 'Clock out now' }
            ),
            button(
                'bp3-button bp3-minimal bp3-small bp3-icon-trash',
                '',
                () => void run(() => clock.discardClock(entry.clockUid)),
                { title: 'Discard this entry' }
            )
        );

        row.append(body, actions);
        return row;
    };

    const run = async action => {
        try {
            await action();
        } catch (error) {
            console.error('[roam-logbook]', error);
        }
        if (popover) renderPopover();
    };

    function renderPopover() {
        if (!popover) return;
        const entries = clock.getRunning();
        popover.replaceChildren();

        popover.appendChild(
            el(
                'div',
                'rlb-popover__title',
                entries.length ? `${taskCount(entries.length)} Running` : 'Logbook'
            )
        );

        if (entries.length === 0) {
            popover.appendChild(
                el(
                    'div',
                    'rlb-popover__empty',
                    'No clock is running. Right-click a TODO bullet and choose Plugins → Logbook: Clock in.'
                )
            );
        } else {
            const stale = findStaleClocks(entries, new Date(), staleHours());
            if (stale.length > 0) {
                popover.appendChild(
                    el(
                        'div',
                        'rlb-popover__empty bp3-text-small',
                        `${taskCount(stale.length)} ${stale.length > 1 ? 'have' : 'has'} been open for over ` +
                            `${staleHours()}h — likely forgotten.`
                    )
                );
            }
            for (const entry of entries) popover.appendChild(runningRow(entry));
        }

        const footer = el('div', 'rlb-popover__footer');
        footer.appendChild(
            button('bp3-button bp3-small bp3-icon-timeline-bar-chart', 'Dashboard', () => {
                closePopover();
                onOpenDashboard();
            })
        );
        if (entries.length > 1) {
            footer.appendChild(
                button('bp3-button bp3-small bp3-icon-stop', 'Clock out all', () =>
                    run(() => clock.clockOutAll())
                )
            );
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
        document.body.appendChild(popover);
        renderPopover();
        positionPopover();
        document.addEventListener('mousedown', onDocumentMouseDown, true);
        window.addEventListener('resize', closePopover);
    };

    // ---- widget ----

    const renderButton = () => {
        if (!buttonNode) return;
        const entries = clock.getRunning();
        const running = entries.length > 0;
        const now = Date.now();
        const overrun = entries.some(entry => pomodoro.isOverrun(entry, now));
        const stale = findStaleClocks(entries, new Date(), staleHours()).length > 0;

        if (!running) {
            iconNode.className = 'bp3-icon bp3-icon-history rlb-topbar__icon';
            timeNode.textContent = '';
            timeNode.className = 'rlb-topbar__time';
            buttonNode.replaceChildren(iconNode);
            buttonNode.title = 'Logbook — no clock running. Click for the dashboard.';
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
            parallelNode.textContent = taskCount(entries.length);
            separatorNode.textContent = ' · ';
            buttonNode.replaceChildren(parallelNode, separatorNode, timeNode);
        } else {
            buttonNode.replaceChildren(timeNode);
        }

        if (entries.length > 1) {
            buttonNode.title =
                `${taskCount(entries.length)} Running\n` +
                `Primary timer: ${first.title}\n` +
                `This session ${formatElapsed(elapsed)}` +
                (overrun ? '\nA Pomodoro is over its target.' : '') +
                (!overrun && stale ? '\nA clock is likely forgotten.' : '') +
                '\nClick for all clock details.';
        } else {
            const target = pomodoro.targetMinutes(first.clockUid);
            const totalMinutes = first.priorMinutes + Math.floor(elapsed / 60_000);
            buttonNode.title =
                `Clocked in: ${first.title}\n` +
                `This session ${formatElapsed(elapsed)} · ${formatMinutesHuman(totalMinutes)} on this task in total` +
                (target
                    ? `\nPomodoro ${target}m — ${
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
        if (clock.getRunning().length === 0) return;
        renderButton();
        if (popover) {
            const now = Date.now();
            const byUid = new Map(clock.getRunning().map(entry => [entry.clockUid, entry]));
            for (const meta of popover.querySelectorAll('.rlb-run__meta')) {
                const entry = byUid.get(meta.dataset.clockUid);
                if (!entry) continue;
                meta.textContent = rowFigures(entry, now) + (meta.dataset.suffix || '');
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
        timeNode = el('span', 'rlb-topbar__time');

        buttonNode = button('bp3-button bp3-minimal rlb-topbar__button', '', togglePopover);
        buttonNode.appendChild(iconNode);
        container.appendChild(buttonNode);
        renderButton();
    };

    const attach = () => {
        if (destroyed) return;
        if (!showTopbarWidget()) {
            remove();
            return;
        }
        const topbar = document.querySelector(TOPBAR_SELECTOR);
        if (!topbar) return;
        if (!container) build();

        const placement = afterNavigation(topbar);
        if (
            container.parentNode !== placement.parent ||
            container.nextSibling !== placement.before
        ) {
            placement.parent.insertBefore(container, placement.before);
        }
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
            ticker = setInterval(tick, 1000);
            observer = new MutationObserver(attach);
            observer.observe(document.body, { childList: true, subtree: true });
            attach();
        },
        refresh: attach,
        unmount() {
            destroyed = true;
            unsubscribe?.();
            unsubscribe = null;
            if (ticker) clearInterval(ticker);
            ticker = null;
            observer?.disconnect();
            observer = null;
            remove();
            container = null;
        },
    };
}
