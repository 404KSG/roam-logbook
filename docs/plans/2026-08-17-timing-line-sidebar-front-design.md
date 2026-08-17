# Timing Line Right-sidebar Fronting Design

## Goal

Keep the block that owns the single timer visible as the first item in Roam's
native right sidebar. This makes the sidebar the working context for the current
Timing Line while preserving the other parallel Open Lines below it.

## Approved interaction

- Add a setting named `Keep Timing Line at top of right sidebar`.
- The setting is enabled by default.
- After a user-initiated Clock In succeeds, open the Timing Line block in the
  right sidebar at order `0`.
- After switching from an Open Line, move that block's existing sidebar window
  to order `0`; create it at order `0` only when it is not already open.
- Keep every unrelated or previously opened sidebar window. Do not close, pin,
  unpin, or duplicate windows.
- Open or reorder the window without moving keyboard focus or text selection.

## Trigger boundary

Run the behavior only after explicit user actions that successfully establish a
Timing Line:

- command-palette Clock In;
- TODO block context-menu Clock In;
- Active Work Open Line switch.

Do not trigger it during extension load, graph refresh, cache reconciliation,
legacy overlap repair, or other background synchronization. Repeating Clock In
for an already timed block may still bring its existing window to the front.

## Native API strategy

Use `roamAlphaAPI.ui.rightSidebar` only:

1. Open the sidebar.
2. Read `getWindows()` when available.
3. If the target block window exists, call `setWindowOrder` with `order: 0` and
   expand it when the native API exposes `expandWindow`.
4. Otherwise call `addWindow` with `{ type: "block", "block-uid": uid, order: 0 }`.
5. On older Roam builds, fall back to the existing deduplicated `addWindow`
   path and include `order: 0`.

No DOM reordering is allowed.

## Failure and concurrency

- Sidebar failure never rolls back or fails a successful Clock In.
- Report one concise, non-blocking warning through the existing notification
  path when a user action cannot front the sidebar block.
- Rapid switches are last-intent-wins: an older asynchronous request must not
  move its block above the newest Timing Line.
- Disabling the setting stops future automatic fronting and does not mutate
  windows already open.

## Verification

Cover new and existing windows, order `0`, no duplication, no pin/remove calls,
disabled settings, all three user entry points, background non-triggers,
navigation failure isolation, and rapid-switch ordering. Preserve the existing
Shift-click and Dashboard sidebar behavior.
