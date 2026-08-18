# Beta.40 Activity Dashboard

## Product boundary

Beta.40 adds Activity to the existing single-page Dashboard. It does not add
an Insights/Analytics view, a view toggle, a Category/config system, a second
graph query, or a chart dependency. The Dashboard remains the source of the
existing snapshot and keeps Timing (when present) before Activity and By Task.

## Model

`src/activity.js` is a pure projection of the Dashboard entries snapshot.

- Today creates one bucket per Session, sorted by start time.
- Last 7 days creates seven start-day buckets with full duration labels.
- Last 30 days creates thirty start-day buckets with compact duration labels
  and month markers at the first visible day and month boundaries.
- All time uses Monday-aligned weekly buckets for spans up to 90 days and
  calendar-month buckets for longer spans, including zero buckets in the
  complete interval.
- A Session belongs wholly to the date on which it started, including an
  overnight Session. Running time is refreshed from the cached entry in the
  existing Dashboard ticker; it does not trigger another graph read.
- Empty snapshots return no Activity buckets so the existing compact empty
  Dashboard state remains intact. Non-empty ranges retain quiet zero buckets.

Each bucket carries duration, date, full-date, and Session-count data. The view
uses the same values for visible annotations, `title`, and `aria-label`.

## View and geometry

`src/activity-view.js` owns DOM rendering and the small live update seam. The
panel uses the existing Roam/Linear tokens and sync green for the only
quantitative colour. It has no gradient, shadow, grid, axis, or horizontal
scroll rail. Desktop columns show duration above the bar and date below it;
narrow screens reduce date typography while keeping non-zero duration labels.
The panel target is approximately 198px tall and a completely empty snapshot
does not render a large blank chart.

## Verification seams

- Pure model tests cover Today/7/30/All, zero buckets, cross-midnight data,
  and a running Session.
- Dashboard DOM tests cover public ordering, range labels, accessible bucket
  annotations, no Insights/Category controls, and stable query counts.
- Performance tests prove that the live ticker updates the existing Activity
  nodes from cached data without replacing the chart or querying Roam.
- Chromium tests cover light/dark desktop geometry and narrow 30-day layout:
  no overflow, duration above bars, date below bars, and panel height/readability.
