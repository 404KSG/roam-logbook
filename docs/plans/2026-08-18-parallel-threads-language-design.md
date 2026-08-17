# Parallel Threads Language Design

Date: 2026-08-18
Status: approved

## Goal

Make the untimed part of Active Work immediately read as parallel work that is
still available for switching, while explaining why an item later leaves the
surface.

## Approved language

- Keep the surface title `ACTIVE WORK · N` and the compact Top Bar `N Active`.
- Keep the single timed section label `TIMING`.
- Rename the untimed section from `OPEN LINES · N` to
  `PARALLEL THREADS · N`.
- Replace `45m window` with the plain-language context
  `Leave after 45m without focus`.
- Replace row metadata `<total> total · <N>m left` with
  `<total> total · leaves in <N>m`.
- The accessible description must carry the same meaning and retain the exact
  last-active timestamp.

## Semantics

`Parallel Threads` means distinct work that remains in the current Active Work
set but is not accumulating time. Only the `TIMING` row owns the current CLOCK.
After 45 minutes without being focused again, a parallel thread leaves Active
Work; its task, CLOCK history, Dashboard Sessions, and totals remain unchanged.

## Boundaries

- Preserve ceiling semantics: a visible thread never says `leaves in 0m`.
- Preserve the exact 45-minute expiry boundary.
- Preserve single-focus switching, continuous Pomodoro behavior, DONE status,
  navigation, sorting, filtering, and graph storage.
- Keep existing internal Open Line identifiers unless a user-facing or
  accessibility string requires the new terminology; this is a language-only
  refinement, not a data migration.

## Verification

- Popover/sidebar headings, context, row metadata, tooltip, and ARIA copy use
  the approved terms.
- Pure untimed Active Work still renders when no Timing row exists.
- One-second updates change only the remaining-time phrase and preserve the
  exact expiry behavior.
- Narrow light/dark layouts remain readable without overlap or overflow.
- Full tests, lint, workflow verification, build, and bundle synchronization
  pass before release.
