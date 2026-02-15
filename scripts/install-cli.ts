#!/usr/bin/env bun

/**
 * Install Brooklyn CLI
 *
 * This script installs the built brooklyn-server CLI to the user's local bin directory.
 * It's the simpler version of the bootstrap script - just installs the CLI.
 */

import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

const log = {
  info: (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✅${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}❌${colors.reset} ${msg}`),
  title: (msg: string) => console.log(`${colors.bold}${colors.cyan}🛠️ ${msg}${colors.reset}`),
};

/**
 * Get installation paths
 */
function getInstallPaths() {
  const homeDir = homedir();
  const globalBinPath = join(homeDir, ".local", "bin");
  const isWindows = platform() === "win32";
  const binaryName = isWindows ? "brooklyn.exe" : "brooklyn";
  const cliSourcePath = join(process.cwd(), "dist", binaryName);
  const cliTargetPath = join(globalBinPath, binaryName);

  return {
    homeDir,
    globalBinPath,
    cliSourcePath,
    cliTargetPath,
  };
}

/**
 * Install the CLI
 */
function installCLI(): void {
  log.title("Installing Brooklyn CLI");

  const paths = getInstallPaths();

  // Verify source exists
  if (!existsSync(paths.cliSourcePath)) {
    log.error(`Built CLI not found: ${paths.cliSourcePath}`);
    log.info("Run 'bun run build' first to build the CLI");
    process.exit(1);
  }

  // Ensure target directory exists
  if (!existsSync(paths.globalBinPath)) {
    mkdirSync(paths.globalBinPath, { recursive: true });
    log.info(`Created directory: ${paths.globalBinPath}`);
  }

  // Copy CLI to target
  copyFileSync(paths.cliSourcePath, paths.cliTargetPath);
  chmodSync(paths.cliTargetPath, 0o755);

  log.success(`CLI installed: ${paths.cliTargetPath}`);

  // Install runtime Node module deps so the CLI works from any CWD.
  // Brooklyn is built with Playwright externalized; without this, module resolution
  // depends on being run from a repo that has node_modules/playwright.
  try {
    const runtimeDir = join(paths.homeDir, ".brooklyn", "runtime");
    const runtimeNodeModulesDir = join(runtimeDir, "node_modules");
    if (!existsSync(runtimeNodeModulesDir)) {
      mkdirSync(runtimeNodeModulesDir, { recursive: true });
    }

    // Stamp a small marker for troubleshooting.
    const markerPath = join(runtimeDir, "README.txt");
    writeFileSync(
      markerPath,
      "Brooklyn runtime dependencies. Safe to delete; re-run 'make install' to restore.\n",
      { encoding: "utf8" },
    );

    const deps = ["playwright", "playwright-core"];
    for (const dep of deps) {
      const src = join(process.cwd(), "node_modules", dep);
      const dest = join(runtimeNodeModulesDir, dep);
      if (!existsSync(src)) {
        log.warn(`Runtime dep not found in repo node_modules: ${dep}`);
        continue;
      }
      rmSync(dest, { recursive: true, force: true });
      cpSync(src, dest, { recursive: true });
    }

    log.success(`Runtime deps installed: ${join(runtimeDir, "node_modules")}`);
  } catch (error) {
    log.warn(
      `Failed to install runtime deps (CLI may require running from repo): ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Check if in PATH
  const pathEnv = process.env["PATH"] || "";
  if (!pathEnv.includes(paths.globalBinPath)) {
    log.warn(`${paths.globalBinPath} is not in your PATH`);
    console.log(`
${colors.yellow}To use brooklyn globally, add this to your shell profile:${colors.reset}
${colors.cyan}export PATH="$PATH:${paths.globalBinPath}"${colors.reset}

${colors.bold}Or run commands with full path:${colors.reset}
${colors.cyan}${paths.cliTargetPath} mcp start${colors.reset}
`);
  } else {
    log.success("CLI is ready to use globally!");
  }

  // Test the built binary (before installation)
  log.title("Testing Installation");
  try {
    const { execSync } = require("node:child_process");
    const result = execSync(`"${paths.cliSourcePath}" --version`, {
      encoding: "utf8",
    });

    log.success("Installation test passed");
    log.info(`Version: ${result.trim()}`);
  } catch (error) {
    log.error(
      `Installation test failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Show usage
  console.log(`
${colors.bold}${colors.green}✅ Brooklyn CLI Installation Complete!${colors.reset}

${colors.bold}Available Commands:${colors.reset}
${colors.cyan}brooklyn mcp start${colors.reset}       - Start MCP server for Claude Code
${colors.cyan}brooklyn web start${colors.reset}       - Start web server
${colors.cyan}brooklyn status${colors.reset}          - Check server status
${colors.cyan}brooklyn version${colors.reset}         - Show version info
${colors.cyan}brooklyn --help${colors.reset}          - Show all commands

${colors.bold}Next Steps:${colors.reset}
1. Check status: ${colors.cyan}brooklyn status${colors.reset}
2. Test MCP mode: ${colors.cyan}brooklyn mcp start${colors.reset}
3. Test web mode: ${colors.cyan}brooklyn web start${colors.reset}
`);
}

/**
 * Main function
 */
function main(): void {
  try {
    installCLI();
  } catch (error) {
    log.error(`Installation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Run main function if script is executed directly
if (import.meta.main) {
  main();
}
