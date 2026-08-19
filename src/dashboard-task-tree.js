import { button, el } from './dom.js';
import { flattenForest, transformTaskForest } from './stats.js';
import { formatMinutesHuman } from './time.js';
import { headerRow } from './dashboard-table.js';

const countDescendants = node =>
    node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);

export function tasksSection(
    tree,
    { taskView, collapsedByFilter, taskLink, statusMark, taskTimingAction }
) {
    const section = el('section', 'rlb-dashboard-section rlb-dashboard-panel rlb-by-task');
    section.setAttribute('aria-labelledby', 'roam-logbook-by-task-title');
    const heading = el('div', 'rlb-section__heading rlb-panel__header');
    const title = el('h3', 'rlb-section__title', 'By task');
    title.id = 'roam-logbook-by-task-title';
    heading.appendChild(title);

    const taskCount = el('span', 'rlb-task-count');
    heading.appendChild(taskCount);

    const rollupHelp =
        'Totals include sub-tasks. A task shown under more than one parent may overlap between branches; headline totals count each Session once.';
    const info = button(
        'bp3-button bp3-minimal bp3-small bp3-icon-info-sign rlb-tree__info',
        '',
        null,
        { title: rollupHelp }
    );
    info.setAttribute('role', 'img');
    info.setAttribute('tabindex', '-1');
    info.setAttribute('aria-describedby', 'roam-logbook-task-rollup-help');
    heading.appendChild(info);
    const help = el('span', 'rlb-visually-hidden', rollupHelp);
    help.id = 'roam-logbook-task-rollup-help';
    section.appendChild(help);

    const filterGroup = el('div', 'rlb-task-filters');
    filterGroup.setAttribute('role', 'group');
    filterGroup.setAttribute('aria-label', 'Filter tasks by status');
    for (const [value, label] of [
        ['ALL', 'All'],
        ['TODO', 'TODO'],
        ['DONE', 'DONE'],
    ]) {
        const filterButton = button(
            'bp3-button bp3-minimal bp3-small rlb-task-filter',
            label,
            () => {
                taskView.filter = value;
                paintTaskTable();
            },
            { title: `Show ${label === 'All' ? 'all tasks' : `${label} tasks`}` }
        );
        filterButton.dataset.filter = value;
        filterButton.setAttribute('aria-pressed', String(taskView.filter === value));
        filterGroup.appendChild(filterButton);
    }
    heading.appendChild(filterGroup);

    let visibleParentUids = [];
    const toggleAll = button(
        'bp3-button bp3-minimal bp3-small rlb-tree__collapse-all',
        '',
        () => {
            const viewCollapsed = collapsedByFilter[taskView.filter];
            const anyExpanded = visibleParentUids.some(uid => !viewCollapsed.has(uid));
            if (anyExpanded) {
                for (const uid of visibleParentUids) viewCollapsed.add(uid);
            } else {
                for (const uid of visibleParentUids) viewCollapsed.delete(uid);
            }
            paintTaskTable();
        }
    );
    heading.appendChild(toggleAll);
    section.appendChild(heading);

    const tableHost = el('div', 'rlb-task-table-host');
    section.appendChild(tableHost);

    function paintTaskTable() {
        const transformed = transformTaskForest(tree, {
            filter: taskView.filter,
            sortBy: taskView.sortBy,
            direction: taskView.direction,
        });
        const viewCollapsed = collapsedByFilter[taskView.filter];
        const completeViewRows = flattenForest(transformed.forest);
        visibleParentUids = [
            ...new Set(completeViewRows.filter(node => node.hasChildren).map(node => node.taskUid)),
        ];
        const rows = flattenForest(transformed.forest, {
            isCollapsed: node => viewCollapsed.has(node.taskUid),
        });
        const anyExpanded = visibleParentUids.some(uid => !viewCollapsed.has(uid));
        taskCount.textContent = `${transformed.matchCount} of ${transformed.totalCount} Tasks`;
        for (const filterButton of filterGroup.querySelectorAll('[data-filter]')) {
            filterButton.setAttribute(
                'aria-pressed',
                String(filterButton.dataset.filter === taskView.filter)
            );
        }
        toggleAll.textContent = anyExpanded ? 'Collapse all' : 'Expand all';
        toggleAll.hidden = visibleParentUids.length === 0;

        if (transformed.forest.length === 0) {
            const emptyMessage =
                taskView.filter === 'TODO'
                    ? 'No TODO Tasks in the selected range.'
                    : taskView.filter === 'DONE'
                      ? 'No DONE Tasks in the selected range.'
                      : 'No tasks in the selected range.';
            tableHost.replaceChildren(el('div', 'rlb-task-empty', emptyMessage));
            return;
        }

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
            headerRow(
                [
                    'Task',
                    {
                        label: 'Sessions',
                        numeric: true,
                        sortKey: 'sessions',
                        title: 'Sort by Sessions',
                    },
                    {
                        label: 'Own',
                        numeric: true,
                        sortKey: 'own',
                        title: 'Time recorded directly on this Task',
                    },
                    {
                        label: 'Total',
                        numeric: true,
                        sortKey: 'total',
                        title: 'Own time plus all sub-tasks',
                    },
                ],
                {
                    sortBy: taskView.sortBy,
                    direction: taskView.direction,
                    onSort: sortBy => {
                        if (taskView.sortBy === sortBy) {
                            taskView.direction = taskView.direction === 'desc' ? 'asc' : 'desc';
                        } else {
                            taskView.sortBy = sortBy;
                            taskView.direction = 'desc';
                        }
                        paintTaskTable();
                    },
                }
            )
        );
        const tbody = el('tbody');

        for (const node of rows) {
            const row = el('tr');
            const name = el('td', 'rlb-tree__cell');
            const layout = el('div', 'rlb-tree__layout');
            const leading = el('div', 'rlb-tree__leading');
            const content = el('div', 'rlb-tree__content');
            name.style.paddingLeft = `${8 + node.depth * 20}px`;
            row.setAttribute('aria-level', String(node.depth + 1));

            if (node.hasChildren) {
                const caret = button(
                    `bp3-button bp3-minimal bp3-small rlb-tree__toggle bp3-icon-chevron-${
                        node.collapsed ? 'right' : 'down'
                    }`,
                    '',
                    () => {
                        if (viewCollapsed.has(node.taskUid)) viewCollapsed.delete(node.taskUid);
                        else viewCollapsed.add(node.taskUid);
                        paintTaskTable();
                    },
                    { title: node.collapsed ? 'Expand sub-tasks' : 'Collapse sub-tasks' }
                );
                caret.setAttribute('aria-expanded', String(!node.collapsed));
                caret.setAttribute('aria-label', node.collapsed ? 'Expand sub-tasks' : 'Collapse sub-tasks');
                leading.appendChild(caret);
            } else {
                // Keeps every title on the same left edge, caret or not.
                leading.appendChild(el('span', 'rlb-tree__toggle rlb-tree__toggle--empty'));
            }

            const mark = statusMark(node.status);
            if (mark) leading.appendChild(mark);
            if (node.status === 'DONE') row.classList.add('rlb-row--done');
            if (node.context) row.classList.add('rlb-row--context');
            content.appendChild(taskLink(node));
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
            // Keep the third layout item compatible with the existing
            // collapsed-summary rail; actions live inside that rail.
            const actions = el('div', 'rlb-muted rlb-tree__actions');
            if (node.collapsed) {
                const hidden = countDescendants(node);
                actions.appendChild(
                    el('span', 'rlb-muted rlb-tree__hidden', `+${hidden} sub-task${hidden > 1 ? 's' : ''}`)
                );
            }
            const timingAction = taskTimingAction(node);
            if (timingAction) actions.appendChild(timingAction);
            layout.append(leading, content, actions);
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

    paintTaskTable();
    return section;
}
