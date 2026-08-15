# Dashboard embedded activity design

Date: 2026-08-15  
Status: approved for beta.7 implementation

## Purpose

Beta.6 reduced visible rules and tracks, but the Dashboard still presented an
old multi-section report: Summary, Running, an independent By Day chart, and By
Task. Beta.7 changes the information architecture so the primary reading path
is the current work list and task hierarchy, while activity remains available
without becoming a second dashboard.

## Selected direction: A — embedded activity

The Dashboard order is:

```text
Header → Integrated Summary → Running Sessions (when present) → By Task → conditional issues/help
```

Integrated Summary always contains exactly three metrics: Today, the selected
range, and Tasks tracked. The selected-range metric owns a compact activity
rail. Finite day ranges use their real daily buckets; an unbounded All time
selection uses an explicitly labelled recent activity window so the rail never
pretends to represent every historical day. Each bucket keeps its date,
duration, intensity, title, and accessible name.

By Task remains the primary list and keeps the existing hierarchy, disclosure
controls, Sessions, Own, Total, task navigation, multi-parent overlap semantics,
and collapse state. The roll-up explanation moves from a visible footer block
to an accessible information control beside the section heading.

## Responsive behavior

Desktop widths use a three-column summary with a slightly wider selected-range
metric. The activity rail scales to the number of buckets without making the
modal horizontally scroll. Narrow widths stack the summary metrics and keep the
rail inside its metric; task rows retain their numeric rails or use the existing
safe narrow overflow only where the columns cannot remain readable.

## Data and error states

The graph remains the source of truth. A failed refresh keeps the last valid
snapshot and shows a compact, accessible graph-read status. With no valid
snapshot, the Dashboard shows an error state rather than an empty state. Timing
issues and graph-read issues remain separate, and clean data renders no issue
indicator.

## Accessibility

The dialog keeps its labelled modal and focus trap. Activity buckets are
keyboard-focusable controls with complete date/duration names. The three metrics
remain a labelled list. By Task keeps accessible task names, disclosure state,
numeric column headers, and an accessible explanation of descendant rollups.

## Verification

Tests cover the public Dashboard DOM seam, range variants, zero/sparse activity,
responsive geometry, running-section omission, task hierarchy placement,
accessible bucket metadata, data issues, and the existing live elapsed handle.
The paused topbar contract separately verifies that the old pause badge is gone
and that paused state is communicated only by the history icon, low-saturation
ochre background, and accessible title.

## Non-goals

This slice does not change graph formats, statistics, roll-up ownership, clock
mutation semantics, Dashboard range choices, live-query frequency, or the
session popover/sidebar information architecture.
