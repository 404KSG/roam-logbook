# Development Notes

## Build Workflow

After modifying source files in `src/`, always build before committing:

```bash
npm run check   # lint + test + build
```

Then commit both the source files and `extension.js` together — Roam Depot loads the
bundle, not `src/`.

## Architecture

The graph is the state. There is no cached mirror of clock data and no persisted
timer: a `CLOCK::` block with no end stamp *is* a running clock, so a reload, a
crash, or another device all converge on the same answer. Every mutation writes to
the graph and then re-reads it (`clock.refresh()`), which costs one query per action
and removes a whole class of desync bugs.

Writes are atomic: clocking looks only at the block being clocked (after resolving
a bare `((reference))` to its original) and never at its parents. All hierarchy is
resolved at *read* time in `stats.js`, so re-indenting or moving a task cannot
invalidate history that is already on disk. Keep it that way — the moment structure
leaks into what gets written, every later structural edit makes old entries lie.

Layering, innermost first:

- `time.js`, `org.js`, `stats.js` — pure. Timestamp/duration math, the org LOGBOOK
  text format, and dashboard aggregation. Fully unit-tested.
- `roam.js` — the only module that touches `window.roamAlphaAPI`. Degrades to
  `null`/`[]` when a namespace is missing so it stays importable under Node.
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
- `extension.js` — lifecycle, command/context-menu registration, settings panel.

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
