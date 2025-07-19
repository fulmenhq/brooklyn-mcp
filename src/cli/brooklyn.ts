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

import { Command } from "commander";
import { BrooklynEngine, type BrooklynEngineOptions } from "../core/brooklyn-engine.js";
import { type BrooklynConfig, loadConfig } from "../core/config.js";
import { getLogger, initializeLogging } from "../shared/structured-logger.js";
import { createHTTP, createMCPStdio } from "../transports/index.js";

// Version will be embedded at build time
const VERSION = "{{VERSION}}";

const logger = getLogger("brooklyn-cli");

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
        logger.info("Starting Brooklyn MCP server", { mode: "mcp-stdio" });

        // Load configuration with CLI overrides
        const cliOverrides: Partial<BrooklynConfig> = {};
        if (options.teamId) cliOverrides.teamId = options.teamId;
        if (options.logLevel) cliOverrides.logging = { level: options.logLevel, format: "json" };

        const config = await loadConfig(cliOverrides);

        // Initialize logging for MCP mode (stderr only)
        initializeLogging(config);

        // Create Brooklyn engine
        const engine = new BrooklynEngine({
          config,
          correlationId: `mcp-start-${Date.now()}`,
        });

        // Create and add MCP transport
        const mcpTransport = await createMCPStdio();
        await engine.addTransport("mcp", mcpTransport);

        // Start MCP transport (this will connect to stdin/stdout)
        await engine.startTransport("mcp");

        // Process will stay alive until stdin is closed by Claude Code
        logger.info("MCP server started successfully", {
          transport: "stdio",
          teamId: config.teamId,
        });
      } catch (error) {
        logger.error("Failed to start MCP server", {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    });

  mcpCmd
    .command("status")
    .description("Check MCP server status")
    .action(async () => {
      // TODO: Implement MCP status checking
      console.log("MCP status check not yet implemented");
    });

  mcpCmd
    .command("configure")
    .description("Configure Claude Code MCP integration")
    .option("--project", "Configure for project-specific scope")
    .action(async (options) => {
      // TODO: Implement Claude Code configuration
      console.log("MCP configuration not yet implemented");
    });
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
        logger.info("Starting Brooklyn web server", {
          mode: "http",
          port: options.port,
          daemon: options.daemon,
        });

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
        logger.error("Failed to start web server", {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    });

  webCmd
    .command("stop")
    .description("Stop web server daemon")
    .action(async () => {
      // TODO: Implement daemon stop using PID files
      console.log("Web server stop not yet implemented");
    });

  webCmd
    .command("status")
    .description("Check web server status")
    .action(async () => {
      // TODO: Implement web server status checking
      console.log("Web server status check not yet implemented");
    });
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

        logger.info("Brooklyn Status Check", { version: VERSION });

        // TODO: Implement comprehensive status checking
        console.log(`
🌉 Brooklyn MCP Server Status

Version: ${VERSION}
Team ID: ${config.teamId}
Environment: ${config.environment}

MCP Server: ❓ Status check not implemented
Web Server: ❓ Status check not implemented  
Browsers: ❓ Browser check not implemented
Configuration: ✅ Loaded successfully

Use 'brooklyn mcp status' or 'brooklyn web status' for specific services.
        `);
      } catch (error) {
        logger.error("Status check failed", {
          error: error instanceof Error ? error.message : String(error),
        });
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
        logger.info("Brooklyn setup starting", { options });

        // TODO: Implement browser installation
        console.log(`
🔧 Brooklyn Setup

Browser Installation: Not yet implemented
${options.browser ? `Target browser: ${options.browser}` : "Installing all browsers"}
${options.check ? "Check mode: Status only" : "Install mode: Will install missing browsers"}

This feature will be implemented in Phase 4.
        `);
      } catch (error) {
        logger.error("Setup failed", {
          error: error instanceof Error ? error.message : String(error),
        });
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
    .action(() => {
      console.log(`
🌉 Brooklyn MCP Server

Version: ${VERSION}
Runtime: Bun ${process.versions.bun}
Platform: ${process.platform}
Architecture: ${process.arch}

Repository: https://github.com/3leaps/fulmen-mcp-forge-brooklyn
Documentation: https://docs.brooklyn.dev
      `);
    });
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
    program.action(() => {
      console.log(`
🌉 Brooklyn MCP Server - Enterprise Browser Automation

Usage: brooklyn <command> [options]

Commands:
  mcp <subcommand>    MCP server for Claude Code integration
  web <subcommand>    Web server for monitoring and APIs  
  status              Show status of all services
  setup               Install browsers and configure Brooklyn
  version             Show version information

Examples:
  brooklyn mcp start                 # Start MCP server for Claude Code
  brooklyn web start --port 3000     # Start web server on port 3000
  brooklyn status                    # Show all service status
  brooklyn setup                     # Install browsers
  
Use 'brooklyn <command> --help' for more information about specific commands.
      `);
    });

    // Parse command line arguments
    await program.parseAsync(process.argv);
  } catch (error) {
    const errorLogger = getLogger("brooklyn-cli-error");
    errorLogger.error("CLI execution failed", {
      error: error instanceof Error ? error.message : String(error),
    });
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
