/**
 * Styles for the topbar widget and dashboard.
 *
 * Layout and spacing only — colour comes from Blueprint's own variables so the
 * extension follows Roam's light/dark theme without a second set of rules.
 */

export const STYLE_ID = 'roam-logbook-styles';

export const STYLES = `
.rlb-topbar {
    display: flex;
    align-items: center;
    position: relative;
    min-width: 0;
}

.rlb-topbar__button {
    display: flex;
    align-items: center;
    gap: 6px;
    /* A long task name must never widen the widget into Roam's own controls.
       Scales down with the window so a narrow graph view stays usable. */
    max-width: min(280px, 30vw);
    overflow: hidden;
    font-variant-numeric: tabular-nums;
}

.rlb-topbar__button > .bp3-icon,
.rlb-topbar__button > .rlb-dot {
    flex: 0 0 auto;
}

.rlb-topbar__labels {
    display: flex;
    align-items: center;
    /* Without this the labels box refuses to shrink below its text, the button
       blows past max-width, and the ellipsis below never gets a chance to apply. */
    min-width: 0;
    overflow: hidden;
}

/* The counter is the point of the widget, so it is the one thing that never shrinks. */
.rlb-topbar__time {
    flex: 0 0 auto;
    font-weight: 600;
}

/* The title is what gives way, down to an ellipsis. */
.rlb-topbar__label {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.rlb-topbar__button--running {
    color: #0f9960;
}

.bp3-dark .rlb-topbar__button--running {
    color: #3dcc91;
}

.rlb-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #0f9960;
    flex: 0 0 auto;
    animation: rlb-pulse 2s ease-in-out infinite;
}

.rlb-dot--stale {
    background: #d9822b;
    animation: none;
}

@keyframes rlb-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.35; }
}

@media (prefers-reduced-motion: reduce) {
    .rlb-dot { animation: none; }
}

/* ---- popover ---- */

/* Lives on <body>, positioned from the button's rect, so the topbar cannot clip it. */
.rlb-popover {
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
    padding: 4px 6px 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    opacity: 0.6;
}

.rlb-popover__empty {
    padding: 6px 6px 12px;
    opacity: 0.7;
}

.rlb-popover__footer {
    display: flex;
    gap: 6px;
    padding-top: 8px;
    margin-top: 4px;
    border-top: 1px solid rgba(16, 22, 26, 0.15);
}

.bp3-dark .rlb-popover__footer {
    border-top-color: rgba(255, 255, 255, 0.15);
}

.rlb-run {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px;
    border-radius: 3px;
}

.rlb-run:hover {
    background: rgba(167, 182, 194, 0.2);
}

.rlb-run__body {
    flex: 1 1 auto;
    min-width: 0;
}

.rlb-run__title {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
    padding: 0;
}

.rlb-run__meta {
    font-size: 11px;
    opacity: 0.65;
    font-variant-numeric: tabular-nums;
}

.rlb-run__actions {
    display: flex;
    gap: 2px;
    flex: 0 0 auto;
}

/* ---- dashboard ---- */

.rlb-root {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 100;
    align-items: flex-start;
    justify-content: center;
    padding: 6vh 16px 16px;
    background: rgba(16, 22, 26, 0.7);
}

.rlb-root--open {
    display: flex;
}

.rlb-dialog {
    width: min(920px, 100%);
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    margin: 0;
    padding-bottom: 0;
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

.rlb-body {
    padding: 16px 20px 20px;
    overflow-y: auto;
}

.rlb-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
    margin-bottom: 18px;
}

.rlb-stat {
    padding: 10px 12px;
    border-radius: 3px;
    background: rgba(167, 182, 194, 0.2);
}

.rlb-stat__value {
    display: block;
    font-size: 20px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
}

.rlb-stat__label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    opacity: 0.65;
}

.rlb-section {
    margin-bottom: 20px;
}

.rlb-section__title {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    opacity: 0.65;
}

.rlb-bars {
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 96px;
    padding: 4px 0;
}

.rlb-bar {
    flex: 1 1 0;
    min-width: 4px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    height: 100%;
}

.rlb-bar__fill {
    background: #2d72d2;
    border-radius: 2px 2px 0 0;
    min-height: 2px;
}

.rlb-bar--empty .rlb-bar__fill {
    background: rgba(167, 182, 194, 0.35);
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

.rlb-tree__cell {
    display: flex;
    align-items: baseline;
    gap: 4px;
    min-width: 0;
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

.rlb-tree__toggle {
    flex: 0 0 auto;
    width: 20px;
    min-width: 20px;
    min-height: 20px;
    padding: 0;
    opacity: 0.6;
}

.rlb-tree__toggle:hover {
    opacity: 1;
}

.rlb-tree__toggle--empty {
    display: inline-block;
}

.rlb-tree__hidden {
    flex: 0 0 auto;
    font-size: 11px;
}

.rlb-tree__badge {
    flex: 0 0 auto;
    font-size: 10px;
}

.rlb-tree__total {
    font-weight: 600;
}

.rlb-tree__note {
    margin-top: 8px;
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

.rlb-muted {
    opacity: 0.6;
}

.rlb-empty {
    padding: 24px;
    text-align: center;
    opacity: 0.65;
}
`;
