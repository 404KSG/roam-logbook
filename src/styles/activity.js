export const ACTIVITY = String.raw`/* Activity is the one visual summary in the Dashboard. Keep its geometry
   deliberately bounded: values sit above each bar and the date remains below
   it, with no secondary axis or scroll rail competing for attention. Bar width
   is relative to the live grid slot, with density-specific pixel bounds. */
.rlb-dashboard .rlb-activity {
    box-sizing: border-box;
    height: 198px;
    min-height: 198px;
    overflow: hidden;
}

.rlb-dashboard .rlb-activity .rlb-panel__header {
    margin-bottom: 6px;
}

.rlb-activity__chart {
    position: relative;
    height: 157px;
    min-width: 0;
    overflow: hidden;
}

.rlb-activity__plot {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--rlb-activity-columns, 1), minmax(0, 1fr));
    align-items: stretch;
    gap: 4px;
    height: 100%;
    min-width: 0;
    padding: 0 2px;
    border-bottom: 1px solid var(--rlb-border-light);
    box-sizing: border-box;
}

.rlb-activity__bucket {
    display: grid;
    grid-template-rows: 18px minmax(0, 1fr) 20px;
    align-items: stretch;
    min-width: 0;
    height: 100%;
    color: var(--rlb-muted);
    text-align: center;
    font-variant-numeric: tabular-nums;
    outline: none;
}

.rlb-activity__bucket:focus-visible {
    border-radius: 3px;
    box-shadow: 0 0 0 2px var(--rlb-muted);
}

.rlb-activity__duration,
.rlb-activity__date {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.rlb-activity__duration {
    color: var(--rlb-text);
    font-size: 11px;
    font-weight: 600;
    line-height: 18px;
}

.rlb-activity__unit {
    flex: 0 0 auto;
    color: var(--rlb-muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.45px;
    line-height: 1.25;
    opacity: 1;
}

.rlb-activity__bar-wrap {
    display: flex;
    min-height: 0;
    align-items: flex-end;
    justify-content: center;
}

.rlb-activity__bar {
    display: block;
    width: clamp(
        var(--rlb-activity-bar-min-width, 2px),
        var(--rlb-activity-bar-ratio, 52%),
        var(--rlb-activity-bar-max-width, 18px)
    );
    max-width: 100%;
    min-height: 2px;
    max-height: 100%;
    border-radius: 2px 2px 0 0;
    background: var(--rlb-session-running);
}

.rlb-activity__bucket--empty .rlb-activity__duration {
    color: var(--rlb-muted);
    opacity: 1;
}

.rlb-activity__bucket--empty .rlb-activity__bar {
    opacity: 0.35;
}

.rlb-activity__date {
    color: var(--rlb-muted);
    font-size: 11px;
    font-weight: 500;
    line-height: 20px;
}
`;
