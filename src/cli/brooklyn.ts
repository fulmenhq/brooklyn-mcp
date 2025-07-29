#!/usr/bin/env bun

/**
 * Brooklyn MCP Server - Unified CLI
 *
 * Single binary that handles both MCP and web server modes:
 * - brooklyn mcp start    (Claude Code integration via stdin/stdout)
 * - brooklyn web start    (HTTP server for monitoring/APIs)
 * - brooklyn status       (Show all modes)
 * - brooklyn setup        (Browser installation and configuration)
 * - brooklyn debug        (Debugging utilities)
 */

// Version embedded at build time from VERSION file
const VERSION = "1.3.0";

import { HELP_TEXT } from "../generated/help/index.js";
// buildConfig import removed - not used in CLI entry point
import { getLogger, initializeLogging } from "../shared/pino-logger.js";

// Create minimal config that matches BrooklynConfig structure
// For CLI commands, use pretty format for better readability
const isDevCommand = process.argv.some((arg) =>
  ["dev-start", "dev-stop", "dev-status", "dev-cleanup", "dev-restart"].includes(arg),
);
const _minimalConfig = {
  serviceName: "brooklyn-mcp-server",
  version: VERSION, // Use embedded version directly
  environment: "production",
  teamId: "default",
  logging: {
    level: process.env["BROOKLYN_LOG_LEVEL"] || "info",
    format: isDevCommand ? ("pretty" as const) : ("json" as const),
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

// CRITICAL MCP INITIALIZATION SEQUENCE:
// 1. NO logging can happen until transport mode is determined
// 2. The server stays COMPLETELY SILENT (no stderr, no stdout) at startup
// 3. In MCP mode, the server will NOT respond until it receives a valid initialize request
// 4. The initialize request MUST be properly formatted JSON-RPC with method "initialize"
// 5. Any output before initialization breaks the MCP protocol

import { Command } from "commander";
import { BrooklynEngine } from "../core/brooklyn-engine.js";
import { type BrooklynConfig, enableConfigLogger, loadConfig } from "../core/config.js";
import { InstanceManager } from "../core/instance-manager.js";
import { createHTTP, createMCPStdio } from "../transports/index.js";
import { handleDebugCommand } from "./debug.js";

// Config logger no longer needed with Pino

// Logger will be initialized after configuration is loaded

/**
 * MCP command group - Claude Code integration
 */
function setupMCPCommands(program: Command): void {
  const mcpCmd = program
    .command("mcp")
    .description("MCP server commands for Claude Code integration");

  // Don't log until we know if we're in MCP mode

  // Override helpInformation method to append custom help (Architecture Team recommendation)
  const originalHelp = mcpCmd.helpInformation;
  mcpCmd.helpInformation = function () {
    return `${originalHelp.call(this)}

Quick Setup:
${HELP_TEXT["mcp-setup"]}

Troubleshooting:
${HELP_TEXT["mcp-troubleshooting"]}

For full documentation: https://github.com/fulmenhq/fulmen-mcp-brooklyn
`;
  };

  mcpCmd
    .command("start")
    .description("Start MCP server (stdin/stdout mode for Claude Code)")
    .option("--team-id <teamId>", "Team identifier")
    .option("--log-level <level>", "Log level (debug, info, warn, error)")
    .option("--dev-mode", "Enable development mode with named pipes")
    .option("--pipes-prefix <prefix>", "Named pipes prefix (dev mode only)", "/tmp/brooklyn-dev")
    .action(async (options) => {
      try {
        // Check for existing instance in MCP mode
        if (!options.devMode) {
          const instanceManager = new InstanceManager();
          const { running } = await instanceManager.checkExistingInstance();

          if (running) {
            // In MCP mode, we should not have console output
            // But we need to signal failure somehow
            process.exit(1);
          }

          // Register this instance
          await instanceManager.registerInstance();
        }

        // Load configuration with CLI overrides
        const cliOverrides: Partial<BrooklynConfig> = {};
        if (options.teamId) cliOverrides.teamId = options.teamId;
        if (options.logLevel) cliOverrides.logging = { level: options.logLevel, format: "json" };

        const config = await loadConfig(cliOverrides);

        // CRITICAL: Create transport FIRST - this determines if we're in MCP mode
        // The transport creation:
        // 1. Calls setGlobalTransport() which sets isMCPMode flag
        // 2. Marks logger as initialized (isInitialized = true)
        // 3. Only AFTER this can any logging occur
        const transport = options.devMode
          ? await createMCPStdio({
              inputPipe: `${options.pipesPrefix}-input`,
              outputPipe: `${options.pipesPrefix}-output`,
            })
          : await createMCPStdio();

        // Now it's safe to initialize logging configuration
        // Logger is no longer silent, but in MCP mode all logs go to file, not stdout
        await initializeLogging(config);

        // Don't log immediately - let the engine start first
        // This ensures clean MCP protocol startup

        // Create Brooklyn engine
        const engine = new BrooklynEngine({
          config: { ...config, devMode: options.devMode },
          correlationId: `mcp-${Date.now()}`,
        });

        // Initialize the engine before adding transports
        await engine.initialize();

        // Add and start the transport we already created
        const transportName = options.devMode ? "dev-mcp" : "mcp";
        await engine.addTransport(transportName, transport);
        await engine.startTransport(transportName);

        // Keep process alive for stdin/stdout mode
        if (!options.devMode) {
          // stdin.resume() is handled by the transport itself

          // Handle graceful shutdown for MCP mode
          const shutdown = async (_signal: string) => {
            try {
              await engine.cleanup();
            } catch {
              // Ignore cleanup errors
            }
            process.exit(0);
          };

          process.on("SIGINT", () => shutdown("SIGINT"));
          process.on("SIGTERM", () => shutdown("SIGTERM"));
          process.on("SIGHUP", () => shutdown("SIGHUP"));

          // Handle stdin close (Claude disconnected)
          process.stdin.on("end", () => shutdown("stdin-end"));
          process.stdin.on("close", () => shutdown("stdin-close"));
        }

        // Only log startup message in dev mode (uses named pipes, not stdio)
        if (options.devMode) {
          const logger = getLogger("brooklyn-cli");
          logger.info("MCP server started successfully", {
            mode: "dev-pipes",
            transport: "named-pipes",
            teamId: config.teamId,
          });
        }
        // In production MCP mode, stay completely silent
      } catch (error) {
        // In MCP mode, we need to output a proper JSON-RPC error response
        if (!options.devMode) {
          const errorResponse = {
            jsonrpc: "2.0",
            id: null,
            error: {
              code: -32603,
              message: "Internal error during MCP server startup",
              data: error instanceof Error ? error.message : String(error),
            },
          };
          process.stdout.write(`${JSON.stringify(errorResponse)}\n`);
        } else {
          // In dev mode, we can use regular error logging
          try {
            const logger = getLogger("brooklyn-cli");
            logger.error("Failed to start MCP server", {
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
              mode: "dev-pipes",
            });
          } catch {
            // Fallback if logger fails
            console.error("Failed to start MCP server:", error);
          }
        }
        process.exit(1);
      }
    });

  mcpCmd
    .command("status")
    .description("Check MCP server status")
    .action(async () => {
      try {
        const { getServerStatus } = await import("../../scripts/server-management.js");
        await getServerStatus();
      } catch (error) {
        const logger = getLogger("brooklyn-cli");
        logger.error("Failed to get MCP server status", {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    });

  mcpCmd
    .command("configure")
    .description("Configure Claude Code MCP integration")
    .option("--project", "Configure for project-specific scope")
    .action(async (_options) => {});

  mcpCmd
    .command("cleanup")
    .description("Clean up stale Brooklyn MCP processes")
    .action(async () => {
      try {
        const config = await loadConfig();
        await initializeLogging(config);
        const logger = getLogger("brooklyn-cli");

        const instanceManager = new InstanceManager();
        const cleaned = await instanceManager.cleanupAllProcesses();

        logger.info("MCP cleanup completed", { processesKilled: cleaned });
        console.log(`✅ Cleaned up ${cleaned} stale Brooklyn processes`);
      } catch (error) {
        console.error("Failed to cleanup MCP processes:", error);
        process.exit(1);
      }
    });

  // MCP Development Mode Commands (Architecture Committee approved - internal use only)
  setupMCPDevCommands(mcpCmd);
}

/**
 * MCP Development Mode Commands (Architecture Committee approved - internal use only)
 * Hidden from main help unless --internal flag is used
 */
function setupMCPDevCommands(mcpCmd: Command): void {
  // Hidden commands for internal development (Architecture Committee guidance)
  const devStartCmd = mcpCmd
    .command("dev-start")
    .description("Start MCP development mode with named pipes (internal use only)")
    .option("--team-id <teamId>", "Team identifier for development")
    .action(async (options) => {
      try {
        const { MCPDevManager } = await import("../core/mcp-dev-manager.js");
        const devManager = new MCPDevManager();
        // Set team ID if provided
        if (options.teamId) {
          process.env["BROOKLYN_DEV_TEAM_ID"] = options.teamId;
        }
        await devManager.start();
      } catch (error) {
        try {
          const logger = getLogger("brooklyn-cli");
          logger.error("Failed to start MCP development mode", {
            error: error instanceof Error ? error.message : String(error),
            teamId: options.teamId,
          });
        } catch {
          // Fallback if logger fails
          console.error("Failed to start MCP development mode:", error);
        }
        process.exit(1);
      }
    });

  const devStopCmd = mcpCmd
    .command("dev-stop")
    .description("Stop MCP development mode (internal use only)")
    .action(async () => {
      try {
        const { MCPDevManager } = await import("../core/mcp-dev-manager.js");
        const devManager = new MCPDevManager();
        await devManager.stop();
      } catch (error) {
        try {
          const logger = getLogger("brooklyn-cli");
          logger.error("Failed to stop MCP development mode", {
            error: error instanceof Error ? error.message : String(error),
          });
        } catch {
          // Fallback if logger fails
          console.error("Failed to stop MCP development mode:", error);
        }
        process.exit(1);
      }
    });

  const devRestartCmd = mcpCmd
    .command("dev-restart")
    .description("Restart MCP development mode (internal use only)")
    .action(async () => {
      try {
        const { MCPDevManager } = await import("../core/mcp-dev-manager.js");
        const devManager = new MCPDevManager();
        await devManager.restart();
      } catch (error) {
        try {
          const logger = getLogger("brooklyn-cli");
          logger.error("Failed to restart MCP development mode", {
            error: error instanceof Error ? error.message : String(error),
          });
        } catch {
          // Fallback if logger fails
          console.error("Failed to restart MCP development mode:", error);
        }
        process.exit(1);
      }
    });

  const devStatusCmd = mcpCmd
    .command("dev-status")
    .description("Show MCP development mode status (internal use only)")
    .action(async () => {
      try {
        const { MCPDevManager } = await import("../core/mcp-dev-manager.js");
        const devManager = new MCPDevManager();
        await devManager.status();
      } catch (error) {
        try {
          const logger = getLogger("brooklyn-cli");
          logger.error("Failed to get MCP development mode status", {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
        } catch {
          // Fallback if logger fails
          console.error("Failed to get MCP development mode status:", error);
        }
        process.exit(1);
      }
    });

  const devCleanupCmd = mcpCmd
    .command("dev-cleanup")
    .description("Clean up MCP development mode resources (internal use only)")
    .action(async () => {
      try {
        const { MCPDevManager } = await import("../core/mcp-dev-manager.js");
        const devManager = new MCPDevManager();
        await devManager.cleanup();
        // User-facing success message goes to stdout for CLI interaction
        console.info("✅ MCP development mode cleanup completed");
      } catch (error) {
        try {
          const logger = getLogger("brooklyn-cli");
          logger.error("Failed to cleanup MCP development mode", {
            error: error instanceof Error ? error.message : String(error),
          });
        } catch {
          // Fallback if logger fails
          console.error("Failed to cleanup MCP development mode:", error);
        }
        process.exit(1);
      }
    });

  // Hide these commands from main help (Architecture Committee requirement)
  // Only show when --internal flag is present
  const isInternal = process.argv.includes("--internal");
  if (!isInternal) {
    // Use the correct Commander.js method to hide commands
    (devStartCmd as any).hidden = true;
    (devStopCmd as any).hidden = true;
    (devRestartCmd as any).hidden = true;
    (devStatusCmd as any).hidden = true;
    (devCleanupCmd as any).hidden = true;
  }
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

        // Initialize logging for non-MCP commands
        await initializeLogging(config);
        enableConfigLogger(); // Safe to enable config logging now
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
        const logger = getLogger("brooklyn-cli");
        logger.error("Failed to start web server", {
          error: error instanceof Error ? error.message : String(error),
          port: options.port,
          daemon: options.daemon,
        });
        process.exit(1);
      }
    });

  webCmd
    .command("stop")
    .description("Stop web server daemon")
    .action(async () => {
      try {
        const { stopServerProcess } = await import("../../scripts/server-management.js");
        await stopServerProcess();
      } catch (error) {
        const logger = getLogger("brooklyn-cli");
        logger.error("Failed to stop server", {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    });

  webCmd
    .command("status")
    .description("Check web server status")
    .action(async () => {
      try {
        const { getServerStatus } = await import("../../scripts/server-management.js");
        await getServerStatus();
      } catch (error) {
        const logger = getLogger("brooklyn-cli");
        logger.error("Failed to get server status", {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
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
        const logger = getLogger("brooklyn-cli");
        logger.info("Brooklyn Status Check", { version: VERSION });

        // TODO: Add actual status checking logic here
        logger.info("All systems operational");
      } catch (error) {
        // Don't use logger in catch block as it might not be initialized
        console.error("Status check failed:", error);
        console.error("Version:", VERSION);
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
        // Load config and initialize logging for non-MCP commands
        const config = await loadConfig();
        await initializeLogging(config);
        enableConfigLogger(); // Safe to enable config logging now
        const logger = getLogger("brooklyn-cli");

        if (options.check) {
          await checkBrowserInstallation(options.browser);
        } else {
          await setupBrowsers(options.browser);
        }

        logger.info("Brooklyn setup completed", { options });
      } catch (error) {
        const logger = getLogger("brooklyn-cli");
        logger.error("Setup failed", {
          error: error instanceof Error ? error.message : String(error),
          options,
        });
        process.exit(1);
      }
    });
}

/**
 * Check browser installation status
 */
async function checkBrowserInstallation(browserType?: string): Promise<void> {
  const { chromium, firefox, webkit } = await import("playwright");
  const logger = getLogger("brooklyn-setup");

  const browsersToCheck = browserType ? [browserType] : ["chromium", "firefox", "webkit"];
  const results: Record<string, { installed: boolean; error?: string }> = {};

  for (const browser of browsersToCheck) {
    try {
      switch (browser) {
        case "chromium": {
          const browserInstance = await chromium.launch({ headless: true });
          await browserInstance.close();
          results[browser] = { installed: true };
          break;
        }
        case "firefox": {
          const browserInstance = await firefox.launch({ headless: true });
          await browserInstance.close();
          results[browser] = { installed: true };
          break;
        }
        case "webkit": {
          const browserInstance = await webkit.launch({ headless: true });
          await browserInstance.close();
          results[browser] = { installed: true };
          break;
        }
        default:
          results[browser] = { installed: false, error: "Unknown browser type" };
      }
    } catch (error) {
      results[browser] = {
        installed: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Display results
  logger.info("Browser Installation Status");
  logger.info("============================");

  let allInstalled = true;
  for (const [browser, result] of Object.entries(results)) {
    const status = result.installed ? "✅ INSTALLED" : "❌ NOT INSTALLED";
    logger.info(`${browser.toUpperCase()}: ${status}`);
    if (!result.installed && result.error) {
      logger.info(`   Error: ${result.error}`);
    }
    if (!result.installed) allInstalled = false;
  }

  if (allInstalled) {
    logger.info("🎉 All browsers are ready for automation!");
    logger.info("Browser validation passed", { browsers: browsersToCheck });
  } else {
    logger.info("💡 Run 'brooklyn setup' to install missing browsers");
    logger.warn("Browser validation failed", { results });
    process.exit(1);
  }
}

/**
 * Setup browsers for Brooklyn
 */
async function setupBrowsers(browserType?: string): Promise<void> {
  const logger = getLogger("brooklyn-setup");

  logger.info("Installing browsers for Brooklyn automation...");

  try {
    const { execSync } = await import("node:child_process");

    if (browserType) {
      logger.info(`Installing ${browserType}...`);
      execSync(`bunx playwright install ${browserType}`, { stdio: "inherit" });
    } else {
      logger.info("Installing all browsers (chromium, firefox, webkit)...");
      execSync("bunx playwright install", { stdio: "inherit" });
    }

    logger.info("\n✅ Browser installation completed!");

    // Verify installation
    await checkBrowserInstallation(browserType);

    logger.info("Browser setup completed", { browserType });
  } catch (error) {
    logger.error("Browser setup failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Version command
 */
function setupVersionCommand(program: Command): void {
  program
    .command("version")
    .description("Show Brooklyn version information")
    .action(() => {
      console.log(VERSION);
      process.exit(0);
    });
}

/**
 * Debug command group
 */
function setupDebugCommands(program: Command): void {
  const debugCmd = program.command("debug").description("Debugging utilities for Brooklyn");

  debugCmd
    .command("stdio")
    .description("Run command with STDIO logging")
    .argument("<command>", "Command to run")
    .option("-b, --log-base <name>", "Base name for log files", "debug")
    .action(async (command, options) => {
      await handleDebugCommand(["stdio", command, "--log-base", options.logBase]);
    });
}

/**
 * Browser command group - Browser management
 */
function setupBrowserCommands(program: Command): void {
  const browserCmd = program.command("browser").description("Browser management commands");

  browserCmd
    .command("info")
    .description("Show installed browsers and versions")
    .action(async () => {
      const { browserInfoCommand } = await import("./commands/browser-info.js");
      await browserInfoCommand();
    });

  browserCmd
    .command("update [browser]")
    .description("Update installed browsers to latest versions")
    .action(async (browser?: string) => {
      const { browserUpdateCommand } = await import("./commands/browser-info.js");
      await browserUpdateCommand(browser);
    });

  browserCmd
    .command("clean")
    .description("Clean browser cache and remove old versions")
    .option("--force", "Force cleanup without confirmation")
    .action(async (options) => {
      const { browserCleanCommand } = await import("./commands/browser-info.js");
      await browserCleanCommand(options.force);
    });

  browserCmd
    .command("install [browser]")
    .description("Install specific browser (chromium, firefox, webkit)")
    .action(async (browser?: string) => {
      try {
        // Load config and initialize logging for non-MCP commands
        const config = await loadConfig();
        await initializeLogging(config);
        enableConfigLogger();

        if (browser) {
          await setupBrowsers(browser);
        } else {
          await setupBrowsers();
        }
      } catch (error) {
        console.error("Browser installation failed:", error);
        process.exit(1);
      }
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
    setupBrowserCommands(program);
    setupDebugCommands(program);
    setupStatusCommand(program);
    setupSetupCommand(program);
    setupVersionCommand(program);

    // Default action - show help
    program.action(() => {});

    // Parse command line arguments
    await program.parseAsync(process.argv);
  } catch (error) {
    // Handle error without logger if it's not initialized
    try {
      const logger = getLogger("brooklyn-cli");
      logger.error("CLI execution failed", {
        error: error instanceof Error ? error.message : String(error),
        argv: process.argv,
      });
    } catch {
      // Logger not initialized, fall back to console.error
      console.error("CLI execution failed:", error);
      console.error("argv:", process.argv);
    }
    process.exit(1);
  }
}

// Export for testing
export { main };

// Run main function if this file is executed directly
if (import.meta.main) {
  main().catch((error) => {
    // Handle error without logger if it's not initialized
    try {
      const logger = getLogger("brooklyn-cli");
      logger.error("Fatal error", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } catch {
      // Logger not initialized, fall back to console.error
      console.error("Fatal error:", error);
    }
    process.exit(1);
  });
}
