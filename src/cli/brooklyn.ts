#!/usr/bin/env bun

/**
 * Brooklyn MCP Server - Unified CLI
 *
 * Single binary that handles both MCP and web server modes:
 * - brooklyn mcp start    (Claude Code integration via stdin/stdout)
 * - brooklyn web start    (HTTP server for monitoring/APIs)
 * - brooklyn status       (Show all modes)
 * - brooklyn setup        (Browser installation and configuration)
 */

import { initializeLogging } from "../shared/structured-logger.js";

// ARCHITECTURE COMMITTEE IMMEDIATE FIX:
// Initialize logging BEFORE any other imports to avoid circular dependency issues.
// This prevents "Logger registry not initialized" errors during module loading.
//
// Create minimal config that matches BrooklynConfig structure
const minimalConfig = {
  serviceName: "brooklyn-mcp-server",
  version: "1.1.0",
  environment: "production",
  teamId: "default",
  logging: {
    level: process.env["BROOKLYN_LOG_LEVEL"] || "info",
    format: "json" as const,
    maxFiles: 5,
    maxSize: "10MB",
  },
  transports: {
    mcp: { enabled: true },
    web: { enabled: false },
  },
  browsers: {
    maxInstances: 10,
    defaultType: "chromium" as const,
    headless: true,
    timeout: 30000,
  },
  security: {
    allowedDomains: ["*"],
    rateLimit: {
      requests: 100,
      windowMs: 60000,
    },
  },
  plugins: {
    directory: "",
    autoLoad: true,
    allowUserPlugins: true,
  },
  paths: {
    config: "",
    logs: "",
    data: "",
  },
};

initializeLogging(minimalConfig as any);

import { Command } from "commander";
import { BrooklynEngine, type BrooklynEngineOptions } from "../core/brooklyn-engine.js";
import { type BrooklynConfig, loadConfig } from "../core/config.js";
import { getLogger } from "../shared/structured-logger.js";
import { createHTTP, createMCPStdio } from "../transports/index.js";

// Version will be embedded at build time
const VERSION = "{{VERSION}}";

// Logger will be initialized after configuration is loaded

/**
 * MCP command group - Claude Code integration
 */
function setupMCPCommands(program: Command): void {
  const mcpCmd = program
    .command("mcp")
    .description("MCP server commands for Claude Code integration");

  mcpCmd
    .command("start")
    .description("Start MCP server (stdin/stdout mode for Claude Code)")
    .option("--team-id <teamId>", "Team identifier")
    .option("--log-level <level>", "Log level (debug, info, warn, error)")
    .action(async (options) => {
      try {
        // Load configuration with CLI overrides
        const cliOverrides: Partial<BrooklynConfig> = {};
        if (options.teamId) cliOverrides.teamId = options.teamId;
        if (options.logLevel) cliOverrides.logging = { level: options.logLevel, format: "json" };

        const config = await loadConfig(cliOverrides);

        // Note: Logging already initialized at module top to prevent circular dependency issues
        const logger = getLogger("brooklyn-cli");

        logger.info("Starting Brooklyn MCP server", { mode: "mcp-stdio" });

        // Create Brooklyn engine
        console.error("DEBUG: Creating BrooklynEngine...");
        const engine = new BrooklynEngine({
          config,
          correlationId: `mcp-start-${Date.now()}`,
        });

        // Create and add MCP transport
        console.error("DEBUG: Creating MCP transport...");
        const mcpTransport = await createMCPStdio();
        console.error("DEBUG: Adding transport to engine...");
        await engine.addTransport("mcp", mcpTransport);

        // Start MCP transport (this will connect to stdin/stdout)
        await engine.startTransport("mcp");

        // Process will stay alive until stdin is closed by Claude Code
        logger.info("MCP server started successfully", {
          transport: "stdio",
          teamId: config.teamId,
        });
      } catch (error) {
        console.error(
          "Failed to start MCP server:",
          error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
      }
    });

  mcpCmd
    .command("status")
    .description("Check MCP server status")
    .action(async () => {});

  mcpCmd
    .command("configure")
    .description("Configure Claude Code MCP integration")
    .option("--project", "Configure for project-specific scope")
    .action(async (_options) => {});
}

/**
 * Web command group - HTTP server mode
 */
function setupWebCommands(program: Command): void {
  const webCmd = program.command("web").description("Web server commands for monitoring and APIs");

  webCmd
    .command("start")
    .description("Start HTTP web server")
    .option("--port <port>", "HTTP port", "3000")
    .option("--host <host>", "HTTP host", "localhost")
    .option("--daemon", "Run as background daemon")
    .option("--team-id <teamId>", "Team identifier")
    .option("--log-level <level>", "Log level (debug, info, warn, error)")
    .action(async (options) => {
      try {
        // Load configuration with CLI overrides
        const cliOverrides: Partial<BrooklynConfig> = {};
        if (options.teamId) cliOverrides.teamId = options.teamId;
        if (options.logLevel) cliOverrides.logging = { level: options.logLevel, format: "json" };
        if (options.port) {
          cliOverrides.transports = {
            mcp: {
              enabled: true,
            },
            http: {
              enabled: true,
              port: Number.parseInt(options.port, 10),
              host: "localhost",
              cors: true,
              rateLimiting: false,
            },
          };
        }

        const config = await loadConfig(cliOverrides);

        // Initialize logging for web mode
        initializeLogging(config);
        const logger = getLogger("brooklyn-cli");

        logger.info("Starting Brooklyn web server", {
          mode: "http",
          port: options.port,
          daemon: options.daemon,
        });

        // Create Brooklyn engine
        const engine = new BrooklynEngine({
          config,
          correlationId: `web-start-${Date.now()}`,
        });

        // Create and add HTTP transport
        const httpTransport = await createHTTP(
          Number.parseInt(options.port, 10),
          options.host,
          true, // CORS enabled
        );
        await engine.addTransport("http", httpTransport);

        // Start HTTP transport
        await engine.startTransport("http");

        logger.info("Web server started successfully", {
          url: `http://${options.host}:${options.port}`,
          teamId: config.teamId,
        });

        // Handle graceful shutdown
        const shutdown = async () => {
          logger.info("Shutting down web server");
          await engine.cleanup();
          process.exit(0);
        };

        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);

        if (!options.daemon) {
          logger.info("Web server running (press Ctrl+C to stop)");
          // Keep process alive for non-daemon mode
          process.stdin.resume();
        }
      } catch (error) {
        console.error(
          "Failed to start web server:",
          error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
      }
    });

  webCmd
    .command("stop")
    .description("Stop web server daemon")
    .action(async () => {});

  webCmd
    .command("status")
    .description("Check web server status")
    .action(async () => {});
}

/**
 * Global status command
 */
function setupStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show status of all Brooklyn services")
    .action(async () => {
      try {
        // Load configuration
        const config = await loadConfig();
        initializeLogging(config);
        const logger = getLogger("brooklyn-cli");

        logger.info("Brooklyn Status Check", { version: VERSION });
      } catch (error) {
        console.error(
          "Status check failed:",
          error instanceof Error ? error.message : String(error),
        );
        process.exit(1);
      }
    });
}

/**
 * Setup command for browser installation
 */
function setupSetupCommand(program: Command): void {
  program
    .command("setup")
    .description("Install browsers and configure Brooklyn")
    .option("--browser <type>", "Install specific browser (chromium, firefox, webkit)")
    .option("--check", "Check installation status only")
    .action(async (options) => {
      try {
        // Load minimal config for logging
        const config = await loadConfig();
        initializeLogging(config);
        const logger = getLogger("brooklyn-cli");

        logger.info("Brooklyn setup starting", { options });
      } catch (error) {
        console.error("Setup failed:", error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * Version command
 */
function setupVersionCommand(program: Command): void {
  program
    .command("version")
    .description("Show Brooklyn version information")
    .action(() => {});
}

/**
 * Main CLI setup
 */
async function main(): Promise<void> {
  try {
    const program = new Command();

    program
      .name("brooklyn")
      .description("Brooklyn MCP Server - Enterprise browser automation platform")
      .version(VERSION)
      .option("-v, --verbose", "Enable verbose logging")
      .option("--config <path>", "Configuration file path");

    // Set up command groups
    setupMCPCommands(program);
    setupWebCommands(program);
    setupStatusCommand(program);
    setupSetupCommand(program);
    setupVersionCommand(program);

    // Default action - show help
    program.action(() => {});

    // Parse command line arguments
    await program.parseAsync(process.argv);
  } catch (error) {
    console.error("CLI execution failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Export for testing
export { main };

// Run main function if this file is executed directly
if (import.meta.main) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
