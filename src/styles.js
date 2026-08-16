/**
 * Styles for the topbar widget and dashboard.
 *
 * Layout and spacing only — colour comes from Blueprint's own variables so the
 * extension follows Roam's light/dark theme without a second set of rules.
 */

export const STYLE_ID = 'roam-logbook-styles';

export const STYLES = `
.rlb-topbar {
    --rlb-topbar-load-yellow: #b38600;
    --rlb-topbar-load-red: #c23030;
    display: flex;
    align-items: center;
    position: relative;
    flex: 0 0 auto;
    min-width: max-content;
    max-width: 100%;
    white-space: nowrap;
    /* Roam's controls carry no margin of their own, so the widget has to keep
       its own distance rather than butt up against the one beside it. */
    margin: 0 3px;
}

.rlb-topbar__button {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    min-width: 30px;
    height: 30px;
    min-height: 30px;
    padding: 0 4px;
    overflow: visible;
    min-width: max-content;
    max-width: 100%;
    white-space: nowrap;
    background: transparent;
    font-variant-numeric: tabular-nums;
}

/* Idle is a real icon-only control, not a max-content text button. Roam's
   Blueprint button rules otherwise collapse the hit target to the icon's
   pseudo-element, which paints the hover state as a narrow vertical strip. */
.rlb-topbar__button--icon-only {
    position: relative;
    width: 32px !important;
    min-width: 32px !important;
    max-width: 34px !important;
    height: 32px !important;
    min-height: 32px !important;
    max-height: 34px !important;
    padding: 0 !important;
    border-radius: 4px;
}

.rlb-topbar__button--icon-only::before {
    display: none !important;
    content: none !important;
}

.rlb-topbar__button--icon-only > .rlb-topbar__icon {
    display: block;
    flex: 0 0 16px;
    width: 16px;
    height: 16px;
    margin: 0 !important;
}

.rlb-topbar__button--icon-only:hover,
.rlb-topbar__button--icon-only:focus-visible {
    background: rgba(167, 182, 194, 0.24) !important;
}

.rlb-topbar__button--paused {
    background: transparent !important;
}

.rlb-topbar__button--paused > .rlb-topbar__icon {
    color: var(--rlb-topbar-load-yellow) !important;
}

.rlb-topbar__button--paused:hover,
.rlb-topbar__button--paused:focus-visible {
    background: rgba(167, 182, 194, 0.24) !important;
}

.bp3-dark .rlb-topbar__button--paused > .rlb-topbar__icon {
    color: var(--rlb-topbar-load-yellow) !important;
}

.bp3-dark .rlb-topbar {
    --rlb-topbar-load-yellow: #e6c35c;
    --rlb-topbar-load-red: #ff7373;
}

/* The widget shares the left navigation row with Roam's expanding search.
   These classes are applied to the actual host/child found at attach time, so
   the search can shrink into remaining space without ever shrinking this unit. */
.rlb-topbar__layout {
    display: flex;
    align-items: center;
    min-width: 0;
    container-type: inline-size;
    container-name: rlb-topbar;
}

.rlb-topbar__layout > .rlb-topbar {
    flex: 0 0 auto;
    min-width: max-content;
    white-space: nowrap;
}

.rlb-topbar__search {
    flex: 1 1 auto;
    min-width: 0;
    max-width: 100%;
}

/* At genuinely narrow widths the elapsed value is the useful invariant. The
   session count remains available in the surface header rather than forcing a
   second line or overlapping Roam's search control. */
@container rlb-topbar (max-width: 420px) {
    .rlb-topbar__button--parallel {
        grid-template-columns: max-content !important;
    }

    .rlb-topbar__button--parallel > .rlb-topbar__separator,
    .rlb-topbar__button--parallel > .rlb-topbar__parallel {
        display: none !important;
    }
}

@media (max-width: 420px) {
    .rlb-topbar__button--parallel {
        grid-template-columns: max-content !important;
    }

    .rlb-topbar__button--parallel > .rlb-topbar__separator,
    .rlb-topbar__button--parallel > .rlb-topbar__parallel {
        display: none !important;
    }
}

.rlb-topbar__button--parallel {
    display: inline-grid !important;
    grid-template-columns: max-content 3px max-content !important;
    align-items: center !important;
    column-gap: 5px !important;
    row-gap: 0;
    padding: 0 4px !important;
}

.rlb-topbar__button.rlb-topbar__button--parallel > .rlb-topbar__time,
.rlb-topbar__button.rlb-topbar__button--parallel > .rlb-topbar__separator,
.rlb-topbar__button.rlb-topbar__button--parallel > .rlb-topbar__parallel {
    box-sizing: border-box !important;
    display: block !important;
    flex: 0 0 auto !important;
    width: max-content !important;
    min-width: 0 !important;
    max-width: none !important;
    margin: 0 !important;
    padding: 0 !important;
    line-height: 1 !important;
    white-space: nowrap !important;
    align-self: center !important;
}

.rlb-topbar__button.rlb-topbar__button--parallel > .rlb-topbar__separator {
    width: 3px !important;
    min-width: 3px !important;
    max-width: 3px !important;
    height: 3px !important;
    min-height: 3px !important;
    max-height: 3px !important;
    justify-self: center !important;
}

.rlb-topbar__icon {
    flex: 0 0 auto;
    color: #5c7080;
}

.bp3-dark .rlb-topbar__icon {
    color: #a7b6c2;
}

.rlb-topbar__parallel {
    color: #5c7080;
    font-size: 14px;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
}

.rlb-topbar__parallel--load-yellow {
    color: var(--rlb-topbar-load-yellow);
}

.rlb-topbar__parallel--load-red {
    color: var(--rlb-topbar-load-red);
}

.rlb-topbar__separator {
    width: 3px !important;
    min-width: 3px !important;
    max-width: 3px !important;
    height: 3px !important;
    min-height: 3px !important;
    max-height: 3px !important;
    border-radius: 50%;
    background: currentColor;
    color: #5c7080;
    justify-self: center;
}

.bp3-dark .rlb-topbar__parallel,
.bp3-dark .rlb-topbar__separator {
    color: #a7b6c2;
}

.bp3-dark .rlb-topbar__parallel--load-yellow {
    color: var(--rlb-topbar-load-yellow);
}

.bp3-dark .rlb-topbar__parallel--load-red {
    color: var(--rlb-topbar-load-red);
}

.rlb-topbar__time {
    display: inline-block;
    color: #5c7080;
    font-size: 14px;
    font-weight: 500;
    line-height: 1;
    letter-spacing: -0.015em;
    font-variant-numeric: tabular-nums;
    text-align: center;
    white-space: nowrap;
}

.rlb-topbar__time--neutral {
    color: #5c7080;
}

.bp3-dark .rlb-topbar__time--neutral {
    color: #a7b6c2;
}

.rlb-topbar__time--overrun {
    color: #c23030;
}

.bp3-dark .rlb-topbar__time--overrun {
    color: #ff7373;
}

.rlb-topbar__time--stale {
    color: #b56b17;
}

.bp3-dark .rlb-topbar__time--stale {
    color: #f29d49;
}

/* ---- popover ---- */

/* Lives on <body>, positioned from the button's rect, so the topbar cannot clip it. */
.rlb-popover {
    --rlb-surface-action-height: 32px;
    --rlb-surface-title-size: 10px;
    --rlb-surface-task-size: 13px;
    --rlb-surface-meta-size: 10px;
    --rlb-surface-action-size: 13px;
    --rlb-surface-row-padding: 5px;
    --rlb-surface-border: rgba(16, 22, 26, 0.12);
    --rlb-surface-border-light: rgba(16, 22, 26, 0.08);
    --rlb-surface-hover: rgba(167, 182, 194, 0.15);
    --rlb-surface-canvas: rgba(167, 182, 194, 0.04);
    --rlb-surface-link: #316a9f;
    --rlb-surface-link-hover: #2a5a8d;
    --rlb-session-running: #7eb794;
    position: fixed;
    z-index: 30;
    width: min(340px, calc(100vw - 16px));
    max-height: 70vh;
    overflow-y: auto;
    padding: 8px;
    text-align: left;
    cursor: default;
}

.rlb-popover__title {
    min-width: 0;
    padding: 3px 6px 6px;
    font-size: var(--rlb-surface-title-size, 10px);
    font-weight: 600;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    opacity: 0.6;
}

.rlb-surface__header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content;
    align-items: center;
    column-gap: 4px;
    min-width: 0;
}

.rlb-surface__header .rlb-popover__title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.rlb-surface__header .bp3-button {
    flex: 0 0 auto;
    color: #5c7080;
}

.bp3-dark .rlb-surface__header .bp3-button {
    color: #a7b6c2;
}

.rlb-popover__empty {
    padding: 6px 6px 12px;
    opacity: 0.7;
}

.rlb-surface__list {
    display: grid;
    gap: 0;
    min-width: 0;
    margin: 0 2px;
    padding: 2px;
    border: 1px solid var(--rlb-surface-border);
    border-radius: 6px;
    background: var(--rlb-surface-canvas);
}

.rlb-surface__list > .rlb-run + .rlb-run {
    border-top: 1px solid var(--rlb-surface-border-light);
    border-radius: 0 0 3px 3px;
}

.rlb-surface__list > .rlb-run {
    border-radius: 3px;
}

.rlb-surface__list > .rlb-run:hover {
    background: var(--rlb-surface-hover);
}

.rlb-surface__list > .rlb-popover__empty {
    padding: 6px 5px 8px;
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

.rlb-popover__footer {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(2, var(--rlb-surface-action-height));
    gap: 5px;
    padding-top: 6px;
    margin-top: 6px;
    border-top: 1px solid var(--rlb-surface-border);
}

.rlb-popover__footer .bp3-button {
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

.rlb-popover__footer .bp3-button:not(.bp3-minimal) {
    border: 1px solid var(--rlb-surface-border);
    border-radius: 4px;
    background: transparent;
    box-shadow: none;
    color: #5c7080;
}

.rlb-popover__footer .bp3-button:not(.bp3-minimal):hover,
.rlb-popover__footer .bp3-button:not(.bp3-minimal):focus-visible {
    background: var(--rlb-surface-hover);
}

.rlb-popover__footer .rlb-surface__refresh {
    grid-column: 2;
    grid-row: 2;
    width: 100%;
    min-width: var(--rlb-surface-action-height);
    max-width: none;
    justify-self: stretch;
    padding: 0 !important;
    align-items: center;
    justify-content: center;
    color: #5c7080;
}

@keyframes rlb-surface-refresh-spin {
    to {
        transform: rotate(360deg);
    }
}

.rlb-popover__footer .rlb-surface__refresh-cell {
    display: flex;
    align-items: stretch;
    justify-content: stretch;
    grid-column: 2;
    grid-row: 2;
    position: relative;
    min-width: 0;
    width: 100%;
    height: var(--rlb-surface-action-height);
    min-height: var(--rlb-surface-action-height);
    max-height: var(--rlb-surface-action-height);
}

.rlb-popover__footer .rlb-surface__refresh-cell .rlb-surface__refresh {
    grid-column: auto;
    grid-row: auto;
    box-sizing: border-box;
    flex: 1 1 auto;
    width: 100%;
    min-width: var(--rlb-surface-action-height);
    height: var(--rlb-surface-action-height);
    min-height: var(--rlb-surface-action-height);
    max-height: var(--rlb-surface-action-height);
    max-width: none;
    justify-self: stretch;
}

.rlb-popover__footer--empty {
    grid-template-columns: minmax(0, 1fr) 40px;
    grid-template-rows: var(--rlb-surface-action-height);
    align-items: stretch;
}

.rlb-popover__footer--empty > .bp3-button:first-child {
    grid-column: 1;
    grid-row: 1;
}

.rlb-popover__footer--empty .rlb-surface__refresh-cell {
    grid-column: 2;
    grid-row: 1;
    width: 40px;
    min-width: 40px;
    max-width: 40px;
    align-items: center;
    justify-content: center;
}

.rlb-popover__footer--empty .rlb-surface__refresh-cell .rlb-surface__refresh {
    flex: 0 0 var(--rlb-surface-action-height);
    width: var(--rlb-surface-action-height);
    min-width: var(--rlb-surface-action-height);
    max-width: var(--rlb-surface-action-height);
}

.rlb-popover__footer--single-running {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 40px;
    grid-template-rows: var(--rlb-surface-action-height);
    align-items: stretch;
}

.rlb-popover__footer--single-running > .bp3-button:first-child {
    grid-column: 1;
    grid-row: 1;
}

.rlb-popover__footer--single-running > .bp3-button:nth-child(2) {
    grid-column: 2;
    grid-row: 1;
}

.rlb-popover__footer--single-running .rlb-surface__refresh-cell {
    grid-column: 3;
    grid-row: 1;
    width: 40px;
    min-width: 40px;
    max-width: 40px;
    align-items: center;
    justify-content: center;
}

.rlb-popover__footer--single-running .rlb-surface__refresh-cell .rlb-surface__refresh {
    flex: 0 0 var(--rlb-surface-action-height);
    width: var(--rlb-surface-action-height);
    min-width: var(--rlb-surface-action-height);
    max-width: var(--rlb-surface-action-height);
}

.rlb-surface__refresh--loading::before {
    animation: rlb-surface-refresh-spin 900ms linear infinite;
}

@media (prefers-reduced-motion: reduce) {
    .rlb-surface__refresh--loading::before {
        animation: none;
    }
}

.rlb-popover__footer .rlb-surface__refresh:hover,
.rlb-popover__footer .rlb-surface__refresh:focus-visible {
    color: #3f596b;
    background: rgba(167, 182, 194, 0.24);
}

.bp3-dark .rlb-popover__footer {
    border-top-color: rgba(255, 255, 255, 0.15);
}

.bp3-dark .rlb-popover {
    --rlb-surface-border: rgba(255, 255, 255, 0.14);
    --rlb-surface-border-light: rgba(255, 255, 255, 0.09);
    --rlb-surface-hover: rgba(167, 182, 194, 0.18);
    --rlb-surface-canvas: rgba(167, 182, 194, 0.06);
    --rlb-surface-link: #7eb7d5;
    --rlb-surface-link-hover: #9dcae2;
    --rlb-session-running: #8ed0aa;
}

.rlb-run {
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr) max-content;
    align-items: start;
    grid-auto-rows: minmax(0, auto);
    gap: 5px;
    padding: var(--rlb-surface-row-padding, 5px) 6px;
    border-radius: 3px;
}

.rlb-run:hover {
    background: rgba(167, 182, 194, 0.2);
}

.rlb-run--overrun .rlb-run__meta {
    color: #cd4246;
    opacity: 1;
}

.bp3-dark .rlb-run--overrun .rlb-run__meta {
    color: #ff7373;
}

.rlb-run__body {
    min-width: 0;
    display: contents;
}

.rlb-run__status {
    grid-column: 1;
    grid-row: 1;
    align-self: center;
    width: 8px;
    height: 8px;
    margin-top: 0;
    border-radius: 50%;
    background: var(--rlb-session-running, #7eb794);
    opacity: 1;
    border: 0;
    box-shadow: none;
}

.rlb-run__status--paused {
    background: #8a9ba8;
}

.rlb-run__status--recovery {
    background: #d9822b;
}

.bp3-dark .rlb-run__status--recovery {
    background: #f29d49;
}

.bp3-button.bp3-minimal.rlb-run__title {
    grid-column: 2;
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
    text-decoration: underline;
    text-decoration-color: currentColor;
    text-decoration-thickness: 1px;
    text-underline-offset: 2px;
    border-radius: 2px;
}

.bp3-button.bp3-minimal.rlb-run__title::before {
    display: none !important;
    content: none !important;
}

.bp3-button.bp3-minimal.rlb-run__title:hover,
.bp3-button.bp3-minimal.rlb-run__title:focus-visible {
    color: var(--rlb-surface-link-hover);
    text-decoration-color: currentColor;
}

.bp3-button.bp3-minimal.rlb-run__title:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
}

.rlb-run__meta {
    grid-column: 2;
    grid-row: 2;
    display: block;
    min-width: 0;
    font-size: var(--rlb-surface-meta-size, 10px);
    line-height: 1.25;
    opacity: 0.65;
    font-variant-numeric: tabular-nums;
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

.rlb-run__actions {
    grid-column: 3;
    grid-row: 1 / span 2;
    display: flex;
    align-items: center;
    align-self: start;
    gap: 2px;
    flex: 0 0 auto;
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

.rlb-run__actions .rlb-run__checkout:hover,
.rlb-run__actions .rlb-run__checkout:focus {
    color: #c23030;
}

.rlb-run__actions .rlb-run__resume,
.rlb-run__actions .rlb-run__recovery {
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

.rlb-run__actions .rlb-run__resume:hover,
.rlb-run__actions .rlb-run__resume:focus-visible,
.rlb-run__actions .rlb-run__recovery:hover,
.rlb-run__actions .rlb-run__recovery:focus-visible {
    color: #3f596b;
    background: rgba(167, 182, 194, 0.24);
}

.rlb-run--paused .rlb-run__meta,
.rlb-run__state {
    color: #5c7080;
    opacity: 0.75;
}

.rlb-run--recovery .rlb-run__meta {
    color: #8a4b08;
    opacity: 1;
}

.bp3-dark .rlb-run--recovery .rlb-run__meta {
    color: #f29d49;
}

.rlb-run__actions .bp3-icon-trash {
    color: #5c7080;
    opacity: 0.65;
}

.rlb-run__actions .bp3-icon-trash:hover,
.rlb-run__actions .bp3-icon-trash:focus {
    color: #c23030;
    opacity: 1;
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

/* ---- dashboard ---- */

.rlb-root {
    display: none;
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    z-index: 100;
    justify-content: center;
    box-sizing: border-box;
    overflow: hidden;
    overscroll-behavior: none;
    touch-action: none;
}

.rlb-root--open {
    display: flex;
}

.rlb-header {
    display: flex;
    align-items: center;
    gap: 12px;
}

.rlb-header__title {
    flex: 1 1 auto;
    margin: 0;
}

.rlb-table {
    width: 100%;
    border-collapse: collapse;
    font-variant-numeric: tabular-nums;
}

.rlb-table th {
    text-align: left;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.6;
    padding: 4px 8px;
    border-bottom: 1px solid rgba(16, 22, 26, 0.15);
}

.rlb-table td {
    padding: 6px 8px;
    border-bottom: 1px solid rgba(16, 22, 26, 0.08);
    vertical-align: top;
}

.bp3-dark .rlb-table th {
    border-bottom-color: rgba(255, 255, 255, 0.2);
}

.bp3-dark .rlb-table td {
    border-bottom-color: rgba(255, 255, 255, 0.1);
}

.rlb-table__num {
    text-align: right;
    white-space: nowrap;
}

.rlb-started-cell {
    min-width: 132px;
    white-space: nowrap;
}

.rlb-started {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    vertical-align: baseline;
}

.rlb-started__date {
    opacity: 0.72;
}

.rlb-started__time {
    font-weight: 500;
}

/* Beats the .rlb-table th left-align above, which otherwise parks a numeric
   column's label against the opposite edge from its figures. */
.rlb-table th.rlb-table__num {
    text-align: right;
}

.rlb-cell {
    display: flex;
    align-items: baseline;
    gap: 4px;
    min-width: 0;
}

.rlb-tree__cell {
    min-width: 0;
}

.rlb-tree__layout {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) max-content !important;
    align-items: start;
    column-gap: 12px !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    overflow: visible !important;
}

.rlb-tree__leading {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
}

.rlb-tree__content {
    display: flex !important;
    align-items: baseline;
    flex: 1 1 auto !important;
    width: auto !important;
    max-width: 100% !important;
    min-width: 0 !important;
    flex-wrap: wrap !important;
    gap: 4px;
    overflow: visible !important;
}

.rlb-section__heading {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}

.rlb-section__heading .rlb-section__title {
    margin: 0;
}

/* Scoped to the cell so it outranks .bp3-button.bp3-small, whose own min-width
   would otherwise make the caret wider than the spacer on childless rows and put
   the two sets of titles on different left edges. */
.rlb-tree__leading > .rlb-tree__toggle {
    flex: 0 0 auto;
    width: 20px;
    min-width: 20px;
    height: 20px;
    min-height: 20px;
    padding: 0;
    margin: 0;
    opacity: 0.6;
    align-self: center;
}

.rlb-tree__leading > .rlb-tree__toggle:hover {
    opacity: 1;
}

.rlb-tree__toggle--empty {
    display: block;
}

/* Task status, drawn in CSS rather than Blueprint's icon font so it cannot
   silently render as a blank box if an icon name is wrong. */
.rlb-status {
    flex: 0 0 auto;
    align-self: center;
    box-sizing: border-box;
    width: 13px;
    height: 13px;
    border: 1.5px solid currentColor;
    border-radius: 2px;
    opacity: 0.4;
    position: relative;
}

.rlb-status--done {
    background: #0f9960;
    border-color: #0f9960;
    opacity: 1;
}

.rlb-status--done::after {
    content: '';
    position: absolute;
    left: 4px;
    top: 1px;
    width: 3px;
    height: 6px;
    border: solid #ffffff;
    border-width: 0 1.5px 1.5px 0;
    transform: rotate(45deg);
}

.rlb-row--done .rlb-task-link {
    opacity: 0.65;
}

.rlb-tree__hidden {
    grid-column: 3;
    flex: 0 0 auto !important;
    width: max-content !important;
    min-width: max-content !important;
    max-width: none !important;
    margin: 0 !important;
    font-size: 11px;
    white-space: nowrap !important;
}

.rlb-tree__badge {
    flex: 0 0 auto;
    font-size: 10px;
}

.rlb-tree__total {
    font-weight: 600;
}

.rlb-tree__info {
    width: 20px;
    min-width: 20px;
    height: 20px;
    min-height: 20px;
    margin: 0;
    padding: 0;
    color: var(--rlb-muted, #5c7080);
    opacity: 0.7;
}

.rlb-tree__info:hover,
.rlb-tree__info:focus-visible {
    opacity: 1;
    background: rgba(167, 182, 194, 0.18);
}

.rlb-visually-hidden {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    padding: 0 !important;
    margin: -1px !important;
    overflow: hidden !important;
    clip: rect(0, 0, 0, 0) !important;
    white-space: nowrap !important;
    border: 0 !important;
}

.rlb-task-link {
    padding: 0;
    text-align: left;
    min-height: 0;
    /* Same shrink-to-ellipsis contract as the topbar; a long task name must not
       push the numeric columns off the dialog. */
    flex: 0 1 auto;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* Dashboard task buttons already carry a document-open cue. Keep their text
   in the dashboard's neutral hierarchy; only icon-less Session titles use the
   Roam page-reference palette below. */
.bp3-button.bp3-minimal.rlb-task-link--icon {
    color: var(--rlb-text);
    text-decoration: none;
    border-radius: 3px;
}

.bp3-button.bp3-minimal.rlb-task-link--icon::before {
    color: var(--rlb-muted);
}

.bp3-button.bp3-minimal.rlb-task-link--icon > .rlb-task-link__text {
    color: inherit;
    text-decoration: none;
}

.bp3-button.bp3-minimal.rlb-task-link--icon:hover,
.bp3-button.bp3-minimal.rlb-task-link--icon:focus-visible {
    color: var(--rlb-text);
    background: var(--rlb-task-link-hover, rgba(167, 182, 194, 0.14));
    text-decoration: none;
}

.bp3-button.bp3-minimal.rlb-task-link--icon:focus-visible {
    outline: 2px solid var(--rlb-muted);
    outline-offset: 2px;
}

/* Only the By Task rollup needs fixed numeric rails. The title column receives
   all remaining room and wraps, while Running keeps its natural table layout. */
.rlb-task-table {
    table-layout: fixed;
    min-width: 560px;
}

.rlb-task-table__sessions {
    width: 80px;
}

.rlb-task-table__own,
.rlb-task-table__total {
    width: 88px;
}

.rlb-task-table .rlb-task-link {
    display: flex !important;
    flex: 1 1 auto !important;
    width: 100% !important;
    min-width: 0 !important;
    max-width: 100% !important;
    justify-content: flex-start;
    text-align: left;
    white-space: normal !important;
    overflow: visible !important;
    overflow-wrap: anywhere !important;
    text-overflow: initial;
}

.rlb-task-table .rlb-task-link::before {
    flex: 0 0 auto !important;
    margin-left: 0 !important;
    margin-right: 7px !important;
}

.rlb-task-table .rlb-task-link > .rlb-task-link__text {
    display: block !important;
    flex: 1 1 auto !important;
    width: auto !important;
    min-width: 0 !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    text-align: left;
    white-space: normal !important;
    overflow: visible !important;
    overflow-wrap: anywhere !important;
    word-break: break-word !important;
}

.rlb-muted {
    opacity: 0.6;
}

.rlb-empty {
    padding: 24px;
    text-align: center;
    opacity: 0.65;
}

/* ---- Roam-native dashboard shell ---- */

.rlb-root {
    --rlb-canvas: var(--roam-bg-color, #fdfdfd);
    --rlb-surface: var(--roam-bg-color, #fdfdfd);
    --rlb-surface-subtle: var(--roam-secondary-bg-color, #f5f8fa);
    --rlb-text: var(--roam-primary-color, #182026);
    --rlb-muted: var(--roam-muted-color, #5c7080);
    --rlb-border: rgba(16, 22, 26, 0.14);
    --rlb-border-light: rgba(16, 22, 26, 0.08);
    --rlb-surface-link: #316a9f;
    --rlb-surface-link-hover: #2a5a8d;
    --rlb-task-link-hover: rgba(167, 182, 194, 0.14);
    --rlb-session-running: #7eb794;
    --rlb-accent: var(--roam-accent-color, #316a9f);
    --rlb-accent-soft: rgba(49, 106, 159, 0.12);
    --rlb-overlay: rgba(16, 22, 26, 0.56);
    align-items: flex-start;
    padding: clamp(24px, 7vh, 64px) 24px 32px;
    overflow: hidden;
    overscroll-behavior: none;
    background: var(--rlb-overlay);
    color: var(--rlb-text);
    font-family: inherit;
}

.bp3-dark .rlb-root {
    --rlb-canvas: var(--roam-bg-color, #293742);
    --rlb-surface: var(--roam-bg-color, #293742);
    --rlb-surface-subtle: var(--roam-secondary-bg-color, #202b33);
    --rlb-text: var(--roam-primary-color, #f5f8fa);
    --rlb-muted: var(--roam-muted-color, #a7b6c2);
    --rlb-border: rgba(255, 255, 255, 0.17);
    --rlb-border-light: rgba(255, 255, 255, 0.09);
    --rlb-surface-link: #7eb7d5;
    --rlb-surface-link-hover: #9dcae2;
    --rlb-task-link-hover: rgba(167, 182, 194, 0.18);
    --rlb-session-running: #8ed0aa;
    --rlb-accent: #48aff0;
    --rlb-accent-soft: rgba(72, 175, 240, 0.14);
    --rlb-overlay: rgba(16, 22, 26, 0.74);
}

.rlb-dialog {
    display: flex;
    flex: 0 1 auto;
    flex-direction: column;
    width: min(1120px, calc(100vw - 48px));
    height: auto;
    min-height: 0;
    max-height: min(84vh, calc(100vh - 48px));
    max-height: min(84dvh, calc(100dvh - 48px));
    overflow: hidden;
    border: 1px solid var(--rlb-border);
    border-radius: 4px;
    background: var(--rlb-surface);
    color: var(--rlb-text);
    box-shadow: 0 4px 16px rgba(16, 22, 26, 0.14);
}

.rlb-dashboard .rlb-header.bp3-dialog-header {
    flex: 0 0 auto;
    min-height: 48px;
    height: auto;
    overflow: visible;
    padding: 6px 14px 6px 16px;
    border-bottom: 0;
    background: var(--rlb-surface);
    box-shadow: none;
}

.rlb-dashboard .rlb-header__heading {
    flex: 1 1 auto;
    min-width: 0;
    overflow: visible;
}

.rlb-dashboard .rlb-header__title.bp3-heading {
    flex: 1 1 auto;
    margin: 0;
    color: inherit;
    font-size: 17px;
    font-weight: 600;
    line-height: 1.35;
    overflow: visible;
    text-overflow: initial;
    white-space: normal;
}

.rlb-header .bp3-select select {
    min-width: 112px;
}

.rlb-dashboard .bp3-button,
.rlb-dashboard .bp3-select select {
    font-size: 12px;
    line-height: 1.2;
}

.rlb-icon-button {
    width: 32px;
    min-width: 32px;
    height: 32px;
    min-height: 32px;
    padding: 0;
}

.rlb-summary {
    flex: 0 0 auto;
    min-width: 0;
    padding: 10px 20px;
    overflow-x: hidden;
    background: var(--rlb-surface);
}

.rlb-overview {
    display: grid;
    grid-template-columns: minmax(160px, 0.9fr) minmax(300px, 1.6fr) minmax(160px, 0.9fr);
    align-items: stretch;
    height: 80px;
    min-height: 80px;
    margin: 0;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--rlb-border-light);
    border-radius: 8px;
    background: var(--rlb-surface-subtle);
}

.rlb-overview__item {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    min-width: 0;
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
    justify-content: center;
    padding: 9px 14px;
    border: 0;
    border-radius: 0;
    background: transparent;
}

.rlb-overview__item + .rlb-overview__item {
    border-left: 1px solid var(--rlb-overview-divider, var(--rlb-border-light));
}

.rlb-overview__item--selected {
    min-width: 0;
    justify-content: space-between;
}

.rlb-overview__panel {
    overflow: hidden;
}

.rlb-overview__heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    min-width: 0;
}

.rlb-overview__label {
    flex: 0 0 auto;
    margin: 0;
    color: var(--rlb-muted);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.25px;
    line-height: 1.2;
    text-transform: uppercase;
}

.rlb-overview__value {
    display: flex;
    flex: 0 0 auto;
    flex-direction: row;
    align-items: baseline;
    justify-content: flex-end;
    gap: 6px;
    min-width: 0;
    margin: 0;
    color: var(--rlb-text);
    font-size: 20px;
    font-weight: 600;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
}

.rlb-overview__number {
    display: block;
    white-space: nowrap;
}

.rlb-overview__context {
    display: block;
    color: var(--rlb-muted);
    font-size: 10px;
    font-weight: 500;
    line-height: 1.2;
    white-space: nowrap;
}

.rlb-overview__value--quiet .rlb-overview__number {
    color: var(--rlb-muted);
    font-size: 18px;
    font-weight: 500;
}

.rlb-overview__value--quiet .rlb-overview__context {
    opacity: 0.82;
}

.rlb-body,
.rlb-body__scroll {
    flex: 1 1 auto;
    min-height: 0;
    max-height: none;
    padding: 10px 20px 24px;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
}

.rlb-dashboard-section {
    margin: 0;
    padding: 0;
}

.rlb-dashboard-section + .rlb-dashboard-section {
    margin-top: 10px;
}

.rlb-dashboard-panel {
    overflow: hidden;
    padding: 12px 14px 10px;
    border: 1px solid var(--rlb-border);
    border-radius: 7px;
    background: var(--rlb-surface);
}

.rlb-panel__header {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    margin-bottom: 7px;
}

.rlb-panel__header .rlb-section__title {
    flex: 0 0 auto;
}

.rlb-panel__count,
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

.rlb-section__heading {
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
}

.rlb-dashboard .rlb-table {
    border-collapse: separate;
    border-spacing: 0;
}

.rlb-dashboard .rlb-table th {
    padding: 4px 8px;
    border-bottom: 0;
    color: var(--rlb-muted);
    font-size: 10px;
}

.rlb-dashboard .rlb-table td {
    padding: 6px 8px;
    border-bottom: 0;
    font-size: 13px;
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

.rlb-dashboard .rlb-empty {
    padding: 24px 12px;
}

.rlb-muted {
    color: var(--rlb-muted);
    opacity: 1;
}

.rlb-empty {
    padding: 24px 12px;
    color: var(--rlb-muted);
    opacity: 1;
}

@media (max-width: 600px) {
    .rlb-root {
        align-items: flex-start;
        padding: 12px;
        height: 100vh;
        height: 100dvh;
    }

    .rlb-dialog {
        width: 100%;
        height: auto;
        max-height: calc(100vh - 24px);
        max-height: calc(100dvh - 24px);
        border: 0;
        border-radius: 0;
    }

    .rlb-dashboard .rlb-header.bp3-dialog-header {
        flex-wrap: wrap;
        gap: 8px;
        padding: 10px 12px;
    }

    .rlb-dashboard .rlb-header__heading {
        flex-basis: calc(100% - 80px);
    }

    .rlb-header .bp3-select {
        order: 2;
        width: 100%;
    }

    .rlb-header .bp3-select select {
        width: 100%;
    }

    .rlb-summary {
        padding: 8px 12px;
        overflow: hidden;
    }

    .rlb-overview {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        grid-template-rows: 50px minmax(0, 1fr);
        height: 122px;
        min-height: 122px;
    }

    .rlb-overview__item--selected {
        grid-column: 1 / -1;
        grid-row: 2;
        border-top: 1px solid var(--rlb-overview-divider, var(--rlb-border-light));
        border-left: 0;
    }

    .rlb-overview__item:nth-child(3) {
        grid-column: 2;
        grid-row: 1;
    }

    .rlb-overview__item {
        padding: 9px 10px;
    }

    .rlb-overview__label {
        font-size: 10px;
    }

    .rlb-overview__value {
        min-width: 0;
        gap: 4px;
        font-size: 18px;
    }

    .rlb-overview__context {
        white-space: nowrap;
    }

    .rlb-body,
    .rlb-body__scroll {
        max-height: none;
        padding: 10px 12px 20px;
    }

    .rlb-dashboard-section {
        overflow-x: auto;
    }

    .rlb-table {
        min-width: 560px;
    }
}

@media (min-width: 600px) and (max-width: 719px) {
    .rlb-summary {
        padding: 9px 12px;
    }

    .rlb-overview {
        grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.6fr) minmax(0, 0.9fr);
        height: 78px;
        min-height: 78px;
    }

    .rlb-overview__item {
        padding: 8px 9px;
    }

    .rlb-overview__label {
        font-size: 10px;
    }

    .rlb-overview__heading,
    .rlb-overview__value {
        gap: 4px;
    }

    .rlb-overview__value {
        font-size: 18px;
    }

    .rlb-overview__context {
        font-size: 10px;
    }

    .rlb-body,
    .rlb-body__scroll {
        padding: 10px 12px 20px;
    }
}

/* ---- Compact overview ---- */

.rlb-overview--compact {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    height: 68px;
    min-height: 68px;
}

.rlb-overview--compact .rlb-overview__item {
    justify-content: center;
    padding: 8px 12px;
}

.rlb-overview--compact .rlb-overview__heading {
    display: grid;
    gap: 4px;
    align-items: center;
}

.rlb-overview--compact .rlb-overview__value {
    justify-content: flex-start;
    font-size: 19px;
}

.rlb-overview--compact .rlb-overview__context {
    overflow: hidden;
    text-overflow: ellipsis;
}

@media (max-width: 600px) {
    .rlb-overview--compact {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        grid-template-rows: repeat(2, minmax(0, 1fr));
        height: 116px;
        min-height: 116px;
    }

    .rlb-overview--compact .rlb-overview__item {
        grid-column: auto;
        grid-row: auto;
        padding: 8px 10px;
    }

    .rlb-overview--compact .rlb-overview__item:nth-child(odd) {
        border-left: 0;
    }

    .rlb-overview--compact .rlb-overview__item:nth-child(n + 3) {
        border-top: 1px solid var(--rlb-border-light);
    }

}
`;
