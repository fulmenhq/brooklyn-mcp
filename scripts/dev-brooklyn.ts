#!/usr/bin/env bun

/**
 * Brooklyn Development Mode Management Script
 *
 * Manages captive Brooklyn processes with named pipes for development.
 * Enables rapid iteration without Claude session restarts.
 */

import { type ChildProcess, exec, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

interface DevProcessInfo {
  processId: number;
  startTime: string;
  inputPipe: string;
  outputPipe: string;
  pipesPrefix: string;
  logFile: string;
}

class DevBrooklynManager {
  private devDir: string;
  private pipesFile: string;
  private logDir: string;

  constructor() {
    this.devDir = path.join(os.homedir(), ".brooklyn", "dev");
    this.pipesFile = path.join(this.devDir, "pipes.json");
    this.logDir = path.join(this.devDir, "logs");

    // Ensure directories exist
    fs.mkdirSync(this.devDir, { recursive: true });
    fs.mkdirSync(this.logDir, { recursive: true });
  }

  /**
   * Start development Brooklyn process
   */
  async start(): Promise<void> {
    console.log("🚀 Starting Brooklyn development mode...");

    // Check if already running
    if (this.isRunning()) {
      const info = this.loadProcessInfo();
      console.log(`❌ Development mode already running (PID: ${info?.processId})`);
      console.log("   Use 'bun run dev:brooklyn:stop' first, then try again.");
      return;
    }

    const timestamp = Date.now();
    const pipesPrefix = "/tmp/brooklyn-dev";
    const inputPipe = `${pipesPrefix}-in-${timestamp}`;
    const outputPipe = `${pipesPrefix}-out-${timestamp}`;
    const logFile = path.join(this.logDir, `brooklyn-dev-${timestamp}.log`);

    try {
      // Create named pipes
      console.log("📦 Creating named pipes...");
      await this.createNamedPipe(inputPipe);
      await this.createNamedPipe(outputPipe);
      console.log(`   Input:  ${inputPipe}`);
      console.log(`   Output: ${outputPipe}`);

      // Start Brooklyn in development mode
      console.log("🔧 Starting Brooklyn process...");
      const brooklynProcess = spawn(
        "bun",
        [
          "run",
          "src/cli/brooklyn.ts",
          "mcp",
          "start",
          "--dev-mode",
          "--pipes-prefix",
          pipesPrefix,
          "--log-level",
          "debug",
        ],
        {
          detached: true,
          stdio: ["ignore", "pipe", "pipe"],
          cwd: this.getProjectRoot(),
        },
      );

      // Save process info
      const processInfo: DevProcessInfo = {
        processId: brooklynProcess.pid ?? 0,
        startTime: new Date().toISOString(),
        inputPipe,
        outputPipe,
        pipesPrefix,
        logFile,
      };

      this.saveProcessInfo(processInfo);

      // Setup log streaming
      this.setupLogStreaming(brooklynProcess, logFile);

      // Handle process exit
      brooklynProcess.on("exit", (code) => {
        console.log(`🔴 Brooklyn development process exited with code: ${code}`);
        this.cleanup();
      });

      // Wait a moment to ensure process started
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (brooklynProcess.killed || brooklynProcess.exitCode !== null) {
        console.log("❌ Failed to start Brooklyn development process");
        return;
      }

      console.log("✅ Brooklyn development mode started successfully!");
      console.log(`   PID: ${brooklynProcess.pid}`);
      console.log(`   Log: ${logFile}`);
      console.log("");
      console.log("📋 Next steps:");
      console.log("   • Test connection: bun run dev:brooklyn:test");
      console.log("   • View logs: bun run dev:brooklyn:logs");
      console.log("   • Check status: bun run dev:brooklyn:status");
    } catch (error) {
      console.error("❌ Failed to start development mode:", error);
      await this.cleanup();
      process.exit(1);
    }
  }

  /**
   * Stop development Brooklyn process
   */
  async stop(): Promise<void> {
    console.log("🛑 Stopping Brooklyn development mode...");

    const info = this.loadProcessInfo();
    if (!info) {
      console.log("❌ No development mode process found");
      return;
    }

    try {
      // Kill the process
      console.log(`   Stopping process PID: ${info.processId}`);
      process.kill(info.processId, "SIGTERM");

      // Wait for process to exit gracefully
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Force kill if still running
      try {
        process.kill(info.processId, 0); // Check if still running
        console.log("   Force killing process...");
        process.kill(info.processId, "SIGKILL");
      } catch {
        // Process already dead, that's good
      }

      console.log("✅ Development mode stopped");
    } catch (error) {
      console.warn("⚠️  Process may have already stopped:", error);
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Restart development Brooklyn process
   */
  async restart(): Promise<void> {
    console.log("🔄 Restarting Brooklyn development mode...");
    await this.stop();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await this.start();
  }

  /**
   * Show development mode status
   */
  async status(): Promise<void> {
    console.log("📊 Brooklyn Development Mode Status");
    console.log("=".repeat(40));

    const info = this.loadProcessInfo();
    if (!info) {
      console.log("❌ Development mode not running");
      return;
    }

    const isRunning = this.isProcessRunning(info.processId);
    const inputExists = fs.existsSync(info.inputPipe);
    const outputExists = fs.existsSync(info.outputPipe);

    console.log(`Process: ${isRunning ? "🟢 Running" : "🔴 Stopped"}`);
    console.log(`PID: ${info.processId}`);
    console.log(`Started: ${info.startTime}`);
    console.log(`Input Pipe: ${inputExists ? "✅" : "❌"} ${info.inputPipe}`);
    console.log(`Output Pipe: ${outputExists ? "✅" : "❌"} ${info.outputPipe}`);
    console.log(`Log File: ${info.logFile}`);

    if (fs.existsSync(info.logFile)) {
      const stats = fs.statSync(info.logFile);
      console.log(`Log Size: ${(stats.size / 1024).toFixed(1)} KB`);
    }
  }

  /**
   * Show recent logs
   */
  async logs(): Promise<void> {
    const info = this.loadProcessInfo();
    if (!info) {
      console.log("❌ No development mode process found");
      return;
    }

    if (!fs.existsSync(info.logFile)) {
      console.log("❌ Log file not found:", info.logFile);
      return;
    }

    console.log("📄 Brooklyn Development Logs");
    console.log("=".repeat(40));

    try {
      // Show last 50 lines
      const { stdout } = await execAsync(`tail -50 "${info.logFile}"`);
      console.log(stdout);
    } catch (error) {
      console.error("❌ Failed to read logs:", error);
    }
  }

  /**
   * Show pipe information
   */
  async pipes(): Promise<void> {
    console.log("🔗 Brooklyn Development Pipes");
    console.log("=".repeat(40));

    const info = this.loadProcessInfo();
    if (!info) {
      console.log("❌ No development mode process found");
      return;
    }

    console.log(`Input Pipe:  ${info.inputPipe}`);
    console.log(`Output Pipe: ${info.outputPipe}`);
    console.log(`Prefix:      ${info.pipesPrefix}`);

    // Check pipe status
    const inputExists = fs.existsSync(info.inputPipe);
    const outputExists = fs.existsSync(info.outputPipe);

    console.log("");
    console.log("Status:");
    console.log(`  Input:  ${inputExists ? "✅ Available" : "❌ Missing"}`);
    console.log(`  Output: ${outputExists ? "✅ Available" : "❌ Missing"}`);

    if (inputExists && outputExists) {
      console.log("");
      console.log("💡 Claude-side usage:");
      console.log("   const { sendToDevBrooklyn } = await import('./dev-helpers.js');");
      console.log(
        "   const result = await sendToDevBrooklyn('launch_browser', { browserType: 'chromium' });",
      );
    }
  }

  /**
   * Test pipe communication
   */
  async test(): Promise<void> {
    console.log("🧪 Testing Brooklyn development mode...");

    const info = this.loadProcessInfo();
    if (!info) {
      console.log("❌ No development mode process found");
      return;
    }

    if (!this.isProcessRunning(info.processId)) {
      console.log("❌ Development process not running");
      return;
    }

    const inputExists = fs.existsSync(info.inputPipe);
    const outputExists = fs.existsSync(info.outputPipe);

    if (!(inputExists && outputExists)) {
      console.log("❌ Pipes not available");
      console.log(`   Input:  ${inputExists ? "✅" : "❌"}`);
      console.log(`   Output: ${outputExists ? "✅" : "❌"}`);
      return;
    }

    console.log("✅ Development mode test passed!");
    console.log("   Process: Running");
    console.log("   Pipes: Available");
    console.log("");
    console.log("🚀 Ready for development! Try:");
    console.log("   bun run dev:test:basic");
  }

  /**
   * Cleanup development mode resources
   */
  async cleanup(): Promise<void> {
    const info = this.loadProcessInfo();
    if (!info) return;

    // Remove pipes
    try {
      if (fs.existsSync(info.inputPipe)) {
        fs.unlinkSync(info.inputPipe);
      }
      if (fs.existsSync(info.outputPipe)) {
        fs.unlinkSync(info.outputPipe);
      }
    } catch (error) {
      console.warn("⚠️  Error removing pipes:", error);
    }

    // Remove process info
    try {
      if (fs.existsSync(this.pipesFile)) {
        fs.unlinkSync(this.pipesFile);
      }
    } catch (error) {
      console.warn("⚠️  Error removing process info:", error);
    }
  }

  // Helper methods

  private loadProcessInfo(): DevProcessInfo | null {
    try {
      if (fs.existsSync(this.pipesFile)) {
        const data = fs.readFileSync(this.pipesFile, "utf-8");
        return JSON.parse(data);
      }
    } catch (error) {
      console.warn("⚠️  Error loading process info:", error);
    }
    return null;
  }

  private saveProcessInfo(info: DevProcessInfo): void {
    try {
      fs.writeFileSync(this.pipesFile, JSON.stringify(info, null, 2));
    } catch (error) {
      console.error("❌ Failed to save process info:", error);
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
    if (process.env["BROOKLYN_DEV_VERBOSE"]) {
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
    let currentDir = __dirname;
    while (currentDir !== path.dirname(currentDir)) {
      if (fs.existsSync(path.join(currentDir, "package.json"))) {
        return currentDir;
      }
      currentDir = path.dirname(currentDir);
    }
    throw new Error("Could not find project root (package.json not found)");
  }
}

// CLI interface
async function main() {
  const command = process.argv[2];
  const manager = new DevBrooklynManager();

  switch (command) {
    case "start":
      await manager.start();
      break;
    case "stop":
      await manager.stop();
      break;
    case "restart":
      await manager.restart();
      break;
    case "status":
      await manager.status();
      break;
    case "logs":
      await manager.logs();
      break;
    case "pipes":
      await manager.pipes();
      break;
    case "test":
      await manager.test();
      break;
    case "cleanup":
      await manager.cleanup();
      break;
    default:
      console.log("Brooklyn Development Mode Manager");
      console.log("");
      console.log("Usage:");
      console.log("  bun run dev:brooklyn:start    Start development mode");
      console.log("  bun run dev:brooklyn:stop     Stop development mode");
      console.log("  bun run dev:brooklyn:restart  Restart development mode");
      console.log("  bun run dev:brooklyn:status   Show status");
      console.log("  bun run dev:brooklyn:logs     Show recent logs");
      console.log("  bun run dev:brooklyn:pipes    Show pipe information");
      console.log("  bun run dev:brooklyn:test     Test pipe communication");
      console.log("  bun run dev:brooklyn:cleanup  Clean up resources");
      break;
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("❌ Development mode error:", error);
    process.exit(1);
  });
}
