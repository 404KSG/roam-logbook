# Beta.43 Settings and command surface

## Outcome

Roam Logbook exposes only controls that still alter the current single-focus
workflow. The graph format, Active Threads model, Dashboard, context menu, and
right-sidebar behavior remain unchanged.

## Settings

The Settings panel has exactly three rows, in this order:

1. `Open Timing Line in right sidebar` — default on.
2. `Work-cycle duration (minutes)` — default 45.
3. `Forgotten timer warning (hours)` — 2, 4, 8, 12, or 24; default 8.

The Top Bar is a core navigation surface and Clock In is permanently limited to
unfinished TODO blocks. The retired `showTopbarWidget` and `todoBlocksOnly`
values remain in extension storage but are not shown, migrated, or obeyed.

## Command Palette and Hotkeys

Only these three commands are registered, all without a default shortcut:

- `Logbook: Focus current block`
- `Logbook: Clock out Timing Line`
- `Logbook: Open dashboard`

Focus starts or switches the unfinished TODO being edited. Clock out Timing
Line acts on the one global timer rather than whichever block happens to have
editor focus, and it executes on one invocation. Old palette labels are removed
on load and unload to keep hot reloads deterministic.

## Safety and compatibility

The TODO constraint is enforced inside `clockIn`, not only by menu visibility,
so Dashboard and future entry points cannot bypass it. Context-menu Clock In and
Clock Out remain available. Existing Clock data and legacy setting keys are not
rewritten. Tests cover panel descriptors, exact command registration, no
default hotkeys, global Clock Out behavior, partial and uncertain writes,
always-on Top Bar behavior, and mutation-level rejection of plain or DONE
blocks.
