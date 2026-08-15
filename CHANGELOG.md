# Changelog

## 0.9.0-beta

- Reduced Topbar observer work to the Roam topbar seam with filtered recovery and
  stable one-second DOM updates.
- Added single-snapshot Dashboard reads, strict CLOCK timestamp diagnostics,
  orphan-session retention, and a collapsed Data issues review surface.
- Preserved versioned Pause Batch and Pomodoro state, backing up unknown/corrupt
  composite state without overwriting the source.
- Added deterministic bundle verification, final-bundle lifecycle smoke coverage,
  and required-Chromium CI layout checks.
