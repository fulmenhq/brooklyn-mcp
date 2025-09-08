---
title: "Tag Cleanup Prior to Public Release"
status: "planned"
---

# Tag Cleanup Prior to Public Release

Before the first public release, we removed local `v1.x` tags created during
pre‑public development. These tags do not reflect the public release sequence
and could mislead downstream consumers.

## What Changed

- Deleted local `v1.*` tags (pre‑public, pre‑release markers).
- Reset initial public version to `0.2.1` to align with SemVer and internal
  maturity assessment.

## Rationale

- Maintain a coherent version narrative for the public lifecycle.
- Prevent confusion around historical “1.x” identifiers that are not part of
  the public roadmap.

## Operational Notes

- Tag deletions were local only at this stage (no push).
- Version reset is documented in release notes and project metadata.
