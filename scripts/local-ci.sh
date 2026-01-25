#!/usr/bin/env bash
# Brooklyn MCP Local CI Runner
#
# Emulates GitHub Actions CI environment locally using Docker.
# Supports both amd64 and arm64 architectures.
#
# Usage:
#   ./scripts/local-ci.sh [command] [options]
#
# Commands:
#   build       Build the CI Docker image
#   quality     Run quality checks (fast, no browsers)
#   integration Run integration tests + build (with browsers)
#   full        Run full CI suite (quality + integration)
#   shell       Open interactive shell in CI environment
#   clean       Remove CI Docker images and volumes
#
# Options:
#   --no-cache  Build without Docker cache
#   --platform  Force platform (linux/amd64 or linux/arm64)
#   -v, --verbose  Verbose output
#
# Examples:
#   ./scripts/local-ci.sh build
#   ./scripts/local-ci.sh quality
#   ./scripts/local-ci.sh integration --platform linux/amd64
#   ./scripts/local-ci.sh shell

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/.docker/ci/docker-compose.yml"
IMAGE_NAME="brooklyn-ci"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default options
NO_CACHE=""
PLATFORM=""
VERBOSE=""

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

detect_platform() {
    if [[ -n "$PLATFORM" ]]; then
        echo "$PLATFORM"
        return
    fi

    local arch
    arch=$(uname -m)
    case "$arch" in
        x86_64 | amd64)
            echo "linux/amd64"
            ;;
        arm64 | aarch64)
            echo "linux/arm64"
            ;;
        *)
            log_warn "Unknown architecture: $arch, defaulting to linux/amd64"
            echo "linux/amd64"
            ;;
    esac
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi

    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
}

cmd_build() {
    local platform
    platform=$(detect_platform)

    log_info "Building CI Docker image for platform: $platform"

    local build_args=(
        --platform "$platform"
        -t "$IMAGE_NAME"
        -f "${PROJECT_ROOT}/.docker/ci/Dockerfile"
    )

    if [[ -n "$NO_CACHE" ]]; then
        build_args+=(--no-cache)
    fi

    if [[ -n "$VERBOSE" ]]; then
        build_args+=(--progress=plain)
    fi

    docker build "${build_args[@]}" "$PROJECT_ROOT"

    log_success "CI Docker image built successfully"
}

cmd_quality() {
    local platform
    platform=$(detect_platform)

    log_info "Running quality checks (platform: $platform)"

    DOCKER_DEFAULT_PLATFORM="$platform" docker compose -f "$COMPOSE_FILE" run --rm \
        ci-quality

    log_success "Quality checks passed"
}

cmd_integration() {
    local platform
    platform=$(detect_platform)

    log_info "Running integration tests + build (platform: $platform)"

    DOCKER_DEFAULT_PLATFORM="$platform" docker compose -f "$COMPOSE_FILE" run --rm \
        ci-integration

    log_success "Integration tests + build passed"
}

cmd_full() {
    local platform
    platform=$(detect_platform)

    log_info "Running full CI suite (platform: $platform)"

    DOCKER_DEFAULT_PLATFORM="$platform" docker compose -f "$COMPOSE_FILE" run --rm \
        ci-full

    log_success "Full CI suite passed"
}

cmd_shell() {
    local platform
    platform=$(detect_platform)

    log_info "Opening interactive shell (platform: $platform)"
    log_info "Run 'exit' to leave the container"

    DOCKER_DEFAULT_PLATFORM="$platform" docker compose -f "$COMPOSE_FILE" run --rm \
        ci-shell
}

cmd_clean() {
    log_info "Cleaning up CI Docker resources..."

    # Stop and remove containers
    docker compose -f "$COMPOSE_FILE" down --volumes --remove-orphans 2> /dev/null || true

    # Remove image
    docker rmi "$IMAGE_NAME" 2> /dev/null || true

    # Remove dangling images from builds
    docker image prune -f --filter "label=org.opencontainers.image.title=Brooklyn MCP CI Runner" 2> /dev/null || true

    log_success "CI Docker resources cleaned"
}

show_help() {
    cat << 'EOF'
Brooklyn MCP Local CI Runner

Emulates GitHub Actions CI environment locally using Docker.
Supports both amd64 and arm64 architectures.

Usage:
  ./scripts/local-ci.sh [command] [options]

Commands:
  build       Build the CI Docker image
  quality     Run quality checks (fast, no browsers)
  integration Run integration tests + build (with browsers)
  full        Run full CI suite (quality + integration)
  shell       Open interactive shell in CI environment
  clean       Remove CI Docker images and volumes
  help        Show this help message

Options:
  --no-cache     Build without Docker cache
  --platform P   Force platform (linux/amd64 or linux/arm64)
  -v, --verbose  Verbose output

Examples:
  # Build the CI image
  ./scripts/local-ci.sh build

  # Run quality checks only
  ./scripts/local-ci.sh quality

  # Run integration tests (debug browser issues)
  ./scripts/local-ci.sh integration

  # Force amd64 platform (emulation on ARM Mac)
  ./scripts/local-ci.sh integration --platform linux/amd64

  # Open shell to debug manually
  ./scripts/local-ci.sh shell

  # Clean up
  ./scripts/local-ci.sh clean

Make targets (alternative):
  make ci-local-build
  make ci-local-quality
  make ci-local-integration
  make ci-local-shell
  make ci-local-clean
EOF
}

# Parse arguments
COMMAND=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        build | quality | integration | full | shell | clean | help)
            COMMAND="$1"
            shift
            ;;
        --no-cache)
            NO_CACHE="1"
            shift
            ;;
        --platform)
            PLATFORM="$2"
            shift 2
            ;;
        -v | --verbose)
            VERBOSE="1"
            shift
            ;;
        -h | --help)
            show_help
            exit 0
            ;;
        *)
            log_error "Unknown argument: $1"
            show_help
            exit 1
            ;;
    esac
done

# Default to help if no command
if [[ -z "$COMMAND" ]]; then
    show_help
    exit 0
fi

# Check Docker before running commands
check_docker

# Execute command
case "$COMMAND" in
    build)
        cmd_build
        ;;
    quality)
        cmd_quality
        ;;
    integration)
        cmd_integration
        ;;
    full)
        cmd_full
        ;;
    shell)
        cmd_shell
        ;;
    clean)
        cmd_clean
        ;;
    help)
        show_help
        ;;
esac
