# Changelog

## 0.9.0-beta.23 — 2026-08-17

- Refined the Active Work popover into a distinct Focused card and a flat
  Recent list, making the currently timed Task visually unmistakable without
  adding a new status dot, badge, or timer behavior.
- Strengthened the Focused live elapsed value, preserved the Pomodoro-overrun
  red semantics, and kept action alignment, click/Shift+Click behavior, and
  light/dark theme safety intact.
- Replaced repeated Recent metadata with compact `<total> total · <relative
  time>` text while retaining the exact last-active org timestamp in titles and
  accessible labels.
- Added jsdom and Chromium coverage for the hierarchy, accessibility labels,
  relative metadata, flat/card separation, narrow-layout overflow, and action
  alignment. The Roam Depot submission remains a Draft preview.

## 0.9.0-beta.22 — 2026-08-17

- Replaced overlapping parallel CLOCKs with one Focused CLOCK. Switching Tasks
  closes the previous interval and opens the next at the same action instant, so
  recorded user time remains linear and cannot be double-counted.
- Added a 45-minute Active Work return set: the Top Bar shows
  `cycle time · N Active`, while the popover separates the timed Focused Task
  from untimed Recent Tasks that can be focused again with one click.
- Preserved one shared work/Pomodoro cycle across seamless Task switches.
  Pause, Clock Out, or a confirmed empty state resets the cycle; reaching the
  threshold only changes the timer colour and never ends the CLOCK.
- Changed the default Pomodoro duration from 30 to 45 minutes while preserving
  existing user-configured values and the legacy per-session compatibility data.
- Added safe reload reconciliation for legacy graphs with multiple open CLOCKs:
  the newest interval becomes Focused and older overlaps are closed at its start
  boundary without deleting or merging historical Sessions.
- Kept the Roam Depot submission as a Draft preview and rebuilt the checked-in
  bundle from the verified beta.22 source.

## 0.9.0-beta.21 — 2026-08-16

- Hardened the graph-backed completion and Pause/Resume boundaries: DONE tree
  closure and pause actions re-read their scope inside the mutation queue, use
  retryable structured outcomes, and retain exact pending work after partial or
  uncertain writes.
- Added the beta.21 Pull Watch lifecycle contract: bounded watches cover Running
  Tasks and confirmed ancestors, reload reconciliation closes the attach gap,
  missing or failing watch APIs degrade safely, and unload cleanup is idempotent.
- Kept the current-session recovery UI actionable and conservative: graph-read
  failures are not shown as empty state, last valid snapshots are retained, and
  Dashboard Refresh remains read-only.
- Reaffirmed the chart-free Dashboard with exactly four metrics, inert topbar
  Shift+Click, native right-sidebar navigation only from task titles, one shared
  Pomodoro cycle, and Task-based paused batches versus Session-based running
  units. Legacy per-session Pomodoro target fields remain compatibility-only.
- This beta.21 release keeps Roam Depot **Draft** and does not touch the external
  PR. The checked-in root bundle has been rebuilt, and `npm run check` plus
  `npm run verify:bundle` passed. No dependency upgrade is included; the existing
  esbuild advisory is dev-only non-runtime maintenance. Release evidence should
  report the current suite result from a clean run rather than pinning a brittle
  exact test count; the read-only live verification and final manual Roam smoke
  remain publication gates.

## 0.9.0-beta.20 — 2026-08-16

- Replaced the Dashboard overview's abstract `selected range` helper copy with the active date-range name on Sessions and Tasks tracked (`Last 7 days`, `Last 30 days`, or `All time`).
- Removed the duplicate helper from the current-range total card because its label already names the range; Today keeps its active-Session context and all other Dashboard behavior is unchanged.
- Added default-range, range-switch, All time, and DOM/ARIA copy-cleanliness coverage.

## 0.9.0-beta.19 — 2026-08-16

- Removed the Dashboard's secondary Analytics/chart view, toggle, chart-only aggregation, rendering, styles, and coverage. The Dashboard is now one compact surface with overview metrics, Running Sessions, By Task rollups, date range, Refresh, and Close controls.
- Preserved all non-chart behavior, including Session navigation and Shift+Click, popover actions, pause/resume, Pomodoro overrun coloring, and the neutral/yellow/red Session-count colors for 0–3, 4–6, and 7+ Sessions.

## 0.9.0-beta.18 — 2026-08-16

- Restored the topbar Session count to Roam's default neutral color for 0–3 Sessions; only 4–6 remains yellow and 7+ remains red.
- Kept the change visual-only: no helper copy, limits, warnings, or Session behavior changed. Paused history clocks remain yellow and Pomodoro overrun remains independently red.

## 0.9.0-beta.17 — 2026-08-16

- Added visual-only topbar Session load tones: 1–3 Sessions use the existing sync green, 4–6 use a restrained yellow, and 7+ use the existing overrun red; zero and all separators remain neutral, with singular/plural text unchanged.
- Changed the standalone paused/history clock icon from ochre orange to the same restrained yellow, while keeping normal idle gray and shared Pomodoro overrun behavior independent.
- Added deterministic light/dark, threshold, live-reclassification, no-copy/no-limit, lifecycle, and Chromium geometry coverage.

## 0.9.0-beta.16 — 2026-08-16

- Added an explicit navigation-cue contract to Dashboard task buttons: icon-bearing Running, By Task, and Analytics task entries keep neutral text, muted document icons, quiet hover feedback, and an accessible focus ring while preserving normal and Shift+Click navigation. Icon-less Current Session titles retain their Roam page-reference link treatment.
- Added a dedicated exactly-one-running footer row: `Dashboard | Pause | Refresh`, with the 32px Refresh control in a fixed 40px cell and no redundant bulk Clock Out action; empty, parallel, paused, and mixed Session layouts remain unchanged.
- Added beta.16 light/dark navigation styling, keyboard, semantic, action, narrow-layout, and lifecycle coverage; generated the release bundle from the same source.

## 0.9.0-beta.15 — 2026-08-16

- Made the confirmed no-Session footer a single compact row: Dashboard keeps the flexible first cell and the icon-only Refresh action keeps a fixed 40px second cell without changing the running or paused two-row surface.
- Rebuilt Analytics as a quieter Linear-style view: the Overview summary and redundant KPI cards disappear while Analytics is active; Activity owns the single Focus time total; the lower panels show top-five own-time tasks plus Other and exactly Sessions, Active days, and Median session.
- Reduced chart density without reducing meaning: one baseline, up to seven date labels, thin bars, recent-30-day labelling for All time, Roam link colours, accessible empty states, responsive 176px/148px SVG geometry, and a 210–224px desktop chart panel.
- Added beta.15 unit, browser geometry, responsive, accessibility, empty-state, distribution, and refresh-state coverage.

## 0.9.0-beta.14 — 2026-08-16

- Split the Dashboard into a chart-free four-metric Overview and a local-state Analytics view, with an accessible icon toggle, KPI summary, native SVG activity chart, Own-time task distribution, and session profile.
- Kept view switching query-free and state-safe: range, Refresh, last valid snapshot, task collapse state, Shift+Click sidebar navigation, scroll lock, and the shared Pomodoro/Session model remain intact.
- Added Roam-aware page-reference palette probing and synced/save-green detection with last-good theme retention, lifecycle cleanup, dark fallbacks, and isolated plugin CSS variables; running status dots are now 8px and visibly match Roam's stable green.
- Added beta.14 unit, browser geometry, accessibility, responsive, data-correctness, query-count, theme-probe, and lifecycle coverage.

## 0.9.0-beta.13 — 2026-08-16

- Restored reliable Session-title Shift+Click navigation to Roam's native right sidebar: `getWindows()` is authoritative, closed native windows can be reopened, old APIs retry after failed requests, and failed or unavailable sidebar calls leave the popover open with a concise notice.
- Made topbar Shift+Click deliberately inert; ordinary click remains the only topbar popover toggle, with no custom sidebar, default navigation, or layout mutation.
- Switched Session title links to Roam-theme-safe CSS variable fallbacks with current-color underline and focus treatment, including dark themes.
- Fixed the Dashboard overlay to the viewport, locked and exactly restored document scrolling/styles across close, Escape, overlay click, repeated opens, exceptions, and extension unload, and restricted scrolling to the dialog body.
- Added jsdom lifecycle, native-sidebar retry, scroll-lock, and Chromium wheel/geometry/accessibility regression coverage.

## 0.9.0-beta.12 — 2026-08-16

- Renamed the user-visible Dashboard heading and overview label to **Roam Logbook** without changing internal extension IDs, commands, or Depot identity.
- Rebuilt the Dashboard overview as one compact Linear-style summary strip: a single subtle frame, transparent metric cells, three responsive columns, a 26–30px seven-day activity rail, and a mobile Today/Tasks plus Last 7 days layout that stays content-fit.
- Kept Refresh feedback in the accessible live region while making it visually hidden for idle, loading, success, and failure; only the icon rotates during loading, while retryable failure remains visible through the existing notice.
- Added beta.12 browser geometry, responsive overflow, refresh-state stability, title, and accessibility coverage while preserving Session links, graph-read-only Refresh behavior, Pomodoro state, pause state, and CLOCK data.

## 0.9.0-beta.11 — 2026-08-16

- Made Current Sessions Refresh an explicitly read-only graph re-read with coalesced fast clicks, a loading spin/`aria-busy`, visually hidden live success status, and an accessible retryable error state that retains the last valid snapshot and keeps the popover/sidebar open.
- Kept Refresh in the bottom footer without changing CLOCK data, pause state, or the shared Pomodoro cycle, and avoided duplicate subscriber/explicit rerenders.
- Replaced the leading Session title document glyph with a native keyboard-accessible restrained link target while preserving ordinary click navigation and Shift+Click right-sidebar behavior.
- Added regression coverage for unchanged/external graph refreshes, coalescing, failure retention, read-only state safety, live labels, popover lifecycle, and title-link accessibility.

## 0.9.0-beta.10 — 2026-08-16

- Replaced per-clock Pomodoro colouring with one persisted shared cycle: the first confirmed running Session freezes the threshold and action start instant, parallel Session changes retain it, exact threshold time turns red without stopping, and an empty state/Pause All/Clock Out All/final Check Out resets it.
- Resume starts a fresh shared cycle instead of restoring per-clock remainder or suppression state; valid cycles survive reload and missing cycles fall back to the earliest open CLOCK without writing graph data.
- Kept the legacy `pomodoroTargets` map readable for compatibility, removed visible per-session target metadata, and migrated old pause Pomodoro fields safely without rewriting CLOCK records.
- Tightened the beta.10 UI acceptance geometry: 116px overview cards, 52px activity rail, content-fit desktop Dashboard width up to 1120px, compact shared session surface, 0px status/title center error in the Chromium fixture, and equal 32px footer actions.
- Added shared-cycle boundary, parallel/reload/reset, sync-indicator isolation, pause/resume, and no-visible-target regression coverage. The complete local suite contains 245 tests.

## 0.9.0-beta.9 — 2026-08-15

- Made Shift+Click Roam-native for both the topbar Current Sessions surface and task entries: task blocks use the right-sidebar `open`/`addWindow` API, repeated block windows are extension-deduped, and delayed sidebar host mounting is handled safely.
- Unified the four current-session footer actions on a shared 32px height token across popover/sidebar and kept Refresh as the centered icon in the lower-right grid cell.
- Rebuilt the Dashboard overview as three low-contrast Linear-inspired stat panels with a readable selected-range activity chart, then placed compact Running and By Task list panels directly below it without changing statistics or hierarchy semantics.
- Added RED→GREEN public interaction and Chromium geometry coverage for native sidebar calls, missing UIDs, action non-bubbling, async host mounting, equal footer heights, three-panel overview geometry, and 56–84px activity bars.
- The complete local suite now contains 234 tests, including browser geometry, accessibility, data-health ordering, and final-bundle lifecycle coverage.

## 0.9.0-beta.8 — 2026-08-15

- Reworked the Dashboard as a content-fit inspector: short reports no longer reserve a near-full-screen shell, while long task lists scroll inside the body below a compact header.
- Replaced the floating summary blocks with one semantic inline overview bar containing Today, the selected range, Tasks tracked, and an accessible date-free micro activity rail.
- Removed obsolete visible activity labels and beta.7 modal/stat layout rules without changing range, timing, hierarchy, or roll-up semantics.
- Made paused topbar state icon-only: the history icon uses muted ochre on the normal transparent surface, with no background block, ring, or pause badge.
- Added RED→GREEN DOM and browser geometry coverage for content fit, body scrolling, inline metrics, quiet activity buckets, responsive containment, and paused icon color/background priority.
- The complete local suite now contains 228 tests, including browser geometry, accessibility, data-health ordering, and final-bundle lifecycle coverage.

## 0.9.0-beta.7 — 2026-08-15

- Rebuilt the Dashboard around an integrated three-metric summary: the selected-range metric now owns the real daily activity rail, and the standalone By Day section is gone.
- Made By Task the primary list after the summary and any actual Running Sessions; moved roll-up guidance to an accessible info control and kept graph-read/timing issues conditional and compact.
- Removed the paused topbar's pause badge DOM and CSS. Paused state now keeps the history-clock identity and uses only a low-saturation ochre background plus its accessible paused count.
- Added public DOM, range, responsive, accessibility, and lifecycle coverage for the embedded rail, omitted sections, empty/running states, and badge removal.
- The complete local suite now contains 226 tests, including browser geometry, accessibility, data-health ordering, and final-bundle lifecycle coverage.

## 0.9.0-beta.6 — 2026-08-15

- Simplified the Dashboard into a quiet Roam-native surface: summary metrics no longer read as cards, repeated table/track borders are removed, and By Day keeps one shared baseline with silent zero-value days.
- Made the paused topbar state visible without adding a label: the history-clock identity remains compact and gains a muted warm pause badge plus an explicit paused accessible name.
- Rebuilt current-session rows around a title-row grid so running, paused, and error status points align with the title rather than the metadata block.
- Added public browser geometry and state coverage for the minimal Dashboard, shared chart baseline, paused-vs-idle topbar identity, and title-row status alignment.
- The complete local suite now contains 224 tests, including browser geometry, accessibility, and final-bundle lifecycle coverage.

## 0.9.0-beta.5 — 2026-08-15

- Moved the shared Current Sessions Refresh action back into the two-column footer grid, with one centered icon-only control and no header placeholder.
- Replaced the visible paused-row **Paused** action text with an actionable icon-only **Resume** control; individual resume keeps failed rows retryable and avoids duplicate CLOCKs on repeated clicks.
- Reduced only the session-surface and Dashboard typography/row-spacing tokens so 3–5 Sessions and more By Task rows fit without changing statistics or timing semantics.
- Added public geometry and interaction coverage for footer placement, paused-row accessibility, individual resume recovery, and the beta.5 density contract.
- The complete local suite now contains 220 tests, including browser geometry, accessibility, and final-bundle lifecycle coverage.

## 0.9.0-beta.4 — 2026-08-15

- Corrected the idle topbar trigger to a square, Roam-aligned icon hit target that remains stable beside expanded Search and at narrow widths.
- Restored per-Session **Check Out** to a neutral `log-out` icon in the popover, right sidebar, and Dashboard, with the same accessible label and single-row action semantics.
- Compressed the Dashboard's By Day section into an inline-range weekly chart with a visible baseline, quiet tracks, compact duration labels, and earlier By Task content.
- Added RED→GREEN geometry and behavior coverage for idle/focus states, icon-only checkout actions, compact chart layout, labels, and clipping.
- The complete local suite now contains 215 tests, including browser geometry, accessibility, and final-bundle lifecycle coverage.

## 0.9.0-beta.3 — 2026-08-15

- Kept the Roam Logbook topbar unit stable while Roam Search expands or the window narrows.
- Added a singleton Shift+Click **Current Sessions** panel in Roam's right sidebar, using the same view model and renderer as the popover.
- Moved Refresh into each surface header and replaced the ambiguous per-row stop icon with an explicit **Check Out** action.
- Preserved paused batch rows in place, added deterministic reconciliation for explicit clock-in/out during a pause, and kept retryable partial results visible.
- Added high-DPI/narrow-width geometry and sidebar lifecycle/accessibility coverage; the suite now contains 212 tests.
