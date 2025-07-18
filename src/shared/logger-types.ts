/**
 * Logger types for Brooklyn MCP server
 */

export interface LoggerOptions {
  /** Minimum log level to output */
  level?: "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "silent";
  /** Log format (json, pretty, compact) */
  format?: "json" | "pretty" | "compact";
  /** Custom output destination */
  destination?: NodeJS.WritableStream;
  /** Whether to include timestamps */
  timestamp?: boolean;
  /** Logger name (Pino-style compatibility) */
  name?: string;
  /** Pretty print option (Pino-style compatibility) */
  prettyPrint?: boolean;
  /** Use stderr instead of stdout for log output */
  useStderr?: boolean;
  /** Log file path for file logging */
  logFile?: string;
  /** Maximum log file size in bytes */
  maxSize?: number;
  /** Maximum number of log files to retain */
  maxFiles?: number;
}

export interface ContextLogger {
  trace(msg: string, obj?: Record<string, unknown>): void;
  debug(msg: string, obj?: Record<string, unknown>): void;
  info(msg: string, obj?: Record<string, unknown>): void;
  warn(msg: string, obj?: Record<string, unknown>): void;
  error(msg: string, obj?: Record<string, unknown>): void;
  fatal(msg: string, obj?: Record<string, unknown>): void;
}
