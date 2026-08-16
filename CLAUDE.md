# Development Notes

## Build Workflow

After modifying source files in `src/`, verify the source and generated bundle before committing:

```bash
npm run check   # lint + test + byte-for-byte bundle verification
npm run build   # explicitly regenerate extension.js when source changed
```

Then commit both the source files and `extension.js` together — Roam Depot loads the
bundle, not `src/`.

The beta.21 documentation/metadata pass is intentionally an exception: it does
not rebuild or rewrite the root `extension.js`. A separately authorized source
release must regenerate and verify the bundle before Depot publication.

## Architecture

The graph is the state. There is no cached mirror of clock data and no persisted
timer: a `CLOCK::` block with no end stamp *is* a running Session, so a reload, a
crash, or another device all converge on the same answer. Queued mutations read
before writing and check a post-write refresh. The queue is only per loaded plugin
instance; it is not a cross-tab/device lock or CAS, so a last-moment external write
can still race and must be surfaced conservatively.

DONE, Pause, and Resume actions have an atomic queued decision boundary: fresh
graph read, confirmed scope, one action timestamp where applicable, writes, and
post-write confirmation. Roam still receives individual graph writes rather than
a distributed transaction, so partial work is represented as structured
`uncertain/partial` state with exact retry identifiers. A failed preflight or
post-write read never becomes an empty graph and never authorizes speculative
follow-up writes. Clocking looks only at the block being clocked (after resolving
a bare `((reference))` to its original) and never at its parents unless the
explicit DONE tree action confirms that scope. All hierarchy is resolved at
*read* time in `stats.js`, so re-indenting or moving a task cannot invalidate
history that is already on disk. Keep it that way — the moment structure leaks
into what gets written, every later structural edit makes old entries lie.

Layering, innermost first:

- `time.js`, `org.js`, `stats.js` — pure. Timestamp/duration math, the org LOGBOOK
  text format, and dashboard aggregation. Fully unit-tested.
- `roam.js` — the only module that touches `window.roamAlphaAPI`. It is the thin
  adapter boundary for validated queries, graph operations, Pull Watch lifecycle,
  and native block navigation; it distinguishes a valid empty result from an
  uncertain/failed read.
- `entries.js`, `clock.js` — read entries out of the graph; clock in/out/discard.
  `refresh()` also tags each open clock with `priorMinutes`, so the topbar can show
  a running task total every second without touching the query path.
- `pomodoro.js` — one shared cycle layered over Running Sessions. Deliberately
  *not* in the graph: a Pomodoro cycle is an intention, not a record, and the
  LOGBOOK drawer stays a faithful org clock log. The visible cycle is persisted in
  extension settings; the legacy per-session `pomodoroTargets` map is compatibility
  state only. Overrunning never stops a Session.
- `session-surface.js`, `topbar.js`, `dashboard.js`, `styles.js` — plain DOM with
  Blueprint (`bp3-*`) classes. `session-surface.js` is the shared current-session
  view model/renderer for the current-session popover; task-title navigation is
  injected through the `roam.js` native-sidebar adapter rather than a custom
  sidebar surface. No React, no colour values that Blueprint already defines, so Roam's
  light/dark themes come for free.

  Two traps here, both of which have already cost a release:

  - The topbar's markup is not a public contract. Do not anchor on a class name;
    `afterNavigation` walks the *leading run* of topbar children and stops at the
    first that carries no navigation icon. Whole-topbar searches let the right
    sidebar's own arrow win. `test/placement.test.js` pins every shape.
  - The current separator is a dedicated `.rlb-topbar__separator` DOM span with
    `aria-hidden="true"`; its visual spacing is CSS `gap`. Do not reintroduce
    leading whitespace into text nodes. Elapsed state uses neutral Blueprint
    gray, restrained amber stale state, and restrained red Pomodoro overrun state;
    there is no success-green running dot in the topbar. Idle uses a dedicated
    square icon-only hit target, while running preserves the elapsed/count unit.
    Session rows use a small, muted status bullet for alignment; the explicit
    `Check Out` action is a neutral log-out icon with an accessible text label,
    and paused rows expose an icon-only `Resume` action. A fully paused batch
    keeps the history-clock identity and uses only a low-saturation ochre icon
    color on the normal transparent surface; it has no additional pause badge
    or glyph. The shared Refresh
    action belongs in the two-column footer grid, not the surface header.
  - `syncTopbarLayout` marks the actual navigation shell and search child found at
    attach time. The Logbook unit is `flex: 0 0 auto`/`min-width: max-content`
    while Search owns only remaining space. Do not replace this with a global
    fixed-position hack; the narrow-width rule hides only the secondary count,
    never the elapsed value.
  - Shift+Click on the topbar trigger is inert: it does not mount a sidebar panel,
    navigate, or mutate layout. Only Shift+Click on a task title requests the
    native `rightSidebar.open()` plus `addWindow({ window: { type: 'block',
    'block-uid': uid } })` seam through `roam.js`; ordinary task clicks use the
    main window and action buttons stop propagation. If the native API rejects or
    is unavailable, the current-session surface stays open with a retry notice.
    The topbar/host recovery observers are narrowly attached to the discovered
    navigation shells and are disconnected during replacement and unload.
  - Dashboard is a content-fit, list-first inspector with an adaptive width and
    viewport max-height: its header is compact, its body scrolls only for long
    reports, and short reports end shortly after the final row. It has exactly
    four chart-free metrics—Today, the selected range total, Sessions, and Tasks
    tracked—then Running when populated and the By Task tree. There is no
    Analytics/chart view, By Day chart, category view, or visible chart axis;
    hierarchy and numeric columns stay unchanged while borders remain light.
  - Current-session rows use a shared grid with the status point and title on
    row one, metadata on row two, and actions spanning both rows. Alignment is
    structural (`display: contents` plus explicit grid tracks), not a margin
    offset, so Chinese/English and one/two-line metadata share one geometry.
- The topbar's visible Pomodoro timer is one persisted shared cycle, not a
  per-session target: the first confirmed Running Session freezes the threshold
  and action instant, parallel changes retain it, and a confirmed empty state,
  Pause All, Clock Out All, or final Check Out clears it. Resume starts one new
  cycle for the resumed batch. Legacy per-session target fields are compatibility
  only. The Roam sync indicator is host-owned and must not be selected by the
  plugin's timer styles.
- `extension.js` — lifecycle, command/context-menu registration, settings panel.

Persisted internal state uses explicit envelopes: Pause Batch format 2,
deprecated Pomodoro target compatibility format 1, shared Pomodoro cycle
format 1, and state-backup format 1. Legacy known formats may
migrate; unknown or corrupt values remain untouched and are backed up once.
`CONTEXT.md` is the domain vocabulary authority for Task, Session, Own, Total,
Pause Batch, Pomodoro Cycle, and legacy Pomodoro Target.

While a Pause Batch exists, confirmed user clock-in/clock-out actions are observed
through a small clock-action seam. A paused Task explicitly replaced or finished
during the break is marked as reconciled and is consumed by Resume All rather than
being created a second time; resume-originated and pause-originated writes are
tagged so they do not self-reconcile. Running units remain Sessions; paused batch
units remain Tasks.

## Testing

`test/helpers/graph-stub.js` fakes `roamAlphaAPI` by recognising the handful of
queries `roam.js` issues by shape — it does not run datalog. If you add a query,
teach the stub about it or it will throw.

`test/lifecycle.test.js` drives the real onload → interact → onunload path under
jsdom. It is the only thing that catches mount-path errors, so keep it passing.

Nothing in `npm test` executes Roam's Datalog engine — the stub answers by query
*shape*, so a query it happily satisfies can still fail against Roam. Run

```bash
npm run verify:live    # official @roam-research/roam-cli datalog-query, read-only
```

after touching any query. It swaps a CLI-backed `q` into the real read path and
prints what the dashboard would show. It never writes graph data. This exists
because the roll-up shipped broken once and the whole suite stayed green.

Completion uses bounded Pull Watches for Running Tasks and confirmed ancestors,
not DOM observation or polling. `src/completion.js` owns coalescing, initial and
reload reconciliation, stale-watch cleanup, and unload detach. A missing or
throwing watch API degrades to safe refresh/reload recovery; it never authorizes
speculative graph writes. The topbar and theme observers are limited to their
discovered host/root seams and are disconnected during replacement and unload.

Two things that walk-the-graph code keeps getting wrong, both verified against a
real graph:

- Sub-tasks are usually written under a `((reference))` to a task, not under the
  task itself — pull a task into a daily note, work beneath it. `resolveReferencedUid`
  makes a bare reference transparent so the ancestor walk lands on the original.
- Attribute blocks read as `Steps::` in the data even though Roam renders them
  `Steps:`. Match on the stored string, not on what the screenshot shows.

Test uids must be at least 6 characters: the block-reference regex ignores shorter
ones, and real Roam uids are 9.

## Release checklist

- Commit source and generated `extension.js` together.
- Run `npm ci`, `npm run check`, and `npm run verify:bundle` from a clean clone.
- Confirm `npm run verify:workflow` passes; it is a local static workflow contract
  check. GitHub Actions separately runs the real pinned Docker actionlint image
  `rhysd/actionlint:1.7.7`.
- Confirm required Chromium layout tests and the final-bundle lifecycle smoke.
- Inspect the Roam Depot build and update any final PR test count only at release,
  from that clean run. Keep repository documentation free of a brittle exact
  count.
- Run `npm run verify:live` manually against the configured graph after reading
  its guidelines; do not call fake-adapter lifecycle coverage a live Roam test.

Roam Depot remains **Draft** until the bundle and live-smoke gates pass; this
task does not touch the external PR. The existing esbuild advisory is dev-only
local build maintenance, not a runtime extension exposure, and no dependency
upgrade belongs in this hardening pass.
