# Roam Logbook

org-mode style clock tracking for Roam Research TODOs. Right-click a task to clock in, watch the session run in the topbar, and add it all up in a dashboard.

Entries are stored in the graph in org's own format, as a `LOGBOOK::` drawer under the task:

```
{{[[TODO]]}} this is a test task
  - LOGBOOK::
    - CLOCK:: [2026-08-05 Wed 15:58]--[2026-08-05 Wed 16:58] => 1:00
```

## Use

**Clock in** — right-click a TODO bullet → **Plugins** → **Logbook: Clock in**. The same menu offers **Logbook: Clock out** while a clock is running. Both are also in the Command Palette, acting on the block you are editing.

**Topbar** — a live counter shows the running session. Click it for the list of open clocks, where each one can be stopped, thrown away, or jumped to.

**Dashboard** — `Logbook: Open dashboard`, or the button in the popover. Totals for today and the last 7 days, a per-day bar row, and a per-task breakdown over the range you pick.

### Block references

Clocking in on a block whose entire content is `((uid))` or `{{embed: ((uid))}}` writes the drawer onto the original task, not onto the mirror. Reference a task into today's daily note, clock it there, and the log still collects in one place.

### Unfinished clocks

A clock with no end stamp is a running clock — that is the whole persistence model, so a session survives a reload, a crash, or a clock started on another device. On load the extension reads them straight back out of the graph.

Clocks that have been open longer than the threshold (8 hours by default) are marked as likely forgotten: an amber dot on the topbar, a warning in the popover, and a `stale` tag in the dashboard's Running section. Each can be closed at the current time or discarded.

### One clock or several

By default, clocking in closes whatever was running, the way org-mode behaves. Turn on **Allow multiple clocks at once** in the settings to run several tasks in parallel; the topbar then shows the count, and clocking the same task twice is refused so nothing gets double-counted.

## Settings

| Setting | Default | Effect |
| --- | --- | --- |
| Show topbar widget | on | The live counter and its clock list |
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
npm test     # unit tests plus a jsdom lifecycle smoke test
npm run lint
npm run build
npm run check
```

`npm run build` bundles `src/` into `extension.js` with esbuild. Commit the bundle alongside the source.

MIT licensed.
