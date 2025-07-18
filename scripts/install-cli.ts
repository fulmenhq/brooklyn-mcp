#!/usr/bin/env bun

/**
 * Install Brooklyn CLI
 *
 * This script installs the built brooklyn-server CLI to the user's local bin directory.
 * It's the simpler version of the bootstrap script - just installs the CLI.
 */

import { chmodSync, copyFileSync, existsSync, mkdirSync } from "fs";
import { homedir, platform } from "os";
import { join } from "path";

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
  const cliSourcePath = join(process.cwd(), "dist", "brooklyn-server");
  const cliTargetPath = join(globalBinPath, "brooklyn-server");

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

  // Check if in PATH
  const pathEnv = process.env["PATH"] || "";
  if (!pathEnv.includes(paths.globalBinPath)) {
    log.warn(`${paths.globalBinPath} is not in your PATH`);
    console.log(`
${colors.yellow}To use brooklyn-server globally, add this to your shell profile:${colors.reset}
${colors.cyan}export PATH="$PATH:${paths.globalBinPath}"${colors.reset}

${colors.bold}Or run commands with full path:${colors.reset}
${colors.cyan}${paths.cliTargetPath} status${colors.reset}
`);
  } else {
    log.success("CLI is ready to use globally!");
  }

  // Test the installation
  log.title("Testing Installation");
  try {
    const { execSync } = require("child_process");
    const result = execSync(`"${paths.cliTargetPath}" --version`, {
      encoding: "utf8",
    });

    log.success("Installation test passed");
    log.info(`Version: ${result.trim()}`);
  } catch (error: any) {
    log.error(`Installation test failed: ${error.message}`);
  }

  // Show usage
  console.log(`
${colors.bold}${colors.green}✅ Brooklyn CLI Installation Complete!${colors.reset}

${colors.bold}Available Commands:${colors.reset}
${colors.cyan}brooklyn-server start${colors.reset}     - Start the server
${colors.cyan}brooklyn-server stop${colors.reset}      - Stop the server
${colors.cyan}brooklyn-server status${colors.reset}    - Check server status
${colors.cyan}brooklyn-server logs${colors.reset}      - View server logs
${colors.cyan}brooklyn-server cleanup${colors.reset}   - Clean up resources
${colors.cyan}brooklyn-server info${colors.reset}      - Show installation info

${colors.bold}Next Steps:${colors.reset}
1. Start the server: ${colors.cyan}brooklyn-server start${colors.reset}
2. Check status: ${colors.cyan}brooklyn-server status${colors.reset}
3. View logs: ${colors.cyan}brooklyn-server logs --recent${colors.reset}
`);
}

/**
 * Main function
 */
function main(): void {
  try {
    installCLI();
  } catch (error: any) {
    log.error(`Installation failed: ${error.message}`);
    process.exit(1);
  }
}

// Run main function if script is executed directly
if (import.meta.main) {
  main();
}
