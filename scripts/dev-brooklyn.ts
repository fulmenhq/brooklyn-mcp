#!/usr/bin/env bun

import { type ChildProcess, exec, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import type { BrooklynConfig } from "../src/core/config.js";
import { getLogger, initializeLogging } from "../src/shared/structured-logger.js";

const execAsync = promisify(exec);

// Initialize structured logger for dev mode management
const minimalConfig: BrooklynConfig = {
  serviceName: "brooklyn-dev-manager",
  version: "1.0.0",
  environment: "development",
  teamId: "dev-team",
  transports: {
    mcp: { enabled: false },
    http: {
      enabled: false,
      port: 3000,
      host: "localhost",
      cors: false,
      rateLimiting: false,
    },
  },
  browsers: {
    maxInstances: 5,
    defaultType: "chromium",
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
  logging: {
    level: (process.env["BROOKLYN_DEV_LOG_LEVEL"] as "debug" | "info" | "warn" | "error") || "info",
    format: "json",
    maxFiles: 3,
    maxSize: "5MB",
  },
  plugins: {
    directory: "",
    autoLoad: false,
    allowUserPlugins: false,
  },
  paths: {
    config: "",
    logs: "",
    plugins: "",
    browsers: "",
    pids: "",
  },
};
initializeLogging(minimalConfig);
const logger = getLogger("dev-manager");

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

  async start(): Promise<void> {
    logger.info("🚀 Starting Brooklyn development mode...");

    const existingInfo = this.loadProcessInfo();
    if (existingInfo && !this.isProcessRunning(existingInfo.processId)) {
      logger.info("🧹 Cleaning up stale resources from previous run...");
      await this.cleanup();
      logger.info("✅ Cleanup completed");
    }

    if (this.isRunning()) {
      const info = this.loadProcessInfo();
      logger.info(`❌ Development mode already running (PID: ${info?.processId})`);
      logger.info("   Use 'bun run dev:brooklyn:stop' first, then try again.");
      return;
    }

    const timestamp = Date.now();
    const pipesPrefix = "/tmp/brooklyn-dev";
    const inputPipe = `${pipesPrefix}-in-${timestamp}`;
    const outputPipe = `${pipesPrefix}-out-${timestamp}`;
    const logFile = path.join(this.logDir, `brooklyn-dev-${timestamp}.log`);

    try {
      logger.info("📦 Creating named pipes...");
      await this.createNamedPipe(inputPipe);
      await this.createNamedPipe(outputPipe);
      logger.info(`   Input:  ${inputPipe}`);
      logger.info(`   Output: ${outputPipe}`);

      logger.info("🔧 Starting Brooklyn process...");
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

      const processInfo: DevProcessInfo = {
        processId: brooklynProcess.pid ?? 0,
        startTime: new Date().toISOString(),
        inputPipe,
        outputPipe,
        pipesPrefix,
        logFile,
      };

      this.saveProcessInfo(processInfo);

      this.setupLogStreaming(brooklynProcess, logFile);

      brooklynProcess.on("exit", (code) => {
        logger.info(`🔴 Brooklyn development process exited with code: ${code}`);
        this.cleanup();
      });

      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (brooklynProcess.killed || brooklynProcess.exitCode !== null) {
        logger.info("❌ Failed to start Brooklyn development process");
        return;
      }

      logger.info("✅ Brooklyn development mode started successfully!");
      logger.info(`   PID: ${brooklynProcess.pid}`);
      logger.info(`   Log: ${logFile}`);
      logger.info("");
      logger.info("📋 Next steps:");
      logger.info("   • Test connection: bun run dev:brooklyn:test");
      logger.info("   • View logs: bun run dev:brooklyn:logs");
      logger.info("   • Check status: bun run dev:brooklyn:status");
    } catch (error) {
      logger.error("❌ Failed to start development mode", {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.cleanup();
      process.exit(1);
    }
  }

  async stop(): Promise<void> {
    logger.info("🛑 Stopping Brooklyn development mode...");

    const info = this.loadProcessInfo();
    if (!info) {
      logger.info("❌ No development mode process found");
      return;
    }

    try {
      logger.info(`   Stopping process PID: ${info.processId}`);
      process.kill(info.processId, "SIGTERM");

      await new Promise((resolve) => setTimeout(resolve, 2000));

      try {
        process.kill(info.processId, 0);
        logger.info("   Force killing process...");
        process.kill(info.processId, "SIGKILL");
      } catch {
        // Process already dead
      }

      logger.info("✅ Development mode stopped");
    } catch (error) {
      logger.warn("⚠️  Process may have already stopped", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await this.cleanup();
    }
  }

  async restart(): Promise<void> {
    logger.info("🔄 Restarting Brooklyn development mode...");
    await this.stop();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await this.start();
  }

  async status(): Promise<void> {
    logger.info("📊 Brooklyn Development Mode Status");
    logger.info("=".repeat(40));

    const info = this.loadProcessInfo();
    if (!info) {
      logger.info("❌ No managed development mode process found");
    } else {
      const isRunning = this.isProcessRunning(info.processId);
      const inputExists = fs.existsSync(info.inputPipe);
      const outputExists = fs.existsSync(info.outputPipe);

      logger.info("Managed Process:");
      logger.info(`  Status: ${isRunning ? "🟢 Running" : "🔴 Stopped"}`);
      logger.info(`  PID: ${info.processId}`);
      logger.info(`  Started: ${info.startTime}`);
      logger.info(`  Input Pipe: ${inputExists ? "✅" : "❌"} ${info.inputPipe}`);
      logger.info(`  Output Pipe: ${outputExists ? "✅" : "❌"} ${info.outputPipe}`);
      logger.info(`  Log File: ${info.logFile}`);

      if (fs.existsSync(info.logFile)) {
        const stats = fs.statSync(info.logFile);
        logger.info(`  Log Size: ${(stats.size / 1024).toFixed(1)} KB`);
      }
    }

    logger.info("\n🔍 Scanning for orphaned Brooklyn processes...");
    const orphaned = await this.findOrphanedProcesses();
    if (orphaned.length === 0) {
      logger.info("✅ No orphaned processes found");
    } else {
      logger.warn(`⚠️ Found ${orphaned.length} orphaned processes:`);
      for (const proc of orphaned) {
        logger.info(`  PID: ${proc.pid} Command: ${proc.command}`);
      }
      logger.info("💡 Run 'brooklyn mcp dev-cleanup' to terminate them");
    }
  }

  private async findOrphanedProcesses(): Promise<{ pid: string; command: string }[]> {
    try {
      const { stdout } = await execAsync(
        "ps -ef | grep '[b]rooklyn.*mcp start --dev-mode' | grep -v grep",
      );
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
        .filter((p): p is { pid: string; command: string } => p !== null);
    } catch {
      return [];
    }
  }

  async logs(): Promise<void> {
    const info = this.loadProcessInfo();
    if (!info) {
      logger.info("❌ No development mode process found");
      return;
    }

    if (!fs.existsSync(info.logFile)) {
      logger.info("❌ Log file not found", { logFile: info.logFile });
      return;
    }

    logger.info("📄 Brooklyn Development Logs");
    logger.info("=".repeat(40));

    try {
      const { stdout } = await execAsync(`tail -50 "${info.logFile}"`);
      logger.info(stdout);
    } catch (error) {
      logger.error("❌ Failed to read logs", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async pipes(): Promise<void> {
    logger.info("🔗 Brooklyn Development Pipes");
    logger.info("=".repeat(40));

    const info = this.loadProcessInfo();
    if (!info) {
      logger.info("❌ No development mode process found");
      return;
    }

    logger.info(`Input Pipe:  ${info.inputPipe}`);
    logger.info(`Output Pipe: ${info.outputPipe}`);
    logger.info(`Prefix:      ${info.pipesPrefix}`);

    const inputExists = fs.existsSync(info.inputPipe);
    const outputExists = fs.existsSync(info.outputPipe);

    logger.info("");
    logger.info("Status:");
    logger.info(`  Input:  ${inputExists ? "✅ Available" : "❌ Missing"}`);
    logger.info(`  Output: ${outputExists ? "✅ Available" : "❌ Missing"}`);

    if (inputExists && outputExists) {
      logger.info("");
      logger.info("💡 Claude-side usage:");
      logger.info("   const { sendToDevBrooklyn } = await import('./dev-helpers.js');");
      logger.info(
        "   const result = await sendToDevBrooklyn('launch_browser', { browserType: 'chromium' });",
      );
    }
  }

  async test(): Promise<void> {
    logger.info("🧪 Testing Brooklyn development mode...");

    const info = this.loadProcessInfo();
    if (!info) {
      logger.info("❌ No development mode process found");
      return;
    }

    if (!this.isProcessRunning(info.processId)) {
      logger.info("❌ Development process not running");
      return;
    }

    const inputExists = fs.existsSync(info.inputPipe);
    const outputExists = fs.existsSync(info.outputPipe);

    if (!(inputExists && outputExists)) {
      logger.info("❌ Pipes not available");
      logger.info(`   Input:  ${inputExists ? "✅" : "❌"}`);
      logger.info(`   Output: ${outputExists ? "✅" : "❌"}`);
      return;
    }

    logger.info("✅ Development mode test passed!");
    logger.info("   Process: Running");
    logger.info("   Pipes: Available");
    logger.info("");
    logger.info("🚀 Ready for development! Try:");
    logger.info("   bun run dev:test:basic");
  }

  async cleanup(): Promise<void> {
    const info = this.loadProcessInfo();

    if (info) {
      await this.killManagedProcess(info.processId);
    }

    const orphanedCount = await this.killOrphanedProcesses();
    this.cleanupPipes(info);
    this.cleanupProcessInfo();

    logger.info(`✅ Cleanup completed. Killed ${orphanedCount} orphaned processes`);
  }

  private async killManagedProcess(pid: number): Promise<void> {
    if (!this.isProcessRunning(pid)) return;

    try {
      process.kill(pid, "SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Force kill if still running
      try {
        process.kill(pid, 0);
        process.kill(pid, "SIGKILL");
      } catch {
        // Process already dead
      }
    } catch (error: unknown) {
      logger.warn("⚠️  Process may have already stopped", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async killOrphanedProcesses(): Promise<number> {
    const orphaned = await this.findOrphanedProcesses();

    for (const proc of orphaned) {
      try {
        process.kill(Number(proc.pid), "SIGTERM");
      } catch (error: unknown) {
        logger.warn(`⚠️  Failed to kill orphaned process ${proc.pid}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return orphaned.length;
  }

  private cleanupPipes(info: DevProcessInfo | null): void {
    if (!info) return;

    try {
      if (fs.existsSync(info.inputPipe)) {
        fs.unlinkSync(info.inputPipe);
      }
      if (fs.existsSync(info.outputPipe)) {
        fs.unlinkSync(info.outputPipe);
      }
    } catch (error: unknown) {
      logger.warn("⚠️  Error removing pipes", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private cleanupProcessInfo(): void {
    try {
      if (fs.existsSync(this.pipesFile)) {
        fs.unlinkSync(this.pipesFile);
      }
    } catch (error: unknown) {
      logger.warn("⚠️  Error removing process info:", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private loadProcessInfo(): DevProcessInfo | null {
    try {
      if (fs.existsSync(this.pipesFile)) {
        const data = fs.readFileSync(this.pipesFile, "utf-8");
        return JSON.parse(data) as DevProcessInfo;
      }
    } catch (error: unknown) {
      logger.warn("⚠️  Error loading process info:", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  }

  private saveProcessInfo(info: DevProcessInfo): void {
    try {
      fs.writeFileSync(this.pipesFile, JSON.stringify(info, null, 2));
    } catch (error: unknown) {
      logger.error("❌ Failed to save process info:", {
        error: error instanceof Error ? error.message : String(error),
      });
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
      try {
        if (fs.existsSync(pipePath)) {
          fs.unlinkSync(pipePath);
        }
      } catch {
        // Ignore cleanup errors
      }

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

    childProcess.stdout?.pipe(logStream);
    childProcess.stderr?.pipe(logStream);

    if (process.env["BROOKLYN_DEV_VERBOSE"]) {
      childProcess.stdout?.pipe(process.stdout);
      childProcess.stderr?.pipe(process.stderr);
    }
  }

  private getProjectRoot(): string {
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
      logger.info("Brooklyn Development Mode Manager");
      logger.info("");
      logger.info("Usage:");
      logger.info("  bun run dev:brooklyn:start    Start development mode");
      logger.info("  bun run dev:brooklyn:stop     Stop development mode");
      logger.info("  bun run dev:brooklyn:restart  Restart development mode");
      logger.info("  bun run dev:brooklyn:status   Show status");
      logger.info("  bun run dev:brooklyn:logs     Show recent logs");
      logger.info("  bun run dev:brooklyn:pipes    Show pipe information");
      logger.info("  bun run dev:brooklyn:test     Test pipe communication");
      logger.info("  bun run dev:brooklyn:cleanup  Clean up resources");
      break;
  }
}

if (import.meta.main) {
  main().catch((error) => {
    logger.error("❌ Development mode error", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}
