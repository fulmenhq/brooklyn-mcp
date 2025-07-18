#!/usr/bin/env bun

/**
 * Brooklyn MCP Server Bootstrap Script
 *
 * This script sets up Brooklyn MCP server for AI developers by:
 * 1. Detecting OS and setting appropriate paths
 * 2. Configuring Claude Code MCP server connection
 * 3. Installing global brooklyn-server command
 * 4. Setting up and testing the server
 *
 * Usage:
 *   bun scripts/bootstrap-brooklyn.ts install
 *   bun scripts/bootstrap-brooklyn.ts remove
 *   bun run bootstrap
 */

import { execSync } from "child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { homedir, platform, type } from "os";
import { dirname, join, resolve } from "path";
import { Command } from "commander";
import inquirer from "inquirer";

// ANSI color codes for better output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bold: "\x1b[1m",
};

const log = {
  info: (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✅${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}❌${colors.reset} ${msg}`),
  title: (msg: string) => console.log(`${colors.bold}${colors.cyan}🌉 ${msg}${colors.reset}`),
  step: (msg: string) => console.log(`${colors.magenta}▶${colors.reset} ${msg}`),
};

interface BootstrapConfig {
  os: "macos" | "linux" | "windows";
  homeDir: string;
  claudeConfigPath: string;
  brooklynPath: string;
  globalBinPath: string;
  installationType: "user" | "project";
  projectPath?: string;
}

interface ClaudeConfig {
  mcpServers?: Record<
    string,
    {
      command: string;
      args: string[];
      cwd: string;
    }
  >;
}

/**
 * Detect OS and determine default paths
 */
function detectEnvironment(): Omit<
  BootstrapConfig,
  "installationType" | "projectPath" | "brooklynPath"
> {
  const osType = platform();
  const homeDir = homedir();

  let os: BootstrapConfig["os"];
  let claudeConfigPath: string;
  let globalBinPath: string;

  switch (osType) {
    case "darwin":
      os = "macos";
      claudeConfigPath = join(homeDir, ".config", "claude", "claude_desktop_config.json");
      globalBinPath = join(homeDir, ".local", "bin");
      break;
    case "linux":
      os = "linux";
      claudeConfigPath = join(homeDir, ".config", "claude", "claude_desktop_config.json");
      globalBinPath = join(homeDir, ".local", "bin");
      break;
    case "win32":
      os = "windows";
      claudeConfigPath = join(
        process.env["APPDATA"] || join(homeDir, "AppData", "Roaming"),
        "Claude",
        "claude_desktop_config.json",
      );
      globalBinPath = join(homeDir, ".local", "bin"); // Use same pattern for consistency
      break;
    default:
      throw new Error(`Unsupported OS: ${osType}`);
  }

  return {
    os,
    homeDir,
    claudeConfigPath,
    globalBinPath,
  };
}

/**
 * Verify this is a Brooklyn repository
 */
function verifyBrooklynTemplate(): void {
  const packageJsonPath = join(process.cwd(), "package.json");
  if (!existsSync(packageJsonPath)) {
    throw new Error("package.json not found. Run this script from the Brooklyn repository root.");
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (packageJson.name !== "fulmen-mcp-forge-brooklyn") {
    throw new Error("This script can only be used with the fulmen-mcp-forge-brooklyn template.");
  }

  log.success("Brooklyn template verified ✓");
}

/**
 * Get Brooklyn installation path from user
 */
async function getBrooklynPath(
  env: Omit<BootstrapConfig, "installationType" | "projectPath" | "brooklynPath">,
): Promise<Pick<BootstrapConfig, "installationType" | "projectPath" | "brooklynPath">> {
  log.step("Brooklyn Installation Configuration");

  const { installationType } = await inquirer.prompt([
    {
      type: "list",
      name: "installationType",
      message: "Choose installation type:",
      choices: [
        {
          name: "User-wide (recommended) - Install Brooklyn in standard location",
          value: "user",
        },
        {
          name: "Project-specific - Use existing Brooklyn repository",
          value: "project",
        },
      ],
      default: "user",
    },
  ]);

  if (installationType === "user") {
    const brooklynPath = join(env.homeDir, ".local", "share", "fulmen-brooklyn");
    return {
      installationType: "user",
      brooklynPath,
    };
  } else {
    const { projectPath } = await inquirer.prompt([
      {
        type: "input",
        name: "projectPath",
        message: "Enter Brooklyn repository path:",
        default: process.cwd(),
        validate: (input: string) => {
          if (!existsSync(join(input, "package.json"))) {
            return "Brooklyn repository not found at this path";
          }
          return true;
        },
      },
    ]);

    return {
      installationType: "project",
      projectPath,
      brooklynPath: projectPath,
    };
  }
}

/**
 * Clone Brooklyn repository for user-wide installation
 */
async function cloneBrooklyn(brooklynPath: string): Promise<void> {
  log.step("Cloning Brooklyn repository...");

  if (existsSync(brooklynPath)) {
    log.warn(`Brooklyn already exists at: ${brooklynPath}`);
    const { overwrite } = await inquirer.prompt([
      {
        type: "confirm",
        name: "overwrite",
        message: "Overwrite existing installation?",
        default: false,
      },
    ]);
    if (!overwrite) {
      log.info("Using existing Brooklyn installation");
      return;
    }

    // Remove existing directory
    execSync(`rm -rf "${brooklynPath}"`);
  }

  // Create parent directory
  mkdirSync(dirname(brooklynPath), { recursive: true });

  // Clone repository
  const repoUrl = "https://github.com/3leaps/fulmen-mcp-forge-brooklyn.git";
  execSync(`git clone "${repoUrl}" "${brooklynPath}"`);

  log.success(`Brooklyn cloned to: ${brooklynPath}`);
}

/**
 * Set up Brooklyn server (install dependencies, setup browsers)
 */
async function setupBrooklyn(brooklynPath: string): Promise<void> {
  log.step("Setting up Brooklyn server...");

  // Change to Brooklyn directory
  process.chdir(brooklynPath);

  // Install dependencies
  log.info("Installing dependencies...");
  execSync("bun install", { stdio: "inherit" });

  // Setup browsers
  log.info("Setting up Playwright browsers...");
  execSync("bun run setup", { stdio: "inherit" });

  log.success("Brooklyn server setup complete");
}

/**
 * Create or update Claude Code configuration
 */
async function configureClaudeCode(config: BootstrapConfig): Promise<void> {
  log.step("Configuring Claude Code...");

  // Ensure Claude config directory exists
  const claudeDir = dirname(config.claudeConfigPath);
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
    log.info(`Created Claude config directory: ${claudeDir}`);
  }

  // Read existing configuration or create new
  let claudeConfig: ClaudeConfig = {};
  if (existsSync(config.claudeConfigPath)) {
    try {
      const configText = readFileSync(config.claudeConfigPath, "utf8");
      claudeConfig = JSON.parse(configText);
      log.info("Loaded existing Claude configuration");
    } catch (error) {
      log.warn("Failed to parse existing Claude config, creating new one");
      claudeConfig = {};
    }
  }

  // Ensure mcpServers section exists
  if (!claudeConfig.mcpServers) {
    claudeConfig.mcpServers = {};
  }

  // Add Brooklyn MCP server configuration
  claudeConfig.mcpServers["brooklyn"] = {
    command: "bun",
    args: ["run", "start"],
    cwd: config.brooklynPath,
  };

  // Write configuration
  writeFileSync(config.claudeConfigPath, JSON.stringify(claudeConfig, null, 2));
  log.success(`Claude Code configured: ${config.claudeConfigPath}`);

  // Show configuration for user verification
  console.log(`
${colors.bold}Brooklyn MCP Server Configuration:${colors.reset}
{
  "mcpServers": {
    "brooklyn": {
      "command": "bun",
      "args": ["run", "start"],
      "cwd": "${config.brooklynPath}"
    }
  }
}
`);
}

/**
 * Install global brooklyn-server command
 */
async function installGlobalCommand(config: BootstrapConfig): Promise<void> {
  log.step("Installing global brooklyn-server command...");

  // Ensure global bin directory exists
  if (!existsSync(config.globalBinPath)) {
    mkdirSync(config.globalBinPath, { recursive: true });
    log.info(`Created global bin directory: ${config.globalBinPath}`);
  }

  // First, build the CLI (if not already built)
  const cliSourcePath = join(config.brooklynPath, "dist", "brooklyn-server");
  if (!existsSync(cliSourcePath)) {
    log.info("Building Brooklyn CLI...");
    // Change to Brooklyn directory and build
    process.chdir(config.brooklynPath);
    execSync("bun run build", { stdio: "inherit" });
  }

  // Copy built CLI to global bin
  const cliTargetPath = join(config.globalBinPath, "brooklyn-server");
  const { copyFileSync } = require("fs");
  copyFileSync(cliSourcePath, cliTargetPath);
  chmodSync(cliTargetPath, 0o755);

  log.success(`Global command installed: ${cliTargetPath}`);

  // Check if global bin is in PATH
  const pathEnv = process.env["PATH"] || "";
  if (!pathEnv.includes(config.globalBinPath)) {
    log.warn(`${config.globalBinPath} is not in your PATH`);
    console.log(`
${colors.yellow}To use brooklyn-server globally, add this to your shell profile:${colors.reset}
${colors.cyan}export PATH="$PATH:${config.globalBinPath}"${colors.reset}

Or run commands with full path:
${colors.cyan}${cliTargetPath} status${colors.reset}
`);
  }
}

/**
 * Test Brooklyn server connection
 */
async function testConnection(config: BootstrapConfig): Promise<void> {
  log.step("Testing Brooklyn server...");

  // Change to Brooklyn directory
  process.chdir(config.brooklynPath);

  // Start server if not running
  try {
    execSync("bun run server:status", { stdio: "pipe" });
    log.info("Server is already running");
  } catch (error) {
    log.info("Starting Brooklyn server...");
    execSync("bun run server:start", { stdio: "inherit" });
  }

  // Test server status
  try {
    const status = execSync("bun run server:status", { encoding: "utf8" });
    log.success("Brooklyn server is running!");
    console.log(status);
  } catch (error) {
    log.error("Failed to get server status");
    throw error;
  }
}

/**
 * Remove Brooklyn MCP server installation
 */
async function removeBrooklyn(): Promise<void> {
  log.title("Brooklyn MCP Server Removal");

  const { confirmRemoval } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirmRemoval",
      message: "Are you sure you want to remove Brooklyn MCP server?",
      default: false,
    },
  ]);

  if (!confirmRemoval) {
    log.info("Removal cancelled");
    return;
  }

  try {
    const env = detectEnvironment();
    log.success(`Detected OS: ${env.os}`);

    // Remove global brooklyn-server command
    const globalCommandPath = join(env.globalBinPath, "brooklyn-server");
    if (existsSync(globalCommandPath)) {
      rmSync(globalCommandPath);
      log.success("Removed global brooklyn-server command");
    }

    // Ask about removing Claude Code configuration
    const { removeClaudeConfig } = await inquirer.prompt([
      {
        type: "confirm",
        name: "removeClaudeConfig",
        message: "Remove Brooklyn from Claude Code configuration?",
        default: true,
      },
    ]);

    if (removeClaudeConfig && existsSync(env.claudeConfigPath)) {
      const configText = readFileSync(env.claudeConfigPath, "utf8");
      const claudeConfig = JSON.parse(configText);

      if (claudeConfig.mcpServers?.["brooklyn"]) {
        delete claudeConfig.mcpServers["brooklyn"];
        writeFileSync(env.claudeConfigPath, JSON.stringify(claudeConfig, null, 2));
        log.success("Removed Brooklyn from Claude Code configuration");
      }
    }

    // Ask about removing user-wide installation
    const userBrooklynPath = join(env.homeDir, ".local", "share", "fulmen-brooklyn");
    if (existsSync(userBrooklynPath)) {
      const { removeUserInstallation } = await inquirer.prompt([
        {
          type: "confirm",
          name: "removeUserInstallation",
          message: `Remove user-wide Brooklyn installation at ${userBrooklynPath}?`,
          default: false,
        },
      ]);

      if (removeUserInstallation) {
        rmSync(userBrooklynPath, { recursive: true, force: true });
        log.success("Removed user-wide Brooklyn installation");
      }
    }

    log.title("Brooklyn Removal Complete! 🧹");
    console.log(`
${colors.green}✅ Brooklyn MCP Server has been removed!${colors.reset}

${colors.bold}What was removed:${colors.reset}
- Global brooklyn-server command
- Claude Code MCP server configuration
- User-wide installation (if requested)

${colors.yellow}Note: Project-specific installations are left untouched${colors.reset}
`);
  } catch (error) {
    log.error(`Removal failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Main bootstrap function
 */
async function bootstrap(): Promise<void> {
  log.title("Brooklyn MCP Server Bootstrap");
  console.log(`
${colors.bold}Welcome to Brooklyn MCP Server Setup!${colors.reset}

This script will:
1. 🔍 Detect your OS and set appropriate paths
2. 📦 Install or configure Brooklyn MCP server
3. ⚙️  Configure Claude Code integration
4. 🛠️  Install global brooklyn-server command
5. 🧪 Test the server connection

${colors.yellow}Make sure you have Bun installed: https://bun.sh${colors.reset}
`);

  const { proceed } = await inquirer.prompt([
    {
      type: "confirm",
      name: "proceed",
      message: "Continue with setup?",
      default: true,
    },
  ]);

  if (!proceed) {
    log.info("Setup cancelled");
    return;
  }

  try {
    // Detect environment
    const env = detectEnvironment();
    log.success(`Detected OS: ${env.os}`);
    log.info(`Home directory: ${env.homeDir}`);
    log.info(`Claude config: ${env.claudeConfigPath}`);

    // Get Brooklyn installation configuration
    const installConfig = await getBrooklynPath(env);
    const config: BootstrapConfig = {
      ...env,
      ...installConfig,
    };

    log.info(`Brooklyn path: ${config.brooklynPath}`);

    // Clone Brooklyn if user-wide installation
    if (config.installationType === "user") {
      await cloneBrooklyn(config.brooklynPath);
    }

    // Setup Brooklyn server
    await setupBrooklyn(config.brooklynPath);

    // Configure Claude Code
    await configureClaudeCode(config);

    // Install global command
    await installGlobalCommand(config);

    // Test connection
    await testConnection(config);

    // Success message
    log.title("Brooklyn Setup Complete! 🎉");
    console.log(`
${colors.green}✅ Brooklyn MCP Server is ready!${colors.reset}

${colors.bold}Next steps:${colors.reset}
1. ${colors.cyan}Restart Claude Code${colors.reset} to load the new MCP server configuration
2. ${colors.cyan}Test the connection${colors.reset} by running: brooklyn_status
3. ${colors.cyan}Start automating${colors.reset} with commands like: "Launch a browser and navigate to example.com"

${colors.bold}Global Commands:${colors.reset}
- ${colors.cyan}brooklyn-server start${colors.reset}   - Start the server
- ${colors.cyan}brooklyn-server status${colors.reset}  - Check server status
- ${colors.cyan}brooklyn-server logs${colors.reset}    - View server logs
- ${colors.cyan}brooklyn-server stop${colors.reset}    - Stop the server

${colors.bold}Brooklyn Installation:${colors.reset}
- Path: ${config.brooklynPath}
- Type: ${config.installationType}
- Global Command: ${join(config.globalBinPath, "brooklyn-server")}

${colors.yellow}Remember: You can always run this bootstrap script again to reconfigure!${colors.reset}
`);
  } catch (error) {
    log.error(`Setup failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * CLI Setup and Main Execution
 */
async function main(): Promise<void> {
  // Verify this is a Brooklyn template repository
  verifyBrooklynTemplate();

  const program = new Command();

  program
    .name("brooklyn-bootstrap")
    .description("Brooklyn MCP Server Bootstrap Script")
    .version("1.0.0");

  program
    .command("install")
    .description("Install Brooklyn MCP server")
    .action(async () => {
      await bootstrap();
    });

  program
    .command("remove")
    .description("Remove Brooklyn MCP server installation")
    .action(async () => {
      await removeBrooklyn();
    });

  // Default action (install)
  program.action(async () => {
    await bootstrap();
  });

  await program.parseAsync(process.argv);
}

// Run main function if script is executed directly
if (import.meta.main) {
  main().catch((error) => {
    log.error(`Script failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
