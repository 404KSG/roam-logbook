# Today Read Performance Design

## Goal

Keep Today correct on large Daily Notes while reducing the JavaScript work
performed after Roam returns the page. Preserve TODO/DONE semantics, bare block
references, plain intermediary hierarchy, Roam order, collapse state, and the
existing one-page-query plus optional reference-query contract.

The reported page currently contains roughly 511 blocks. Only 122 blocks are
task/reference candidates and 132 blocks are candidates or required ancestors;
379 blocks can be excluded from the task projection.

## Options considered

1. Split the read into structure and candidate Datalog queries. This reduces
   string payload but scans the page more than once and adds query overhead.
2. Use recursive Datalog rules to return only candidates and ancestors. This
   minimizes rows but increases dependence on Roam-specific recursive query
   behavior and makes reference compatibility harder to verify.
3. Keep the single complete page query, then build a compact task projection
   before allocating the nested tree. This retains the fastest and most proven
   graph-read shape while removing irrelevant LOGBOOK/CLOCK and note branches
   from subsequent allocation, sorting, validation, and UI-model traversal.

Use option 3. It has the lowest correctness risk and removes most downstream
work on the real page without adding graph queries.

## Data flow

1. Read the exact Daily Notes page once as flat rows.
2. Validate row shape, page identity, duplicate UIDs, parent edges, cycles, and
   maximum depth over the complete structure.
3. Seed relevance with unfinished TODO blocks and bare block references. A DONE
   block is retained only when it is an ancestor required by an unfinished
   descendant; a standalone completed branch is irrelevant to Today's pool.
4. Walk from every seed to the page root and mark only required ancestors.
5. Allocate and sort nested nodes only for marked rows.
6. Resolve strings only for the retained bare-reference seeds.
7. Pass the compact physical task context to the unchanged Today task model.

An absent page remains a confirmed empty result. A valid page with no task or
reference candidates returns an empty task projection without becoming a graph
error. Explicit diagnostic node limits still apply to the complete row set.

## Verification

- Regression: the valid 509-block, depth-nine page still reads successfully.
- Projection: a large page with heavy LOGBOOK/CLOCK noise retains only open
  TODO/reference candidates and necessary ancestors, including DONE ancestors
  when they lead to an unfinished descendant.
- Compatibility: nested TODOs through plain blocks, DONE promotion, bare
  references, ordering, malformed parents, cycles, depth limits, and explicit
  node limits retain existing behavior.
- Performance contract: one page-tree query and at most one finite reference
  query; no per-block Pull/query loop.
- Run focused Today tests, full lint/build/bundle checks, and all tests before
  updating the existing Roam Depot Draft.
