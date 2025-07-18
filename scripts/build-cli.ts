#!/usr/bin/env bun

/**
 * Build Brooklyn CLI
 *
 * This script builds the brooklyn-server CLI with embedded configuration.
 * The CLI will know where Brooklyn is installed and can manage it from anywhere.
 */

import { chmodSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join, resolve } from "path";

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
  error: (msg: string) => console.log(`${colors.red}❌${colors.reset} ${msg}`),
  title: (msg: string) => console.log(`${colors.bold}${colors.cyan}🛠️ ${msg}${colors.reset}`),
};

interface BuildConfig {
  brooklynPath: string;
  version: string;
  outputPath: string;
}

/**
 * Get build configuration
 */
function getBuildConfig(): BuildConfig {
  const brooklynPath = process.cwd();

  // Read version from package.json
  const packageJsonPath = join(brooklynPath, "package.json");
  if (!existsSync(packageJsonPath)) {
    throw new Error("package.json not found. Run this script from Brooklyn repository root.");
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  const version = packageJson.version;

  const outputPath = join(brooklynPath, "dist", "brooklyn-server");

  return {
    brooklynPath,
    version,
    outputPath,
  };
}

/**
 * Build the CLI with embedded configuration
 */
function buildCLI(config: BuildConfig): void {
  log.title("Building Brooklyn CLI");
  log.info(`Brooklyn path: ${config.brooklynPath}`);
  log.info(`Version: ${config.version}`);
  log.info(`Output: ${config.outputPath}`);

  // Read the CLI template
  const templatePath = join(config.brooklynPath, "src", "cli", "brooklyn-server.ts");
  if (!existsSync(templatePath)) {
    throw new Error(`CLI template not found: ${templatePath}`);
  }

  let cliContent = readFileSync(templatePath, "utf8");

  // Replace template variables
  cliContent = cliContent.replace("{{BROOKLYN_PATH}}", config.brooklynPath);
  cliContent = cliContent.replace("{{BROOKLYN_VERSION}}", config.version);

  // Write the built CLI
  writeFileSync(config.outputPath, cliContent);
  chmodSync(config.outputPath, 0o755); // Make executable

  log.success("CLI built successfully");
  log.info(`Executable: ${config.outputPath}`);
}

/**
 * Test the built CLI
 */
function testCLI(config: BuildConfig): void {
  log.title("Testing CLI");

  try {
    const { execSync } = require("child_process");
    const result = execSync(`"${config.outputPath}" --version`, {
      encoding: "utf8",
      cwd: config.brooklynPath,
    });

    log.success("CLI test passed");
    log.info(`Version output: ${result.trim()}`);
  } catch (error: any) {
    log.error(`CLI test failed: ${error.message}`);
    throw error;
  }
}

/**
 * Main build function
 */
function main(): void {
  try {
    const config = getBuildConfig();

    // Ensure dist directory exists
    const distDir = join(config.brooklynPath, "dist");
    if (!existsSync(distDir)) {
      require("fs").mkdirSync(distDir, { recursive: true });
    }

    buildCLI(config);
    testCLI(config);

    console.log(`
${colors.bold}${colors.green}✅ Brooklyn CLI Build Complete!${colors.reset}

${colors.bold}What was built:${colors.reset}
- Executable CLI: ${config.outputPath}
- Embedded Brooklyn path: ${config.brooklynPath}
- Version: ${config.version}

${colors.bold}Usage:${colors.reset}
${colors.cyan}${config.outputPath} --help${colors.reset}
${colors.cyan}${config.outputPath} start${colors.reset}
${colors.cyan}${config.outputPath} status${colors.reset}

${colors.bold}Installation:${colors.reset}
Use the bootstrap script to install this CLI globally:
${colors.cyan}bun run install${colors.reset}
`);
  } catch (error: any) {
    log.error(`Build failed: ${error.message}`);
    process.exit(1);
  }
}

// Run main function if script is executed directly
if (import.meta.main) {
  main();
}
