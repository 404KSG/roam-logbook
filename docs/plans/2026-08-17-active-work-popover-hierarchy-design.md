# Active Work popover hierarchy design

Date: 2026-08-17  
Status: approved for implementation by 404KSG

## Outcome

The Active Work popover makes the currently timed Task immediately legible:

- `FOCUSED` is a separate compact card.
- `RECENT · N` is a flat list of returnable Tasks.
- `ACTIVE WORK` remains the surface title.

This is a presentation-only refinement. It does not change the single-Focused
clock invariant, the 45-minute Active Work window, the shared Pomodoro cycle,
graph reads, polling, settings, persisted state, or dependencies.

## Focused card

The Focused section has a restrained running-colour tint and a 2–3px left
accent. The current Task title is slightly stronger, and the live elapsed
value is the strongest metadata. Existing icon-only Check Out and Discard
actions retain their labels, alignment, and keyboard behavior. When the shared
Pomodoro cycle overruns, the existing red timer semantics also tint the Focused
accent; no new dot, icon, badge, or state is introduced.

## Recent list

Recent Tasks are rendered as flat rows with separators and no resting card or
background. Hover and keyboard focus add only a subtle surface cue. The heading
is `RECENT · N`, and each row remains a native keyboard-accessible button:

```text
2h 06m total · 3m ago
```

The relative formatter uses bounded `just now`, minute, hour, day, week, month,
and year forms and treats malformed timestamps as `time unavailable`. The exact
org timestamp is retained in the `title`, `aria-label`, and `datetime` where
valid. Ordinary activation still switches the row into the one Focused CLOCK;
Shift+Click still delegates to the existing Roam right-sidebar navigation.

## Safety and layout

The list remains an accessible `Active Work` group. Focused, Recent, Paused, and
Recovery are explicit sections, which removes the old shared bordered-container
feeling without changing their actions. CSS uses existing variables and
theme-safe colors, keeps action columns outside ellipsized titles, and limits
the Recent section to one flexible column for narrow popovers.

## Verification

- jsdom coverage checks section modifiers, `RECENT · N`, live elapsed nodes,
  relative metadata, exact timestamp labels, Recent focus switching, and the
  absence of status dots.
- Chromium coverage checks the card/list separation, border and background
  treatment, focus/action geometry, accessibility metadata, and no overflow at
  the compact popover width.
