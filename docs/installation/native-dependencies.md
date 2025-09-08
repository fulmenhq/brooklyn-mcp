# Native Dependencies Installation Guide (v0.2.0)

**Authoritative installation instructions for remaining Brooklyn MCP native dependencies**

## Quick Start

For most users, the standard Node.js installation works:

```bash
# Install all current native dependencies
npm install svgo

# Verify installation
brooklyn features list
```

## Platform-Specific Instructions

### macOS

#### Prerequisites

```bash
# Install Xcode command line tools (required for native compilation)
xcode-select --install

# Verify installation
xcode-select -p
# Should output: /Applications/Xcode.app/Contents/Developer
```

#### Package Installation

```bash
# Install SVGO if needed for direct usage
npm install svgo
```

#### Troubleshooting macOS

- **"xcode-select error"** → Install Xcode CLI tools with command above
- **"pkg-config not found"** → `brew install pkg-config`
- **Architecture mismatch** → Clear npm cache: `npm cache clean --force`

### Linux (Ubuntu/Debian)

#### Prerequisites

```bash
# Install build tools and system libraries
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  pkg-config \
  python3-dev

# For older Ubuntu versions, also install:
sudo apt-get install -y nodejs npm
```

#### Package Installation

```bash
# Standard installation
npm install svgo
```

#### Other Linux Distributions

**RHEL/CentOS/Fedora**:

```bash
# RHEL/CentOS
sudo yum groupinstall "Development Tools"
sudo yum install -y pkgconfig python3-devel

# Fedora
sudo dnf groupinstall "Development Tools"
sudo dnf install -y pkgconfig python3-devel

# Then install npm packages
npm install svgo
```

**Alpine Linux**:

```bash
# Install npm packages
npm install svgo
```

#### Troubleshooting Linux

- **"Python not found"** → Install `python3-dev` or `python3-devel`
- **Permission errors** → Use `sudo` for system package installation
- **Architecture issues** → Ensure matching Node.js and system architecture

### Windows

#### Prerequisites

```bash
# Option 1: Install Visual Studio Build Tools (recommended)
# Download from: https://visualstudio.microsoft.com/visual-cpp-build-tools/
# Select "C++ build tools" workload

# Option 2: Install via npm (automated)
npm install --global windows-build-tools

# Option 3: Install via Chocolatey
choco install visualstudio2022buildtools
```

#### Package Installation

```bash
# Standard installation
npm install svgo
```

#### Troubleshooting Windows

- **"MSBuild not found"** → Install Visual Studio Build Tools
- **"Python not found"** → Install Python 3.x and add to PATH
- **"node-gyp rebuild failed"** → Clear npm cache and rebuild: `npm cache clean --force`
- **Permission errors** → Run PowerShell/CMD as Administrator
- **Architecture mismatch** → Ensure 64-bit Node.js on 64-bit Windows

## Notes

As of v0.2.0, Brooklyn uses browser-based rendering for image processing.
No native image dependencies are required.

- **Windows**: Visual Studio Build Tools or Windows Build Tools

**Common Issues**:

- **"Cannot find module 'svgo'"** → `npm install svgo`
- **Build failures** → Install platform build tools listed above

**Documentation**: https://github.com/svg/svgo

### SVGO (SVG Optimization)

**Purpose**: SVG file optimization and compression

**Installation**:

```bash
# Standard installation
npm install svgo

# Verify installation
npx svgo --version
```

**Platform Requirements**:

- **All platforms**: Node.js 14+ (no native compilation required)

**Common Issues**:

- **"Command not found: svgo"** → Ensure npm packages are in PATH
- **"Cannot find module '../data/patch.json'"** → Use external dependency mode

**Documentation**: https://github.com/svg/svgo

### HarfBuzz (Future - Text Shaping)

**Purpose**: Advanced text shaping and typography processing

**Installation** (when available):

```bash
# macOS
brew install harfbuzz
npm install harfbuzzjs

# Linux
sudo apt-get install libharfbuzz-dev
npm install harfbuzzjs

# Windows
# Will be documented when HarfBuzz support is added
```

## Verification and Testing

### Check Available Features

```bash
# List what's currently available
brooklyn features list

# Test specific library
brooklyn features test svgo
brooklyn features test svgo

# Show detailed capability information
brooklyn features list --verbose
```

### Test Installation

```bash
# Test image processing capabilities
# (Image processing uses browser-based rendering; no native deps test needed)

# Test SVG optimization
brooklyn test-deps svgo

# Test all native dependencies
brooklyn test-deps --all
```

## Alternative Installation Methods

### Docker (Containerized)

```dockerfile
# Ubuntu-based container with all dependencies
FROM ubuntu:22.04

# Install system dependencies
RUN apt-get update && apt-get install -y \
    nodejs npm \
    build-essential \
    pkg-config \
    python3-dev

# Install Brooklyn with native deps
# NPM publishing not yet public; placeholder scope shown for planning
# RUN npm install -g @fulmenhq/brooklyn-mcp
RUN npm install svgo

# Verify installation
RUN brooklyn features list
```

### Development Mode (No Native Dependencies)

```bash
# Use source code directly, bypassing bundling issues
claude mcp add brooklyn-dev -- bun src/cli/brooklyn.ts mcp start --development-only

# Benefits:
# - No native dependency installation required
# - Immediate source code changes
# - Full feature access during development
```

### Pre-Built Binaries (Future)

When available, pre-built binaries will include all native dependencies:

```bash
# Download platform-specific binary with embedded dependencies
# Download a release artifact (replace os/arch with your platform)
curl -L https://github.com/fulmenhq/brooklyn-mcp/releases/download/v0.2.0-rc.1/brooklyn-<os>-<arch>
chmod +x brooklyn-linux-x64-with-deps

# No additional installation required
./brooklyn-linux-x64-with-deps features list
```

## Troubleshooting Matrix

| Error Message                | Platform | Solution                                           |
| ---------------------------- | -------- | -------------------------------------------------- |
| "Cannot find module 'svgo'"  | All      | `npm install svgo`                                 |
| "xcode-select: error"        | macOS    | `xcode-select --install`                           |
| "MSBuild not found"          | Windows  | Install Visual Studio Build Tools                  |
| "Python not found"           | Windows  | Install Python 3.x, add to PATH                    |
| "node-gyp rebuild failed"    | All      | Install platform build tools                       |
| "Architecture not supported" | All      | Check [Platform Support Matrix](#platform-support) |
| "SVGO patch.json not found"  | All      | Use `--development-only` mode                      |

## Platform Support Matrix

### Officially Supported

| Platform    | Architecture  | SVGO | HarfBuzz   | Status          |
| ----------- | ------------- | ---- | ---------- | --------------- |
| **macOS**   | x64           | ✅   | 🔄 Planned | Fully Supported |
| **macOS**   | arm64 (M1/M2) | ✅   | 🔄 Planned | Fully Supported |
| **Linux**   | x64           | ✅   | 🔄 Planned | Fully Supported |
| **Linux**   | arm64         | ✅   | 🔄 Planned | Fully Supported |
| **Windows** | x64           | ✅   | 🔄 Planned | Fully Supported |

### Community Supported

| Platform    | Architecture | SVGO | Notes                      |
| ----------- | ------------ | ---- | -------------------------- |
| **Windows** | arm64        | ✅   | Community support          |
| **Linux**   | armv7        | ✅   | Community builds available |
| **FreeBSD** | x64          | ✅   | Manual setup may be needed |

### Legend

- ✅ Fully supported with pre-built binaries
- ⚠️ Supported but may require manual compilation
- 🔄 Planned for future release
- ❌ Not supported

## Getting Help

### Quick Diagnostics

```bash
# Run Brooklyn's built-in dependency checker
brooklyn doctor native-deps

# Show platform information
brooklyn doctor platform

# Test specific feature
brooklyn test compress_svg /path/to/test.svg
```

### Support Resources

1. **Installation Issues**: Check this guide first
2. **Platform-Specific Problems**: See [Troubleshooting Matrix](#troubleshooting-matrix)
3. **Development Mode**: Use `--development-only` to bypass issues
4. **Community Support**: GitHub Issues with `native-dependencies` label
5. **Library Documentation**: Check upstream library docs for specific errors

### Reporting Issues

When reporting native dependency issues, include:

```bash
# System information
brooklyn doctor platform

# Feature availability
brooklyn features list --verbose

# Error details
brooklyn test-deps --all --verbose
```

---

**Last Updated**: August 18, 2025  
**Next Review**: September 2025  
**Maintained by**: Brooklyn Platform Team
