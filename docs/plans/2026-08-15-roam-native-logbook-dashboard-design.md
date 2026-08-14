# Roam-native Logbook dashboard redesign

Date: 2026-08-15  
Status: approved for implementation

## Scope

This fork preserves Roam Logbook's existing data model and time-tracking behavior while refining the presentation for Roam's native visual language. Existing `LOGBOOK::` drawers and `CLOCK::` entries remain the source of truth. Context-menu clocking, Command Palette actions, running-clock recovery, Pomodoro targets, single/multiple-clock settings, stale detection, reference/embed source resolution, and dashboard date, hierarchy, and roll-up behavior are unchanged.

This release does not add inline TODO controls, global keyboard listeners, new graph queries, analytics, network access, or code from Roam Focus Logbook.

## Visual direction

The dashboard uses the calm, analytical structure of Contribution Graph as a reference without copying its product content:

- A centered overlay with a single large shell: `min(840px, viewport - 32px)` wide and `min(860px, viewport - 32px)` high.
- A fixed header and continuous summary rail above one scrollable document body.
- Full-screen presentation on narrow viewports.
- Flat sections and rows with light separators; no nested cards, gradients, glass effects, hover elevation, or stacked shadows.
- Roam/Blueprint system typography is inherited. Numeric counters use tabular figures.
- Theme tokens use the `--rlb-*` namespace with light and `.bp3-dark` values.

The header contains “Logbook”, a short description, range selection, a 32px refresh control, and close control. It has no decorative hero icon. Summary values retain the current Today, Last 7 days, selected-range, and Tasks tracked semantics. Running, By day, and By task retain their existing data and actions.

## Icon map

Only Blueprint icons already supplied by Roam are used:

| Action | Blueprint icon |
| --- | --- |
| Idle topbar entry | `history` |
| Pomodoro | `stopwatch` |
| Clock out | `stop` |
| Discard clock | `trash` |
| Open task | `document-open` |
| Refresh | `refresh` |
| Close | `cross` |

The running topbar has no icon or status-dot DOM. Emoji, external icons, and custom SVG are excluded.

## Interaction and accessibility

- The topbar widget belongs to Roam's left navigation cluster immediately after Back/Forward, before the main and right action controls. Descendant navigation signals and conservative left-side fallbacks keep placement stable across Roam rerenders without relying on one class name.
- The topbar is a minimal timing-state entry: idle is a neutral-gray `history` icon; one running task visibly shows only the existing primary session's elapsed time; parallel timing shows `N Tasks · elapsed` without aggregating session time or exposing task titles.
- The active-task count and separator remain neutral in light and dark themes. Normal, Pomodoro-overrun, and stale colors apply only to the elapsed-time element.
- Task context, totals, Pomodoro targets, parallel-task details, and actions remain available through the rich tooltip and running-task popover. Count language is `1 Task Running` / `N Tasks Running`; clock action names remain unchanged.
- Normal elapsed text uses Roam/Blueprint's neutral foreground family. Pomodoro overrun and stale states color only the elapsed text red or amber; the button has no status background or green treatment.
- Dashboard functionality stays in the dashboard rather than moving into the popover.
- Every icon-only control has both `title` and `aria-label` text.
- The dialog keeps `role="dialog"`, `aria-modal`, Escape close, overlay close, and focus return.
- Responsive layouts keep every required action available.
- Clock-in and clock-out commands remain registered through `extensionAPI.ui.commandPalette` without a default shortcut. Users configure shortcuts in Roam Settings → Hotkeys. No global `keydown` shortcut is introduced.

## Performance constraints

The dashboard reads the graph only when opened, its range changes, an action completes, or refresh is explicitly requested. The topbar continues updating existing text nodes on its timer; it does not rebuild the dashboard or add graph queries. Session counts, if displayed, are derived only from the dashboard entries already read.

## Public test seams

The redesign is verified through user-visible boundaries:

1. Extension `onload`/`onunload` with a simulated Roam API.
2. Dashboard DOM after opening it from the registered Command Palette action.
3. Topbar DOM, icon states, and popover controls.
4. Command registration objects, including the absence of default-hotkey fields.
5. The built `extension.js` ESM default export exposing `onload` and `onunload`.

Tests mock only Roam, time, and jsdom boundaries. Existing clock, parser, hierarchy, Pomodoro, and statistics suites remain in place.

## Rollout

1. Pin the upstream baseline and record baseline checks.
2. Add observable presentation regressions, then implement each topbar and dashboard slice.
3. Add build and installation documentation and run the complete local verification matrix.
4. Rebuild from a clean clone of the exact source commit.
5. Publish the fork and submit a Draft Roam Depot entry for live preview.

The Draft remains unmerged until a real Roam graph smoke test confirms left-navigation placement, Blueprint `history` availability, light/dark appearance, parallel-task labeling, context menus, hotkey customization, and dashboard behavior with existing `LOGBOOK::` data.
