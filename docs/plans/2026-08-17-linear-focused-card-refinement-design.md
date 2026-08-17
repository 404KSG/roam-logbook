# Linear-style Focused card refinement

Date: 2026-08-17  
Status: approved and implemented in `0.9.0-beta.24`

## Outcome

The Active Work popover keeps its existing hierarchy while making the Focused
state feel like a restrained Linear surface:

- `FOCUSED` remains a separate compact card.
- The card uses a uniform 1px neutral hairline border on all four sides.
- The card uses a very light neutral surface and a compact 6px radius.
- The green left accent is removed completely; no icon, badge, or coloured dot
  is introduced in its place.
- `RECENT · N` remains a quiet flat list with separators and no resting card
  border or background.

This is presentation-only. Beta.22's single-Focused clock, 45-minute Active
Work return window, shared Pomodoro cycle, Recent data, navigation, graph
queries/writes, and lifecycle behavior remain unchanged.

## State emphasis

The visual hierarchy comes from structure and typography:

1. The Focused section has a neutral border and light surface.
2. The current Task title remains slightly stronger than Recent titles.
3. The live elapsed value remains the strongest metadata.
4. Pomodoro overrun changes only the elapsed value to red. The Focused card,
   its four borders, and the surrounding section remain neutral.
5. Focused hover/focus feedback uses the existing neutral surface hover token;
   it does not reintroduce running-green tint.

The existing `rlb-surface__section--overrun` class remains a semantic update
hook for the live ticker, but it has no coloured border rule.

## Responsive and theme contract

The same DOM and CSS contract must hold in light and dark Roam themes and at
320px and 340px popover widths:

- all four Focused border widths are exactly 1px;
- all four Focused border colors are the same neutral computed color;
- overrun does not change any Focused border color or width;
- overrun does make `.rlb-run__elapsed` red while the total/start metadata
  remains non-red;
- Focused title, metadata, and actions remain inside the card without overlap
  or horizontal overflow;
- Recent has no resting border or background.

## Scope and safety

No new graph read, polling loop, setting, persisted state, dependency, or
navigation path is introduced. The source modules remain the authority and the
checked-in `extension.js` is regenerated from them.

## Verification

- focused jsdom/DOM assertions cover the Focused/Recent hierarchy and state
  classes;
- Chromium geometry covers both compact widths and both themes;
- Chromium computed-style assertions cover the uniform neutral border, neutral
  overrun border, red elapsed value, and non-red secondary metadata;
- `npm test`, `npm run lint`, `npm run build`, `npm run verify:workflow`,
  `npm run verify:bundle`, and `git diff --check` must pass.

## Rollback

The change is isolated to the Beta.24 presentation/version/docs/test commit.
Reverting that commit restores the Beta.23 Active Work surface without touching
graph data or timing records.
