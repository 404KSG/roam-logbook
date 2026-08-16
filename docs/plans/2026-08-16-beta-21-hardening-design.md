# Beta.21 hardening design

Date: 2026-08-16
Status: adopted release design; implementation is present in the beta.21 source
tree

## Scope and authority

Beta.21 is a hardening release for the existing graph-backed Logbook behavior.
It does not expand the product surface. The accepted scope is limited to safe
completion and pause mutations, reload recovery, Pull Watch lifecycle, bounded
observers, recovery feedback, and verification gates.

The graph is the source of truth. Existing `LOGBOOK::` drawers and `CLOCK::`
entries are authoritative; the extension does not create a local clock database
or treat in-memory state as durable. Extension settings may hold recovery
metadata—such as a versioned Pause Batch, the shared Pomodoro cycle, and backups
of unknown state—but they do not replace graph records.

The current terminology is binding:

- A running unit is a `Session`: one open `CLOCK::` interval belonging to one
  Task. Topbar and Dashboard running counts count Sessions.
- A paused batch contains `Tasks`, identified by canonical Task UIDs. It is not
  a set of frozen Sessions. Resuming creates fresh graph Sessions.
- `Own` is time recorded directly on a Task; `Total` is its read-time hierarchy
  roll-up. Moving or re-indenting a Task does not rewrite historical CLOCKs.
- Pomodoro is one shared cycle for the current running state. Legacy
  per-session target fields remain compatibility-only and do not drive the
  visible timer or add a per-session UI.

## Adapter boundary

`src/roam.js` is the only module that touches `window.roamAlphaAPI`. It is a
thin adapter, not a second source of truth: it resolves the supported Roam API
namespace, validates query result shapes, and exposes graph operations,
Pull Watch registration, and native block navigation to the rest of the
extension. Clock, pause, completion, Dashboard, and UI modules use those
adapter functions rather than calling Roam APIs directly.

Successful empty query results remain distinct from failed or malformed graph
reads. A failed read is an uncertain graph state and must never be converted to
an empty graph before a mutation decision.

## Mutation safety

DONE completion and Pause All are evaluated as one queued action boundary:

1. Enter the per-plugin mutation queue.
2. Re-read the graph and hierarchy at execution time.
3. Confirm the exact current open `clockUid` scope before any write.
4. Use one action timestamp for the selected close operation.
5. Re-read after writes and publish a structured outcome.

DONE closes the completed Task and every confirmed running descendant in its
tree. It does not close siblings or unrelated parallel Sessions. A manual
single-Session Check Out remains single-Session, and Clock Out All remains the
explicit global action.

Pause All persists the versioned batch intent before closing graph CLOCKs. It
stores exact pending Task/clock identifiers when a graph write is incomplete;
Resume consumes confirmed records without duplicating a Session. Pause, Resume,
DONE, and their recovery paths expose completed, failed, pending, uncertain,
and retry information to the UI.

This is action-level atomicity, not a claim that Roam provides a distributed
transaction: graph updates are still individual writes. If a write or post-write
confirmation fails, successful items remain successful, failed identifiers stay
retryable, and no later step guesses from an unconfirmed graph state. A failed
preflight read performs zero speculative graph writes.

## Reload and crash recovery

Reload recovery reconstructs running Sessions from open CLOCKs in the graph,
loads the versioned Pause Batch and shared Pomodoro cycle, and preserves unknown
or corrupt persisted values for review rather than overwriting them. The same
completion reconciliation used for live updates handles a Task or ancestor that
was already `DONE` while the extension was unloaded.

Completion watches are attached around the initial refresh and a second
reconciliation closes the read/install race. On unload, Pull Watches are
detached before the clock state and UI subscriptions are reset. A missing or
failing watch API degrades to safe refresh/reload reconciliation; it must not
cause a destructive write or a false claim that watching is active.

## Pull Watch lifecycle

Completion observes Roam graph entities through `addPullWatch` and
`removePullWatch`, never DOM checkboxes and never a polling interval. The desired
watch set is bounded to confirmed Running Task UIDs plus their confirmed known
ancestors, deduplicated by UID. A successful complete snapshot may remove stale
watches; an uncertain snapshot retains the previous valid set.

The adapter reports installation and removal failures. Detach is idempotent and
can be retried after a failed removal. `src/completion.js` coalesces events,
re-enters the mutation queue, re-reads the current graph, and resynchronizes the
watch set after each completed or deferred reconciliation. Non-DONE text changes
still allow the watch set to be reconciled without introducing whole-graph
observation.

## Recovery UI and read-only Dashboard refresh

Recovery is visible at existing UI boundaries:

- A graph read failure is shown as uncertain state, not as “no Sessions.” The
  last valid running/Dashboard snapshot remains visible where available.
- Partial DONE, Pause, or Resume outcomes retain retryable identifiers and show
  an actionable retry notice after Roam finishes syncing.
- The current-session surface stays open across Refresh failure, coalesces fast
  Refresh clicks, and keeps successful state feedback accessible without adding
  noisy persistent copy.

The Dashboard remains one chart-free, list-first surface with exactly four
metrics: Today, the selected range total, Sessions, and Tasks tracked. Running
appears when populated, followed by the By Task tree. Dashboard Refresh is a
read-only graph re-read: it does not write CLOCKs, Pause Batch state, Pomodoro
state, or graph configuration, and it retains the last valid snapshot on
failure. There is no Analytics/chart view, By Day chart, category view, or
secondary Dashboard mode in beta.21.

Topbar Shift+Click is inert. Only a task title's native Shift+Click navigation
may request Roam's right-sidebar block-window API through the adapter; ordinary
task clicks retain main-window navigation. The topbar trigger only toggles the
current-session surface on ordinary click.

## Bounded observers

Graph completion uses bounded Pull Watches. UI recovery uses narrowly targeted,
filtered observers for the discovered topbar host/navigation shells and the
Roam theme root; observers are disconnected on replacement and unload. The
Topbar ticker updates existing text nodes only. No whole-document mutation
observer, graph polling loop, or new recurring query is part of this design.

## Verification gates

The release evidence must keep its claim ceiling explicit:

- Local regression gate: run the current `npm test` suite, `npm run lint`, and
  the workflow contract check. The documentation intentionally does not pin an
  exact test count; release evidence should report the count from the clean run
  that produced it.
- Hardening coverage gate: direct and ancestor DONE completion, sibling
  isolation, reload reconciliation, DONE/TODO races, duplicate open CLOCK
  handling, Pause Batch and pending-Resume pruning, partial writes/retries,
  graph/hierarchy read failures, Pull Watch installation/removal failure,
  idempotent unload cleanup, inert topbar Shift+Click, four-metric chart-free
  Dashboard, and read-only Refresh retention.
- Live gate: run `npm run verify:live` against a configured real graph after
  reading its guidelines. It is read-only and must be reported separately from
  fake-adapter tests. A final manual Roam smoke covers direct DONE, parent DONE
  with child Sessions, reload recovery, Pause/Resume recovery, native sidebar
  navigation, Dashboard Refresh, and unload cleanup.
- Bundle gate: a separately authorized source release must regenerate the
  checked-in `extension.js` and run `npm run verify:bundle` before Depot
  publication. This beta.21 documentation/metadata pass intentionally does not
  rebuild or rewrite the root bundle.

## Release boundary and maintenance

Roam Depot remains **Draft**. This task does not publish, approve, or modify any
external PR. No dependency upgrade is part of beta.21. The existing `esbuild`
advisory is dev-only local build maintenance, not a runtime extension exposure;
track its remediation separately rather than changing dependencies in this
hardening pass.

No category system, Analytics view, chart, inline TODO control, global shortcut,
new persisted clock format, network service, or other feature expansion is
authorized by this design.
