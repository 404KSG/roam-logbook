# Changelog

## 0.9.0-beta.1

- Final-review safety fixes: post-write graph uncertainty stops follow-up writes,
  Resume associations require exact Session uids, and every Clock Out All entry
  point uses short-lived confirmation.
- Dashboard retains its last successful snapshot on read failure; Popover focus is
  modal and Task controls expose complete accessible names.
- Mixed legacy Pomodoro maps are backed up without dropping invalid raw entries;
  outer-shell recovery and the workflow contract are covered.

## 0.9.0-beta

- Reduced Topbar observer work to the Roam topbar seam with filtered recovery and
  stable one-second DOM updates.
- Added single-snapshot Dashboard reads, strict CLOCK timestamp diagnostics,
  orphan-session retention, and a collapsed Data issues review surface.
- Preserved versioned Pause Batch and Pomodoro state, backing up unknown/corrupt
  composite state without overwriting the source.
- Added deterministic bundle verification, final-bundle lifecycle smoke coverage,
  and required-Chromium CI layout checks.
