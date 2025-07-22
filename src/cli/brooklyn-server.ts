#!/usr/bin/env bun

/**
 * Brooklyn MCP Server CLI
 *
 * Global command-line interface for managing Brooklyn MCP server.
 * This CLI is built and installed by the bootstrap script.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { Command } from "commander";

import { getLogger } from "../shared/structured-logger.js";

const logger = getLogger("brooklyn-server");

// Build-time configuration - will be replaced during build
const BROOKLYN_PATH = "{{BROOKLYN_PATH}}";
const BROOKLYN_VERSION = "{{BROOKLYN_VERSION}}";

// ANSI color codes
const _colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

const log = {
  info: (_msg: string) => {},
  success: (_msg: string) => {},
  warn: (_msg: string) => {},
  error: (_msg: string) => {},
  title: (_msg: string) => {},
};

/**
 * Validate Brooklyn installation
 */
function validateBrooklynPath(): void {
  if (!existsSync(BROOKLYN_PATH)) {
    log.error(`Brooklyn not found at: ${BROOKLYN_PATH}`);
    process.exit(1);
  }

  const packageJsonPath = join(BROOKLYN_PATH, "package.json");
  if (!existsSync(packageJsonPath)) {
    log.error(`Invalid Brooklyn installation: ${BROOKLYN_PATH}`);
    process.exit(1);
  }
}

/**
 * Get Claude Code configuration file path based on OS
 */
function getClaudeConfigPath(): string {
  const homeDir = homedir();
  const osType = platform();

  switch (osType) {
    case "darwin":
    case "linux":
      return join(homeDir, ".config", "claude", "claude_desktop_config.json");
    case "win32": {
      const appData = process.env["APPDATA"] || join(homeDir, "AppData", "Roaming");
      return join(appData, "Claude", "claude_desktop_config.json");
    }
    default:
      throw new Error(`Unsupported OS: ${osType}`);
  }
}

/**
 * Check if Brooklyn is configured in Claude Code
 */
function checkClaudeConfig(): { configured: boolean; configPath: string; config?: any } {
  const configPath = getClaudeConfigPath();

  if (!existsSync(configPath)) {
    return { configured: false, configPath };
  }

  try {
    const configText = readFileSync(configPath, "utf8");
    const config = JSON.parse(configText);
    const hasBrooklyn = config.mcpServers?.brooklyn?.cwd === BROOKLYN_PATH;

    return { configured: hasBrooklyn, configPath, config };
  } catch (_error) {
    return { configured: false, configPath };
  }
}

/**
 * Get MCP server name based on installation type and options
 */
function getMcpServerName(projectScope: boolean): string {
  if (projectScope) {
    // Use path-based naming for project scope
    const pathParts = BROOKLYN_PATH.split("/");
    const projectName = pathParts[pathParts.length - 1] || "brooklyn";
    return `brooklyn-${projectName}`;
  }
  return "brooklyn";
}

/**
 * Setup Brooklyn MCP server in Claude Code configuration
 */
function setupClaudeCode(options: { project?: boolean } = {}): void {
  const projectScope = options.project ?? false;
  const scopeDesc = projectScope ? "project-specific" : "user-wide";
  const serverName = getMcpServerName(projectScope);

  log.title(`Setting up ${scopeDesc} Claude Code MCP Configuration`);

  validateBrooklynPath();

  const { configPath, config } = checkClaudeConfig();
  const existingConfig = config?.mcpServers?.[serverName];
  const isConfigured = existingConfig?.cwd === BROOKLYN_PATH;

  if (isConfigured) {
    log.success(`✅ Brooklyn is already configured as '${serverName}' in Claude Code!`);
    log.info(`Config file: ${configPath}`);
    log.info(`Scope: ${scopeDesc}`);
    return;
  }

  // Check for conflicts with other Brooklyn instances
  if (config?.mcpServers?.[serverName] && !isConfigured) {
    log.warn(
      `MCP server '${serverName}' already exists but points to different Brooklyn installation`,
    );
    return;
  }

  // Ensure config directory exists
  const configDir = dirname(configPath);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
    log.info(`Created Claude config directory: ${configDir}`);
  }

  // Create or update configuration
  const claudeConfig = config || {};
  if (!claudeConfig.mcpServers) {
    claudeConfig.mcpServers = {};
  }

  claudeConfig.mcpServers[serverName] = {
    command: "bun",
    args: ["run", "start"],
    cwd: BROOKLYN_PATH,
  };

  writeFileSync(configPath, JSON.stringify(claudeConfig, null, 2));

  log.success(`Brooklyn MCP server configured as '${serverName}' in Claude Code!`);
  log.info(`Config file: ${configPath}`);
  log.info(`Scope: ${scopeDesc}`);
}

/**
 * Remove Brooklyn from Claude Code configuration
 */
function removeFromClaude(options: { project?: boolean } = {}): void {
  const projectScope = options.project ?? false;
  const serverName = getMcpServerName(projectScope);

  log.title(`Removing Brooklyn MCP server '${serverName}' from Claude Code`);

  const { configPath, config } = checkClaudeConfig();

  if (!config?.mcpServers?.[serverName]) {
    log.info(`MCP server '${serverName}' is not configured in Claude Code`);

    // Check for other Brooklyn instances
    const brooklynServers = Object.keys(config?.mcpServers || {}).filter(
      (name) => name.startsWith("brooklyn") && config.mcpServers[name].cwd === BROOKLYN_PATH,
    );

    if (brooklynServers.length > 0) {
    }
    return;
  }

  delete config.mcpServers[serverName];
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  log.success(`MCP server '${serverName}' removed from Claude Code configuration!`);
  log.info(`Config file: ${configPath}`);
}

/**
 * Check Claude Code configuration status
 */
function checkClaude(): void {
  const { configPath, config } = checkClaudeConfig();

  if (!config?.mcpServers) {
    return;
  }

  // Find all Brooklyn-related servers
  const brooklynServers = Object.entries(config.mcpServers)
    .filter(([name, _serverConfig]: [string, any]) => name.startsWith("brooklyn"))
    .map(([name, serverConfig]: [string, any]) => ({
      name,
      config: serverConfig,
      isThisInstance: serverConfig.cwd === BROOKLYN_PATH,
    }));

  if (brooklynServers.length === 0) {
    return;
  }
  brooklynServers.forEach(({ name, config: serverConfig, isThisInstance }) => {
    const _status = isThisInstance ? "✅ This instance" : "❌ Different instance";
  });

  const thisInstanceConfigured = brooklynServers.some((s) => s.isThisInstance);

  if (!thisInstanceConfigured) {
  }
}

/**
 * Execute command in Brooklyn directory
 */
function execInBrooklyn(command: string, options: { stdio?: "inherit" | "pipe" } = {}): string {
  validateBrooklynPath();

  try {
    const result = execSync(command, {
      cwd: BROOKLYN_PATH,
      encoding: "utf8",
      stdio: options.stdio || "pipe",
    });

    return typeof result === "string" ? result : "";
  } catch (error: any) {
    logger.error("Brooklyn command failed", {
      command,
      error: error.message,
      stdout: error.stdout,
      stderr: error.stderr,
    });
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.error(error.stderr);
    process.exit(1);
  }
}

/**
 * Start Brooklyn server
 */
function startServer(): void {
  log.title("Starting Brooklyn MCP Server");

  execInBrooklyn("bun run server:start", { stdio: "inherit" });
}

/**
 * Stop Brooklyn server
 */
function stopServer(): void {
  log.title("Stopping Brooklyn MCP Server");

  execInBrooklyn("bun run server:stop", { stdio: "inherit" });
}

/**
 * Restart Brooklyn server
 */
function restartServer(): void {
  log.title("Restarting Brooklyn MCP Server");

  execInBrooklyn("bun run server:restart", { stdio: "inherit" });
}

/**
 * Show server status
 */
function showStatus(): void {
  execInBrooklyn("bun run server:status", { stdio: "inherit" });
}

/**
 * Show server logs
 */
function showLogs(options: { recent?: boolean } = {}): void {
  const command = options.recent ? "bun run server:logs:recent" : "bun run server:logs";
  execInBrooklyn(command, { stdio: "inherit" });
}

/**
 * Clean up server resources
 */
function cleanupServer(): void {
  log.title("Cleaning up Brooklyn resources");

  execInBrooklyn("bun run server:cleanup", { stdio: "inherit" });
}

/**
 * Show Brooklyn information
 */
function showInfo(): void {}

/**
 * Main CLI setup
 */
function main(): void {
  const program = new Command();

  program.name("brooklyn-server").description("Brooklyn MCP Server CLI").version(BROOKLYN_VERSION);

  program
    .command("start")
    .description("Start the Brooklyn server")
    .action(() => {
      startServer();
    });

  program
    .command("stop")
    .description("Stop the Brooklyn server")
    .action(() => {
      stopServer();
    });

  program
    .command("restart")
    .description("Restart the Brooklyn server")
    .action(() => {
      restartServer();
    });

  program
    .command("status")
    .description("Show server status")
    .action(() => {
      showStatus();
    });

  program
    .command("logs")
    .description("Show server logs")
    .option("--recent", "Show recent logs only")
    .action((options) => {
      showLogs(options);
    });

  program
    .command("cleanup")
    .description("Clean up server resources")
    .action(() => {
      cleanupServer();
    });

  program
    .command("setup-claude")
    .description("Configure Claude Code MCP connection")
    .option(
      "--project",
      "Configure as project-specific MCP server (allows multiple Brooklyn instances)",
    )
    .action((options) => {
      setupClaudeCode(options);
    });

  program
    .command("remove-claude")
    .description("Remove Brooklyn from Claude Code configuration")
    .option("--project", "Remove project-specific MCP server configuration")
    .action((options) => {
      removeFromClaude(options);
    });

  program
    .command("check-claude")
    .description("Check Claude Code configuration status")
    .action(() => {
      checkClaude();
    });

  program
    .command("info")
    .description("Show Brooklyn installation information")
    .action(() => {
      showInfo();
    });

  // Default action shows help
  program.action(() => {
    showInfo();
  });

  program.parse(process.argv);
}

// Run main function
if (import.meta.main) {
  main();
}
