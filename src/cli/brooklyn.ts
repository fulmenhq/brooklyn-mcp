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
const VERSION = "1.4.22";

import { HELP_TEXT } from "../generated/help/index.js";
// buildConfig import removed - not used in CLI entry point
import { getLogger, initializeLogging } from "../shared/pino-logger.js";

// Create minimal config that matches BrooklynConfig structure
// For CLI commands, use pretty format for better readability
const isDevCommand = process.argv.some((arg) =>
  ["dev-start", "dev-stop", "dev-repl", "dev-status", "dev-cleanup", "dev-restart"].includes(arg),
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
import { registerCleanupCommand } from "./commands/cleanup.js";
import { registerOpsCommand } from "./commands/ops.js";
import { handleDebugCommand } from "./debug.js";

// Config logger no longer needed with Pino

// Logger will be initialized after configuration is loaded

/**
 * Build the root CLI and register top-level operational commands BEFORE parsing.
 * Use explicit addCommand pattern to ensure subcommands/flags are registered.
 */
const program = new Command()
  .name("brooklyn")
  .description("Brooklyn MCP Server - Enterprise browser automation platform")
  .version(VERSION)
  .option("-v, --verbose", "Enable verbose logging")
  .option("--config <path>", "Configuration file path");

// Register cleanup as a proper subcommand so its options are recognized
registerCleanupCommand(program);

// Register ops command for database and maintenance operations
registerOpsCommand(program);

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
      // Lightweight imports to avoid top-level side effects
      const { createHash } = await import("node:crypto");
      const { mkdirSync, existsSync, readFileSync, writeFileSync, unlinkSync } = await import(
        "node:fs"
      );
      const { homedir } = await import("node:os");
      const { join } = await import("node:path");

      // Helper: compute project key for "local" scope based on cwd
      const cwd = process.cwd();
      const projectKey = createHash("sha1").update(cwd).digest("hex");
      const scope = "local"; // For stdio via Claude Code, default to local project scope
      const baseDir = join(homedir(), ".brooklyn", "mcp", "stdio", scope);
      const pidFile = join(baseDir, `${projectKey}.pid`);

      try {
        // Ensure registry directory exists
        if (!existsSync(baseDir)) {
          mkdirSync(baseDir, { recursive: true });
        }

        // Fast-fail if an existing live PID is registered for same scope+project
        if (existsSync(pidFile)) {
          try {
            const txt = readFileSync(pidFile, "utf8");
            const meta = JSON.parse(txt) as {
              pid: number;
              projectKey: string;
              scope: string;
              startedAt?: string;
              brooklynVersion?: string;
            };
            if (meta?.pid && Number.isFinite(meta.pid)) {
              try {
                // Signal 0 checks existence without killing
                process.kill(meta.pid, 0);
                // Process exists -> refuse to start duplicate
                // MCP stdio must not write arbitrary text to stdout; emit JSON-RPC error
                if (!options.devMode) {
                  const err = {
                    jsonrpc: "2.0",
                    id: null,
                    error: {
                      code: -32603,
                      message: "MCP stdio server already running for this project",
                      data: { pid: meta.pid, scope: meta.scope, projectKey: meta.projectKey },
                    },
                  };
                  process.stdout.write(`${JSON.stringify(err)}\n`);
                }
                process.exit(1);
              } catch {
                // Stale PID file -> will be overwritten below
              }
            }
          } catch {
            // Corrupted pid file -> overwrite below
          }
        }

        // Load configuration with CLI overrides
        const cliOverrides: Partial<BrooklynConfig> = {};
        if (options.teamId) cliOverrides.teamId = options.teamId;
        if (options.logLevel) cliOverrides.logging = { level: options.logLevel, format: "json" };

        const config = await loadConfig(cliOverrides);

        // Create transport first to enter MCP mode
        const transport = options.devMode
          ? await createMCPStdio({
              inputPipe: process.env["BROOKLYN_DEV_INPUT_PIPE"] || `${options.pipesPrefix}-input`,
              outputPipe:
                process.env["BROOKLYN_DEV_OUTPUT_PIPE"] || `${options.pipesPrefix}-output`,
            })
          : await createMCPStdio();

        // Write PID registry entry (managed)
        try {
          const meta = {
            pid: process.pid,
            scope,
            projectKey,
            startedAt: new Date().toISOString(),
            brooklynVersion: VERSION,
          };
          writeFileSync(pidFile, JSON.stringify(meta), "utf8");
          // Tag the process for heuristic discovery as well
          process.env["BROOKLYN_MCP_STDIO"] = "1";
          process.env["BROOKLYN_MCP_STDIO_SCOPE"] = scope;
          process.env["BROOKLYN_MCP_STDIO_PROJECT"] = projectKey;
        } catch {
          // If registry write fails, continue; cleanup can still kill unmanaged via env marker
        }

        // Initialize logging now that transport mode is set
        await initializeLogging(config);

        const engine = new BrooklynEngine({
          config: { ...config, devMode: options.devMode },
          correlationId: `mcp-${Date.now()}`,
        });

        await engine.initialize();

        const transportName = options.devMode ? "dev-mcp" : "mcp";
        await engine.addTransport(transportName, transport);
        await engine.startTransport(transportName);

        // Graceful shutdown + pidFile unlink
        const unlinkPid = () => {
          try {
            if (existsSync(pidFile)) unlinkSync(pidFile);
          } catch {
            // ignore
          }
        };

        const shutdown = async (_signal: string) => {
          try {
            await engine.cleanup();
          } catch {
            // ignore
          } finally {
            unlinkPid();
          }
          process.exit(0);
        };

        if (!options.devMode) {
          process.on("SIGINT", () => shutdown("SIGINT"));
          process.on("SIGTERM", () => shutdown("SIGTERM"));
          process.on("SIGHUP", () => shutdown("SIGHUP"));
          process.stdin.on("end", () => shutdown("stdin-end"));
          process.stdin.on("close", () => shutdown("stdin-close"));
        }

        if (options.devMode) {
          const logger = getLogger("brooklyn-cli");
          logger.info("MCP server started successfully", {
            mode: "dev-pipes",
            transport: "named-pipes",
            teamId: config.teamId,
            pid: process.pid,
          });
        }
        // Remain silent in stdio production mode
      } catch (error) {
        // Attempt to emit JSON-RPC error for stdio mode
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
          try {
            process.stdout.write(`${JSON.stringify(errorResponse)}\n`);
          } catch {
            // ignore
          }
        } else {
          try {
            const logger = getLogger("brooklyn-cli");
            logger.error("Failed to start MCP server", {
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
              mode: "dev-pipes",
            });
          } catch {
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
        process.exit(0);
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
        process.exit(0);
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
    .option("--foreground", "Keep process in foreground")
    .action(async (options) => {
      try {
        const { MCPDevManager } = await import("../core/mcp-dev-manager.js");
        const devManager = new MCPDevManager();
        // Set team ID if provided
        if (options.teamId) {
          process.env["BROOKLYN_DEV_TEAM_ID"] = options.teamId;
        }
        await devManager.start({
          foreground: options.foreground,
        });
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

  const _devReplCmd = mcpCmd
    .command("dev-repl")
    .description("Start Brooklyn REPL for interactive MCP tool testing")
    .option("--json", "Output raw JSON responses instead of pretty-formatted text")
    .option("--verbose", "Enable verbose logging")
    .option("--team-id <teamId>", "Team identifier for REPL session")
    .action(async (options) => {
      try {
        const { BrooklynREPL } = await import("../core/brooklyn-repl.js");
        const repl = new BrooklynREPL({
          jsonOutput: options.json,
          verbose: options.verbose,
          teamId: options.teamId,
        });
        await repl.start();
      } catch (error) {
        try {
          const logger = getLogger("brooklyn-cli");
          logger.error("Failed to start Brooklyn REPL", {
            error: error instanceof Error ? error.message : String(error),
            teamId: options.teamId,
          });
        } catch {
          // Fallback if logger fails
          console.error("Failed to start Brooklyn REPL:", error);
        }
        process.exit(1);
      }
    });

  const _devHttpCmd = mcpCmd
    .command("dev-http")
    .description(
      "Start Brooklyn HTTP API server (RECOMMENDED for AI agents - defaults to background)",
    )
    .option("--port <port>", "HTTP server port", "8080")
    .option("--host <host>", "HTTP server host", "0.0.0.0")
    .option("--no-cors", "Disable CORS headers")
    .option("--team-id <teamId>", "Team identifier for HTTP session")
    .option("--verbose", "Enable verbose logging")
    .option("--foreground", "Run server in foreground (blocks terminal)")
    .option("--pid-file <path>", "Custom PID file location")
    .action(async (options) => {
      try {
        // Default to background mode for AI-friendly operation
        if (!options.foreground) {
          const { spawn } = await import("node:child_process");
          const args = [
            "mcp",
            "dev-http-daemon", // Use internal daemon command
            "--port",
            options.port,
            "--host",
            options.host,
            "--team-id",
            options.teamId || "default",
          ];

          if (options.noCors) args.push("--no-cors");
          if (options.verbose) args.push("--verbose");
          if (options.pidFile) args.push("--pid-file", options.pidFile);

          // Spawn detached process
          const child = spawn(process.execPath, [process.argv[1], ...args], {
            detached: true,
            stdio: ["ignore", "ignore", "ignore"],
          });

          child.unref(); // Allow parent to exit

          console.log(
            `Brooklyn HTTP server started in background (PID: ${child.pid}, Port: ${options.port})`,
          );
          console.log(`Use 'brooklyn mcp dev-http-status' to check status`);
          process.exit(0); // Exit to return control to terminal
        }

        const { BrooklynHTTP } = await import("../core/brooklyn-http.js");
        const httpServer = new BrooklynHTTP({
          port: Number.parseInt(options.port),
          host: options.host,
          cors: !options.noCors,
          teamId: options.teamId,
          verbose: options.verbose,
          background: false, // Always false when we get here
          pidFile: options.pidFile,
        });

        // Start HTTP server (foreground mode)
        console.log(`Starting Brooklyn HTTP server in foreground mode (Port: ${options.port})`);
        console.log("Press Ctrl+C to stop server");
        await httpServer.start();

        // Handle graceful shutdown (foreground mode only)
        const shutdown = async (signal: string) => {
          console.log(`\n📴 Received ${signal}, shutting down gracefully...`);
          try {
            await httpServer.stop();
            console.log("✅ HTTP server stopped");
          } catch (error) {
            console.error("❌ Error during shutdown:", error);
          }
          process.exit(0);
        };

        process.on("SIGINT", () => shutdown("SIGINT"));
        process.on("SIGTERM", () => shutdown("SIGTERM"));
        process.on("SIGHUP", () => shutdown("SIGHUP"));
      } catch (error) {
        try {
          const logger = getLogger("brooklyn-cli");
          logger.error("Failed to start Brooklyn HTTP server", {
            error: error instanceof Error ? error.message : String(error),
            port: options.port,
            host: options.host,
            teamId: options.teamId,
          });
        } catch {
          // Fallback if logger fails
          console.error("Failed to start Brooklyn HTTP server:", error);
        }
        process.exit(1);
      }
    });

  // Internal daemon command for background HTTP server (not shown in help)
  const _devHttpDaemonCmd = mcpCmd
    .command("dev-http-daemon")
    .description("Internal: HTTP server daemon process")
    .option("--port <port>", "HTTP server port", "8080")
    .option("--host <host>", "HTTP server host", "0.0.0.0")
    .option("--no-cors", "Disable CORS headers")
    .option("--team-id <teamId>", "Team identifier for HTTP session")
    .option("--verbose", "Enable verbose logging")
    .option("--pid-file <path>", "Custom PID file location")
    .action(async (options) => {
      try {
        const { BrooklynHTTP } = await import("../core/brooklyn-http.js");
        const httpServer = new BrooklynHTTP({
          port: Number.parseInt(options.port),
          host: options.host,
          cors: !options.noCors,
          teamId: options.teamId,
          verbose: options.verbose,
          background: true, // Always background for daemon
          pidFile: options.pidFile,
        });

        // Start HTTP server in daemon mode
        await httpServer.start();

        // Keep process alive - no CLI interaction needed in daemon mode
        // Process will be managed via signals and PID file
      } catch (error) {
        console.error("Failed to start Brooklyn HTTP daemon:", error);
        process.exit(1);
      }
    });

  // Helper functions for targeted dev-http stopping
  async function stopAllDevHttpProcesses(force: boolean): Promise<void> {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);

    try {
      // Targeted search for dev-http processes only (same pattern as findHttpDevServers)
      // Exclude management commands to avoid killing ourselves
      const { stdout } = await execAsync(
        "ps aux | grep 'brooklyn.*dev-http' | grep -v grep | grep -v 'dev-http-stop' | grep -v 'dev-http-list' | grep -v 'dev-http-status'",
      );
      const lines = stdout
        .trim()
        .split("\n")
        .filter((line) => line.trim());

      if (lines.length === 0) {
        console.log("No dev-http processes running");
        return;
      }

      console.log(`Stopping ${lines.length} dev-http process(es)...`);
      let stopped = 0;

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pidStr = parts[1];
        if (!pidStr) continue;
        const pid = Number.parseInt(pidStr);
        if (Number.isNaN(pid)) continue;

        const command = parts.slice(10).join(" ");
        console.log(`Stopping PID ${pid}: ${command}`);

        let success = false;
        try {
          process.kill(pid, "SIGTERM");
          await new Promise((resolve) => setTimeout(resolve, 2000));

          // Check if still running
          try {
            process.kill(pid, 0);
            // Still running, try SIGKILL if --force
            if (force) {
              console.log(`⚠️  SIGTERM failed for PID ${pid}, trying SIGKILL...`);
              process.kill(pid, "SIGKILL");
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          } catch {
            // Process is gone - success!
            success = true;
          }
        } catch (_error) {
          // Process might already be dead
          success = true;
        }

        if (success) {
          console.log(`✅ Stopped dev-http process (PID: ${pid})`);
          stopped++;
        } else {
          console.log(`❌ Failed to stop dev-http process (PID: ${pid})`);
          if (!force) {
            console.log("   💡 Try using --force to use SIGKILL");
          }
        }
      }

      console.log(`\nStopped ${stopped}/${lines.length} dev-http processes`);
    } catch (_error) {
      console.log("No dev-http processes found");
    }
  }

  async function stopDevHttpFromPidFiles(port?: string, force?: boolean): Promise<void> {
    const { readFileSync, existsSync, unlinkSync, readdirSync } = await import("node:fs");
    const cwd = process.cwd();

    if (port) {
      // Stop specific port
      const pidFile = `${cwd}/.brooklyn-http-${port}.pid`;
      if (!existsSync(pidFile)) {
        console.log(`❌ No dev-http server found on port ${port} (no PID file)`);
        process.exit(1);
      }

      const pid = Number.parseInt(readFileSync(pidFile, "utf8").trim());
      const success = await stopHttpProcess(pid, force, port);

      if (success) {
        console.log(`✅ Stopped HTTP server on port ${port}`);
        if (existsSync(pidFile)) {
          unlinkSync(pidFile);
        }
      } else {
        console.log(`❌ Failed to stop server on port ${port}`);
        process.exit(1);
      }
    } else {
      // Stop all PID file servers in current directory
      try {
        const files = readdirSync(cwd);
        const pidFiles = files.filter((f) => f.startsWith(".brooklyn-http-") && f.endsWith(".pid"));

        if (pidFiles.length === 0) {
          console.log("No dev-http servers running (no PID files found)");
          return;
        }

        console.log(`Stopping ${pidFiles.length} dev-http server(s) from PID files...`);
        let stopped = 0;

        for (const pidFile of pidFiles) {
          const port = pidFile.match(/\.brooklyn-http-(\d+)\.pid$/)?.[1];
          const pidPath = `${cwd}/${pidFile}`;
          const pid = Number.parseInt(readFileSync(pidPath, "utf8").trim());

          const success = await stopHttpProcess(pid, force, port);
          if (success) {
            console.log(`✅ Stopped HTTP server on port ${port} (PID: ${pid})`);
            if (existsSync(pidPath)) {
              unlinkSync(pidPath);
            }
            stopped++;
          } else {
            console.log(`❌ Failed to stop server on port ${port} (PID: ${pid})`);
            if (!force) {
              console.log("   💡 Try using --force to use SIGKILL");
            }
          }
        }

        console.log(`\nStopped ${stopped}/${pidFiles.length} dev-http servers`);
      } catch (_error) {
        console.log("No dev-http servers found");
      }
    }
  }

  async function stopHttpProcess(pid: number, force?: boolean, port?: string): Promise<boolean> {
    try {
      process.kill(pid, "SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Check if still running
      try {
        process.kill(pid, 0);
        // Still running, try SIGKILL if --force
        if (force) {
          console.log(
            `⚠️  SIGTERM failed for PID ${pid}${port ? ` (port ${port})` : ""}, trying SIGKILL...`,
          );
          process.kill(pid, "SIGKILL");
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return true;
        }
        return false;
      } catch {
        // Process is gone - success!
        return true;
      }
    } catch {
      // Process might already be dead (ESRCH) - that's success
      return true;
    }
  }

  // HTTP Server Management Commands
  const _devHttpStopCmd = mcpCmd
    .command("dev-http-stop")
    .description("Stop Brooklyn HTTP dev server")
    .option("--port <port>", "Stop server on specific port")
    .option("--all", "Stop all HTTP dev servers")
    .option("--force", "Force kill processes with SIGKILL if SIGTERM fails")
    .action(async (options) => {
      try {
        if (options.all) {
          // --all: Search for dev-http processes specifically
          await stopAllDevHttpProcesses(options.force);
        } else {
          // Default: Use PID files for targeted stopping
          await stopDevHttpFromPidFiles(options.port, options.force);
        }

        // Explicitly exit to return control to console
        process.exit(0);
      } catch (error) {
        console.error("Failed to stop HTTP server:", error);
        process.exit(1);
      }
    });

  const _devHttpListCmd = mcpCmd
    .command("dev-http-list")
    .description("List running Brooklyn HTTP dev servers")
    .option("--json", "Output in JSON format")
    .action(async (options) => {
      try {
        const { BrooklynProcessManager } = await import("../shared/process-manager.js");
        const httpServers = await BrooklynProcessManager.findHttpDevServers();

        if (options.json) {
          console.log(JSON.stringify(httpServers, null, 2));
          process.exit(0);
          return;
        }

        if (httpServers.length === 0) {
          console.log("No HTTP dev servers running");
          process.exit(0);
          return;
        }

        console.log("🌐 Running HTTP Dev Servers:");
        for (const server of httpServers) {
          const teamInfo = server.teamId ? ` (team: ${server.teamId})` : "";
          console.log(`  • Port ${server.port}: PID ${server.pid}${teamInfo}`);
          console.log(`    URL: http://localhost:${server.port}`);
        }

        // Explicitly exit to return control to console
        process.exit(0);
      } catch (error) {
        console.error("Failed to list HTTP servers:", error);
        process.exit(1);
      }
    });

  const _devHttpStatusCmd = mcpCmd
    .command("dev-http-status")
    .description("Show detailed status of HTTP dev servers")
    .option("--port <port>", "Status for specific port")
    .action(async (options) => {
      try {
        const { BrooklynProcessManager } = await import("../shared/process-manager.js");
        let httpServers = await BrooklynProcessManager.findHttpDevServers();

        if (options.port) {
          const port = Number.parseInt(options.port);
          httpServers = httpServers.filter((p) => p.port === port);

          if (httpServers.length === 0) {
            console.log(`No HTTP server found on port ${port}`);
            process.exit(1);
          }
        }

        if (httpServers.length === 0) {
          console.log("No HTTP dev servers running");
          process.exit(0);
        }

        console.log("🌐 HTTP Dev Servers Status:");
        console.log("");

        for (const server of httpServers) {
          console.log(`📡 Port ${server.port}:`);
          console.log(`  • PID: ${server.pid}`);
          console.log(`  • Team: ${server.teamId || "unknown"}`);
          console.log(`  • URL: http://localhost:${server.port}`);
          console.log(`  • Status: ${server.status}`);

          // Test if server is responding (with timeout)
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

            const response = await fetch(`http://localhost:${server.port}/health`, {
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (response.ok) {
              console.log("  • Health: ✅ Responding");
            } else {
              console.log(`  • Health: ⚠️  Server error (${response.status})`);
            }
          } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
              console.log("  • Health: ⏰ Timeout (not responding)");
            } else {
              console.log("  • Health: ❌ Not responding");
            }
          }
          console.log("");
        }

        // Explicitly exit to prevent hanging
        process.exit(0);
      } catch (error) {
        console.error("Failed to check HTTP server status:", error);
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
    .option("--all", "Also clean up orphaned cat processes reading from pipes")
    .action(async (options) => {
      try {
        const { MCPDevManager } = await import("../core/mcp-dev-manager.js");
        const devManager = new MCPDevManager();
        await devManager.cleanup({ cleanupOrphanedReaders: options.all });
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
    .option("--host <host>", "HTTP host", "127.0.0.1")
    .option("--ipv4", "Force IPv4 binding (sets host to 127.0.0.1 if --host not provided)")
    .option("--ipv6", "Force IPv6 binding (sets host to ::1 if --host not provided)")
    .option("--daemon", "Run as background daemon")
    .option("--team-id <teamId>", "Team identifier")
    .option("--log-level <level>", "Log level (debug, info, warn, error)")
    .action(async (options) => {
      try {
        // Resolve host/stack preferences
        const argvHasHost = process.argv.includes("--host");
        if (options.ipv4 && options.ipv6) {
          console.error("Cannot use --ipv4 and --ipv6 together. Choose one.");
          process.exit(1);
        }
        let resolvedHost: string = options.host;
        if (options.ipv6 && !argvHasHost) {
          resolvedHost = "::1";
        } else if (options.ipv4 && !argvHasHost) {
          resolvedHost = "127.0.0.1";
        }

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
              host: resolvedHost,
              cors: true,
              rateLimiting: false,
            },
          };
        }

        const config = await loadConfig(cliOverrides);

        // Initialize logging for non-MCP commands
        // If daemon mode, spawn detached process and exit
        if (options.daemon) {
          const { spawn } = await import("node:child_process");
          const args = ["web", "start", "--port", options.port, "--host", resolvedHost];

          if (options.teamId) args.push("--team-id", options.teamId);
          if (options.logLevel) args.push("--log-level", options.logLevel);

          // Spawn detached process
          const child = spawn(process.execPath, [process.argv[1], ...args], {
            detached: true,
            stdio: ["ignore", "ignore", "ignore"],
            env: {
              ...process.env,
              BROOKLYN_WEB_DAEMON: "true", // Mark as daemon child
            },
          });

          child.unref(); // Allow parent to exit

          // Initialize logging briefly to show success message
          await initializeLogging(config);
          const logger = getLogger("brooklyn-cli");

          logger.info(`Starting Brooklyn web server on ${resolvedHost}:${options.port}`, {
            mode: "http-daemon",
            port: options.port,
            host: resolvedHost,
            pid: child.pid,
          });

          logger.info("Web server started successfully", {
            url: `http://${resolvedHost}:${options.port}`,
            pid: child.pid,
          });

          logger.info("OAuth endpoints ready", {
            discovery: `http://${resolvedHost}:${options.port}/.well-known/oauth-authorization-server`,
          });

          // Write PID file for tracking
          const { writeFileSync } = await import("node:fs");
          const { join } = await import("node:path");
          const pidFile = join(process.cwd(), `.brooklyn-web-${options.port}.pid`);
          writeFileSync(pidFile, String(child.pid), "utf8");

          process.exit(0); // Exit parent, return control to shell
        }

        // Non-daemon mode or daemon child process continues here
        await initializeLogging(config);
        enableConfigLogger(); // Safe to enable config logging now
        const logger = getLogger("brooklyn-cli");

        // Only log startup message if not a daemon child
        if (!process.env["BROOKLYN_WEB_DAEMON"]) {
          logger.info(`Starting Brooklyn web server on ${resolvedHost}:${options.port}`, {
            mode: "http",
            port: options.port,
            host: options.host,
            url: `http://${resolvedHost}:${options.port}`,
          });
        }

        // Create Brooklyn engine
        const engine = new BrooklynEngine({
          config,
          correlationId: `web-start-${Date.now()}`,
        });

        // Create and add HTTP transport
        const httpTransport = await createHTTP(
          Number.parseInt(options.port, 10),
          resolvedHost,
          true, // CORS enabled
        );
        await engine.addTransport("http", httpTransport);

        // Start HTTP transport
        await engine.startTransport("http");

        if (!process.env["BROOKLYN_WEB_DAEMON"]) {
          logger.info("Web server started successfully", {
            url: `http://${resolvedHost}:${options.port}`,
            teamId: config.teamId,
          });

          // Helpful OAuth endpoint hints for Claude Code auth and manual fallback
          logger.info("OAuth endpoints ready", {
            discovery: `http://${resolvedHost}:${options.port}/.well-known/oauth-authorization-server`,
            authorize: `http://${resolvedHost}:${options.port}/oauth/authorize`,
            authHelp: `http://${resolvedHost}:${options.port}/oauth/auth-help`,
            token: `http://${resolvedHost}:${options.port}/oauth/token`,
            callback: `http://${resolvedHost}:${options.port}/oauth/callback`,
          });
        }

        // Handle graceful shutdown
        const shutdown = async () => {
          logger.info("Shutting down web server");
          await engine.cleanup();

          // Clean up PID file if daemon
          if (process.env["BROOKLYN_WEB_DAEMON"]) {
            try {
              const { unlinkSync } = await import("node:fs");
              const { join } = await import("node:path");
              const pidFile = join(process.cwd(), `.brooklyn-web-${options.port}.pid`);
              unlinkSync(pidFile);
            } catch {
              // Ignore PID file cleanup errors
            }
          }

          process.exit(0);
        };

        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);

        // Keep process alive
        if (!process.env["BROOKLYN_WEB_DAEMON"]) {
          logger.info("Web server running (press Ctrl+C to stop)");
          // Keep process alive for non-daemon mode
          process.stdin.resume();
        }
        // Daemon child stays alive via the server
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
    .option("--port <port>", "HTTP port to check", "3000")
    .action(async (options) => {
      try {
        // Detect listener on port even if no PID file exists (foreground web start)
        const port = Number.parseInt(options.port, 10) || 3000;

        // Find listeners (IPv4 and IPv6) on the port
        const { exec } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execAsync = promisify(exec);

        let pids: number[] = [];
        try {
          const { stdout } = await execAsync(
            `lsof -iTCP:${port} -sTCP:LISTEN -n -P | awk 'NR>1 {print $2}' | sort -u`,
          );
          pids = stdout
            .trim()
            .split("\n")
            .map((s) => Number.parseInt(s.trim(), 10))
            .filter((n) => Number.isFinite(n));
        } catch {
          // lsof may not be present or permission issues; continue to HTTP probe.
        }

        // Basic console output
        if (pids.length > 0) {
          console.log(`Status: Running (listeners on port ${port}: ${pids.join(", ")})`);
        } else {
          console.log(`Status: Unknown (no PID file). Checking HTTP endpoint on port ${port}...`);
        }

        // Probe health endpoint over IPv4
        const url = `http://127.0.0.1:${port}/health`;
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 2000);
          const resp = await fetch(url, { signal: controller.signal });
          clearTimeout(timeout);

          if (resp.ok) {
            const body = await resp.json();
            console.log("Health: ✅ Responding");
            console.log(JSON.stringify(body, null, 2));
            process.exit(0);
          } else {
            console.log(`Health: ⚠️ HTTP ${resp.status}`);
            process.exit(0);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`Health: ❌ Not responding (${msg})`);
          console.log(
            "Tip: If you started brooklyn web start in a foreground shell, status may not have a PID file. You can also check listeners with:",
          );
          console.log(`  lsof -iTCP:${port} -sTCP:LISTEN -n -P`);
          process.exit(1);
        }
      } catch (error) {
        const logger = getLogger("brooklyn-cli");
        logger.error("Failed to get web server status", {
          error: error instanceof Error ? error.message : String(error),
          port: options?.port,
        });
        process.exit(1);
      }
    });

  // Unified web cleanup (kills IPv4/IPv6 listeners on a port)
  webCmd
    .command("cleanup")
    .description("Clean up Brooklyn web servers (kills listeners for the specified port)")
    .option("--port <port>", "HTTP port to clean up (default: 3000)", "3000")
    .option("--force", "Force kill with SIGKILL if graceful SIGTERM fails")
    .action(async (options) => {
      try {
        const { exec } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execAsync = promisify(exec);

        const port = Number.parseInt(options.port, 10) || 3000;

        // Find listeners (IPv4 and IPv6) on the port
        const { stdout } = await execAsync(
          `lsof -iTCP:${port} -sTCP:LISTEN -n -P | awk 'NR>1 {print $2}' | sort -u`,
        );
        const pids = stdout
          .trim()
          .split("\n")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        if (pids.length === 0) {
          console.log(`No listeners found on port ${port}`);
          process.exit(0); // Exit cleanly when no listeners found
        }

        console.log(`Found ${pids.length} listener(s) on port ${port}: ${pids.join(", ")}`);
        for (const pidStr of pids) {
          const pid = Number.parseInt(pidStr, 10);
          if (!Number.isFinite(pid)) continue;

          try {
            process.kill(pid, "SIGTERM");
          } catch {
            // ignore
          }

          // Wait briefly for graceful stop
          await new Promise((r) => setTimeout(r, 1000));

          let stillRunning = true;
          try {
            process.kill(pid, 0);
          } catch {
            stillRunning = false;
          }

          if (stillRunning && options.force) {
            console.log(`Forcing kill for PID ${pid}...`);
            try {
              process.kill(pid, "SIGKILL");
            } catch {
              // ignore
            }
          }
        }

        console.log("Web cleanup completed");
        process.exit(0); // Exit cleanly after cleanup
      } catch (error) {
        console.error("Failed to cleanup web servers:", error);
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
    .option("--json", "Output status in JSON format")
    .action(async (options) => {
      try {
        const { BrooklynProcessManager } = await import("../shared/process-manager.js");

        const processes = await BrooklynProcessManager.findAllProcesses();
        const summary = await BrooklynProcessManager.getProcessSummary();

        if (options.json) {
          console.log(JSON.stringify({ processes, summary }, null, 2));
          return;
        }

        // Human-readable output
        console.log("📊 Brooklyn Process Status:");
        console.log("");

        if (processes.length === 0) {
          console.log("  No Brooklyn processes running");
          process.exit(0);
        }

        // Group by type
        const byType: Record<string, typeof processes> = {};
        for (const process of processes) {
          const processType = process.type;
          const existing = byType[processType];
          if (!existing) {
            byType[processType] = [process];
          } else {
            existing.push(process);
          }
        }
        // Ensure byType buckets exist even if no processes of that type were found
        byType["http-server"] = byType["http-server"] || [];
        byType["mcp-stdio"] = byType["mcp-stdio"] || [];
        byType["repl-session"] = byType["repl-session"] || [];
        byType["dev-mode"] = byType["dev-mode"] || [];

        // Display HTTP servers
        if (byType["http-server"]) {
          console.log("  🌐 HTTP Servers:");
          for (const server of byType["http-server"]) {
            const teamInfo = server.teamId ? `, team: ${server.teamId}` : "";
            console.log(
              `    • dev-http:${server.port || "unknown"} (PID: ${server.pid}${teamInfo})`,
            );
          }
          console.log("");
        }

        // Display MCP servers
        if (byType["mcp-stdio"]) {
          console.log("  📡 MCP Servers:");
          for (const server of byType["mcp-stdio"]) {
            const teamInfo = server.teamId ? `, team: ${server.teamId}` : "";
            console.log(`    • stdio mode (PID: ${server.pid}${teamInfo})`);
          }
          console.log("");
        }

        // Display REPL sessions
        if (byType["repl-session"]) {
          console.log("  🔄 REPL Sessions:");
          for (const repl of byType["repl-session"]) {
            const teamInfo = repl.teamId ? `, team: ${repl.teamId}` : "";
            console.log(`    • dev-repl (PID: ${repl.pid}${teamInfo})`);
          }
          console.log("");
        }

        // Display dev mode processes
        if (byType["dev-mode"]) {
          console.log("  🛠️  Dev Mode:");
          for (const dev of byType["dev-mode"]) {
            const teamInfo = dev.teamId ? `, team: ${dev.teamId}` : "";
            console.log(`    • dev-mode (PID: ${dev.pid}${teamInfo})`);
          }
          console.log("");
        }

        console.log(
          `Total: ${processes.length} Brooklyn process${processes.length === 1 ? "" : "es"} running`,
        );

        // Explicitly exit to prevent hanging
        process.exit(0);
      } catch (error) {
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
    // Set up command groups on the pre-built root program
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
