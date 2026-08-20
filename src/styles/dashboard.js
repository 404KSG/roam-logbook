export const DASHBOARD = String.raw`/* ---- dashboard ---- */

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
    align-items: flex-start;
    padding: clamp(24px, 7vh, 64px) 24px 32px;
    background: var(--rlb-overlay);
    color: var(--rlb-text);
    font-family: inherit;
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
    border-collapse: separate;
    border-spacing: 0;
    font-variant-numeric: tabular-nums;
}

.rlb-table th {
    text-align: left;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding: 4px 8px;
    border-bottom: 0;
    color: var(--rlb-muted);
}

.rlb-table td {
    padding: 6px 8px;
    border-bottom: 0;
    vertical-align: top;
    font-size: 13px;
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
    color: var(--rlb-muted);
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

/* Self-contained specificity, for the same reason as the task-link rules. */
.rlb-tree__layout.rlb-tree__layout {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) max-content;
    align-items: start;
    column-gap: 12px;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    overflow: visible;
}

.rlb-tree__leading {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
}

.rlb-tree__content.rlb-tree__content {
    display: flex;
    align-items: baseline;
    flex: 1 1 auto;
    width: auto;
    max-width: 100%;
    min-width: 0;
    flex-wrap: wrap;
    gap: 4px;
    overflow: visible;
}

.rlb-tree__actions {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
    min-width: max-content;
    min-height: 20px;
}

.rlb-task-action {
    flex: 0 0 24px;
    width: 24px;
    min-width: 24px;
    max-width: 24px;
    height: 24px;
    min-height: 24px;
    max-height: 24px;
    padding: 0 !important;
    align-items: center;
    justify-content: center;
    color: var(--rlb-muted, #5c7080);
}

.rlb-task-action--play:hover,
.rlb-task-action--play:focus-visible {
    color: var(--rlb-surface-link-hover, #316a9f);
    background: var(--rlb-task-link-hover, rgba(167, 182, 194, 0.14));
}

.rlb-task-action--timing {
    display: inline-flex;
    opacity: 0.78;
    pointer-events: none;
}

.rlb-task-action--timing::before {
    margin: 0;
}

.rlb-section__heading {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
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

.bp3-button.bp3-minimal.rlb-task-link {
    color: var(--rlb-surface-link);
    text-decoration: none;
    border-radius: 3px;
}

.bp3-button.bp3-minimal.rlb-task-link::before {
    display: none !important;
    content: none !important;
}

.bp3-button.bp3-minimal.rlb-task-link > .rlb-task-link__text {
    color: inherit;
    text-decoration: none;
}

.bp3-button.bp3-minimal.rlb-task-link:hover,
.bp3-button.bp3-minimal.rlb-task-link:focus-visible {
    color: var(--rlb-surface-link-hover);
    background: var(--rlb-task-link-hover, rgba(167, 182, 194, 0.14));
    text-decoration: none;
}

.bp3-button.bp3-minimal.rlb-task-link:focus-visible {
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

/* Specificity here has to beat Blueprint's own .bp3-button.bp3-minimal rules
   (three classes) without depending on a .rlb-root ancestor: the By Task table
   is rendered standalone in layout tests and could be reparented in the dialog.
   Repeating .rlb-task-table is a self-contained way to outrank them. */
.rlb-task-table.rlb-task-table .rlb-task-link {
    display: flex;
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    justify-content: flex-start;
    text-align: left;
    white-space: normal;
    overflow: visible;
    overflow-wrap: anywhere;
    text-overflow: initial;
}

.rlb-task-table.rlb-task-table .rlb-task-link > .rlb-task-link__text {
    display: block;
    flex: 1 1 auto;
    width: auto;
    min-width: 0;
    max-width: 100%;
    margin: 0;
    padding: 0;
    text-align: left;
    white-space: normal;
    overflow: visible;
    overflow-wrap: anywhere;
    word-break: break-word;
}

.rlb-muted {
    color: var(--rlb-muted);
    opacity: 1;
}

.rlb-empty {
    padding: 24px 12px;
    text-align: center;
    color: var(--rlb-muted);
    opacity: 1;
}

/* ---- Roam-native dashboard shell ---- */

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

.rlb-body,
.rlb-body__scroll {
    flex: 1 1 auto;
    min-height: 0;
    max-height: none;
    padding: 10px 20px 24px;
    overflow-y: auto;
    overscroll-behavior: contain;
    /* Keep the dashboard natively scrollable without exposing a second visual
       rail or changing the content width when the overflow threshold flips. */
    scrollbar-gutter: stable;
    scrollbar-width: none;
    -ms-overflow-style: none;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
}

.rlb-body::-webkit-scrollbar,
.rlb-body__scroll::-webkit-scrollbar {
    width: 0;
    height: 0;
}

.rlb-dashboard-section {
    margin: 0;
    padding: 0;
    scrollbar-width: none;
    -ms-overflow-style: none;
}

.rlb-dashboard-section::-webkit-scrollbar {
    width: 0;
    height: 0;
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

`;
