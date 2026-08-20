# Beta.59 Dashboard task status design

## Goal

Make Dashboard task rows use the same status language as Active Threads. The
left rail should describe hierarchy only; the right rail should describe the
task's available action or terminal state.

## Behavior

- Remove the TODO/DONE checkbox-shaped status mark from the left side of every
  By Task row.
- Keep the tree caret or its equal-width spacer in the left rail so titles stay
  aligned across parent and leaf rows.
- Keep Play for an unfinished task that can start timing.
- Keep the non-interactive timing icon for the task currently being timed.
- Show a muted, non-interactive Blueprint `tick-circle` with the accessible name
  `Completed` for a DONE task. DONE tasks never show Play.

## Verification seam

Tests observe the rendered `.rlb-task-table` DOM: no legacy status marks remain,
the completed icon is a non-button image at the row end, and existing TODO
timing actions continue to work.
