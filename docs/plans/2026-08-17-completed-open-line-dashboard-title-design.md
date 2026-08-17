# Completed Open Line and Dashboard Title Design

Date: 2026-08-17
Status: approved

## Goal

Make task state and navigation cues truthful across Active Work and Dashboard without changing timing, filtering, sorting, or graph data.

## Decisions

### Completed Open Lines

- A TODO Open Line keeps the interactive play control and may become the Timing Line.
- A DONE Open Line cannot be focused. Its play button is replaced by a non-interactive circular check status with `Completed` title and accessible name.
- The completed marker has no action dataset, click handler, button role, or keyboard action. The task title remains the navigation target.
- The row remains visible until the existing 45-minute Active Work window expires.

### Dashboard titles

- Dashboard task titles use the same display-only formatter as Active Work.
- Visible and accessible text preserve complete `[[page refs]]` and `#[[tags]]`, while macros, TODO/DONE markers, block references, Markdown links, and presentation markup remain stripped.
- The title is an icon-free native button using Roam's sampled page-reference colour, no resting/hover/focus underline, and the existing focus outline.
- Ordinary click opens the block; Shift+Click opens it in the right sidebar. Status marks, hierarchy, filter/sort state, rollups, canonical `taskTitle()`, and CLOCK data remain unchanged.

## Data boundary

Raw `taskString` travels through Dashboard summary and task-tree nodes only for presentation. Reports and ordering continue to use normalized titles and numeric fields. Ancestor-only rows receive their raw hierarchy string so the same formatter can render them.

## Verification

- DONE Open Line: completed marker exists; play/focus action and callback path do not.
- TODO Open Line: play/focus action still works.
- Dashboard: full brackets, icon-free DOM, Roam link colour, no underline, correct accessible label, ordinary click and Shift+Click.
- Narrow light/dark Chromium layouts remain aligned with no overflow.
- Full suite, lint, workflow verification, build, and byte-for-byte bundle verification pass.
