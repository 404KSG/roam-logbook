# Roam Logbook – 404KSG

Current package version: **0.9.0-beta.19**. This is a beta fork; the graph remains
the source of truth and no local CLOCK database is created.

Org-mode style clock tracking for Roam Research TODOs. Right-click a task to clock in, watch the session run in the topbar, and add it all up in a Roam-native dashboard.

This is an MIT-licensed fork of [forrestchang/roam-logbook](https://github.com/forrestchang/roam-logbook). It preserves the original LOGBOOK/CLOCK workflow and reporting behavior while refining the topbar and dashboard presentation.

Entries are stored in the graph in org's own format, as a `LOGBOOK::` drawer under the task:

```
{{[[TODO]]}} this is a test task
  - LOGBOOK::
    - CLOCK:: [2026-08-05 Wed 15:58]--[2026-08-05 Wed 16:58] => 1:00
```

## Installation

The extension is an ESM Roam Depot extension whose default export exposes `onload` and `onunload`.

- The Roam Depot entry for this fork is intentionally submitted as a **Draft preview** first. Until it is accepted, use the shorthand published on that Draft PR if you want to smoke-test it in a non-critical graph.
- For local development, clone this repository, run `npm ci` and `npm run build`, then load the repository through Roam's extension developer workflow. `extension.js` is the built Depot entry point.

The extension reads and writes the local graph only; there is no external telemetry,
network call, or runtime service.

Graph writes are serialized only inside one loaded plugin instance. A fresh read
before each action and a post-write refresh reduce races, but there is no
cross-tab/device CAS or distributed lock; a partial write remains retryable and
is reported as uncertain.

## Use

**Clock in** — right-click a TODO bullet → **Plugins** → **Logbook: Clock in**. The same menu offers **Logbook: Clock out** while a clock is running. Both are also in the Command Palette, acting on the block you are editing.

**Topbar** — lives in Roam's left navigation cluster, immediately after Back/Forward and before the main/right controls, so it cannot compress the action row. Idle it is a single neutral-gray history icon. With one running task, it becomes only that task's live elapsed time:

```
12:34
```

With parallel timing enabled, it follows the stable elapsed timer with only the active-session count while preserving the same primary timer semantics — it does not sum the sessions. A centered CSS-drawn dot and uniform compact spacing keep the status on one visual baseline. The visible count keeps Roam's normal neutral color for 0–3 Sessions, uses yellow for 4–6, and red for 7+; this is only a visual state and does not change Session behavior. When all Sessions are paused, the history-clock identity stays visible with a restrained yellow icon on the normal transparent surface and an explicit paused accessible name; there is no extra badge:

```
0:28 · 2 Sessions
```

Task names, banked totals, the shared Pomodoro cycle, and actions stay in the tooltip and shared current-session surface. Click the icon, time, or session count for the popover; **Shift+Click on the topbar trigger is intentionally inert**, so it never opens a second surface or moves the layout. Shift+Clicking a Session task title or Dashboard task entry opens that block through Roam's native right-sidebar block-window API, while ordinary click keeps the main-window navigation. If Roam rejects or lacks the native sidebar API, the Session popover stays open with a concise retry notice. Every running row has an explicit icon-only **Check Out** action with the same accessible label, while the low-level Discard action stays secondary. Dashboard, Pause/Pause All, Resume All, and Clock Out All are text buttons; when exactly one Session is running, the footer is the compact `Dashboard | Pause | Refresh` row and the individual Check Out action remains on that Session row. Parallel, paused, and mixed states retain their bulk actions. Refresh is one icon-only footer action in each surface, aligned to the same 32px action height. Refresh is a read-only graph re-read with an icon-only loading state, hidden live success status, and actionable error feedback; it keeps the surface open, coalesces fast clicks, and retains the last valid snapshot on failure. Current-session task titles are native keyboard-accessible buttons with a restrained Roam-theme link cue; Dashboard task buttons already show a document-open cue and therefore use neutral text without an extra underline. The shared title/metadata grid keeps the status point, task title, and actions aligned in both surfaces.

**Pause All / Resume All** — Pause All is a durable break, not a frozen timer. It closes every running `CLOCK::` entry at one timestamp and saves one graph-scoped paused batch in extension settings, so paused time never accrues and reloads or crashes do not lose the batch. The current-session surface keeps the same rows and controls visible, marks their status as paused, exposes an icon-only **Resume** action per row, and changes the in-place batch action to **Resume All**. Resume creates a fresh `CLOCK::` Session for each valid Task; this intentionally increases the dashboard's Sessions count.

Resume creates a fresh shared Pomodoro cycle from zero for each valid Task; it never restores an old per-clock remainder. Deleted Tasks are removed from the batch, Tasks already running are treated as resumed without duplication, and failed graph writes remain available for retry. If a user explicitly clocks a paused Task in and out during the break, Resume All records that reconciliation and does not recreate the finished Session. Clicking **Resume All** is explicit consent to restore the whole batch: when that requires parallel clocks, the extension first enables **Allow multiple clocks at once**, restores every valid Task, and shows a notice. It never intentionally leaves a one-Task partial result because the setting was off. **Clock Out All** remains the permanent bulk-finish action and clears any paused batch.

**Shared Pomodoro cycle** — when the first confirmed Session starts, the extension freezes the configured threshold (30 minutes by default) and starts one cycle from that action instant. The topbar shows that cycle's elapsed time, not a historical task total or the age of an arbitrary parallel Session. At the exact threshold the time turns a restrained red and **keeps counting**; it never closes the CLOCK. Adding or removing parallel Sessions does not reset the cycle, and changing the setting affects the next cycle. A reload restores a valid persisted cycle or conservatively uses the earliest open CLOCK; a confirmed empty graph clears it. The old `pomodoroTargets` setting is retained only as deprecated compatibility state and no longer controls the visible timer.

**Dashboard** — `Logbook: Open dashboard`, or the button in the popover. It is a single list-first view: four compact metrics (Today with active-Session context, selected range total, Sessions, and Tasks tracked), followed by Running when present and the By Task tree. The header contains only the date-range selector, Refresh, and Close controls. Normal and Shift+Click task links retain Roam navigation and native right-sidebar behavior. The overlay is fixed to the viewport, locks background document scroll while open, and keeps only the dialog body scrollable; closing, Escape, overlay click, and extension unload restore the original document styles and scroll position. The surface samples Roam's current page-reference and synced/save colors, keeping plugin variables isolated from the host theme.

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

### Multiple clocks and double counting

Nothing stops you clocking a parent and one of its sub-tasks at the same time; both are real sessions and both are counted. Avoiding it is left to you.

### Block references

Clocking in on a block whose entire content is `((uid))` or `{{embed: ((uid))}}` writes the drawer onto the original task, not onto the mirror. Reference a task into today's daily note, clock it there, and the log still collects in one place.

### Unfinished clocks

A clock with no end stamp is a running clock — that is the whole persistence model, so a session survives a reload, a crash, or a clock started on another device. On load the extension reads them straight back out of the graph.

Clocks that have been open longer than the threshold (8 hours by default) are marked as likely forgotten: the topbar's elapsed time turns restrained amber, the popover shows a warning, and the dashboard's Running section adds a `stale` tag. Each can be closed at the current time or discarded.

### One clock or several

By default, clocking in closes whatever was running, the way org-mode behaves. Turn on **Allow multiple clocks at once** in the settings to run several tasks in parallel; the topbar shows `elapsed · N Sessions` using its existing primary live timer, while the popover lists every parallel task. A deterministic three-column grid draws the centered dot and explicitly clears Blueprint's child margins and shrink rules, so the visible spacing stays balanced without a hidden timer-width reservation. Clocking the same task twice is refused so nothing gets double-counted.

## Settings

| Setting | Default | Effect |
| --- | --- | --- |
| Show topbar widget | on | The left-navigation history icon, live counter, and running-task list |
| Pomodoro duration (minutes) | 30 | Shared cycle threshold captured when the first Session of a cycle starts; passing it only changes elapsed colour |
| Only offer clock in on TODO blocks | on | Off lets any block be clocked |
| Allow multiple clocks at once | off | On runs several clocks in parallel |
| Flag unfinished clocks after | 8h | When a running clock is called out as forgotten |

## Notes

- Timestamps carry no timezone, matching org — `[2026-08-05 Wed 15:58]` reads as 15:58 wherever you open it.
- Durations truncate to whole minutes. A hand-edited `=> H:MM` is taken as authoritative over the stamps around it.
- A session that runs past midnight counts wholly against the day it began, as org's own clock reports do.
- Everything happens locally against your graph: no external telemetry, network calls, or runtime dependency.

### Compatibility and data health

Pause Batch state is stored as version 2 `{ version, data }`; the shared
Pomodoro cycle is stored as version 1 `{ version, data: { startedAt,
thresholdMinutes } }` (or `data: null` when no cycle is active). The old
per-clock Pomodoro targets use version 1 `{ version, data }` and remain only
as deprecated compatibility state. The extension migrates the legacy Pause
Batch shape and a clean flat Pomodoro map in place; old pause remainder and
suppression fields are removed from the settings record without changing a
CLOCK. A mixed legacy Pomodoro map is backed up as raw and is not overwritten
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

The performance tests are synthetic query-count and complexity-regression stubs,
not benchmarks of a real Roam graph. The final live verification reads the
configured graph through the official Datalog CLI and never creates test data.

## Attribution

Copyright for the original work remains with [forrestchang](https://github.com/forrestchang). Fork changes are maintained by [404KSG](https://github.com/404KSG). See [LICENSE](LICENSE) for the MIT terms.
