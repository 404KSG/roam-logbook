# Dashboard Task Focus Actions

Status: implemented in `0.9.0-beta.36`.

## Approved behavior

The Dashboard task table supports starting or switching the single Timing Line directly from a task row.

- An unfinished task that is not currently timed shows an icon-only Play action.
- The task owning the current Timing Line shows a non-interactive timing-status icon instead of Play.
- A completed task keeps its completed state and has no Play action.
- Activating Play closes the previous open `CLOCK`, opens a new `CLOCK` for the selected task, and preserves the one-linear-timer invariant.
- The Dashboard remains open after the switch and refreshes in place.
- Existing confirmed-focus behavior still places the newly focused block at the front of the right sidebar.

## Parallel Threads heading

The popover context uses two fixed, left-aligned lines:

```text
PARALLEL THREADS · N
Leave after 45m without focus
```

The explanatory line must not share the title row or wrap beside it.

## Scope

- Reuse the existing clock transition and post-confirmation sidebar path.
- Add no observer, polling loop, setting, or data migration.
- Keep existing task-title navigation and Shift-click behavior unchanged.

## Verification

- DOM tests cover idle TODO, current Timing Line, and DONE row actions.
- The Play action transfers focus without creating parallel open `CLOCK` entries.
- The Dashboard modal remains mounted and rerenders after the action.
- The timing icon is non-interactive and accessible by label/title.
- The Parallel Threads title and context remain separate left-aligned lines at narrow widths.
