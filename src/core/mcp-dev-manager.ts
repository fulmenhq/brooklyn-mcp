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
  transport: "socket" | "pipe";
  // Socket transport
  socketPath?: string;
  // Pipe transport (experimental)
  inputPipe?: string;
  outputPipe?: string;
  pipesPrefix?: string;
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
        const loggerModule = require("../shared/pino-logger.js") as {
          getLogger: (name: string) => Logger;
        };
        this.logger = loggerModule.getLogger("brooklyn-mcp-dev");
      } catch (_error) {
        // Fallback to console if logger not available
        this.logger = {
          info: (_message: string, _context?: unknown) => {},
          warn: (_message: string, _context?: unknown) => {},
          error: (_message: string, _context?: unknown) => {},
          debug: (_message: string, _context?: unknown) => {},
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
  async start(options?: {
    halfPipe?: boolean;
    foreground?: boolean;
    transport?: "socket" | "pipe";
  }): Promise<void> {
    process.stderr.write("[CORE-DEV-DEBUG] Starting Brooklyn MCP development mode\n");
    this.getLogger()?.info("🚀 Starting Brooklyn MCP development mode");

    if (this.checkIfAlreadyRunning()) {
      return;
    }

    const transport = options?.transport || "socket";
    const transportPaths = this.setupTransportPaths(transport, options?.halfPipe);
    const logFile = this.generateLogFilePath();

    try {
      await this.createTransportFiles(transport, transportPaths);

      if (options?.foreground) {
        await this.runInForegroundMode(transport, transportPaths);
      } else {
        await this.runInBackgroundMode(transport, transportPaths, logFile);
      }
    } catch (error) {
      this.getLogger()?.error("Failed to start development mode", { error });
      await this.cleanup();
      throw error;
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
   * TODO: Phase 2 - Refactor to reduce complexity from 27 to <22 (split into smaller methods)
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Will refactor in Phase 2 of dev mode implementation
  async status(): Promise<void> {
    // Use stderr for dev commands to maintain stdout purity for MCP
    process.stderr.write("📊 Brooklyn MCP Development Mode Status\n");
    process.stderr.write("=============================================\n");

    const info = this.loadProcessInfo();
    if (!info) {
      process.stderr.write("❌ Development mode not running\n");
      process.stderr.write("\n");
      process.stderr.write("💡 Start with: brooklyn mcp dev-start\n");
    } else {
      const isRunning = this.isProcessRunning(info.processId);

      process.stderr.write(`Process: ${isRunning ? "🟢 Running" : "🔴 Stopped"}\n`);
      process.stderr.write(`PID: ${info.processId}\n`);
      process.stderr.write(`Started: ${info.startTime}\n`);
      process.stderr.write(`Transport: ${info.transport}\n`);

      if (info.transport === "socket") {
        const socketExists = info.socketPath ? fs.existsSync(info.socketPath) : false;
        process.stderr.write(`Socket: ${socketExists ? "✅" : "❌"} ${info.socketPath}\n`);
      } else {
        const inputExists = info.inputPipe ? fs.existsSync(info.inputPipe) : false;
        const outputExists = info.outputPipe ? fs.existsSync(info.outputPipe) : false;
        process.stderr.write(`Input Pipe: ${inputExists ? "✅" : "❌"} ${info.inputPipe}\n`);
        process.stderr.write(`Output Pipe: ${outputExists ? "✅" : "❌"} ${info.outputPipe}\n`);
      }

      process.stderr.write(`Log File: ${info.logFile}\n`);

      if (info.logFile && fs.existsSync(info.logFile)) {
        const stats = fs.statSync(info.logFile);
        process.stderr.write(`Log Size: ${(stats.size / 1024).toFixed(1)} KB\n`);
      }

      if (isRunning) {
        process.stderr.write("\n");
        if (info.transport === "socket" && info.socketPath) {
          process.stderr.write("💡 To send MCP messages:\n");
          process.stderr.write(
            `   echo '{"jsonrpc":"2.0","id":1,"method":"initialize",...}' | nc -U ${info.socketPath}\n`,
          );
          process.stderr.write(`   nc -U ${info.socketPath}  # Interactive mode\n`);
        } else if (info.inputPipe) {
          process.stderr.write("💡 To send MCP messages:\n");
          process.stderr.write(
            `   echo '{"jsonrpc":"2.0","id":1,"method":"initialize",...}' > ${info.inputPipe}\n`,
          );
          if (info.outputPipe) {
            process.stderr.write(`   tail -f ${info.outputPipe}  # To see responses\n`);
          }
        }
      }
    }

    // Check for orphaned processes
    process.stderr.write("\n");
    process.stderr.write("🔍 Scanning for orphaned Brooklyn processes...\n");

    try {
      const orphaned = await this.findOrphanedProcesses();
      if (orphaned.length === 0) {
        process.stderr.write("✅ No orphaned processes found\n");
      } else {
        process.stderr.write(`⚠️  Found ${orphaned.length} orphaned processes:\n`);
        for (const proc of orphaned) {
          process.stderr.write(`   PID: ${proc.pid} Command: ${proc.command}\n`);
        }
        process.stderr.write("💡 Run 'brooklyn mcp dev-cleanup' to terminate them\n");
      }
    } catch (error) {
      process.stderr.write(`Error scanning for orphaned processes: ${error}\n`);
    }
  }

  /**
   * Clean up development mode resources (Architecture Committee requirement)
   * TODO: Phase 2 - Refactor to reduce complexity from 44 to <22 (split into smaller methods)
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Will refactor in Phase 2 of dev mode implementation
  async cleanup(options?: { cleanupOrphanedReaders?: boolean }): Promise<void> {
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
        "ps -ef | grep '[m]cp start --dev-mode' | grep brooklyn | grep -v grep || true",
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

    // Remove transport files with error handling
    if (info) {
      try {
        if (info.transport === "socket" && info.socketPath && fs.existsSync(info.socketPath)) {
          fs.unlinkSync(info.socketPath);
          this.getLogger()?.debug("Removed socket file", { socket: info.socketPath });
        } else if (info.transport === "pipe") {
          if (info.inputPipe && fs.existsSync(info.inputPipe)) {
            fs.unlinkSync(info.inputPipe);
            this.getLogger()?.debug("Removed input pipe", { pipe: info.inputPipe });
          }
          if (info.outputPipe && fs.existsSync(info.outputPipe)) {
            fs.unlinkSync(info.outputPipe);
            this.getLogger()?.debug("Removed output pipe", { pipe: info.outputPipe });
          }
        }
      } catch (error) {
        this.getLogger()?.warn("Error removing transport files", { error });
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

    // Clean up orphaned cat processes if requested
    if (options?.cleanupOrphanedReaders) {
      try {
        this.getLogger()?.info("Cleaning up orphaned reader processes...");
        const { exec } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const execAsync = promisify(exec);

        // Find all cat processes reading from our named pipes
        const { stdout } = await execAsync(
          "ps -ef | grep 'cat.*/tmp/brooklyn-mcp-dev-.*' | grep -v grep || true",
        );

        const lines = stdout
          .trim()
          .split("\n")
          .filter((line) => line.trim());
        let killedCount = 0;

        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[1];
          const command = parts.slice(7).join(" ");

          // Verify this is a cat process reading from our pipes
          if (pid && command.includes("cat") && command.includes("/tmp/brooklyn-mcp-dev-")) {
            try {
              process.kill(Number(pid), "SIGTERM");
              this.getLogger()?.info("Killed orphaned cat process", { pid, command });
              killedCount++;
            } catch (error) {
              // Process might have already exited
              this.getLogger()?.debug("Failed to kill process (may have already exited)", {
                pid,
                error,
              });
            }
          }
        }

        if (killedCount > 0) {
          this.getLogger()?.info(`Cleaned up ${killedCount} orphaned reader processes`);
        } else {
          this.getLogger()?.info("No orphaned reader processes found");
        }

        // Also clean up orphaned test scripts
        const { stdout: testScriptOutput } = await execAsync(
          "ps -ef | grep 'test-brooklyn-dev-mode' | grep -v grep || true",
        );

        const testScriptLines = testScriptOutput
          .trim()
          .split("\n")
          .filter((line) => line.trim());
        for (const line of testScriptLines) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[1];
          if (pid) {
            try {
              process.kill(Number(pid), "SIGTERM");
              this.getLogger()?.info("Killed orphaned test script", { pid });
              killedCount++;
            } catch (error) {
              this.getLogger()?.debug("Failed to kill test script (may have already exited)", {
                pid,
                error,
              });
            }
          }
        }
      } catch (error) {
        this.getLogger()?.warn("Error cleaning up orphaned readers", { error });
      }
    }

    this.getLogger()?.info("MCP development mode cleanup complete");
  }

  // Private helper methods

  private checkIfAlreadyRunning(): boolean {
    process.stderr.write("[CORE-DEV-DEBUG] Checking if already running\n");
    if (this.isRunning()) {
      const info = this.loadProcessInfo();
      process.stderr.write(`[CORE-DEV-DEBUG] Already running with PID: ${info?.processId}\n`);
      this.getLogger()?.warn(`❌ Development mode already running (PID: ${info?.processId})`, {
        processId: info?.processId,
      });
      this.getLogger()?.info("   Use 'brooklyn mcp dev-stop' first, then try again.");
      return true;
    }
    process.stderr.write("[CORE-DEV-DEBUG] Not running, proceeding with start\n");
    return false;
  }

  private setupTransportPaths(transport: "socket" | "pipe", halfPipe?: boolean) {
    const timestamp = Date.now();
    const instanceUuid = Math.random().toString(36).substring(2, 8);
    const devPrefix = process.env["BROOKLYN_DEV_PIPE_DIR"] || "/tmp";

    if (transport === "socket") {
      return {
        socketPath: path.join(devPrefix, `brooklyn-mcp-dev-${instanceUuid}-${timestamp}.sock`),
      };
    }
    return {
      inputPipe: path.join(devPrefix, `brooklyn-mcp-dev-${instanceUuid}-${timestamp}-in`),
      outputPipe: halfPipe
        ? undefined
        : path.join(devPrefix, `brooklyn-mcp-dev-${instanceUuid}-${timestamp}-out`),
    };
  }

  private generateLogFilePath(): string {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
    const timeStr = date.toISOString().slice(11, 19).replace(/:/g, "");
    const ms = date.getUTCMilliseconds().toString().padStart(3, "0");
    return path.join(this.logDir, `brooklyn-mcp-dev-${dateStr}-${timeStr}-${ms}.log`);
  }

  private async createTransportFiles(
    transport: "socket" | "pipe",
    transportPaths: { socketPath?: string; inputPipe?: string; outputPipe?: string },
  ): Promise<void> {
    if (transport === "socket") {
      const { socketPath } = transportPaths;
      this.getLogger()?.info("📦 Creating Unix domain socket", { socketPath });

      if (socketPath && fs.existsSync(socketPath)) {
        fs.unlinkSync(socketPath);
      }

      this.getLogger()?.info(`   Socket: ${socketPath}`);
    } else {
      const { inputPipe, outputPipe } = transportPaths;
      this.getLogger()?.info("📦 Creating named pipes (experimental)", {
        inputPipe,
        outputPipe,
      });

      if (inputPipe) {
        await this.createNamedPipe(inputPipe);
        fs.chmodSync(inputPipe, 0o600);
      }

      if (outputPipe) {
        await this.createNamedPipe(outputPipe);
        fs.chmodSync(outputPipe, 0o600);
      }

      this.getLogger()?.info(`   Input:  ${inputPipe}`);
      this.getLogger()?.info(`   Output: ${outputPipe}`);
    }
  }

  private async runInForegroundMode(
    transport: "socket" | "pipe",
    transportPaths: { socketPath?: string; inputPipe?: string; outputPipe?: string },
  ): Promise<void> {
    const { socketPath, inputPipe, outputPipe } = transportPaths;

    this.getLogger()?.info("🔧 Starting Brooklyn MCP server directly...");

    this.setEnvironmentVariables(transport, socketPath, inputPipe, outputPipe);

    const processInfo: DevProcessInfo = {
      processId: process.pid,
      startTime: new Date().toISOString(),
      transport,
      socketPath,
      inputPipe,
      outputPipe: outputPipe || "",
      pipesPrefix: inputPipe ? path.dirname(inputPipe) : undefined,
      logFile: "", // No log file in foreground mode
    };
    this.saveProcessInfo(processInfo);

    this.displayForegroundStartupInfo(transport, socketPath, inputPipe, outputPipe);
    this.setupGracefulShutdown();

    await this.startMCPServer(transport);
  }

  private async runInBackgroundMode(
    transport: "socket" | "pipe",
    transportPaths: { socketPath?: string; inputPipe?: string; outputPipe?: string },
    logFile: string,
  ): Promise<void> {
    const { socketPath, inputPipe, outputPipe } = transportPaths;

    process.stderr.write("[CORE-DEV-DEBUG] About to spawn Brooklyn MCP process\n");
    this.getLogger()?.info("🔧 Starting Brooklyn MCP process...");

    const logStream = fs.openSync(logFile, "a");
    const spawnArgs = this.buildSpawnArgs(transport, socketPath, inputPipe);

    process.stderr.write(`[CORE-DEV-DEBUG] Spawn command: bun ${spawnArgs.join(" ")}\n`);
    this.logEnvironmentVariables(transport, socketPath, inputPipe, outputPipe);

    const env = this.buildEnvironment(transport, socketPath, inputPipe, outputPipe);
    const brooklynProcess = this.spawnBackgroundProcess(spawnArgs, logStream, env);

    process.stderr.write(
      `[CORE-DEV-DEBUG] Brooklyn process spawned with PID: ${brooklynProcess.pid}\n`,
    );

    fs.closeSync(logStream);

    const processInfo: DevProcessInfo = {
      processId: brooklynProcess.pid ?? 0,
      startTime: new Date().toISOString(),
      transport,
      socketPath,
      inputPipe,
      outputPipe: outputPipe || "",
      pipesPrefix: inputPipe ? path.dirname(inputPipe) : undefined,
      logFile,
    };

    this.saveProcessInfo(processInfo);
    brooklynProcess.unref();

    await this.waitForProcessStart(brooklynProcess, logFile);
  }

  private setEnvironmentVariables(
    transport: "socket" | "pipe",
    socketPath?: string,
    inputPipe?: string,
    outputPipe?: string,
  ): void {
    if (transport === "socket") {
      process.env["BROOKLYN_DEV_SOCKET_PATH"] = socketPath;
    } else {
      process.env["BROOKLYN_DEV_INPUT_PIPE"] = inputPipe;
      if (outputPipe) {
        process.env["BROOKLYN_DEV_OUTPUT_PIPE"] = outputPipe;
      }
    }
  }

  private displayForegroundStartupInfo(
    transport: "socket" | "pipe",
    socketPath?: string,
    inputPipe?: string,
    outputPipe?: string,
  ): void {
    this.getLogger()?.info("✅ Brooklyn MCP development mode starting in foreground mode!");
    this.getLogger()?.info(`   PID: ${process.pid}`);
    this.getLogger()?.info(`   Transport: ${transport}`);

    if (transport === "socket") {
      this.getLogger()?.info(`   Socket: ${socketPath}`);
      this.getLogger()?.info("");
      this.getLogger()?.info("📋 Usage:");
      this.getLogger()?.info("   • Test connection:");
      this.getLogger()?.info(
        `     echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"roots":{}},"clientInfo":{"name":"test","version":"1.0"}}}' | nc -U ${socketPath}`,
      );
      this.getLogger()?.info(`   • Interactive mode: nc -U ${socketPath}`);
    } else {
      this.getLogger()?.info(`   Input: ${inputPipe}`);
      this.getLogger()?.info(`   Output: ${outputPipe}`);
      this.getLogger()?.info("");
      this.getLogger()?.info("📋 Usage:");
      this.getLogger()?.info("   • In another terminal, send MCP messages to input pipe:");
      this.getLogger()?.info(
        `     echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"roots":{}},"clientInfo":{"name":"test","version":"1.0"}}}' > ${inputPipe}`,
      );
      this.getLogger()?.info(`   • Read responses from output pipe: tail -f ${outputPipe}`);
    }

    this.getLogger()?.info("   • Press Ctrl+C to stop");
    this.getLogger()?.info("");
  }

  private setupGracefulShutdown(): void {
    process.on("SIGINT", async () => {
      this.getLogger()?.info("\n🛑 Stopping Brooklyn dev mode...");
      await this.cleanup();
      process.exit(0);
    });
  }

  private async startMCPServer(transport: "socket" | "pipe"): Promise<void> {
    const { BrooklynEngine } = await import("../core/brooklyn-engine.js");
    const { loadConfig } = await import("../core/config.js");
    const { createMCPStdio } = await import("../transports/index.js");
    const { initializeLogging } = await import("../shared/pino-logger.js");

    const config = await loadConfig({
      logging: { level: "debug", format: "json" },
    });

    const mcpTransport = await createMCPStdio(
      transport === "socket"
        ? { socketPath: process.env["BROOKLYN_DEV_SOCKET_PATH"] }
        : {
            inputPipe: process.env["BROOKLYN_DEV_INPUT_PIPE"],
            outputPipe: process.env["BROOKLYN_DEV_OUTPUT_PIPE"],
          },
    );

    await initializeLogging(config);

    const engine = new BrooklynEngine({
      config: { ...config, devMode: true },
      correlationId: `mcp-dev-${Date.now()}`,
    });

    await engine.initialize();

    const transportName = "dev-mcp";
    await engine.addTransport(transportName, mcpTransport);

    this.getLogger()?.info("Starting MCP server...");
    await engine.startTransport(transportName);

    // Keep the event loop alive
    setInterval(() => {
      // Heartbeat to keep process alive
    }, 1000);
  }

  private buildSpawnArgs(
    transport: "socket" | "pipe",
    socketPath?: string,
    inputPipe?: string,
  ): string[] {
    const spawnArgs = [
      "run",
      path.resolve(process.cwd(), "src/cli/brooklyn.ts"),
      "mcp",
      "start",
      "--dev-mode",
      "--log-level",
      "debug",
    ];

    if (transport === "socket") {
      if (socketPath) spawnArgs.push("--socket-path", socketPath);
    } else {
      if (inputPipe) spawnArgs.push("--pipes-prefix", path.dirname(inputPipe));
    }

    return spawnArgs;
  }

  private logEnvironmentVariables(
    transport: "socket" | "pipe",
    socketPath?: string,
    inputPipe?: string,
    outputPipe?: string,
  ): void {
    if (transport === "socket") {
      process.stderr.write(
        `[CORE-DEV-DEBUG] Environment: BROOKLYN_DEV_SOCKET_PATH=${socketPath}\n`,
      );
    } else {
      process.stderr.write(
        `[CORE-DEV-DEBUG] Environment: BROOKLYN_DEV_INPUT_PIPE=${inputPipe}, BROOKLYN_DEV_OUTPUT_PIPE=${outputPipe}\n`,
      );
    }
  }

  private buildEnvironment(
    transport: "socket" | "pipe",
    socketPath?: string,
    inputPipe?: string,
    outputPipe?: string,
  ): NodeJS.ProcessEnv {
    return {
      ...process.env,
      ...(transport === "socket"
        ? { BROOKLYN_DEV_SOCKET_PATH: socketPath }
        : {
            BROOKLYN_DEV_INPUT_PIPE: inputPipe,
            BROOKLYN_DEV_OUTPUT_PIPE: outputPipe || "",
          }),
    };
  }

  private spawnBackgroundProcess(
    spawnArgs: string[],
    logStream: number,
    env: NodeJS.ProcessEnv,
  ): ChildProcess {
    return spawn("bun", spawnArgs, {
      detached: true,
      stdio: ["ignore", logStream, logStream],
      cwd: this.getProjectRoot(),
      env,
    });
  }

  private async waitForProcessStart(brooklynProcess: ChildProcess, logFile: string): Promise<void> {
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

    process.exit(0);
  }

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
        "ps -ef | grep '[m]cp start --dev-mode' | grep brooklyn | grep -v grep || true",
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
          // Filter out null values, the current managed process, and the current process
          return p !== null && p.pid !== String(info?.processId) && p.pid !== String(process.pid);
        });
    } catch {
      return [];
    }
  }
}
