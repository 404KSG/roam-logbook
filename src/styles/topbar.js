export const TOPBAR = String.raw`.rlb-topbar {
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


.rlb-topbar__button--active {
    column-gap: 6px;
}

.rlb-topbar__button--active > .rlb-topbar__icon {
    flex: 0 0 auto;
}


/* The widget shares the left navigation row with Roam's expanding search.
   These classes are applied to the actual host/child found at attach time, so
   the search can shrink into remaining space without ever shrinking this unit. */
.rlb-topbar__layout {
    align-items: center;
    min-width: 0;
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
`;
