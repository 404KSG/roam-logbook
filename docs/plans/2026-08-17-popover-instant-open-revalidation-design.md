# Popover instant-open revalidation design

Date: 2026-08-17
Status: approved for implementation by 404KSG

## Outcome

An ordinary Topbar click opens the Session Popover synchronously from the last valid in-memory clock and paused snapshot. Graph revalidation begins only after the browser has had a real paint opportunity. The Popover therefore feels immediate without weakening the graph-as-source-of-truth or last-valid-snapshot safety boundaries.

## Root cause

`togglePopover` currently calls `clock.refresh()` synchronously before creating or appending the Popover DOM. Because `clock.refresh()` performs the graph read on the click stack, Roam cannot paint the Popover until that read finishes.

## Open and refresh contract

- Shift+Click remains inert. An ordinary click creates, appends, themes, renders, positions, and focuses the Popover immediately.
- The initial model comes from `clock.getRunning()` plus the current paused/recovery caches. No graph read occurs on the click stack.
- The first rendered footer Refresh control is already in the existing loading state: stable icon-only geometry, disabled, `aria-busy="true"`, and visually hidden loading copy.
- Open-time revalidation uses the same refresh-result and refresh-state path as manual Refresh. The existing in-flight request is the coalescing authority, so fast open/manual Refresh interactions produce at most one graph read.
- A successful confirmed refresh updates the shared clock cache and rerenders a still-open Popover atomically into the existing success/idle lifecycle.
- A failed or uncertain refresh keeps cached rows and renders the existing actionable retry notice. It never replaces cached rows with a definitive empty state.

## Paint-safe scheduler

- Inject one small controller dependency that schedules work after a paint opportunity and returns an explicit cancellation function.
- The browser implementation uses `requestAnimationFrame` followed by a task. Where rAF is unavailable, it uses an equivalent asynchronous two-task fallback rather than a microtask-only `Promise.resolve()`.
- The scheduler is controller-local and transient. It adds no polling, observer, cache TTL, settings, graph state, or persistent state.

## Close, cancellation, and lifecycle

- Closing before deferred revalidation starts cancels the pending frame/task, resolves the pending open request as cancelled, and performs no graph query.
- Closing after the graph query starts never reopens or mutates a removed Popover. A successful result may still update the shared clock cache and Topbar.
- Reopening after cancellation creates a fresh pending revalidation.
- Unmount cancels every not-yet-started open scheduler callback and clears its frame/task handles. Existing focus restoration, outside-click, Escape, resize-close, ticker, and observer cleanup remain unchanged.

## Verification seams

- Public click/DOM behavior proves synchronous Popover creation, cached rows, initial loading/ARIA state, and zero new graph reads before scheduler flush.
- A test scheduler flush proves exactly one graph refresh, confirmed external Session visibility only after settlement, and loading-to-success resolution.
- Failure coverage proves cached rows and retryable uncertainty remain visible.
- Close-before-start, close-after-start, unmount, and fast manual Refresh coverage prove cancellation, no resurrection, shared-cache updates, and request coalescing.
- Existing lifecycle, focus, Shift+Click, outside-click, resize, refresh geometry, and full regression checks remain green. A new browser geometry test is required only if the DOM or CSS geometry changes.

## Non-goals

No graph writes, polling, `MutationObserver`, new queries beyond the one deferred refresh, persistent settings, cache expiry policy, or Popover redesign are part of this change. No GitHub or Roam Depot push is part of this implementation.
