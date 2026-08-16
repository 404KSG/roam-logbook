# Roam Logbook

The Roam Logbook context names the work units and time intervals that make up a
graph-backed work log. These terms keep the graph record, pause/resume behavior,
and dashboard reporting consistent.

## Work and time

**Task**:
A work unit whose time is being recorded. A Task can have multiple Sessions.
_Avoid_: Clock Owner, timer

**Session**:
A single `CLOCK` interval belonging to exactly one Task. A Session may be running
or completed.
_Avoid_: Task, timer

**Running Session**:
A Session whose `CLOCK` interval has no end time yet. The Topbar count is the
number of Running Sessions, not the number of distinct Tasks.
_Avoid_: active Task, open Task

**Completed Session**:
A Session whose `CLOCK` interval has both a start time and an end time.
_Avoid_: closed Task

**Own**:
The time recorded directly on one Task, excluding its descendants.
_Avoid_: direct Total

**Total**:
The roll-up time for a Task: its Own time plus the time of its descendants. A
multi-parent Task can appear in more than one tree branch, so branch totals may
overlap; the global summary counts each Session only once.
_Avoid_: global total

## Durable pause and focus state

**Pause Batch**:
The durable set of Tasks saved for one bulk pause and possible later resume. A
paused batch is Task-based recoverable state, not a set of paused Sessions.
_Avoid_: paused Session, frozen Session

**Pomodoro Cycle**:
One shared focus cycle for the current running state. The first confirmed
Running Session captures the threshold and start instant; parallel Sessions
share it, and passing the threshold changes the reminder state without ending a
Session.
_Avoid_: per-Session timer, Pomodoro Session, timer limit

**Legacy Pomodoro Target**:
The versioned per-session target map retained only for compatibility with older
settings. It does not control the visible timer or define current product
semantics.
_Avoid_: current Pomodoro source of truth

The paused topbar keeps the same history-clock identity and uses only a
low-saturation ochre icon color on the normal transparent surface for a
compact, non-alarming distinction from idle. It has no additional pause badge
or glyph.

## Mutation boundary

Graph mutations are serialized only within one loaded plugin instance. Each queued
DONE, Pause, or Resume action re-reads the graph before writing, confirms its
scope, uses one action timestamp where applicable, and checks a post-write
refresh. This is action-level atomicity, not a cross-tab/device lock, distributed
transaction, or compare-and-swap guarantee. Writes are still issued one at a
time; partial or uncertain results retain exact retry information and never
pretend that an unconfirmed graph read was empty.

## DONE completion

Changing a Task to `DONE` closes its confirmed running Sessions and the confirmed
running Sessions of its descendants. A parent without its own Session still
closes its running child tree; siblings and unrelated parallel Sessions remain
running. Reload reconciliation applies the same rule to open CLOCKs left under
DONE Tasks. Manual single-Session Check Out remains exact and does not cascade.

## Roam adapter boundary

`roam.js` is the only module that touches `window.roamAlphaAPI`. It resolves the
supported API namespace, validates query result shapes, and exposes graph
operations, Pull Watch registration/removal, and native block navigation. Other
modules consume that adapter instead of calling the global Roam API directly.
