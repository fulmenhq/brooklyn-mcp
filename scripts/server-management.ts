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

import { sysprimsTryProcGet, sysprimsTryTerminateTree } from "../src/shared/sysprims.js";

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

type PidFileMeta = {
  pid: number;
  startedAt?: string;
  startTimeUnixMs?: number | null;
  cmdlineContains?: string;
};

async function verifyPidMeta(meta: PidFileMeta): Promise<{ ok: boolean; reason?: string }> {
  const procInfo = await sysprimsTryProcGet(meta.pid);
  if (!procInfo) {
    // If sysprims isn't available, fall back to signal-0 check only.
    return { ok: true };
  }

  if (
    typeof meta.startTimeUnixMs === "number" &&
    typeof procInfo.start_time_unix_ms === "number" &&
    meta.startTimeUnixMs !== procInfo.start_time_unix_ms
  ) {
    return { ok: false, reason: "PID start time mismatch (PID reuse suspected)" };
  }

  if (meta.cmdlineContains) {
    const cmdline = procInfo.cmdline.join(" ");
    if (!cmdline.includes(meta.cmdlineContains)) {
      return { ok: false, reason: `cmdline did not include expected '${meta.cmdlineContains}'` };
    }
  }

  return { ok: true };
}

/**
 * Read PID metadata from PID file.
 * Backwards-compatible with legacy "<pid>" plain-text PID files.
 */
function readPidMeta(): PidFileMeta | null {
  try {
    if (!existsSync(PID_FILE)) return null;
    const raw = readFileSync(PID_FILE, "utf8").trim();
    if (!raw) return null;

    // Preferred: JSON metadata
    if (raw.startsWith("{")) {
      const parsed = JSON.parse(raw) as Partial<PidFileMeta>;
      if (typeof parsed.pid === "number" && Number.isFinite(parsed.pid)) {
        return {
          pid: parsed.pid,
          startedAt: parsed.startedAt,
          startTimeUnixMs: parsed.startTimeUnixMs,
        };
      }
      return null;
    }

    // Legacy: plain PID
    const pid = Number.parseInt(raw, 10);
    if (!Number.isFinite(pid)) return null;
    return { pid };
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
 * Write PID metadata to file.
 */
function writePidMeta(meta: PidFileMeta): void {
  writeFileSync(PID_FILE, JSON.stringify(meta), "utf8");
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
  const existingMeta = readPidMeta();
  const existingPid = existingMeta?.pid ?? null;

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
  const procInfo = await sysprimsTryProcGet(serverProcess.pid);
  writePidMeta({
    pid: serverProcess.pid,
    startedAt: new Date().toISOString(),
    startTimeUnixMs: procInfo?.start_time_unix_ms ?? null,
    cmdlineContains: "dist/index.js",
  });

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
export async function stopServerProcess(): Promise<void> {
  const meta = readPidMeta();
  const pid = meta?.pid ?? null;

  if (!pid) {
    console.log("No server PID file found");
    return;
  }

  if (!isProcessRunning(pid)) {
    console.log("Server is not running");
    removePidFile();
    return;
  }

  if (meta) {
    const verified = await verifyPidMeta(meta);
    if (!verified.ok) {
      console.log(`Refusing to stop PID ${pid}: ${verified.reason}`);
      console.log("Cleaning up stale PID file");
      removePidFile();
      process.exit(1);
    }
  }

  console.log(`Stopping server with PID ${pid}...`);

  try {
    // Prefer sysprims tree termination (TERM -> wait -> KILL)
    const treeResult = await sysprimsTryTerminateTree(pid, {
      grace_timeout_ms: 3000,
      kill_timeout_ms: 2000,
    });

    if (treeResult) {
      if (treeResult.warnings.length > 0) {
        console.log(`sysprims warnings: ${treeResult.warnings.join("; ")}`);
      }
      if (treeResult.tree_kill_reliability === "best_effort") {
        console.log("sysprims tree-kill reliability: best_effort");
      }
    } else {
      // Fallback: Send SIGTERM for graceful shutdown
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
  await stopServerProcess();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await startServer();
}

/**
 * Get server status
 */
export async function getServerStatus(): Promise<void> {
  const meta = readPidMeta();
  const pid = meta?.pid ?? null;

  if (!pid) {
    console.log("Status: Stopped (no PID file)");
    process.exit(0);
    return;
  }

  if (isProcessRunning(pid)) {
    if (meta) {
      const verified = await verifyPidMeta(meta);
      if (!verified.ok) {
        console.log(`Status: Stopped (stale PID file: ${pid})`);
        console.log(`Reason: ${verified.reason}`);
        removePidFile();
        process.exit(0);
        return;
      }
    }
    console.log(`Status: Running (PID: ${pid})`);
    console.log(`Log file: ${LOG_FILE}`);

    // Prefer sysprims for structured process info
    const procInfo = await sysprimsTryProcGet(pid);
    if (procInfo) {
      const cmdline = procInfo.cmdline.join(" ");
      console.log("\nProcess info:");
      console.log(
        JSON.stringify(
          {
            pid: procInfo.pid,
            ppid: procInfo.ppid,
            name: procInfo.name,
            state: procInfo.state,
            cpu_percent: procInfo.cpu_percent,
            memory_kb: procInfo.memory_kb,
            elapsed_seconds: procInfo.elapsed_seconds,
            start_time_unix_ms: procInfo.start_time_unix_ms ?? null,
            exe_path: procInfo.exe_path ?? null,
            cmdline,
          },
          null,
          2,
        ),
      );
    } else {
      // Fallback to ps, best-effort
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Timeout")), 2000); // 2 second timeout
        });

        const psPromise = execAsync(`ps -p ${pid} -o pid,ppid,etime,cmd`);

        const { stdout } = await Promise.race([psPromise, timeoutPromise]);
        console.log("\nProcess info:");
        console.log(stdout);
      } catch {
        // Process info not available or timed out, continue silently
      }
    }
    process.exit(0);
  } else {
    console.log(`Status: Stopped (stale PID file: ${pid})`);
    removePidFile();
    process.exit(0);
  }
}

/**
 * Cleanup server resources
 */
async function cleanup(): Promise<void> {
  console.log("Cleaning up server resources...");

  // Stop server if running
  await stopServerProcess();

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
      await stopServerProcess();
      break;
    case "restart":
      await restartServer();
      break;
    case "status":
      await getServerStatus();
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
