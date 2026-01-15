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

# DX Tooling (trust anchor pattern)
# goneat is installed via sfetch -latest if not already present
# No version pinning - use whatever is installed on the system

# User-space bin dir (overridable with BINDIR=...)
# Defaults: macOS/Linux: $HOME/.local/bin, Windows: $USERPROFILE/bin
BINDIR ?=
BINDIR_RESOLVE = \
	BINDIR="$(BINDIR)"; \
	if [ -z "$$BINDIR" ]; then \
		OS_RAW="$$(uname -s 2>/dev/null || echo unknown)"; \
		case "$$OS_RAW" in \
			MINGW*|MSYS*|CYGWIN*) \
				if [ -n "$$USERPROFILE" ]; then \
					if command -v cygpath >/dev/null 2>&1; then \
						BINDIR="$$(cygpath -u "$$USERPROFILE")/bin"; \
					else \
						BINDIR="$$USERPROFILE/bin"; \
					fi; \
				elif [ -n "$$HOME" ]; then \
					BINDIR="$$HOME/bin"; \
				else \
					BINDIR="./bin"; \
				fi ;; \
			*) \
				if [ -n "$$HOME" ]; then \
					BINDIR="$$HOME/.local/bin"; \
				else \
					BINDIR="./bin"; \
				fi ;; \
		esac; \
	fi

# sfetch resolution (trust anchor)
SFETCH_RESOLVE = \
	$(BINDIR_RESOLVE); \
	SFETCH=""; \
	if [ -x "$$BINDIR/sfetch" ]; then SFETCH="$$BINDIR/sfetch"; fi; \
	if [ -z "$$SFETCH" ]; then SFETCH="$$(command -v sfetch 2>/dev/null || true)"; fi

# goneat resolution
GONEAT_RESOLVE = \
	$(BINDIR_RESOLVE); \
	GONEAT=""; \
	if [ -x "$$BINDIR/goneat" ]; then GONEAT="$$BINDIR/goneat"; fi; \
	if [ -z "$$GONEAT" ]; then GONEAT="$$(command -v goneat 2>/dev/null || true)"; fi

.PHONY: all help bootstrap bootstrap-force bootstrap-dx hooks-ensure tools sync lint fmt test build build-all clean
.PHONY: version version-set version-sync version-bump-major version-bump-minor version-bump-patch
.PHONY: typecheck check-all quality precommit prepush
.PHONY: release-check release-prepare release-build
.PHONY: server-start-dev server-start-prod server-stop server-status server-restart server-logs

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
	@echo "  bootstrap-dx      Install DX tools (sfetch, goneat)"
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
	@echo "  server-start-dev  Start development server"
	@echo "  server-start-prod Start production server"
	@echo "  server-stop       Stop server"
	@echo "  server-status     Check server status"
	@echo "  server-restart    Restart production server"
	@echo "  server-logs       View server logs"
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

bootstrap: bootstrap-dx ## Install dependencies and browsers
	@echo "Installing dependencies..."
	@bun install
	@echo "Installing browsers..."
	@bun run setup:browsers
	@echo "Setting up test infrastructure..."
	@bun run setup:test-infra
	@$(MAKE) hooks-ensure
	@echo "✅ Bootstrap complete"

hooks-ensure: ## Ensure git hooks are installed (idempotent)
	@$(GONEAT_RESOLVE); \
	if [ -d ".git" ] && [ -n "$$GONEAT" ]; then \
		if [ ! -x ".git/hooks/pre-commit" ] || ! grep -q "goneat" ".git/hooks/pre-commit" 2>/dev/null; then \
			echo "🔗 Installing git hooks with goneat..."; \
			$$GONEAT hooks install 2>/dev/null || true; \
		fi; \
	fi

bootstrap-force: ## Force reinstall all dependencies
	@echo "Force reinstalling dependencies..."
	@rm -rf node_modules bun.lock
	@bun install
	@bun run setup:browsers
	@bun run setup:test-infra
	@echo "✅ Force bootstrap complete"

bootstrap-dx: ## Install DX tools via trust anchor (sfetch -> goneat)
	@echo "🔧 Installing DX tools via trust anchor pattern..."
	@$(SFETCH_RESOLVE); \
	if [ -z "$$SFETCH" ]; then \
		echo "❌ sfetch not found (required trust anchor)."; \
		echo ""; \
		echo "Install sfetch, verify it, then re-run bootstrap-dx:"; \
		echo "  curl -sSfL https://github.com/3leaps/sfetch/releases/latest/download/install-sfetch.sh | bash"; \
		echo "  sfetch --self-verify"; \
		echo ""; \
		exit 1; \
	fi
	@echo "→ sfetch self-verify (trust anchor):"
	@$(SFETCH_RESOLVE); $$SFETCH --self-verify
	@echo "→ Checking goneat installation..."
	@$(SFETCH_RESOLVE); \
	if [ "$(FORCE)" = "1" ] || [ "$(FORCE)" = "true" ]; then \
		echo "→ Force reinstall requested, installing goneat..."; \
		$$SFETCH -repo fulmenhq/goneat -latest -install; \
	elif ! command -v goneat >/dev/null 2>&1; then \
		echo "→ goneat not found, installing latest..."; \
		$$SFETCH -repo fulmenhq/goneat -latest -install; \
	else \
		echo "→ goneat already installed: $$(goneat --version 2>&1 | head -n1)"; \
	fi
	@$(GONEAT_RESOLVE); \
	if [ -n "$$GONEAT" ]; then \
		echo "→ Installing foundation tools via goneat doctor..."; \
		$$GONEAT doctor tools --scope foundation --install --install-package-managers --yes --no-cooling || true; \
	else \
		echo "⚠️  goneat not found after install, skipping tool installation"; \
	fi
	@echo "✅ DX tools ready"

tools: ## Verify external tools are available
	@echo "Verifying external tools..."
	@command -v bun >/dev/null 2>&1 && echo "✅ bun: $$(bun --version)" || (echo "❌ bun not found" && exit 1)
	@command -v tsc >/dev/null 2>&1 && echo "✅ tsc: $$(bunx tsc --version)" || echo "⚠️  tsc not in PATH (using node_modules)"
	@$(SFETCH_RESOLVE); if [ -n "$$SFETCH" ]; then echo "✅ sfetch: $$($$SFETCH --version 2>&1 | head -n1)"; else echo "⚠️  sfetch not found (run: make bootstrap-dx)"; fi
	@$(GONEAT_RESOLVE); if [ -n "$$GONEAT" ]; then echo "✅ goneat: $$($$GONEAT --version 2>&1 | head -n1)"; else echo "⚠️  goneat not found (run: make bootstrap-dx)"; fi
	@echo "✅ Required tools verified"

sync: ## Sync SSOT assets (placeholder - tsfulmen provides role catalog)
	@echo "⚠️  Brooklyn uses tsfulmen for SSOT assets (library-first pattern)"
	@echo "   Role catalog: node_modules/@fulmenhq/tsfulmen/config/crucible-ts/"
	@echo "✅ Sync target satisfied (no local sync required)"

#
# === CODE QUALITY ===
#

lint: ## Run linting checks (goneat assess)
	@echo "Running linting checks..."
	@$(GONEAT_RESOLVE); \
	if [ -n "$$GONEAT" ]; then \
		$$GONEAT assess --categories format,lint --check --fail-on high; \
	else \
		echo "⚠️  goneat not found, falling back to bun run lint"; \
		bun run lint; \
	fi
	@echo "✅ Linting passed"

fmt: ## Format code (goneat assess --fix)
	@echo "Formatting code..."
	@$(GONEAT_RESOLVE); \
	if [ -n "$$GONEAT" ]; then \
		$$GONEAT assess --categories format --fix; \
	else \
		echo "⚠️  goneat not found, falling back to bun run format"; \
		bun run format; \
	fi
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

server-start-dev: ## Start development server (bun run dev)
	@echo "Starting Brooklyn development server..."
	@bun run dev

server-start-prod: ## Start production server (brooklyn mcp start)
	@echo "Starting Brooklyn production server..."
	@bun run server:start

server-stop: ## Stop Brooklyn server
	@echo "Stopping Brooklyn server..."
	@bun run server:stop

server-status: ## Check server status
	@echo "Checking Brooklyn server status..."
	@bun run server:status

server-restart: server-stop server-start-prod ## Restart production server
	@echo "✅ Server restarted"

server-logs: ## View server logs
	@echo "Viewing Brooklyn server logs..."
	@bun run server:logs
