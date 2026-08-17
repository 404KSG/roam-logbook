# Active Work header actions design

## Decision

Move Dashboard and Refresh out of the Active Work footer and into one compact
header action group. Both controls are icon-only Blueprint buttons with equal
32px targets, visible hover/focus treatment, tooltips, and accessible labels.
The right-sidebar shell may add Close to the same group.

## Footer boundary

Do not render a footer for empty, Recent-only, or single-Focused surfaces. A
footer exists only when more than one running Session exposes Clock Out All;
the existing two-step confirmation and mutation behavior remain unchanged.

## Refresh boundary

Refresh remains read-only and keeps its idle, loading, success, and error
states. Loading disables the control and rotates only the icon; the visually
hidden live region continues to announce state without changing geometry.

## Acceptance

- Dashboard, Refresh, and optional Close remain ordered and keyboard reachable.
- The header does not overflow at 320px or 340px.
- Icon hit targets remain equal while Refresh changes state.
- No empty footer is left behind when no bulk action exists.
- Existing graph reads, focus switching, Recent behavior, and Clock Out logic
  are unchanged.
