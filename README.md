# Roam Logbook – 404KSG

Current package version: **0.9.0-beta.36**. This is a beta fork; the graph remains
the source of truth and no local CLOCK database is created.

Org-mode style clock tracking for Roam Research TODOs. Right-click a task to clock in, watch the session run in the topbar, and add it all up in a Roam-native dashboard.

This is an MIT-licensed fork of [forrestchang/roam-logbook](https://github.com/forrestchang/roam-logbook). It preserves the original LOGBOOK/CLOCK workflow and reporting behavior while refining the topbar and dashboard presentation.

Entries are stored in an Org-style Roam hierarchy, as a `LOGBOOK::` drawer under the task:

```
{{[[TODO]]}} this is a test task
  - LOGBOOK::
    - CLOCK: [2026-08-05 Wed 15:58]--[2026-08-05 Wed 16:58] => 1:00
```

New drawers are created collapsed, and each new Session is inserted at the top
of the drawer. New writes use `CLOCK:`; the reader continues to accept existing
`CLOCK::`, `CLOCK:`, `LOGBOOK::`, `LOGBOOK:`, and `:LOGBOOK:` records. Existing
graph history is not migrated or merged.

## Installation

The extension is an ESM Roam Depot extension whose default export exposes `onload` and `onunload`.

- The Roam Depot entry for this fork remains a **Draft preview**. Beta.34 names untimed switchable work as Parallel Threads and explains its 45-minute inactivity exit directly in the Active Work surface; until acceptance, use its shorthand only for non-critical smoke tests.
- For local development, clone this repository, run `npm ci` and `npm run build`, then load the repository through Roam's extension developer workflow. `extension.js` is the built Depot entry point.

The extension reads and writes the local graph only; there is no external telemetry,
network call, or runtime service.

Graph writes are serialized only inside one loaded plugin instance. A fresh read
before each action and a post-write refresh reduce races, but there is no
cross-tab/device CAS or distributed lock; a partial write remains retryable and
is reported as uncertain.

## Use

**Clock in** — right-click a TODO bullet → **Plugins** → **Logbook: Clock in**. The same menu offers **Logbook: Clock out** while a clock is running. Both are also in the Command Palette, acting on the block you are editing.

By default, a successful user Clock In also opens that Timing Line in Roam's
native right sidebar at order 0. Switching work moves an existing block window
back to the top instead of duplicating it, while preserving every other sidebar
window. Reload, Refresh, and graph reconciliation never move the sidebar. This
behavior can be disabled in Settings without changing any Clock data.

**Topbar** — lives in Roam's left navigation cluster, immediately after Back/Forward and before the main/right controls, so it cannot compress the action row. Idle it is a single neutral-gray history icon. While work is focused, it shows the shared continuous work-cycle time and the number of Threads in the Active Work working set:

```
12:34 · 1 Thread
```

There is always exactly one real running `CLOCK`: the Focused Task. Switching tasks closes the old interval at the switch instant and opens the new one, so recorded time never overlaps. Active Work is the Focused Task plus distinct tasks whose latest interval ended within the fixed 45-minute return window. Parallel Threads are navigation shortcuts only; they do not keep timing. The Thread count represents that whole working set, keeps Roam's normal neutral color for 1–3 Threads, uses yellow for 4–6, and red for 7+; this is only visual load context. When no Session is timing, the history-clock identity remains visible while Parallel Threads are still inside the 45-minute Active Work window:

```
0:28 · 2 Threads
```

Task names, banked totals, the shared Pomodoro cycle, and actions stay in the tooltip and shared current-session surface. Click the icon, time, or Thread count for the popover. The popover is titled **ACTIVE WORK** and presents the Timing Line as a compact neutral Linear-style card with a uniform hairline border, while Parallel Threads form a quiet flat list. Timing elapsed time is the strongest metadata; Pomodoro overrun changes only that elapsed text to red. Parallel Threads show their total and the context **Leave after 45m without focus**. Active Work preserves visible Roam references such as `[[Roam Logbook]]` and `#[[Deep Work]]`; task titles use the graph's page-reference colour without an underline. Clicking a Parallel Thread title opens its block; its independent Focus action starts a new Session. **Shift+Click on the topbar trigger is intentionally inert**, while Shift+Clicking a task title or Dashboard task entry opens that block through Roam's native right-sidebar block-window API. Every Timing Line has an explicit icon-only **Check Out** action; the low-level Discard action stays secondary. Dashboard and Clock Out All remain available where applicable. Refresh is an icon-only action with an icon-only loading state and hidden live status feedback. Current-work task titles remain single native keyboard-accessible buttons rather than nested page-reference links.

**DONE completion** — changing a watched Task to `DONE` closes its confirmed
running Focused CLOCK and the confirmed running CLOCKs of its descendants. A
parent without its own Session still closes its running child tree; unrelated
work stays running. The action re-reads the graph inside the
same mutation queue, uses one close timestamp, and reports partial or uncertain
work as retryable. Reload reconciliation catches DONE Tasks changed while the
extension was unloaded. Pull Watches are bounded to running Tasks and known
ancestors; if Roam's watch API is unavailable, safe refresh/reload recovery
remains available without speculative graph writes. Manual single-Session Check
Out keeps its exact one-Session meaning.

**Shared Pomodoro cycle** — when the first Focused Task starts, the extension freezes the configured threshold (45 minutes by default) and starts one cycle from that action instant. Seamless task switches keep the same cycle; Clock Out All and a confirmed empty state reset it. At the exact threshold the time turns a restrained red and **keeps counting**; it never closes the CLOCK. A reload restores a valid persisted cycle or conservatively uses the focused open CLOCK.

**Dashboard** — `Logbook: Open dashboard`, or the Dashboard icon in the Active Work header. It is one chart-free, list-first view: exactly four compact metrics (Today with active-Session context, the current-range total, Sessions, and Tasks tracked), followed by Running when present and the By Task tree. Unfinished tasks that are not on the current Timing Line expose an icon-only Play action; the current Timing Line shows a non-interactive timing icon, and DONE tasks have no Play action. Starting a task switches the single open `CLOCK` and rerenders the still-open Dashboard in place. There is no Analytics/chart view, By Day chart, category view, or secondary Dashboard mode. The Sessions and Tasks tracked metrics show the active date-range name directly (`Last 7 days`, `Last 30 days`, or `All time`). The range total needs no repeated helper text because its label already names the range. The header contains only the date-range selector, Refresh, and Close controls. Only task-title Shift+Click uses Roam's native right-sidebar block-window API; topbar Shift+Click is inert, while ordinary task clicks retain main-window navigation. The overlay is fixed to the viewport, locks background document scroll while open, and keeps only the dialog body scrollable; closing, Escape, overlay click, and extension unload restore the original document styles and scroll position. The surface samples Roam's current page-reference and synced/save colors, keeping plugin variables isolated from the host theme.

### Custom hotkeys

Clock in and clock out deliberately have no default key binding. Open **Roam Settings → Hotkeys**, search for `Logbook`, and assign the Command Palette actions to the keys you prefer. The extension does not install a global keyboard listener.

### Sub-tasks

Clocking only ever looks at the block you clocked — the drawer goes on that block and nowhere else. Structure is a *reporting* concern, resolved when the dashboard is drawn, so moving a sub-task or re-indenting it never invalidates the history already recorded.

The **By task** tree nests sub-tasks under their parent and shows two figures:

```
                Sessions   Own     Total
发布 v1             1      1h 00m  4h 00m
  └ 写文档          1      2h 00m  2h 00m
  └ 打包发布  ×2    1      1h 00m  1h 00m
冲刺周报                           1h 00m
  └ 打包发布  ×2    1      1h 00m  1h 00m
```

- **Own** is time clocked directly on that block, **Total** includes everything below it. A parent with no sessions of its own still appears, carrying its children's time.
- Plain blocks between two tasks are not levels — a note or a heading under a TODO is context, not a unit of work.
- A task nested under a parent by a bare `((reference))` rolls up there too, which is how a task on its own page gets counted toward a project that merely links it. A block that just *mentions* the task in a sentence does not adopt it.
- That makes several parents possible, so a task can appear more than once, tagged `×N`. Those rows overlap by design — the headline figures at the top are summed from sessions and count each one exactly once, so they always stay the honest total.

### Focused clock and Active Work

Only one real `CLOCK` runs at a time. A Task can have many historical Sessions, but a switch closes the current Focused interval before creating the next one. Active Work is a return-oriented view of the current Focused Task and distinct Tasks touched in the last 45 minutes; it never means that those Parallel Threads are being timed concurrently.

### Block references

Clocking in on a block whose entire content is `((uid))` or `{{embed: ((uid))}}` writes the drawer onto the original task, not onto the mirror. Reference a task into today's daily note, clock it there, and the log still collects in one place.

### Unfinished clocks

A clock with no end stamp is a running clock — that is the whole persistence model, so a session survives a reload, a crash, or a clock started on another device. On load the extension reads them straight back out of the graph.

Clocks that have been open longer than the threshold (8 hours by default) are marked as likely forgotten: the topbar's elapsed time turns restrained amber, the popover shows a warning, and the dashboard's Running section adds a `stale` tag. Each can be closed at the current time or discarded.

### One Focused clock

Clocking in another Task always closes the current Focused `CLOCK` at the same action instant, then creates the new Focused `CLOCK`. The old interval remains an independent historical Session and is available in Active Work for 45 minutes. The deprecated `allowMultipleClocks` setting is ignored for runtime timing so old installations cannot re-enable overlapping clocks.

## Settings

| Setting | Default | Effect |
| --- | --- | --- |
| Show topbar widget | on | The left-navigation history icon, live counter, and running-task list |
| Keep Timing Line at top of right sidebar | on | A user Clock In opens or moves that block to order 0 without disturbing other sidebar windows |
| Pomodoro duration (minutes) | 45 | Shared cycle threshold captured when the first Focused Task of a cycle starts; passing it only changes elapsed colour |
| Only offer clock in on TODO blocks | on | Off lets any block be clocked |
| Flag unfinished clocks after (hours) | 8 | When a running clock is called out as forgotten |

## Notes

- Timestamps carry no timezone, matching org — `[2026-08-05 Wed 15:58]` reads as 15:58 wherever you open it.
- Durations truncate to whole minutes. Valid start/end timestamps are authoritative; a hand-edited conflicting `=> H:MM` remains visible as a data-health issue but does not change reports.
- A session that runs past midnight counts wholly against the day it began, as org's own clock reports do.
- Everything happens locally against your graph: no external telemetry, network calls, or runtime dependency.

### Compatibility and data health

The shared Pomodoro cycle is stored as version 1 `{ version, data: { startedAt,
thresholdMinutes } }` (or `data: null` when no cycle is active). The old
per-clock Pomodoro targets use version 1 `{ version, data }` and remain only
as deprecated compatibility state. A mixed legacy Pomodoro map is backed up as raw and is not overwritten
until its invalid entries are reviewed.
Unknown or corrupt composite state is kept untouched, copied once into the
versioned internal `stateBackups` setting, and reported without destructive
migration. A CLOCK whose query row is still available but whose Task metadata is
missing is reported under `Deleted task · UID` and remains part of global and
by-day totals. Whether deleting a parent in a live Roam graph also deletes its
children is left to the manual live smoke. Data issues are review-only: the
extension never auto-rewrites CLOCK records.

## Development

```bash
npm ci
npm test     # unit tests plus jsdom lifecycle and presentation tests
npm run lint
npm run build
npm run check
./build.sh   # clean, repeatable Roam Depot build
```

`npm run build` bundles `src/` into `extension.js` with esbuild. A temporary
destination is also supported, for example `node build.js --outfile=/tmp/extension.js`
or `RLB_BUILD_OUTFILE=/tmp/extension.js npm run build`. `npm run verify:bundle`
builds into a temporary directory and compares the result byte-for-byte with the
checked-in bundle; `npm run check` also validates the CI workflow contract and
runs this drift check without rewriting the working tree. Commit the bundle
alongside the source. The local `verify:workflow` command is a static contract
check; GitHub Actions additionally runs the real pinned Docker image
`rhysd/actionlint:1.7.7`. The local check does not download or execute Docker.

`src/roam.js` is the adapter boundary for `window.roamAlphaAPI`: it validates
graph reads and exposes graph writes, Pull Watch lifecycle, and native block
navigation to the other modules. UI and mutation modules do not call Roam's
global API directly. The beta.24 source is fully implemented, the checked-in
root `extension.js` has been rebuilt, and `npm run check` plus
`npm run verify:bundle` passed. The existing esbuild advisory is dev-only build
maintenance, not a runtime extension dependency exposure, and no dependency
upgrade is included here.

### Release checklist

- Source commit and generated `extension.js` are present and `npm run check` is green.
- A clean clone runs `npm ci`, `npm run check`, and `npm run verify:bundle`.
- Required Chromium browser-layout tests and the final-bundle lifecycle smoke pass.
- CI's real `rhysd/actionlint:1.7.7` job is green; the local workflow check is
  only a static contract and is not a substitute for that CI execution.
- Depot build output is inspected before release; the Depot PR test count is updated
  at final publication time.
- Run the real Roam live smoke manually (`npm run verify:live`) against the
  configured graph after reading its guidelines. The verifier is read-only;
  automated tests use a fake adapter and must not be described as live Roam
  verification.
- Roam Depot remains **Draft**; the read-only live verification and manual smoke
  gates remain required before any future publication, and this task does not
  touch the external PR. Record the current suite result from the clean run
  rather than maintaining a brittle exact test count here.

The performance tests are synthetic query-count and complexity-regression stubs,
not benchmarks of a real Roam graph. The final live verification reads the
configured graph through the official Datalog CLI and never creates test data.

## Attribution

Copyright for the original work remains with [forrestchang](https://github.com/forrestchang). Fork changes are maintained by [404KSG](https://github.com/404KSG). See [LICENSE](LICENSE) for the MIT terms.
