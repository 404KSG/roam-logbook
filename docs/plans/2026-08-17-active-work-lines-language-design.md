# Active Work Lines Language Design

## Problem

The popover currently labels untimed but still switchable work as `RECENT`. That
describes recency, not the user's working model: these items are parallel work
lines that remain active while only one line owns the timer.

## Approved model

`Active Work = 1 Timing Line + N Open Lines`.

- A **Timing Line** is the single work line currently accumulating elapsed time.
- An **Open Line** is a recently active, switchable work line that is not
  accumulating time.
- Open Lines remain in Active Work for 45 minutes after their last timed session.
- Expiry removes a line only from Active Work; historical sessions and Dashboard
  totals remain unchanged.
- Switching between lines transfers the timer without resetting the continuous
  pomodoro. Pausing or otherwise breaking the continuous work interval resets it.

## Popover contract

- Header: `ACTIVE WORK · N`.
- Running section: `TIMING`.
- Untimed section: `OPEN LINES · N`, with quiet context text `45m window`.
- Each Open Line shows total historical duration and time remaining in the
  window, for example `18h 21m total · 21m left`.
- When no line is timing, omit `TIMING` and continue showing `OPEN LINES · N`.
- No progress bars, animation, warning colors, or explanatory banners.

## Top bar and accessibility

- Keep the compact visible label `N Active`.
- Its tooltip and accessible description explain the composition, for example
  `1 timing line · 2 open lines · 45m window`.
- Open Line metadata exposes the exact last-active timestamp and the remaining
  window duration to assistive technology.

## Time boundary

Remaining whole minutes use ceiling semantics while a line is visible, so an
eligible line never displays `0m left`. At the exact 45-minute boundary it is no
longer part of Active Work.

## Non-goals

- Do not merge sessions.
- Do not run more than one timer.
- Do not change Dashboard history or totals.
- Do not add workload limits or new notification behavior.
