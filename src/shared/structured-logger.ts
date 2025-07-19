/**
 * Structured logging system for Brooklyn
 * Supports both pretty and JSON output with correlation IDs
 */

import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { BrooklynConfig } from "../core/config.js";

/**
 * Log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  level: string;
  logger: string;
  message: string;
  correlationId?: string;
  transport?: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level: LogLevel;
  format: "pretty" | "json";
  outputs: LogOutput[];
  correlationId?: string;
}

/**
 * Log output configuration
 */
export interface LogOutput {
  type: "console" | "file";
  target?: "stdout" | "stderr" | string; // stdout/stderr for console, file path for file
  format?: "pretty" | "json";
  level?: LogLevel;
}

/**
 * Context for log entries
 */
export interface LogContext {
  correlationId?: string;
  transport?: string;
  [key: string]: unknown;
}

/**
 * Structured logger implementation
 */
export class StructuredLogger {
  private readonly name: string;
  private readonly config: LoggerConfig;
  private fileStreams = new Map<string, NodeJS.WritableStream>();
  private globalContext: LogContext = {};

  constructor(name: string, config: LoggerConfig) {
    this.name = name;
    this.config = config;

    // Initialize file streams
    this.initializeFileOutputs();
  }

  /**
   * Set global context for all log entries
   */
  setGlobalContext(context: LogContext): void {
    this.globalContext = { ...this.globalContext, ...context };
  }

  /**
   * Create child logger with additional context
   */
  child(context: LogContext): StructuredLogger {
    const childConfig = {
      ...this.config,
      correlationId: context.correlationId || this.config.correlationId,
    };

    const child = new StructuredLogger(this.name, childConfig);
    child.setGlobalContext({ ...this.globalContext, ...context });

    return child;
  }

  /**
   * Debug level logging
   */
  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Info level logging
   */
  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Warning level logging
   */
  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Error level logging
   */
  error(message: string, context?: LogContext): void {
    this.log(LogLevel.ERROR, message, context);
  }

  /**
   * Error logging with Error object
   */
  errorWithException(message: string, error: Error, context?: LogContext): void {
    const errorContext = {
      ...context,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    };

    this.log(LogLevel.ERROR, message, errorContext);
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, context?: LogContext): void {
    // Check if log level is enabled
    if (level < this.config.level) {
      return;
    }

    // Create log entry
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      logger: this.name,
      message,
      correlationId: context?.correlationId || this.config.correlationId,
      transport: context?.transport || this.globalContext.transport,
      context: this.mergeContext(context),
    };

    // Handle error object separately
    if (context?.["error"]) {
      entry["error"] = context["error"] as any;
      delete entry.context?.["error"];
    }

    // Output to all configured outputs
    for (const output of this.config.outputs) {
      this.writeToOutput(entry, output);
    }
  }

  /**
   * Merge context objects
   */
  private mergeContext(context?: LogContext): Record<string, unknown> | undefined {
    const merged = { ...this.globalContext, ...context };

    // Remove special fields that have dedicated properties
    merged.correlationId = undefined;
    merged.transport = undefined;
    merged["error"] = undefined;

    return Object.keys(merged).length > 0 ? merged : undefined;
  }

  /**
   * Write log entry to specific output
   */
  private writeToOutput(entry: LogEntry, output: LogOutput): void {
    // Check output-specific log level
    if (
      output.level !== undefined &&
      LogLevel[entry.level as keyof typeof LogLevel] < output.level
    ) {
      return;
    }

    const format = output.format || this.config.format;
    const formatted = this.formatEntry(entry, format);

    if (output.type === "console") {
      this.writeToConsole(formatted, output.target as "stdout" | "stderr" | undefined, entry.level);
    } else if (output.type === "file") {
      this.writeToFile(formatted, output.target as string);
    }
  }

  /**
   * Format log entry
   */
  private formatEntry(entry: LogEntry, format: "pretty" | "json"): string {
    if (format === "json") {
      return `${JSON.stringify(entry)}\n`;
    }

    // Pretty format
    const timestamp = entry.timestamp.replace("T", " ").replace("Z", "");
    const level = entry.level.padEnd(5);
    const logger = entry.logger.padEnd(20);

    let formatted = `${timestamp} [${level}] [${logger}] ${entry.message}`;

    // Add correlation ID if present
    if (entry.correlationId) {
      formatted += ` [${entry.correlationId}]`;
    }

    // Add transport if present
    if (entry.transport) {
      formatted += ` (${entry.transport})`;
    }

    // Add context if present
    if (entry.context && Object.keys(entry.context).length > 0) {
      formatted += ` ${JSON.stringify(entry.context)}`;
    }

    // Add error if present
    if (entry.error) {
      formatted += `\nError: ${entry.error.name}: ${entry.error.message}`;
      if (entry.error.stack) {
        formatted += `\nStack: ${entry.error.stack}`;
      }
    }

    return `${formatted}\n`;
  }

  /**
   * Write to console output
   */
  private writeToConsole(
    formatted: string,
    target: "stdout" | "stderr" | undefined,
    level: string,
  ): void {
    // For MCP mode, NEVER write to stdout as it corrupts the protocol
    const isMCPMode = this.globalContext.transport === "mcp-stdio";

    if (isMCPMode && target === "stdout") {
      // Redirect stdout to stderr in MCP mode
      process.stderr.write(formatted);
      return;
    }

    // Default target based on log level
    const defaultTarget = level === "ERROR" || level === "WARN" ? "stderr" : "stdout";
    const actualTarget = target || defaultTarget;

    if (actualTarget === "stderr") {
      process.stderr.write(formatted);
    } else {
      process.stdout.write(formatted);
    }
  }

  /**
   * Write to file output
   */
  private writeToFile(formatted: string, filePath: string): void {
    let stream = this.fileStreams.get(filePath);

    if (!stream) {
      // Ensure directory exists
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Create write stream
      stream = createWriteStream(filePath, { flags: "a" });
      this.fileStreams.set(filePath, stream);
    }

    stream.write(formatted);
  }

  /**
   * Initialize file outputs
   */
  private initializeFileOutputs(): void {
    for (const output of this.config.outputs) {
      if (output.type === "file" && output.target) {
        // Pre-create file streams to catch errors early
        this.writeToFile("", output.target);
      }
    }
  }

  /**
   * Close all file streams
   */
  close(): void {
    for (const [_filePath, stream] of this.fileStreams) {
      if (stream && typeof stream.end === "function") {
        stream.end();
      }
    }
    this.fileStreams.clear();
  }
}

/**
 * Create logger configuration from Brooklyn config
 */
export function createLoggerConfig(config: BrooklynConfig, transport?: string): LoggerConfig {
  const level =
    LogLevel[config.logging.level.toUpperCase() as keyof typeof LogLevel] ?? LogLevel.INFO;

  const outputs: LogOutput[] = [];

  // Console output (stderr for MCP mode to avoid stdout contamination)
  const isMCPMode = transport === "mcp-stdio";
  outputs.push({
    type: "console",
    target: isMCPMode ? "stderr" : "stdout",
    format: config.logging.format,
    level: level,
  });

  // File output if specified
  if (config.logging.file) {
    outputs.push({
      type: "file",
      target: config.logging.file,
      format: "json", // Always use JSON for file logging
      level: LogLevel.DEBUG, // File logs capture everything
    });
  }

  return {
    level,
    format: config.logging.format,
    outputs,
  };
}

/**
 * Global logger registry
 */
class LoggerRegistry {
  private loggers = new Map<string, StructuredLogger>();
  private defaultConfig: LoggerConfig | null = null;

  /**
   * Initialize logger registry with default configuration
   */
  initialize(config: BrooklynConfig): void {
    this.defaultConfig = createLoggerConfig(config);
  }

  /**
   * Get or create logger
   */
  getLogger(name: string, transport?: string): StructuredLogger {
    const key = transport ? `${name}:${transport}` : name;

    let logger = this.loggers.get(key);
    if (!logger) {
      if (!this.defaultConfig) {
        throw new Error("Logger registry not initialized. Call initialize() first.");
      }

      const config = transport
        ? createLoggerConfig({ logging: this.defaultConfig } as any, transport)
        : this.defaultConfig;

      logger = new StructuredLogger(name, config);

      if (transport) {
        logger.setGlobalContext({ transport });
      }

      this.loggers.set(key, logger);
    }

    return logger;
  }

  /**
   * Close all loggers
   */
  closeAll(): void {
    for (const logger of this.loggers.values()) {
      logger.close();
    }
    this.loggers.clear();
  }
}

/**
 * Global logger registry instance
 */
export const loggerRegistry = new LoggerRegistry();

/**
 * Initialize logging system
 */
export function initializeLogging(config: BrooklynConfig): void {
  loggerRegistry.initialize(config);
}

/**
 * Get logger instance
 */
export function getLogger(name: string, transport?: string): StructuredLogger {
  return loggerRegistry.getLogger(name, transport);
}

/**
 * Close all loggers
 */
export function closeAllLoggers(): void {
  loggerRegistry.closeAll();
}
