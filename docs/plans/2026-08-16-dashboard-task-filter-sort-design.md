# Dashboard Task filter and sort design

Date: 2026-08-16
Status: approved for implementation by 404KSG

## Outcome

The Dashboard `By task` panel gains a compact status filter and hierarchy-preserving numeric sorting without changing graph reads, Session accounting, headline metrics, or the Running panel. The default remains the current complete tree ordered by `Total` descending.

## Filter contract

- Provide three mutually exclusive controls: `All`, `TODO`, and `DONE`.
- Filter against each Task's current Roam status, not the status it had when an older Session was recorded.
- Tasks with an unknown or legacy status appear only under `All`.
- A matching descendant keeps every non-matching ancestor required to explain its hierarchy. Those ancestors are marked as context, rendered quietly, and are not included in the visible match count.
- A matching parent does not automatically reveal non-matching descendants; only matching branches and required ancestor paths remain.
- Filtering affects only `By task`. Overview metrics and Running Sessions continue to describe the selected date range without being rewritten by the view filter.
- The panel reports `N of M Tasks` and shows a status-specific empty state when there are no matches.

## Sort contract

- `Sessions`, `Own`, and `Total` headers are buttons with native `aria-sort` on the active column.
- First activation of a different column selects descending order; activating the same column toggles descending and ascending.
- Sorting applies recursively among siblings and never flattens or detaches children from parents.
- `Sessions` sorts by direct Session count, `Own` by time recorded directly on the Task, and `Total` by the Task plus all descendants.
- Equal values use a stable title then UID tie-breaker so order does not flicker.
- `Own` and `Total` expose concise explanatory titles. Only the active sort column displays an arrow.

## Interaction and layout

- Keep filter and match count in the `By task` header alongside the existing rollup help and Expand/Collapse control.
- Preserve collapse state when the filter, sort, or date range changes.
- Keep the panel controls and table header visible while scrolling inside the Dashboard where host layout permits, without adding a new nested scroll container.
- State is controller-local for the loaded extension session; no settings schema, graph writes, observers, or additional graph queries are introduced.

## Verification

Pure tests cover status matching, required context ancestors, unknown status, sibling-only recursive sorting, tie-breakers, and immutability. Dashboard DOM tests cover controls, counts, empty states, active arrows, `aria-pressed`, `aria-sort`, explanatory titles, collapse preservation, and unchanged overview/Running metrics. Browser layout tests cover compact desktop controls, sticky table headers, narrow-width wrapping without horizontal control overlap, and existing task-table rails. Full lint, workflow, bundle synchronization, and regression suites must remain green.

No GitHub or Roam Depot push is part of this implementation unless separately requested.

