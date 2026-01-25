# Brooklyn MCP Local CI Runner
# Emulates GitHub Actions ubuntu-latest environment for local CI debugging
#
# IMPORTANT: This Dockerfile uses the SAME installation method as ci.yml
# and what we recommend for friction-free developer experience:
#   1. Non-root user (no sudo required)
#   2. Homebrew for minisign
#   3. sfetch + goneat trust anchor pattern
#   4. goneat doctor tools for foundation tools (ripgrep, jq, yq, prettier)
#
# Supports: linux/amd64, linux/arm64
# Based on: Ubuntu 24.04 (noble) - matches GitHub Actions ubuntu-latest
#
# Usage:
#   docker build -t brooklyn-ci .docker/ci
#   docker run -v $(pwd):/workspace brooklyn-ci make ci-local-quality
#
# Or via make:
#   make ci-local-build
#   make ci-local-quality
#   make ci-local-integration

ARG UBUNTU_VERSION=24.04
FROM ubuntu:${UBUNTU_VERSION}

LABEL org.opencontainers.image.title="Brooklyn MCP CI Runner"
LABEL org.opencontainers.image.description="Local CI environment matching GitHub Actions"
LABEL org.opencontainers.image.vendor="FulmenHQ"

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# CI environment variables (match GitHub Actions)
ENV CI=true
ENV BROOKLYN_HEADLESS=true
ENV PLAYWRIGHT_HEADLESS=true
ENV BROOKLYN_CLEAN_BEFORE_TESTS=1

# Install ONLY essential system packages via apt (as root)
# Foundation tools (ripgrep, jq, yq, prettier) installed via goneat doctor tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Essential build tools (required for Homebrew and native compilation)
    build-essential \
    curl \
    wget \
    git \
    ca-certificates \
    gnupg \
    file \
    procps \
    sudo \
    # For sfetch/goneat archive extraction
    unzip \
    # Playwright system dependencies (these are OS-level libs, not tools)
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2t64 \
    libpango-1.0-0 \
    libcairo2 \
    # Useful for debugging
    vim-tiny \
    less \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user 'brooklyn' (matches DX principle: no sudo required)
# This user will own Homebrew and all tool installations
# Ubuntu 24.04 base may have existing users, so we use UID 1001 to avoid conflicts
ARG USERNAME=brooklyn
ARG USER_UID=1001
ARG USER_GID=1001
RUN groupadd --gid ${USER_GID} ${USERNAME} \
    && useradd --uid ${USER_UID} --gid ${USER_GID} -m ${USERNAME} \
    && mkdir -p /home/${USERNAME}/.local/bin \
    && mkdir -p /home/${USERNAME}/.cache/ms-playwright \
    && chown -R ${USERNAME}:${USERNAME} /home/${USERNAME} \
    && mkdir -p /home/linuxbrew \
    && chown -R ${USERNAME}:${USERNAME} /home/linuxbrew

# Switch to non-root user for all subsequent operations
USER ${USERNAME}
WORKDIR /home/${USERNAME}

# Homebrew environment (installed to linuxbrew home)
ENV HOMEBREW_PREFIX=/home/linuxbrew/.linuxbrew

# Bun installation directory
ENV BUN_INSTALL=/home/brooklyn/.bun

# Set PATH with all tool directories (ARGs don't expand in ENV, so use literals)
ENV PATH="/home/linuxbrew/.linuxbrew/bin:/home/brooklyn/.local/bin:/home/brooklyn/.bun/bin:${PATH}"

# Install Homebrew (as non-root user - matches ci.yml pattern)
# This is what we recommend for developers on Linux
RUN NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install minisign via brew (matches ci.yml - no sudo pattern)
RUN eval "$(${HOMEBREW_PREFIX}/bin/brew shellenv)" \
    && brew install minisign \
    && minisign -v

# Install Bun (latest) - as non-root user
RUN curl -fsSL https://bun.sh/install | bash

# Install sfetch and goneat (trust anchor pattern - matches ci.yml)
RUN eval "$(${HOMEBREW_PREFIX}/bin/brew shellenv)" \
    && curl -sSfL https://github.com/3leaps/sfetch/releases/latest/download/install-sfetch.sh | bash \
    && ~/.local/bin/sfetch -repo fulmenhq/goneat -tag v0.5.2 -install

# Copy project's tools.yaml for foundation tools installation
# Build context is project root, so use .goneat/ path directly
COPY --chown=${USERNAME}:${USERNAME} .goneat/tools.yaml /tmp/goneat-config/.goneat/tools.yaml

# Install foundation tools via goneat doctor tools (matches ci.yml)
# This is the recommended DX pattern - goneat manages tool installation
RUN eval "$(${HOMEBREW_PREFIX}/bin/brew shellenv)" \
    && cd /tmp/goneat-config \
    && ~/.local/bin/goneat doctor tools --scope foundation --install --install-package-managers --yes \
    && cd ~ && rm -rf /tmp/goneat-config

# Switch back to root to install Node.js (needs system-level install)
USER root

# Install Node.js (for compatibility - Bun includes Node APIs but some tools need node binary)
# Note: prettier requires node even when installed via bun
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create workspace directory owned by brooklyn user
RUN mkdir -p /workspace && chown ${USERNAME}:${USERNAME} /workspace

# Switch back to non-root user
USER ${USERNAME}
WORKDIR /workspace

# Verify all foundation tools are installed (after Node.js for prettier)
RUN eval "$(${HOMEBREW_PREFIX}/bin/brew shellenv)" \
    && echo "=== Verifying foundation tools ===" \
    && rg --version \
    && jq --version \
    && yq --version \
    && prettier --version \
    && minisign -v \
    && ~/.local/bin/goneat --version \
    && node --version \
    && bun --version \
    && echo "=== All foundation tools verified ==="

# Install Playwright Chromium at build time (OS deps already installed as root)
# This ensures browsers are always available in the image, matching GitHub Actions
RUN bunx playwright install chromium \
    && echo "=== Playwright Chromium installed ===" \
    && ls -la ~/.cache/ms-playwright/

# Default command shows help
CMD ["echo", "Brooklyn CI Runner. Use: make ci-local-quality or make ci-local-integration"]
