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
import { promisify } from "node:util";
import { getLogger } from "../shared/structured-logger.js";

const _execAsync = promisify(require("node:child_process").exec);

interface DevProcessInfo {
  processId: number;
  startTime: string;
  inputPipe: string;
  outputPipe: string;
  pipesPrefix: string;
  logFile: string;
}

export class MCPDevManager {
  private devDir: string;
  private pipesFile: string;
  private logDir: string;
  private logger = getLogger("brooklyn-mcp-dev");

  constructor() {
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
    this.logger.info("🚀 Starting Brooklyn MCP development mode");

    // Check if already running
    if (this.isRunning()) {
      const info = this.loadProcessInfo();
      this.logger.warn(`❌ Development mode already running (PID: ${info?.processId})`, {
        processId: info?.processId,
      });
      this.logger.info("   Use 'brooklyn mcp dev-stop' first, then try again.");
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
      this.logger.info("📦 Creating named pipes", { inputPipe, outputPipe });
      await this.createNamedPipe(inputPipe);
      await this.createNamedPipe(outputPipe);

      // Set secure permissions (0600)
      fs.chmodSync(inputPipe, 0o600);
      fs.chmodSync(outputPipe, 0o600);

      this.logger.info(`   Input:  ${inputPipe}`);
      this.logger.info(`   Output: ${outputPipe}`);

      // Start Brooklyn in development mode
      this.logger.info("🔧 Starting Brooklyn MCP process...");
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
          stdio: ["ignore", "pipe", "pipe"],
          cwd: this.getProjectRoot(),
          env: {
            ...process.env,
            BROOKLYN_DEV_INPUT_PIPE: inputPipe,
            BROOKLYN_DEV_OUTPUT_PIPE: outputPipe,
          },
        },
      );

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

      // Setup log streaming
      this.setupLogStreaming(brooklynProcess, logFile);

      // Handle process exit with cleanup (Architecture Committee requirement)
      brooklynProcess.on("exit", (code) => {
        this.logger.info("Brooklyn MCP dev process exited", {
          code,
          processId: processInfo.processId,
        });
        this.cleanup();
      });

      // Enhanced signal handling (Architecture Committee recommendation)
      const cleanup = () => {
        this.logger.info("Received shutdown signal, cleaning up MCP dev mode");
        this.cleanup();
      };

      process.on("SIGTERM", cleanup);
      process.on("SIGINT", cleanup);
      process.on("uncaughtException", (error) => {
        this.logger.error("Uncaught exception in MCP dev mode", { error });
        cleanup();
      });

      // Wait a moment to ensure process started
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (brooklynProcess.killed || brooklynProcess.exitCode !== null) {
        this.logger.error("❌ Failed to start Brooklyn MCP development process");
        return;
      }

      this.logger.info("✅ Brooklyn MCP development mode started successfully!");
      this.logger.info(`   PID: ${brooklynProcess.pid}`);
      this.logger.info(`   Log: ${logFile}`);
      this.logger.info("");
      this.logger.info("📋 Next steps:");
      this.logger.info("   • Test connection: brooklyn mcp dev-status");
      this.logger.info(`   • View logs: tail -f ${logFile}`);
      this.logger.info("   • Stop server: brooklyn mcp dev-stop");
    } catch (error) {
      this.logger.error("Failed to start MCP development mode", { error });
      await this.cleanup();
      process.exit(1);
    }
  }

  /**
   * Stop development MCP server
   */
  async stop(): Promise<void> {
    this.logger.info("🛑 Stopping Brooklyn MCP development mode...");

    const info = this.loadProcessInfo();
    if (!info) {
      this.logger.warn("❌ No development mode process found");
      return;
    }

    try {
      // Kill the process with enhanced signal handling
      this.logger.info(`   Stopping process PID: ${info.processId}`);
      process.kill(info.processId, "SIGTERM");

      // Wait for graceful shutdown
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Force kill if still running
      try {
        process.kill(info.processId, 0); // Check if still running
        this.logger.info("   Force killing process...");
        process.kill(info.processId, "SIGKILL");
      } catch {
        // Process already dead, that's good
      }

      this.logger.info("✅ Development mode stopped");
    } catch (error) {
      this.logger.warn("⚠️  Process may have already stopped", { error });
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Restart development MCP server
   */
  async restart(): Promise<void> {
    this.logger.info("🔄 Restarting Brooklyn MCP development mode...");
    await this.stop();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await this.start();
  }

  /**
   * Show development mode status
   */
  async status(): Promise<void> {
    this.logger.info("📊 Brooklyn MCP Development Mode Status");
    this.logger.info("=".repeat(45));

    const info = this.loadProcessInfo();
    if (!info) {
      this.logger.warn("❌ Development mode not running");
      this.logger.info("");
      this.logger.info("💡 Start with: brooklyn mcp dev-start");
      return;
    }

    const isRunning = this.isProcessRunning(info.processId);
    const inputExists = fs.existsSync(info.inputPipe);
    const outputExists = fs.existsSync(info.outputPipe);

    this.logger.info(`Process: ${isRunning ? "🟢 Running" : "🔴 Stopped"}`);
    this.logger.info(`PID: ${info.processId}`);
    this.logger.info(`Started: ${info.startTime}`);
    this.logger.info(`Input Pipe: ${inputExists ? "✅" : "❌"} ${info.inputPipe}`);
    this.logger.info(`Output Pipe: ${outputExists ? "✅" : "❌"} ${info.outputPipe}`);
    this.logger.info(`Log File: ${info.logFile}`);

    if (fs.existsSync(info.logFile)) {
      const stats = fs.statSync(info.logFile);
      this.logger.info(`Log Size: ${(stats.size / 1024).toFixed(1)} KB`);
    }

    if (isRunning && inputExists && outputExists) {
      this.logger.info("");
      this.logger.info("🚀 Ready for development! Available in chat via:");
      this.logger.info("   const browser = await dev_launch_browser({ browserType: 'chromium' });");
    }
  }

  /**
   * Clean up development mode resources (Architecture Committee requirement)
   */
  async cleanup(): Promise<void> {
    const info = this.loadProcessInfo();
    if (!info) return;

    this.logger.info("Cleaning up MCP development mode", { processId: info.processId });

    // Remove named pipes with error handling
    try {
      if (fs.existsSync(info.inputPipe)) {
        fs.unlinkSync(info.inputPipe);
        this.logger.debug("Removed input pipe", { pipe: info.inputPipe });
      }
      if (fs.existsSync(info.outputPipe)) {
        fs.unlinkSync(info.outputPipe);
        this.logger.debug("Removed output pipe", { pipe: info.outputPipe });
      }
    } catch (error) {
      this.logger.warn("Error removing pipes", { error });
    }

    // Remove process info file
    try {
      if (fs.existsSync(this.pipesFile)) {
        fs.unlinkSync(this.pipesFile);
        this.logger.debug("Removed pipe info file", { file: this.pipesFile });
      }
    } catch (error) {
      this.logger.warn("Error removing pipe info file", { error });
    }

    this.logger.info("MCP development mode cleanup complete");
  }

  // Private helper methods

  private loadProcessInfo(): DevProcessInfo | null {
    try {
      if (fs.existsSync(this.pipesFile)) {
        const data = fs.readFileSync(this.pipesFile, "utf-8");
        return JSON.parse(data);
      }
    } catch (error) {
      this.logger.warn("Error loading process info", { error });
    }
    return null;
  }

  private saveProcessInfo(info: DevProcessInfo): void {
    try {
      fs.writeFileSync(this.pipesFile, JSON.stringify(info, null, 2));
    } catch (error) {
      this.logger.error("Failed to save process info", { error });
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

  private setupLogStreaming(childProcess: ChildProcess, logFile: string): void {
    const logStream = fs.createWriteStream(logFile, { flags: "a" });

    if (childProcess.stdout) {
      childProcess.stdout.pipe(logStream);
    }

    if (childProcess.stderr) {
      childProcess.stderr.pipe(logStream);
    }

    // Also log to console in verbose mode
    if (process.env["BROOKLYN_MCP_DEV_VERBOSE"]) {
      if (childProcess.stdout) {
        childProcess.stdout.pipe(process.stdout);
      }
      if (childProcess.stderr) {
        childProcess.stderr.pipe(process.stderr);
      }
    }
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
}
