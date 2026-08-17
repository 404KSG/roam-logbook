# Active Work title display refinement

Date: 2026-08-17
Status: approved

## Goal

Refine the three user-visible issues reported in the Active Work popover and
Roam Settings without changing CLOCK storage, Dashboard reporting, task
sorting, or navigation semantics.

## Decisions

1. Active Work task titles keep Roam's sampled page-reference colour but use no
   resting, hover, or focus underline. Keyboard focus remains visible through
   the existing outline.
2. The stale-clock setting keeps its existing numeric values and storage
   compatibility. Its label becomes `Flag unfinished clocks after (hours)` so
   values such as `2` have an explicit unit without migrating settings.
3. Active Work visible titles preserve Roam page-reference brackets from the
   source Task string, for example `[[Roam Logbook]] Sessions 优化。`. The whole
   title remains one block-navigation button; page references do not become
   nested links.
4. The bracket-preserving formatter is scoped to Active Work. The canonical
   plain `taskTitle()` used by Dashboard statistics, hierarchy, sorting, and
   reports remains unchanged.

## Data and rendering flow

- CLOCK entries continue to retain both `taskString` and normalized `title`.
- The Active Work surface derives a display-only title from `taskString` when
  available and falls back to the normalized title or Task UID.
- The display formatter removes TODO/DONE and non-title macros, preserves
  `[[page references]]` and `#[[tag references]]`, removes ordinary emphasis
  markup, normalizes whitespace, and never writes the result to the graph.
- Accessible labels use the same bracket-preserving display text so visible and
  announced names do not disagree.

## Compatibility and safety

- Existing stale-hour values such as `2`, `8`, and `24` remain valid and are not
  rewritten.
- Ordinary click, Shift+Click, keyboard activation, Focus switching, and the
  beta.30 Timing Line sidebar-fronting behavior are unchanged.
- No new observer, timer, graph query, graph write, setting, or dependency is
  introduced.

## Verification

- Unit coverage for bracket-preserving display text and fallback behavior.
- Popover DOM coverage for Timing and Open Line titles, accessible labels, and
  absence of underlines in resting/hover/focus states.
- Lifecycle/settings coverage for the explicit `(hours)` label and unchanged
  numeric option/default values.
- Full lint, workflow, unit/jsdom/Chromium, build, and bundle verification.
