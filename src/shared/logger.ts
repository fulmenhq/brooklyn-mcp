/**
 * A structured logging system based on Winston with RFC3339 timestamp format
 *
 * Features:
 * - Configurable log levels
 * - Module-based child loggers
 * - Colorized console output
 * - RFC3339 timestamp format
 * - JSON formatting for structured logging
 * - Stderr support for CLI applications
 * - File logging with rotation
 * - Pino-style API compatibility
 *
 * Based on fulmen-mvp pattern for server-only logging.
 */

import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
// External dependencies
import { type Logger as WinstonLogger, createLogger, format, transports } from "winston";

// Internal modules
import { buildConfig } from "./build-config.js";
import type { ContextLogger, LoggerOptions } from "./logger-types.js";

// Define our log format options
const { combine, timestamp, printf, colorize, json } = format;

// RFC3339 timestamp format (ISO 8601 with timezone)
const timestampFormat = timestamp({
  format: () => new Date().toISOString(),
});

// Customized console format
const consoleFormat = printf(({ level, message, timestamp, module, ...metadata }) => {
  const modulePrefix = module ? `[${module}] ` : "";
  const metaStr = Object.keys(metadata).length > 0 ? ` ${JSON.stringify(metadata)}` : "";

  return `${timestamp} ${level}: ${modulePrefix}${message}${metaStr}`;
});

// Default log directory
const getLogDirectory = (): string => {
  if (process.platform === "win32") {
    return join(homedir(), "AppData", "Local", "fulmen-brooklyn", "logs");
  }
  return join(homedir(), ".local", "share", "fulmen-brooklyn", "logs");
};

// Create the root logger with default settings
let rootLogger = createLogger({
  level: "info",
  format: combine(timestampFormat, json()),
  defaultMeta: { service: buildConfig.serviceName },
  transports: [
    new transports.Console({
      format: combine(colorize(), timestampFormat, consoleFormat),
    }),
  ],
});

/**
 * Initialize the logger with the provided configuration
 *
 * @param options - Logger configuration options
 */
export function initLogger(options: LoggerOptions = {}): void {
  // Set defaults
  const level = options.level || "info";
  const name = options.name || buildConfig.serviceName;
  const useStderr = options.useStderr;
  const logFile = options.logFile;
  const maxSize = options.maxSize || 10 * 1024 * 1024; // 10MB
  const maxFiles = options.maxFiles || 5;

  // Handle Pino-style compatibility options
  let logFormat: ReturnType<typeof combine>;
  if (options.prettyPrint !== undefined) {
    logFormat = options.prettyPrint
      ? combine(timestampFormat, colorize(), consoleFormat)
      : combine(timestampFormat, json());
  } else {
    // Use format option
    switch (options.format) {
      case "pretty":
        logFormat = combine(timestampFormat, colorize(), consoleFormat);
        break;
      case "compact":
        logFormat = combine(
          timestamp({ format: "HH:mm:ss" }),
          printf(({ timestamp, level, message, module }) => {
            const modulePrefix = module ? `[${module}]` : "";
            return `${timestamp} ${level}${modulePrefix}: ${message}`;
          }),
        );
        break;
      default:
        logFormat = combine(timestampFormat, json());
        break;
    }
  }

  // Create transport array
  const transportArray: WinstonLogger["transports"] = [];

  // Console transport
  const consoleTransportOptions: {
    format: ReturnType<typeof format.combine>;
    stream?: NodeJS.WriteStream;
    stderrLevels?: string[];
  } = {
    format: logFormat,
  };

  // When useStderr is true, force all output to stderr
  if (useStderr) {
    consoleTransportOptions.stream = process.stderr;
  } else {
    // Default behavior: errors and warnings to stderr, others to stdout
    consoleTransportOptions.stderrLevels = ["error", "warn"];
  }

  transportArray.push(new transports.Console(consoleTransportOptions));

  // File transport (if specified)
  if (logFile) {
    const logDir = getLogDirectory();
    mkdirSync(logDir, { recursive: true });

    const logPath = join(logDir, logFile);

    transportArray.push(
      new transports.File({
        filename: logPath,
        format: combine(timestampFormat, json()),
        maxsize: maxSize,
        maxFiles: maxFiles,
        tailable: true,
      }),
    );
  }

  rootLogger = createLogger({
    level,
    format: combine(timestampFormat, json()),
    defaultMeta: { service: name },
    transports: transportArray,
  });

  rootLogger.debug("Logger initialized", {
    level,
    format: options.format || "default",
    useStderr,
    logFile,
    logDir: logFile ? getLogDirectory() : undefined,
  });
}

/**
 * Create a context logger with Winston child logger functionality
 *
 * @param context - The context/module name for the logger
 * @returns A context logger instance
 */
export function createContextLogger(context: string): ContextLogger {
  const childLogger = rootLogger.child({ module: context });

  return {
    trace: (message: string, meta?: Record<string, unknown>) => {
      childLogger.debug(message, meta); // Winston doesn't have trace, map to debug
    },
    debug: (message: string, meta?: Record<string, unknown>) => {
      childLogger.debug(message, meta);
    },
    info: (message: string, meta?: Record<string, unknown>) => {
      childLogger.info(message, meta);
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      childLogger.warn(message, meta);
    },
    error: (message: string, meta?: Record<string, unknown>) => {
      childLogger.error(message, meta);
    },
    fatal: (message: string, meta?: Record<string, unknown>) => {
      childLogger.error(message, meta); // Winston doesn't have fatal, map to error
    },
  };
}

/**
 * Get a child logger for a specific module
 *
 * Alternative API to support different naming conventions.
 *
 * @param module - The module name for the logger
 * @returns A context logger instance
 */
export function getLogger(module: string): ContextLogger {
  return createContextLogger(module);
}

/**
 * Set the log level dynamically
 *
 * @param level - The new log level
 */
export function setLogLevel(level: string): void {
  rootLogger.level = level;
}

/**
 * Get the current root logger instance
 *
 * @returns The Winston logger instance
 */
export function getRootLogger(): WinstonLogger {
  return rootLogger;
}

/**
 * Reset logger to default configuration
 *
 * Useful for testing or reinitializing the logger.
 */
export function resetLogger(): void {
  initLogger();
}

// Export the root logger as default
export default rootLogger;

// Export the main logger instance for backwards compatibility
export const logger: ContextLogger = createContextLogger("brooklyn");
