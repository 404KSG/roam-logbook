/**
 * The dashboard dialog: a compact overview, running sessions, and a per-task
 * breakdown. Activity remains available as an accessible chart inside the
 * selected-range overview panel rather than as a separate chart section.
 *
 * Reads the graph on open and on refresh only — there is no live subscription,
 * because a dialog that reshuffles under the cursor is worse than a stale one.
 */

import * as clock from './clock.js';
import { button, el } from './dom.js';
import { readDashboardSnapshot } from './entries.js';
import { openBlock, openBlockInRightSidebar } from './roam.js';
import { buildDashboard, findStaleClocks, flattenForest, getRange, RANGES } from './stats.js';
import { staleHours } from './settings.js';
import { formatDayLabel, formatElapsed, formatMinutesHuman, formatStarted } from './time.js';

const ROOT_ID = 'roam-logbook-dashboard';
const DASHBOARD_TITLE = 'Roam Logbook';

export function createDashboard({
    now: nowFn = () => new Date(),
    setIntervalFn = (callback, delay) => setInterval(callback, delay),
    clearIntervalFn = ticker => clearInterval(ticker),
} = {}) {
    let root = null;
    let summaryNode = null;
    let bodyNode = null;
    let rangeId = 'week';
    let returnFocusTo = null;
    let liveTicker = null;
    let discardConfirmUid = null;
    let discardConfirmTimer = null;
    let lastSnapshot = null;
    // Kept across re-renders and reopens, keyed by task: changing the range or
    // clocking out should not throw away how the user arranged the tree.
    const collapsed = new Set();

    const clearLiveTicker = () => {
        if (liveTicker !== null) clearIntervalFn(liveTicker);
        liveTicker = null;
    };

    const resetDiscardConfirmation = () => {
        discardConfirmUid = null;
        if (discardConfirmTimer) clearTimeout(discardConfirmTimer);
        discardConfirmTimer = null;
    };

    const updateRunningElapsed = () => {
        if (!root?.classList.contains('rlb-root--open')) return;
        const now = nowFn().getTime();
        for (const cell of bodyNode?.querySelectorAll('[data-running-elapsed="true"]') || []) {
            cell.textContent = formatElapsed(now - Number(cell.dataset.startMs));
        }
    };

    const startLiveTicker = () => {
        clearLiveTicker();
        if (!root?.classList.contains('rlb-root--open')) return;
        if (!bodyNode?.querySelector('[data-running-elapsed="true"]')) return;
        liveTicker = setIntervalFn(updateRunningElapsed, 1000);
    };

    const render = () => {
        if (!bodyNode) return;
        clearLiveTicker();
        const now = nowFn();
        let snapshot;
        let refreshNotice = '';
        let transientIssues = [];
        try {
            const candidate = readDashboardSnapshot();
            lastSnapshot = candidate;
            snapshot = candidate;
        } catch (error) {
            transientIssues = error.issue ? [error.issue] : error.issues || [];
            if (!lastSnapshot) {
                summaryNode.replaceChildren();
                const notice = el(
                    'div',
                    'rlb-dashboard__notice',
                    'Graph data could not be refreshed; no successful snapshot is available yet.'
                );
                notice.setAttribute('role', 'alert');
                const issueRows = transientIssues.map(issueRow);
                bodyNode.replaceChildren(
                    notice,
                    ...(issueRows.length > 0 ? [dataIssuesSection(issueRows)] : [])
                );
                return;
            }
            snapshot = lastSnapshot;
            refreshNotice =
                'Graph data could not be refreshed; showing last successful snapshot.';
        }
        const entries = snapshot.entries;
        const hierarchy = snapshot.hierarchy;
        // Publish the exact snapshot to the clock seam. This updates running
        // state without issuing the entries query a second time.
        clock.refresh({ entries });
        const model = buildDashboard(entries, { now, rangeId, hierarchy });
        bodyNode.replaceChildren();

        const rangeLabel = getRange(rangeId).label;
        summaryNode.replaceChildren(
            overviewBar({
                today: formatMinutesHuman(model.todayMinutes),
                todayContext:
                    model.running.length > 0
                        ? `${model.running.length} active Session${model.running.length === 1 ? '' : 's'}`
                        : 'No active Sessions',
                selected: formatMinutesHuman(model.totalMinutes),
                selectedLabel: rangeLabel,
                selectedContext: `${(model.activity || model.days || []).length} day${(model.activity || model.days || []).length === 1 ? '' : 's'} in range`,
                activity: model.activity || model.days,
                activityLabel: model.activityLabel || rangeLabel,
                activityScope: model.activityScope || 'selected-range',
                tasks: String(model.tasks.length),
                tasksContext: 'in selected period',
                now,
            })
        );

        if (refreshNotice) {
            const notice = el('div', 'rlb-dashboard__notice', refreshNotice);
            notice.setAttribute('role', 'status');
            bodyNode.appendChild(notice);
        }

        if (model.running.length > 0) {
            bodyNode.appendChild(runningSection(model.running, now));
        }

        const issues = [
            ...model.issues,
            ...(hierarchy.issues || []).map(issueRow),
            ...transientIssues.map(issueRow),
        ];

        if (model.entries.length === 0) {
            bodyNode.appendChild(
                el('div', 'rlb-empty', 'No clock entries in this range yet.')
            );
            if (issues.length > 0) bodyNode.appendChild(dataIssuesSection(issues));
            startLiveTicker();
            return;
        }

        bodyNode.appendChild(tasksSection(model.tree));
        if (issues.length > 0) bodyNode.appendChild(dataIssuesSection(issues));
        startLiveTicker();
    };

    const issueRow = issue => ({
        title: issue.title || issue.parentUid || issue.affectedUid || 'Unresolved graph data',
        rawClock:
            issue.rawClock ||
            (issue.source ? `(graph ${issue.source} read)` : '(hierarchy query)'),
        issues: [issue],
    });

    const dataIssuesSection = issues => {
        const details = el('details', 'rlb-data-issues rlb-dashboard__inline-status');
        const issueGroups = issues.map(entry => (entry.issues || [entry.issue]).filter(Boolean));
        const graphReadCount = issueGroups.filter(group =>
            group.some(issue => issue.kind === 'graph-read')
        ).length;
        const timingCount = issueGroups.length - graphReadCount;
        const summaryParts = [];
        if (timingCount > 0) {
            summaryParts.push(
                `${timingCount} timing record${timingCount === 1 ? '' : 's'} ${
                    timingCount === 1 ? 'needs' : 'need'
                } review`
            );
        }
        if (graphReadCount > 0) {
            summaryParts.push(
                `${graphReadCount} graph read issue${graphReadCount === 1 ? '' : 's'} ${
                    graphReadCount === 1 ? 'needs' : 'need'
                } review`
            );
        }
        const summary = el(
            'summary',
            'rlb-data-issues__summary',
            summaryParts.join(' · ')
        );
        details.appendChild(summary);
        const list = el('div', 'rlb-data-issues__list');
        for (const entry of issues) {
            const entryIssues = (entry.issues || [entry.issue]).filter(Boolean);
            const issueText = entryIssues
                .map(issue => `${issue.source ? `${issue.source}: ` : ''}${issue.message}`)
                .join(' ');
            const raw = entry.rawClock || '(CLOCK text unavailable)';
            const label = `Task: ${entry.title} · CLOCK: ${raw} · Issue: ${issueText}`;
            const item = el('div', 'rlb-data-issues__item', label);
            item.title = label;
            item.setAttribute('aria-label', label);
            list.appendChild(item);
        }
        details.appendChild(list);
        return details;
    };

    const activityRail = (days, now, activityLabel, activityScope) => {
        const series = days || [];
        const peak = Math.max(1, ...series.map(day => day.minutes));
        const rail = el('div', 'rlb-activity-rail');
        rail.dataset.dayCount = String(series.length);
        rail.style.setProperty('--rlb-activity-count', String(series.length));
        rail.dataset.activityScope = activityScope;
        rail.setAttribute('role', 'group');
        rail.setAttribute('aria-label', `${activityLabel} activity`);

        for (const day of series) {
            const level =
                day.minutes === 0 ? 0 : Math.max(1, Math.ceil((day.minutes / peak) * 3));
            const duration = formatMinutesHuman(day.minutes);
            const label = formatDayLabel(day.date, now);
            const bucket = button(
                `rlb-activity__bucket rlb-activity__bucket--level-${level}${
                    day.minutes === 0 ? ' rlb-activity__bucket--empty' : ''
                }`,
                '',
                () => {},
                { title: `${day.key} · ${duration}` }
            );
            bucket.dataset.date = day.key;
            bucket.dataset.minutes = String(day.minutes);
            bucket.dataset.level = String(level);
            bucket.setAttribute('aria-label', `${day.key}, ${label}, ${duration}`);
            const fill = el('span', 'rlb-activity__fill');
            fill.style.height = `${day.minutes === 0 ? 0 : Math.max(8, Math.round((day.minutes / peak) * 100))}%`;
            bucket.appendChild(fill);
            rail.appendChild(bucket);
        }
        return rail;
    };

    const overviewBar = ({
        today,
        todayContext,
        selected,
        selectedLabel,
        selectedContext,
        activity,
        activityLabel,
        activityScope,
        tasks,
        tasksContext,
        now,
    }) => {
        const wrapper = el('dl', 'rlb-overview rlb-overview--strip');
        wrapper.setAttribute('aria-label', `${DASHBOARD_TITLE} overview`);
        const metrics = [
            ['Today', today, todayContext],
            [selectedLabel, selected, selectedContext],
            ['Tasks tracked', tasks, tasksContext],
        ];
        for (const [index, [label, value, context]] of metrics.entries()) {
            const item = el('div', 'rlb-overview__item rlb-overview__panel');
            if (index === 1) item.classList.add('rlb-overview__item--selected');
            const heading = el('div', 'rlb-overview__heading');
            const valueNode = el(
                'dd',
                `rlb-overview__value${
                    index === 0 && value === '0m' && /No active Sessions/i.test(context)
                        ? ' rlb-overview__value--quiet'
                        : ''
                }`
            );
            valueNode.append(
                el('span', 'rlb-overview__number', value),
                el('span', 'rlb-overview__context', context)
            );
            heading.append(el('dt', 'rlb-overview__label', label), valueNode);
            item.append(heading);
            if (index === 1) {
                item.appendChild(activityRail(activity, now, activityLabel, activityScope));
            }
            wrapper.appendChild(item);
        }
        return wrapper;
    };

    const runningSection = (running, now) => {
        const stale = new Set(findStaleClocks(running, now, staleHours()).map(e => e.clockUid));
        const section = el('section', 'rlb-dashboard-section rlb-running');
        section.classList.add('rlb-dashboard-panel');
        const heading = el('div', 'rlb-panel__header');
        heading.appendChild(el('h3', 'rlb-section__title', 'Running'));
        heading.appendChild(
            el(
                'span',
                'rlb-panel__count',
                `${running.length} Session${running.length === 1 ? '' : 's'}`
            )
        );
        if (stale.size > 0) {
            heading.appendChild(
                el('span', 'bp3-tag bp3-minimal bp3-intent-warning rlb-panel__notice', `${stale.size} stale`)
            );
        }
        section.appendChild(heading);

        const table = el('table', 'rlb-table');
        table.appendChild(
            headerRow(['Task', 'Started', { label: 'Elapsed', numeric: true }, ''])
        );
        const tbody = el('tbody');
        for (const entry of running) {
            const row = el('tr');
            const task = el('td', 'rlb-cell');
            const mark = statusMark(entry.status);
            if (mark) task.appendChild(mark);
            task.appendChild(taskLink(entry.title, entry.taskUid));
            if (stale.has(entry.clockUid)) {
                task.appendChild(el('span', 'bp3-tag bp3-minimal bp3-intent-warning', 'stale'));
            }

            const actions = el('td', 'rlb-table__num');
            const discarding = discardConfirmUid === entry.clockUid;
            const discardTitle = discarding
                ? 'Confirm discard of this CLOCK entry'
                : 'Discard this CLOCK entry (cannot be undone)';
            const discard = button(
                `bp3-button bp3-minimal bp3-small bp3-icon-trash${discarding ? ' bp3-intent-danger' : ''}`,
                '',
                event => {
                    event.stopPropagation();
                    if (!discarding) {
                        discardConfirmUid = entry.clockUid;
                        if (discardConfirmTimer) clearTimeout(discardConfirmTimer);
                        discardConfirmTimer = setTimeout(() => {
                            resetDiscardConfirmation();
                            render();
                        }, 5000);
                        render();
                        return;
                    }
                    resetDiscardConfirmation();
                    void act(() => clock.discardClock(entry.clockUid));
                },
                { title: discardTitle }
            );
            discard.dataset.action = 'discard';
            actions.append(
                button(
                    'bp3-button bp3-minimal bp3-small bp3-icon-log-out rlb-running__checkout',
                    '',
                    event => {
                        event.stopPropagation();
                        void act(() => clock.clockOut(entry.clockUid));
                    },
                    { title: 'Check Out' }
                ),
                discard
            );
            actions.firstElementChild.dataset.action = 'clock-out';

            const started = formatStarted(entry.start, now);
            const startedTime = el('time', 'rlb-started', '');
            startedTime.title = started.raw;
            startedTime.setAttribute('aria-label', started.raw);
            if (started.datetime) startedTime.dateTime = started.datetime;
            if (started.valid) {
                startedTime.append(
                    el('span', 'rlb-started__date', started.dateLabel),
                    el('span', 'rlb-started__time', started.timeLabel)
                );
            } else {
                startedTime.textContent = started.raw;
            }

            const startedCell = el('td', 'rlb-muted rlb-started-cell');
            startedCell.appendChild(startedTime);

            const elapsed = el(
                'td',
                'rlb-table__num rlb-running-elapsed',
                formatElapsed(now.getTime() - entry.start.getTime())
            );
            elapsed.dataset.runningElapsed = 'true';
            elapsed.dataset.clockUid = entry.clockUid;
            elapsed.dataset.startMs = String(entry.start.getTime());
            row.append(task, startedCell, elapsed, actions);
            tbody.appendChild(row);
        }
        table.appendChild(tbody);
        section.appendChild(table);
        return section;
    };

    const tasksSection = tree => {
        const everyRow = flattenForest(tree);
        const parentUids = everyRow.filter(node => node.hasChildren).map(node => node.taskUid);

        const section = el('section', 'rlb-dashboard-section rlb-dashboard-panel rlb-by-task');
        const heading = el('div', 'rlb-section__heading rlb-panel__header');
        heading.appendChild(el('h3', 'rlb-section__title', 'By task'));

        const rollupHelp =
            'Totals include sub-tasks. A task shown under more than one parent may overlap between branches; headline totals count each Session once.';
        const info = button(
            'bp3-button bp3-minimal bp3-small bp3-icon-info-sign rlb-tree__info',
            '',
            () => {},
            { title: rollupHelp }
        );
        info.setAttribute('aria-describedby', 'roam-logbook-task-rollup-help');
        heading.appendChild(info);
        const help = el('span', 'rlb-visually-hidden', rollupHelp);
        help.id = 'roam-logbook-task-rollup-help';
        section.appendChild(help);

        const toggleAll = button('bp3-button bp3-minimal bp3-small', '', () => {
            const anyExpanded = parentUids.some(uid => !collapsed.has(uid));
            if (anyExpanded) for (const uid of parentUids) collapsed.add(uid);
            else collapsed.clear();
            paint();
        });
        if (parentUids.length > 0) heading.appendChild(toggleAll);
        section.appendChild(heading);

        const tableHost = el('div');
        section.appendChild(tableHost);

        function paint() {
            const rows = flattenForest(tree, { isCollapsed: node => collapsed.has(node.taskUid) });
            const anyExpanded = parentUids.some(uid => !collapsed.has(uid));
            toggleAll.textContent = anyExpanded ? 'Collapse all' : 'Expand all';

            const table = el('table', 'rlb-table rlb-task-table');
            const columns = el('colgroup');
            for (const className of [
                'rlb-task-table__task',
                'rlb-task-table__sessions',
                'rlb-task-table__own',
                'rlb-task-table__total',
            ]) {
                columns.appendChild(el('col', className));
            }
            table.appendChild(columns);
            table.appendChild(
                headerRow([
                    'Task',
                    { label: 'Sessions', numeric: true },
                    { label: 'Own', numeric: true },
                    { label: 'Total', numeric: true },
                ])
            );
            const tbody = el('tbody');

            for (const node of rows) {
                const row = el('tr');
                const name = el('td', 'rlb-tree__cell');
                const layout = el('div', 'rlb-tree__layout');
                const leading = el('div', 'rlb-tree__leading');
                const content = el('div', 'rlb-tree__content');
                name.style.paddingLeft = `${8 + node.depth * 20}px`;

                if (node.hasChildren) {
                    const caret = button(
                        `bp3-button bp3-minimal bp3-small rlb-tree__toggle bp3-icon-chevron-${
                            node.collapsed ? 'right' : 'down'
                        }`,
                        '',
                        () => {
                            if (collapsed.has(node.taskUid)) collapsed.delete(node.taskUid);
                            else collapsed.add(node.taskUid);
                            paint();
                        },
                        { title: node.collapsed ? 'Expand sub-tasks' : 'Collapse sub-tasks' }
                    );
                    caret.setAttribute('aria-expanded', String(!node.collapsed));
                    leading.appendChild(caret);
                } else {
                    // Keeps every title on the same left edge, caret or not.
                    leading.appendChild(el('span', 'rlb-tree__toggle rlb-tree__toggle--empty'));
                }

                const mark = statusMark(node.status);
                if (mark) leading.appendChild(mark);
                if (node.status === 'DONE') row.classList.add('rlb-row--done');
                content.appendChild(taskLink(node.title, node.taskUid));
                // A task reachable from more than one parent is counted under each
                // of them; say so on the row rather than let the columns look wrong.
                if (node.occurrences > 1) {
                    const badge = el('span', 'bp3-tag bp3-minimal rlb-tree__badge', `×${node.occurrences}`);
                    badge.title = `Also rolls up under ${node.occurrences - 1} other task(s)`;
                    content.appendChild(badge);
                }
                if (node.truncated) {
                    content.appendChild(el('span', 'bp3-tag bp3-minimal bp3-intent-warning', 'loop'));
                }
                layout.append(leading, content);
                if (node.collapsed) {
                    const hidden = countDescendants(node);
                    layout.appendChild(
                        el('span', 'rlb-muted rlb-tree__hidden', `+${hidden} sub-task${hidden > 1 ? 's' : ''}`)
                    );
                }
                name.appendChild(layout);

                row.append(
                    name,
                    el('td', 'rlb-table__num rlb-muted', node.sessions ? String(node.sessions) : ''),
                    el('td', 'rlb-table__num rlb-muted', node.own > 0 ? formatMinutesHuman(node.own) : ''),
                    el('td', 'rlb-table__num rlb-tree__total', formatMinutesHuman(node.total))
                );
                tbody.appendChild(row);
            }

            table.appendChild(tbody);
            tableHost.replaceChildren(table);
        }

        paint();

        return section;
    };

    const countDescendants = node =>
        node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);

    // Numeric headers have to be right-aligned like their cells, or the column
    // label and the figures under it sit against opposite edges.
    const headerRow = columns => {
        const thead = el('thead');
        const row = el('tr');
        for (const column of columns) {
            const numeric = typeof column === 'object' && column.numeric;
            row.appendChild(el('th', numeric ? 'rlb-table__num' : '', column.label ?? column));
        }
        thead.appendChild(row);
        return thead;
    };

    /** A checkbox drawn in CSS, so it does not depend on Blueprint's icon font. */
    const statusMark = status => {
        if (!status) return null;
        const done = status === 'DONE';
        const mark = el('span', `rlb-status rlb-status--${done ? 'done' : 'todo'}`);
        mark.title = done ? 'DONE' : 'TODO';
        mark.setAttribute('role', 'img');
        mark.setAttribute('aria-label', done ? 'Done' : 'To do');
        return mark;
    };

    const taskLink = (title, taskUid) => {
        const accessibleName = `Open this block: ${title}`;
        const link = button(
            'bp3-button bp3-minimal bp3-small bp3-icon-document-open rlb-task-link',
            '',
            event => {
                event.stopPropagation();
                if (event.shiftKey) {
                    event.preventDefault();
                    void openBlockInRightSidebar(taskUid);
                    return;
                }
                close();
                void openBlock(taskUid);
            },
            { title: accessibleName }
        );
        link.appendChild(el('span', 'rlb-task-link__text', title));
        return link;
    };

    const act = async action => {
        try {
            await action();
        } catch (error) {
            console.error('[roam-logbook]', error);
        }
        render();
    };

    const dialogFocusables = dialog =>
        [...dialog.querySelectorAll('button, select, input, textarea, a[href], [tabindex]:not([tabindex="-1"])')].filter(
            node => !node.disabled && node.getAttribute('aria-hidden') !== 'true'
        );

    const onKeyDown = event => {
        if (!root?.classList.contains('rlb-root--open')) return;
        const dialog = root.querySelector('.rlb-dialog');
        if (!dialog) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
            return;
        }
        if (event.key !== 'Tab') return;

        const focusables = dialogFocusables(dialog);
        event.preventDefault();
        event.stopPropagation();
        if (focusables.length === 0) {
            dialog.focus();
            return;
        }

        const first = focusables[0];
        const last = focusables.at(-1);
        const active = document.activeElement;
        const index = focusables.indexOf(active);
        if (event.shiftKey) {
            if (index <= 0) last.focus();
            else focusables[index - 1].focus();
        } else if (index < 0 || index === focusables.length - 1) {
            first.focus();
        } else {
            focusables[index + 1].focus();
        }
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
            'Focus sessions, activity, and task rollups'
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
                render();
        });
        selectWrapper.appendChild(select);

        header.append(
            selectWrapper,
            button('bp3-button bp3-minimal bp3-small bp3-icon-refresh rlb-icon-button', '', () => {
                render();
            }, { title: 'Reload from the graph' }),
            button(
                'bp3-dialog-close-button bp3-button bp3-minimal bp3-icon-cross rlb-icon-button',
                '',
                close,
                { title: 'Close' }
            )
        );

        summaryNode = el('div', 'rlb-summary');
        bodyNode = el('div', 'rlb-body rlb-body__scroll');
        dialog.append(header, summaryNode, bodyNode);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        return overlay;
    };

    function close() {
        if (!root) return;
        clearLiveTicker();
        resetDiscardConfirmation();
        root.classList.remove('rlb-root--open');
        root.setAttribute('aria-hidden', 'true');
        document.removeEventListener('keydown', onKeyDown, true);
        if (returnFocusTo?.isConnected) returnFocusTo.focus();
        returnFocusTo = null;
    }

    return {
        open({ returnFocusTo: requestedFocus } = {}) {
            const active = document.activeElement;
            returnFocusTo = requestedFocus?.isConnected
                ? requestedFocus
                : active && active !== document.body && active.isConnected
                  ? active
                  : null;
            if (!root) root = build();
            root.classList.add('rlb-root--open');
            root.setAttribute('aria-hidden', 'false');
            document.addEventListener('keydown', onKeyDown, true);
            render();
            const dialog = root.querySelector('.rlb-dialog');
            const initial = dialogFocusables(dialog)[0];
            (initial || dialog)?.focus();
        },
        close,
        destroy() {
            clearLiveTicker();
            resetDiscardConfirmation();
            document.removeEventListener('keydown', onKeyDown, true);
            root?.remove();
            root = null;
            summaryNode = null;
            bodyNode = null;
        },
    };
}
