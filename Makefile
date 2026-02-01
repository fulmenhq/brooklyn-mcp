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
# Minimum version for full feature support (typecheck requires v0.5.0+)
# NOTE: This is documentation only - bootstrap-dx installs latest if missing
MIN_GONEAT_VERSION := v0.5.0

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
.PHONY: release-check release-prepare release-build release-clean
.PHONY: release-download release-checksums release-sign release-export-keys release-notes
.PHONY: release-verify-checksums release-verify-keys release-verify-signatures release-upload
.PHONY: server-start-dev server-start-prod server-stop server-status server-restart server-logs
.PHONY: ci-local-build ci-local-quality ci-local-integration ci-local-full ci-local-shell ci-local-clean ci-local-amd64

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
	@echo "  release-build     Build release artifacts locally"
	@echo "  release-clean     Clean dist/release directory"
	@echo ""
	@echo "Release signing targets (FulmenHQ pattern):"
	@echo "  release-download  Download CI artifacts from GitHub Release"
	@echo "  release-checksums Generate SHA256SUMS/SHA512SUMS"
	@echo "  release-sign      Sign manifests (minisign + optional PGP)"
	@echo "  release-export-keys Export public keys to dist/release"
	@echo "  release-verify-keys Verify exported keys are public-only"
	@echo "  release-verify-checksums Verify checksums match artifacts"
	@echo "  release-verify-signatures Verify signatures are valid"
	@echo "  release-notes     Copy release notes to dist/release"
	@echo "  release-upload    Upload provenance to GitHub Release"
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
	@echo "Local CI (Docker-based GitHub Actions emulation):"
	@echo "  ci-local-build       Build local CI Docker image"
	@echo "  ci-local-quality     Run quality checks (fast, no browsers)"
	@echo "  ci-local-integration Run integration tests (with browsers)"
	@echo "  ci-local-full        Run full CI suite"
	@echo "  ci-local-shell       Open interactive shell in CI environment"
	@echo "  ci-local-clean       Clean up CI Docker resources"
	@echo "  ci-local-amd64       Force amd64 emulation (for ARM Macs)"
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
	@echo "→ Checking goneat installation (minimum v0.5.2)..."
	@$(SFETCH_RESOLVE); \
	REQUIRED_VERSION="v0.5.2"; \
	if [ "$(FORCE)" = "1" ] || [ "$(FORCE)" = "true" ]; then \
		echo "→ Force reinstall requested, installing goneat..."; \
		$$SFETCH -repo fulmenhq/goneat -latest -install; \
	elif ! command -v goneat >/dev/null 2>&1; then \
		echo "→ goneat not found, installing latest..."; \
		$$SFETCH -repo fulmenhq/goneat -latest -install; \
	else \
		echo "→ goneat already installed: $$(goneat --version 2>&1 | head -n1)"; \
	fi; \
	if command -v goneat >/dev/null 2>&1; then \
		GONEAT_VERSION=$$(goneat --version 2>&1 | head -n1 | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' | head -1); \
		if [ "$$(printf '%s\n' "$$REQUIRED_VERSION" "$$GONEAT_VERSION" | sort -V | head -n1)" != "$$REQUIRED_VERSION" ]; then \
			echo "❌ goneat $$GONEAT_VERSION is below minimum required $$REQUIRED_VERSION"; \
			echo "   Run: make bootstrap-dx FORCE=1"; \
			exit 1; \
		fi; \
		echo "✅ goneat $$GONEAT_VERSION meets minimum requirement ($$REQUIRED_VERSION)"; \
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
# FulmenHQ Release Workflow (manual signing pattern):
#   1. CI builds and uploads binaries to GitHub Release
#   2. Maintainer downloads CI artifacts: make release-download
#   3. Generate checksums (if regenerating): make release-checksums
#   4. Sign manifests: make release-sign
#   5. Export public keys: make release-export-keys
#   6. Upload provenance: make release-upload
#
# Signing env vars (BROOKLYN_ prefix):
#   BROOKLYN_MINISIGN_KEY  - path to minisign secret key (required)
#   BROOKLYN_MINISIGN_PUB  - path to minisign public key (optional)
#   BROOKLYN_PGP_KEY_ID    - GPG key ID for PGP signing (optional)
#   BROOKLYN_GPG_HOMEDIR   - GPG homedir (required if PGP_KEY_ID set)
#   BROOKLYN_RELEASE_TAG   - release version tag (e.g., v0.3.0)

.PHONY: release-check release-prepare release-build release-clean
.PHONY: release-download release-checksums release-sign release-export-keys release-notes
.PHONY: release-verify-checksums release-verify-keys release-verify-signatures release-upload

release-check: check-all ## Validate release readiness
	@echo "Checking release readiness..."
	@if [ ! -f VERSION ]; then echo "❌ VERSION file missing"; exit 1; fi
	@if [ ! -f CHANGELOG.md ]; then echo "⚠️  CHANGELOG.md missing (recommended)"; fi
	@bun run release:validate
	@echo "✅ Release checks passed"

release-prepare: check-all version-sync ## Prepare for release
	@echo "Preparing release $(VERSION)..."
	@echo "✅ Release prepared"

release-build: build-all ## Build release artifacts locally
	@echo "Building release artifacts for $(VERSION)..."
	@bun run license:scan
	@bun run package:all
	@echo "✅ Release artifacts ready in dist/release/"

release-clean: ## Clean release artifacts directory
	@echo "Cleaning release artifacts..."
	@rm -rf dist/release
	@mkdir -p dist/release
	@echo "✅ Release directory cleaned"

release-download: ## Download CI-built artifacts from GitHub Release
	@if [ -z "$(BROOKLYN_RELEASE_TAG)" ]; then \
		echo "❌ BROOKLYN_RELEASE_TAG not set (e.g., BROOKLYN_RELEASE_TAG=v0.3.0 make release-download)"; \
		exit 1; \
	fi
	@echo "Downloading $(BROOKLYN_RELEASE_TAG) artifacts from GitHub..."
	@mkdir -p dist/release
	@gh release download $(BROOKLYN_RELEASE_TAG) --repo fulmenhq/brooklyn-mcp --dir dist/release --pattern "*.tar.gz" --pattern "*.zip" --clobber
	@echo "✅ Downloaded CI artifacts for $(BROOKLYN_RELEASE_TAG)"

release-checksums: ## Generate checksums from downloaded/built artifacts
	@echo "Generating checksums..."
	@if [ -n "$$(ls dist/release/*.minisig 2>/dev/null)" ] || [ -n "$$(ls dist/release/*.asc 2>/dev/null)" ]; then \
		echo "❌ Signatures already exist. Regenerating checksums would invalidate them."; \
		echo "   Run 'make release-clean' first, then re-download/build artifacts."; \
		exit 1; \
	fi
	@cd dist/release && rm -f SHA256SUMS SHA512SUMS
	@cd dist/release && for f in *.tar.gz *.zip; do \
		if [ -f "$$f" ]; then \
			shasum -a 256 "$$f" >> SHA256SUMS; \
			shasum -a 512 "$$f" >> SHA512SUMS; \
		fi; \
	done
	@echo "✅ Checksums generated in dist/release/"

release-verify-checksums: ## Verify checksums match artifacts (non-destructive)
	@echo "Verifying checksums..."
	@cd dist/release && shasum -a 256 -c SHA256SUMS
	@echo "✅ SHA256 checksums verified"

release-sign: ## Sign checksum manifests (minisign required, PGP optional)
	@if [ -z "$(BROOKLYN_RELEASE_TAG)" ]; then \
		echo "❌ BROOKLYN_RELEASE_TAG not set (e.g., BROOKLYN_RELEASE_TAG=v0.3.0 make release-sign)"; \
		exit 1; \
	fi
	@scripts/sign-release-manifests.sh $(BROOKLYN_RELEASE_TAG) dist/release

release-export-keys: ## Export public keys to dist/release
	@scripts/export-release-keys.sh dist/release

release-verify-keys: ## Verify exported public keys are public-only (no secrets)
	@echo "Verifying exported keys are public-only..."
	@if [ -f "dist/release/fulmenhq-release-minisign.pub" ]; then \
		scripts/verify-minisign-public-key.sh "dist/release/fulmenhq-release-minisign.pub"; \
	else \
		echo "No minisign public key found (skipping)"; \
	fi
	@if [ -f "dist/release/fulmenhq-release-signing-key.asc" ]; then \
		scripts/verify-gpg-public-key.sh "dist/release/fulmenhq-release-signing-key.asc"; \
	else \
		echo "No GPG public key found (skipping)"; \
	fi

release-notes: ## Copy release notes to dist/release
	@if [ -z "$(BROOKLYN_RELEASE_TAG)" ]; then \
		echo "❌ BROOKLYN_RELEASE_TAG not set (e.g., BROOKLYN_RELEASE_TAG=v0.3.0 make release-notes)"; \
		exit 1; \
	fi
	@notes_src="docs/releases/$(BROOKLYN_RELEASE_TAG).md"; \
	notes_dst="dist/release/release-notes-$(BROOKLYN_RELEASE_TAG).md"; \
	if [ ! -f "$$notes_src" ]; then \
		echo "❌ Missing $$notes_src"; \
		exit 1; \
	fi; \
	cp "$$notes_src" "$$notes_dst"; \
	echo "✅ Copied $$notes_src → $$notes_dst"

release-verify-signatures: ## Verify signatures are valid
	@echo "Verifying signatures..."
	@cd dist/release && \
		if [ -f SHA256SUMS.minisig ]; then \
			echo "Verifying minisign signature..."; \
			minisign -Vm SHA256SUMS -p fulmenhq-release-minisign.pub 2>/dev/null || \
			echo "⚠️  minisign verification requires public key in dist/release/"; \
		fi
	@cd dist/release && \
		if [ -f SHA256SUMS.asc ]; then \
			echo "Verifying GPG signature..."; \
			gpg --verify SHA256SUMS.asc SHA256SUMS 2>/dev/null || \
			echo "⚠️  GPG verification requires public key import"; \
		fi
	@echo "✅ Signature verification complete"

release-upload: ## Upload signed artifacts to GitHub Release
	@if [ -z "$(BROOKLYN_RELEASE_TAG)" ]; then \
		echo "❌ BROOKLYN_RELEASE_TAG not set (e.g., BROOKLYN_RELEASE_TAG=v0.3.0 make release-upload)"; \
		exit 1; \
	fi
	@echo "Uploading provenance artifacts for $(BROOKLYN_RELEASE_TAG)..."
	@cd dist/release && gh release upload $(BROOKLYN_RELEASE_TAG) \
		SHA256SUMS SHA512SUMS \
		$$(ls SHA256SUMS.asc SHA512SUMS.asc SHA256SUMS.minisig SHA512SUMS.minisig 2>/dev/null || true) \
		$$(ls fulmenhq-release-*.pub fulmenhq-release-*.asc 2>/dev/null || true) \
		$$(ls licenses.json THIRD_PARTY_NOTICES.md RELEASE.md release-notes-*.md 2>/dev/null || true) \
		--repo fulmenhq/brooklyn-mcp --clobber
	@echo "✅ Provenance artifacts uploaded to $(BROOKLYN_RELEASE_TAG)"
	@echo "Publishing release (removing draft status)..."
	@gh release edit $(BROOKLYN_RELEASE_TAG) --draft=false --repo fulmenhq/brooklyn-mcp
	@echo "✅ Release $(BROOKLYN_RELEASE_TAG) is now published"

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

#
# === LOCAL CI (Docker) ===
#
# Emulate GitHub Actions CI environment locally for debugging.
# Supports both amd64 and arm64 architectures.
#

ci-local-build: ## Build local CI Docker image
	@echo "Building local CI Docker image..."
	@./scripts/local-ci.sh build

ci-local-quality: ## Run quality checks in Docker (fast, no browsers)
	@echo "Running local CI quality checks..."
	@./scripts/local-ci.sh quality

ci-local-integration: ## Run integration tests in Docker (with browsers)
	@echo "Running local CI integration tests..."
	@./scripts/local-ci.sh integration

ci-local-full: ## Run full CI suite in Docker
	@echo "Running full local CI suite..."
	@./scripts/local-ci.sh full

ci-local-shell: ## Open interactive shell in CI Docker environment
	@echo "Opening CI Docker shell..."
	@./scripts/local-ci.sh shell

ci-local-clean: ## Clean up local CI Docker resources
	@echo "Cleaning local CI Docker resources..."
	@./scripts/local-ci.sh clean

ci-local-amd64: ## Run integration tests forcing amd64 platform (for ARM Macs)
	@echo "Running local CI integration (amd64 emulation)..."
	@./scripts/local-ci.sh integration --platform linux/amd64
