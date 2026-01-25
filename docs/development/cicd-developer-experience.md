# CI/CD Developer Experience Principles

**Status**: Active
**Owner**: QA, ProdMktg, CICD roles (shared responsibility)
**Last Updated**: 2025-01-25

## Overview

This document defines the principles governing CI/CD workflows in Brooklyn MCP. These principles ensure that our CI/CD serves its primary purpose: **enabling developers to clone the repo and get up and running without friction**.

## Core Principles

### Principle 1: CI as Developer Experience Indicator

> **The CI workflow (`ci.yml`) must be an accurate indicator that developers can clone our repo and follow our instructions to get up and going without friction using common tools and not requiring sudo/root access.**

#### What This Means

- **No workarounds**: If the CI job fails, it's because something in the developer experience is broken. We fix the root cause, not the CI.
- **Common tools only**: CI must succeed using tools that developers can install without special access (no sudo/root required).
- **Reproducible locally**: A developer should be able to run the same commands locally and get the same results.
- **Trust-anchor pattern**: Tool installation uses sfetch + goneat, not system package managers requiring elevated privileges.

#### Anti-Patterns

- Modifying CI to work around a tool installation issue instead of fixing the underlying DX
- Using `apt-get` or other package managers that require sudo in CI when developers won't have sudo locally
- Adding CI-only environment variables or flags that mask real developer experience issues
- Making CI pass by skipping checks that would fail for a real developer

#### Examples

```yaml
# GOOD: Uses goneat doctor tools (userspace, works for developers)
- name: Install foundation tools (goneat doctor)
  run: goneat doctor tools --scope foundation --install --yes

# BAD: Uses apt-get (requires sudo, doesn't reflect developer experience)
- name: Install tools
  run: sudo apt-get install -y ripgrep yq jq
```

### Principle 2: Local CI for Debugging Frontline Runners

> **The optional local CI environment exists to improve the reliability of our `ci.yml` and other GitHub Actions workflows. It may use different images or mechanisms if it serves the purpose of quickly resolving issues with the frontline GitHub runners.**

#### What This Means

- **Debugging tool, not replacement**: Local CI helps diagnose issues, but the GitHub Actions CI is the source of truth.
- **Different constraints are OK**: Local CI can use pre-configured images (like `goneat-tools-glibc`) for faster iteration.
- **Rapid feedback**: Local CI should be fast enough to iterate on fixes before pushing to GitHub.
- **Not customer-facing**: Local CI is for maintainers, not the standard developer workflow.

#### When to Use Local CI

| Use Case                 | Local CI    | GitHub Actions         |
| ------------------------ | ----------- | ---------------------- |
| Debugging CI failures    | Yes         | After fix verified     |
| Testing workflow changes | Yes (first) | Yes (final validation) |
| Developer onboarding     | No          | Yes (source of truth)  |
| Release validation       | Optional    | Required               |

#### Local CI Images

The local CI environment may use curated images that have tools pre-installed:

```dockerfile
# Local CI can use pre-configured images for speed
# TODO: Consider basing on ghcr.io/fulmenhq/goneat-tools-glibc
FROM ubuntu:24.04
```

This is acceptable because:

1. The local CI is for maintainer debugging, not developer experience validation
2. The GitHub Actions CI remains the source of truth for DX
3. Pre-configured images accelerate CI debugging cycles

## Browser Testing Considerations

Browser dependencies (Playwright, Chromium) are inherently brittle across platforms:

### Path Detection Challenges

- **macOS**: Different paths for arm64 (Apple Silicon) vs Intel
- **Linux**: Path structure varies between Playwright versions
- **Windows**: Different executable locations and naming

### Our Approach

1. **Multiple fallback paths**: Check several known locations for browser executables
2. **Clear error messages**: When browsers aren't found, provide actionable instructions
3. **Preflight checks**: Verify browsers before running tests, not during
4. **Platform-aware detection**: Handle each platform's quirks explicitly

### CI Debug Output

When browser detection fails, CI outputs diagnostic information:

```yaml
- name: Debug Playwright cache
  run: |
    find ~/.cache/ms-playwright -maxdepth 3 -type d 2>/dev/null || true
    find ~/.cache/ms-playwright -name "chrome" -type f 2>/dev/null || true
```

## Tool Installation Philosophy

### Trust Anchor Pattern

```
sfetch (signed) -> goneat (signed) -> foundation tools (verified)
```

- **sfetch**: Secure fetch with minisign signature verification
- **goneat**: Manages tool installation via `goneat doctor tools`
- **Userspace installation**: No sudo required (uses brew on Linux, not apt)

### Why Brew on Linux?

```yaml
# tools.yaml
installer_priority:
  linux:
    - brew # Userspace, no sudo required
```

Homebrew on Linux (Linuxbrew) installs to `~/.linuxbrew`, requiring no elevated privileges. This matches developer experience where users may not have root access.

## Role Responsibilities

| Role         | CI/CD Responsibility                                                           |
| ------------ | ------------------------------------------------------------------------------ |
| **QA**       | Validate that CI tests reflect real developer experience; report DX issues     |
| **ProdMktg** | Ensure onboarding documentation matches CI requirements; validate DX claims    |
| **CICD**     | Maintain CI workflows; ensure Principle 1 compliance; provide local CI tooling |

### Shared Accountability

All three roles share responsibility for Developer Experience (DX):

1. **QA validates**: "Can a new developer actually follow these steps?"
2. **ProdMktg communicates**: "Is our getting-started documentation accurate?"
3. **CICD implements**: "Does our CI reflect real-world developer workflows?"

## Compliance Checklist

Before merging CI/CD changes:

- [ ] CI passes without sudo/root workarounds
- [ ] All tools installed via goneat doctor (trust anchor pattern)
- [ ] Local reproduction steps documented if complex
- [ ] Browser detection handles platform variations
- [ ] Error messages provide actionable developer guidance
- [ ] Changes tested with local CI runner (if available)

## Related Documents

- [goneat Tools Configuration](../../.goneat/tools.yaml)
- [GitHub Actions Workflow](../../.github/workflows/ci.yml)
- [Local CI Docker Setup](../../.docker/ci/README.md)
- [Test Categorization Guide](../testing/test-categorization-guide.md)

## Revision History

| Date       | Change                                          | Author    |
| ---------- | ----------------------------------------------- | --------- |
| 2025-01-25 | Initial version documenting CI/CD DX principles | CICD role |
