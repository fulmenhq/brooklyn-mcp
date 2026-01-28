/**
 * Brooklyn Process Manager - Detect and manage different types of Brooklyn processes
 */

import { exec } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import type { ProcessInfo } from "@3leaps/sysprims";
import {
  sysprimsTryListeningPids,
  sysprimsTryProcessList,
  sysprimsTryProcGet,
  sysprimsTryTerminateTree,
} from "./sysprims.js";

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
   * Find HTTP dev servers using targeted search (PID files + narrow process search)
   */
  static async findHttpDevServers(): Promise<BrooklynProcess[]> {
    const processes: BrooklynProcess[] = [];

    try {
      // Primary: Check PID files first (most reliable)
      const pidFileProcesses = await BrooklynProcessManager.findProcessesFromPidFiles();
      processes.push(...pidFileProcesses);

      // Secondary: Targeted process search for any missed servers
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("PS command timeout")), 3000);
      });

      // Use narrower search pattern to avoid false positives
      // Specifically look for dev-http-daemon or dev-http server processes, not stop/list commands
      const psPromise = execAsync(
        "ps aux | grep 'brooklyn.*dev-http' | grep -v grep | grep -v 'dev-http-stop' | grep -v 'dev-http-list' | grep -v 'dev-http-status'",
      );

      try {
        const { stdout } = await Promise.race([psPromise, timeoutPromise]);
        const lines = stdout
          .trim()
          .split("\n")
          .filter((line) => line.trim());

        for (const line of lines) {
          const parsed = BrooklynProcessManager.parseProcessLine(line);
          if (parsed && parsed.type === "http-server") {
            processes.push(parsed);
          }
        }
      } catch {
        // PS search failed - rely on PID files only
      }
    } catch {
      // Error in PID file reading - continue with empty array
    }

    return BrooklynProcessManager.deduplicateProcesses(processes);
  }

  /**
   * Find all Brooklyn processes running on the system
   */
  static async findAllProcesses(): Promise<BrooklynProcess[]> {
    const processes: BrooklynProcess[] = [];

    // Prefer sysprims for discovery (structured, cross-platform)
    try {
      const snapshot = await sysprimsTryProcessList();
      if (snapshot) {
        for (const info of snapshot.processes) {
          const parsed = BrooklynProcessManager.parseProcessInfo(info);
          if (parsed) processes.push(parsed);
        }

        // Also check for PID files from background HTTP servers
        const pidFileProcesses = await BrooklynProcessManager.findProcessesFromPidFiles();
        processes.push(...pidFileProcesses);

        return BrooklynProcessManager.deduplicateProcesses(processes);
      }
    } catch {
      // sysprims path failed; fall back to ps below
    }

    try {
      // Find running brooklyn processes via ps with timeout protection
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("PS command timeout")), 3000); // 3 second timeout
      });

      const psPromise = execAsync("ps aux | grep -i brooklyn | grep -v grep");

      const { stdout } = await Promise.race([psPromise, timeoutPromise]);
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
      // No processes found, error occurred, or timed out - continue silently
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
        (file) =>
          (file.startsWith(".brooklyn-http-") || file.startsWith(".brooklyn-web-")) &&
          file.endsWith(".pid"),
      );

      for (const pidFile of pidFiles) {
        const process = await BrooklynProcessManager.processPidFile(pidFile, cwd);
        if (process) {
          processes.push(process);
        }
      }
    } catch {
      // Directory read error
    }

    return processes;
  }

  /**
   * Process a single PID file and return Brooklyn process info if valid
   */
  private static async processPidFile(
    pidFile: string,
    cwd: string,
  ): Promise<BrooklynProcess | null> {
    const pidPath = join(cwd, pidFile);
    if (!existsSync(pidPath)) return null;

    try {
      const pidContent = readFileSync(pidPath, "utf8").trim();
      const pidNum = Number.parseInt(pidContent, 10);
      if (Number.isNaN(pidNum)) return null;

      // Verify the PID is actually a Brooklyn dev-http process
      if (await BrooklynProcessManager.isProcessRunning(pidNum)) {
        return await BrooklynProcessManager.verifyDevHttpProcess(pidNum, pidFile, pidPath);
      }
      // Process not running - clean up stale PID file
      await BrooklynProcessManager.cleanupPidFile(pidPath);
      return null;
    } catch {
      // Invalid PID file - skip
      return null;
    }
  }

  /**
   * Verify process is a dev-http server and return process info
   */
  private static async verifyDevHttpProcess(
    pidNum: number,
    pidFile: string,
    pidPath: string,
  ): Promise<BrooklynProcess | null> {
    const processInfo = await BrooklynProcessManager.getProcessCommand(pidNum);
    if (processInfo?.includes("dev-http")) {
      // Extract port from filename: .brooklyn-http-8080.pid or .brooklyn-web-8080.pid -> 8080
      const portMatch = pidFile.match(/\.(?:brooklyn-http|brooklyn-web)-(\d+)\.pid$/);
      const port = portMatch?.[1] ? Number.parseInt(portMatch[1], 10) : undefined;

      return {
        pid: pidNum,
        type: "http-server",
        port,
        command: processInfo,
        status: "running",
        teamId: "unknown", // Could be enhanced by reading log files
      };
    }
    // PID file exists but process is not a dev-http server - clean up stale PID file
    await BrooklynProcessManager.cleanupPidFile(pidPath);
    return null;
  }

  /**
   * Clean up a stale PID file
   */
  private static async cleanupPidFile(pidPath: string): Promise<void> {
    try {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(pidPath);
    } catch {
      // Ignore cleanup errors
    }
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
   * Get command line for a specific PID
   */
  static async getProcessCommand(pid: number): Promise<string | null> {
    const info = await sysprimsTryProcGet(pid);
    if (info) {
      return info.cmdline.join(" ").trim();
    }

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("PS command timeout")), 2000);
      });

      const psPromise = execAsync(`ps -p ${pid} -o command=`);
      const { stdout } = await Promise.race([psPromise, timeoutPromise]);
      return stdout.trim();
    } catch {
      return null;
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

    // Explicitly exclude known false positives:
    //  - biome servers / lsp proxies
    //  - our own status invocations
    const lower = command.toLowerCase();
    if (
      lower.includes("biome") ||
      lower.includes("lsp-proxy") ||
      // exclude self "brooklyn status" or similar
      (lower.includes("brooklyn") && lower.includes("status"))
    ) {
      return null;
    }

    // Determine process type based on precise brooklyn command patterns
    // Only classify mcp-stdio if it's an actual brooklyn stdio start
    let type: BrooklynProcess["type"] | null = null;
    let port: number | undefined;

    // teamId may be absent
    const teamIdMatch = command.match(/--team-id\s+([^\s]+)/);
    const teamId: string | undefined = teamIdMatch?.[1];

    // HTTP server detection - both dev-http and web modes
    if (
      command.includes("mcp dev-http") ||
      command.includes("dev-http-daemon") ||
      command.includes("brooklyn web start") ||
      (command.includes("/brooklyn") && command.includes("web start")) ||
      command.includes("web start")
    ) {
      type = "http-server";
      const portMatch = command.match(/--port\s+(\d+)/);
      port = portMatch?.[1] ? Number.parseInt(portMatch[1], 10) : undefined;
    } else if (command.includes("dev-repl")) {
      type = "repl-session";
    } else if (command.includes("dev-start") || command.includes("dev-mode")) {
      type = "dev-mode";
    } else {
      // Strict stdio detection: match only known brooklyn stdio start invocations
      const isBrooklynStdio =
        // direct ts entry via bun
        /bun\s+[^\n]*src\/cli\/brooklyn\.ts\s+mcp\s+start(\s|$)/.test(command) ||
        // compiled dist binary usage
        /dist\/brooklyn(\.exe)?\s+mcp\s+start(\s|$)/.test(command) ||
        // env marker often present in our processes (not always visible via ps)
        /BROOKLYN_MCP_STDIO=1/.test(command);

      if (isBrooklynStdio) {
        type = "mcp-stdio";
      }
    }

    if (!type) {
      // Not a recognized Brooklyn-managed process
      return null;
    }

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
   * Parse sysprims ProcessInfo into BrooklynProcess.
   */
  private static parseProcessInfo(info: ProcessInfo): BrooklynProcess | null {
    const pidNum = info.pid;
    if (!Number.isFinite(pidNum)) return null;

    const command = info.cmdline.join(" ");

    // Mirror the same false-positive exclusions as the ps parser.
    const lower = command.toLowerCase();
    if (
      lower.includes("biome") ||
      lower.includes("lsp-proxy") ||
      (lower.includes("brooklyn") && lower.includes("status"))
    ) {
      return null;
    }

    let type: BrooklynProcess["type"] | null = null;
    let port: number | undefined;

    const teamIdMatch = command.match(/--team-id\s+([^\s]+)/);
    const teamId: string | undefined = teamIdMatch?.[1];

    if (
      command.includes("mcp dev-http") ||
      command.includes("dev-http-daemon") ||
      command.includes("brooklyn web start") ||
      (command.includes("/brooklyn") && command.includes("web start")) ||
      command.includes("web start")
    ) {
      type = "http-server";
      const portMatch = command.match(/--port\s+(\d+)/);
      port = portMatch?.[1] ? Number.parseInt(portMatch[1], 10) : undefined;
    } else if (command.includes("dev-repl")) {
      type = "repl-session";
    } else if (command.includes("dev-start") || command.includes("dev-mode")) {
      type = "dev-mode";
    } else {
      const isBrooklynStdio =
        /bun\s+[^\n]*src\/cli\/brooklyn\.ts\s+mcp\s+start(\s|$)/.test(command) ||
        /dist\/brooklyn(\.exe)?\s+mcp\s+start(\s|$)/.test(command) ||
        /BROOKLYN_MCP_STDIO=1/.test(command);

      if (isBrooklynStdio) {
        type = "mcp-stdio";
      }
    }

    if (!type) return null;

    return {
      pid: pidNum,
      type,
      port,
      teamId,
      startTime: info.start_time_unix_ms
        ? new Date(info.start_time_unix_ms).toISOString()
        : undefined,
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
    // Prefer sysprims tree termination (reliable for daemons/process groups)
    const treeResult = await sysprimsTryTerminateTree(pid, {
      grace_timeout_ms: signal === "SIGKILL" ? 0 : 5000,
      kill_timeout_ms: 2000,
      signal: signal === "SIGKILL" ? 9 : 15,
      kill_signal: 9,
    });

    if (treeResult) {
      return treeResult.exited || !(await BrooklynProcessManager.isProcessRunning(pid));
    }

    try {
      process.kill(pid, signal);

      // Wait longer for graceful shutdown, with timeout protection
      const waitTime = signal === "SIGKILL" ? 2000 : 5000; // SIGKILL needs less time
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // Check if process stopped with timeout protection
      try {
        const timeoutPromise = new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(false), 3000); // Assume failed after timeout
        });

        const checkPromise = BrooklynProcessManager.isProcessRunning(pid).then(
          (running) => !running,
        );

        const result = await Promise.race([checkPromise, timeoutPromise]);
        return result;
      } catch {
        // If check fails, assume process is stopped
        return true;
      }
    } catch (error) {
      // Process might already be dead (ESRCH error) - that's success
      if (error instanceof Error && error.message.includes("ESRCH")) {
        return true;
      }
      return false;
    }
  }

  /**
   * Stop HTTP server by port
   */
  static async stopHttpServerByPort(port: number): Promise<boolean> {
    const listening = await sysprimsTryListeningPids(port);
    if (listening && listening.pids.length > 0) {
      // Prefer terminating the first pid we can see.
      // Note: sysprims port attribution can be best-effort on some platforms.
      const pid = listening.pids[0];
      if (typeof pid === "number") {
        return await BrooklynProcessManager.stopProcess(pid);
      }
    }

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
