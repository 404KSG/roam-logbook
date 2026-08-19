# beta.50 Linear Toolbar and Refresh Design

## Design

Replace the visible `ACTIVE THREADS · N` row and full-width switcher with one compact toolbar. Its left side is an auto-width `Threads N` / `Today N` navigation pair; its right side contains contextual Today expand/collapse immediately before Dashboard. Dashboard is always the rightmost visible header action. `Active Threads` remains the hidden dialog title and list context, not duplicated visible copy. Tabs retain native-button keyboard behavior and exact `aria-pressed` state. Selected styling uses a quiet neutral surface and strong neutral text; counts are visually subordinate, while task links keep Roam blue.

The toolbar is one stable 32px line at the 460px popover width and 304px, 324px, and 344px narrow shells. Tabs size to content rather than sharing width. A fixed Today count/status slot prevents count-to-spinner layout movement. Header flex/grid children may shrink only within their own bounds; they never wrap, overlap, clip controls, or create horizontal scrolling.

## State machine and freshness

The existing open lifecycle remains cache-first: paint the cached Active Work model, then run the existing post-paint background revalidation. Today has `idle/loading/success-or-empty/error` read state plus an independent in-flight promise and last-success timestamp. A successful Today snapshot remains rendered during revalidation. Entering Today starts a read when no snapshot exists, coalesces with an in-flight read, or revalidates only when the successful snapshot is strictly older than 30,000ms. Exactly 30,000ms remains fresh; 30,001ms is stale. Closing/unmounting invalidates pending work. There is no polling, body observer, setting, or additional long-lived timer.

During Today revalidation, only a small `aria-hidden` spinner occupies the fixed Today status slot; the Today control exposes `aria-busy=true` and an updating accessible label. Idle and successful states show only the quiet count, with no Refresh button and no success notice. The public `onRefresh` action and refresh controller remain available for Retry and other callers.

## Error and retry

A failed Active Work or Today revalidation never clears its last successful data. The relevant content region exposes the compact accessible inline message `Couldn’t update · Retry`; Retry calls the existing combined refresh path. If Today has never produced a successful snapshot, its content instead shows the compact read failure `Couldn’t read Today · Retry`. Errors are announced in the relevant region, while successful refresh is silent. Retrying coalesces with current work and preserves graph, Dashboard, Pomodoro, and mutation semantics.

## Preserved behavior and test contract

beta.49 Today behavior remains intact: one stateful bulk toggle only for expandable trees, per-row chevrons, forced-open current Timing path, no hidden-descendant counts, and a fixed 32px Play/Currently timing rail. The single Timing Line, query bounds, graph/time semantics, sidebar intent, hierarchy, Dashboard data, Pomodoro cycle, `scrollbar-gutter`, and cache-first opening remain unchanged.

Tests cover toolbar DOM/order and accessible state, absence of idle/success Refresh, stable loading spinner, contextual Retry with snapshot preservation, no-snapshot Today failure, the exact 30-second boundary, read coalescing/query counts, ticker/no-polling and lifecycle cancellation, retained beta.49 hierarchy controls, and real-Chromium geometry across 460/304/324/344px for Threads, Today, loading, error, and leaf-only states. Release verification includes focused tests, `npm run check`, `git diff --check`, live/read-only verification, bundle build, and byte equality for `extension.js`.
