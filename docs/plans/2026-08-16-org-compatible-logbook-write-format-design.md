# Org-compatible Logbook write-format design

Date: 2026-08-16
Status: approved for implementation by 404KSG

## Outcome

New Roam Logbook writes should retain the existing Roam task → drawer → clock hierarchy while adopting the useful parts of Org Mode's behavior: a newly created `LOGBOOK::` drawer is collapsed, the newest CLOCK child is inserted first, and newly written CLOCK lines use the Org keyword form `CLOCK:`. Existing `LOGBOOK::`, `LOGBOOK:`, `:LOGBOOK:`, `CLOCK::`, and `CLOCK:` records remain readable. No bulk graph migration is performed.

Completed Sessions remain independent audit records. Clock In, Clock Out, Pause, Resume, completion reconciliation, and reload must not merge adjacent or fragmented records. Zero-minute records remain valid by default.

## Storage and ordering

- Keep `LOGBOOK::` as the Roam drawer anchor so existing graph discovery and third-party drawer assumptions remain compatible.
- Set a newly created drawer's Roam `open` property to `false`. Do not forcibly collapse an existing drawer on later Clock Ins because that would override the user's current view state.
- Serialize future running and completed entries with `CLOCK:`.
- Insert every new CLOCK block at child order `0`, relying on Roam to shift older siblings. Closing a running CLOCK updates that exact block in place and must not reorder or merge any record.
- Continue parsing both single- and double-colon forms so historical records and mixed drawers remain valid.

## Duration authority and data health

For a completed record with valid start and end timestamps, `computedMinutes` is the reporting value. The optional `=> H:MM` remains `declaredMinutes`, a derived human-readable summary and audit signal. If it differs from the timestamp interval, keep emitting `declared-duration-mismatch`; do not silently rewrite the source block. Existing malformed and orphan recovery behavior remains unchanged.

This intentionally changes Dashboard totals for mismatched historical records without changing their graph text. The Data Issues surface must continue to expose the discrepancy so the user can review it. Normal Clock Out continues to write a matching derived summary.

## Verification

Regression coverage must prove:

1. New drawers are created collapsed while pre-existing drawers are not mutated merely by Clock In.
2. New CLOCK lines use one colon and mixed old/new formats parse after reload.
3. A second Session appears before the first in raw Roam child order and both remain independent.
4. Clock Out updates only the targeted Session and preserves zero-minute records.
5. Timestamp duration wins over a conflicting declared summary while the mismatch issue remains visible.
6. Existing completion, Pause/Resume, Dashboard, lifecycle, bundle, and workflow suites remain green.

No source or Depot push is part of this implementation unless separately requested.
