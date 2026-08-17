# Top Bar Threads Label Design

Date: 2026-08-18
Status: approved

## Goal

Make the compact Top Bar describe the number of parallel work threads without
suggesting that every item is accumulating time concurrently.

## Approved language

- Replace visible Top Bar `N Active` with grammatically singular/plural
  `1 Thread` / `N Threads`.
- The count continues to represent the complete Active Work set: the one
  Timing Line, when present, plus every Parallel Thread still inside the
  45-minute return window.
- Keep the Popover title `ACTIVE WORK · N` and section labels `TIMING` and
  `PARALLEL THREADS · N` unchanged.
- Keep tooltip and accessible composition details explicit: one timing line
  and the applicable number of parallel threads.

## Boundaries

- Do not change timing, switching, expiry, Pomodoro, task state, colors, graph
  storage, Dashboard data, or navigation.
- Preserve the existing neutral/yellow/red load thresholds; only their visible
  count label changes.
- Idle icon-only presentation remains unchanged.

## Verification

- Cover `1 Thread` and plural `N Threads` in Top Bar text, title, and ARIA.
- Verify the count still updates in place and retains existing load tones.
- Verify narrow layouts and the full build/bundle pipeline.
