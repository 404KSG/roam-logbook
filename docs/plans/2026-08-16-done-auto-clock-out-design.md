# DONE Auto Clock Out and Task-Tree Cascade

Date: 2026-08-16
Status: superseded implementation design; implemented in beta.21 and retained
as historical evidence

> The design below records the approved DONE behavior before implementation. The
> current release-wide authority is [beta.21 hardening design](2026-08-16-beta-21-hardening-design.md),
> which adds the shared mutation/recovery, bounded-observer, Dashboard, and
> release-gate constraints. Do not treat this plan's pre-release wording as a
> separate feature-expansion request.

## Outcome

Treat a Task changing to `DONE` as completion of that Task's confirmed active
subtree. Close every Running Session owned by the Task or a confirmed descendant,
keep parents, siblings, and unrelated parallel Sessions running, and prevent a
Pause Batch from reopening completed work.

Normal single-Session `Clock Out` remains exact. `Clock Out All` remains global.

## Chosen approach

Use Roam pull watches on graph entities, not DOM observation or polling. Maintain
watches only for Running Tasks and their known ancestors. Reconcile from fresh
graph state inside the existing mutation queue before any close write.

Rejected alternatives:

- Copy upstream PR #2 unchanged: light, but exact-task only and not compatible
  with the fork's graph-safety and Pause Batch invariants.
- Poll task state: simpler fallback, but adds recurring graph queries and makes
  the Topbar ticker heavier.
- Make normal Clock Out cascade: surprising and inconsistent with its current
  one-Session meaning.

## Behavior contract

- Direct `DONE`: close every confirmed open `clockUid` on the Task and its
  descendants.
- Parent `DONE`, including a parent with no own Session: close all confirmed
  Running Sessions below it at any depth.
- Child `DONE`: do not close parent, siblings, or unrelated Sessions.
- Reload: apply the same reconciliation to open CLOCK records left beneath DONE
  Tasks or DONE ancestors.
- Pause Batch: remove completed Tasks and descendants from both paused and
  pending-resume records so Resume cannot reopen them.
- Clock In beneath a confirmed DONE Task or DONE ancestor: reject until the
  ancestor is reopened.
- Rapid `DONE -> TODO`: re-read at queued execution time; a stale DONE event must
  not close a new Session.
- Duplicate historical open clocks on one Task: close all confirmed clock UIDs.
- Ambiguous, cyclic, unresolved, or failed hierarchy reads: do not guess. Perform
  zero cascade writes and retain retryable state/notice.

The existing hierarchy semantics remain authoritative. A child written beneath a
bare `((parent))` placement belongs to that parent. A mere textual mention does
not. Multi-parent or unresolved paths must not expand the affected subtree unless
the relationship is confirmed without ambiguity.

## Architecture

1. Add a Roam adapter for `addPullWatch/removePullWatch` that returns an
   idempotent detach function and exposes installation/removal failure.
2. Add a completion reconciler that derives its watch set from confirmed Running
   Tasks plus ancestor UIDs, deduplicates by UID, and removes stale watches only
   after a successful snapshot.
3. Coalesce watch events, then enter the existing mutation queue. Re-read Entries,
   task strings, Pause Batch candidates, and hierarchy inside the queued action.
4. Select exact affected `clockUid` values and close them with one `now` value.
   Reuse structured partial/uncertain/retry results and publish `source:
   auto-complete` actions.
5. Consume matching Pause Batch and pending-resume records only after the DONE
   scope is confirmed. Refresh Running state and resynchronise watches.
6. Attach before/around the initial graph refresh with a second reconciliation to
   close the read/watch installation gap. Detach watches before clock reset on
   unload.

No new dependency, interval, whole-graph task watch, or UI setting is added.

## Public test seams

- Extension lifecycle seam: real `onload/onunload`, graph-stub `block.update`, and
  pull-watch count.
- Clock seam: public Clock actions, structured action results, and `getRunning()`.
- Pause seam: public `load/getPaused/getPendingResume/resumeAll` behavior.
- Adapter seam: supported/missing/throwing pull-watch API and idempotent cleanup.

## Required tests

P0:

- direct DONE, parallel isolation, parent with/without own clock, grandparent
  cascade, sibling isolation, child-only completion;
- reload reconciliation for direct and ancestor DONE;
- Pause Batch and pending Resume pruning;
- rapid DONE/TODO recheck, duplicate open clocks, unload cleanup;
- graph/hierarchy read failure performs zero writes and preserves the last valid
  snapshot/retry state;
- no periodic graph queries while only the Topbar timer advances.

P1:

- child beneath `((parent))`, non-task intermediate blocks, unresolved/cyclic and
  multi-parent hierarchy safety;
- automatic vs manual Clock Out race, parent DONE vs child Clock In race, partial
  close failure and retry;
- missing or throwing Pull Watch API degrades to refresh/reload reconciliation
  without polling.

## Verification

Run focused RED/GREEN slices first, then `npm test`, `npm run lint`, `npm run
build`, `npm run verify:bundle`, and `npm run check`. Confirm the generated bundle
contains the completion feature and remains byte-for-byte synchronized. A final
live Roam smoke must verify direct DONE, parent cascade, reload, references, and
unload cleanup before Depot publication.
