#!/usr/bin/env bash
# Brooklyn MCP - Development Environment Setup
#
# Single, tool-agnostic entrypoint that provisions a full Brooklyn dev
# environment from a bare image. Used by the Cursor Cloud Agent `install`
# phase (.cursor/environment.json) and safe to run directly on local
# machines or from other agents.
#
# It is idempotent and non-interactive: re-running it converges without
# rebuilding lockfiles or duplicating state.
#
# What it does:
#   1. Install Bun (if missing) - JavaScript runtime + package manager
#   2. bun install               - project deps + Brooklyn CLI (lifecycle)
#   3. Playwright Chromium        - browser automation runtime (+ OS deps)
#   4. DX tools (best-effort)     - minisign -> sfetch -> goneat (lint/format)
#   5. Test infrastructure        - scratch dirs + browser verification
#   6. /usr/local/bin symlinks    - resolve tools from non-login shells
#
# Usage:
#   ./scripts/setup-cloud-dev.sh
#
# Environment:
#   BROOKLYN_SKIP_DX=1   Skip DX tool install (minisign/sfetch/goneat)
#
# DX tools require `sudo` (minisign via apt) and network access. If they are
# unavailable the script still yields a working runtime and warns instead of
# failing, so an arm's-length developer is never blocked.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

GONEAT_VERSION="${GONEAT_VERSION:-v0.5.15}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { printf "${BLUE}==>${NC} %s\n" "$1"; }
ok() { printf "${GREEN}✓${NC} %s\n" "$1"; }
warn() { printf "${YELLOW}⚠${NC} %s\n" "$1" >&2; }
err() { printf "${RED}✗${NC} %s\n" "$1" >&2; }

# Ensure user-local tool dirs are visible for the rest of this script.
export PATH="${HOME}/.bun/bin:${HOME}/.local/bin:${PATH}"

have() { command -v "$1" > /dev/null 2>&1; }

# Run a command with sudo when available and not already root; otherwise run
# it directly. Returns the command's exit status.
maybe_sudo() {
    if [ "$(id -u)" -eq 0 ]; then
        "$@"
    elif have sudo; then
        sudo "$@"
    else
        "$@"
    fi
}

install_bun() {
    if have bun; then
        ok "Bun present: $(bun --version)"
        return 0
    fi
    log "Installing Bun..."
    curl -fsSL https://bun.sh/install | bash > /dev/null 2>&1
    export PATH="${HOME}/.bun/bin:${PATH}"
    if have bun; then
        ok "Bun installed: $(bun --version)"
    else
        err "Bun installation failed"
        return 1
    fi
}

install_deps() {
    # The `bun install` lifecycle rebuilds and reinstalls the global brooklyn
    # binary by copying over ${HOME}/.local/bin/brooklyn. If a server is running
    # from that path the copy fails with ETXTBSY. Best-effort stop the server,
    # then unlink the target: on Linux a running process keeps its inode, so
    # removing the path lets the fresh binary be written cleanly.
    if have brooklyn; then
        brooklyn web stop --port 3000 > /dev/null 2>&1 || true
    fi
    rm -f "${HOME}/.local/bin/brooklyn" 2> /dev/null || true
    log "Installing project dependencies (bun install)..."
    (cd "${PROJECT_ROOT}" && bun install)
    ok "Dependencies installed"
}

install_browsers() {
    log "Installing Playwright Chromium..."
    if (cd "${PROJECT_ROOT}" && bunx playwright install --with-deps chromium > /dev/null 2>&1); then
        ok "Playwright Chromium installed (with OS deps)"
    else
        warn "Could not install Chromium OS deps (no sudo/apt?); retrying without --with-deps"
        (cd "${PROJECT_ROOT}" && bunx playwright install chromium)
        ok "Playwright Chromium installed (verify OS deps if launch fails)"
    fi
}

install_dx_tools() {
    if [ "${BROOKLYN_SKIP_DX:-0}" = "1" ]; then
        warn "BROOKLYN_SKIP_DX=1 set; skipping DX tools (goneat/lint unavailable)"
        return 0
    fi

    if ! have minisign; then
        log "Installing minisign (required by sfetch trust anchor)..."
        if maybe_sudo apt-get update -qq > /dev/null 2>&1 &&
            maybe_sudo apt-get install -y -qq minisign > /dev/null 2>&1; then
            ok "minisign installed"
        else
            warn "Could not install minisign; skipping goneat. Install minisign then re-run for lint/check-all."
            return 0
        fi
    fi

    if ! have sfetch; then
        log "Installing sfetch (trust anchor)..."
        if curl -fsSL https://github.com/3leaps/sfetch/releases/latest/download/install-sfetch.sh | bash > /dev/null 2>&1; then
            export PATH="${HOME}/.local/bin:${PATH}"
            ok "sfetch installed"
        else
            warn "Could not install sfetch; skipping goneat."
            return 0
        fi
    fi

    if ! have goneat; then
        log "Installing goneat ${GONEAT_VERSION}..."
        if sfetch -repo fulmenhq/goneat -tag "${GONEAT_VERSION}" -install > /dev/null 2>&1; then
            ok "goneat installed: $(goneat --version 2>&1 | head -n1)"
        else
            warn "Could not install goneat; lint/check-all will be unavailable."
            return 0
        fi
    else
        ok "goneat present: $(goneat --version 2>&1 | head -n1)"
    fi

    # Foundation tools (prettier, etc.) used by format/lint. Non-fatal.
    goneat doctor tools --scope foundation --install --install-package-managers --yes --no-cooling > /dev/null 2>&1 || true
}

setup_test_infra() {
    log "Setting up test infrastructure..."
    (cd "${PROJECT_ROOT}" && bun run setup:test-infra > /dev/null)
    ok "Test infrastructure ready"
}

link_tools() {
    # Symlink stable tools into /usr/local/bin so non-login shells (which do
    # not source ~/.bashrc) can resolve them. Best-effort; needs sudo.
    local dest="/usr/local/bin" tool src
    for tool in bun bunx goneat sfetch brooklyn; do
        src="$(command -v "${tool}" 2> /dev/null || true)"
        if [ -n "${src}" ] && [ ! -e "${dest}/${tool}" ]; then
            maybe_sudo ln -sf "${src}" "${dest}/${tool}" 2> /dev/null || true
        fi
    done
    ok "Tool symlinks ensured (best-effort)"
}

main() {
    log "Brooklyn MCP dev environment setup (${PROJECT_ROOT})"
    install_bun
    install_deps
    install_browsers
    install_dx_tools
    setup_test_infra
    link_tools
    printf "\n"
    ok "Setup complete. Start the server with:"
    printf "    brooklyn web start --port 3000 --host 127.0.0.1 --auth-mode localhost\n"
}

main "$@"
