export const RESPONSIVE = String.raw`@media (max-width: 600px) {
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

    .rlb-dashboard .rlb-activity {
        height: 190px;
        min-height: 190px;
        overflow: hidden;
    }

    .rlb-activity__chart {
        height: 149px;
    }

    .rlb-activity__plot {
        gap: 2px;
        padding: 0 1px;
    }

    .rlb-activity__duration,
    .rlb-activity__date {
        font-size: 11px;
    }

    .rlb-tree__collapse-all {
        margin-left: auto;
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

@media (max-width: 719px) {
    .rlb-by-task > .rlb-section__heading {
        align-items: flex-start;
        flex-wrap: wrap;
        row-gap: 4px;
        height: auto;
        min-height: 34px;
        margin: -12px -14px 6px;
        padding: 6px 10px;
    }

    .rlb-task-filters {
        max-width: 100%;
        flex-wrap: wrap;
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
