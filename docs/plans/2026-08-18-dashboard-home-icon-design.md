# Dashboard Home Icon Design

Date: 2026-08-18

## Decision

Replace the Active Threads header's Blueprint `dashboard` glyph with Blueprint
`home`. Keep the control's existing `Open Roam Logbook Dashboard` title,
accessible label, click behavior, and `data-action="dashboard"` contract.

## Visual boundary

The Home glyph presents the Dashboard as the extension's primary overview
destination without suggesting that chart analytics still exist. No color,
surface, hover, spacing, or motion is added. The existing restrained
Roam/Linear styling remains authoritative.

## Layout and accessibility

The button remains a 32 by 32 pixel icon-only target in the shared two-column
action rail. Dashboard continues to align with Clock Out, and Refresh with
Delete. Existing title and ARIA text remain descriptive rather than exposing
the glyph name.

## Verification

DOM tests require `bp3-icon-home` and reject the retired
`bp3-icon-dashboard`. Chromium fixtures continue to verify the existing narrow
light/dark geometry, target size, and exact action-column alignment.
