---
title: "Pre-Public History Rewrite Notice"
status: "planned"
---

# Pre‑Public History Rewrite Notice

Before the first public release, we collapsed internal commit history to remove
references to deprecated native image processing libraries with incompatible
licensing. This was a history-only operation; the resulting tip reflects the
current, fully‑sanitized implementation that uses browser‑based rendering.

## What Changed

- Collapsed the commit range starting after the clean base into one consolidated
  commit representing the current state (sanitized tip).
- Removed pre‑public 1.x tags locally to avoid publishing inaccurate version
  markers; initial public version is reset to `0.2.1`.

## Transparency Markers

- Preserved base (clean parent of first‑introduction):
  - `fd09dd06b5c70adf37eb05a5e51b95a9f3970522`
- Consolidated tip (post‑collapse):
  - Will be generated during the collapse step; see git log for the most recent
    consolidated commit.

## Rationale

- Align public history with current architecture (browser‑based rendering).
- Avoid exposing references to deprecated native image processing libraries.
- Ensure licensing clarity and simplify future maintenance.

## Operational Notes

- This adjustment occurred prior to making the repository public.
- No brand names are referenced in public documentation.
- Internal discovery artifacts are under `rewrite/` for maintainers.
