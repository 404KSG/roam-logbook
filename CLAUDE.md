# Development Notes

## Build Workflow

After modifying source files in `src/`, verify the source and generated bundle before committing:

```bash
npm run check   # lint + test + byte-for-byte bundle verification
npm run build   # explicitly regenerate extension.js when source changed
```

Then commit both the source files and `extension.js` together — Roam Depot loads the
bundle, not `src/`.

## Architecture

The graph is the state. There is no cached mirror of clock data and no persisted
timer: a `CLOCK::` block with no end stamp *is* a running clock, so a reload, a
crash, or another device all converge on the same answer. Queued mutations read
before writing and check a post-write refresh. The queue is only per loaded plugin
instance; it is not a cross-tab/device lock or CAS, so a last-moment external write
can still race and must be surfaced conservatively.

Writes are issued one at a time, not atomically: clocking looks only at the block
being clocked (after resolving a bare `((reference))` to its original) and never
at its parents. A write followed by an unconfirmed read stops the remaining
steps and returns retryable `uncertain/partial` state. All hierarchy is resolved
at *read* time in `stats.js`, so re-indenting or moving a task cannot
invalidate history that is already on disk. Keep it that way — the moment structure
leaks into what gets written, every later structural edit makes old entries lie.

Layering, innermost first:

- `time.js`, `org.js`, `stats.js` — pure. Timestamp/duration math, the org LOGBOOK
  text format, and dashboard aggregation. Fully unit-tested.
- `roam.js` — the only module that touches `window.roamAlphaAPI`. Its query seam
  distinguishes a valid empty result from an uncertain/failed read.
- `entries.js`, `clock.js` — read entries out of the graph; clock in/out/discard.
  `refresh()` also tags each open clock with `priorMinutes`, so the topbar can show
  a running task total every second without touching the query path.
- `pomodoro.js` — targets layered over running clocks. Deliberately *not* in the
  graph: a pomodoro is an intention, not a record, and the LOGBOOK drawer stays a
  faithful org clock log. Lives in extension settings, keyed by clock uid, and is
  pruned when its session ends. Overrunning never stops a clock.
- `topbar.js`, `dashboard.js`, `styles.js` — plain DOM with Blueprint (`bp3-*`)
  classes. No React, no colour values that Blueprint already defines, so Roam's
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
    there is no success-green running dot.
- `extension.js` — lifecycle, command/context-menu registration, settings panel.

Persisted internal state uses explicit envelopes: Pause Batch format 2,
Pomodoro target format 1, and state-backup format 1. Legacy known formats may
migrate; unknown or corrupt values remain untouched and are backed up once.
`CONTEXT.md` is the domain vocabulary authority for Task, Session, Own, Total,
Pause Batch, and Pomodoro Target.

## Testing

`test/helpers/graph-stub.js` fakes `roamAlphaAPI` by recognising the handful of
queries `roam.js` issues by shape — it does not run datalog. If you add a query,
teach the stub about it or it will throw.

`test/lifecycle.test.js` drives the real onload → interact → onunload path under
jsdom. It is the only thing that catches mount-path errors, so keep it passing.

Nothing in `npm test` validates datalog — the stub answers by query *shape*, so a
query it happily satisfies can still return nothing against Roam. Run

```bash
npm run verify:live    # needs the `roam` CLI on PATH, configured
```

after touching any query. It swaps a CLI-backed `q` into the real read path and
prints what the dashboard would show. This exists because the roll-up shipped
broken once and the whole suite stayed green.

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
- Inspect the Roam Depot build and update the final PR test count only at release.
- Run `npm run verify:live` manually against a disposable real graph; do not call
  fake-adapter lifecycle coverage a live Roam test.
