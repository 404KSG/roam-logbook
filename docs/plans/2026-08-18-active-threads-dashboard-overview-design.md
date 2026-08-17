# Beta.37 Active Threads and Dashboard Overview

## Decision

- Rename the shared Active Work surface heading from `ACTIVE WORK · N` to
  `ACTIVE THREADS · N` so the popover uses the same thread vocabulary as the
  top bar.
- Remove the secondary `N active Session(s)` / `No active Sessions` text from
  the Dashboard's Today metric. The Today card should contain only its label
  and elapsed-time value.
- Keep `RUNNING · N Session(s)` above the Dashboard Running list because that
  count describes the rows immediately below it.

## Boundaries

- Do not change timing, recent-window, Pomodoro, navigation, or persistence
  behavior.
- Do not rename the Running section or stored Session data.
- Preserve existing layout, accessibility, singular/plural behavior, and Roam
  theme integration outside the approved copy changes.

## Verification

- Update unit and browser-layout expectations for `ACTIVE THREADS · N`.
- Assert that the Today metric has no secondary context in both empty and
  running states.
- Assert that the Running list still exposes its Session count.
- Run the complete repository check and rebuild the committed bundle.

## Status

Implemented and independently verified for Beta.37 on 2026-08-18.
