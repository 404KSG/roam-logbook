/**
 * The topbar widget: a live counter plus a popover for the open clocks.
 *
 * Roam re-renders its topbar on navigation, so the widget is re-attached from a
 * MutationObserver rather than mounted once.
 */

import * as clock from './clock.js';
import { button, el } from './dom.js';
import { taskTitle } from './org.js';
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
 * found by what the controls *are* — the forward arrow, else the menu toggle —
 * matching on a class substring so a renamed variant still lands.
 */
const NAV_ICON_PATTERN = /icon-(menu|arrow-left|arrow-right|chevron-left|chevron-right)\b/;

/**
 * A backstop, not the layout. CSS ellipsis does the real work — this only keeps a
 * pathological title out of the DOM, and stays short because CJK titles are twice
 * as wide per character as the Latin ones this budget was eyeballed against.
 */
const TOPBAR_TITLE_LENGTH = 32;

export function createTopbar({ onOpenDashboard }) {
    let container = null;
    let labelNode = null;
    let timeNode = null;
    let targetNode = null;
    let totalNode = null;
    let titleNode = null;
    let iconNode = null;
    let buttonNode = null;
    let popover = null;
    let observer = null;
    let ticker = null;
    let unsubscribe = null;
    let destroyed = false;

    const isStale = entry =>
        findStaleClocks([entry], new Date(), staleHours()).length > 0;

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
            el('div', 'rlb-popover__title', entries.length ? 'Running clocks' : 'Logbook')
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
                        `${stale.length} clock${stale.length > 1 ? 's have' : ' has'} been open for over ` +
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

        // Overrun outranks stale: it is the more actionable of the two, and a
        // pomodoro that has blown past its target is usually not yet 8h old.
        buttonNode.classList.toggle('rlb-topbar__button--running', running && !overrun);
        buttonNode.classList.toggle('rlb-topbar__button--overrun', overrun);
        iconNode.className = running
            ? `rlb-dot${overrun ? ' rlb-dot--overrun' : stale ? ' rlb-dot--stale' : ''}`
            : 'bp3-icon bp3-icon-timeline-events';

        if (!running) {
            // Idle is icon-only. The topbar is Roam's space, and a label that
            // says nothing beyond what the icon already says is rent unpaid.
            timeNode.textContent = '';
            targetNode.textContent = '';
            totalNode.textContent = '';
            titleNode.textContent = '';
            buttonNode.title = 'Logbook — no clock running. Click for the dashboard.';
            buttonNode.setAttribute('aria-label', buttonNode.title);
            return;
        }

        const [first] = entries;
        const elapsed = now - first.start.getTime();
        timeNode.textContent = formatElapsed(elapsed);

        if (entries.length > 1) {
            // Which clock the target or total belongs to would be a guess, so
            // neither is shown; the popover breaks the sessions out individually.
            targetNode.textContent = '';
            totalNode.textContent = '';
            titleNode.textContent = `${entries.length} clocks`;
            buttonNode.title = `${entries.length} clocks running`;
        } else {
            const target = pomodoro.targetMinutes(first.clockUid);
            targetNode.textContent = target ? formatElapsed(target * 60_000) : '';

            const totalMinutes = first.priorMinutes + Math.floor(elapsed / 60_000);
            totalNode.textContent = formatMinutesHuman(totalMinutes);

            titleNode.textContent = taskTitle(first.taskString, { maxLength: TOPBAR_TITLE_LENGTH });
            // The tooltip spells out what the truncated button cannot.
            buttonNode.title =
                `Clocked in: ${first.title}\n` +
                `This session ${formatElapsed(elapsed)} · ${formatMinutesHuman(totalMinutes)} on this task in total` +
                (target
                    ? `\nPomodoro ${target}m — ${
                          overrun
                              ? `over by ${formatElapsed(pomodoro.overrunMs(first, now))}`
                              : `${formatElapsed(target * 60_000 - elapsed)} left`
                      }`
                    : '');
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

        iconNode = el('span', 'bp3-icon bp3-icon-timeline-events');
        // Built once and updated in place: the counter re-renders every second,
        // and rebuilding the nodes made a long title reflow on every tick.
        timeNode = el('span', 'rlb-topbar__time');
        targetNode = el('span', 'rlb-topbar__target');
        totalNode = el('span', 'rlb-topbar__total');
        titleNode = el('span', 'rlb-topbar__label');
        labelNode = el('span', 'rlb-topbar__labels');
        labelNode.append(timeNode, targetNode, totalNode, titleNode);

        buttonNode = button('bp3-button bp3-minimal rlb-topbar__button', '', togglePopover);
        buttonNode.append(iconNode, labelNode);
        container.appendChild(buttonNode);
        renderButton();
    };

    const attach = () => {
        if (destroyed) return;
        if (!showTopbarWidget()) {
            remove();
            return;
        }
        if (container?.isConnected) return;
        const topbar = document.querySelector(TOPBAR_SELECTOR);
        if (!topbar) return;
        if (!container) build();

        topbar.insertBefore(container, afterNavigation(topbar));
    };

    /**
     * The node to insert before, so the widget lands just past the navigation.
     *
     * @returns {Node|null} null appends to the end — the safe default, since
     *   guessing wrong on the left displaces controls the user needs, whereas on
     *   the right the widget is merely in a less convenient spot.
     */
    const afterNavigation = topbar => {
        let anchor = null;
        // Walk the leading run only, and stop at the first child that is not a
        // navigation control. Searching the whole topbar instead would let the
        // right sidebar's own arrow win and drag the widget across to it.
        for (const child of topbar.children) {
            if (child === container || !isNavigationControl(child)) break;
            anchor = child;
        }
        return anchor ? anchor.nextSibling : null;
    };

    /**
     * Whether a topbar child belongs to the navigation cluster.
     *
     * A named Blueprint icon is the strongest signal, but Roam's back/forward
     * arrows are not named that way, so the general test is what these controls
     * have in common: a glyph, no text of its own, and nothing to type into.
     * The search box is the thing that ends the cluster, and it is excluded by
     * the form-field check even though it too holds an icon.
     */
    const isNavigationControl = element => {
        const classOf = node => node.getAttribute?.('class') || '';
        const named = node => NAV_ICON_PATTERN.test(classOf(node));
        if (named(element) || [...element.querySelectorAll('[class]')].some(named)) return true;

        if (element.querySelector('input, textarea, select')) return false;
        if ((element.textContent || '').trim().length > 0) return false;
        return Boolean(element.querySelector('svg') || /icon/i.test(classOf(element)));
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
