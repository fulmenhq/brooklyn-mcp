/**
 * Brooklyn Process Manager - Detect and manage different types of Brooklyn processes
 */

import { exec } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface BrooklynProcess {
  pid: number;
  type: "mcp-stdio" | "http-server" | "repl-session" | "dev-mode";
  port?: number;
  teamId?: string;
  startTime?: string;
  command: string;
  status: "running" | "stopped" | "unknown";
}

/* biome-ignore lint/complexity/noStaticOnlyClass: keep static class for minimal-change stability */
export class BrooklynProcessManager {
  /**
   * Find all Brooklyn processes running on the system
   */
  static async findAllProcesses(): Promise<BrooklynProcess[]> {
    const processes: BrooklynProcess[] = [];

    try {
      // Find running brooklyn processes via ps
      const { stdout } = await execAsync("ps aux | grep -i brooklyn | grep -v grep");
      const lines = stdout
        .trim()
        .split("\n")
        .filter((line) => line.trim());

      for (const line of lines) {
        const parsed = BrooklynProcessManager.parseProcessLine(line);
        if (parsed) {
          processes.push(parsed);
        }
      }

      // Also check for PID files from background HTTP servers
      const pidFileProcesses = await BrooklynProcessManager.findProcessesFromPidFiles();
      processes.push(...pidFileProcesses);
    } catch {
      // No processes found or error occurred
    }

    return BrooklynProcessManager.deduplicateProcesses(processes);
  }

  /**
   * Find HTTP server processes from PID files
   */
  static async findProcessesFromPidFiles(): Promise<BrooklynProcess[]> {
    const processes: BrooklynProcess[] = [];
    const cwd = process.cwd();

    try {
      const files = readdirSync(cwd);
      const pidFiles = files.filter(
        (file) => file.startsWith(".brooklyn-http-") && file.endsWith(".pid"),
      );

      for (const pidFile of pidFiles) {
        const pidPath = join(cwd, pidFile);
        if (!existsSync(pidPath)) continue;

        try {
          const pidContent = readFileSync(pidPath, "utf8").trim();
          const pidNum = Number.parseInt(pidContent, 10);
          if (Number.isNaN(pidNum)) continue;

          if (await BrooklynProcessManager.isProcessRunning(pidNum)) {
            // Extract port from filename: .brooklyn-http-8080.pid -> 8080
            const portMatch = pidFile.match(/\.brooklyn-http-(\d+)\.pid$/);
            const port = portMatch?.[1] ? Number.parseInt(portMatch[1], 10) : undefined;

            processes.push({
              pid: pidNum,
              type: "http-server",
              port,
              command: `brooklyn mcp dev-http --port ${port ?? "unknown"}`,
              status: "running",
              teamId: "unknown", // Could be enhanced by reading log files
            });
          }
        } catch {
          // Invalid PID file - skip
        }
      }
    } catch {
      // Directory read error
    }

    return processes;
  }

  /**
   * Check if a process with given PID is running
   */
  static async isProcessRunning(pid: number): Promise<boolean> {
    try {
      // Using kill with signal 0 to check if process exists
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse a ps aux line to extract Brooklyn process info
   */
  private static parseProcessLine(line: string): BrooklynProcess | null {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 11) return null;

    const pidStr = parts[1];
    if (!pidStr) return null;
    const pidNum = Number.parseInt(pidStr, 10);
    if (Number.isNaN(pidNum)) return null;

    const command = parts.slice(10).join(" ");

    // Determine process type based on command
    let type: BrooklynProcess["type"] = "mcp-stdio";
    let port: number | undefined;
    // teamId may be absent
    const teamIdMatch = command.match(/--team-id\s+([^\s]+)/);
    const teamId: string | undefined = teamIdMatch?.[1];

    if (command.includes("dev-http")) {
      type = "http-server";
      const portMatch = command.match(/--port\s+(\d+)/);
      port = portMatch?.[1] ? Number.parseInt(portMatch[1], 10) : undefined;
    } else if (command.includes("dev-repl")) {
      type = "repl-session";
    } else if (command.includes("dev-start") || command.includes("dev-mode")) {
      type = "dev-mode";
    }

    // teamId already extracted above

    return {
      pid: pidNum,
      type,
      port,
      teamId,
      command,
      status: "running",
    };
  }

  /**
   * Remove duplicate processes (same PID)
   */
  private static deduplicateProcesses(processes: BrooklynProcess[]): BrooklynProcess[] {
    const seen = new Set<number>();
    return processes.filter((process) => {
      if (seen.has(process.pid)) {
        return false;
      }
      seen.add(process.pid);
      return true;
    });
  }

  /**
   * Stop a Brooklyn process by PID
   */
  static async stopProcess(
    pid: number,
    signal: "SIGTERM" | "SIGKILL" = "SIGTERM",
  ): Promise<boolean> {
    try {
      process.kill(pid, signal);

      // Wait a bit and check if process stopped
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const isStillRunning = await BrooklynProcessManager.isProcessRunning(pid);

      return !isStillRunning;
    } catch {
      return false;
    }
  }

  /**
   * Stop HTTP server by port
   */
  static async stopHttpServerByPort(port: number): Promise<boolean> {
    const processes = await BrooklynProcessManager.findAllProcesses();
    const httpProcess = processes.find((p) => p.type === "http-server" && p.port === port);

    if (httpProcess) {
      return await BrooklynProcessManager.stopProcess(httpProcess.pid);
    }

    return false;
  }

  /**
   * Get summary statistics
   */
  static async getProcessSummary(): Promise<{
    total: number;
    byType: Record<string, number>;
    httpServers: Array<{ port: number; teamId?: string; pid: number }>;
  }> {
    const processes = await BrooklynProcessManager.findAllProcesses();

    const byType: Record<string, number> = {};
    const httpServers: Array<{ port: number; teamId?: string; pid: number }> = [];

    for (const process of processes) {
      byType[process.type] = (byType[process.type] || 0) + 1;

      if (process.type === "http-server" && typeof process.port === "number") {
        httpServers.push({
          port: process.port,
          teamId: process.teamId,
          pid: process.pid,
        });
      }
    }

    return {
      total: processes.length,
      byType,
      httpServers,
    };
  }
}
