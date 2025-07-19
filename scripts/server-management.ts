#!/usr/bin/env bun
/**
 * Server management scripts for Brooklyn MCP server
 * Provides start, stop, restart, status, and cleanup functionality
 */

import { exec, spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

// Configuration
const SERVER_NAME = "fulmen-brooklyn";
const PID_FILE = join(homedir(), ".local", "share", SERVER_NAME, "server.pid");
const LOG_FILE = join(homedir(), ".local", "share", SERVER_NAME, "logs", "server.log");
const _STARTUP_TIMEOUT = 10000; // 10 seconds

// Ensure directories exist
import { mkdirSync } from "node:fs";
mkdirSync(join(homedir(), ".local", "share", SERVER_NAME), { recursive: true });
mkdirSync(join(homedir(), ".local", "share", SERVER_NAME, "logs"), { recursive: true });

/**
 * Get the process ID from the PID file
 */
function getPid(): number | null {
  try {
    if (!existsSync(PID_FILE)) {
      return null;
    }
    const pidStr = readFileSync(PID_FILE, "utf8").trim();
    return Number.parseInt(pidStr, 10);
  } catch {
    return null;
  }
}

/**
 * Check if a process is running
 */
function isProcessRunning(pid: number): boolean {
  try {
    // Send signal 0 to check if process exists
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write PID to file
 */
function writePid(pid: number): void {
  writeFileSync(PID_FILE, pid.toString());
}

/**
 * Remove PID file
 */
function removePidFile(): void {
  try {
    if (existsSync(PID_FILE)) {
      unlinkSync(PID_FILE);
    }
  } catch (error) {
    console.warn(`Warning: Could not remove PID file: ${error}`);
  }
}

/**
 * Start the server
 */
async function startServer(): Promise<void> {
  const existingPid = getPid();

  if (existingPid && isProcessRunning(existingPid)) {
    console.log(`Server is already running with PID ${existingPid}`);
    return;
  }

  // Clean up stale PID file
  if (existingPid) {
    removePidFile();
  }

  console.log("Starting Brooklyn MCP server...");

  // Start the server process
  const serverProcess = spawn("bun", ["run", "dist/index.js"], {
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      WEBPILOT_LOG_FILE: "server.log",
      WEBPILOT_LOG_LEVEL: process.env["WEBPILOT_LOG_LEVEL"] || "info",
    },
  });

  // Check if PID is available
  if (!serverProcess.pid) {
    console.error("Failed to get server process PID");
    process.exit(1);
  }

  // Write PID file
  writePid(serverProcess.pid);

  // Detach from parent process
  serverProcess.unref();

  // Wait a moment and check if server started successfully
  await new Promise((resolve) => setTimeout(resolve, 2000));

  if (isProcessRunning(serverProcess.pid)) {
    console.log(`Server started successfully with PID ${serverProcess.pid}`);
    console.log(`Logs are written to: ${LOG_FILE}`);
  } else {
    console.error("Server failed to start");
    removePidFile();
    process.exit(1);
  }
}

/**
 * Stop the server
 */
async function stopServer(): Promise<void> {
  const pid = getPid();

  if (!pid) {
    console.log("No server PID file found");
    return;
  }

  if (!isProcessRunning(pid)) {
    console.log("Server is not running");
    removePidFile();
    return;
  }

  console.log(`Stopping server with PID ${pid}...`);

  try {
    // Send SIGTERM for graceful shutdown
    process.kill(pid, "SIGTERM");

    // Wait for graceful shutdown
    let attempts = 0;
    const maxAttempts = 30; // 3 seconds

    while (attempts < maxAttempts && isProcessRunning(pid)) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts++;
    }

    if (isProcessRunning(pid)) {
      console.log("Graceful shutdown failed, forcing kill...");
      process.kill(pid, "SIGKILL");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (!isProcessRunning(pid)) {
      console.log("Server stopped successfully");
      removePidFile();
    } else {
      console.error("Failed to stop server");
      process.exit(1);
    }
  } catch (error) {
    console.error(`Error stopping server: ${error}`);
    // Clean up PID file anyway
    removePidFile();
  }
}

/**
 * Restart the server
 */
async function restartServer(): Promise<void> {
  console.log("Restarting server...");
  await stopServer();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await startServer();
}

/**
 * Get server status
 */
async function getStatus(): Promise<void> {
  const pid = getPid();

  if (!pid) {
    console.log("Status: Stopped (no PID file)");
    return;
  }

  if (isProcessRunning(pid)) {
    console.log(`Status: Running (PID: ${pid})`);
    console.log(`Log file: ${LOG_FILE}`);

    // Try to get additional process info
    try {
      const { stdout } = await execAsync(`ps -p ${pid} -o pid,ppid,etime,cmd`);
      console.log("\nProcess info:");
      console.log(stdout);
    } catch {
      // Process info not available, continue
    }
  } else {
    console.log(`Status: Stopped (stale PID file: ${pid})`);
    removePidFile();
  }
}

/**
 * Cleanup server resources
 */
async function cleanup(): Promise<void> {
  console.log("Cleaning up server resources...");

  // Stop server if running
  await stopServer();

  // Additional cleanup tasks
  console.log("Cleanup completed");
}

/**
 * Tail server logs
 */
async function tailLogs(recent = false): Promise<void> {
  if (!existsSync(LOG_FILE)) {
    console.log("No log file found");
    return;
  }

  if (recent) {
    // Show recent logs and exit
    console.log(`Recent logs from ${LOG_FILE}:`);
    console.log("----------------------------------------");
    const tail = spawn("tail", ["-20", LOG_FILE], {
      stdio: "inherit",
    });

    tail.on("close", (code) => {
      process.exit(code || 0);
    });
  } else {
    // Follow logs continuously
    console.log(`Tailing logs from ${LOG_FILE}...`);
    console.log("Press Ctrl+C to stop");

    const tail = spawn("tail", ["-f", LOG_FILE], {
      stdio: "inherit",
    });

    process.on("SIGINT", () => {
      tail.kill();
      process.exit(0);
    });
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const command = process.argv[2];

  switch (command) {
    case "start":
      await startServer();
      break;
    case "stop":
      await stopServer();
      break;
    case "restart":
      await restartServer();
      break;
    case "status":
      await getStatus();
      break;
    case "cleanup":
      await cleanup();
      break;
    case "logs": {
      const isRecent = process.argv.includes("--recent");
      await tailLogs(isRecent);
      break;
    }
    default:
      console.log("Usage: bun scripts/server-management.ts <command>");
      console.log("");
      console.log("Commands:");
      console.log("  start     - Start the server");
      console.log("  stop      - Stop the server");
      console.log("  restart   - Restart the server");
      console.log("  status    - Show server status");
      console.log("  cleanup   - Clean up server resources");
      console.log("  logs      - Tail server logs (use --recent for last 20 lines)");
      console.log("");
      console.log("Environment variables:");
      console.log("  WEBPILOT_LOG_LEVEL   - Log level (debug, info, warn, error)");
      process.exit(1);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}
