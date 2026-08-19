export const TASKS = String.raw`.rlb-panel__header {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    margin-bottom: 7px;
}

.rlb-panel__header .rlb-section__title {
    flex: 0 0 auto;
}

.rlb-panel__notice {
    color: var(--rlb-muted);
    font-size: 11px;
    font-weight: 500;
}

.rlb-panel__notice {
    margin-left: auto;
}

.rlb-section__title {
    margin: 0;
    color: var(--rlb-muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.55px;
    line-height: 1.25;
    text-transform: uppercase;
}

.rlb-by-task {
    overflow: visible;
}

/* The task toolbar and table header belong to the document flow. Keeping them
   static prevents a dashboard scroll from turning them into an opaque banner
   over the task rows. */
.rlb-by-task > .rlb-section__heading,
.rlb-by-task .rlb-task-table thead th {
    position: static;
}

.rlb-task-count {
    flex: 0 0 auto;
    color: var(--rlb-muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    white-space: nowrap;
}

.rlb-task-filters {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 1px;
    min-width: 0;
    padding: 2px;
    border: 1px solid var(--rlb-border-light);
    border-radius: 5px;
    background: var(--rlb-surface-subtle);
}

.rlb-root .bp3-button.rlb-task-filter {
    min-width: 38px;
    height: 22px;
    min-height: 22px;
    padding: 2px 7px;
    border-radius: 3px;
    color: var(--rlb-muted);
    font-size: 10px;
    font-weight: 600;
}

.rlb-task-filter[aria-pressed='true'] {
    background: var(--rlb-surface);
    box-shadow: 0 1px 2px rgba(16, 22, 26, 0.12);
    color: var(--rlb-text);
}

.rlb-root .bp3-button.rlb-tree__collapse-all {
    flex: 0 0 auto;
    height: 22px;
    min-height: 22px;
    margin-left: auto;
    padding: 2px 6px;
    color: var(--rlb-text);
    font-size: 11px;
    font-weight: 600;
}

.rlb-task-table-host {
    min-width: 0;
}

.rlb-task-empty {
    padding: 20px 8px 12px;
    color: var(--rlb-muted);
    font-size: 12px;
    text-align: center;
}

.rlb-row--context > td {
    color: var(--rlb-muted);
    opacity: 1;
}

.rlb-row--context .rlb-task-link {
    color: var(--rlb-muted);
}

.rlb-task-sort-button {
    display: inline-flex;
    width: 100%;
    min-height: 22px;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    padding: 2px 0 2px 4px;
    color: inherit;
    font-size: inherit;
    font-weight: 600;
    letter-spacing: inherit;
    line-height: inherit;
    text-transform: inherit;
}

.rlb-task-table th:not(.rlb-table__num) .rlb-task-sort-button {
    justify-content: flex-start;
}

.rlb-task-sort-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.rlb-task-sort-arrow {
    flex: 0 0 auto;
    color: var(--rlb-text);
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
}

.rlb-dashboard .rlb-table tbody tr:hover td {
    background: rgba(167, 182, 194, 0.12);
}

.rlb-dashboard .rlb-table tbody tr + tr td {
    border-top: 1px solid var(--rlb-border-light);
}

.rlb-dashboard .rlb-data-issues {
    margin: 4px 0 0;
    border: 0;
    border-radius: 0;
    color: var(--rlb-muted);
}

.rlb-dashboard .rlb-data-issues__summary {
    padding: 4px 0;
    font-size: 10px;
    font-weight: 600;
}

.rlb-dashboard .rlb-data-issues__list {
    padding: 0 0 4px;
}

.rlb-dashboard .rlb-data-issues__item {
    font-size: 10px;
}

`;
