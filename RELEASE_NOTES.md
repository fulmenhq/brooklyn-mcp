# Release Notes

Latest releases for Brooklyn MCP. For full history, see [CHANGELOG.md](CHANGELOG.md).

## [0.3.1] - 2026-01-21

**Release Type**: Patch Release - Signing Workflow & Dependency Updates

### Highlights

- **Release Signing Workflow**: Finalized FulmenHQ signing process with new Makefile targets
- **Dependency Updates**: 10 packages updated (patch/minor, no breaking changes)
- **TypeScript Fix**: Compatibility with @types/bun 1.3.6
- **Browser Detection Fix**: Fixed Playwright path detection for Apple Silicon and new Chromium naming (`Google Chrome for Testing.app`)

### Quality Metrics

- **Tests**: 776 passing, 13 skipped
- **Vulnerabilities**: 0 findings (115 packages scanned)

[Full Release Notes](docs/releases/v0.3.1.md)

---

## [0.3.0] - 2026-01-16

**Release Type**: Feature Release - HTTP Transport Hardening

### Highlights

- **HTTP Auth Guard**: Streamable HTTP transport now enforces configurable auth modes (`required`, `localhost`, `disabled`) with bearer validation
- **CLI Flags**: `brooklyn web start` and `brooklyn mcp dev-http` expose `--auth-mode` plus environment variables
- **goneat DX Integration**: Migrated from husky to goneat hooks, integrated goneat assess for lint/format targets
- **Multi-Client Support**: Verified compatibility with Claude Code, OpenCode, Kilocode, and Codex CLI (rmcp)
- **HTTP Transport Fixes**: Session ID UUID format, 202 status for notifications/DELETE, reliable health checks

### Breaking Changes

- `brooklyn web start` now defaults to `--auth-mode required`. Use `--auth-mode localhost` for local development or `--auth-mode disabled` for CI.

[Full Release Notes](docs/releases/v0.3.0.md)

---

## [0.2.3] - 2025-11-19

**Release Type**: Minor Release - Dependency Updates & Protocol Compliance

### Highlights

- **Logging Stack**: Upgraded pino v9 → v10.1.0 and pino-pretty v11 → v13.1.2
- **CLI Tooling**: Upgraded inquirer v9 → v13.0.1
- **Protocol Compliance**: Pinned dotenv to v16.6.1 (v17.x violates MCP stdout purity)

### Quality Metrics

- **Tests**: 768 total (755 passing)
- **MCP Stdout Purity**: 4/4 passing

[Full Release Notes](docs/releases/v0.2.3.md)

---

## Archive

Full release notes for all versions are maintained in [docs/releases/](docs/releases/).

## Links

- [Changelog](CHANGELOG.md)
- [Repository](https://github.com/fulmenhq/brooklyn-mcp)
- [Documentation](./docs/)
