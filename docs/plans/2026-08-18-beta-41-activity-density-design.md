# Beta.41 Activity Density and Complete All-time Timeline

## Product boundary

Beta.41 refines the existing single-page Activity panel. It does not add an
Insights view, a toggle, categories, configuration, storage, observers, a graph
query, or a chart dependency. All Dashboard ranges remain available because the
selected range still controls the complete overview, Timing, and By Task data.

## Model

`src/activity.js` remains a pure projection of the one Dashboard entries
snapshot.

- Today creates one Session bucket per entry in start order. Its explicit
  density contract narrows bars as the Session count grows.
- Last 7 days creates seven start-day buckets with full human-readable duration
  labels and a wide `42px` bar contract.
- Last 30 days creates thirty start-day buckets with narrow `10px` bars. Visible
  duration labels are decimal hours rounded to one decimal place; the Activity
  heading supplies the low-contrast `HOURS` context. Tooltips and ARIA retain
  full `h mm` durations.
- All time starts at the first Session's calendar month and ends at the current
  calendar month, even when the latest Session is older. Inclusive spans of up
  to 24 calendar months use one bucket per month; longer spans use one bucket
  per calendar year. Empty months/years remain quiet baseline buckets. Month
  labels identify January year boundaries (`Jan ’26`), and year labels use four
  digits.
- An overnight Session remains wholly assigned to its start day. Running time
  is refreshed from cached entries by the existing Dashboard ticker.

The model exposes `rangeId`, `unit`, `durationFormat`, bucket count, and an
explicit density object. This makes responsive width a deliberate range/unit/
count contract rather than an accidental consequence of a container width.

## View and geometry

`src/activity-view.js` writes the density contract to chart and plot data
attributes plus `--rlb-activity-bar-width`. The existing CSS grid distributes
columns without a horizontal scroll rail; each bar uses the explicit width with
`max-width: 100%` as the narrow-screen safety valve. The panel keeps the
minimal Roam/Linear token system: no gradients, shadows, animations, axes, or
grid lines.

Visible labels are intentionally compact only where the 30-day density requires
it. Every bucket still has a complete accessible name containing its period,
human-readable total, and Session count. Zero buckets retain a low-contrast
baseline.

## Verification seams

- Pure model tests cover Today/7/30/All, the 24-month boundary, current-month
  inclusion, year aggregation, zero buckets, cross-midnight data, running data,
  full ARIA durations, and the density hierarchy.
- Dashboard DOM tests cover Timing → Activity → By Task ordering, `HOURS`, the
  explicit density contract, full ARIA duration, no extra graph read, and the
  existing no-secondary-view boundary.
- Performance tests prove the live ticker updates existing Activity nodes from
  cached data without replacing the chart or querying Roam.
- Chromium tests cover light/dark wide 7-day geometry, narrow 30-day geometry,
  no overflow, explicit bar width, duration above bars, date below bars, and
  panel height/readability.
