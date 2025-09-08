---
title: "Versioning Decision: Public Reset to 0.2.0"
description: "Documenting the version reset for first public release and tag governance"
author: "@architect-brooklyn"
date: "2025-09-07"
status: "accepted"
---

# Versioning Decision: Public Reset to 0.2.0 (Authoritative)

This document is the authoritative record of our version reset for the first public release of Brooklyn MCP. Earlier internal work experimented with semantic versions up to 1.6.x while MCP integration, CI, and test infrastructure matured. For public onboarding, we are returning to a 0.x track to clearly signal API evolution and stabilize community expectations.

Decision

- Adopt 0.2.0-rc.1 as the first public candidate release, followed by 0.2.0 GA after validation.
- Do not rewrite history: retain internal 1.x tags and releases for audit continuity. Mark them as “internal legacy” in release descriptions if they are visible.
- If pre-existing 0.2.x tags conflict with the new cadence:
  - If those tags were never published publicly, remove them before making the repo public to avoid confusion.
  - If they were public, prefer leaving them and updating their GitHub Release notes to “internal legacy / pre-public reset” with pointers to this document.
- Follow SemVer going forward. While 0.x allows more latitude, we will treat breaking changes with SemVer discipline and call-outs in release notes.

Operational Protocol

- Phase markers at repo root guide policy and CI gates:
  - LIFECYCLE_PHASE: alpha
  - RELEASE_PHASE: rc
- Version must be set via scripts (never hand-edit package.json):
  ```bash
  bun run version:set 0.2.0-rc.1
  bun run version:embed
  bun run check-all
  ```
- Tagging and artifacts:
  - Create an annotated tag v0.2.0-rc.1 once quality gates pass.
  - The release workflow (.github/workflows/release.yml) builds cross-platform artifacts and attaches them to the GitHub Release.

Rationale

- Communicates public maturity honestly (0.x with RC).
- Avoids history rewriting risks while maintaining a clear audit trail.
- Aligns with Fulmen ecosystem practices (see goneat ops and phase standards).

Governance Notes

- This file supersedes any prior version-reset notes and serves as the canonical record for future audits.
