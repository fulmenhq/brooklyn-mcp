# Native Dependencies Architecture for Brooklyn MCP (v0.2.0)

## Overview

Brooklyn MCP previously integrated native libraries for image processing. As of v0.2.0, Brooklyn uses browser‑based rendering for SVG/PNG pipelines, removing the need for legacy native image libraries. This document focuses on the remaining native patterns (e.g., SVGO) and the general approach.

## Design Principles

1. **Graceful Degradation**: Core Brooklyn functionality works without native deps
2. **Clear User Guidance**: Authoritative installation instructions for each platform
3. **Cross-Platform Builds**: Maintain Bun cross-compilation for all platforms
4. **Development Flexibility**: Source-based development bypasses bundling issues
5. **Future Scalability**: Pattern supports additional native libraries
6. **Dual Distribution**: Support both manual installation and pre-built binaries

## Architecture Pattern

### Hybrid External + Conditional Loading

Brooklyn uses a **hybrid approach** combining external dependencies with graceful runtime loading:

```typescript
// External at build time (maintains cross-compilation)
bun build --external svgo --external harfbuzzjs

// Conditional loading at runtime (graceful degradation)
const svgo = await NativeDependencyManager.ensureLibrary("svgo", "svgo", INSTALLATION_GUIDES.svgo);
```

### Native Dependency Manager

Central management of all native library loading with consistent error handling:

```typescript
// src/core/native-deps/dependency-manager.ts
export class NativeDependencyManager {
  private static instances = new Map<string, any>();

  static async ensureLibrary<T>(
    name: string,
    importPath: string,
    installationGuide: string,
  ): Promise<T> {
    if (!this.instances.has(name)) {
      try {
        const lib = await import(importPath);
        this.instances.set(name, lib);
      } catch (error) {
        throw new NativeDependencyError(name, installationGuide);
      }
    }
    return this.instances.get(name);
  }

  static getAvailableFeatures(): FeatureMatrix {
    // Returns what's currently available
  }
}
```

### Feature Detection in Tools

Each tool declares its native dependencies and provides clear error messages:

```typescript
export const imageProcessingTools: EnhancedTool[] = [
  {
    name: "compress_svg",
    nativeDependencies: ["svgo"],
    handler: async args => {
      const svgo = await NativeDependencyManager.ensureLibrary(
        "svgo",
        "svgo",
        INSTALLATION_GUIDES.svgo,
      );
      // Implementation here
    },
  },
];
```

## Supported Native Libraries

### Current Libraries

| Library  | Purpose                          | Platforms     | Status         |
| -------- | -------------------------------- | ------------- | -------------- |
| **SVGO** | SVG optimization and compression | All platforms | ✅ Implemented |

### Planned Libraries

| Library        | Purpose                              | Platforms             | Status     |
| -------------- | ------------------------------------ | --------------------- | ---------- |
| **HarfBuzzJS** | Advanced text shaping and typography | Linux, macOS, Windows | 🔄 Planned |
| **Canvas**     | 2D graphics rendering                | Linux, macOS, Windows | 🔄 Future  |
| **FFmpeg**     | Video/audio processing               | Linux, macOS, Windows | 🔄 Future  |

## Installation Patterns

### Package Manager Matrix

Brooklyn maintains an authoritative installation guide for each platform:

| Platform    | Primary       | Secondary       | System Deps               |
| ----------- | ------------- | --------------- | ------------------------- |
| **macOS**   | `npm install` | `brew install`  | Xcode CLI tools           |
| **Linux**   | `npm install` | `apt`/`yum`     | build-essential           |
| **Windows** | `npm install` | `scoop install` | Visual Studio Build Tools |

### Installation Guide Structure

Each native library has a standardized installation guide. For image processing, prefer browser-based rendering (no native install required).

### Platform-Specific Requirements

#### macOS

No native image dependencies are required for SVG/PNG workflows.

#### Linux (Ubuntu/Debian)

No native image dependencies are required for SVG/PNG workflows.

#### Windows

No native image dependencies are required for SVG/PNG workflows.

### Troubleshooting

- Use brooklyn doctor --json to validate MCP/HTTP setup.

````

## Error Handling and User Guidance

### Standardized Error Messages

All native dependency errors provide:
1. **Clear problem statement**
2. **Specific installation command for user's platform**
3. **Link to authoritative installation guide**
4. **Alternative approaches** (development mode, feature alternatives)

```typescript
class NativeDependencyError extends Error {
  constructor(libraryName: string, installationGuide: string) {
    const platform = process.platform;
    const arch = process.arch;

    super(`
${libraryName} is not available on ${platform}-${arch}.

QUICK FIX:
${getInstallationCommand(libraryName, platform)}

DETAILED GUIDE:
${installationGuide}

ALTERNATIVE: Use development mode to bypass bundling issues:
claude mcp add brooklyn-dev -- bun src/cli/brooklyn.ts mcp start --development-only

For complete installation instructions: docs/installation/native-dependencies.md
`);
  }
}
````

### Platform Detection and Commands

```typescript
function getInstallationCommand(library: string, platform: string): string {
  const commands = {
    svgo: {
      darwin: "npm install svgo",
      linux: "npm install svgo",
      win32: "npm install svgo",
    },
  };

  return commands[library]?.[platform] || `npm install ${library}`;
}
```

## Build Configuration

### Cross-Platform Build Matrix

Brooklyn maintains cross-compilation capability by externalizing native dependencies:

```typescript
// build-config.ts
export const NATIVE_LIBRARIES = ["svgo", "harfbuzzjs", "@napi-rs/canvas"] as const;

export const BUILD_TARGETS = [
  { platform: "linux", arch: "x64" },
  { platform: "linux", arch: "arm64" },
  { platform: "darwin", arch: "x64" },
  { platform: "darwin", arch: "arm64" },
  { platform: "win32", arch: "x64" },
] as const;

export function createBuildConfig(target: BuildTarget) {
  return {
    external: ["playwright", "@playwright/test", "electron", ...NATIVE_LIBRARIES],
    target: "node",
    platform: target.platform,
    arch: target.arch,
    outfile: `dist/brooklyn-${target.platform}-${target.arch}`,
  };
}
```

### Build Scripts

```bash
# Cross-platform builds
bun run build:all-platforms

# Single platform build
bun run build:current-platform

# Development build (no external deps needed)
bun run build:dev
```

## Distribution Strategy

### Dual Distribution Model

Brooklyn supports two distribution methods:

#### 1. Manual Installation (Current)

- **Target**: Developers familiar with native dependencies
- **Approach**: Users install native deps via package managers
- **Benefits**: Smaller downloads, platform flexibility
- **Requirements**: Platform-specific setup knowledge

#### 2. Pre-Built Binaries (Future)

- **Target**: End users and CI/CD environments
- **Approach**: Self-contained binaries with embedded native libs
- **Benefits**: Zero-setup installation, guaranteed compatibility
- **Requirements**: Larger downloads, platform-specific builds

### Pre-Built Binary Strategy (Future Release)

**Packaging Approach**:

```bash
# Platform-specific binaries with embedded dependencies
brooklyn-linux-x64-with-deps      # Includes required JS deps (no image natives)
brooklyn-darwin-arm64-with-deps   # Includes system frameworks
brooklyn-win32-x64-with-deps      # Includes Visual C++ runtime
```

**Distribution Channels**:

- GitHub Releases (cross-platform binaries)
- npm packages (`@brooklyn/cli-linux-x64`, etc.)
- Homebrew (macOS)
- Scoop (Windows)
- APT/YUM repositories (Linux)

## Development Workflows

### Adding New Native Dependencies

1. **Add to NATIVE_LIBRARIES list**
2. **Create installation guide** in `docs/installation/`
3. **Add to NativeDependencyManager**
4. **Update error messages** with platform-specific commands
5. **Test cross-platform builds**
6. **Update tool documentation**

### Testing Native Dependencies

```bash
# Test availability without requiring installation
bun src/cli/brooklyn.ts features list

# Test specific library loading
# Test SVGO availability
bun src/cli/brooklyn.ts features test svgo

# Development mode (bypasses all native deps)
bun src/cli/brooklyn.ts mcp start --development-only
```

### Platform-Specific Testing

```bash
# Test cross-platform builds
bun run test:build-matrix

# Test installation guides
bun run test:installation-guides

# Test error message accuracy
bun run test:native-dep-errors
```

## Troubleshooting Guide

### Common Issues

| Error                        | Platform | Solution                          |
| ---------------------------- | -------- | --------------------------------- |
| "Cannot find module 'svgo'"  | All      | `npm install svgo`                |
| "xcode-select error"         | macOS    | `xcode-select --install`          |
| "node-gyp rebuild failed"    | Windows  | Install Visual Studio Build Tools |
| "Architecture not supported" | All      | Check supported platform matrix   |

### Debug Commands

```bash
# Check system requirements
brooklyn doctor native-deps

# List available features
brooklyn features list

# Test specific library
brooklyn features test svgo --verbose

# Show installation guides
brooklyn install-guide svgo
```

## Future Enhancements

### Planned Improvements

1. **Automatic Platform Detection**: Detect optimal installation method per platform
2. **Dependency Health Checking**: `brooklyn doctor` command for native deps
3. **Alternative Implementations**: WASM fallbacks for some native libraries
4. **Container Support**: Docker images with pre-installed dependencies
5. **Package Manager Integration**: Native packages via Homebrew, Scoop, etc.

### Extension Points

- **Plugin Architecture**: Load native deps as plugins
- **Remote Processing**: Offload heavy operations to cloud services
- **Caching Layer**: Cache processed results to reduce native lib usage
- **Progressive Enhancement**: Unlock features as deps become available

---

**Maintained by**: Brooklyn Platform Team  
**Last Updated**: August 18, 2025  
**Next Review**: September 2025
