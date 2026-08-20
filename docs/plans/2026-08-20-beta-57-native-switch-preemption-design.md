# Beta.57 Native Switch Preemption

## Goal

Make Timing Line navigation feel like native Shift+Click during rapid task
switches without weakening Roam window deduplication or graph authority.

## Public seams

- `createTimingLineSidebarFronting`: every accepted user intent starts its
  reversible sidebar request immediately; only the newest intent may notify or
  own the final visible order.
- `frontBlockInRightSidebar`: Roam's native right-sidebar calls remain the only
  navigation adapter. Reversible previews may run ahead of the serialized
  authoritative window read/add path.

## Data flow

1. A Clock In intent synchronously reaches the sidebar adapter.
2. The adapter starts `rightSidebar.open()` immediately.
3. If the target is a recently known window, an Active Work switch, or another
   sidebar operation is still in flight, it also starts a reversible
   `setWindowOrder` / `expandWindow` preview immediately.
4. The existing serialized operation queue then reads `getWindows()` and
   reconciles the result. Existing targets are re-fronted when an older
   operation could have overtaken the preview; missing targets are added once.
5. Superseded work may finish an already-issued native call but cannot perform
   fallback work, emit a notice, or become the final reconciled target.

## Cache boundary

The weak native-window hint uses the same fixed 45-minute lifetime as Active
Work. It remains only a preview hint. `getWindows()` is authoritative whenever
available, and a failed preview drops the hint before one bounded recovery.

## Tests

- A second intent reaches its native preview while the first native operation
  is unresolved, then finishes as the final ordered target.
- An Active Work switch can preview an existing window without a warm local
  cache and still confirms it through `getWindows()`.
- A missing target never trusts the preview and adds exactly one native window.
- Existing closed-sidebar, cancellation, legacy-host, unrelated-window, graph,
  and bundle regressions remain green.
