---
title: "Release Checklist (Brooklyn MCP)"
description: "Requirements and steps for preparing a public release"
status: "draft"
---

# Release Checklist

This checklist must be satisfied before tagging and publishing a release.

## Pre‑Release Preparation

### Code Quality

- [ ] Tests Passing: `bun run test`
- [ ] Formatting: `bun run format:code`
- [ ] Linting: `bun run lint`
- [ ] Typecheck: `bun run typecheck`
- [ ] Build Success: `bun run build:legacy`

### Version Management

- [ ] VERSION file set correctly (SemVer, prerelease allowed)
- [ ] Version embedded: `bun run version:embed`
- [ ] Release notes updated under `docs/ops/release/notes/`

### Cross‑Platform Builds

- [ ] Local packaging (current platform): `bun run build:artifacts:local`
- [ ] CI artifact matrix (on tag) verified in `.github/workflows/release.yml`

### Documentation

- [ ] README status (Lifecycle/Release phase) up‑to‑date
- [ ] Ops/docs and user guides current

### Licensing Compliance

- [ ] License inventory generated: `bun run license:scan`
- [ ] Strict policy clean for GA: `bun run license:scan:strict`
- [ ] Attach `dist/licenses/THIRD_PARTY_NOTICES.md` to the release

## Release Execution

### Git Operations

- [ ] Version commit
- [ ] Annotated tag created: `git tag -a vX.Y.Z[-rc.N]`

### GitHub Release

- [ ] Release created with the tag
- [ ] Release notes included
- [ ] Artifacts uploaded by CI (zip/tar.gz + SHA256SUMS)

## Post‑Release Validation

- [ ] All artifacts download successfully
- [ ] Binary functional on target platforms

## Policies and References

- OSS Policies (authoritative): https://github.com/3leaps/oss-policies/
- License review process: `docs/ops/compliance/license-review.md`
- Operational SOPs: `docs/ops/repository/`, `docs/ops/release/`
