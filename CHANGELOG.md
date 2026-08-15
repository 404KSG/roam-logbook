# Changelog

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
