# Brooklyn Logging and Telemetry Guide

## 🚨 CRITICAL: Logger Initialization DOs and DON'Ts

### ❌ DON'T - Module-Level Logger Initialization (WILL BREAK BUNDLED APPS)

```typescript
// NEVER DO THIS - Module-level logger
import { getLogger } from "../shared/structured-logger.js";

const logger = getLogger("my-module"); // 💥 BOOM! Executes during module load

export class MyClass {
  constructor() {
    logger.info("Initialized"); // 💥 Logger registry not initialized!
  }
}
```

### ✅ DO - Lazy Logger Initialization Pattern

```typescript
// ALWAYS DO THIS - Lazy initialization
import { getLogger } from "../shared/structured-logger.js";

let logger: ReturnType<typeof getLogger> | null = null;

function ensureLogger() {
  if (!logger) {
    logger = getLogger("my-module");
  }
  return logger;
}

export class MyClass {
  constructor() {
    // Defer logging or skip entirely in constructors
  }

  someMethod() {
    ensureLogger().info("Method called"); // ✅ Safe - called after init
  }
}
```

### 🎯 Key Rules to Prevent "Logger registry not initialized" Errors

1. **NEVER** call `getLogger()` at module level
2. **NEVER** log in constructors without lazy initialization
3. **ALWAYS** use lazy initialization pattern for loggers
4. **ALWAYS** initialize logging before importing modules in CLI entry points
5. **ALWAYS** add console.error fallbacks in catch blocks
6. **DEFER** all logging during initialization phases

## Introduction

Brooklyn uses a unified structured logging system to provide consistent, configurable logging across the application. This guide covers how to use the logging system, configure it, and best practices for developers. Telemetry features are planned for future releases to enable metrics collection and monitoring; currently, the focus is on logging.

## Logger Architecture

Brooklyn uses a **Structured Logger** (`src/shared/structured-logger.ts`) for all logging needs:

- **Import**: `import { getLogger } from "../shared/structured-logger.js"`
- **Features**: Built-in MCP mode detection, automatic stderr routing, transport-aware logging
- **MCP Protocol Compliance**: Ensures zero stdout contamination for pure JSON-RPC protocol

**Migration Note**: Legacy Winston logger removed in v1.1.6; all code now uses structured-logger.ts.

The logging system supports:

- Multiple log levels (debug, info, warn, error).
- Structured output (JSON or pretty-printed).
- Output to console (stderr to avoid stdio interference) and files with rotation.
- Context-aware child loggers for modules.

This setup ensures logs do not interfere with MCP stdio communications or local dev processes.

## CLI Entry Point Initialization

For CLI applications that will be bundled, the initialization order is CRITICAL:

```typescript
// ✅ CORRECT ORDER for CLI entry points (e.g., brooklyn.ts)

// 1. Version/constants at top
const VERSION = "1.1.8";

// 2. Import logging functions FIRST
import { getLogger, initializeLogging } from "../shared/structured-logger.js";

// 3. Create minimal config and initialize logging BEFORE other imports
const minimalConfig = {
  serviceName: "brooklyn-mcp-server",
  version: VERSION,
  logging: { level: "info", format: "json" },
  // ... other required fields
};

// Initialize logging NOW before any modules that might use it
try {
  initializeLogging(minimalConfig);
} catch (error) {
  console.error("Failed to initialize logging:", error);
  process.exit(1);
}

// 4. NOW import other modules that might use logging
import { BrooklynEngine } from "../core/brooklyn-engine.js";
import { loadConfig, enableConfigLogger } from "../core/config.js";

// 5. Enable conditional loggers after initialization
enableConfigLogger();
```

## Configuration

Logging is initialized via `initializeLogging` with options from `BrooklynConfig`. Key options include:

- **level**: Minimum log level ("debug", "info", "warn", "error").
- **format**: Output format ("json", "pretty", "compact").
- **useStderr**: Forces all console output to stderr (enabled by default for MCP compatibility).
- **logFile**: Path for file logging (enables rotation with maxSize and maxFiles).
- **maxSize** / **maxFiles**: File rotation limits (default: 10MB, 5 files).

Example initialization:

```typescript
import { initializeLogging } from "../shared/structured-logger.js";

// Initialize with Brooklyn config
const brooklynConfig = {
  serviceName: "brooklyn-mcp-server",
  version: "1.1.6",
  environment: "production" as const,
  teamId: "default",
  logging: {
    level: "debug" as const,
    format: "pretty" as const,
    file: "brooklyn.log",
    maxSize: "10MB",
    maxFiles: 5,
  },
  // Other config sections...
  transports: {
    mcp: { enabled: true },
    http: { enabled: false, port: 3000, host: "localhost", cors: true, rateLimiting: false },
  },
  browsers: { maxInstances: 10, defaultType: "chromium" as const, headless: true, timeout: 30000 },
  security: { allowedDomains: ["*"], rateLimit: { requests: 100, windowMs: 60000 } },
  plugins: { directory: "./plugins", autoLoad: false, allowUserPlugins: false },
  paths: {
    config: "~/.brooklyn",
    logs: "~/.brooklyn/logs",
    plugins: "~/.brooklyn/plugins",
    browsers: "~/.brooklyn/browsers",
    pids: "~/.brooklyn/pids",
  },
};

initializeLogging(brooklynConfig);
```

Logs are written to stderr for console and a configurable file path for persistent storage.

## Using the Logger

### Getting a Logger Instance

⚠️ **WARNING**: Never call `getLogger` at module level! Use lazy initialization:

```typescript
import { getLogger } from "../shared/structured-logger.js";

// ❌ WRONG - Module-level logger
// const logger = getLogger("my-module");  // DON'T DO THIS!

// ✅ CORRECT - Lazy initialization pattern
let logger: ReturnType<typeof getLogger> | null = null;

function ensureLogger() {
  if (!logger) {
    logger = getLogger("my-module");
  }
  return logger;
}

// Usage in your code
function someFunction() {
  ensureLogger().info("This is safe!");
}
```

This creates a child logger with the module name for context, but only when first used.

### Logging Methods

- `logger.trace(msg, meta?)`: For fine-grained tracing (maps to debug).
- `logger.debug(msg, meta?)`: Detailed debug info.
- `logger.info(msg, meta?)`: General information.
- `logger.warn(msg, meta?)`: Warnings.
- `logger.error(msg, meta?)`: Errors.
- `logger.fatal(msg, meta?)`: Critical errors (maps to error).

`meta` is an optional object for structured data (e.g., `{ userId: 123, errorCode: "AUTH_FAIL" }`).

Example:

```typescript
logger.info("User logged in", { userId: 123, sessionId: "abc456" });
logger.error("Database connection failed", { error: err.message });
```

### Structured Logging

All logs include:

- Timestamp (RFC3339 format).
- Level.
- Module name.
- Message.
- Optional metadata (JSON-serialized).

In "json" format, output is a single JSON object per line.

## MCP Mode Behavior

When the logger detects MCP mode (transport === "mcp-stdio"):

- ALL output automatically redirected to stderr
- stdout is reserved for MCP protocol messages
- This prevents corruption of MCP communication

The structured logger automatically detects MCP mode through transport context.

## Environment-Specific Logging

### Development Mode

Brooklyn uses structured logging consistently across all modes, with output directed to stderr to maintain stdio purity for MCP protocol:

```typescript
// Development mode uses structured logger with stderr output
this.logger.info("🚀 Starting Brooklyn MCP development mode");
this.logger.info("📊 Brooklyn MCP Development Mode Status");
this.logger.warn("⚠️ Found orphaned processes");
```

**Key Rule**: All logging goes through the structured logger to stderr. This maintains consistency and prevents MCP protocol corruption.

### Production Mode

```typescript
// Structured data for log aggregation
logger.info("Brooklyn MCP development mode started", {
  mode: "development",
  processId: brooklynProcess.pid,
  inputPipe,
  outputPipe,
});
```

## Error Handling Patterns

### With Error Objects

```typescript
try {
  await riskyOperation();
} catch (error) {
  logger.error("Operation failed", {
    operation: "createNamedPipe",
    error: error instanceof Error ? error.message : String(error),
    context: { inputPipe, outputPipe },
  });
}
```

### With Stack Traces (Structured Logger)

```typescript
logger.errorWithException("Critical failure", error, {
  correlationId: "mcp-dev-123",
});
```

## Testing with Loggers

When writing tests, mock the logger completely:

```typescript
// Mock logger
vi.mock("../shared/logger.js", () => ({
  getLogger: vi.fn(() => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  })),
}));
```

This prevents test output pollution and ensures tests pass regardless of log level.

## Best Practices

### 🔴 Critical Rules (Prevent Total Failure)

1. **Lazy Initialization**: ALWAYS use lazy logger pattern - NEVER call `getLogger()` at module level
2. **Constructor Logging**: DEFER or AVOID logging in constructors
3. **CLI Entry Points**: Initialize logging BEFORE importing other modules
4. **Error Fallbacks**: ALWAYS add `console.error` fallbacks in catch blocks
5. **Bundling Safety**: TEST bundled binaries after any logger changes

### 🟡 Standard Best Practices

- **Use Context**: Always use `getLogger("module-name")` for traceable logs.
- **Structured Data**: Prefer metadata objects over string concatenation for better querying.
- **Levels**: Use debug for dev details, info for normal ops, warn/error for issues.
- **MCP/Dev Compatibility**: Logs go to stderr—do not use console.log() directly.
- **Performance**: Avoid heavy logging in hot paths; use debug level for verbose output.
- **Error Handling**: Use `errorWithException` in structured-logger for stack traces.
- **Cleanup**: Call `closeAllLoggers()` on shutdown to flush file streams.
- **Logger Choice**: Use Structured Logger for new code, Winston Logger for legacy compatibility.

### 📋 Code Review Checklist

- [ ] No module-level `getLogger()` calls
- [ ] Constructor logging uses lazy pattern or is deferred
- [ ] CLI entry points initialize logging first
- [ ] Error handlers have console.error fallbacks
- [ ] Bundled binary tested with logger changes

## Telemetry

Telemetry is not yet implemented but is planned for Phase 2. It will include:

- Metrics collection (e.g., request counts, latencies).
- Integration with tools like Prometheus or StatsD.
- Configurable endpoints for exporting metrics.

For now, use logging for observability. Backlog items include integrating OpenTelemetry for traces and metrics.

## Troubleshooting

### Common Issues

#### 🚨 "Logger registry not initialized" Error

**Symptoms**:

- Error appears immediately on CLI startup
- Affects ALL commands (status, mcp start, etc.)
- Stack trace points to bundled code

**Causes**:

- Module-level `getLogger()` calls
- Constructor logging without lazy initialization
- Wrong import order in CLI entry points

**Fix**:

1. Find the module in the stack trace
2. Apply lazy logger pattern
3. Remove/defer constructor logging
4. Rebuild and test bundled binary

**Example Fix**:

```typescript
// Before (BROKEN)
const logger = getLogger("my-module");

// After (FIXED)
let logger: ReturnType<typeof getLogger> | null = null;
function ensureLogger() {
  if (!logger) {
    logger = getLogger("my-module");
  }
  return logger;
}
```

#### Other Common Issues

- **No logs appearing**: Check initialization and log level configuration
- **MCP protocol corruption**: Ensure no direct `console.log()` usage; all output must go to stderr
- **File rotation not working**: Verify directory permissions and maxSize/maxFiles settings
- **Tests failing with logger errors**: Ensure complete logger mocking in test files

### Debug Commands

```bash
# Check logger initialization
BROOKLYN_LOG_LEVEL=debug bun run test

# Verify MCP mode detection
BROOKLYN_DEV_VERBOSE=true bun run mcp-dev:start
```

### Performance Tips

- Use debug level for verbose output in development only
- Avoid logging in tight loops or hot paths
- Consider log level filtering for production deployments

For questions, refer to `src/shared/logger.ts`, `src/shared/structured-logger.ts`, or contact the architecture team.

## Development Mode Enhancements (v1.2.1)

### Process Cleanup Improvements

The development mode now includes comprehensive process cleanup:

```typescript
// Enhanced cleanup in MCPDevManager
async cleanup(): Promise<void> {
  // 1. Terminate managed process
  if (info && this.isProcessRunning(info.processId)) {
    process.kill(info.processId, "SIGTERM");
    // Wait for graceful shutdown, then SIGKILL if needed
  }

  // 2. Find and terminate orphaned processes
  const orphaned = await this.findOrphanedProcesses();
  for (const pid of orphanedPids) {
    process.kill(Number(pid), "SIGTERM");
  }

  // 3. Clean up pipes and files
  this.cleanupPipes(info);
  this.removeProcessInfo();
}
```

### Status Command Enhancements

The `dev-status` command now detects orphaned processes:

```typescript
// Shows orphaned processes and cleanup instructions
async status(): Promise<void> {
  // Display current status
  console.info("📊 Brooklyn MCP Development Mode Status");

  // Scan for orphaned processes
  const orphaned = await this.findOrphanedProcesses();
  if (orphaned.length > 0) {
    console.warn(`⚠️ Found ${orphaned.length} orphaned processes`);
    console.info("💡 Run 'brooklyn mcp dev-cleanup' to terminate them");
  }
}
```

## Related Documentation

- [`local_development_sop.md`](./local_development_sop.md) - Critical logger initialization section
- [`.plans/active/paris/logger-initialization-fix-summary.md`](../../.plans/active/paris/logger-initialization-fix-summary.md) - v1.1.8 fix details

— Brooklyn Development Team  
Last Updated: July 24, 2025  
⚠️ **Critical Update**: Added logger initialization patterns to prevent bundling failures
🆕 **v1.2.1 Update**: Enhanced dev mode with proper process cleanup and orphan detection
