# Brooklyn MCP Makefile
# Compliant with FulmenHQ Makefile Standard
# Quick Start Commands:
#   make help           - Show all available commands
#   make bootstrap      - Install dependencies and browsers
#   make test           - Run tests
#   make build          - Build CLI binary
#   make check-all      - Full quality check (lint, typecheck, test)

# Variables
VERSION := $(shell cat VERSION 2>/dev/null || echo "0.0.0")
BINARY_NAME := brooklyn

.PHONY: all help bootstrap bootstrap-force tools sync lint fmt test build build-all clean
.PHONY: version version-set version-sync version-bump-major version-bump-minor version-bump-patch
.PHONY: typecheck check-all quality precommit prepush
.PHONY: release-check release-prepare release-build
.PHONY: server-start-% server-stop-% server-status-% server-restart-% server-logs-%

# Default target
all: check-all

#
# === HELP ===
#

help: ## Show this help message
	@echo "Brooklyn MCP - Enterprise MCP Server for Browser Automation"
	@echo ""
	@echo "Version: $(VERSION)"
	@echo ""
	@echo "Required targets (FulmenHQ Makefile Standard):"
	@echo "  help              Show this help message"
	@echo "  bootstrap         Install dependencies and browsers"
	@echo "  bootstrap-force   Force reinstall all dependencies"
	@echo "  tools             Verify external tools are available"
	@echo "  sync              Sync SSOT assets (placeholder)"
	@echo "  lint              Run linting checks"
	@echo "  fmt               Format code"
	@echo "  test              Run all tests"
	@echo "  build             Build CLI binary"
	@echo "  build-all         Build multi-platform binaries"
	@echo "  clean             Remove build artifacts"
	@echo "  version           Print current version"
	@echo "  version-set       Update VERSION (VERSION=x.y.z)"
	@echo "  version-bump-*    Bump version (major/minor/patch)"
	@echo "  typecheck         Run TypeScript type checking"
	@echo "  check-all         Run all quality checks"
	@echo "  precommit         Run pre-commit hooks"
	@echo "  prepush           Run pre-push hooks"
	@echo "  release-check     Validate release readiness"
	@echo "  release-prepare   Prepare for release"
	@echo "  release-build     Build release artifacts"
	@echo ""
	@echo "Server orchestration targets:"
	@echo "  server-start-%    Start server (dev, test, prod)"
	@echo "  server-stop-%     Stop server"
	@echo "  server-status-%   Check server status"
	@echo "  server-restart-%  Restart server"
	@echo "  server-logs-%     View server logs"
	@echo ""
	@echo "Brooklyn-specific targets:"
	@echo "  test-unit         Run unit tests only"
	@echo "  test-integration  Run integration tests"
	@echo "  test-precommit    Run fast precommit tests"
	@echo "  install           Build and install CLI globally"
	@echo ""

#
# === BOOTSTRAP ===
#

bootstrap: ## Install dependencies and browsers
	@echo "Installing dependencies..."
	@bun install
	@echo "Installing browsers..."
	@bun run setup:browsers
	@echo "Setting up test infrastructure..."
	@bun run setup:test-infra
	@echo "✅ Bootstrap complete"

bootstrap-force: ## Force reinstall all dependencies
	@echo "Force reinstalling dependencies..."
	@rm -rf node_modules bun.lock
	@bun install
	@bun run setup:browsers
	@bun run setup:test-infra
	@echo "✅ Force bootstrap complete"

tools: ## Verify external tools are available
	@echo "Verifying external tools..."
	@command -v bun >/dev/null 2>&1 && echo "✅ bun: $$(bun --version)" || (echo "❌ bun not found" && exit 1)
	@command -v tsc >/dev/null 2>&1 && echo "✅ tsc: $$(bunx tsc --version)" || echo "⚠️  tsc not in PATH (using node_modules)"
	@command -v goneat >/dev/null 2>&1 && echo "✅ goneat: $$(goneat --version 2>&1 | head -n1)" || echo "⚠️  goneat not found (optional)"
	@echo "✅ Required tools verified"

sync: ## Sync SSOT assets (placeholder - tsfulmen provides role catalog)
	@echo "⚠️  Brooklyn uses tsfulmen for SSOT assets (library-first pattern)"
	@echo "   Role catalog: node_modules/@fulmenhq/tsfulmen/config/crucible-ts/"
	@echo "✅ Sync target satisfied (no local sync required)"

#
# === CODE QUALITY ===
#

lint: ## Run linting checks
	@echo "Running linting checks..."
	@bun run lint
	@echo "✅ Linting passed"

fmt: ## Format code
	@echo "Formatting code..."
	@bun run format
	@echo "✅ Code formatted"

typecheck: ## Run TypeScript type checking
	@echo "Running TypeScript type checking..."
	@bun run typecheck
	@echo "✅ Type checking passed"

check-all: ## Run all quality checks (lint, typecheck, test)
	@echo "Running all quality checks..."
	@bun run check-all
	@echo "✅ All quality checks passed"

quality: check-all build ## Run quality checks and build
	@echo "✅ Quality checks and build complete"

#
# === TESTING ===
#

test: ## Run all tests
	@echo "Running test suite..."
	@bun run test

test-unit: ## Run unit tests only
	@echo "Running unit tests..."
	@bun run test:unit

test-integration: ## Run integration tests
	@echo "Running integration tests..."
	@bun run test:integration

test-precommit: ## Run fast precommit tests
	@echo "Running precommit tests..."
	@bun run test:precommit

test-coverage: ## Run tests with coverage
	@echo "Running tests with coverage..."
	@bun run test:coverage

#
# === BUILD ===
#

build: ## Build CLI binary
	@echo "Building $(BINARY_NAME) $(VERSION)..."
	@bun run build
	@echo "✅ Build complete"

build-all: ## Build multi-platform binaries
	@echo "Building $(BINARY_NAME) $(VERSION) for all platforms..."
	@bun run build:all
	@echo "✅ Multi-platform build complete"

install: ## Build and install CLI globally
	@echo "Building and installing $(BINARY_NAME)..."
	@bun run install
	@echo "✅ Installation complete"

clean: ## Remove build artifacts
	@echo "Cleaning build artifacts..."
	@rm -rf dist/ bin/ coverage/ .nyc_output/
	@rm -f *.tsbuildinfo
	@echo "✅ Clean complete"

#
# === VERSION MANAGEMENT ===
#

version: ## Print current version
	@echo "$(VERSION)"

version-set: ## Update VERSION (usage: make version-set VERSION=x.y.z)
	@if [ -z "$(VERSION)" ] || [ "$(VERSION)" = "$$(cat VERSION)" ]; then \
		echo "Usage: make version-set VERSION=x.y.z"; \
		exit 1; \
	fi
	@echo "$(VERSION)" > VERSION
	@bun run version:sync
	@echo "✅ Version set to $(VERSION)"

version-sync: ## Sync VERSION to package.json and source files
	@echo "Syncing version..."
	@bun run version:sync
	@bun run version:embed
	@echo "✅ Version synced"

version-bump-major: ## Bump major version
	@echo "Bumping major version..."
	@bun run version:bump:major
	@echo "✅ Version bumped to $$(cat VERSION)"

version-bump-minor: ## Bump minor version
	@echo "Bumping minor version..."
	@bun run version:bump:minor
	@echo "✅ Version bumped to $$(cat VERSION)"

version-bump-patch: ## Bump patch version
	@echo "Bumping patch version..."
	@bun run version:bump:patch
	@echo "✅ Version bumped to $$(cat VERSION)"

#
# === HOOKS ===
#

precommit: ## Run pre-commit hooks
	@echo "Running pre-commit checks..."
	@bun run precommit
	@echo "✅ Pre-commit checks passed"

prepush: ## Run pre-push hooks
	@echo "Running pre-push checks..."
	@bun run prepush
	@echo "✅ Pre-push checks passed"

#
# === RELEASE ===
#

release-check: check-all ## Validate release readiness
	@echo "Checking release readiness..."
	@if [ ! -f VERSION ]; then echo "❌ VERSION file missing"; exit 1; fi
	@if [ ! -f CHANGELOG.md ]; then echo "⚠️  CHANGELOG.md missing (recommended)"; fi
	@bun run release:validate
	@echo "✅ Release checks passed"

release-prepare: check-all version-sync ## Prepare for release
	@echo "Preparing release $(VERSION)..."
	@echo "✅ Release prepared"

release-build: build-all ## Build release artifacts
	@echo "Building release artifacts for $(VERSION)..."
	@bun run package:all
	@echo "✅ Release artifacts ready"

#
# === SERVER ORCHESTRATION ===
#

server-start-%: ## Start server in specified mode (dev, test, prod)
	@echo "Starting Brooklyn server in $* mode..."
	@bun run server:start -- --mode $*

server-stop-%: ## Stop server in specified mode
	@echo "Stopping Brooklyn server in $* mode..."
	@bun run server:stop -- --mode $*

server-status-%: ## Check server status in specified mode
	@echo "Checking Brooklyn server status ($* mode)..."
	@bun run server:status -- --mode $*

server-restart-%: server-stop-% server-start-% ## Restart server
	@echo "✅ Server restarted in $* mode"

server-logs-%: ## View server logs for specified mode
	@echo "Viewing Brooklyn server logs ($* mode)..."
	@bun run server:logs -- --mode $*
