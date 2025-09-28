/**
 * Instance Manager for Brooklyn MCP Server
 * Prevents multiple instances and manages process lifecycle
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getLogger } from "../shared/pino-logger.js";

const PID_FILE = join(homedir(), ".brooklyn", "brooklyn.pid");
const _LOCK_FILE = join(homedir(), ".brooklyn", "brooklyn.lock");

export class InstanceManager {
  private logger = getLogger("instance-manager");

  /**
   * Check if another Brooklyn instance is running
   */
  async checkExistingInstance(): Promise<{ running: boolean; pid?: number }> {
    try {
      if (!existsSync(PID_FILE)) {
        return { running: false };
      }

      const pidStr = readFileSync(PID_FILE, "utf-8").trim();
      const pid = Number.parseInt(pidStr, 10);

      if (Number.isNaN(pid)) {
        // Invalid PID file, clean it up
        unlinkSync(PID_FILE);
        return { running: false };
      }

      // Check if process is actually running
      try {
        process.kill(pid, 0); // Signal 0 just checks if process exists
        return { running: true, pid };
      } catch {
        // Process not running, clean up stale PID file
        unlinkSync(PID_FILE);
        return { running: false };
      }
    } catch (error) {
      try {
        this.logger.error("Error checking existing instance", { error });
      } catch {}
      return { running: false };
    }
  }

  /**
   * Register current instance
   */
  async registerInstance(): Promise<void> {
    try {
      const dir = join(homedir(), ".brooklyn");
      if (!existsSync(dir)) {
        const { mkdir } = await import("node:fs/promises");
        await mkdir(dir, { recursive: true, mode: 0o700 });
      }

      writeFileSync(PID_FILE, process.pid.toString(), { mode: 0o600 });

      // Clean up on exit
      const cleanup = () => {
        try {
          if (existsSync(PID_FILE)) {
            const pidStr = readFileSync(PID_FILE, "utf-8").trim();
            if (pidStr === process.pid.toString()) {
              unlinkSync(PID_FILE);
            }
          }
        } catch {
          // Ignore cleanup errors
        }
      };

      process.on("exit", cleanup);
      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);
    } catch (error) {
      try {
        this.logger.error("Error registering instance", { error });
      } catch {}
      throw error;
    }
  }

  /**
   * Force stop existing instance
   */
  async forceStopExisting(): Promise<boolean> {
    const { running, pid } = await this.checkExistingInstance();

    if (!(running && pid)) {
      return false;
    }

    try {
      process.kill(pid, "SIGTERM");

      // Wait up to 5 seconds for graceful shutdown
      for (let i = 0; i < 50; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));

        try {
          process.kill(pid, 0);
        } catch {
          // Process stopped
          return true;
        }
      }

      // Force kill if still running
      process.kill(pid, "SIGKILL");
      return true;
    } catch (error) {
      try {
        this.logger.error("Error stopping existing instance", { error, pid });
      } catch {}
      return false;
    }
  }

  /**
   * Get patterns used to detect Brooklyn processes
   */
  static getBrooklynProcessPatterns(): string[] {
    const isWindows = process.platform === "win32";
    const binaryName = isWindows ? "brooklyn\\.exe" : "brooklyn";

    return [
      "brooklyn (mcp|web)",
      "brooklyn\\.ts mcp",
      `dist/${binaryName} mcp`,
      "brooklyn\\.js mcp",
      "/brooklyn mcp",
    ];
  }

  /**
   * Find all Brooklyn processes
   */
  static async findBrooklynProcesses(): Promise<string[]> {
    const { execSync } = await import("node:child_process");
    const patterns = InstanceManager.getBrooklynProcessPatterns();
    const grepPattern = patterns.join("|");

    const result = execSync(`ps aux | grep -E '${grepPattern}' | grep -v grep || true`, {
      encoding: "utf-8",
    });

    return result.trim().split("\n").filter(Boolean);
  }

  /**
   * Clean up all Brooklyn processes (emergency cleanup)
   */
  async cleanupAllProcesses(): Promise<number> {
    try {
      const lines = await InstanceManager.findBrooklynProcesses();
      let cleaned = 0;

      for (const line of lines) {
        const parts = line.split(/\s+/);
        const pidStr = parts[1];
        if (!pidStr) continue;
        const pid = Number.parseInt(pidStr, 10);

        if (!Number.isNaN(pid) && pid !== process.pid) {
          try {
            process.kill(pid, "SIGTERM");
            cleaned++;
          } catch {
            // Process might have already exited
          }
        }
      }

      return cleaned;
    } catch (error) {
      try {
        this.logger.error("Error cleaning up processes", { error });
      } catch {}
      return 0;
    }
  }
}
