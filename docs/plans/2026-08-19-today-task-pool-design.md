# Today Task Pool — beta.45 design

## Decision

The existing Active Threads popover remains the single interaction shell and
gains two compact views: `Threads · N` and `Today · N`. Threads is unchanged.
Today is a navigation/task-pool view, not another timing surface.

## Read boundary

Today resolves the exact local Daily Notes title (for example, `August 19th,
2026`) in `src/roam.js`, then follows only that page's direct children through
bounded `getChildren` reads. The adapter caps depth at 24 and nodes at 500 and
returns `success`, `empty`, or `error`; a failed read cannot erase a successful
open-popover snapshot. Bare references have a finite second lookup for their
target strings. No UI module calls `roamAlphaAPI`.

## Pure hierarchy

`src/today-todos.js` filters TODO/DONE state and converts the physical Daily
Notes tree into a visible TODO forest. Plain blocks and DONE blocks remain
structural. A bare reference to an unfinished TODO acts as that task's context
parent. Unfinished children under DONE parents are promoted to the nearest
visible TODO ancestor or root. Roam order is retained. Collapse state lives only
for the lifetime of the open popover; the current Timing Line path is forced
open.

## Interaction and performance

Active Threads paints first. Today is prefetched after the popover opens and is
also loaded on first Today activation. Play calls the existing single-clock
`clockIn(..., { source: 'active-work-switch' })` path and keeps the popover open.
Title navigation retains main-window and native Shift+Click sidebar behavior.
The one-second ticker only updates cached elapsed DOM handles; it never reads
Today graph data. Refresh invalidates both current-work and Today snapshots.

## Verification seams

The beta.45 focused tests cover absent/failed Daily Notes reads, bounded graph
shape, TODO hierarchy/order/filter/reference promotion, collapse and current
branch expansion, view counts, Play/current indicators, lazy caching, refresh,
and the no-graph-read ticker boundary. The generated `extension.js` must remain
in sync with source before release.

## Live caveat

The exact `:node/title` → `:block/uid` page query and Pull child shape are
covered by the repository graph stub but still require a manual live Roam smoke
check against a real Daily Notes page before publishing the Depot draft.
