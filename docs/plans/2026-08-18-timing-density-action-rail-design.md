# Beta.38 Timing Density and Action Rail

## Decision

- Rename the Dashboard's live `RUNNING · 1 Session` heading to `TIMING` and
  remove its redundant row count. Single-focus mode exposes at most one open
  CLOCK, so the visible row already communicates presence.
- Keep historical `Sessions` metrics and task columns unchanged: they describe
  persisted CLOCK intervals across the selected range, not simultaneous work.
- Align Dashboard/Clock Out and Refresh/Delete on one shared two-column action
  rail in the Active Threads popover.
- Reduce only the live Timing panel's vertical whitespace. Preserve its labels,
  values, controls, and minimum 32px action targets.

## Boundaries

- Do not change CLOCK data, single-focus behavior, the 45-minute Parallel
  Threads window, Pomodoro continuity, navigation, or task rollups.
- Do not globally rename or remove the historical Session concept.
- Preserve Roam light/dark theme integration and narrow-width behavior.

## Verification

- Assert the Dashboard live section is labelled `Timing` and has no Session
  count node.
- Measure a compact live Timing panel in Chromium while retaining 32px actions.
- Measure both popover action columns at 320px and 340px in light and dark
  themes; require zero column drift and at least 3px separation from the Timing
  card.
- Run the complete repository check and verify the committed bundle.

## Status

Implemented and verified for Beta.38 on 2026-08-18.
