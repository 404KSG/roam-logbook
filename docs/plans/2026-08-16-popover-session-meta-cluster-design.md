# Popover Session metadata cluster design

Date: 2026-08-16
Status: approved for implementation by 404KSG

## Outcome

The running-Session metadata in the compact popover should read as one left-aligned information group: current elapsed time, total tracked time, a middle-dot separator, and the local Started timestamp. The Started value must no longer be pushed to the far-right edge of the row.

## Layout boundary

- Keep the existing semantic nodes: the elapsed/total summary remains one node, Started remains a `<time>` node, and the separator remains `aria-hidden`.
- Preserve the single-line, no-wrap contract at 320 px and 340 px popover widths.
- Remove only the primary metadata node's flexible expansion. The metadata group remains left-aligned and compact, with the existing separator spacing.
- If horizontal space is constrained, the elapsed/total summary may ellipsize first; the Started timestamp remains visible and the action buttons remain usable.
- Do not alter paused rows, recovery rows, Dashboard metadata, clock semantics, or graph writes.

## Verification

Browser layout coverage must verify that the primary summary, separator, and Started timestamp occupy adjacent positions rather than spreading across the row. Existing semantic, accessibility, narrow-width overflow, action sizing, paused-row, full-suite, lint, workflow, and generated-bundle checks must remain green.

