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
The durable set of Tasks saved for one bulk pause and possible later resume. It
is recoverable state, not a Session.
_Avoid_: paused Session, frozen Session

**Pomodoro Target**:
The intended focus duration attached to one Session. Passing the target changes
the reminder state but does not end the Session.
_Avoid_: Pomodoro Session, timer limit

## Mutation boundary

Graph mutations are serialized only within one loaded plugin instance. Each queued
action re-reads the graph before writing and checks a post-write refresh, but this
is not a cross-tab/device lock or compare-and-swap guarantee. Writes are issued
one at a time; a partial failure remains recoverable and is reported as uncertain.
