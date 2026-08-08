/**
 * The topbar widget: a live counter plus a popover for the open clocks.
 *
 * Roam re-renders its topbar on navigation, so the widget is re-attached from a
 * MutationObserver rather than mounted once.
 */

import * as clock from './clock.js';
import { button, el } from './dom.js';
import { formatElapsed, formatStamp } from './time.js';
import { findStaleClocks } from './stats.js';
import { showTopbarWidget, staleHours } from './settings.js';
import { openBlock } from './roam.js';

const WIDGET_ID = 'roam-logbook-topbar';
const TOPBAR_SELECTOR = '.rm-topbar';

export function createTopbar({ onOpenDashboard }) {
    let container = null;
    let labelNode = null;
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
        popover.style.top = `${anchor.bottom + 6}px`;
        popover.style.left = `${Math.max(8, anchor.right - width)}px`;
    };

    const runningRow = entry => {
        const row = el('div', 'rlb-run');
        row.appendChild(el('span', `rlb-dot${isStale(entry) ? ' rlb-dot--stale' : ''}`));

        const body = el('div', 'rlb-run__body');
        const title = button(
            'bp3-button bp3-minimal rlb-run__title',
            entry.title,
            () => {
                closePopover();
                void openBlock(entry.taskUid);
            },
            { title: 'Open this block' }
        );
        const meta = el(
            'div',
            'rlb-run__meta',
            `${formatElapsed(Date.now() - entry.start.getTime())} · since ${formatStamp(entry.start)}` +
                (entry.pageTitle ? ` · ${entry.pageTitle}` : '')
        );
        meta.dataset.startMs = String(entry.start.getTime());
        meta.dataset.suffix =
            ` · since ${formatStamp(entry.start)}` + (entry.pageTitle ? ` · ${entry.pageTitle}` : '');
        body.append(title, meta);

        const actions = el('div', 'rlb-run__actions');
        actions.append(
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

        buttonNode.classList.toggle('rlb-topbar__button--running', running);
        iconNode.className = running
            ? `rlb-dot${findStaleClocks(entries, new Date(), staleHours()).length ? ' rlb-dot--stale' : ''}`
            : 'bp3-icon bp3-icon-time';

        if (!running) {
            labelNode.replaceChildren(el('span', 'rlb-topbar__label', 'Logbook'));
            buttonNode.title = 'Logbook — no clock running';
        } else {
            const [first] = entries;
            const time = el(
                'span',
                'rlb-topbar__time',
                formatElapsed(Date.now() - first.start.getTime())
            );
            const suffix = entries.length > 1 ? `${entries.length} clocks` : first.title;
            labelNode.replaceChildren(time, el('span', 'rlb-topbar__label', ` · ${suffix}`));
            buttonNode.title = `Clocked in: ${first.title}`;
        }
        buttonNode.setAttribute('aria-label', buttonNode.title);
    };

    const tick = () => {
        if (clock.getRunning().length === 0) return;
        renderButton();
        if (popover) {
            for (const meta of popover.querySelectorAll('.rlb-run__meta')) {
                const startMs = Number(meta.dataset.startMs);
                if (!Number.isFinite(startMs)) continue;
                meta.textContent = formatElapsed(Date.now() - startMs) + (meta.dataset.suffix || '');
            }
        }
    };

    const build = () => {
        container = el('div', 'rlb-topbar');
        container.id = WIDGET_ID;

        iconNode = el('span', 'bp3-icon bp3-icon-time');
        labelNode = el('span', 'rlb-topbar__labels');
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
        topbar.appendChild(container);
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
