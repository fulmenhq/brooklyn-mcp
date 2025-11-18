/**
 * Pino-based logging system for Brooklyn
 * Simple, reliable, no initialization issues
 * Supports file-based logging for MCP mode to avoid STDERR contamination
 */

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { LoggerOptions, Logger as PinoLogger } from "pino";
import pino from "pino";
import type { BrooklynConfig } from "../core/config.js";

/**
 * Brooklyn logger instance type
 */
export type Logger = PinoLogger;

/**
 * Global configuration for logging behavior
 *
 * CRITICAL MCP BEHAVIOR:
 * 1. The logger starts COMPLETELY SILENT (no stderr, no stdout) until initialized
 * 2. This prevents ANY output before we know if we're in MCP mode
 * 3. MCP protocol requires PURE JSON-RPC on stdout - ANY other output breaks it
 * 4. The server will NOT respond until it receives a valid MCP initialize request
 */
const globalConfig = {
  isMCPMode: false,
  isInitialized: false, // Track initialization state
  logFile: null as string | null,
  mcpLogPath: null as string | null,
  allowStderr: false, // Environment override for STDERR in MCP mode
  silentUntilInitialized: true, // Always start silent to prevent stdout contamination
};

/**
 * Create Brooklyn log directory structure
 */
async function ensureBrooklynLogDir(): Promise<string> {
  const baseDir = join(homedir(), ".brooklyn", "logs");

  try {
    if (!existsSync(baseDir)) {
      await mkdir(baseDir, { recursive: true, mode: 0o700 });
    }
    return baseDir;
  } catch (_error) {
    // Fallback to temp directory if home dir fails
    const fallbackDir = join(tmpdir(), "brooklyn-logs");
    try {
      if (!existsSync(fallbackDir)) {
        await mkdir(fallbackDir, { recursive: true, mode: 0o700 });
      }
      return fallbackDir;
    } catch {
      // Final fallback - use temp dir directly
      return tmpdir();
    }
  }
}

/**
 * Clean up old log files (keep last 10 files)
 */
async function cleanupOldLogs(logDir: string): Promise<void> {
  try {
    const { readdir, stat, unlink } = await import("node:fs/promises");
    const files = await readdir(logDir);

    const mcpLogs = files
      .filter((f) => f.startsWith("brooklyn-mcp-") && f.endsWith(".log"))
      .map((f) => ({ name: f, path: join(logDir, f) }));

    if (mcpLogs.length <= 10) return;

    // Get file stats and sort by creation time
    const filesWithStats = await Promise.all(
      mcpLogs.map(async (f) => ({
        ...f,
        stats: await stat(f.path),
      })),
    );

    const sorted = filesWithStats
      .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime())
      .slice(10); // Keep newest 10, delete the rest

    await Promise.all(sorted.map((f) => unlink(f.path).catch(() => {})));
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Get transport identifier for log filename
 */
function getTransportIdentifier(): string {
  // Check for dev mode first
  if (process.env["BROOKLYN_DEV_MODE"] === "true") return "dev";

  // Check global config for MCP mode
  if (globalConfig.isMCPMode) {
    // Check if this is dev-mcp mode
    if (globalConfig.mcpLogPath?.includes("dev")) return "dev";
    return "stdio";
  }

  // Check for HTTP mode environment variables
  if (process.env["BROOKLYN_HTTP_ENABLED"] === "true") return "http";

  // Default to stdio for MCP
  return "stdio";
}

/**
 * Create human-readable log filename with transport and UTC timestamp
 * Format: brooklyn-mcp-<transport>-<yyyymmdd>-<hhmmss>-<ms>.log
 * Example: brooklyn-mcp-stdio-20250813-143022-347.log
 * Note: Uses UTC to ensure consistency across timezones
 */
function createLogFilename(transport?: string): string {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
  const timeStr = date.toISOString().slice(11, 19).replace(/:/g, "");
  const ms = date.getUTCMilliseconds().toString().padStart(3, "0");
  const transportId = transport || getTransportIdentifier();

  return `brooklyn-mcp-${transportId}-${dateStr}-${timeStr}-${ms}.log`;
}

/**
 * Create MCP log file path
 */
async function createMCPLogPath(): Promise<string | null> {
  try {
    const logDir = await ensureBrooklynLogDir();
    await cleanupOldLogs(logDir);

    const filename = createLogFilename();
    return join(logDir, filename);
  } catch {
    return null;
  }
}

/**
 * Create a write stream that protects stdout in MCP mode
 *
 * CRITICAL BUFFERING BEHAVIOR:
 * - Logs are DISCARDED (not buffered) while silentUntilInitialized is true
 * - This prevents memory growth during initialization
 * - Once initialized, logs go to stderr (non-MCP) or file (MCP mode)
 * - In MCP mode, stdout is NEVER used for logs
 */
function createSafeStream() {
  return {
    write(msg: string) {
      // CRITICAL: Stay completely silent until initialized
      if (globalConfig.silentUntilInitialized && !globalConfig.isInitialized) {
        // Do nothing - logs are discarded, not buffered
        // This prevents any output before transport mode is determined
        return;
      }

      // In MCP mode, behavior depends on configuration
      if (globalConfig.isMCPMode) {
        // Check environment override for STDERR in MCP mode
        if (globalConfig.allowStderr) {
          process.stderr.write(msg);
        }
        // Otherwise, do nothing - file logging handles all output
      } else {
        // In non-MCP mode, use stderr for consistency
        // This avoids any accidental stdout pollution
        process.stderr.write(msg);
      }
    },
  };
}

// File transport will be implemented if needed
// For now, we keep it simple with stderr only
/**
 * Convert Brooklyn log level to Pino level
 */
function getPinoLevel(level: string): string {
  const levelMap: Record<string, string> = {
    debug: "debug",
    info: "info",
    warn: "warn",
    error: "error",
  };
  return levelMap[level.toLowerCase()] || "info";
}

/**
 * Configure MCP file logging
 */
async function configureMCPFileLogging(): Promise<void> {
  if (!globalConfig.mcpLogPath) return;

  // Create new root logger with file target for MCP mode
  const targets: Array<{ level: string; target: string; options: Record<string, unknown> }> = [
    {
      level: "info",
      target: "pino/file",
      options: {
        destination: globalConfig.mcpLogPath,
        sync: false, // Async for better performance
        mkdir: true,
      },
    },
  ];

  // In test mode with BROOKLYN_MCP_STDERR, output to stderr for purity tests
  if (process.env.NODE_ENV === "test" && globalConfig.allowStderr) {
    targets.push({
      level: "info",
      target: "pino/file",
      options: { destination: 2 },
    });
  } else if (globalConfig.allowStderr) {
    targets.push({
      level: "error",
      target: "pino/file",
      options: { destination: 2 },
    });
  }

  // Use multistream for MCP mode
  const transport = pino.transport({
    targets,
  });

  // Replace global logger instance
  const newLogger = pino(
    {
      level: "info",
      serializers: {
        err: pino.stdSerializers.err,
        error: pino.stdSerializers.err,
      },
    },
    transport,
  );

  // Update the root logger reference
  Object.setPrototypeOf(rootLogger, Object.getPrototypeOf(newLogger));
  Object.assign(rootLogger, newLogger);

  // Clear logger cache to force recreation with new config
  loggerCache.clear();
}

/**
 * Create Pino logger options from Brooklyn config
 */
function createPinoOptions(config?: Partial<BrooklynConfig>): LoggerOptions {
  const level = config?.logging?.level || "info";
  const format = config?.logging?.format || "json";

  const options: LoggerOptions = {
    level: getPinoLevel(level),
    // Use custom serializers to handle errors properly
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
  };

  // In MCP mode, don't use pretty printing or transports
  // File logging is handled separately
  if (!globalConfig.isMCPMode) {
    // Pretty print for development (non-MCP mode only)
    if (format === "pretty" && process.env["NODE_ENV"] !== "production") {
      options.transport = {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      };
    }
  }

  return options;
}

/**
 * Root logger instance - created immediately, no initialization needed
 */
const rootLogger = pino(createPinoOptions(), createSafeStream());

/**
 * Logger cache for child loggers
 */
const loggerCache = new Map<string, Logger>();

/**
 * Initialize logging configuration
 * This is optional - logging works without it
 */
export async function initializeLogging(config: BrooklynConfig): Promise<void> {
  // Update global config
  globalConfig.logFile = config.logging.file || null;
  globalConfig.allowStderr = process.env["BROOKLYN_MCP_STDERR"] === "true";

  // Set up MCP file logging if in MCP mode
  if (globalConfig.isMCPMode) {
    globalConfig.mcpLogPath = await createMCPLogPath();
  }

  // Recreate root logger with new config
  const options = createPinoOptions(config);

  // Update root logger level
  rootLogger.level = options.level || "info";

  // Mark as initialized
  globalConfig.isInitialized = true;
  globalConfig.silentUntilInitialized = false;
}

/**
 * Set global transport mode (for MCP detection)
 * CRITICAL: This must be called BEFORE any logging occurs
 */
export async function setGlobalTransport(transport: string): Promise<void> {
  const wasMCP = globalConfig.isMCPMode;
  globalConfig.isMCPMode = transport === "mcp-stdio" || transport === "dev-mcp";

  // If switching to MCP mode, set up file logging
  if (globalConfig.isMCPMode && !wasMCP) {
    try {
      globalConfig.mcpLogPath = await createMCPLogPath();
      globalConfig.allowStderr = process.env["BROOKLYN_MCP_STDERR"] === "true";

      // Recreate root logger with file target if available
      if (globalConfig.mcpLogPath) {
        await configureMCPFileLogging();
      }
    } catch (_error) {
      // Silently handle errors - we can't log them yet!
      // Store the error for later reporting
      globalConfig.mcpLogPath = null;
    }
  }

  // Mark as initialized once transport is set
  globalConfig.isInitialized = true;
  globalConfig.silentUntilInitialized = false;
}

/**
 * Get current MCP log file path (for tools integration)
 */
export function getMCPLogPath(): string | null {
  return globalConfig.mcpLogPath;
}

/**
 * Get logger instance - always returns a working logger
 * No initialization required, no lazy patterns needed
 */
export function getLogger(name: string): Logger {
  // Check cache first
  let logger = loggerCache.get(name);
  if (logger) {
    return logger;
  }

  // Create child logger with module name
  logger = rootLogger.child({ module: name });
  loggerCache.set(name, logger);

  return logger;
}

/**
 * Check if logging is initialized (for compatibility)
 * Always returns true with Pino
 */
export function isLoggingInitialized(): boolean {
  return true;
}

/**
 * Close all loggers (for compatibility)
 * Pino handles this automatically
 */
export function closeAllLoggers(): void {
  // Pino handles cleanup automatically
  // Clear cache for good measure
  loggerCache.clear();
}

/**
 * Create a logger with correlation ID
 */
export function getLoggerWithContext(name: string, context: Record<string, unknown>): Logger {
  const baseLogger = getLogger(name);
  return baseLogger.child(context);
}

/**
 * Compatibility layer for structured-logger API
 */
export class StructuredLogger {
  private logger: Logger;

  constructor(name: string) {
    this.logger = getLogger(name);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.logger.debug(context || {}, message);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.logger.info(context || {}, message);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.logger.warn(context || {}, message);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.logger.error(context || {}, message);
  }

  errorWithException(message: string, error: Error, context?: Record<string, unknown>): void {
    this.logger.error({ ...context, err: error }, message);
  }
}
