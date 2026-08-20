# Beta 58: native switch latency and analysis-only Dashboard

## Outcome

Clock In and Active Work switches should feel like Roam's native Shift+Click:
the right-sidebar request begins immediately, an older request cannot win after
a newer click, and graph writes remain serialized. The Dashboard becomes an
analysis surface rather than a second control surface for the live CLOCK.

## Performance root cause

Beta 57 marked every `active-work-switch` as `preferExisting`. That instruction
starts `setWindowOrder` before Roam confirms whether the target window exists.
It is useful after a reload when the window really exists, but it penalizes a
new Task: a slow or rejected native reveal can delay the authoritative
`getWindows`/`addWindow` path that would have opened it directly in beta 56.

The fix keeps speculative reveal only for windows already confirmed in the
45-minute local Active Work cache. Plugin initialization primes that cache from
Roam's native window list in the background when the host supports it. Unknown
targets use the authoritative read/add path without a blind reveal, including
when an older native operation is pending. Confirmed targets may still use the
preview lane, and the queued pass makes the newest intent the final order. The
warmup runs outside the synchronous startup path and uses a cache revision so a
late startup snapshot cannot overwrite a newer user-action result.

## Dashboard information architecture

The Dashboard contains three analysis layers:

1. Four compact metrics: Today, selected-range time, Sessions, and Tasks.
2. Activity distribution for the selected range.
3. The By Task tree with status filters, sorting, rollups, and focus actions.

The `Timing`/Running card is removed. Live Clock Out and discard controls remain
in Active Work, where the running context belongs. The Dashboard's minute-level
metrics and activity update once per minute while a CLOCK is running; it no
longer repaints those values every second.

## Verification seams

- An unknown Active Work target does not call `setWindowOrder` before native
  validation; a confirmed recent target still does.
- Cache priming is non-blocking, tolerates missing/closed-sidebar APIs, and does
  not open or mutate the sidebar.
- Rapid A → B switching leaves B as the final native order in modern and legacy
  Roam adapters, and an unknown B never previews merely because A is pending.
- A late startup cache read cannot replace a window hint confirmed by the first
  user action.
- A Dashboard with a Focused CLOCK renders metrics, Activity, and By Task, but
  no `Timing`/Running card; its live timer interval is 60 seconds.
- Crossing a local date boundary rebuilds Activity and By Task from the cached
  snapshot without another Roam graph read.
- Bundle, lifecycle, layout, mutation, and graph-safety suites remain green.
