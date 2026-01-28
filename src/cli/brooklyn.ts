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
const VERSION = "0.3.2";

import { existsSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { HELP_TEXT } from "../generated/help/index.js";
import { type AgentClientKey, agentDrivers, resolvePathFor } from "../shared/agent-drivers.js";
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

import { Command, InvalidArgumentError } from "commander";
import { type BrooklynConfig, enableConfigLogger, loadConfig } from "../core/config.js";
import { InstanceManager } from "../core/instance-manager.js";
import type { HTTPAuthMode } from "../core/transport.js";
import { createHTTP, createMCPStdio } from "../transports/index.js";
import { registerCleanupCommand } from "./commands/cleanup.js";
import { registerOpsCommand } from "./commands/ops.js";
import { handleDebugCommand } from "./debug.js";

// (imports above)

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

const HTTP_AUTH_MODES: HTTPAuthMode[] = ["required", "localhost", "disabled"];
const HTTP_AUTH_MODE_DESCRIPTION = "HTTP auth mode (required|localhost|disabled)";

function parseHttpAuthMode(value: string): HTTPAuthMode {
  const normalized = value.trim().toLowerCase() as HTTPAuthMode;
  if (!HTTP_AUTH_MODES.includes(normalized)) {
    throw new InvalidArgumentError(
      `Invalid auth mode '${value}'. Expected one of ${HTTP_AUTH_MODES.join(", ")}`,
    );
  }
  return normalized;
}

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
  mcpCmd.helpInformation = () => `${originalHelp.call(mcpCmd)}

Assisted Configuration:
  Use 'brooklyn config agent' to generate and/or apply MCP client
  configurations for IDEs and agents (stdio or http transport).
  Optional: '--product Code|VSCodium|Cursor|Windsurf' to target user scope.

Quick Setup:
${HELP_TEXT["mcp-setup"]}

Troubleshooting:
${HELP_TEXT["mcp-troubleshooting"]}

For full documentation: https://github.com/fulmenhq/fulmen-mcp-brooklyn
`;

  mcpCmd
    .command("start")
    .description("Start MCP server (stdin/stdout mode for Claude Code)")
    .option("--team-id <teamId>", "Team identifier")
    .option("--log-level <level>", "Log level (debug, info, warn, error)")
    .option("--dev-mode", "Enable development mode with IPC transport")
    .option("--development-only", "Allow 'none' authentication mode (development only)")
    .option("--socket-path <path>", "Unix socket path (dev mode only)")
    .option(
      "--pipes-prefix <prefix>",
      "Named pipes prefix (experimental dev mode only)",
      join(tmpdir(), "brooklyn-dev"),
    )
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
        if (options.developmentOnly) {
          cliOverrides.authentication = {
            mode: "none",
            developmentOnly: true,
            providers: {},
          };
        }

        const config = await loadConfig(cliOverrides);

        // Create transport first to enter MCP mode
        const transport = options.devMode
          ? await createMCPStdio(
              // Prefer socket path if provided, fall back to environment variables or pipes
              options.socketPath || process.env["BROOKLYN_DEV_SOCKET_PATH"]
                ? { socketPath: options.socketPath || process.env["BROOKLYN_DEV_SOCKET_PATH"] }
                : {
                    inputPipe:
                      process.env["BROOKLYN_DEV_INPUT_PIPE"] || `${options.pipesPrefix}-input`,
                    outputPipe:
                      process.env["BROOKLYN_DEV_OUTPUT_PIPE"] || `${options.pipesPrefix}-output`,
                  },
            )
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

        const { BrooklynEngine } = await import("../core/brooklyn-engine.js");
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
        // CRITICAL: Always log bootstrap failures to stderr for diagnostics
        // This ensures the test suite sees structured logs even when startup aborts early,
        // preventing "silent exit" misinterpretation as "another instance running".
        try {
          const logger = getLogger("brooklyn-cli");
          logger.error("MCP server failed to start", {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            mode: options.devMode ? "dev-pipes" : "stdio",
          });
        } catch {
          // Fallback if logger isn't initialized yet
          console.error(
            JSON.stringify({
              level: 50,
              time: Date.now(),
              msg: "MCP server failed to start",
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        }

        // Additionally emit JSON-RPC error to stdout in stdio mode (for MCP clients)
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
        }

        process.exitCode = 1;
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

  // Note: no direct configure subcommand; unified under `config agent`

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
    .description("Start MCP development mode with IPC transport (internal use only)")
    .option("--team-id <teamId>", "Team identifier for development")
    .option("--foreground", "Keep process in foreground")
    .option("--transport <type>", "Transport type: 'socket' (default) or 'pipe'", "socket")
    .option("--experimental", "Enable experimental features (required for pipe transport)", false)
    .action(async (options) => {
      try {
        // Validate transport and experimental flag combination
        if (options.transport === "pipe" && !options.experimental) {
          console.error("❌ Error: Named pipe transport is experimental and unreliable in Node.js");
          console.error("   Reason: Node.js has fundamental limitations with FIFO operations");
          console.error("   Solution: Use --experimental flag to acknowledge the risks");
          console.error("   Recommendation: Use socket transport instead (--transport socket)");
          console.error("");
          console.error("   Example: brooklyn mcp dev-start --transport pipe --experimental");
          console.error("   Better:  brooklyn mcp dev-start --transport socket");
          process.exit(1);
        }

        if (options.transport === "pipe") {
          console.warn("⚠️  Warning: Using experimental named pipe transport");
          console.warn("   This transport has known reliability issues in Node.js");
          console.warn("   For production use, prefer socket transport");
          console.warn("");
        }

        const { MCPDevManager } = await import("../core/mcp-dev-manager.js");
        const devManager = new MCPDevManager();

        // Set team ID if provided
        if (options.teamId) {
          process.env["BROOKLYN_DEV_TEAM_ID"] = options.teamId;
        }

        await devManager.start({
          foreground: options.foreground,
          transport: options.transport,
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
        process.exit(0);
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
    .description("Start Brooklyn REPL for interactive MCP tool testing (experimental)")
    .option("--json", "Output raw JSON responses instead of pretty-formatted text")
    .option("--verbose", "Enable verbose logging")
    .option("--team-id <teamId>", "Team identifier for REPL session")
    .option("--experimental", "Enable experimental features (required for REPL)", false)
    .action(async (options) => {
      try {
        if (!options.experimental) {
          console.error("❌ Error: Brooklyn REPL is experimental and under active development");
          console.error(
            "   Current status: Basic functionality working, advanced features in progress",
          );
          console.error(
            "   Solution: Use --experimental flag to acknowledge this is a preview feature",
          );
          console.error("");
          console.error("   Example: brooklyn dev-repl --experimental");
          process.exit(1);
        }

        console.warn("⚠️  Warning: Using experimental Brooklyn REPL");
        console.warn("   This feature is under active development and may have limitations");
        console.warn("");

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
    .option("--auth-mode <mode>", HTTP_AUTH_MODE_DESCRIPTION, parseHttpAuthMode)
    .action(async (options) => {
      try {
        const resolvedAuthMode = (options.authMode as HTTPAuthMode | undefined) ?? "disabled";
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
          if (options.authMode) args.push("--auth-mode", options.authMode);

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
          port: Number.parseInt(options.port, 10),
          host: options.host,
          cors: !options.noCors,
          teamId: options.teamId,
          verbose: options.verbose,
          background: false, // Always false when we get here
          pidFile: options.pidFile,
          authMode: resolvedAuthMode,
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
    .option("--auth-mode <mode>", HTTP_AUTH_MODE_DESCRIPTION, parseHttpAuthMode)
    .action(async (options) => {
      try {
        const resolvedAuthMode = (options.authMode as HTTPAuthMode | undefined) ?? "disabled";
        const { BrooklynHTTP } = await import("../core/brooklyn-http.js");
        const httpServer = new BrooklynHTTP({
          port: Number.parseInt(options.port, 10),
          host: options.host,
          cors: !options.noCors,
          teamId: options.teamId,
          verbose: options.verbose,
          background: true, // Always background for daemon
          pidFile: options.pidFile,
          authMode: resolvedAuthMode,
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
        const pid = Number.parseInt(pidStr, 10);
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

    const pidFileForPort = (p: string) => {
      // Prefer the canonical dev-http PID file name.
      const canonical = `${cwd}/.brooklyn-http-${p}.pid`;
      if (existsSync(canonical)) return canonical;
      // Backward/forward compatibility if naming drifted.
      const alt = `${cwd}/.brooklyn-web-${p}.pid`;
      if (existsSync(alt)) return alt;
      return canonical;
    };

    if (port) {
      // Stop specific port
      const pidFile = pidFileForPort(port);
      if (!existsSync(pidFile)) {
        console.log(`❌ No dev-http server found on port ${port} (no PID file)`);
        process.exit(1);
      }

      const pid = Number.parseInt(readFileSync(pidFile, "utf8").trim(), 10);
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
        const pidFiles = files.filter(
          (f) =>
            (f.startsWith(".brooklyn-http-") || f.startsWith(".brooklyn-web-")) &&
            f.endsWith(".pid"),
        );

        if (pidFiles.length === 0) {
          console.log("No dev-http servers running (no PID files found)");
          return;
        }

        console.log(`Stopping ${pidFiles.length} dev-http server(s) from PID files...`);
        let stopped = 0;

        for (const pidFile of pidFiles) {
          const port = pidFile.match(/\.(?:brooklyn-http|brooklyn-web)-(\d+)\.pid$/)?.[1];
          const pidPath = `${cwd}/${pidFile}`;
          const pid = Number.parseInt(readFileSync(pidPath, "utf8").trim(), 10);

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
          const port = Number.parseInt(options.port, 10);
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
        process.exit(0);
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
        process.exit(0);
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
        process.exit(0);
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

  // Append guidance to use unified agent configuration helper
  const originalWebHelp = webCmd.helpInformation;
  webCmd.helpInformation = (() => `${originalWebHelp.call(webCmd)}

Assisted Configuration:
  Use 'brooklyn config agent' to generate and/or apply MCP client
  configurations for IDEs and agents (stdio or http transport).
  Optional: '--product Code|VSCodium|Cursor|Windsurf' to target user scope.`) as any;

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
    .option("--auth-mode <mode>", HTTP_AUTH_MODE_DESCRIPTION, parseHttpAuthMode)
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

        const cliAuthMode = options.authMode as HTTPAuthMode | undefined;

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

        const resolvedAuthMode: HTTPAuthMode =
          cliAuthMode ?? config.transports.http.authMode ?? "required";
        config.transports.http.authMode = resolvedAuthMode;

        // Initialize logging for non-MCP commands

        // If daemon mode, spawn detached process and exit
        if (options.daemon) {
          const { spawn } = await import("node:child_process");
          const args = ["web", "start", "--port", options.port, "--host", resolvedHost];

          if (options.teamId) args.push("--team-id", options.teamId);
          if (options.logLevel) args.push("--log-level", options.logLevel);
          if (cliAuthMode) args.push("--auth-mode", cliAuthMode);

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
            authMode: resolvedAuthMode,
          });

          logger.info("Web server started successfully", {
            url: `http://${resolvedHost}:${options.port}`,
            pid: child.pid,
            authMode: resolvedAuthMode,
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
            authMode: resolvedAuthMode,
          });
        }

        // Create Brooklyn engine
        const { BrooklynEngine } = await import("../core/brooklyn-engine.js");
        const engine = new BrooklynEngine({
          config,
          correlationId: `web-start-${Date.now()}`,
        });

        // Create and add HTTP transport
        const httpTransport = await createHTTP(Number.parseInt(options.port, 10), resolvedHost, {
          cors: true,
          authMode: resolvedAuthMode,
          trustedProxies: config.transports.http.trustedProxies,
        });
        await engine.addTransport("http", httpTransport);

        // Start HTTP transport
        await engine.startTransport("http");

        if (!process.env["BROOKLYN_WEB_DAEMON"]) {
          logger.info("Web server started successfully", {
            url: `http://${resolvedHost}:${options.port}`,
            teamId: config.teamId,
            authMode: resolvedAuthMode,
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
    .option("--port <port>", "HTTP port (default: 3000)", "3000")
    .option("--force", "Force kill with SIGKILL if graceful stop fails")
    .action(async (options) => {
      const { existsSync, readFileSync, unlinkSync } = await import("node:fs");
      const cwd = process.cwd();
      const localPidFile = `${cwd}/.brooklyn-web-${options.port}.pid`;

      const portNum = Number.parseInt(String(options.port), 10);

      // First, check for local PID file (from `web start --daemon`)
      if (existsSync(localPidFile)) {
        try {
          const pid = Number.parseInt(readFileSync(localPidFile, "utf8").trim(), 10);
          if (Number.isFinite(pid) && pid > 0) {
            // Prefer sysprims terminateTree + identity check
            let usedSysprims = false;
            try {
              const { sysprimsTryProcGet, sysprimsTryTerminateTree } = await import(
                "../shared/sysprims.js"
              );
              const info = await sysprimsTryProcGet(pid);
              if (info) {
                const cmd = info.cmdline.join(" ");
                const looksLikeWeb = cmd.includes("web") && cmd.includes("start");
                const matchesPort = Number.isFinite(portNum)
                  ? cmd.includes(`--port ${portNum}`) || cmd.includes(`--port=${portNum}`)
                  : true;

                if (!(looksLikeWeb && matchesPort)) {
                  console.log(
                    `Refusing to stop PID ${pid}: PID file exists but command line does not match expected web server (port ${options.port})`,
                  );
                  process.exit(1);
                }
              }

              const res = await sysprimsTryTerminateTree(pid, {
                grace_timeout_ms: 2000,
                kill_timeout_ms: 2000,
              });

              if (res) {
                usedSysprims = true;
                if (res.warnings.length > 0) {
                  console.log(`sysprims warnings (pid ${pid}): ${res.warnings.join("; ")}`);
                }
                if (!res.exited && options.force) {
                  await sysprimsTryTerminateTree(pid, {
                    grace_timeout_ms: 0,
                    kill_timeout_ms: 2000,
                    signal: 9,
                    kill_signal: 9,
                  });
                }
              }
            } catch {
              // ignore; fall back to process.kill
            }

            if (!usedSysprims) {
              process.kill(pid, "SIGTERM");
              await new Promise((resolve) => setTimeout(resolve, 500));
              try {
                process.kill(pid, 0);
                if (options.force) {
                  process.kill(pid, "SIGKILL");
                }
              } catch {
                // exited
              }
            }

            try {
              unlinkSync(localPidFile);
            } catch {
              // Ignore cleanup errors
            }
            console.log(`Stopped web server on port ${options.port} (PID: ${pid})`);
            process.exit(0);
          }
        } catch {
          // Process may already be dead, clean up PID file
          try {
            unlinkSync(localPidFile);
          } catch {
            // Ignore
          }
          console.log(`Cleaned up stale PID file for port ${options.port}`);
          process.exit(0);
        }
      }

      // Fall back to server-management.ts for managed servers
      try {
        const { stopServerProcess } = await import("../../scripts/server-management.js");
        await stopServerProcess();
        process.exit(0);
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

        // Prefer sysprims when available (no lsof dependency)
        try {
          const { sysprimsTryListeningPids } = await import("../shared/sysprims.js");
          const result = await sysprimsTryListeningPids(port);
          if (result) {
            pids = result.pids;
            if (result.warnings.length > 0) {
              console.log(`sysprims warnings: ${result.warnings.join("; ")}`);
            }
          }
        } catch {
          // ignore; fall back to lsof
        }

        try {
          if (pids.length === 0) {
            const { stdout } = await execAsync(
              `lsof -iTCP:${port} -sTCP:LISTEN -n -P | awk 'NR>1 {print $2}' | sort -u`,
            );
            pids = stdout
              .trim()
              .split("\n")
              .map((s) => Number.parseInt(s.trim(), 10))
              .filter((n) => Number.isFinite(n));
          }
        } catch {
          // lsof may not be present or permission issues; continue to HTTP probe.
        }

        // Basic console output
        if (pids.length > 0) {
          console.log(`Status: Running (listeners on port ${port}: ${pids.join(", ")})`);
        } else {
          console.log(`Status: Unknown (no PID file). Checking HTTP endpoint on port ${port}...`);
        }

        // Probe health endpoint over IPv4 using native http (more reliable in compiled binaries)
        const http = await import("node:http");
        const healthCheck = (): Promise<{ ok: boolean; status?: number; body?: unknown }> => {
          return new Promise((resolve) => {
            const req = http.request(
              {
                hostname: "127.0.0.1",
                port,
                path: "/health",
                method: "GET",
                timeout: 2000,
              },
              (res) => {
                let data = "";
                res.on("data", (chunk) => {
                  data += chunk;
                });
                res.on("end", () => {
                  try {
                    const body = JSON.parse(data);
                    resolve({ ok: res.statusCode === 200, status: res.statusCode, body });
                  } catch {
                    resolve({ ok: res.statusCode === 200, status: res.statusCode });
                  }
                });
              },
            );
            req.on("error", () => resolve({ ok: false }));
            req.on("timeout", () => {
              req.destroy();
              resolve({ ok: false });
            });
            req.end();
          });
        };

        const result = await healthCheck();
        if (result.ok) {
          console.log("Health: ✅ Responding");
          if (result.body) {
            console.log(JSON.stringify(result.body, null, 2));
          }
          process.exit(0);
        } else if (result.status) {
          console.log(`Health: ⚠️ HTTP ${result.status}`);
          process.exit(0);
        } else {
          console.log("Health: ❌ Not responding");
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

        let pids: string[] = [];

        // Prefer sysprims to resolve port -> pid
        try {
          const { sysprimsTryListeningPids } = await import("../shared/sysprims.js");
          const result = await sysprimsTryListeningPids(port);
          if (result) {
            pids = result.pids.map(String);
            if (result.warnings.length > 0) {
              console.log(`sysprims warnings: ${result.warnings.join("; ")}`);
            }
          }
        } catch {
          // ignore
        }

        // Fallback: lsof
        if (pids.length === 0) {
          const { stdout } = await execAsync(
            `lsof -iTCP:${port} -sTCP:LISTEN -n -P | awk 'NR>1 {print $2}' | sort -u`,
          );
          pids = stdout
            .trim()
            .split("\n")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        }

        if (pids.length === 0) {
          console.log(`No listeners found on port ${port}`);
          process.exit(0); // Exit cleanly when no listeners found
        }

        console.log(`Found ${pids.length} listener(s) on port ${port}: ${pids.join(", ")}`);
        for (const pidStr of pids) {
          const pid = Number.parseInt(pidStr, 10);
          if (!Number.isFinite(pid)) continue;

          // Prefer sysprims terminateTree (kills groups when possible)
          let usedSysprims = false;
          try {
            const { sysprimsTryTerminateTree } = await import("../shared/sysprims.js");
            const res = await sysprimsTryTerminateTree(pid, {
              grace_timeout_ms: options.force ? 0 : 1000,
              kill_timeout_ms: 2000,
            });
            if (res) {
              usedSysprims = true;
              if (res.warnings.length > 0) {
                console.log(`sysprims warnings (pid ${pid}): ${res.warnings.join("; ")}`);
              }
              if (!res.exited && options.force) {
                console.log(`Forcing kill for PID ${pid}...`);
              }
            }
          } catch {
            // ignore
          }

          if (!usedSysprims) {
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
 * Register top-level doctor command
 */
function setupDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description(
      "Check MCP and HTTP configurations across common clients (Claude, Codex, Cursor, Kilocode)",
    )
    .option("--json", "Output JSON envelope for agentic parsing", false)
    .option("--recipes", "Include client-specific setup recipes", false)
    .option("--team-id <id>", "Optional team id to include in recipes and commands")
    .action(async (options) => {
      const outputJson = Boolean(options.json);
      const startedAt = Date.now();

      const wrap = (data: unknown) => {
        const durationMs = Date.now() - startedAt;
        if (outputJson) {
          console.log(
            JSON.stringify({ success: true, data, diagnostics: { durationMs } }, null, 2),
          );
        } else {
          // Pretty-print objects to avoid [Object ...] rendering
          console.log(JSON.stringify(data, null, 2));
        }
      };

      const readJSON = (path: string): any | undefined => {
        try {
          if (!existsSync(path)) return undefined;
          const txt = readFileSync(path, "utf8");
          return JSON.parse(txt);
        } catch {
          return undefined;
        }
      };

      const projectRoot = process.cwd();
      const home = homedir();

      const claudePath =
        process.platform === "win32"
          ? join(
              process.env["APPDATA"] || join(home, "AppData", "Roaming"),
              "Claude",
              "claude_desktop_config.json",
            )
          : process.platform === "darwin"
            ? join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
            : join(home, ".config", "claude", "claude_desktop_config.json");
      const claudeProjectPath = join(projectRoot, ".claude_mcp.json");
      // Codex CLI uses ~/.codex/config.toml
      const codexPath = join(home, ".codex", "config.toml");
      // Cursor MCP config discovery (project + user locations)
      const cursorPaths: string[] = [];
      // Project scope (version control friendly)
      cursorPaths.push(join(projectRoot, ".cursor", "mcp.json"));
      // User scope (common locations)
      cursorPaths.push(join(home, ".config", "cursor", "mcp.json"));
      cursorPaths.push(join(home, ".config", "Cursor", "mcp.json"));
      cursorPaths.push(join(home, ".cursor", "mcp.json"));
      if (process.platform === "darwin") {
        cursorPaths.push(join(home, "Library", "Application Support", "Cursor", "mcp.json"));
      }
      const projectMcpPath = join(projectRoot, ".mcp.json");
      const claudeCliPath = join(home, ".claude.json");
      const opencodeUserPath = join(home, ".config", "opencode", "opencode.json");
      const opencodeProjectPath = join(projectRoot, "opencode.json");
      const kilocodePath = join(projectRoot, ".kilocode", "mcp.json");

      // VS Code/VSCodium/Cursor/Windsurf user global storage bases (all candidates)
      const editorProducts = ["Code", "VSCodium", "Cursor", "Windsurf"] as const;
      const editorBaseFor = (product: string) =>
        process.platform === "darwin"
          ? join(home, "Library", "Application Support", product, "User", "globalStorage")
          : process.platform === "win32"
            ? join(
                process.env["APPDATA"] || join(home, "AppData", "Roaming"),
                product,
                "User",
                "globalStorage",
              )
            : join(home, ".config", product, "User", "globalStorage");
      const editorBases = editorProducts.map((p) => ({ product: p, base: editorBaseFor(p) }));
      const clineEntries = editorBases.map(({ product, base }) => ({
        product,
        path: join(base, "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json"),
      }));
      const kilocodeUserEntries = editorBases.map(({ product, base }) => ({
        product,
        path: join(base, "kilocode.kilo-code", "settings", "mcp_settings.json"),
      }));

      const rep = (label: string, path: string, cfg?: any) => {
        const servers = Object.keys(cfg?.mcpServers || {});
        const hasBrooklyn =
          servers.includes("Brooklyn") ||
          servers.some((s) => s.startsWith("Brooklyn-")) ||
          servers.includes("brooklyn") ||
          servers.some((s) => s.startsWith("brooklyn-"));
        const preferred =
          servers.find((s) => s === "Brooklyn") ||
          servers.find((s) => s.startsWith("Brooklyn-")) ||
          servers.find((s) => s === "brooklyn") ||
          servers.find((s) => s.startsWith("brooklyn-"));
        const entry = hasBrooklyn && preferred ? cfg.mcpServers[preferred] : undefined;
        return { label, path, exists: Boolean(cfg), servers, hasBrooklyn, brooklyn: entry };
      };

      const repOpenCode = (label: string, path: string, cfg?: any) => {
        const servers = Object.keys(cfg?.mcp || {});
        const hasBrooklyn = Boolean(cfg?.mcp?.["brooklyn"]);
        const entry = hasBrooklyn ? cfg.mcp["brooklyn"] : undefined;
        // Normalize a summary for doctor view
        let summary: any;
        if (entry) {
          summary =
            entry.type === "local"
              ? { type: "local", command: entry.command }
              : { type: entry.type, url: entry.url };
        }
        return { label, path, exists: Boolean(cfg), servers, hasBrooklyn, brooklyn: summary };
      };

      const projectCfg = readJSON(projectMcpPath);
      const kilocodeCfg = readJSON(kilocodePath);
      const claudeCfg = readJSON(claudePath);
      const claudeProjectCfg = readJSON(claudeProjectPath);
      // Minimal TOML detection: check for [mcp_servers] and brooklyn section
      const readCodexToml = (path: string): any | undefined => {
        try {
          if (!existsSync(path)) return undefined;
          const txt = readFileSync(path, "utf8");
          const hasSection =
            /\[\s*mcp_servers\s*\]/.test(txt) || /\[\s*mcp_servers\.[^\]]+\]/.test(txt);
          const hasBrooklyn = /\[\s*mcp_servers\.brooklyn\s*\]/.test(txt);
          const servers: string[] = [];
          if (hasBrooklyn) servers.push("brooklyn");
          return { mcpServers: hasSection ? {} : undefined, servers, hasBrooklyn };
        } catch {
          return undefined;
        }
      };
      const codexCfg = readCodexToml(codexPath);
      const opencodeUserCfg = readJSON(opencodeUserPath);
      const opencodeProjectCfg = readJSON(opencodeProjectPath);
      const clineConfigs = clineEntries.map((e) => ({
        product: e.product,
        path: e.path,
        cfg: readJSON(e.path),
      }));
      const kilocodeUserConfigs = kilocodeUserEntries.map((e) => ({
        product: e.product,
        path: e.path,
        cfg: readJSON(e.path),
      }));
      const cursorReports = cursorPaths
        .map((p) => ({ path: p, cfg: readJSON(p) }))
        .map((x) => rep("cursor", x.path, x.cfg));
      const cursorBest = cursorReports.find((r) => r.exists) || cursorReports[0];

      const { BrooklynProcessManager } = await import("../shared/process-manager.js");
      const procSummary = await BrooklynProcessManager.getProcessSummary();

      // Editor discovery summary for transport recommendation and reporting
      const editorsSummary = editorBases.map((e) => ({
        product: e.product,
        base: e.base,
        cline: Boolean(clineConfigs.find((c) => c.product === e.product && c.cfg)),
        kilocode: Boolean(kilocodeUserConfigs.find((c) => c.product === e.product && c.cfg)),
      }));

      // Driver-based recipe generation
      const recipes: Record<string, unknown> = {};
      if (options.recipes) {
        const teamId = options.teamId ? String(options.teamId) : undefined;
        for (const key of Object.keys(agentDrivers) as AgentClientKey[]) {
          const driver = agentDrivers[key];
          const entries: any[] = [];
          for (const loc of driver.locations) {
            const path = resolvePathFor(loc, projectRoot);
            const stdioTemplate = driver.templates.stdio?.({ teamId });
            const httpTemplate = driver.templates.http?.({
              host: "127.0.0.1",
              port: 3000,
              teamId,
            });
            entries.push({
              scope: loc.scope,
              path,
              writable: loc.writable,
              stdioTemplate,
              httpTemplate,
              commands: {
                stdio: driver.commands?.stdio?.({ teamId }) || [],
                http: driver.commands?.http?.({ host: "127.0.0.1", port: 3000, teamId }) || [],
              },
            });
          }
          recipes[key] = { displayName: driver.displayName, entries };
        }

        // Editor-targeted recipes for Cline and Kilocode with --product flag
        const editorProductsList = ["Code", "VSCodium", "Cursor", "Windsurf"] as const;
        const editorRecipes = editorProductsList.map((prod) => ({
          product: prod,
          cline: {
            path: join(
              editorBaseFor(prod),
              "saoudrizwan.claude-dev",
              "settings",
              "cline_mcp_settings.json",
            ),
            commands: [
              `brooklyn config agent --client cline --scope user --product ${prod} --transport stdio${
                teamId ? ` --team-id ${teamId}` : ""
              }`,
              `brooklyn config agent --client cline --scope user --product ${prod} --transport http --host 127.0.0.1 --port 3000${
                teamId ? ` --team-id ${teamId}` : ""
              }`,
            ],
          },
          kilocode: {
            path: join(editorBaseFor(prod), "kilocode.kilo-code", "settings", "mcp_settings.json"),
            commands: [
              `brooklyn config agent --client kilocode --scope user --product ${prod} --transport stdio${
                teamId ? ` --team-id ${teamId}` : ""
              }`,
              `brooklyn config agent --client kilocode --scope user --product ${prod} --transport http --host 127.0.0.1 --port 3000${
                teamId ? ` --team-id ${teamId}` : ""
              }`,
            ],
          },
        }));
        (recipes as any).editors = editorRecipes;

        // Simple recommendation heuristic: if more than one editor has cline/kilocode configured, prefer http
        const multiEditorsConfigured =
          editorsSummary.filter((e) => e.cline || e.kilocode).length > 1;
        const recommendedTransport = multiEditorsConfigured ? "http" : "stdio";
        (recipes as any).recommendation = {
          recommendedTransport,
          rationale: multiEditorsConfigured
            ? "Multiple editors detected with MCP settings; a single HTTP server is more efficient across tools."
            : "Single-editor usage; stdio is simpler and auto-managed by the IDE.",
          examples: multiEditorsConfigured
            ? [
                "brooklyn web start --daemon",
                `brooklyn config agent --client cline --scope user --transport http --host 127.0.0.1 --port 3000${
                  teamId ? ` --team-id ${teamId}` : ""
                }`,
                `brooklyn config agent --client kilocode --scope user --transport http --host 127.0.0.1 --port 3000${
                  teamId ? ` --team-id ${teamId}` : ""
                }`,
              ]
            : [
                `brooklyn config agent --client cline --scope user --transport stdio${
                  teamId ? ` --team-id ${teamId}` : ""
                }`,
                `brooklyn config agent --client kilocode --scope user --transport stdio${
                  teamId ? ` --team-id ${teamId}` : ""
                }`,
              ],
        };
      }

      // Minimal MCP stdio handshake test
      const testMcpHandshake = async (): Promise<{
        ok: boolean;
        protocol?: string;
        error?: string;
        sample?: string;
        durationMs: number;
      }> => {
        const t0 = Date.now();
        try {
          const { spawn } = await import("node:child_process");
          const proc = spawn("brooklyn", ["mcp", "start"], {
            stdio: ["pipe", "pipe", "ignore"],
            env: { ...process.env, BROOKLYN_MCP_STDERR: "false" },
          });

          const init =
            '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"roots":{}},"clientInfo":{"name":"doctor","version":"1.0"}}}\n';
          proc.stdin.write(init);

          let buffer = "";
          const timeoutMs = 2500;
          let settled = false;
          return await new Promise((resolve) => {
            const done = (res: any) => {
              if (settled) return;
              settled = true;
              try {
                proc.kill("SIGTERM");
              } catch {}
              resolve(res);
            };

            const to = setTimeout(() => {
              done({
                ok: false,
                error: "timeout",
                sample: buffer.slice(0, 200),
                durationMs: Date.now() - t0,
              });
            }, timeoutMs);

            proc.stdout.on("data", (chunk: Buffer | string) => {
              buffer += chunk.toString();
              const lines = buffer.split(/\r?\n/);
              if (lines.length > 1) {
                clearTimeout(to);
                const line = lines[0] || "";
                try {
                  const msg = JSON.parse(line);
                  const protocol = msg?.result?.protocolVersion as string | undefined;
                  if (protocol) {
                    done({
                      ok: true,
                      protocol,
                      sample: line.slice(0, 200),
                      durationMs: Date.now() - t0,
                    });
                  } else {
                    done({
                      ok: false,
                      error: "no result.protocolVersion",
                      sample: line.slice(0, 200),
                      durationMs: Date.now() - t0,
                    });
                  }
                } catch (e: any) {
                  done({
                    ok: false,
                    error: e?.message || "invalid-json",
                    sample: line.slice(0, 200),
                    durationMs: Date.now() - t0,
                  });
                }
              }
            });

            proc.on("error", (err) => {
              clearTimeout(to);
              done({
                ok: false,
                error: err?.message || "spawn-error",
                sample: buffer.slice(0, 200),
                durationMs: Date.now() - t0,
              });
            });
          });
        } catch (err: any) {
          return { ok: false, error: err?.message || String(err), durationMs: Date.now() - t0 };
        }
      };

      // Try to detect Claude CLI registry and HTTP URL
      const readClaudeCli = (): { type?: string; url?: string } | undefined => {
        try {
          const txt = readFileSync(claudeCliPath, "utf8");
          const cfg = JSON.parse(txt);
          const entry = cfg?.mcpServers?.["brooklyn"];
          if (entry && typeof entry === "object") {
            return { type: entry.type as string | undefined, url: entry.url as string | undefined };
          }
        } catch {}
        return undefined;
      };

      async function checkHttpHealth(
        url: string,
      ): Promise<{ ok: boolean; status?: number; error?: string }> {
        try {
          const controller = new AbortController();
          const to = setTimeout(() => controller.abort(), 2000);
          const res = await fetch(`${url.replace(/\/$/, "")}/health`, {
            signal: controller.signal,
          });
          clearTimeout(to);
          return { ok: res.ok, status: res.status };
        } catch (e: any) {
          return { ok: false, error: e?.message || String(e) };
        }
      }

      const claudeCli = readClaudeCli();
      const httpHealth =
        claudeCli?.type === "http" && claudeCli.url
          ? await checkHttpHealth(String(claudeCli.url))
          : undefined;

      const result = {
        when: new Date().toISOString(),
        projectRoot,
        configs: {
          project: rep("project .mcp.json", projectMcpPath, projectCfg),
          opencodeUser: repOpenCode("opencode user-wide", opencodeUserPath, opencodeUserCfg),
          opencodeProject: repOpenCode("opencode project", opencodeProjectPath, opencodeProjectCfg),
          kilocode: rep("kilocode .kilocode/mcp.json", kilocodePath, kilocodeCfg),
          kilocodeUserAll: kilocodeUserConfigs.map((x) =>
            rep(`kilocode user (${x.product})`, x.path, x.cfg),
          ),
          claude: rep("claude-code user-wide", claudePath, claudeCfg),
          claudeProject: rep(
            "claude-code project .claude_mcp.json",
            claudeProjectPath,
            claudeProjectCfg,
          ),
          codex: rep("codex-cli user-wide", codexPath, codexCfg),
          clineAll: clineConfigs.map((x) => rep(`cline user (${x.product})`, x.path, x.cfg)),
          cursor: { best: cursorBest, all: cursorReports },
        },
        http: {
          processes: procSummary,
        },
        mcp: {
          handshake: await testMcpHandshake(),
        },
        suggestions: [] as string[],
        recipes: options.recipes ? recipes : undefined,
      };

      if (!result.configs.project.exists) {
        result.suggestions.push(
          "Add project .mcp.json for Codex/Cursor (repo includes a template).",
        );
      }

      // Suggest switching Cline to stdio if HTTP (url) detected in cline configs
      const clineList: any[] = (result.configs as any).clineAll || [];
      for (const entry of clineList) {
        if (entry?.hasBrooklyn && entry?.brooklyn && typeof entry.brooklyn === "object") {
          if (Object.hasOwn(entry.brooklyn, "url")) {
            // Try to extract product name from label "cline user (Product)"
            const m = /\(([^)]+)\)/.exec(entry.label || "");
            const productName = m ? m[1] : "Code";
            result.suggestions.push(
              `Cline ${productName}: HTTP (url) requires SSE; switch to stdio: brooklyn client configure --client cline --scope user --product ${productName} --transport stdio --apply`,
            );
          }
        }
      }

      // Editor discovery summary and suggestions
      (result as any).editors = editorsSummary;

      for (const ed of editorsSummary) {
        if (!ed.cline) {
          result.suggestions.push(
            `Cline settings missing for ${ed.product} (expected under globalStorage/saoudrizwan.claude-dev/settings). Use 'brooklyn config agent --client cline --scope user'.`,
          );
        }
        if (!ed.kilocode) {
          result.suggestions.push(
            `Kilocode settings missing for ${ed.product} (expected under globalStorage/kilocode.kilo-code/settings). Use 'brooklyn config agent --client kilocode --scope user'.`,
          );
        }
      }
      if (!result.configs.claude.exists) {
        result.suggestions.push(
          "Configure Claude Code MCP (user): claude mcp add -s user -t stdio brooklyn -- brooklyn mcp start",
        );
        result.suggestions.push(
          "Or HTTP (user): claude mcp add -s user -t http brooklyn http://127.0.0.1:3000",
        );
      }
      if (!result.configs.claudeProject.exists) {
        result.suggestions.push(
          "Configure Claude Code MCP (project): claude mcp add -s project -t stdio brooklyn -- brooklyn mcp start",
        );
      }
      if (!result.configs.codex.exists) {
        result.suggestions.push(
          "Create codex-cli user MCP config (~/.config/codex-cli/mcp.json) or rely on project .mcp.json",
        );
      }
      if (!result.configs.cursor.best?.exists) {
        result.suggestions.push(
          `Create Cursor MCP config at project scope (${join(
            projectRoot,
            ".cursor",
            "mcp.json",
          )}) or user scope (~/.config/cursor/mcp.json).`,
        );
      }
      const be = result.configs.project.brooklyn as any | undefined;
      if (result.configs.project.exists && be && be.command !== "brooklyn") {
        result.suggestions.push(
          "Project .mcp.json brooklyn command should be 'brooklyn' with args ['mcp','start'].",
        );
      }

      // If Claude CLI is configured for HTTP but /health is not responding, guide to start server
      if (claudeCli?.type === "http" && claudeCli.url && httpHealth && !httpHealth.ok) {
        try {
          const u = new URL(String(claudeCli.url));
          const host = u.hostname || "127.0.0.1";
          const port = u.port || "3000";
          result.suggestions.push(
            `Claude is configured for HTTP at ${claudeCli.url}, but /health is not responding. ` +
              `Start the server: brooklyn web start --host ${host} --port ${port} --daemon`,
          );
        } catch {
          result.suggestions.push(
            `Claude is configured for HTTP at ${claudeCli.url}, but /health is not responding. Start the server: brooklyn web start --daemon`,
          );
        }
      }

      wrap(result);
      process.exit(0);
    });
}
/**
 * Setup browsers for Brooklyn
 */
async function setupBrowsers(browserType?: string): Promise<void> {
  const logger = getLogger("brooklyn-setup");

  logger.info("Installing browsers for Brooklyn automation...");

  try {
    const { execSync } = await import("node:child_process");
    const { existsSync } = await import("node:fs");

    // Determine how to run playwright install
    // Priority: 1) local node_modules (if in repo), 2) bunx, 3) npx
    const localPlaywright = join(process.cwd(), "node_modules", ".bin", "playwright");
    let playwrightCmd: string;

    if (existsSync(localPlaywright)) {
      logger.info("Using local node_modules playwright...");
      playwrightCmd = `"${localPlaywright}"`;
    } else {
      // Detect available package runner (bunx or npx)
      let useBunx = false;
      try {
        execSync("bunx --version", { stdio: "ignore" });
        useBunx = true;
      } catch {
        // bunx not available, will try npx
      }

      if (useBunx) {
        logger.info("Using bunx to run playwright...");
        playwrightCmd = "bunx playwright";
      } else {
        logger.info("Using npx to run playwright...");
        playwrightCmd = "npx playwright";
      }
    }

    const installCmd = browserType
      ? `${playwrightCmd} install ${browserType}`
      : `${playwrightCmd} install`;

    if (browserType) {
      logger.info(`Installing ${browserType}...`);
    } else {
      logger.info("Installing all browsers (chromium, firefox, webkit)...");
    }

    execSync(installCmd, { stdio: "inherit" });

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
    .description("Show Brooklyn version information (use --extended for build details)")
    .option("--extended", "Show detailed build information")
    .option("--json", "Output in JSON format")
    .action(async (options) => {
      if (options.extended || options.json) {
        // Static version info is already available as VERSION constant

        // Try to import build signature from generated file
        let buildSignature = null;
        try {
          const { buildSignature: importedSignature } = await import(
            "../generated/build-signature.js"
          );
          buildSignature = importedSignature;
        } catch (_error) {
          // Build signature not available - this means embed-version hasn't been run
          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  version: VERSION,
                  buildSignature: null,
                  error:
                    "Build signature not available. Run 'bun run build' or 'bun run version:embed' first.",
                },
                null,
                2,
              ),
            );
            process.exit(0);
          } else {
            console.log(`Brooklyn MCP Server v${VERSION}`);
            console.log("");
            console.log("⚠️  Extended build information not available.");
            console.log("📋 To see build details, run: bun run build");
            console.log("💡 Or generate build signature: bun run version:embed");
            process.exit(0);
          }
        }

        // Try to load build manifest for complete signature including binary hash
        let buildManifest = null;
        try {
          const fs = await import("node:fs/promises");
          const path = await import("node:path");

          // Look for manifest file next to the binary or in dist/
          const possiblePaths = [
            process.argv[1] ? path.resolve(process.argv[1], "../brooklyn.manifest.json") : "",
            path.resolve(process.cwd(), "dist/brooklyn.manifest.json"),
          ].filter((p) => p); // Remove empty strings

          for (const manifestPath of possiblePaths) {
            try {
              const manifestContent = await fs.readFile(manifestPath, "utf-8");
              buildManifest = JSON.parse(manifestContent);
              break;
            } catch {
              // Continue to next path
            }
          }
        } catch {
          // Fall back to buildConfig only
        }

        const extendedInfo = {
          version: VERSION,
          buildSignature: buildSignature,
          binaryHash: buildManifest?.binaryHash || null,
        };

        if (options.json) {
          console.log(JSON.stringify(extendedInfo, null, 2));
        } else {
          console.log(`Brooklyn MCP Server v${VERSION}`);
          if (buildSignature) {
            // Format git commit with dirty flag if needed
            let gitInfo = `Git commit: ${buildSignature.gitCommit.slice(0, 8)}`;
            if (!buildSignature.gitStatus.clean) {
              const dirtyFlags = [];
              if (buildSignature.gitStatus.staged > 0)
                dirtyFlags.push(`+${buildSignature.gitStatus.staged}`);
              if (buildSignature.gitStatus.unstaged > 0)
                dirtyFlags.push(`~${buildSignature.gitStatus.unstaged}`);
              if (buildSignature.gitStatus.untracked > 0)
                dirtyFlags.push(`?${buildSignature.gitStatus.untracked}`);
              if (dirtyFlags.length > 0) gitInfo += `-dirty(${dirtyFlags.join(",")})`;
            }
            console.log(gitInfo);

            // Show branch with ahead/behind info
            let branchInfo = `Git branch: ${buildSignature.gitBranch}`;
            if (buildSignature.gitStatus.ahead > 0 || buildSignature.gitStatus.behind > 0) {
              const aheadBehind = [];
              if (buildSignature.gitStatus.ahead > 0)
                aheadBehind.push(`ahead ${buildSignature.gitStatus.ahead}`);
              if (buildSignature.gitStatus.behind > 0)
                aheadBehind.push(`behind ${buildSignature.gitStatus.behind}`);
              branchInfo += ` (${aheadBehind.join(", ")})`;
            }
            console.log(branchInfo);

            console.log(`Build time: ${buildSignature.buildTime}`);
            console.log(`Platform: ${buildSignature.platform}/${buildSignature.arch}`);
            console.log(
              `Runtime: Node ${buildSignature.nodeVersion}, Bun ${buildSignature.bunVersion}`,
            );
            console.log(`Environment: ${buildSignature.buildEnv}`);

            // Show binary hash from manifest if available, otherwise from buildSignature
            const binaryInfo = extendedInfo.binaryHash || buildSignature.binaryHash;
            if (binaryInfo) {
              console.log(
                `Binary: ${(binaryInfo.size / 1024 / 1024).toFixed(2)}MB, SHA256: ${binaryInfo.sha256.slice(0, 16)}...`,
              );
            }
          }
        }
      } else {
        console.log(VERSION);
      }
      process.exit(0);
    });
}

/**
 * Authentication command group
 */
function setupAuthCommands(program: Command): void {
  (async () => {
    try {
      const { createAuthCommand } = await import("./commands/auth.js");
      const authCmd = createAuthCommand();
      program.addCommand(authCmd);
    } catch (error) {
      // If auth commands fail to load, continue without them
      console.warn(
        "⚠️  Auth commands not available:",
        error instanceof Error ? error.message : String(error),
      );
    }
  })().catch(() => {
    // Silent catch for async function in sync context
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
 * Configuration command group - Validate and manage config files
 */
function setupConfigCommands(program: Command): void {
  const configCmd = program
    .command("config")
    .description("Configuration management and validation");

  // Unified client configuration helper (stdio or http) – alias to client configure
  const _agentAlias = configCmd
    .command("agent")
    .description("(alias) Generate and/or apply MCP client configs for IDEs and agents")
    .option("--client <name>", "Target client: cursor|claude|codex|project", "project")
    .option("--transport <type>", "Transport: stdio|http", "stdio")
    .option("--scope <scope>", "Scope: project|user", "project")
    .option("--product <name>", "Editor product for user scope: Code|VSCodium|Cursor|Windsurf")
    .option("--host <host>", "HTTP host (for http transport)", "127.0.0.1")
    .option("--port <port>", "HTTP port (for http transport)", "3000")
    .option("--team-id <id>", "Optional team id (prefers X-Team-Id; falls back to ?team=)")
    .option("--apply", "Write changes to disk (otherwise dry-run)", false)
    .option("--print", "Print resulting file content or commands", false)
    .action(async (options) => {
      // Delegate to client configure for consistency
      try {
        const { runConfigAgent } = await import("./commands/config-agent.js");
        await runConfigAgent(options);
        process.exit(0);
      } catch (error) {
        console.error("Failed to generate/apply agent configuration:", error);
        process.exit(1);
      }
    });

  configCmd
    .command("validate")
    .description("Validate configuration files against JSON Schema")
    .option("-f, --file <path>", "Configuration file path to validate")
    .option("--current", "Validate current loaded configuration")
    .option("--schema-info", "Show schema information")
    .option("--verbose", "Show detailed validation information")
    .action(async (_options) => {
      const { createConfigValidateCommand } = await import("./commands/config-validate.js");
      const validateCmd = createConfigValidateCommand();
      await validateCmd.parseAsync(
        ["validate", ...process.argv.slice(process.argv.indexOf("validate") + 1)],
        {
          from: "user",
        },
      );
    });

  configCmd
    .command("show")
    .description("Show current configuration")
    .option("--json", "Output as JSON")
    .option("--sources", "Show configuration sources")
    .action(async (options) => {
      try {
        const { configManager } = await import("../core/config.js");
        const config = await configManager.load();

        if (options.json) {
          console.log(JSON.stringify(config, null, 2));
        } else {
          console.log("📋 Brooklyn Configuration");
          console.log(`Service: ${config.serviceName} v${config.version}`);
          console.log(`Environment: ${config.environment}`);
          console.log(`Team: ${config.teamId}`);
          console.log(`Authentication: ${config.authentication.mode}`);
          console.log(
            `Transports: MCP=${config.transports.mcp.enabled}, HTTP=${config.transports.http.enabled}`,
          );
          console.log(`Max browsers: ${config.browsers.maxInstances}`);

          if (options.sources) {
            console.log("\n📁 Configuration Sources:");
            const sources = configManager.getSources();
            if (sources.configFile) console.log("- Config file loaded");
            if (sources.env && Object.keys(sources.env).length > 0)
              console.log("- Environment variables detected");
            if (sources.cliOverrides) console.log("- CLI overrides applied");
          }
        }
        process.exit(0);
      } catch (error) {
        console.error("❌ Failed to load configuration");
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

/**
 * Client command group - IDE/agent MCP configuration
 */
function setupClientCommands(program: Command): void {
  const clientCmd = program
    .command("client")
    .description(
      "Manage MCP client configurations (IDEs and agent CLIs). See 'brooklyn client guide' for setup tips.",
    );
  clientCmd.addHelpText(
    "afterAll",
    `

Recommended Setup Patterns:
  • Multi‑instance (multiple Claude windows/editors): prefer HTTP user‑wide.
    Examples:
      brooklyn client configure --client claude --scope user --transport http --apply
      brooklyn client configure --client kilocode --scope user --transport http --apply

  • Where HTTP isn’t available (e.g., pending SSE): use project‑scoped STDIO.
    Examples:
      brooklyn client configure --client cline --scope user --transport stdio --apply
      brooklyn client configure --client opencode --scope user --transport stdio --apply

  • Reset and re‑apply:
      claude mcp remove brooklyn
      brooklyn client configure --client claude --scope user --transport http --apply

Smart Defaults:
  • If you omit --transport, the helper prefers HTTP at user scope when supported,
    and falls back to project‑STDIO when not, to avoid multi‑instance STDIO contention.
  • For non‑writable targets (e.g., Claude Code user), the helper runs the official
    client CLI (like "claude mcp add …") under --apply.

Troubleshooting:
  • brooklyn doctor --json   # includes an MCP stdio handshake check
  • brooklyn mcp cleanup     # clears stale stdio processes for a project
  • brooklyn web start --host 127.0.0.1 --port 3000  # start HTTP backend
`,
  );

  clientCmd
    .command("configure")
    .description("Add/update Brooklyn MCP entry for a client (safe patch)")
    .option(
      "--client <name>",
      "Client: cursor|claude|cline|kilocode|codex|opencode|project",
      "project",
    )
    .option("--transport <type>", "Transport: stdio|http", "stdio")
    .option("--scope <scope>", "Scope: project|user", "project")
    .option("--product <name>", "Editor: Code|VSCodium|Cursor|Windsurf (user scope)")
    .option("--host <host>", "HTTP host", "127.0.0.1")
    .option("--port <port>", "HTTP port", "3000")
    .option("--team-id <id>", "Team id for stdio/http")
    .option("--apply", "Write changes (default: preview only)", false)
    .option("--print", "Print resulting content/commands", false)
    .action(async (options) => {
      try {
        const { runConfigAgent } = await import("./commands/config-agent.js");
        await runConfigAgent(options);
        process.exit(0);
      } catch (error) {
        console.error("Failed to configure client:", error);
        process.exit(1);
      }
    });

  // Append guidance to 'configure' subcommand help
  const configureCmd = clientCmd.commands.find((c) => c.name() === "configure");
  if (configureCmd) {
    configureCmd.addHelpText(
      "afterAll",
      `

Examples:
  # Global HTTP for Claude Code, with explicit transport
  brooklyn client configure --client claude --scope user --transport http --apply

  # Project‑scoped STDIO where HTTP isn’t available
  brooklyn client configure --client cline --scope user --transport stdio --apply

Notes:
  • If you omit --transport, the helper prefers HTTP at user scope when supported,
    and falls back to project‑STDIO when not, to avoid multi‑instance STDIO contention.
  • Non‑writable targets (e.g., Claude Code user) are configured via the official
    client CLI (e.g., 'claude mcp add …') under --apply.
  • Use 'brooklyn doctor --json' to run a quick stdio handshake test.
      `,
    );
  }

  clientCmd
    .command("remove")
    .description("Remove the Brooklyn MCP entry for a client (safe patch)")
    .option("--client <name>", "Client: cursor|cline|kilocode|codex|opencode|project", "project")
    .option("--scope <scope>", "Scope: project|user", "project")
    .option("--product <name>", "Editor: Code|VSCodium|Cursor|Windsurf (user scope)")
    .action(async (options) => {
      try {
        // Resolve path similarly to configure, then patch null
        const { homedir } = await import("node:os");
        const { join } = await import("node:path");
        const { agentDrivers, resolvePathFor, getEditorGlobalStorageBase } = await import(
          "../shared/agent-drivers.js"
        );
        const { patchJsonBrooklyn, patchTomlBrooklyn, ensureDirFor } = await import(
          "../shared/config-patcher.js"
        );

        const client = String(options.client);
        const driver = (agentDrivers as any)[client];
        if (!driver) {
          console.error(`Unknown client '${client}'.`);
          process.exit(1);
        }
        const loc =
          driver.locations.find((l: any) => l.scope === options.scope) || driver.locations[0];
        let targetPath = resolvePathFor(loc, process.cwd());
        if (options.scope === "user" && options.product) {
          const base = getEditorGlobalStorageBase(String(options.product), homedir());
          if (client === "cline") {
            targetPath = join(
              base,
              "saoudrizwan.claude-dev",
              "settings",
              "cline_mcp_settings.json",
            );
          } else if (client === "kilocode") {
            targetPath = join(base, "kilocode.kilo-code", "settings", "mcp_settings.json");
          } else if (client === "codex") {
            targetPath = join(homedir(), ".codex", "config.toml");
          }
        }
        ensureDirFor(targetPath);
        if (client === "codex") {
          const r = patchTomlBrooklyn(targetPath, null, { backup: true, dryRun: false });
          console.log("Removed brooklyn from:", targetPath);
          if (r.backup) console.log("Backup:", r.backup);
        } else {
          const r = patchJsonBrooklyn(targetPath, null, { backup: true, dryRun: false });
          console.log("Removed brooklyn from:", targetPath);
          if (r.backup) console.log("Backup:", r.backup);
        }
        process.exit(0);
      } catch (error) {
        console.error("Failed to remove client entry:", error);
        process.exit(1);
      }
    });

  clientCmd
    .command("list")
    .description("List detected client configurations and MCP servers")
    .action(async () => {
      const { getLogger } = await import("../shared/pino-logger.js");
      const logger = getLogger("brooklyn-cli");
      const { exec } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execAsync = promisify(exec);
      try {
        const { stdout } = await execAsync("brooklyn doctor --json");
        const report = JSON.parse(stdout);
        logger.info("Client configurations", report.data.configs);
        process.exit(0);
      } catch (error) {
        console.error("Failed to list client configs:", error);
        process.exit(1);
      }
    });

  clientCmd
    .command("validate")
    .description("Validate client configuration file against known schemas")
    .option("--client <name>", "Client: opencode", "opencode")
    .option("--scope <scope>", "Scope: project|user", "user")
    .option("--schema-from-network", "Fetch schema from network instead of local cache", false)
    .action(async (options) => {
      try {
        const client = String(options.client);
        if (client !== "opencode") {
          console.error("Only 'opencode' is supported by validate right now");
          process.exit(1);
        }
        const { homedir } = await import("node:os");
        const { join } = await import("node:path");
        const { readFileSync } = await import("node:fs");
        const Ajv = (await import("ajv")).default;
        const addFormats = (await import("ajv-formats")).default;
        const configPath =
          options.scope === "project"
            ? join(process.cwd(), "opencode.json")
            : join(homedir(), ".config", "opencode", "opencode.json");

        let schema: any;
        if (options.schemaFromNetwork) {
          const resp = await fetch("https://opencode.ai/config.json");
          schema = await resp.json();
        } else {
          schema = JSON.parse(
            readFileSync(join(process.cwd(), "schemas", "opencode-config.json"), "utf8"),
          );
        }

        let config: any = {};
        try {
          config = JSON.parse(readFileSync(configPath, "utf8"));
        } catch {
          console.error(`Config not found or invalid JSON: ${configPath}`);
          process.exit(1);
        }

        const ajv = new Ajv({ allErrors: true, strict: false });
        addFormats(ajv);
        const validate = ajv.compile(schema);
        const valid = validate(config);
        if (valid) {
          console.log(JSON.stringify({ success: true, path: configPath }, null, 2));
          process.exit(0);
        }
        console.log(
          JSON.stringify(
            { success: false, path: configPath, errors: validate.errors ?? [] },
            null,
            2,
          ),
        );
        process.exit(1);
      } catch (error) {
        console.error("Validation failed:", error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Guide: recommended patterns and troubleshooting
  clientCmd
    .command("guide")
    .description("Show recommended setup patterns and troubleshooting tips")
    .action(() => {
      const text = `\nRecommended Setup Patterns\n\n\n- Default: HTTP (Streamable HTTP) for agent clients.\n  Examples:\n    brooklyn config agent --client claude --scope user --transport http --host 127.0.0.1 --port 3000 --apply\n    brooklyn config agent --client opencode --scope user --transport http --host 127.0.0.1 --port 3000 --apply\n    brooklyn config agent --client kilocode --scope user --transport http --host 127.0.0.1 --port 3000 --apply\n    brooklyn config agent --client codex --scope user --transport http --host 127.0.0.1 --port 3000 --apply\n\n- STDIO is for terminal-native workflows only (single-agent).\n  Example:\n    brooklyn config agent --client claude --scope user --transport stdio --apply\n\n- Reset and re-apply (Claude Code):\n    claude mcp remove brooklyn\n    brooklyn config agent --client claude --scope user --transport http --host 127.0.0.1 --port 3000 --apply\n\nSmart Defaults\n\n\n- If you omit --transport, the helper prefers HTTP at user scope when supported.\n- For non-writable targets (e.g., Claude Code user), the helper runs the official\n  client CLI (like 'claude mcp add …') under --apply.\n\nTroubleshooting\n\n\n- brooklyn doctor --json   # local health and diagnostics\n- brooklyn web status      # check HTTP daemon status\n- brooklyn web cleanup --port 3000\n- brooklyn web start --host 127.0.0.1 --port 3000 --auth-mode localhost --daemon\n\nDocs\n\n\n- docs/deployment/unified-deployment.md\n`;
      console.log(text);
      process.exit(0);
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
    setupConfigCommands(program);
    setupClientCommands(program);
    setupAuthCommands(program);
    setupStatusCommand(program);
    setupSetupCommand(program);
    setupDoctorCommand(program);
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
