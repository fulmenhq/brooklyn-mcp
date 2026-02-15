# Changelog

All notable changes to Brooklyn MCP will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.3] - 2026-02-15

### Added

- **Auth-Gated Browsing**: `extraHttpHeaders` parameter on `launch_browser` injects custom HTTP headers (Authorization, API keys) into every browser request for accessing authenticated SaaS dashboards and enterprise apps
- **Environment Variable Fallback**: `BROOKLYN_HTTP_HEADERS` env var (JSON string) provides process-local header injection without passing secrets via MCP params
- **`inspect_network` Tool**: Captures and inspects recent HTTP requests/responses with sensitive header redaction. Supports URL pattern and method filtering. Raw header access gated behind `BROOKLYN_FULL_HEADER_SUPPORT=true` env var with audit logging
- **`extract_table_data` Tool**: Extracts structured data from HTML tables into JSON or CSV, handling `rowspan`/`colspan` merging
- **`paginate_table` Tool**: Automatically paginates multi-page tables by clicking a next button, collecting and deduplicating rows across pages
- **npm OIDC Publish Workflow**: GitHub Actions workflow for keyless npm publishing via OpenID Connect

### Fixed

- **Tool Dispatch Registration**: Added `extract_table_data`, `inspect_network`, and `paginate_table` to `isCoreTools` dispatch gate. Tools were defined and routed but missing from the gate array, causing "Tool not found" errors via HTTP transport

### Security

- **Header Redaction**: Baseline redaction of Authorization, Cookie, Set-Cookie, Proxy-Authorization, X-API-Key, and X-Auth-Token in all `inspect_network` output and log output
- **Debug Log Sanitization**: Tool call args containing `extraHttpHeaders` are sanitized before writing to debug logs, preventing header value leakage at any log level

### Documentation

- **Auth-Gated Browsing Guide**: New `docs/user-guide/auth-headers.md` covering header injection, env var setup, inspect_network verification, and authbolt integration
- **Hello Brooklyn Update**: Added auth-gated browsing quick start section and updated tool inventory for v0.3.3

## [0.3.2] - 2026-02-01

### Security

- **Vitest 4.0.18 Upgrade**: Eliminated 94 Go stdlib CVEs from esbuild dependency chain (vite 7.x, esbuild compiled with Go 1.25.5)

### Fixed

- **stdout-purity Test Stability**: Fixed intermittent test failures with ID-based stdin closure and sysprims-backed cleanup
- **Process Management**: Hardened stop flows and PID file handling with graceful shutdown
- **CI Workflow**: Resolved yamllint long lines and shellcheck SC2010 warnings

### Added

- **sysprims Integration**: Tree-safe process termination (`terminateTree`), structured process discovery, port-to-PID attribution
- **Browser Version Validation**: CI validation and unit tests for Playwright browser revision consistency
- **Vitest Workspace**: Process-spawning tests isolated in dedicated project with `maxWorkers: 1`

### Changed

- **Vitest 4.x Migration**: `poolOptions.forks.singleFork` → top-level `maxWorkers: 1`; arrow function constructor mocks → function syntax
- **Documentation**: Consolidated decision records into `docs/decisions/`

## [0.3.1] - 2026-01-21

### Added

- **Release Signing Workflow**: Finalized FulmenHQ signing process with `release-notes` and `release-verify-keys` Makefile targets
- **Safety Scripts**: Added `scripts/verify-gpg-public-key.sh` and `scripts/verify-minisign-public-key.sh` to prevent accidental secret key exports

### Changed

- **Environment Variables**: Standardized on `BROOKLYN_RELEASE_TAG` prefix (was `RELEASE_TAG`)
- **Documentation**: Added Ghostty terminal TERM workaround for macOS signing

### Updated

- `@modelcontextprotocol/sdk` 1.25.2 → 1.25.3
- `pino` 10.1.0 → 10.2.1, `pino-pretty` 13.1.2 → 13.1.3
- `playwright` 1.56.1 → 1.57.0
- `yaml` 2.3.4 → 2.8.2
- `@biomejs/biome` 2.3.10 → 2.3.11
- `@types/bun` → 1.3.6, `@types/node` → 25.0.9
- `inquirer` 13.0.1 → 13.2.1, `prettier` 3.0.0 → 3.8.0

### Fixed

- **TypeScript**: Fixed `Server<unknown>` type for `@types/bun` 1.3.6 compatibility
- **Browser Detection**: Fixed Playwright browser path detection for Apple Silicon Macs (`chrome-mac-arm64`) and new Chromium naming convention (`Google Chrome for Testing.app` vs legacy `Chromium.app`)
- **DX**: Added `setup:browsers:force` script to force reinstall corrupted browser installations; updated error messages to guide users to the correct recovery command

## [0.3.0] - 2026-01-16

### Added

- **HTTP Auth Guard**: Streamable HTTP transport now enforces configurable auth modes (`required`, `localhost`, `disabled`) with bearer validation, trusted proxy handling, and request context propagation into `SecurityMiddleware`.
- **CLI Flags**: `brooklyn web start` and `brooklyn mcp dev-http` expose `--auth-mode` plus `BROOKLYN_HTTP_AUTH_MODE`/`BROOKLYN_HTTP_TRUSTED_PROXIES` env vars so deployments can toggle requirements without code changes.
- **goneat DX Integration**: Migrated from husky to goneat hooks system, integrated goneat assess for lint and format targets.
- **Testing**: Unit specs cover guard logic and transport metadata, and a new integration test verifies 401 vs 200 flows for the HTTP transport.
- **Multi-Client Support**: Verified compatibility with Claude Code, OpenCode, Kilocode, and Codex CLI (rmcp) MCP clients.

### Fixed

- **MCP Session Management**: Fixed session ID generation to use proper UUID format for protocol compliance.
- **HTTP Transport Notifications**: Changed notification responses from 204 to 202 Accepted per MCP Streamable HTTP spec.
- **HTTP DELETE Handling**: Session termination DELETE requests now return 202 Accepted instead of 405.
- **CLI Health Check**: Fixed `brooklyn web status` health check to use Node.js native `http` module instead of Bun's `fetch` for reliable compiled binary operation.

### Changed

- **Release Notes Structure**: Reorganized release notes from `docs/ops/release/notes/` to `docs/releases/` for ecosystem alignment. Added `RELEASE_NOTES.md` at root with latest 3 releases. Pruned CHANGELOG to stable releases only (RC history preserved in git).

### Documentation

- **Auth Modes**: README, `docs/user-guide/brooklyn-cli.md`, and `docs/development/http-mode-api.md` describe auth modes, local bypass guidance, and trusted proxy env vars.
- **Client Config Examples**: `docs/deployment/mcp-configuration.md` now includes concrete `.mcp.json`, `opencode.json`, and Codex TOML snippets for HTTP/STDIO setups.
- **Release Notes**: Full release notes now maintained in `docs/releases/v<semver>.md`.

## [0.2.3] - 2025-11-19

### Dependency Updates

- **Logging Stack**: Upgraded `pino` from v9 to v10.1.0 and `pino-pretty` from v11 to v13.1.2 for improved logging performance and type safety
- **CLI Tooling**: Upgraded `inquirer` from v9 to v13.0.1 for better interactive prompts in CLI commands
- **dotenv Pinned**: Pinned `dotenv` to v16.6.1 (exact version) due to stdout purity issues in v17.x that violate MCP protocol requirements

### Fixed

- **MCP Stdout Purity**: Prevented dotenv v17.x upgrade that would have polluted stdout with package information, breaking JSON-RPC protocol compliance
- **Build Process**: Fixed CLI binary testing to use local `./dist/brooklyn` instead of globally installed version, preventing confusing ENOENT errors during development

### Documentation

- **Package Dependencies**: Added `docs/architecture/notes/package-dependencies-special-handling.md` to document dependencies requiring special version constraints
- **Planning**: Added comprehensive feature briefs for v0.3.0 MCP SDK upgrade and vitest v4 upgrade

### Technical Details

- All quality gates passing: format, typecheck, lint, tests (755 passing)
- MCP stdout purity tests: 4/4 passing with dotenv v16.6.1
- Full test suite execution time: ~87 seconds

## [0.2.2] - 2025-11-17

### Major Improvements

- **Windows CI Compatibility**: Achieved full cross-platform CI/CD pipeline stability across Ubuntu, macOS, and Windows
- **Developer Experience**: Streamlined quality gates and validation processes for faster development cycles
- **Browser Automation Reliability**: Resolved critical browser process management issues in headless CI environments

### Fixed

- **Headless Windows CI Hang**: Added critical GPU-related flags (`--disable-gpu`, `--disable-software-rasterizer`, `--disable-gpu-compositing`) to prevent Chromium hanging on headless Windows CI environments
- **Windows Test Timeouts**: Fixed critical timeout mismatches causing Windows CI to hang during test execution
- **Browser Process Deadlock**: Resolved `Promise.race()` deadlock in browser-instance.ts that left zombie browser processes
- **Windows Line Endings**: Added `.gitattributes` file to ensure consistent line endings across platforms
- **Windows Build Dependencies**: Fixed missing `zip` and `shasum` tools on Windows CI by installing via Scoop

### Enhanced

- **Precommit Test Configuration**: Updated to use Windows-aware timeouts (4 minutes vs 15 seconds)
- **Browser Headless Mode**: Added explicit `--headless=new` flag for Windows Chromium to prevent window popups
- **Test Fork Configuration**: Enforced single fork execution on Windows CI to prevent browser process deadlocks
- **Process Termination**: Replaced unreliable `Promise.race()` pattern with controlled timeout mechanism
- **Cross-Platform Process Management**: Enhanced instance manager error handling for Windows process cleanup

### Impact

- All three platforms (Ubuntu, macOS, Windows) now pass CI successfully
- Pre-push validation completes reliably on all platforms
- Tag push operations complete successfully across all environments

## [0.2.1] - 2025-09-08

### Changed

- Collapse history to sanitized tip; adopt browser-based rendering; update docs
- Use browser-based rendering for SVG to PNG
- Update native-deps types/manager; availability reflects svgo/harfbuzz only
- Rework docs for v0.2.0 strategy; provide SVGO-only guidance
- Drop extraneous externals from build pipeline
- Add .scratchpad/ to .gitignore
- Improve client guide and doctor (HTTP reminder and handshake checks)
- Remove pre-public 1.x tags locally (pre-release markers)
- Reset initial public version to 0.2.1 to align with SemVer and best practices

---

**Note**: This changelog tracks stable releases from v0.2.1 forward. Release candidate history (rc.1 through rc.18 for v0.2.2) is preserved in git history. Full release notes for each version are maintained in [docs/releases/](docs/releases/).

## Links

- [Release Notes](RELEASE_NOTES.md)
- [Repository](https://github.com/fulmenhq/brooklyn-mcp)
- [Documentation](./docs/)
- [Issues](https://github.com/fulmenhq/brooklyn-mcp/issues)
- [Fulmen Ecosystem](https://fulmenhq.dev)
