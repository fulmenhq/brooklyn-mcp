# Changelog

All notable changes to Brooklyn MCP will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2025-09-08

- Collapse history to sanitized tip; adopt browser-based rendering; update docs
- Use browser-based rendering for SVG→PNG
- Update native-deps types/manager; availability reflects svgo/harfbuzz only
- Rework docs for v0.2.0 strategy; provide SVGO-only guidance
- Drop extraneous externals from build pipeline
- Add .scratchpad/ to .gitignore
- Improve client guide and doctor (HTTP reminder and handshake checks)
- Remove pre-public 1.x tags locally (pre-release markers)
- Reset initial public version to 0.2.1 to align with SemVer and best practices

## [Untagged] - 2025-08-20

### Fixed

- **Playwright Version Consistency**: Fixed critical issue where MCP server and CLI commands used different Playwright versions causing browser launch failures
- **Browser Command Performance**: Browser info command no longer launches browsers for version detection, runs in <1 second
- **Cache Path Detection**: Fixed browser commands to use correct platform-specific cache paths (macOS: ~/Library/Caches/ms-playwright)
- **UTF-8 Character Issues**: Replaced problematic Unicode characters in browser status output with standard symbols
- **Integration Test Reliability**: Comprehensive cleanup of all Brooklyn services before test execution
- **Port Conflict Resolution**: Enhanced cleanup now handles all common development ports (3000, 8080, 8081, etc.)
- **Process Management**: Added cleanup for dev-mode, REPL sessions, and watch-mode processes
- **PID File Cleanup**: Comprehensive removal of stale PID files from project and user directories
- **Prepush Pipeline**: Updated test:prepush to run cleanup before full test suite

### Changed

- **Dependency Version Enforcement**: All Playwright CLI operations now use local node_modules version to match MCP server imports
- **Browser Installation Manager**: Updated to use local Playwright executable instead of external bunx/npx commands
- REPL transport mode marked as experimental, requires `--experimental` flag
- Enhanced OAuth endpoint configuration for production readiness

### Added

- **Dependency Version Consistency SOP**: Comprehensive documentation for preventing runtime vs build-time dependency version mismatches

### Enhanced

- **brooklyn cleanup --all**: Now performs 8-phase comprehensive cleanup of all Brooklyn services
- **Process Detection**: Improved detection of Brooklyn processes using pattern matching
- **Resource Management**: Better cleanup of browser processes and HTTP servers
- **Test Infrastructure**: Automated cleanup integration prevents "port already in use" errors

### Technical Improvements

- Enhanced cleanup command with comprehensive service coverage
- Improved process termination with graceful shutdown and force-kill fallback
- Better error handling and logging for cleanup operations
- More robust integration test execution environment

## [Untagged] - 2025-08-20

### Fixed

- **Prepush Pipeline**: Fixed prepush script to run complete precommit validation before tests
- **Quality Gates**: Ensures format + typecheck + lint + fast tests run before full test suite
- **Process Integrity**: Prevents incomplete validation that caused deployment issues

### Note

- v1.6.1 was orphaned due to incomplete prepush validation pipeline
- This release includes the v1.6.1 fixes plus prepush pipeline corrections

## [Untagged] - 2025-08-20 (ORPHANED)

### Fixed

- **Test Infrastructure**: Fixed Bun test file discovery conflict with vitest
- **CI/CD Pipeline**: Resolved pre-push hook failures by properly isolating Bun-specific tests
- **File Cleanup**: Removed obsolete test file after rename operation

### Technical

- **Test Organization**: Renamed Bun integration tests to `.bun-test.ts` extension to avoid vitest conflicts
- **Build Process**: Ensured clean test suite execution for release pipeline
- **Release Process**: Amended v1.6.1 to include complete test file cleanup (transparent about tag update)

## [Untagged] - 2025-08-20

### Added

- **Enterprise Authentication System**: Complete OAuth and local authentication providers with multi-provider support
- **PDF.js 4.x Integration**: Character-level text extraction with enhanced document processing capabilities
- **Interactive Element Enhancement**: Comprehensive tools for element interaction including hover, focus, and advanced selectors
- **Native Dependencies Management**: Automated dependency detection, validation, and installation system
- **Image Processing Pipeline**: SVG optimization, PNG conversion, and asset management with compression
- **Brooklyn Documentation Framework**: `brooklyn_docs` tool for extensible documentation access
- **Configuration Validation**: Comprehensive schema validation for Brooklyn configuration files
- **Transport Layer Testing**: 113 comprehensive tests achieving 70%+ coverage across HTTP, STDIO, FIFO, and Socket transports
- **Build Signatures**: Automated build tracking and git status integration
- **Asset Manifest System**: Structured asset management with YAML-based configuration

### Changed

- **Quality Governance**: Enhanced development process with mandatory pre-commit validation
- **Test Infrastructure**: Improved test categorization and infrastructure for better CI/CD reliability
- **Browser Pool Management**: Enhanced resource management and cleanup procedures
- **Tool Definitions**: Refined MCP tool schemas with better parameter validation
- **Logging System**: Structured logging with enhanced telemetry and debugging capabilities

### Fixed

- **MCP Protocol Compliance**: Resolved critical tool communication issues for complex websites
- **TypeScript Configuration**: Fixed compilation and linting errors across test infrastructure
- **SVGO Dependencies**: Resolved dependency loading issues in image processing pipeline
- **Port Management**: Improved HTTP transport port conflict resolution
- **Token Management**: Enhanced intelligent token management for large-scale content analysis

### Technical

- **Test Coverage**: Achieved 70%+ coverage across transport layer with 113 comprehensive tests
- **Quality Gates**: Zero-tolerance policy for quality gate failures implemented
- **Process Improvements**: Enhanced AI-assisted development workflow with quality-first approach
- **Dependencies**: Updated to PDF.js 4.x with improved character-level text extraction

## [Untagged] - 2025-08-16

### Added

- **First public release** - Brooklyn MCP as the "MCP Forge" for the Fulmen ecosystem
- Production-ready MCP protocol compliance (stdio & HTTP transports)
- Enterprise browser automation with Playwright integration
- Multi-team isolation and security middleware
- Comprehensive quality gates and testing infrastructure
- Complete development workflow patterns and documentation
- Fulmen forge icon and Brooklyn Bridge ASCII art branding
- Asset management structure for icons and logos
- HTTP authentication pages with forge icon integration

### Changed

- Rebranded from "Brooklyn Forge" to "Brooklyn MCP"
- Updated Bun requirement to >=1.2.0+
- Updated Fulmen ecosystem links to https://fulmenhq.dev
- Enhanced documentation for fulmenhq organization

### Technical

- Zero license conflicts - 100% MIT-compatible dependency stack
- 27 validated MCP tools with comprehensive schema compliance
- 241 passing tests with enterprise-grade quality standards
- Complete TypeScript strict mode compliance
- Structured logging with Pino integration
- Database-backed screenshot inventory management

---

**Note**: This changelog tracks changes from v0.2.1 forward. Prior pre‑public history was consolidated; pre‑public tags were removed, and relevant notes are documented under docs/ops/repository/.

## Links

- [Repository](https://github.com/fulmenhq/brooklyn-mcp)
- [Documentation](./docs/)
- [Issues](https://github.com/fulmenhq/brooklyn-mcp/issues)
- [Fulmen Ecosystem](https://fulmenhq.dev)
