# Release Notes

Latest releases for Brooklyn MCP. For full history, see [CHANGELOG.md](CHANGELOG.md).

## [0.3.4] - 2026-02-17

**Release Type**: Patch Release - Windows Support & Standalone Binaries

### Highlights

- **Standalone Binaries**: Release assets are now self-contained executables (~60-120MB) compiled with `bun build --compile`. No Bun runtime required
- **Windows Fix**: Previous releases shipped ~3MB JS bundles that required Bun to run. Now produces real PE32+ executables that work out of the box
- **Native Matrix Builds**: 5-platform parallel CI builds on native runners (no cross-compilation)
- **Platform Changes**: Dropped Darwin Intel (x64). Added Windows ARM64 and Linux ARM64 native runners
- **Test Isolation**: Integration tests no longer kill the developer's running MCP server

### Quality Metrics

- **Tests**: 799 passing, 13 skipped
- **Tools**: 82
- **Lint Health**: 98% (1 info-level shellcheck note)

[Full Release Notes](docs/releases/v0.3.4.md)

---

## [0.3.3] - 2026-02-15

**Release Type**: Feature Release - SaaS Dashboard Unlock

### Highlights

- **Auth-Gated Browsing**: `extraHttpHeaders` on `launch_browser` injects Authorization, API keys, and custom headers into every browser request. Env var fallback via `BROOKLYN_HTTP_HEADERS`
- **Network Inspector**: `inspect_network` captures recent HTTP requests/responses with sensitive header redaction by default. Raw access gated behind env flag + audit log
- **Table Extraction**: `extract_table_data` parses HTML tables into JSON/CSV with rowspan/colspan handling
- **Paginated Collection**: `paginate_table` auto-clicks through multi-page tables, collecting and deduplicating rows
- **npm OIDC Publishing**: Keyless npm publish via GitHub Actions OIDC trusted publishing (no npm tokens)
- **Security**: Debug log sanitization prevents header value leakage at any log level

### Quality Metrics

- **Tests**: 799 passing, 13 skipped
- **Tools**: 82 (3 new + 1 schema extension)
- **Lint Health**: 100%

[Full Release Notes](docs/releases/v0.3.3.md)

---

## [0.3.2] - 2026-02-01

**Release Type**: Patch Release - Security & Test Stability

### Highlights

- **Security**: Vitest 4.0.18 upgrade eliminates 94 Go stdlib CVEs from esbuild dependency chain
- **Test Stability**: stdout-purity tests now pass reliably in full suite with sysprims-backed cleanup
- **Process Management**: Tree-safe termination via sysprims integration for server operations
- **CI Hardening**: Browser version validation prevents Playwright revision drift

### Quality Metrics

- **Tests**: 1241 passing, 103 skipped
- **Vulnerabilities**: 0 findings (down from 94)
- **Lint Health**: 100%

[Full Release Notes](docs/releases/v0.3.2.md)

---

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

## Archive

Full release notes for all versions are maintained in [docs/releases/](docs/releases/).

## Links

- [Changelog](CHANGELOG.md)
- [Repository](https://github.com/fulmenhq/brooklyn-mcp)
- [Documentation](./docs/)
