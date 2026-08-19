import { button, el } from './dom.js';
import { openBlock, openBlockInRightSidebar } from './roam.js';
import { formatDisplayTitle } from './task-display.js';

export const headerRow = (
    columns,
    { sortBy = null, direction = 'desc', onSort = null } = {}
) => {
    const thead = el('thead');
    const row = el('tr');
    for (const column of columns) {
        const config = typeof column === 'object' ? column : { label: column };
        const classes = [
            config.numeric ? 'rlb-table__num' : '',
            config.visuallyHidden ? 'rlb-visually-hidden' : '',
        ]
            .filter(Boolean)
            .join(' ');
        const header = el('th', classes);
        header.setAttribute('scope', 'col');
        if (config.sortKey) header.dataset.sortKey = config.sortKey;
        if (config.sortKey && onSort) {
            const active = config.sortKey === sortBy;
            if (active) {
                header.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : 'descending');
            }
            const sortButton = button(
                'bp3-button bp3-minimal bp3-small rlb-task-sort-button',
                '',
                () => onSort(config.sortKey),
                { title: config.title || `Sort by ${config.label}` }
            );
            sortButton.setAttribute('aria-pressed', String(active));
            sortButton.appendChild(el('span', 'rlb-task-sort-label', config.label));
            if (active) {
                const arrow = el('span', 'rlb-task-sort-arrow', direction === 'asc' ? '↑' : '↓');
                arrow.setAttribute('aria-hidden', 'true');
                sortButton.appendChild(arrow);
            }
            header.appendChild(sortButton);
        } else {
            header.textContent = config.label;
        }
        row.appendChild(header);
    }
    thead.appendChild(row);
    return thead;
};

/** A checkbox drawn in CSS, so it does not depend on Blueprint's icon font. */
export const statusMark = status => {
    if (!status) return null;
    const done = status === 'DONE';
    const mark = el('span', `rlb-status rlb-status--${done ? 'done' : 'todo'}`);
    mark.title = done ? 'DONE' : 'TODO';
    mark.setAttribute('role', 'img');
    mark.setAttribute('aria-label', done ? 'Done' : 'To do');
    return mark;
};

export const taskLink = (row, { onClose = () => {} } = {}) => {
    const title = formatDisplayTitle(row);
    const accessibleName = `Open this block: ${title}`;
    const link = button(
        'bp3-button bp3-minimal bp3-small rlb-task-link',
        '',
        event => {
            event.stopPropagation();
            if (event.shiftKey) {
                event.preventDefault();
                void openBlockInRightSidebar(row.taskUid);
                return;
            }
            onClose();
            void openBlock(row.taskUid);
        },
        // The visible text is the task title alone, so the accessible name has
        // to spell out the action; the tooltip repeats it for mouse users.
        { title: accessibleName, ariaLabel: accessibleName }
    );
    link.appendChild(el('span', 'rlb-task-link__text', title));
    return link;
};
