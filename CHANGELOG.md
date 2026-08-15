# Changelog

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

- Kept the Logbook topbar unit stable while Roam Search expands or the window narrows.
- Added a singleton Shift+Click **Current Sessions** panel in Roam's right sidebar, using the same view model and renderer as the popover.
- Moved Refresh into each surface header and replaced the ambiguous per-row stop icon with an explicit **Check Out** action.
- Preserved paused batch rows in place, added deterministic reconciliation for explicit clock-in/out during a pause, and kept retryable partial results visible.
- Added high-DPI/narrow-width geometry and sidebar lifecycle/accessibility coverage; the suite now contains 212 tests.
