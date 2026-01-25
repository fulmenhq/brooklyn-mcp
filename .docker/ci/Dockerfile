# Brooklyn MCP Local CI Runner
# Emulates GitHub Actions ubuntu-latest environment for local CI debugging
#
# Supports: linux/amd64, linux/arm64
# Based on: Ubuntu 24.04 (noble) - matches GitHub Actions ubuntu-latest
#
# TODO: Consider basing on ghcr.io/fulmenhq/goneat-tools-glibc for pre-installed
# goneat foundation tools. See fulmen-toolbox repo for curated images.
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

# Bun installation directory
ENV BUN_INSTALL=/usr/local/bun
ENV PATH="${BUN_INSTALL}/bin:${PATH}"

# Install base dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Essential build tools
    build-essential \
    curl \
    wget \
    git \
    ca-certificates \
    gnupg \
    # For minisign signature verification
    minisign \
    # For sfetch/goneat
    unzip \
    # goneat foundation tools (avoid needing brew in container)
    ripgrep \
    # Playwright system dependencies (subset - full deps installed by playwright)
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
    jq \
    && rm -rf /var/lib/apt/lists/*

# Install Bun (latest)
RUN curl -fsSL https://bun.sh/install | bash \
    && ln -s ${BUN_INSTALL}/bin/bun /usr/local/bin/bun \
    && ln -s ${BUN_INSTALL}/bin/bunx /usr/local/bin/bunx

# Install Node.js (for compatibility - Bun includes Node APIs but some tools need node binary)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install yq (YAML processor - not in apt)
ARG YQ_VERSION=v4.44.1
RUN ARCH=$(dpkg --print-architecture) && \
    curl -sSL "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_${ARCH}" -o /usr/local/bin/yq && \
    chmod +x /usr/local/bin/yq

# Install sfetch and goneat (trust anchor pattern)
RUN curl -sSfL https://github.com/3leaps/sfetch/releases/latest/download/install-sfetch.sh | bash \
    && ~/.local/bin/sfetch -repo fulmenhq/goneat -tag v0.5.2 -install \
    && ln -s ~/.local/bin/goneat /usr/local/bin/goneat \
    && ln -s ~/.local/bin/sfetch /usr/local/bin/sfetch

# Create workspace directory
WORKDIR /workspace

# Default command shows help
CMD ["echo", "Brooklyn CI Runner. Use: make ci-local-quality or make ci-local-integration"]
