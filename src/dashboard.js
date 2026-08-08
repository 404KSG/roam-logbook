/**
 * The dashboard dialog: totals, a per-day bar row, and a per-task breakdown.
 *
 * Reads the graph on open and on refresh only — there is no live subscription,
 * because a dialog that reshuffles under the cursor is worse than a stale one.
 */

import * as clock from './clock.js';
import { button, el } from './dom.js';
import { readAllEntries, readHierarchy } from './entries.js';
import { openBlock } from './roam.js';
import { buildDashboard, findStaleClocks, flattenForest, getRange, RANGES } from './stats.js';
import { staleHours } from './settings.js';
import { formatElapsed, formatMinutesHuman, formatStamp } from './time.js';

const ROOT_ID = 'roam-logbook-dashboard';

export function createDashboard() {
    let root = null;
    let bodyNode = null;
    let rangeId = 'week';
    let returnFocusTo = null;

    const render = () => {
        if (!bodyNode) return;
        const now = new Date();
        const entries = readAllEntries();
        const hierarchy = readHierarchy([...new Set(entries.map(entry => entry.taskUid))]);
        const model = buildDashboard(entries, { now, rangeId, hierarchy });
        bodyNode.replaceChildren();

        bodyNode.appendChild(
            statsRow([
                ['Today', formatMinutesHuman(model.todayMinutes)],
                ['Last 7 days', formatMinutesHuman(model.weekMinutes)],
                [getRange(rangeId).label, formatMinutesHuman(model.totalMinutes)],
                ['Tasks tracked', String(model.tasks.length)],
            ])
        );

        if (model.running.length > 0) {
            bodyNode.appendChild(runningSection(model.running, now));
        }

        if (model.entries.length === 0) {
            bodyNode.appendChild(
                el('div', 'rlb-empty', 'No clock entries in this range yet.')
            );
            return;
        }

        bodyNode.appendChild(daysSection(model.days));
        bodyNode.appendChild(tasksSection(model.tree));
    };

    const statsRow = pairs => {
        const wrapper = el('div', 'rlb-stats');
        for (const [label, value] of pairs) {
            const card = el('div', 'rlb-stat');
            card.append(el('strong', 'rlb-stat__value', value), el('span', 'rlb-stat__label', label));
            wrapper.appendChild(card);
        }
        return wrapper;
    };

    const runningSection = (running, now) => {
        const stale = new Set(findStaleClocks(running, now, staleHours()).map(e => e.clockUid));
        const section = el('section', 'rlb-section');
        section.appendChild(
            el(
                'h3',
                'rlb-section__title',
                stale.size > 0
                    ? `Running · ${stale.size} unfinished for over ${staleHours()}h`
                    : 'Running'
            )
        );

        const table = el('table', 'rlb-table');
        table.appendChild(headerRow(['Task', 'Started', 'Elapsed', '']));
        const tbody = el('tbody');
        for (const entry of running) {
            const row = el('tr');
            const task = el('td');
            task.appendChild(taskLink(entry.title, entry.taskUid));
            if (stale.has(entry.clockUid)) {
                task.appendChild(el('span', 'bp3-tag bp3-minimal bp3-intent-warning', 'stale'));
            }

            const actions = el('td', 'rlb-table__num');
            actions.append(
                button(
                    'bp3-button bp3-minimal bp3-small bp3-icon-stop bp3-intent-success',
                    '',
                    () => void act(() => clock.clockOut(entry.clockUid)),
                    { title: 'Clock out now' }
                ),
                button(
                    'bp3-button bp3-minimal bp3-small bp3-icon-trash',
                    '',
                    () => void act(() => clock.discardClock(entry.clockUid)),
                    { title: 'Discard this entry' }
                )
            );

            row.append(
                task,
                el('td', 'rlb-muted', formatStamp(entry.start)),
                el('td', 'rlb-table__num', formatElapsed(now.getTime() - entry.start.getTime())),
                actions
            );
            tbody.appendChild(row);
        }
        table.appendChild(tbody);
        section.appendChild(table);
        return section;
    };

    const daysSection = days => {
        const section = el('section', 'rlb-section');
        section.appendChild(el('h3', 'rlb-section__title', 'By day'));
        const peak = Math.max(1, ...days.map(day => day.minutes));
        const bars = el('div', 'rlb-bars');
        for (const day of days) {
            const bar = el('div', `rlb-bar${day.minutes === 0 ? ' rlb-bar--empty' : ''}`);
            bar.title = `${day.key} · ${formatMinutesHuman(day.minutes)}`;
            const fill = el('div', 'rlb-bar__fill');
            fill.style.height = `${Math.max(2, Math.round((day.minutes / peak) * 100))}%`;
            bar.appendChild(fill);
            bars.appendChild(bar);
        }
        section.appendChild(bars);
        section.appendChild(
            el('div', 'rlb-muted bp3-text-small', `${days[0]?.key} → ${days[days.length - 1]?.key}`)
        );
        return section;
    };

    const tasksSection = tree => {
        const rows = flattenForest(tree);
        const nested = rows.some(node => node.depth > 0);

        const section = el('section', 'rlb-section');
        section.appendChild(el('h3', 'rlb-section__title', 'By task'));
        const table = el('table', 'rlb-table');
        table.appendChild(headerRow(['Task', 'Sessions', 'Own', 'Total']));

        const tbody = el('tbody');
        for (const node of rows) {
            const row = el('tr');
            const name = el('td', 'rlb-tree__cell');
            name.style.paddingLeft = `${8 + node.depth * 18}px`;
            if (node.depth > 0) name.appendChild(el('span', 'rlb-tree__branch', '└'));
            name.appendChild(taskLink(node.title, node.taskUid));
            // A task reachable from more than one parent is counted under each of
            // them; say so on the row rather than let the columns look wrong.
            if (node.occurrences > 1) {
                const badge = el('span', 'bp3-tag bp3-minimal rlb-tree__badge', `×${node.occurrences}`);
                badge.title = `Also rolls up under ${node.occurrences - 1} other task(s)`;
                name.appendChild(badge);
            }
            if (node.truncated) {
                name.appendChild(el('span', 'bp3-tag bp3-minimal bp3-intent-warning', 'loop'));
            }

            const own = node.own > 0 ? formatMinutesHuman(node.own) : '';
            row.append(
                name,
                el('td', 'rlb-table__num rlb-muted', node.sessions ? String(node.sessions) : ''),
                el('td', 'rlb-table__num rlb-muted', own),
                el('td', 'rlb-table__num rlb-tree__total', formatMinutesHuman(node.total))
            );
            tbody.appendChild(row);
        }
        table.appendChild(tbody);
        section.appendChild(table);

        if (nested) {
            section.appendChild(
                el(
                    'div',
                    'rlb-muted bp3-text-small rlb-tree__note',
                    'Total includes sub-tasks, so rows overlap — the figures above are counted once each.'
                )
            );
        }
        return section;
    };

    const headerRow = labels => {
        const thead = el('thead');
        const row = el('tr');
        for (const label of labels) row.appendChild(el('th', '', label));
        thead.appendChild(row);
        return thead;
    };

    const taskLink = (title, taskUid) =>
        button('bp3-button bp3-minimal bp3-small rlb-task-link', title, () => {
            close();
            void openBlock(taskUid);
        }, { title: 'Open this block' });

    const act = async action => {
        try {
            await action();
        } catch (error) {
            console.error('[roam-logbook]', error);
        }
        render();
    };

    const onKeyDown = event => {
        if (event.key === 'Escape' && root?.classList.contains('rlb-root--open')) {
            event.stopPropagation();
            close();
        }
    };

    const build = () => {
        const overlay = el('div', 'rlb-root');
        overlay.id = ROOT_ID;
        overlay.setAttribute('aria-hidden', 'true');
        overlay.addEventListener('mousedown', event => {
            if (event.target === overlay) close();
        });

        const dialog = el('div', 'bp3-dialog rlb-dialog');
        dialog.tabIndex = -1;
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');

        const header = el('header', 'bp3-dialog-header rlb-header');
        header.appendChild(el('h2', 'bp3-heading rlb-header__title', 'Logbook'));

        const selectWrapper = el('div', 'bp3-select bp3-small');
        const select = el('select');
        for (const range of RANGES) {
            const option = el('option', '', range.label);
            option.value = range.id;
            if (range.id === rangeId) option.selected = true;
            select.appendChild(option);
        }
        select.addEventListener('change', event => {
            rangeId = event.target.value;
            render();
        });
        selectWrapper.appendChild(select);

        header.append(
            selectWrapper,
            button('bp3-button bp3-minimal bp3-small bp3-icon-refresh', '', () => {
                clock.refresh();
                render();
            }, { title: 'Reload from the graph' }),
            button(
                'bp3-dialog-close-button bp3-button bp3-minimal bp3-icon-cross',
                '',
                close,
                { title: 'Close' }
            )
        );

        bodyNode = el('div', 'rlb-body');
        dialog.append(header, bodyNode);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        return overlay;
    };

    function close() {
        if (!root) return;
        root.classList.remove('rlb-root--open');
        root.setAttribute('aria-hidden', 'true');
        document.removeEventListener('keydown', onKeyDown, true);
        if (returnFocusTo?.isConnected) returnFocusTo.focus();
        returnFocusTo = null;
    }

    return {
        open() {
            const active = document.activeElement;
            returnFocusTo = active && active !== document.body ? active : null;
            if (!root) root = build();
            root.classList.add('rlb-root--open');
            root.setAttribute('aria-hidden', 'false');
            document.addEventListener('keydown', onKeyDown, true);
            clock.refresh();
            render();
            root.querySelector('.rlb-dialog')?.focus();
        },
        close,
        destroy() {
            document.removeEventListener('keydown', onKeyDown, true);
            root?.remove();
            root = null;
            bodyNode = null;
        },
    };
}
