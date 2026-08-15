# Dashboard embedded activity design

Date: 2026-08-15  
Status: approved for beta.8 implementation

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
and that paused state is communicated only by the history icon's low-saturation
ochre color and accessible title; its surface remains transparent like idle.

## Non-goals

This slice does not change graph formats, statistics, roll-up ownership, clock
mutation semantics, Dashboard range choices, live-query frequency, or the
session popover/sidebar information architecture.

## Beta.8 decision — compact content-fit inspector

Beta.7 removed the independent By Day section, but its fixed-height analytical
shell still made a small task set look like a full-screen report. Beta.8 keeps
the same data semantics and makes the Dashboard a content-fit inspector:

```text
Logbook + controls → one inline Overview bar → Running when present → By Task
```

The modal has an adaptive desktop width capped at a practical task-table size,
no content-driven fixed height, and a viewport-relative maximum height. A
short report ends shortly after its last row; a long report scrolls inside the
body while the header and controls remain available. The visible subtitle is
removed as redundant but remains as an accessible dialog description.

Overview is a semantic `dl` with three logical items: Today, the selected
range, and Tasks tracked. Each label and value shares one reading rhythm; the
selected-range item keeps the real daily series as a micro activity rail. The
rail has no visible date axis, but every keyboard-focusable bucket retains its
date, duration, title, and accessible name. Finite ranges keep their actual
bucket count and All time remains explicitly labelled as a recent activity
window.

The paused topbar returns to the normal transparent surface. Its history icon
alone uses a muted orange/ochre color while paused; no badge, ring, border, or
background block is added. Hover and focus retain the neutral Roam surface
feedback, and the accessible paused count remains authoritative.

Beta.8 verification adds public DOM and browser geometry seams for content-fit
few-row and max-height many-row behavior, inline overview semantics, hidden
activity labels, responsive widths, focusable buckets, and paused icon-only
color/background priority. Existing task hierarchy, running/session actions,
data-health behavior, sidebar behavior, and graph formats remain unchanged.
