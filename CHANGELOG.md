# Changelog

## 0.9.0-beta.51 — 2026-08-20

A full-codebase review pass. No graph format change and no migration; existing
LOGBOOK data, settings, and running CLOCKs are read exactly as before.

### Task Tracker identity and context

- Renamed every current user-facing extension surface to **Task Tracker** while
  preserving the package identifier, settings keys, internal CSS namespace,
  upstream attribution, and existing `LOGBOOK:` / `CLOCK:` graph records.
- Added a context path distinct from task hierarchy. Today, the Timing Line,
  and Parallel Threads now show every confirmed ancestor block inside the
  enclosing page, including plain, TODO, and DONE ancestors, while excluding
  the page title and task itself. Breadcrumb segments retain ordinary and
  Shift-click navigation and never logically compact the stored path.
- Kept context lookup outside the one-second timer tick, reused the loaded
  Daily Note tree for Today, and made uncertain graph ancestry non-fatal.
- Simplified task interaction paint to one subtle row-level hover/focus surface;
  title buttons remain transparent, native title tooltips are removed, and
  explicit keyboard focus rings remain visible.

### Data integrity

- A Clock In that switches tasks no longer reports a generic failure when the
  new CLOCK cannot be created after the old one was closed. It returns a
  structured partial result naming the closed CLOCKs, so "the previous session
  ended but the new one did not start" is visible and retryable.
- The post-write refresh now confirms the intended change actually landed: a
  closed CLOCK must read back as not running, and a new CLOCK must exist. A
  write silently dropped by Roam is reported as uncertain instead of success.
- A retry set is scoped to the CLOCKs the action asked for, instead of every
  running CLOCK in the graph.
- Discard validates the entry before deleting a block, and reports a structured
  uncertain state if drawer cleanup fails after the delete succeeded.
- DONE watch events that arrive while an auto clock-out is in flight are queued
  instead of dropped.
- A malformed `=> H:MM` audit value is a non-fatal data issue: the timestamps
  stay authoritative and that session's time is no longer excluded from every
  total.
- Timestamps in the DST spring-forward gap hour parse instead of returning null,
  so a session recorded in another timezone keeps its time.
- Filtering the By Task tree recomputes visible totals, so a parent no longer
  shows a total its visible children cannot account for.

### Performance

- Entry discovery binds a finite set of drawer spellings so Roam can use the
  `:block/string` index, replacing a predicate scan over every block in the
  graph. Single-entity reads use `data.pull`/`pull_many` and snapshot reads
  prefer `data.fast.q`, each with the previous query path as fallback.
- The predicate fallback that silently missed `:LOGBOOK:` drawers is gone.
- The topbar computes Active Work once per tick rather than twice, and banked
  minutes are aggregated once instead of in two places.
- Closing several sessions performs one confirmation read instead of one full
  graph read per session.
- `theme.js` watches root attributes and the discovered topbar instead of the
  whole document, and no longer forces layout or style recalculation inside a
  MutationObserver callback.
- The boot-time host observer gives up with a warning instead of watching
  `document.body` forever when Roam's topbar cannot be found.

### Roam host safety

- The plugin no longer sets `container-type` or `display` on Roam's own
  navigation host. That containment made the host the containing block for
  Roam's fixed and absolute descendants, which could misplace Roam's own
  overlays.
- The page-link colour probe is no longer inserted into React-owned block text,
  and its result is cached per theme signature.

### Accessibility

- Dialogs mark the rest of the app `inert`, so a screen reader cannot browse
  behind an open popover or dashboard.
- The topbar button keeps a stable accessible name; per-second timing detail
  moved to a polite live region instead of rewriting the button's label.
- `title` is no longer copied into an identical `aria-label`, which made
  assistive tech announce the same string twice. Buttons whose visible text
  cannot carry the full meaning still set an explicit label.
- Activity bars use a roving tabindex instead of one tab stop per bar, refresh
  status uses fixed-role live regions, and small muted text meets an 11px floor.

### Maintenance

- `styles.js` is split into `src/styles/`, and the topbar and dashboard are
  split into focused modules. Focus trapping, refresh state, and discard
  confirmation are shared rather than duplicated.
- `verify:bundle` runs before the tests, so a stale bundle fails fast; eslint
  covers `scripts/*.mjs`; `build.js` rejects a valueless `--outfile`.

## 0.9.0-beta.50 — 2026-08-19

- Replaced the visible Active Threads title plus full-width view switch with one
  32px Linear-style toolbar containing auto-width `Threads N` and `Today N`
  tabs. Selected tabs now use a restrained neutral surface and strong neutral
  text; counts are quieter and task links retain Roam blue.
- Removed the permanent header Refresh action. Cache-first opening still starts
  post-paint background revalidation; loading occupies a fixed Today status
  slot, success is silent, and failures preserve the last successful data with
  an accessible inline `Couldn’t update · Retry` action. A failed first Today
  read has its own compact Retry state.
- Added a strict 30-second Today freshness boundary, in-flight read coalescing,
  and no Today polling, body observer, setting, or reset timer. Dashboard is
  always the rightmost header action, with Today Expand/Collapse immediately
  before it only when relevant.
- Added DOM, accessibility, freshness, retry, query-count, lifecycle, and real
  Chromium geometry coverage for 460px and 304/324/344px shells, including
  count-to-spinner invariance and leaf-only/error states.

## 0.9.0-beta.49 — 2026-08-19

- Replaced the Today tree's separate Expand all and Collapse all buttons with
  one stateful toggle. Its Blueprint icon, title, ARIA label, and
  `aria-expanded` state follow the current tree mode; Collapse all still keeps
  the current Timing Line ancestor path visible.
- Removed hidden descendant count badges and count-bearing expansion tooltips
  from Today rows. Play and Currently timing now share one fixed 32px,
  right-aligned action column across parent, leaf, and deeply nested rows.
- Added DOM and Chromium coverage for the one-button state transition, absent
  count markup, action-column alignment, and narrow-layout overflow.
- Made the Chromium layout fixture retry one isolated browser bootstrap after
  a cold-start failure while leaving fixture and assertion failures unmasked.

## 0.9.0-beta.48 — 2026-08-19

- Started native right-sidebar navigation from the immediate user Clock In
  intent instead of waiting for drawer creation, CLOCK writes, and post-write
  graph confirmation. Timing remains authoritative and serialized; navigation
  is a reversible UI effect that can render alongside the graph mutation.
- Removed the redundant `await rightSidebar.open()` gate from first-time task
  display. The sidebar now warm-opens without blocking the authoritative
  `getWindows` and `addWindow` path, while synchronous throws and rejected
  warm-ups remain isolated from a successful block reveal.
- Preserved latest-intent wins, native-window deduplication, stale-cache
  recovery, unrelated sidebar windows, and the existing graph uncertainty
  boundary. Added deterministic regressions for pre-confirmation intent and a
  slow or rejected native `open()` call.

## 0.9.0-beta.47 — 2026-08-19

- Added a bounded fast path for recently confirmed Timing Line sidebar windows,
  avoiding repeated `open` and `getWindows` round trips during normal task
  switching while preserving serialized native operations and newest-intent
  wins. Closed or stale windows still fall back to Roam's authoritative list
  and are recreated without duplication.
- Added compact icon-only Expand all and Collapse all controls to the Today task
  tree. Only parent Tasks enter the local expansion set, and Collapse all keeps
  the current Timing Line's forced-open ancestor path visible.
- Reserved the popover's vertical scrollbar gutter so long Today trees can begin
  or stop overflowing without shifting the panel's content width. Chromium
  geometry coverage verifies stable left, right, and width positions.

## 0.9.0-beta.46 — 2026-08-19

- Expanded the Active Threads/Today popover to a controlled 460px desktop
  width while keeping it constrained to the viewport on 320/340/360px screens.
- Fixed the Today task grid so its title rail flexes and ellipsizes from the
  right, the Play and `+N` actions stay in a fixed column, and deep hierarchy
  indentation remains bounded without horizontal overflow.
- Kept Threads, Today, empty, and error states in the same responsive shell;
  no Today query, cache, timing, or interaction semantics changed.

## 0.9.0-beta.45 — 2026-08-19

- Added a compact `Threads · N` / `Today · N` switch to the existing Active
  Threads popover without changing the single Timing Line or its counts.
- Added a bounded Today Daily Notes task pool for unfinished TODOs, preserving
  Roam order and hierarchy through plain blocks, DONE-parent promotion, and
  bare-reference task context. Parent rows collapse by default and the current
  Timing Line branch expands automatically.
- Today task titles support ordinary navigation and Shift+Click sidebar
  navigation; idle rows expose icon-only Play through the existing clock-switch
  path, while the current task has a non-interactive timing indicator.
- Today data is loaded after the first Active Threads paint with one page-scoped
  tree query, cached for the open popover, refreshed with the existing Refresh
  action, and never read by the one-second ticker. Failed reads retain the last
  successful snapshot.

## 0.9.0-beta.44 — 2026-08-18

- Fixed task-title Shift+Click after a Timing Line switch: an existing block
  window is now re-fronted and expanded when Roam exposes the native APIs,
  instead of being treated as a visible no-op after deduplication.
- Shared the existing-window visibility path between Timing Line fronting and
  task navigation, and serialized native sidebar operations so switching and
  Shift+Click cannot race into duplicate block windows. Unrelated sidebar
  windows remain untouched; missing-UID, unavailable-API, and retry behavior
  remain unchanged.

## 0.9.0-beta.43 — 2026-08-18

- Reduced the Roam Settings panel to three current controls: Timing Line
  right-sidebar fronting, shared work-cycle duration, and forgotten-timer
  warning. The Top Bar and unfinished-TODO-only Clock In rule are now core
  behavior; retired stored keys remain intact but inert.
- Reduced the Command Palette and user-assignable Hotkeys surface to Focus
  current block, Clock out Timing Line, and Open dashboard, with no default
  bindings. Retired command labels are removed during load and unload so hot
  reloads cannot leave duplicate actions behind.
- Made Focus start or switch only the unfinished TODO currently being edited,
  and made Clock out Timing Line close the actual global Timing Line on the
  first invocation regardless of editor focus. The core Clock In mutation now
  enforces the same unfinished-TODO boundary for every UI entry point.
- Preserved the TODO context-menu actions, Active Threads and Dashboard
  controls, single-Timing-Line model, right-sidebar behavior, graph format, and
  old setting values without migration.

## 0.9.0-beta.42 — 2026-08-18

- Restored Blueprint's Dashboard glyph for the Active Threads Dashboard action
  while preserving its existing label, behavior, and 32px action rail.
- Replaced Today's unbounded per-Session Activity columns with exactly 24 local
  hour buckets. Session minutes are apportioned across the hours they overlap;
  running Sessions continue to update from the cached snapshot without another
  graph read.
- Hid visible duration text for every zero-value Activity bucket while keeping
  the date/hour context, quiet baseline, dataset, tooltip, and complete ARIA
  duration and Session count.

## 0.9.0-beta.41 — 2026-08-18

- Refined the single-page Activity panel's density model: Last 7 days uses
  clearly wider daily bars, Today adapts bar width to the number of Sessions,
  and dense 30-day buckets use narrow bars with decimal-hour labels and a
  quiet `HOURS` context.
- Kept All time as a complete Dashboard range while changing only its Activity
  aggregation: calendar months through the current month for spans up to 24
  months, then calendar years, with empty periods retained as baselines.
- Preserved full duration/date/Session information in tooltips and ARIA,
  cached live updates, Org start-day semantics, the Timing → Activity → By Task
  order, and the no-extra-query/no-dependency boundary.

## 0.9.0-beta.40 — 2026-08-18

- Added a single-page Activity panel between Timing and By Task, using the
  existing Dashboard snapshot and no additional graph query or chart library.
- Added range-aware Activity aggregation: Session bars for Today, daily bars
  for Last 7/30 days, and automatic weekly/monthly buckets for All time. Each
  bucket exposes duration, date, and Session count through visible text,
  tooltip, and ARIA; zero-value buckets retain a quiet baseline.
- Kept cross-midnight Org reporting on the Session start day, included running
  time in cached derived buckets, and added focused model, DOM, performance,
  and Chromium light/dark/narrow geometry coverage.

## 0.9.0-beta.39 — 2026-08-18

- Replaced the Active Threads Dashboard action's chart-like Dashboard glyph
  with Blueprint's neutral Home glyph.
- Preserved the action's label, behavior, 32px target, shared action rail,
  keyboard semantics, and narrow light/dark geometry.

## 0.9.0-beta.38 — 2026-08-18

- Renamed the Dashboard's live `RUNNING · 1 Session` section to the count-free
  `TIMING` label, matching the single-focus model while retaining historical
  Session metrics and columns.
- Condensed the live Timing panel's vertical rhythm without removing its Task,
  Started, Elapsed, or action context and retained 32px action targets.
- Put Dashboard/Clock Out and Refresh/Delete on one exact 32px action rail in
  the Active Threads popover, with a 4px gap between header hover targets and
  the Timing card.

## 0.9.0-beta.37 — 2026-08-18

- Renamed the shared current-session surface heading from `ACTIVE WORK · N` to
  `ACTIVE THREADS · N` and updated its accessible group label to match the
  Thread vocabulary.
- Simplified the Dashboard Today metric to show only its label and elapsed
  value; the Running section still keeps its `N Session(s)` list count.
- Preserved timing, the 45-minute Active Work window, Pomodoro, navigation,
  persistence, and all other Dashboard metrics and sections.

## 0.9.0-beta.36 — 2026-08-18

- Added icon-only Play actions to unfinished Dashboard By Task rows, with a
  non-interactive timing indicator for the current Timing Line and no Play
  action on DONE rows.
- Dashboard Play switches the single open `CLOCK` through the existing
  `active-work-switch` path, keeps the Dashboard open, rerenders in place, and
  preserves Timing Line right-sidebar fronting.
- Fixed the Parallel Threads heading and its expiry explanation as two
  left-aligned lines at narrow widths.

## 0.9.0-beta.35 — 2026-08-18

- Changed the compact Top Bar working-set label from `N Active` to the
  grammatically precise `1 Thread` / `N Threads`, so the count describes the
  current Active Work set without implying that multiple lines are timed at
  once.
- Kept the count's Active Work meaning, neutral/yellow/red load thresholds,
  tooltip and ARIA details, panel headings, timing behavior, and stored data
  unchanged.

## 0.9.0-beta.34 — 2026-08-18

- Renamed user-facing `OPEN LINES` to `PARALLEL THREADS` so untimed but
  switchable work reads as part of the current parallel working set rather
  than as an unexplained open state.
- Replaced the abstract `45m window` with `Leave after 45m without focus`, and
  changed each row from `Nm left` to `leaves in Nm`. Top Bar tooltip and ARIA
  descriptions use the same terminology.
- Preserved one real timer, exact 45-minute ceiling/expiry semantics, continuous
  Pomodoro switching, task state, navigation, Dashboard history, and CLOCK data.

## 0.9.0-beta.33 — 2026-08-17

- Replaced the invalid play action on completed Open Lines with a
  non-interactive, accessible completed-state icon. TODO Open Lines retain the
  existing Focus action, and completed lines remain navigable by title until
  their normal 45-minute Active Work window expires.
- Aligned Dashboard task titles with Active Work: full `[[page references]]`
  and `#[[tags]]` remain visible in Roam's link colour, while the redundant
  leading document icon and underline cue are removed.
- Kept canonical task titles, sorting, filters, rollups, CLOCK data, ordinary
  navigation, and Shift-click right-sidebar navigation unchanged.

## 0.9.0-beta.32 — 2026-08-17

- Persisted the three missing default-on switch values before Roam creates the
  Settings panel, so a fresh installation now shows the same enabled state the
  runtime already uses.
- Preserved every existing user choice, including boolean and legacy string
  `false` values; deprecated, input, and select settings are not initialized by
  this repair.

## 0.9.0-beta.31 — 2026-08-17

- Preserved visible Roam page and tag references such as `[[Roam Logbook]]`
  and `#[[Deep Work]]` in Active Work titles without changing canonical Task
  titles, Dashboard reporting, navigation, or stored CLOCK data.
- Removed Active Work title underlines in resting, hover, and keyboard-focus
  states while retaining Roam's page-reference colour and accessible focus
  outline.
- Renamed the stale-clock setting to `Flag unfinished clocks after (hours)` so
  its numeric choices are self-explanatory; the storage key, values, and
  default remain unchanged.

## 0.9.0-beta.30 — 2026-08-17

- Added a default-on `Keep Timing Line at top of right sidebar` setting. A
  confirmed user Clock In now opens the focused block at native sidebar order
  0, or moves and expands its existing window without duplicating or removing
  unrelated sidebar content.
- Covered Command Palette, TODO context-menu, Active Work switching, and
  repeated Clock In on the already focused Task. Background reload, Refresh,
  reconciliation, and repair paths do not move the sidebar.
- Made rapid switches last-intent-wins and kept sidebar failures non-blocking:
  Clock data remains confirmed even if Roam cannot update the sidebar, with a
  concise warning instead of a rollback.

## 0.9.0-beta.29 — 2026-08-17

- Clarified the Active Work model as one `TIMING` line plus switchable
  `OPEN LINES`, replacing the ambiguous user-facing Focused/Recent vocabulary
  without changing the single-timer or historical Session model.
- Added the 45-minute window directly to the Open Lines heading and changed
  each line's metadata to show its exact remaining eligibility, such as
  `18h 21m total · 21m left`. Visible fractions round up to 1m and disappear
  exactly at the existing 45-minute boundary.
- Added `ACTIVE WORK · N` to the surface header and composition details to the
  Top Bar tooltip while keeping its compact visible `N Active` label.
- Preserved the existing stale-clock warning, Dashboard history, linear time
  accounting, and continuous Pomodoro behavior across seamless line switches.

## 0.9.0-beta.28 — 2026-08-17

- Removed the desktop Dashboard's sticky By Task toolbar and sticky column
  headers. Both now scroll naturally with the task list instead of becoming an
  opaque banner over task rows.
- Added Chromium layout coverage at desktop, 340px, and 320px widths, including
  a real scroll assertion that prevents the sticky-banner regression from
  returning while preserving filters, sorting, and narrow-screen wrapping.

## 0.9.0-beta.27 — 2026-08-17

- Moved the Active Work Dashboard and Refresh actions from the footer into a
  compact icon-only header group with stable 32px targets, accessible labels,
  and unchanged Refresh status semantics.
- Removed the empty footer from idle, Recent-only, and single-Focused states.
  The footer now exists only when multiple running Sessions need the explicit
  Clock Out All confirmation path.
- Added 320px/340px Chromium geometry coverage for header actions, loading
  stability, sidebar Close coexistence, overflow, and the simplified bulk
  action footer.

## 0.9.0-beta.26 — 2026-08-17

- Removed the Pause/Resume state machine and Pause Batch runtime completely.
  Clock Out is now the only stop action; ended work remains in the 45-minute
  Recent Active Work window and can be restarted with its independent Focus
  action. Historical graph CLOCK records are unchanged.

## 0.9.0-beta.25 — 2026-08-17

- Separated Recent Task navigation from Focus switching: clicking a title opens
  its Roam block, Shift+click opens it in the right sidebar, and a dedicated
  action starts the Task's Focused CLOCK.
- Kept the 45-minute Active Work set visible after Clock Out and Pause. With no
  timer running, the Top Bar now shows only the distinct Active count; Paused
  and Recovery Tasks take precedence over duplicate Recent rows.
- Let Recent work expire from the in-memory snapshot at the 45-minute boundary
  even while no CLOCK is running, without adding graph reads.
- Added direct interaction coverage for Clock Out, Pause, Recent navigation,
  Focus switching, deduplication, and idle-window expiry.

## 0.9.0-beta.24 — 2026-08-17

- Refined the Active Work popover toward a restrained Linear-style hierarchy:
  Focused keeps its own compact card, but now uses only a uniform 1px neutral
  border and a very light neutral surface; the green left accent is gone.
- Kept Pomodoro overrun visual-only on the live elapsed value. The Focused card
  and all four of its borders remain neutral in both light and dark themes.
- Preserved Recent as a quiet flat list with no resting card border or
  background, and added narrow 320px/340px geometry assertions for the revised
  card and overrun contract.

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
