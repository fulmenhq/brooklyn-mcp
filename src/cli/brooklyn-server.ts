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
import { fileURLToPath } from "node:url";
import { Command } from "commander";

import { getLogger } from "../shared/pino-logger.js";

// Lazy logger initialization to prevent bundled binary failures
const logger = getLogger("brooklyn-server");

// Build-time configuration - will be replaced during build
const EMBEDDED_BROOKLYN_PATH = "{{BROOKLYN_PATH}}";
const BROOKLYN_PATH = EMBEDDED_BROOKLYN_PATH.includes("{{")
  ? fileURLToPath(new URL("../../", import.meta.url))
  : EMBEDDED_BROOKLYN_PATH;
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
      // Claude Desktop on macOS uses Library/Application Support
      return join(
        homeDir,
        "Library",
        "Application Support",
        "Claude",
        "claude_desktop_config.json",
      );
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
    const servers = Object.keys(config.mcpServers || {});
    const targetNames = [
      "Brooklyn",
      "brooklyn",
      ...servers.filter((s) => /^(Brooklyn|brooklyn)-/.test(s)),
    ];
    const found = targetNames.find((name) => {
      const entry = config.mcpServers?.[name];
      if (!entry) return false;
      // Pattern A: bun-run from repo cwd
      if (entry.cwd && entry.cwd.replace(/\/?$/, "/") === BROOKLYN_PATH.replace(/\/?$/, "/")) {
        return true;
      }
      // Pattern B: installed CLI calling brooklyn mcp start
      if (typeof entry.command === "string" && /(^|\/)brooklyn$/.test(entry.command)) {
        const args = Array.isArray(entry.args) ? entry.args.map(String) : [];
        const argsStr = args.join(" ");
        if (argsStr.includes("mcp") && argsStr.includes("start")) return true;
      }
      return false;
    });
    return { configured: Boolean(found), configPath, config };
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
function setupClaudeCode(
  options: {
    project?: boolean;
    force?: boolean;
    desktop?: boolean;
    transport?: "stdio" | "http";
    host?: string;
    port?: number;
  } = {},
): void {
  const projectScope = options.project ?? false;
  const force = options.force ?? false;
  const alsoDesktop = options.desktop ?? false;
  const transport = options.transport ?? "stdio";
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 3000;
  const scopeDesc = projectScope ? "project-specific" : "user-wide";
  const serverName = getMcpServerName(projectScope);

  log.title(`Setting up Claude Code MCP (CLI) - ${scopeDesc}`);

  validateBrooklynPath();

  // Configure via Claude Code CLI (authoritative for Claude Code)
  const scopeFlag = projectScope ? "-s project" : "-s user";
  try {
    if (force) {
      try {
        execSync(`claude mcp remove ${serverName}`, { stdio: "ignore" });
      } catch {}
    }
    const exists = (() => {
      try {
        execSync(`claude mcp get ${serverName}`, { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    })();
    if (!exists || force) {
      if (transport === "stdio") {
        execSync(`claude mcp add ${scopeFlag} -t stdio ${serverName} -- brooklyn mcp start`, {
          stdio: "ignore",
        });
      } else {
        execSync(`claude mcp add ${scopeFlag} -t http ${serverName} http://${host}:${port}`, {
          stdio: "ignore",
        });
      }
    }
  } catch {
    log.warn("'claude' CLI not found or failed. Install Claude Code CLI and retry.");
  }

  // Optionally also configure Desktop JSON (legacy/optional)
  if (alsoDesktop) {
    const { configPath, config } = checkClaudeConfig();
    const configDir = dirname(configPath);
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
      log.info(`Created Claude Desktop config directory: ${configDir}`);
    }
    const claudeConfig = config || {};
    if (!claudeConfig.mcpServers) claudeConfig.mcpServers = {};
    claudeConfig.mcpServers[serverName] = { command: "brooklyn", args: ["mcp", "start"] };
    writeFileSync(configPath, JSON.stringify(claudeConfig, null, 2));
  }

  log.success(`Configured '${serverName}' for Claude Code (CLI) [${scopeDesc}]`);
  if (alsoDesktop) {
    const { configPath } = checkClaudeConfig();
    log.info(`Also wrote Claude Desktop JSON: ${configPath}`);
  }
  process.exit(0);
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
    process.exit(0);
  }

  delete config.mcpServers[serverName];
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  log.success(`MCP server '${serverName}' removed from Claude Code configuration!`);
  log.info(`Config file: ${configPath}`);
  process.exit(0);
}

/**
 * Check Claude Code configuration status
 */
function checkClaude(): void {
  try {
    const list = execSync("claude mcp list", { encoding: "utf8" });
    const has = /\bbrooklyn\b/i.test(list);
    if (!has) {
      log.info("No MCP servers configured for Claude Code (CLI)");
    } else {
      log.success("Claude Code (CLI) has an MCP entry for 'brooklyn'");
    }
  } catch {
    log.warn("'claude' CLI not found. Install Claude Code CLI to manage MCP servers.");
  }
  const { configPath, config } = checkClaudeConfig();
  const hasDesktop = Boolean(config?.mcpServers?.["brooklyn"] || config?.mcpServers?.["Brooklyn"]);
  log.info(`Claude Desktop JSON: ${hasDesktop ? "present" : "absent"} (${configPath})`);
  process.exit(0);
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
      error: error instanceof Error ? error.message : String(error),
      code: error.status,
    });

    if (error.stdout) {
      logger.info("Command stdout output", { stdout: error.stdout });
    }
    if (error.stderr) {
      logger.error("Command stderr output", { stderr: error.stderr });
    }
    process.exit(1);
  }
}

/**
 * Start Brooklyn server
 */
function startServer(): void {
  log.title("Starting Brooklyn MCP Server");

  execInBrooklyn("bun run server:start", { stdio: "inherit" });
  process.exit(0);
}

/**
 * Stop Brooklyn server
 */
function stopServer(): void {
  log.title("Stopping Brooklyn MCP Server");

  execInBrooklyn("bun run server:stop", { stdio: "inherit" });
  process.exit(0);
}

/**
 * Restart Brooklyn server
 */
function restartServer(): void {
  log.title("Restarting Brooklyn MCP Server");

  execInBrooklyn("bun run server:restart", { stdio: "inherit" });
  process.exit(0);
}

/**
 * Show server status
 */
function showStatus(): void {
  execInBrooklyn("bun run server:status", { stdio: "inherit" });
  process.exit(0);
}

/**
 * Show server logs
 */
function showLogs(options: { recent?: boolean } = {}): void {
  const command = options.recent ? "bun run server:logs:recent" : "bun run server:logs";
  execInBrooklyn(command, { stdio: "inherit" });
  // Note: Don't force exit - logs command might be continuous
}

/**
 * Clean up server resources
 */
function cleanupServer(): void {
  log.title("Cleaning up Brooklyn resources");

  execInBrooklyn("bun run server:cleanup", { stdio: "inherit" });
  process.exit(0);
}

/**
 * Show Brooklyn information
 */
function showInfo(): void {
  log.title("Brooklyn Installation Information");
  log.info(`Brooklyn Path: ${BROOKLYN_PATH}`);
  log.info(`Brooklyn Version: ${BROOKLYN_VERSION}`);

  const { configured, configPath } = checkClaudeConfig();
  log.info(`Claude Code Config: ${configPath}`);
  log.info(`Claude Code Status: ${configured ? "✅ Configured" : "❌ Not configured"}`);

  process.exit(0);
}

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
    .description(
      "Configure Claude Code MCP (CLI registry). Use --desktop to also write Desktop JSON.",
    )
    .option(
      "--project",
      "Configure as project-specific MCP server (allows multiple Brooklyn instances)",
    )
    .option("--force", "Rewrite existing entry if it exists")
    .option("--desktop", "Also configure Claude Desktop JSON (legacy/optional)")
    .option("--transport <type>", "stdio|http (default: stdio)", "stdio")
    .option("--host <host>", "HTTP host when --transport http", "127.0.0.1")
    .option("--port <port>", "HTTP port when --transport http", (v) => Number(v), 3000)
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
