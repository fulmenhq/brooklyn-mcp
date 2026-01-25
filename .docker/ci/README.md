# Brooklyn MCP Local CI Runner

Local CI environment for debugging GitHub Actions workflows.

## Purpose

This local CI runner helps maintainers debug and iterate on CI issues quickly. See [CI/CD Developer Experience Principles](../../docs/development/cicd-developer-experience.md) for the philosophy behind this setup.

**Important**: This is a debugging tool, not a replacement for GitHub Actions CI. The GitHub Actions CI is the source of truth for developer experience validation.

## Quick Start

```bash
# Build the CI image
make ci-local-build

# Run quality checks (fast, no browsers)
make ci-local-quality

# Run integration tests (with browsers)
make ci-local-integration

# Full CI suite
make ci-local-full

# Interactive debugging shell
make ci-local-shell
```

## Architecture

```
.docker/ci/
  Dockerfile          # Ubuntu 24.04 with Bun, Node, goneat
  docker-compose.yml  # Service definitions for different CI stages
scripts/
  local-ci.sh         # Platform-aware runner script
```

## Image Contents

The CI image includes:

- **Ubuntu 24.04** (matches GitHub Actions ubuntu-latest)
- **Bun** (latest)
- **Node.js 22.x** (for compatibility)
- **goneat v0.5.2** (tool management)
- **Playwright dependencies** (system libraries for browser testing)

## Installation Method (Matches ci.yml)

The Dockerfile uses the **exact same installation method** as `ci.yml` and what we recommend for developers:

1. **Homebrew** for minisign (no sudo required)
2. **sfetch + goneat** trust anchor pattern
3. **goneat doctor tools** for foundation tools (ripgrep, jq, yq, prettier)

This ensures local CI validates the same DX path that developers follow.

## Services

| Service          | Description                         | Use Case             |
| ---------------- | ----------------------------------- | -------------------- |
| `ci-quality`     | Format, typecheck, lint, unit tests | Fast feedback loop   |
| `ci-integration` | Browser tests, build verification   | Full test validation |
| `ci-full`        | Complete CI pipeline                | Pre-push validation  |
| `ci-shell`       | Interactive container               | Debugging            |

## Platform Support

The runner automatically detects architecture:

- **linux/amd64** (x86_64)
- **linux/arm64** (Apple Silicon via emulation)

## Relationship to GitHub Actions

```
Developer Experience
        |
        v
[GitHub Actions CI] <-- Source of truth
        ^
        |
[Local CI Runner] <-- Debugging/iteration tool
```

The local CI runner helps fix issues in GitHub Actions, but GitHub Actions CI determines whether the actual developer experience works.

## Troubleshooting

### Platform Issues

```bash
# Force specific platform
DOCKER_DEFAULT_PLATFORM=linux/amd64 make ci-local-quality
```

### Browser Issues

Browser paths vary between Playwright versions. The `setup-test-infrastructure.ts` script handles this, but if issues occur:

```bash
# Run interactive shell
make ci-local-shell

# Inside container, check browser cache
find ~/.cache/ms-playwright -type f -name "chrome*"
```

### Tool Installation Issues

If `goneat doctor tools` fails:

```bash
# Inside container, verify goneat is available
goneat --version

# Check tool detection
goneat doctor tools --scope foundation --dry-run
```

## See Also

- [CI/CD Developer Experience Principles](../../docs/development/cicd-developer-experience.md)
- [GitHub Actions Workflow](../../.github/workflows/ci.yml)
- [goneat Tools Configuration](../../.goneat/tools.yaml)
