/**
 * Brooklyn MCP Development Mode Manager
 *
 * Provides named pipe communication for MCP development without Claude Code dependencies.
 * Architecture Committee approved for internal Brooklyn team use only.
 */

import { type ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

interface DevProcessInfo {
  processId: number;
  startTime: string;
  inputPipe: string;
  outputPipe: string;
  pipesPrefix: string;
  logFile: string;
}

// Type for the logger to satisfy TypeScript
interface Logger {
  info: (message: string, context?: unknown) => void;
  warn: (message: string, context?: unknown) => void;
  error: (message: string, context?: unknown) => void;
  debug: (message: string, context?: unknown) => void;
}

export class MCPDevManager {
  private devDir: string;
  private pipesFile: string;
  private logDir: string;
  private logger: Logger | null = null;

  private getLogger(): Logger {
    // Lazy initialization to avoid calling before CLI initializes logging
    if (!this.logger) {
      try {
        // Dynamic import to avoid module-level execution
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const loggerModule = require("../shared/structured-logger.js") as {
          getLogger: (name: string) => Logger;
        };
        this.logger = loggerModule.getLogger("brooklyn-mcp-dev");
      } catch (_error) {
        // Fallback to console if logger not available
        this.logger = {
          info: (message: string, context?: unknown) =>
            console.error(`[INFO] ${message}`, context ? JSON.stringify(context) : ""),
          warn: (message: string, context?: unknown) =>
            console.error(`[WARN] ${message}`, context ? JSON.stringify(context) : ""),
          error: (message: string, context?: unknown) =>
            console.error(`[ERROR] ${message}`, context ? JSON.stringify(context) : ""),
          debug: (message: string, context?: unknown) =>
            console.error(`[DEBUG] ${message}`, context ? JSON.stringify(context) : ""),
        };
      }
    }
    return this.logger;
  }

  constructor() {
    // Don't initialize logger here - wait for lazy initialization
    // Use configurable pipe directory (Architecture Committee recommendation)
    const baseDir = process.env["BROOKLYN_DEV_PIPE_DIR"] || os.homedir();
    this.devDir = path.join(baseDir, ".brooklyn", "dev");
    this.pipesFile = path.join(this.devDir, "pipes.json");
    this.logDir = path.join(this.devDir, "logs");

    // Ensure directories exist
    fs.mkdirSync(this.devDir, { recursive: true });
    fs.mkdirSync(this.logDir, { recursive: true });
  }

  /**
   * Start development MCP server (Architecture Committee approved)
   */
  async start(): Promise<void> {
    // Use structured logging - it handles stderr output automatically in MCP mode
    this.getLogger()?.info("🚀 Starting Brooklyn MCP development mode");

    // Check if already running
    if (this.isRunning()) {
      const info = this.loadProcessInfo();
      this.getLogger()?.warn(`❌ Development mode already running (PID: ${info?.processId})`, {
        processId: info?.processId,
      });
      this.getLogger()?.info("   Use 'brooklyn mcp dev-stop' first, then try again.");
      return;
    }

    const timestamp = Date.now();
    const instanceUuid = Math.random().toString(36).substring(2, 8); // Short UUID
    const pipesPrefix = process.env["BROOKLYN_DEV_PIPE_DIR"] || "/tmp";
    const inputPipe = path.join(pipesPrefix, `brooklyn-mcp-dev-${instanceUuid}-${timestamp}-in`);
    const outputPipe = path.join(pipesPrefix, `brooklyn-mcp-dev-${instanceUuid}-${timestamp}-out`);
    const logFile = path.join(this.logDir, `brooklyn-mcp-dev-${timestamp}.log`);

    try {
      // Create named pipes with secure permissions (Architecture Committee requirement)
      this.getLogger()?.info("📦 Creating named pipes", { inputPipe, outputPipe });
      await this.createNamedPipe(inputPipe);
      await this.createNamedPipe(outputPipe);

      // Set secure permissions (0600)
      fs.chmodSync(inputPipe, 0o600);
      fs.chmodSync(outputPipe, 0o600);

      this.getLogger()?.info(`   Input:  ${inputPipe}`);
      this.getLogger()?.info(`   Output: ${outputPipe}`);

      // Start Brooklyn in development mode
      this.getLogger()?.info("🔧 Starting Brooklyn MCP process...");

      // Open log file for output redirection
      const logStream = fs.openSync(logFile, "a");

      const brooklynProcess = spawn(
        "bun", // Use Bun to run TypeScript directly
        [
          "run",
          path.resolve(process.cwd(), "src/cli/brooklyn.ts"),
          "mcp",
          "start",
          "--dev-mode",
          "--pipes-prefix",
          path.dirname(inputPipe),
          "--log-level",
          "debug",
        ],
        {
          detached: true,
          stdio: ["ignore", logStream, logStream], // Redirect both stdout and stderr to log file
          cwd: this.getProjectRoot(),
          env: {
            ...process.env,
            BROOKLYN_DEV_INPUT_PIPE: inputPipe,
            BROOKLYN_DEV_OUTPUT_PIPE: outputPipe,
          },
        },
      );

      // Close our file descriptor - the child process has its own reference
      fs.closeSync(logStream);

      // Save process info
      const processInfo: DevProcessInfo = {
        processId: brooklynProcess.pid ?? 0,
        startTime: new Date().toISOString(),
        inputPipe,
        outputPipe,
        pipesPrefix: path.dirname(inputPipe),
        logFile,
      };

      this.saveProcessInfo(processInfo);

      // Since we're running detached, we don't want to keep any references
      // to the child process that would prevent the parent from exiting.
      // The child will redirect its own output to the log file.

      // Unref the child process so it doesn't keep the parent alive
      brooklynProcess.unref();

      // Wait a moment to ensure process started
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (brooklynProcess.killed || brooklynProcess.exitCode !== null) {
        this.getLogger()?.error("❌ Failed to start Brooklyn MCP development process");
        return;
      }

      this.getLogger()?.info("✅ Brooklyn MCP development mode started successfully!");
      this.getLogger()?.info(`   PID: ${brooklynProcess.pid}`);
      this.getLogger()?.info(`   Log: ${logFile}`);
      this.getLogger()?.info("");
      this.getLogger()?.info("📋 Next steps:");
      this.getLogger()?.info("   • Test connection: brooklyn mcp dev-status");
      this.getLogger()?.info(`   • View logs: tail -f ${logFile}`);
      this.getLogger()?.info("   • Stop server: brooklyn mcp dev-stop");

      // Explicitly exit to ensure control returns
      process.exit(0);
    } catch (error) {
      this.getLogger()?.error("Failed to start MCP development mode", { error });
      await this.cleanup();
      process.exit(1);
    }
  }

  /**
   * Stop development MCP server
   */
  async stop(): Promise<void> {
    this.getLogger()?.info("🛑 Stopping Brooklyn MCP development mode...");

    const info = this.loadProcessInfo();
    if (!info) {
      this.getLogger()?.warn("❌ No development mode process found");
      return;
    }

    try {
      // Kill the process with enhanced signal handling
      this.getLogger()?.info(`   Stopping process PID: ${info.processId}`);
      process.kill(info.processId, "SIGTERM");

      // Wait for graceful shutdown
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Force kill if still running
      try {
        process.kill(info.processId, 0); // Check if still running
        this.getLogger()?.info("   Force killing process...");
        process.kill(info.processId, "SIGKILL");
      } catch {
        // Process already dead, that's good
      }

      this.getLogger()?.info("✅ Development mode stopped");
    } catch (error) {
      this.getLogger()?.warn("⚠️  Process may have already stopped", { error });
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Restart development MCP server
   */
  async restart(): Promise<void> {
    this.getLogger()?.info("🔄 Restarting Brooklyn MCP development mode...");
    await this.stop();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await this.start();
  }

  /**
   * Show development mode status
   */
  async status(): Promise<void> {
    // Use logger to maintain stderr output (stdio purity)
    const logger = this.getLogger();
    logger.info("📊 Brooklyn MCP Development Mode Status");
    logger.info("=".repeat(45));

    const info = this.loadProcessInfo();
    if (!info) {
      logger.warn("❌ Development mode not running");
      logger.info("");
      logger.info("💡 Start with: brooklyn mcp dev-start");
    } else {
      const isRunning = this.isProcessRunning(info.processId);
      const inputExists = fs.existsSync(info.inputPipe);
      const outputExists = fs.existsSync(info.outputPipe);

      logger.info(`Process: ${isRunning ? "🟢 Running" : "🔴 Stopped"}`);
      logger.info(`PID: ${info.processId}`);
      logger.info(`Started: ${info.startTime}`);
      logger.info(`Input Pipe: ${inputExists ? "✅" : "❌"} ${info.inputPipe}`);
      logger.info(`Output Pipe: ${outputExists ? "✅" : "❌"} ${info.outputPipe}`);
      logger.info(`Log File: ${info.logFile}`);

      if (fs.existsSync(info.logFile)) {
        const stats = fs.statSync(info.logFile);
        logger.info(`Log Size: ${(stats.size / 1024).toFixed(1)} KB`);
      }

      if (isRunning && inputExists && outputExists) {
        logger.info("");
        logger.info("🚀 Ready for development! Available in chat via:");
        logger.info("   const browser = await dev_launch_browser({ browserType: 'chromium' });");
      }
    }

    // Check for orphaned processes
    logger.info("");
    logger.info("🔍 Scanning for orphaned Brooklyn processes...");

    try {
      const orphaned = await this.findOrphanedProcesses();
      if (orphaned.length === 0) {
        logger.info("✅ No orphaned processes found");
      } else {
        logger.warn(`⚠️  Found ${orphaned.length} orphaned processes:`);
        for (const proc of orphaned) {
          logger.info(`   PID: ${proc.pid} Command: ${proc.command}`);
        }
        logger.info("💡 Run 'brooklyn mcp dev-cleanup' to terminate them");
      }
    } catch (error) {
      logger.error("Error scanning for orphaned processes", { error });
    }
  }

  /**
   * Clean up development mode resources (Architecture Committee requirement)
   */
  async cleanup(): Promise<void> {
    const info = this.loadProcessInfo();

    this.getLogger()?.info("Cleaning up MCP development mode", { processId: info?.processId });

    // First, terminate any running processes
    if (info && this.isProcessRunning(info.processId)) {
      try {
        this.getLogger()?.info("Terminating development process", { processId: info.processId });
        process.kill(info.processId, "SIGTERM");

        // Wait for graceful shutdown
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Force kill if still running
        if (this.isProcessRunning(info.processId)) {
          this.getLogger()?.warn("Force killing process", { processId: info.processId });
          process.kill(info.processId, "SIGKILL");
        }
      } catch (error) {
        this.getLogger()?.warn("Error terminating process", { error, processId: info.processId });
      }
    }

    // Find and kill any orphaned Brooklyn dev processes
    try {
      const { exec } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execAsync = promisify(exec);

      const { stdout } = await execAsync(
        "ps -ef | grep '[b]rooklyn.*mcp start --dev-mode' | grep -v grep || true",
      );

      const orphanedPids = stdout
        .trim()
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          const parts = line.trim().split(/\s+/);
          return parts[1]; // PID is the second field
        })
        .filter((pid) => pid && pid !== String(info?.processId));

      if (orphanedPids.length > 0) {
        this.getLogger()?.info("Found orphaned processes to clean up", {
          count: orphanedPids.length,
        });
        for (const pid of orphanedPids) {
          try {
            process.kill(Number(pid), "SIGTERM");
            this.getLogger()?.debug("Terminated orphaned process", { pid });
          } catch (error) {
            this.getLogger()?.error("Failed to kill orphaned process", { pid, error });
          }
        }
      }
    } catch (error) {
      this.getLogger()?.error("Error finding orphaned processes", { error });
    }

    // Remove named pipes with error handling
    if (info) {
      try {
        if (fs.existsSync(info.inputPipe)) {
          fs.unlinkSync(info.inputPipe);
          this.getLogger()?.debug("Removed input pipe", { pipe: info.inputPipe });
        }
        if (fs.existsSync(info.outputPipe)) {
          fs.unlinkSync(info.outputPipe);
          this.getLogger()?.debug("Removed output pipe", { pipe: info.outputPipe });
        }
      } catch (error) {
        this.getLogger()?.warn("Error removing pipes", { error });
      }
    }

    // Remove process info file
    try {
      if (fs.existsSync(this.pipesFile)) {
        fs.unlinkSync(this.pipesFile);
        this.getLogger()?.debug("Removed pipe info file", { file: this.pipesFile });
      }
    } catch (error) {
      this.getLogger()?.warn("Error removing pipe info file", { error });
    }

    this.getLogger()?.info("MCP development mode cleanup complete");
  }

  // Private helper methods

  private loadProcessInfo(): DevProcessInfo | null {
    try {
      if (fs.existsSync(this.pipesFile)) {
        const data = fs.readFileSync(this.pipesFile, "utf-8");
        return JSON.parse(data);
      }
    } catch (error) {
      this.getLogger()?.warn("Error loading process info", { error });
    }
    return null;
  }

  private saveProcessInfo(info: DevProcessInfo): void {
    try {
      fs.writeFileSync(this.pipesFile, JSON.stringify(info, null, 2));
    } catch (error) {
      this.getLogger()?.error("Failed to save process info", { error });
    }
  }

  private isRunning(): boolean {
    const info = this.loadProcessInfo();
    return info ? this.isProcessRunning(info.processId) : false;
  }

  private isProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private async createNamedPipe(pipePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Remove existing pipe if it exists
      try {
        if (fs.existsSync(pipePath)) {
          fs.unlinkSync(pipePath);
        }
      } catch {
        // Ignore cleanup errors
      }

      // Create named pipe
      const mkfifo = spawn("mkfifo", [pipePath]);

      mkfifo.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to create named pipe: ${pipePath} (exit code: ${code})`));
        }
      });

      mkfifo.on("error", (error) => {
        reject(new Error(`Failed to create named pipe: ${pipePath} (${error.message})`));
      });
    });
  }

  private getProjectRoot(): string {
    // Find project root by looking for package.json
    let currentDir = process.cwd();
    while (currentDir !== path.dirname(currentDir)) {
      if (fs.existsSync(path.join(currentDir, "package.json"))) {
        return currentDir;
      }
      currentDir = path.dirname(currentDir);
    }
    throw new Error("Could not find project root (package.json not found)");
  }

  private async findOrphanedProcesses(): Promise<{ pid: string; command: string }[]> {
    try {
      const { exec } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execAsync = promisify(exec);

      const { stdout } = await execAsync(
        "ps -ef | grep '[b]rooklyn.*mcp start --dev-mode' | grep -v grep || true",
      );

      const info = this.loadProcessInfo();
      return stdout
        .trim()
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => {
          const parts = line.trim().split(/\s+/);
          const pid = parts[1];
          if (!pid) return null;
          return {
            pid,
            command: parts.slice(7).join(" "),
          };
        })
        .filter((p): p is { pid: string; command: string } => {
          // Filter out null values and the current managed process
          return p !== null && p.pid !== String(info?.processId);
        });
    } catch {
      return [];
    }
  }
}
