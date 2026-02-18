# Multi-Platform Development SOP

**Standard Operating Procedures for Cross-Platform TypeScript Development**

**Version:** 1.0
**Last Updated:** September 28, 2025
**Author:** Paris Brooklyn
**Supervisor:** @3leapsdave

## Overview

This document establishes standard operating procedures for developing TypeScript applications that work consistently across Windows, macOS, and Linux platforms. These standards apply to all Fulmen ecosystem TypeScript tools and ensure consistent behavior, testing, and deployment across platforms.

## Platform Support Matrix

| Platform           | Arch  | Bun      | Testing | CI Runner              | Primary Use Case       |
| ------------------ | ----- | -------- | ------- | ---------------------- | ---------------------- |
| **Linux (Ubuntu)** | x64   | ✅ v1.1+ | ✅ Full | ubuntu-latest          | CI/CD, production      |
| **Linux (Ubuntu)** | ARM64 | ✅ v1.1+ | ✅ Full | ubuntu-latest-arm64-s  | CI/CD, production      |
| **macOS**          | ARM64 | ✅ v1.1+ | ✅ Full | macos-15               | Developer workstations |
| **Windows 11**     | x64   | ✅ v1.1+ | ✅ Full | windows-latest         | Developer workstations |
| **Windows 11**     | ARM64 | ✅ v1.1+ | ✅ Full | windows-latest-arm64-s | Developer workstations |
| **macOS (Intel)**  | x64   | —        | —       | —                      | ❌ Dropped in v0.3.4   |

## Git Configuration Standards

### Line Ending Management

**Required:** Every repository MUST include a `.gitattributes` file to ensure consistent line endings:

```gitattributes
# Ensure consistent line endings across platforms
* text=auto eol=lf

# Specific file types that should always use LF
*.js text eol=lf
*.ts text eol=lf
*.json text eol=lf
*.md text eol=lf
*.yml text eol=lf
*.yaml text eol=lf
*.sh text eol=lf
*.toml text eol=lf

# Windows specific files that should use CRLF
*.bat text eol=crlf
*.cmd text eol=crlf

# Binary files
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.svg binary
*.woff binary
*.woff2 binary
*.ttf binary
*.eot binary
*.zip binary
*.tar.gz binary
*.pdf binary
```

### Git Configuration

**Developer Setup:**

```bash
# Ensure consistent behavior across platforms
git config core.autocrlf false
git config core.eol lf
git config core.safecrlf true
```

## Path Handling Standards

### File System Operations

**❌ Never use platform-specific path separators:**

```typescript
// WRONG - Platform specific
const configPath = `${homeDir}\\config\\app.json`; // Windows only
const configPath = `${homeDir}/config/app.json`; // Unix only
```

**✅ Always use Node.js path utilities:**

```typescript
// CORRECT - Cross-platform
import { join } from "node:path";
import { homedir } from "node:os";

const configPath = join(homedir(), "config", "app.json");
```

### Path Resolution Best Practices

```typescript
import { resolve, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

// Get current file directory (ESM modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Build paths relative to project root
const projectRoot = resolve(__dirname, "..", "..");
const configDir = join(projectRoot, "config");
const assetsDir = join(projectRoot, "assets");
```

## Testing Standards

### Platform-Specific Test Expectations

**Path Assertions:** Account for platform differences in test expectations:

```typescript
import { sep } from "node:path";

describe("Path Generation", () => {
  it("should generate correct output path", () => {
    const result = generateOutputPath("/test/input.svg");

    // Account for Windows backslashes vs Unix forward slashes
    const expectedPath = `/test/input-compressed.svg`.replace(/\//g, sep);
    expect(result.outputPath).toBe(expectedPath);
  });
});
```

### Platform-Specific Test Skipping

```typescript
import { platform } from "node:os";

describe("Platform-specific functionality", () => {
  it.runIf(platform() === "win32")("should handle Windows-specific feature", () => {
    // Windows-only test
  });

  it.skipIf(platform() === "win32")("should handle Unix-specific feature", () => {
    // Skip on Windows
  });
});
```

## Process Management

### Cross-Platform Process Execution

```typescript
import { spawn } from "node:child_process";
import { platform } from "node:os";

function executeCommand(command: string, args: string[] = []): Promise<string> {
  const isWindows = platform() === "win32";

  // Handle Windows shell differences
  const spawnCommand = isWindows ? "cmd" : command;
  const spawnArgs = isWindows ? ["/c", command, ...args] : args;

  return new Promise((resolve, reject) => {
    const child = spawn(spawnCommand, spawnArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: isWindows,
    });

    let output = "";
    child.stdout?.on("data", data => (output += data.toString()));

    child.on("close", code => {
      if (code === 0) resolve(output.trim());
      else reject(new Error(`Command failed with code ${code}`));
    });
  });
}
```

### Process Cleanup

```typescript
function killProcessTree(pid: number): Promise<void> {
  const isWindows = platform() === "win32";

  if (isWindows) {
    return executeCommand("taskkill", ["/f", "/t", "/pid", pid.toString()]);
  } else {
    return executeCommand("kill", ["-TERM", pid.toString()]);
  }
}
```

## Environment Detection

### Platform Detection Utilities

```typescript
import { platform, arch, release, type } from "node:os";

export interface PlatformInfo {
  platform: NodeJS.Platform;
  arch: string;
  isWindows: boolean;
  isMacOS: boolean;
  isLinux: boolean;
  release: string;
  type: string;
}

export function getPlatformInfo(): PlatformInfo {
  const platformName = platform();

  return {
    platform: platformName,
    arch: arch(),
    isWindows: platformName === "win32",
    isMacOS: platformName === "darwin",
    isLinux: platformName === "linux",
    release: release(),
    type: type(),
  };
}
```

## File System Permissions

### Cross-Platform Permission Handling

```typescript
import { access, chmod, constants } from "node:fs/promises";
import { platform } from "node:os";

async function makeExecutable(filePath: string): Promise<void> {
  if (platform() === "win32") {
    // Windows doesn't use Unix permissions
    return;
  }

  try {
    await chmod(filePath, 0o755);
  } catch (error) {
    console.warn(`Failed to make ${filePath} executable:`, error);
  }
}

async function checkFileAccess(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK | constants.R_OK);
    return true;
  } catch {
    return false;
  }
}
```

## Environment Variables

### Cross-Platform Environment Handling

```typescript
import { homedir } from "node:os";
import { join } from "node:path";

function getConfigDirectory(): string {
  const platform = process.platform;

  switch (platform) {
    case "win32":
      return process.env["APPDATA"] || join(homedir(), "AppData", "Roaming");
    case "darwin":
      return join(homedir(), "Library", "Application Support");
    default:
      return process.env["XDG_CONFIG_HOME"] || join(homedir(), ".config");
  }
}

function getCacheDirectory(): string {
  const platform = process.platform;

  switch (platform) {
    case "win32":
      return process.env["LOCALAPPDATA"] || join(homedir(), "AppData", "Local");
    case "darwin":
      return join(homedir(), "Library", "Caches");
    default:
      return process.env["XDG_CACHE_HOME"] || join(homedir(), ".cache");
  }
}
```

## Build and Distribution

### Cross-Platform Build Targets

Standalone binaries are compiled with `bun build --compile` for each platform. The release pipeline uses native matrix builds — each platform compiles on its own runner rather than cross-compiling.

**Build targets (5 platforms):**

| Platform      | Binary Name                | Runner                 |
| ------------- | -------------------------- | ---------------------- |
| Linux x64     | brooklyn-linux-amd64       | ubuntu-latest          |
| Linux ARM64   | brooklyn-linux-arm64       | ubuntu-latest-arm64-s  |
| macOS ARM64   | brooklyn-darwin-arm64      | macos-15               |
| Windows x64   | brooklyn-windows-amd64.exe | windows-latest         |
| Windows ARM64 | brooklyn-windows-arm64.exe | windows-latest-arm64-s |

### Archive Format Standards

- **All platforms:** Both `.zip` and `.tar.gz` archives are generated

## CI/CD Platform Matrix

> **Required Reading**: [CI/CD Developer Experience Principles](../development/cicd-developer-experience.md) - CI workflows must accurately reflect developer experience across all platforms. Do not add platform-specific workarounds that mask real DX issues.

### GitHub Actions Configuration

```yaml
strategy:
  fail-fast: false
  matrix:
    include:
      - os: ubuntu-latest
        name: linux-x64
      - os: ubuntu-latest-arm64-s
        name: linux-arm64
      - os: macos-15
        name: darwin-arm64
      - os: windows-latest
        name: windows-x64
      - os: windows-latest-arm64-s
        name: windows-arm64
runs-on: ${{ matrix.os }}
defaults:
  run:
    shell: bash

steps:
  - name: Run cross-platform tests
    run: |
      bun run test
      bun run test:integration
```

> **Note**: Custom runner labels (`ubuntu-latest-arm64-s`, `windows-latest-arm64-s`) are
> whitelisted in `.github/actionlint.yaml`.

## Error Handling

### Platform-Specific Error Messages

```typescript
function formatPathError(path: string, error: Error): string {
  const isWindows = platform() === "win32";

  if (isWindows && error.message.includes("ENOENT")) {
    return `File not found: ${path}. Check that the path exists and is accessible.`;
  }

  if (!isWindows && error.message.includes("EACCES")) {
    return `Permission denied: ${path}. Try running with appropriate permissions.`;
  }

  return `File system error for ${path}: ${error.message}`;
}
```

## Development Workflow

### Pre-Commit Validation

Ensure all platform-specific considerations are validated:

```bash
# Run tests on current platform
bun run test

# Validate cross-platform paths
bun run test:paths

# Check line endings
git status --porcelain | grep -E "^M " && echo "Line ending issues detected"

# Format all files consistently
bun run format:code
bun run format:docs
```

### Windows Development Setup

**Required Tools:**

- Windows Terminal or PowerShell 7+
- Git for Windows with proper line ending configuration
- Node.js 18+ and Bun 1.1+
- Visual Studio Code with platform-aware extensions

**Optional but Recommended:**

- Scoop package manager for additional tools
- Windows Subsystem for Linux (WSL2) for Unix compatibility testing

## Troubleshooting

### Common Platform Issues

**Line Ending Issues:**

```bash
# Fix after adding .gitattributes
git add --renormalize .
git commit -m "fix: normalize line endings"
```

**Path Separator Issues:**

- Always use `path.join()` instead of string concatenation
- Test path generation on multiple platforms
- Use `path.normalize()` for external path inputs

**Permission Issues:**

- Windows: Ensure files are not read-only
- Unix: Check execute permissions on scripts and binaries
- Use `fs.chmod()` programmatically when needed

**Windows Process Execution Issues:**

Critical issue discovered during Windows compatibility implementation: `execSync` with `stdio: "inherit"` can incorrectly fail commands that succeed but output warnings to stderr.

```typescript
// ❌ PROBLEMATIC - Will fail on Windows with stderr warnings
execSync(command, {
  cwd: rootDir,
  stdio: "inherit",
});

// ✅ CORRECT - Handles Windows stderr warnings properly
execSync(command, {
  cwd: rootDir,
  stdio: ["inherit", "inherit", "pipe"], // Capture stderr separately
  encoding: "utf-8",
});

// Check exit code explicitly in catch block
if (error && typeof error === "object" && "status" in error) {
  const execError = error as { status: number; stderr?: Buffer | string };
  if (execError.status === 0) {
    // Command succeeded but had stderr output (common on Windows)
    return { success: true, message: "Passed with warnings" };
  }
}
```

**Test Timeout Configuration:**

Windows tests often take longer than Unix equivalents. Key timeout adjustments needed:

```typescript
// vitest.config.precommit.ts - Windows compatibility
export default defineConfig({
  test: {
    testTimeout: 15000, // Increased from 5000 for Windows
    hookTimeout: 10000, // Increased from 5000 for Windows
  },
});
```

**Common Windows Test Issues:**

- **Focus element tests**: Take 5-10 seconds each on Windows vs 1-2 seconds on Unix
- **Process management**: Windows process cleanup requires different signal handling
- **Path assertions**: Use `path.sep` for cross-platform path comparisons in tests
- **Build validation**: Always check exit codes explicitly, don't rely solely on stderr absence

## Validation Checklist

- [ ] `.gitattributes` file configured for consistent line endings
- [ ] All file paths use Node.js `path` utilities
- [ ] Tests account for platform-specific path separators
- [ ] Process execution handles Windows vs Unix differences
- [ ] Environment variables use platform-appropriate defaults
- [ ] Build targets include all supported platforms
- [ ] CI/CD matrix tests all platforms
- [ ] Error messages are platform-appropriate
- [ ] Documentation includes platform-specific setup instructions
- [ ] **Windows stderr handling**: `execSync` configured with separate stderr capture
- [ ] **Test timeouts**: Vitest configs use Windows-compatible timeouts (15s+ for complex tests)
- [ ] **Build validation**: Scripts check exit codes explicitly, not just stderr absence
- [ ] **Pre-push hooks**: Timeouts extended to 5+ minutes for comprehensive validation
- [ ] **Focus/browser tests**: Account for 5-10x slower execution on Windows

## Implementation Timeline

**Phase 1 (Completed - September 2025):**

- ✅ Add `.gitattributes` to all repositories
- ✅ Update path handling in existing code
- ✅ Fix platform-specific test failures
- ✅ **Windows stderr handling**: Fixed execSync configuration in validation scripts
- ✅ **Test timeouts**: Updated vitest configs for Windows compatibility
- ✅ **Pre-push hooks**: Extended timeouts to 5 minutes for Windows validation
- ✅ **Full Windows test suite**: All unit, integration, and E2E tests pass

**Phase 2 (Next Sprint):**

- Implement platform detection utilities
- Add cross-platform process management
- Update CI/CD workflows
- Optimize Windows test execution performance

**Phase 3 (Future):**

- Platform-specific installation packages
- Enhanced Windows tooling integration
- Advanced cross-platform features
- Automated Windows development environment setup

---

**Generated by Paris Brooklyn (Claude Code) under supervision of @3leapsdave**

**Co-Authored-By:** Paris Brooklyn <noreply@fulmenhq.dev>
**Authored-By:** Dave Thompson <dave.thompson@3leaps.net> @3leapsdave
