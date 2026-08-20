# Beta 62 Adaptive Activity Bars

## Goal

Make the Activity chart use its available horizontal space instead of leaving wide gaps around fixed-width bars. A seven-day view should feel full, while a one-bucket view should produce a broad summary bar. Dense 24-hour and 30-day views must remain readable and must not overflow the Dashboard.

## Design

Keep the existing equal-width bucket grid because it preserves date alignment and keyboard navigation. Replace the fixed pixel bar width with a density contract made of:

- a percentage of the current bucket slot;
- a minimum width for sparse desktop views;
- a maximum width that prevents a single bar from becoming an edge-to-edge slab;
- compact caps for 24-hour and 30-day ranges.

The model will expose these values through the existing Activity density object. The renderer will pass them as CSS custom properties, and CSS will resolve the final width from the live bucket width. This gives the chart responsive behavior without JavaScript layout reads, resize listeners, or additional Roam queries.

Recommended density behavior:

- one to three buckets: broad bars that occupy most of each slot;
- seven days: bars occupy roughly half of each date slot, visibly wider than the current 42px cap;
- 24 hours: compact bars that still fit narrow dialogs;
- 30 days: narrow bars with the existing readability and overflow guarantees;
- all-time month/year views: scale between the sparse and dense rules according to bucket count.

## Verification

Add model assertions for the responsive density contract and browser geometry tests for one-bucket, seven-day, 24-hour, and 30-day layouts. Tests must confirm that seven-day and one-bucket bars expand, dense ranges keep their caps, dates remain centered, and neither the chart nor dialog gains horizontal overflow.
