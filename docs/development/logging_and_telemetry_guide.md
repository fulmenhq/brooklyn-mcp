# Brooklyn Logging and Telemetry Guide

## Introduction

Brooklyn uses a dual logging system to provide consistent, configurable logging across the application. This guide covers how to use the logging system, configure it, and best practices for developers. Telemetry features are planned for future releases to enable metrics collection and monitoring; currently, the focus is on logging.

## Logger Architecture

Brooklyn has two logging systems:

1. **Winston Logger** (`src/shared/logger.ts`) - Legacy winston-based logger
   - Use for: Older modules, compatibility with existing code
   - Import: `import { getLogger } from "../shared/logger.js"`

2. **Structured Logger** (`src/shared/structured-logger.ts`) - New MCP-aware logger  
   - Use for: New code, MCP transport modules, CLI tools
   - Import: `import { getLogger } from "../shared/structured-logger.js"`
   - Features: Built-in MCP mode detection, automatic stderr routing

**Recommendation**: Use Structured Logger for all new development.

Both systems support:
- Multiple log levels (debug, info, warn, error).
- Structured output (JSON or pretty-printed).
- Output to console (stderr to avoid stdio interference) and files with rotation.
- Context-aware child loggers for modules.

This setup ensures logs do not interfere with MCP stdio communications or local dev processes.

## Configuration

Logging is initialized via `initLogger` or `initializeLogging` with options from `BrooklynConfig`. Key options include:

- **level**: Minimum log level ("debug", "info", "warn", "error").
- **format**: Output format ("json", "pretty", "compact").
- **useStderr**: Forces all console output to stderr (enabled by default for MCP compatibility).
- **logFile**: Path for file logging (enables rotation with maxSize and maxFiles).
- **maxSize** / **maxFiles**: File rotation limits (default: 10MB, 5 files).

Example initialization:
```typescript
initLogger({
  level: "debug",
  format: "pretty",
  useStderr: true,
  logFile: "brooklyn.log",
  maxSize: 10 * 1024 * 1024,
  maxFiles: 5,
});
```

Logs are written to stderr for console and a configurable file path for persistent storage.

## Using the Logger

### Getting a Logger Instance
Use `getLogger` to create a context-specific logger:
```typescript
import { getLogger } from "../shared/logger.js";

const logger = getLogger("my-module");
```

This creates a child logger with the module name for context.

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
```typescript
// CLI tools and dev scripts - user-friendly output
this.logger.info("🚀 Starting Brooklyn MCP development mode");
this.logger.warn("❌ Development mode already running", { processId });
```

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
    context: { inputPipe, outputPipe }
  });
}
```

### With Stack Traces (Structured Logger)
```typescript
logger.errorWithException("Critical failure", error, { 
  correlationId: "mcp-dev-123" 
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
- **Use Context**: Always use `getLogger("module-name")` for traceable logs.
- **Structured Data**: Prefer metadata objects over string concatenation for better querying.
- **Levels**: Use debug for dev details, info for normal ops, warn/error for issues.
- **MCP/Dev Compatibility**: Logs go to stderr—do not use console.log() directly.
- **Performance**: Avoid heavy logging in hot paths; use debug level for verbose output.
- **Error Handling**: Use `errorWithException` in structured-logger for stack traces.
- **Cleanup**: Call `closeAllLoggers()` on shutdown to flush file streams.
- **Logger Choice**: Use Structured Logger for new code, Winston Logger for legacy compatibility.

## Telemetry
Telemetry is not yet implemented but is planned for Phase 2. It will include:
- Metrics collection (e.g., request counts, latencies).
- Integration with tools like Prometheus or StatsD.
- Configurable endpoints for exporting metrics.

For now, use logging for observability. Backlog items include integrating OpenTelemetry for traces and metrics.

## Troubleshooting

### Common Issues
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

— Brooklyn Development Team  
Last Updated: July 21, 2025
