# Beta.42 Hourly Today Activity and Silent Zero Labels

## Product boundary

Beta.42 refines the existing single-page Dashboard without adding a view,
setting, query, observer, storage key, migration, or dependency. It restores
the Dashboard glyph selected by 404KSG and changes only Activity's Today
aggregation and zero-value presentation.

## Today model

Today uses exactly 24 local-hour buckets from `00:00` through `23:00`. A
Session that overlaps more than one hour contributes minutes proportionally to
every hour it actually occupies, so the sum of all buckets remains equal to the
selected Session total. Closed Sessions become fixed contributions. Running
Sessions retain cached entry references and are redistributed by the existing
Dashboard ticker as `now` advances; this performs no additional Roam read.

The visible hour axis labels `00`, `06`, `12`, and `18` to keep the 24-column
chart readable at narrow widths. Every bucket still has a complete tooltip and
ARIA label with the full local hour, human duration, and Session count.

## Zero-value presentation

Every Activity range uses an empty visible duration string when a bucket has no
minutes. The bucket remains in the calendar/hour sequence, keeps its date or
hour context, `data-activity-minutes`, zero-duration tooltip/ARIA information,
empty class, and 2px low-contrast baseline. Dashboard overview metrics such as
Today `0m` are not hidden; the rule applies only to Activity bar annotations.

## Dashboard action

The Active Threads header uses Blueprint `bp3-icon-dashboard` instead of Home.
The action continues to open the same Dashboard and retains its title, ARIA
label, keyboard behavior, and shared 32px action rail.

## Verification

- Pure tests cover exactly 24 hour buckets, cross-hour allocation, totals,
  running redistribution, sparse axis labels, and silent zero labels.
- DOM and performance tests cover cached live updates, no additional graph
  reads, preserved datasets/tooltips/ARIA, and compact empty-range behavior.
- Chromium tests cover 24-hour wide/narrow containment, sparse labels, silent
  zero annotations, retained baselines, and existing 7/30-day geometry.
- Popover tests require the Dashboard glyph and reject the retired Home glyph.
