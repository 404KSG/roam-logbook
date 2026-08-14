# Roam-native Logbook dashboard redesign

Date: 2026-08-15  
Status: approved for implementation

## Scope

This fork preserves Roam Logbook's existing data model and core time-tracking behavior while refining the presentation for Roam's native visual language. Existing `LOGBOOK::` drawers and `CLOCK::` entries remain the source of truth. Context-menu clocking, Command Palette actions, running-clock recovery, single/multiple-clock settings, stale detection, reference/embed source resolution, and dashboard date, hierarchy, and roll-up behavior remain compatible. Pomodoro becomes an automatic per-Session target rather than a manual mode. A durable bulk Pause/Resume layer is added through graph-scoped extension settings; it closes and reopens real CLOCK Sessions rather than changing their format.

This release does not add inline TODO controls, global keyboard listeners, new graph queries, analytics, network access, or code from Roam Focus Logbook.

## Visual direction

The dashboard uses the calm, analytical structure of Contribution Graph as a reference without copying its product content:

- A centered overlay with a single large shell: `min(960px, viewport - 32px)` wide and `min(860px, viewport - 32px)` high.
- A fixed header and continuous summary rail above one scrollable document body.
- Full-screen presentation on narrow viewports.
- Flat sections and rows with light separators; no nested cards, gradients, glass effects, hover elevation, or stacked shadows.
- Roam/Blueprint system typography is inherited. Numeric counters use tabular figures.
- Theme tokens use the `--rlb-*` namespace with light and `.bp3-dark` values.

The header contains “Logbook”, a short description, range selection, a 32px refresh control, and close control. It has no decorative hero icon. Summary values retain the current Today, Last 7 days, selected-range, and Tasks tracked semantics. Running, By day, and By task retain their existing data and actions. By Task alone uses a dedicated column contract: a complete, flexible, wrapping Task title (including titles longer than 80 characters) plus stable Sessions, Own, and Total rails.

## Icon map

Only Blueprint icons already supplied by Roam are used:

| Action | Blueprint icon |
| --- | --- |
| Idle topbar entry | `history` |
| Clock out | `stop` |
| Discard clock | `trash` |
| Open task | `document-open` |
| Refresh | `refresh` |
| Close | `cross` |

The running topbar has no icon or status-dot DOM. Emoji, external icons, and custom SVG are excluded.

## Interaction and accessibility

- The topbar widget belongs to Roam's left navigation cluster immediately after Back/Forward, before the main and right action controls. Descendant navigation signals and conservative left-side fallbacks keep placement stable across Roam rerenders without relying on one class name.
- The topbar is a minimal timing-state entry: idle is a neutral-gray `history` icon; one running task visibly shows only the existing primary session's elapsed time; parallel timing shows `elapsed · N Tasks` without aggregating session time or exposing task titles. The separator uses compact CSS spacing so elapsed remains the stable leading element.
- The active-task count and separator remain neutral in light and dark themes. Normal, Pomodoro-overrun, and stale colors apply only to the elapsed-time element.
- Task context, totals, Pomodoro targets, parallel-task details, and actions remain available through the rich tooltip and running-task popover. Count language is `1 Task Running` / `N Tasks Running`; clock action names remain unchanged.
- Normal elapsed text uses Roam/Blueprint's neutral foreground family. Pomodoro overrun and stale states color only the elapsed text red or amber; the button has no status background or green treatment.
- Dashboard functionality stays in the dashboard rather than moving into the popover.
- Popover footer actions Dashboard, Pause All, Resume All, and Clock Out All are text-only. Refresh is the deliberate icon-only exception (`refresh`, with accessible text). Per-task Clock Out and Discard controls remain compact icon-only actions; no manual Pomodoro action remains.
- Every icon-only control has both `title` and `aria-label` text.
- The dialog keeps `role="dialog"`, `aria-modal`, Escape close, overlay close, and focus return.
- Responsive layouts keep every required action available.
- Clock-in and clock-out commands remain registered through `extensionAPI.ui.commandPalette` without a default shortcut. Users configure shortcuts in Roam Settings → Hotkeys. No global `keydown` shortcut is introduced.

## Durable bulk pause semantics

- Pause All snapshots every running Task, closes its open CLOCK at the same current time, and stores a versioned paused batch in graph-scoped extension settings. Paused time therefore never accrues.
- Resume All starts a fresh CLOCK Session for every valid paused Task. The extra Session is intentional and visible in the dashboard.
- An unfinished automatic Pomodoro stores its exact remaining milliseconds and continues on the new Session; completed or overrun targets persist an explicit suppressed assignment and do not restart. Display labels format remainders as clean durations rather than decimal minutes.
- Reload and crash recovery read the saved batch. A Task already running is consumed without duplication; missing Tasks are pruned with a warning; failed clock-in records alone remain for retry.
- Resume All is explicit consent to restore the complete batch. When parallel clocks are required, it enables the graph-scoped multiple-clock setting before any clock write, resumes the batch, and shows a concise notice rather than disabling the action.
- A later Pause All merges by canonical Task UID. Permanent Clock Out All clears the paused batch as well as closing current clocks.

## Automatic Pomodoro semantics

- Every newly started or graph-discovered open CLOCK receives the current global duration, measured from that Session's original start. The default is 30 minutes and the native settings input accepts arbitrary positive minute values.
- The captured target belongs to that Session. Editing the global duration affects future Sessions only; passing the target colors elapsed time red but never closes the CLOCK.
- Assignments are graph-scoped extension settings keyed by CLOCK UID. Positive values remain backward-compatible; zero is an explicit suppressed marker used when an overrun Session is paused and resumed.
- Assignment and pruning happen at the clock subscription boundary, covering context, palette, references, Resume All, and reload discovery without extra periodic graph reads.

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
