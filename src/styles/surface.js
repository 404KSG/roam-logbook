export const SURFACE = String.raw`/* ---- popover ---- */

/* Lives on <body>, positioned from the button's rect, so the topbar cannot clip it. */
.rlb-popover {
    position: fixed;
    z-index: 30;
    box-sizing: border-box;
    width: min(460px, calc(100vw - 16px));
    max-width: calc(100vw - 16px);
    max-height: 70vh;
    overflow-x: hidden;
    overflow-y: auto;
    /* Reserve the classic scrollbar's width without painting a permanent
       scrollbar rail. This keeps the popover content from shifting when a
       Today tree crosses the overflow threshold. */
    scrollbar-gutter: stable;
    padding: 8px;
    text-align: left;
    cursor: default;
}

.rlb-popover__title {
    min-width: 0;
    padding: 3px 6px 6px;
    color: var(--rlb-muted);
    font-size: var(--rlb-surface-title-size, 10px);
    font-weight: 600;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    opacity: 1;
}

.rlb-surface__header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content;
    align-items: center;
    column-gap: 6px;
    box-sizing: border-box;
    height: 32px;
    min-height: 32px;
    min-width: 0;
    margin: 0 2px 5px;
    padding: 0;
    border-bottom: 1px solid var(--rlb-surface-border-light);
}

.rlb-surface__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
    min-width: 0;
}

.rlb-surface__header > .rlb-surface__actions {
    margin: 0;
}

.rlb-surface__view-switch {
    display: flex;
    gap: 2px;
    align-items: center;
    align-self: stretch;
    min-width: 0;
    margin: 0;
    padding: 0;
    overflow: hidden;
}

.rlb-surface__view-control {
    display: inline-flex !important;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: auto;
    min-width: 0 !important;
    height: 32px;
    min-height: 32px !important;
    max-height: 32px;
    padding: 0 8px !important;
    border-radius: 4px;
    color: var(--rlb-muted);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.2;
    white-space: nowrap;
}

.rlb-surface__header .rlb-surface__view-control.is-selected {
    color: var(--rlb-text);
    background: var(--rlb-surface-focused);
    box-shadow: inset 0 0 0 1px var(--rlb-surface-border-light);
}

.rlb-surface__header .rlb-surface__view-control:hover,
.rlb-surface__header .rlb-surface__view-control:focus-visible {
    color: var(--rlb-text);
    background: var(--rlb-surface-hover);
}

.rlb-surface__view-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    min-width: 2ch;
    height: 14px;
    color: var(--rlb-muted);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    opacity: 0.82;
}

.rlb-surface__view-count--error {
    font-weight: 700;
}

.rlb-surface__spinner {
    display: inline-block;
    box-sizing: border-box;
    width: 10px;
    height: 10px;
    border: 1.5px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: rlb-surface-spin 720ms linear infinite;
}

@keyframes rlb-surface-spin {
    to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
    .rlb-surface__spinner {
        animation: none;
    }
}

.rlb-surface__header .bp3-button {
    flex: 0 0 auto;
    color: #5c7080;
}

.bp3-dark .rlb-surface__header .bp3-button {
    color: #a7b6c2;
}

.rlb-surface__icon-button {
    box-sizing: border-box;
    display: inline-flex !important;
    align-items: center;
    justify-content: center;
    flex: 0 0 var(--rlb-surface-action-height);
    width: var(--rlb-surface-action-height);
    min-width: var(--rlb-surface-action-height) !important;
    max-width: var(--rlb-surface-action-height);
    height: var(--rlb-surface-action-height);
    min-height: var(--rlb-surface-action-height) !important;
    max-height: var(--rlb-surface-action-height);
    margin: 0;
    padding: 0 !important;
    border-radius: 4px;
}

.rlb-surface__icon-button::before {
    margin: 0 !important;
}

.rlb-surface__icon-button:hover,
.rlb-surface__icon-button:focus-visible {
    background: var(--rlb-surface-hover);
}

.rlb-popover__empty {
    padding: 6px 6px 12px;
    color: var(--rlb-muted);
    overflow-wrap: anywhere;
    opacity: 1;
}

.rlb-surface__inline-status {
    display: flex;
    align-items: center;
    min-width: 0;
    min-height: 28px;
    padding: 2px 6px 5px;
    color: var(--rlb-muted);
    font-size: 11px;
    line-height: 1.25;
}

.rlb-surface__inline-message,
.rlb-surface__inline-separator {
    flex: 0 0 auto;
}

.bp3-button.bp3-minimal.rlb-surface__retry {
    flex: 0 0 auto;
    min-height: 28px;
    margin: 0;
    padding: 0 3px !important;
    color: var(--rlb-text);
    font-size: 11px;
    font-weight: 600;
}

.bp3-button.bp3-minimal.rlb-surface__retry:hover,
.bp3-button.bp3-minimal.rlb-surface__retry:focus-visible {
    color: var(--rlb-text);
    background: var(--rlb-surface-hover);
}

.rlb-surface__list {
    display: grid;
    gap: 0;
    min-width: 0;
    margin: 0 2px;
    padding: 0;
}

.rlb-surface__section {
    min-width: 0;
}

.rlb-surface__section--focused {
    margin-bottom: 6px;
    padding: 3px;
    border: 1px solid var(--rlb-surface-border);
    border-radius: 6px;
    background: var(--rlb-surface-focused);
}

.rlb-surface__section--focused .rlb-surface__section-label {
    padding: 3px 6px 2px;
}

.rlb-surface__section--focused .rlb-run {
    padding: 6px 6px 7px;
}

.rlb-surface__section--focused .rlb-run:hover,
.rlb-surface__section--focused .rlb-run:focus-within {
    background: var(--rlb-surface-hover);
}

.rlb-surface__section--recent {
    margin-top: 1px;
}

.rlb-surface__section--recent .rlb-surface__section-label {
    padding: 4px 6px 4px;
    border-bottom: 1px solid var(--rlb-surface-border-light);
}

.rlb-surface__section--recent .rlb-run {
    grid-template-columns: minmax(0, 1fr) max-content;
    padding: 6px;
    border-radius: 0;
    background: transparent;
}

.rlb-surface__section--recent .rlb-run + .rlb-run {
    border-top: 1px solid var(--rlb-surface-border-light);
}

.rlb-surface__section--recent .rlb-run:hover,
.rlb-surface__section--recent .rlb-run:focus-within {
    background: var(--rlb-surface-hover);
}

.rlb-surface__section--open-lines .rlb-surface__section-label {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 2px;
    align-items: start;
}

.rlb-surface__section-context {
    display: block;
    margin-left: 0;
    color: var(--rlb-muted);
    font-size: 11px;
    font-weight: 400;
    letter-spacing: 0;
    text-transform: none;
    white-space: nowrap;
}


.rlb-surface__section-label {
    padding: 7px 6px 3px;
    color: var(--rlb-muted);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.65px;
    line-height: 1.2;
    text-transform: uppercase;
}

.rlb-run--recent {
    opacity: 0.88;
}

.rlb-run--recent:hover,
.rlb-run--recent:focus-within {
    opacity: 1;
}

.rlb-popover__notice {
    margin: 6px;
    padding: 6px 8px;
    color: #8a4b08;
    background: rgba(217, 130, 43, 0.14);
    border-radius: 3px;
}

.rlb-data-issues {
    margin: 14px 0 0;
    border: 1px solid var(--rlb-border, rgba(16, 22, 26, 0.14));
    border-radius: 3px;
    color: var(--rlb-muted, #5c7080);
}

.rlb-data-issues__summary {
    padding: 8px 10px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.35px;
}

.rlb-data-issues__list {
    display: grid;
    gap: 6px;
    padding: 0 10px 10px;
}

.rlb-data-issues__item {
    overflow-wrap: anywhere;
    font-size: 11px;
    line-height: 1.4;
}

.rlb-surface__footer {
    display: flex;
    min-width: 0;
    gap: 5px;
    margin: 6px 2px 0;
    padding-top: 6px;
    border-top: 1px solid var(--rlb-surface-border);
}

.rlb-surface__footer .bp3-button {
    flex: 1 1 auto;
    min-width: 0;
    width: 100%;
    height: var(--rlb-surface-action-height);
    min-height: var(--rlb-surface-action-height);
    max-height: var(--rlb-surface-action-height);
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    font-size: var(--rlb-surface-action-size, 12px);
    line-height: 1;
    padding: 0 8px;
}

.rlb-surface__footer .bp3-button:not(.bp3-minimal) {
    border: 1px solid var(--rlb-surface-border);
    border-radius: 4px;
    background: transparent;
    box-shadow: none;
    color: #5c7080;
}

.rlb-surface__footer .bp3-button:not(.bp3-minimal):hover,
.rlb-surface__footer .bp3-button:not(.bp3-minimal):focus-visible {
    background: var(--rlb-surface-hover);
}

.bp3-dark .rlb-surface__footer {
    border-top-color: rgba(255, 255, 255, 0.15);
}

.rlb-run {
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content;
    align-items: start;
    grid-auto-rows: minmax(0, auto);
    gap: 5px;
    padding: var(--rlb-surface-row-padding, 5px) 6px;
    border-radius: 3px;
}

.rlb-run:hover {
    background: rgba(167, 182, 194, 0.2);
}

.rlb-run__body {
    min-width: 0;
    display: contents;
}

.bp3-button.bp3-minimal.rlb-run__title {
    grid-column: 1;
    grid-row: 1;
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    padding: 0;
    color: var(--rlb-surface-link);
    font-size: var(--rlb-surface-task-size, 15px);
    font-weight: 500;
    line-height: 1.25;
    text-decoration: none;
    border-radius: 2px;
}

.bp3-button.bp3-minimal.rlb-run__title::before {
    display: none !important;
    content: none !important;
}

.bp3-button.bp3-minimal.rlb-run__title:hover,
.bp3-button.bp3-minimal.rlb-run__title:focus-visible {
    color: var(--rlb-surface-link-hover);
    text-decoration: none;
}

.bp3-button.bp3-minimal.rlb-run__title:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
}

.rlb-surface__section--focused .bp3-button.bp3-minimal.rlb-run__title {
    font-weight: 600;
}

.rlb-surface__section--recent .bp3-button.bp3-minimal.rlb-run__title {
    font-size: 13px;
    font-weight: 500;
}

.rlb-run__meta {
    grid-column: 1;
    grid-row: 2;
    display: block;
    min-width: 0;
    font-size: var(--rlb-surface-meta-size, 10px);
    line-height: 1.25;
    color: var(--rlb-muted);
    opacity: 1;
    font-variant-numeric: tabular-nums;
}

.rlb-run__meta .rlb-run__meta-primary {
    display: inline-flex;
    align-items: baseline;
    min-width: 0;
}

.rlb-surface__section--focused .rlb-run__elapsed {
    color: #405b70;
    font-size: 1.08em;
    font-weight: 700;
}

.rlb-surface__section--focused .rlb-run__meta {
    opacity: 1;
}

.rlb-surface__section--focused .rlb-run__total,
.rlb-surface__section--focused .rlb-run__started,
.rlb-surface__section--focused .rlb-run__meta > .rlb-run__meta-separator {
    color: var(--rlb-muted);
    opacity: 1;
}

.rlb-surface__section--focused .rlb-run__total {
    font-weight: 600;
}

.bp3-dark .rlb-surface__section--focused .rlb-run__elapsed {
    color: #c3d4df;
}

.rlb-surface__section--focused .rlb-run--overrun .rlb-run__elapsed {
    color: #cd4246;
}

.bp3-dark .rlb-surface__section--focused .rlb-run--overrun .rlb-run__elapsed {
    color: #ff7373;
}

.rlb-run__meta-line {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.rlb-run__started {
    cursor: help;
}

.rlb-run--inline-meta .rlb-run__meta {
    grid-column: 1 / 3;
    display: flex;
    align-items: baseline;
    flex-wrap: nowrap;
    gap: 0;
    max-width: 100%;
    white-space: nowrap;
}

.rlb-run--inline-meta .rlb-run__meta-line {
    flex: 0 1 auto;
    min-width: 0;
}

.rlb-run--inline-meta .rlb-run__meta-primary {
    flex: 0 1 auto;
}

.rlb-run--inline-meta .rlb-run__meta-separator {
    flex: 0 0 auto;
    margin: 0 6px;
    line-height: 1;
}

.rlb-run__meta-primary .rlb-run__meta-separator {
    margin: 0 2px;
}

.rlb-run--inline-meta .rlb-run__started {
    flex: 0 0 auto;
    max-width: none;
}

.rlb-run__actions {
    grid-column: 2;
    grid-row: 1 / span 2;
    display: flex;
    align-items: center;
    align-self: start;
    gap: 2px;
    flex: 0 0 auto;
}

.rlb-run--inline-meta .rlb-run__actions {
    grid-row: 1;
}

.rlb-run__actions .rlb-run__checkout {
    width: 32px;
    min-width: 32px;
    max-width: 32px;
    height: 32px;
    min-height: 32px;
    max-height: 32px;
    padding: 0 !important;
    justify-content: center;
    align-items: center;
    color: #5c7080;
}

.rlb-run__actions .rlb-run__focus {
    width: 28px;
    min-width: 28px;
    max-width: 28px;
    height: 28px;
    min-height: 28px;
    max-height: 28px;
    padding: 0 !important;
    justify-content: center;
    align-items: center;
    color: var(--rlb-muted, #7a8b99);
}

.rlb-run__actions .rlb-run__focus:hover,
.rlb-run__actions .rlb-run__focus:focus-visible {
    color: var(--rlb-surface-link-hover);
    background: rgba(167, 182, 194, 0.24);
}

.rlb-run__actions .rlb-run__completed {
    display: inline-flex;
    flex: 0 0 28px;
    width: 28px;
    min-width: 28px;
    max-width: 28px;
    height: 28px;
    min-height: 28px;
    max-height: 28px;
    align-items: center;
    justify-content: center;
    color: var(--rlb-muted, #7a8b99);
    opacity: 0.8;
    pointer-events: none;
}

.rlb-run__actions .rlb-run__completed::before {
    margin: 0;
}

.rlb-run__actions .rlb-run__checkout:hover,
.rlb-run__actions .rlb-run__checkout:focus {
    color: #c23030;
}

.rlb-run__actions .bp3-icon-trash {
    box-sizing: border-box;
    display: inline-flex;
    flex: 0 0 var(--rlb-surface-action-height, 32px);
    width: var(--rlb-surface-action-height, 32px);
    min-width: var(--rlb-surface-action-height, 32px);
    max-width: var(--rlb-surface-action-height, 32px);
    height: var(--rlb-surface-action-height, 32px);
    min-height: var(--rlb-surface-action-height, 32px);
    max-height: var(--rlb-surface-action-height, 32px);
    padding: 0 !important;
    align-items: center;
    justify-content: center;
    color: #5c7080;
    opacity: 0.65;
}

.rlb-run__actions .bp3-icon-trash:hover,
.rlb-run__actions .bp3-icon-trash:focus {
    color: #c23030;
    opacity: 1;
}

.rlb-today__tree {
    display: grid;
    min-width: 0;
    padding: 0 2px 2px;
}

.rlb-today__control {
    color: var(--rlb-muted);
}

.rlb-today__control:hover,
.rlb-today__control:focus-visible {
    color: var(--rlb-surface-link-hover);
    background: var(--rlb-surface-hover);
}

.rlb-today__row {
    display: grid;
    --rlb-today-action-column: 32px;
    grid-template-columns: minmax(0, 1fr) var(--rlb-today-action-column);
    align-items: center;
    box-sizing: border-box;
    min-width: 0;
    min-height: 30px;
    padding: 2px 4px 2px min(60px, calc(4px + (var(--rlb-today-depth, 0) * 14px)));
    border-radius: 4px;
}

.rlb-today__row:hover,
.rlb-today__row:focus-within {
    background: var(--rlb-surface-hover);
}

.rlb-today__rail {
    display: flex;
    align-items: center;
    overflow: hidden;
    width: 100%;
    min-width: 0;
}

.rlb-today__toggle,
.rlb-today__spacer {
    display: inline-flex !important;
    align-items: center;
    justify-content: center;
    flex: 0 0 24px;
    width: 24px;
    min-width: 24px !important;
    height: 24px;
    min-height: 24px !important;
    padding: 0 !important;
    color: var(--rlb-muted);
}

.rlb-today__toggle:hover,
.rlb-today__toggle:focus-visible {
    color: var(--rlb-surface-link-hover);
    background: var(--rlb-surface-hover);
}

.bp3-button.bp3-minimal.rlb-today__title {
    display: block !important;
    flex: 1 1 0;
    width: 0;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    padding: 3px 4px !important;
    color: var(--rlb-surface-link);
    font-size: 13px;
    font-weight: 500;
    line-height: 1.25;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.bp3-button.bp3-minimal.rlb-today__title:hover,
.bp3-button.bp3-minimal.rlb-today__title:focus-visible {
    color: var(--rlb-surface-link-hover);
}

.rlb-today__action {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0;
    width: var(--rlb-today-action-column);
    min-width: var(--rlb-today-action-column);
    max-width: var(--rlb-today-action-column);
    justify-self: end;
    overflow: visible;
    color: var(--rlb-muted);
}

.rlb-today__play {
    display: inline-flex !important;
    align-items: center;
    justify-content: center;
    width: 28px;
    min-width: 28px !important;
    height: 28px;
    min-height: 28px !important;
    padding: 0 !important;
    color: var(--rlb-muted);
}

.rlb-today__play:hover,
.rlb-today__play:focus-visible {
    color: var(--rlb-surface-link-hover);
    background: var(--rlb-surface-hover);
}

.rlb-today__timing {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    min-width: 28px;
    max-width: 28px;
    height: 28px;
    min-height: 28px;
    max-height: 28px;
    color: var(--rlb-muted);
}

.rlb-today__timing::before {
    margin: 0;
}

@media (max-width: 340px) {
    .rlb-popover {
        padding: 6px;
    }

    .rlb-today__row {
        padding-right: 2px;
    }

    .bp3-button.bp3-minimal.rlb-today__title {
        font-size: 12px;
    }
}

.rlb-table .rlb-running__checkout {
    width: 32px;
    min-width: 32px;
    max-width: 32px;
    height: 32px;
    min-height: 32px;
    max-height: 32px;
    padding: 0 !important;
    justify-content: center;
    align-items: center;
    color: #5c7080;
}

.rlb-table .rlb-running__checkout:hover,
.rlb-table .rlb-running__checkout:focus {
    color: #c23030;
}
`;
