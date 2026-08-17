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

**Focused CLOCK**:
The one Session whose `CLOCK` interval has no end time yet. At most one Focused
CLOCK exists; switching Tasks closes the old interval before opening the new one.
The Topbar count is Active Work, not the number of running CLOCK blocks.

**Active Work**:
The Focused Task plus distinct Tasks whose most recent Session ended within the
fixed 45-minute return window. Recent Tasks are clickable navigation shortcuts;
they never imply a second running CLOCK.
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
One shared focus cycle for the current continuous work period. The first
Focused CLOCK captures the threshold and start instant; seamless Task switches
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

## Active Work surface hierarchy

The current-session surface is intentionally hierarchical without adding new
state. **Focused** is a separate compact card with a very light neutral surface,
a uniform 1px neutral hairline border on all four sides, a slightly stronger
task title, and the live elapsed value as the primary visual. It has no green
left accent or substitute status glyph. Pomodoro overrun changes only the
elapsed value to red; it never recolours the card or any border. **Recent** is
a flat, separator-based list headed `RECENT · N`; its rows have no resting card
border or background and use subtle hover/focus feedback only. Recent metadata
is `<total> total · <relative time>`; the exact org timestamp remains in the
title and accessible name. Recent rows still switch focus when activated. No
graph reads, polling, settings, state, or new dependencies are introduced by
this presentation layer.

## Mutation boundary

Graph mutations are serialized only within one loaded plugin instance. Each queued
DONE, Pause, or Resume action re-reads the graph before writing, confirms its
scope, uses one action timestamp where applicable, and checks a post-write
refresh. This is action-level atomicity, not a cross-tab/device lock, distributed
transaction, or compare-and-swap guarantee. Writes are still issued one at a
time; partial or uncertain results retain exact retry information and never
pretend that an unconfirmed graph read was empty.

## DONE completion

Changing a Task to `DONE` closes its confirmed Focused CLOCK and any confirmed
legacy open descendant CLOCKs. A parent without its own Session still closes its
running child tree. Reload reconciliation deterministically keeps one Focused
CLOCK and closes older overlapping legacy intervals. Manual single-Session Check
Out remains exact and does not cascade.

## Roam adapter boundary

`roam.js` is the only module that touches `window.roamAlphaAPI`. It resolves the
supported API namespace, validates query result shapes, and exposes graph
operations, Pull Watch registration/removal, and native block navigation. Other
modules consume that adapter instead of calling the global Roam API directly.
