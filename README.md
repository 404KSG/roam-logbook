# Roam Logbook – 404KSG

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

The extension reads and writes the local graph only. There are no analytics, network calls, or runtime services.

## Use

**Clock in** — right-click a TODO bullet → **Plugins** → **Logbook: Clock in**. The same menu offers **Logbook: Clock out** while a clock is running. Both are also in the Command Palette, acting on the block you are editing.

**Topbar** — lives in Roam's left navigation cluster, immediately after Back/Forward and before the main/right controls, so it cannot compress the action row. Idle it is a single neutral-gray history icon. With one running task, it becomes only that task's live elapsed time:

```
12:34
```

With parallel timing enabled, it follows the stable elapsed timer with only the active-session count while preserving the same primary timer semantics — it does not sum the sessions. A centered CSS-drawn dot and uniform compact spacing keep the status on one visual baseline:

```
0:28 · 2 Sessions
```

Task names, banked totals, automatic Pomodoro targets, and actions stay in the tooltip and full running-session popover. Click the icon, time, or session count to open that popover, where each clock can be stopped, thrown away, or jumped to. Dashboard, Pause All, Resume All, and Clock Out All are text buttons; Refresh is the one icon-only footer action. Per-task Clock Out and Discard controls remain compact icon buttons.

**Pause All / Resume All** — Pause All is a durable break, not a frozen timer. It closes every running `CLOCK::` entry at one timestamp and saves one graph-scoped paused batch in extension settings, so paused time never accrues and reloads or crashes do not lose the batch. Clicking the idle history icon then shows the paused Tasks and **Resume All**. Resume creates a fresh `CLOCK::` Session for each valid Task; this intentionally increases the dashboard's Sessions count.

If a running Session had an unfinished Pomodoro, its exact remaining budget continues on the new Session. A completed or overrun Pomodoro is saved as explicitly suppressed and does not restart. Deleted Tasks are removed from the batch, Tasks already running are treated as resumed without duplication, and failed graph writes remain available for retry. Clicking **Resume All** is explicit consent to restore the whole batch: when that requires parallel clocks, the extension first enables **Allow multiple clocks at once**, restores every valid Task, and shows a notice. It never intentionally leaves a one-Task partial result because the setting was off. **Clock Out All** remains the permanent bulk-finish action and clears any paused batch.

**Automatic Pomodoro** — every newly started or discovered running `CLOCK::` receives the configured target from that Session's original start, 30 minutes by default. There is no manual start button or command. Past the target, elapsed time turns a restrained red and **keeps counting** — the target never closes the clock. Change **Pomodoro duration (minutes)** to any positive minute value; the new value applies only to future Sessions. Reload discovery repairs an open CLOCK with no saved assignment, while Pause/Resume carries an unfinished target's exact remaining milliseconds instead of resetting it.

**Dashboard** — `Logbook: Open dashboard`, or the button in the popover. A compact, content-driven toolbar header keeps Logbook, its subtitle, range, refresh, and close controls readable without a hero treatment or clipped letterforms. The centered 960px analytical panel keeps totals for today and the last 7 days, running clocks, per-day activity, and the original per-task tree over the range you pick. Running rows show Started as compact `Today 08:46` or `Aug 14 21:30` metadata while retaining the complete Org timestamp in the accessible title. By Task keeps complete titles—even beyond 80 characters—in a dedicated inner grid whose title span explicitly overrides Blueprint's non-shrinking button-child rule; collapsed sub-task summaries remain a separate non-overlapping layout item and Sessions, Own, and Total retain stable numeric rails. Narrow screens scroll only when those columns truly need it.

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
| Pomodoro duration (minutes) | 30 | Automatic target captured by each new Session; passing it only changes elapsed colour |
| Only offer clock in on TODO blocks | on | Off lets any block be clocked |
| Allow multiple clocks at once | off | On runs several clocks in parallel |
| Flag unfinished clocks after | 8h | When a running clock is called out as forgotten |

## Notes

- Timestamps carry no timezone, matching org — `[2026-08-05 Wed 15:58]` reads as 15:58 wherever you open it.
- Durations truncate to whole minutes. A hand-edited `=> H:MM` is taken as authoritative over the stamps around it.
- A session that runs past midnight counts wholly against the day it began, as org's own clock reports do.
- Everything happens locally against your graph: no analytics, no network calls, no runtime dependency.

## Development

```bash
npm ci
npm test     # unit tests plus jsdom lifecycle and presentation tests
npm run lint
npm run build
npm run check
./build.sh   # clean, repeatable Roam Depot build
```

`npm run build` bundles `src/` into `extension.js` with esbuild. Commit the bundle alongside the source.

## Attribution

Copyright for the original work remains with [forrestchang](https://github.com/forrestchang). Fork changes are maintained by [404KSG](https://github.com/404KSG). See [LICENSE](LICENSE) for the MIT terms.
