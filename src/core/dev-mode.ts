/**
 * Brooklyn Development Mode
 *
 * Provides named pipe communication for development without MCP system dependencies.
 * Enables rapid iteration on Brooklyn features without requiring Claude session restarts.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getLogger } from "../shared/structured-logger.js";

interface DevModeProcessInfo {
  processId: number;
  startTime: string;
  inputPipe: string;
  outputPipe: string;
  pipesPrefix: string;
}

interface DevModeConfig {
  inputPipe: string;
  outputPipe: string;
  processInfo: DevModeProcessInfo;
}

// Lazy logger initialization to avoid circular dependency
let logger: ReturnType<typeof getLogger> | null = null;

function ensureLogger() {
  if (!logger) {
    logger = getLogger("brooklyn-dev-mode");
  }
  return logger;
}

/**
 * Setup development mode with named pipes
 */
export async function setupDevMode(pipesPrefix = "/tmp/brooklyn-dev"): Promise<DevModeConfig> {
  // Check if pipes are provided via environment (MCP dev manager)
  const providedInputPipe = process.env["BROOKLYN_DEV_INPUT_PIPE"];
  const providedOutputPipe = process.env["BROOKLYN_DEV_OUTPUT_PIPE"];

  let inputPipe: string;
  let outputPipe: string;

  if (providedInputPipe && providedOutputPipe) {
    // Use pipes provided by MCP dev manager
    inputPipe = providedInputPipe;
    outputPipe = providedOutputPipe;
    ensureLogger().info("Using provided named pipes", { inputPipe, outputPipe });
  } else {
    // Create new pipes (legacy mode)
    const timestamp = Date.now();
    inputPipe = `${pipesPrefix}-in-${timestamp}`;
    outputPipe = `${pipesPrefix}-out-${timestamp}`;
    ensureLogger().info("Creating new named pipes", { pipesPrefix, timestamp });

    // Create named pipes (FIFOs)
    await createNamedPipe(inputPipe);
    await createNamedPipe(outputPipe);
  }

  ensureLogger().info("Development mode pipes configured", { inputPipe, outputPipe });

  try {
    // Create process info
    const processInfo: DevModeProcessInfo = {
      processId: process.pid,
      startTime: new Date().toISOString(),
      inputPipe,
      outputPipe,
      pipesPrefix,
    };

    // Write pipe info to development directory
    await savePipeInfo(processInfo);

    // Setup cleanup on process exit
    setupCleanupHandlers(processInfo);

    ensureLogger().info("Development mode setup complete", {
      inputPipe,
      outputPipe,
      processId: processInfo.processId,
    });

    return {
      inputPipe,
      outputPipe,
      processInfo,
    };
  } catch (error) {
    ensureLogger().error("Failed to setup development mode", { error });
    throw error;
  }
}

/**
 * Create a named pipe (FIFO)
 */
async function createNamedPipe(pipePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Remove existing pipe if it exists
    try {
      if (fs.existsSync(pipePath)) {
        fs.unlinkSync(pipePath);
      }
    } catch (_error) {
      // Ignore cleanup errors
    }

    // Create named pipe
    const { spawn } = require("node:child_process");
    const mkfifo = spawn("mkfifo", [pipePath]);

    mkfifo.on("close", (code: number) => {
      if (code === 0) {
        ensureLogger().debug("Named pipe created", { pipePath });
        resolve();
      } else {
        reject(new Error(`Failed to create named pipe: ${pipePath} (exit code: ${code})`));
      }
    });

    mkfifo.on("error", (error: Error) => {
      reject(new Error(`Failed to create named pipe: ${pipePath} (${error.message})`));
    });
  });
}

/**
 * Save pipe information to development directory
 */
async function savePipeInfo(processInfo: DevModeProcessInfo): Promise<void> {
  const devDir = path.join(os.homedir(), ".brooklyn", "dev");

  // Ensure dev directory exists
  fs.mkdirSync(devDir, { recursive: true });

  const pipesFile = path.join(devDir, "pipes.json");

  try {
    fs.writeFileSync(pipesFile, JSON.stringify(processInfo, null, 2));
    ensureLogger().debug("Pipe info saved", { file: pipesFile });
  } catch (error) {
    ensureLogger().warn("Failed to save pipe info", { error, file: pipesFile });
  }
}

/**
 * Load pipe information from development directory
 */
export function loadPipeInfo(): DevModeProcessInfo | null {
  const devDir = path.join(os.homedir(), ".brooklyn", "dev");
  const pipesFile = path.join(devDir, "pipes.json");

  try {
    if (fs.existsSync(pipesFile)) {
      const data = fs.readFileSync(pipesFile, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    ensureLogger().warn("Failed to load pipe info", { error, file: pipesFile });
  }

  return null;
}

/**
 * Check if development mode is currently active
 */
export function isDevModeActive(): boolean {
  const pipeInfo = loadPipeInfo();

  if (!pipeInfo) {
    return false;
  }

  // Check if process is still running
  try {
    process.kill(pipeInfo.processId, 0); // Signal 0 just checks if process exists
    return true;
  } catch {
    return false;
  }
}

/**
 * Get current development mode status
 */
export function getDevModeStatus(): {
  active: boolean;
  processInfo?: DevModeProcessInfo;
  pipes?: { input: boolean; output: boolean };
} {
  const processInfo = loadPipeInfo();

  if (!processInfo) {
    return { active: false };
  }

  const active = isDevModeActive();

  const pipes = {
    input: fs.existsSync(processInfo.inputPipe),
    output: fs.existsSync(processInfo.outputPipe),
  };

  return {
    active,
    processInfo,
    pipes,
  };
}

/**
 * Clean up development mode resources
 */
export async function cleanupDevMode(): Promise<void> {
  const pipeInfo = loadPipeInfo();

  if (!pipeInfo) {
    ensureLogger().info("No development mode to clean up");
    return;
  }

  ensureLogger().info("Cleaning up development mode", { processId: pipeInfo.processId });

  // Remove named pipes
  try {
    if (fs.existsSync(pipeInfo.inputPipe)) {
      fs.unlinkSync(pipeInfo.inputPipe);
      ensureLogger().debug("Removed input pipe", { pipe: pipeInfo.inputPipe });
    }

    if (fs.existsSync(pipeInfo.outputPipe)) {
      fs.unlinkSync(pipeInfo.outputPipe);
      ensureLogger().debug("Removed output pipe", { pipe: pipeInfo.outputPipe });
    }
  } catch (error) {
    ensureLogger().warn("Error removing pipes", { error });
  }

  // Remove pipe info file
  try {
    const devDir = path.join(os.homedir(), ".brooklyn", "dev");
    const pipesFile = path.join(devDir, "pipes.json");

    if (fs.existsSync(pipesFile)) {
      fs.unlinkSync(pipesFile);
      ensureLogger().debug("Removed pipe info file", { file: pipesFile });
    }
  } catch (error) {
    ensureLogger().warn("Error removing pipe info file", { error });
  }

  ensureLogger().info("Development mode cleanup complete");
}

/**
 * Setup cleanup handlers for graceful shutdown
 */
function setupCleanupHandlers(_processInfo: DevModeProcessInfo): void {
  const cleanup = () => {
    ensureLogger().info("Process exit detected, cleaning up development mode");
    cleanupDevMode().catch((error) => {
      ensureLogger().error("Error during cleanup", { error });
    });
  };

  // Handle different exit scenarios
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
  process.on("uncaughtException", (error) => {
    ensureLogger().error("Uncaught exception", { error });
    cleanup();
    process.exit(1);
  });
}

/**
 * Test pipe communication
 */
export async function testPipeConnection(): Promise<boolean> {
  const pipeInfo = loadPipeInfo();

  if (!pipeInfo) {
    ensureLogger().error("No development mode pipes found");
    return false;
  }

  try {
    // Test basic pipe existence and permissions
    const inputExists = fs.existsSync(pipeInfo.inputPipe);
    const outputExists = fs.existsSync(pipeInfo.outputPipe);

    ensureLogger().info("Pipe connection test", {
      inputPipe: pipeInfo.inputPipe,
      outputPipe: pipeInfo.outputPipe,
      inputExists,
      outputExists,
    });

    return inputExists && outputExists;
  } catch (error) {
    ensureLogger().error("Pipe connection test failed", { error });
    return false;
  }
}
