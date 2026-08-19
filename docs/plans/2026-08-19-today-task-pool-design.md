# Today Task Pool — beta.45 design

## Follow-up — beta.48 immediate Timing Line navigation

The previous beta.47 sidebar cache improved repeated switches only after a
native block window had already been confirmed. First-time Today tasks still
waited for two serial chains: drawer/CLOCK/post-write graph confirmation, then
`rightSidebar.open()` before `getWindows()` and `addWindow()`.

Beta.48 separates the reversible navigation intent from the authoritative graph
mutation. A user or Active Work Clock In publishes the target block immediately;
the sidebar adapter begins rendering it while the mutation queue continues its
normal validation, writes, and post-write confirmation. Confirmed CLOCK actions
remain facts but no longer start a duplicate sidebar request.

The native adapter also treats `rightSidebar.open()` as a non-blocking warm-up.
`getWindows()` and `addWindow()` are no longer gated by the host animation
promise. Warm-up failure is diagnostic only; dedupe, stale-cache fallback,
serialized native writes, and latest-intent cancellation remain mandatory.

## Follow-up — beta.47 responsive interactions

Today exposes icon-only Expand all and Collapse all controls in the existing
header action rail whenever at least one visible Task has children. The local
expanded set accepts parent UIDs only; clearing it leaves the Timing Line branch
visible because that path remains forced open by the pure tree model.

The body-mounted popover reserves a stable vertical scrollbar gutter. Overflow
continues to appear only when needed, but crossing the `70vh` threshold no longer
changes the content width or shifts the fixed action rail.

Confirmed Timing Line sidebar windows use a short-lived native-window hint to
skip repeated `open` and `getWindows` calls when switching back to recent work.
Native writes remain serialized and cancellable by a newer intent. A rejected
fast reveal invalidates the hint and re-enters the authoritative read/add path,
so a window closed outside the extension is recovered without duplication.

## Follow-up — beta.46 natural surface width

The shared popover shell uses a controlled `460px` desktop width and shrinks to
`calc(100vw - 16px)` on narrow viewports. Today rows keep a flexible title rail
beside a fixed `56px` action column, while visual hierarchy indentation is capped
at `60px`. Long titles are clipped only at the trailing edge; Play and hidden
descendant counts never overlap or force horizontal scrolling. Threads, Today,
empty, and error states all inherit this same shell contract.

## Decision

The existing Active Threads popover remains the single interaction shell and
gains two compact views: `Threads · N` and `Today · N`. Threads is unchanged.
Today is a navigation/task-pool view, not another timing surface.

## Read boundary

Today resolves the exact local Daily Notes title (for example, `August 19th,
2026`) in `src/roam.js`. One page-scoped query returns each descendant and its
direct parent; the adapter rebuilds that tree in memory, caps depth at 24 and
nodes at 500, and returns `success`, `empty`, or `error`. A failed read cannot
erase a successful open-popover snapshot. Bare references have one finite
second lookup for their target strings. No UI module calls `roamAlphaAPI`.

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
