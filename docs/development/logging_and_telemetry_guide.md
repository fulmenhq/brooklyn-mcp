# Brooklyn Logging and Telemetry Guide

## Overview

Brooklyn uses [Pino](https://github.com/pinojs/pino), a high-performance JSON logger, for all logging needs. The logging system is designed to be **completely silent until transport mode is determined**, ensuring no output contamination during MCP health checks.

## Quick Start

### Basic Usage

```typescript
import { getLogger } from "../shared/pino-logger.js";

// Get a logger instance
const logger = getLogger("my-module");

// Log messages with optional context
logger.info("Server started");
logger.debug("Processing request", { userId: 123 });
logger.error("Operation failed", { error: err.message });
```

**Important**: In MCP mode, the logger stays completely silent until the transport is initialized. This prevents any stdout/stderr contamination during Claude's health checks.

## Logger Architecture

Brooklyn's Pino-based logger (`src/shared/pino-logger.ts`) provides:

- **Silent initialization** - No output until transport mode is determined
- **Automatic MCP protection** - File logging in MCP mode, stderr in other modes
- **Zero stdout contamination** - Critical for Claude health checks
- **High performance** - Pino is one of the fastest Node.js loggers
- **JSON structured logging** - Perfect for log aggregation and analysis
- **Module-based context** - Each logger includes its module name automatically

### Silent Initialization Pattern

The logger starts in a completely silent state to prevent any output during the critical initialization phase when Claude is performing health checks:

```typescript
// In brooklyn.ts - NO early initialization
// Don't do this at module level:
// initializeLogging(config); // ❌ Too early!

// Instead, initialize AFTER transport is created:
const transport = await createMCPStdio(); // This sets MCP mode
await initializeLogging(config); // Now safe to initialize
const logger = getLogger("module"); // Now safe to log
```

## Configuration

While loggers work without any configuration, you can optionally initialize logging with custom settings:

```typescript
import { initializeLogging } from "../shared/pino-logger.js";

// Optional: Configure logging behavior
initializeLogging({
  logging: {
    level: "debug", // Minimum log level
    format: "pretty", // "json" or "pretty" (pretty requires pino-pretty)
    file: "app.log", // Optional file output (not implemented yet)
  },
});
```

### Log Levels

- `debug` - Detailed debugging information
- `info` - General informational messages
- `warn` - Warning messages
- `error` - Error messages

## MCP Mode Behavior

When running in MCP mode (Model Context Protocol), the logger automatically:

- Redirects ALL output to file-based logging in `~/.brooklyn/logs/`
- Keeps stdout completely clean for JSON-RPC protocol
- Prevents any accidental protocol corruption
- Uses human-readable log filenames with transport identification

```typescript
// This is handled automatically - you don't need to do anything special
logger.info("This goes to file in MCP mode, stderr in other modes");
```

### Log File Naming Convention

Brooklyn uses a human-readable naming pattern for log files:

**Pattern**: `brooklyn-mcp-<transport>-<yyyymmdd>-<hhmmss>-<ms>.log`

**Transport Identifiers**:

- `stdio` - Standard MCP mode (`brooklyn mcp start`)
- `http` - HTTP transport mode (`brooklyn mcp dev-http`)
- `dev` - Development mode (`brooklyn mcp dev-start`)

**Timestamp Format**: All timestamps use **UTC** for consistency across timezones

- `yyyymmdd` - Year, month, day (UTC)
- `hhmmss` - Hour, minute, second (UTC)
- `ms` - Milliseconds (3 digits, zero-padded)

**Examples**:

```
brooklyn-mcp-stdio-20250813-143022-347.log    # UTC: 2025-08-13 14:30:22.347
brooklyn-mcp-http-20250813-143145-892.log     # UTC: 2025-08-13 14:31:45.892
brooklyn-mcp-dev-20250813-143301-156.log      # UTC: 2025-08-13 14:33:01.156
```

This naming pattern provides:

- ✅ **Human readability** vs epoch timestamps
- ✅ **Transport identification** for debugging
- ✅ **Chronological sorting** by filesystem
- ✅ **Collision prevention** when running multiple transports
- ✅ **Millisecond precision** for uniqueness
- ✅ **Timezone consistency** using UTC across all environments

## Best Practices

### ✅ DO

```typescript
// Import and use directly
import { getLogger } from "../shared/pino-logger.js";
const logger = getLogger("my-module");

// Log with structured data
logger.info("User action", {
  userId: 123,
  action: "login",
  timestamp: Date.now(),
});

// Use appropriate log levels
logger.debug("Detailed debug info");
logger.info("Normal operation");
logger.warn("Something concerning");
logger.error("Something failed");
```

### ❌ DON'T

```typescript
// Don't use console.log - it can corrupt MCP protocol
console.log("Never do this");

// Don't worry about initialization - it's automatic
// No need for lazy patterns or try/catch blocks
```

## Error Logging

### Basic Error Logging

```typescript
try {
  await riskyOperation();
} catch (error) {
  logger.error("Operation failed", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
}
```

### With Pino's Error Serializer

```typescript
// Pino automatically serializes errors when using the 'err' field
logger.error({ err: error }, "Operation failed");
```

## Testing with Pino

When writing tests, mock the logger module:

```typescript
// Mock the entire pino-logger module
vi.mock("../shared/pino-logger.js", () => ({
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  })),
}));
```

## Migration from Structured Logger

If you're updating old code that used the structured logger:

### Before (Complex)

```typescript
// Old pattern - DON'T USE
let logger: ReturnType<typeof getLogger> | null = null;
function ensureLogger() {
  if (!logger) {
    try {
      logger = getLogger("my-module");
    } catch {
      return null;
    }
  }
  return logger;
}
ensureLogger()?.info("Maybe logs");
```

### After (Simple)

```typescript
// New pattern - Just use it!
import { getLogger } from "../shared/pino-logger.js";
const logger = getLogger("my-module");
logger.info("Always logs!");
```

## Performance Considerations

- Pino is extremely fast, but avoid logging in tight loops
- Use appropriate log levels (debug for development, info/warn/error for production)
- Structure your data for better querying:

```typescript
// Good - structured data
logger.info("Order processed", {
  orderId: 12345,
  amount: 99.99,
  currency: "USD",
});

// Less useful - string concatenation
logger.info(`Order 12345 processed for $99.99 USD`);
```

## Environment Variables

- `NODE_ENV=production` - Disables pretty printing for better performance
- `LOG_LEVEL=debug` - Override configured log level (if needed)

## Telemetry (Future)

Telemetry features are planned for future releases:

- Metrics collection (request counts, latencies)
- Integration with Prometheus/StatsD
- Distributed tracing support

For now, structured logging provides excellent observability.

## Troubleshooting

### No Logs Appearing?

1. **Check log location**: In MCP mode, logs go to `~/.brooklyn/logs/` directory
2. **Check the log level**: Debug messages won't show at info level
3. **Check transport mode**: In non-MCP mode, ensure you're looking at stderr, not stdout
4. **Verify the logger name**: Make sure module name is correct

### Finding Log Files

**MCP Mode**: Logs are written to files in `~/.brooklyn/logs/`:

```bash
# List recent log files
ls -la ~/.brooklyn/logs/brooklyn-mcp-*.log

# Tail the most recent stdio transport log
tail -f ~/.brooklyn/logs/brooklyn-mcp-stdio-$(date +%Y%m%d)*.log

# View all transports for today
ls ~/.brooklyn/logs/brooklyn-mcp-*-$(date +%Y%m%d)*.log
```

**Non-MCP Mode**: Logs go to stderr and can be captured:

```bash
# Redirect stderr to file for viewing
brooklyn web start 2> brooklyn-web.log
```

### Multiple Transport Logs

When running multiple transports simultaneously:

```bash
# Different transports create separate log files
brooklyn mcp start                    # → brooklyn-mcp-stdio-*.log
brooklyn mcp dev-http --port 8080     # → brooklyn-mcp-http-*.log
brooklyn mcp dev-start                # → brooklyn-mcp-dev-*.log
```

### Pretty Printing Not Working?

- Install `pino-pretty` as a dependency
- Set format to "pretty" in configuration
- Ensure NODE_ENV is not "production"

### Log Cleanup

Brooklyn automatically keeps the last 10 log files and removes older ones to prevent disk space issues.

## Summary

Brooklyn's Pino-based logging is designed to be simple and reliable:

1. **No initialization required** - Just import and use
2. **MCP-safe by default** - All output to stderr
3. **High performance** - Minimal overhead
4. **Structured logging** - JSON format for better analysis

The days of complex lazy initialization patterns are over. Just `getLogger()` and start logging!

---

**Last Updated**: July 26, 2025  
**Migration**: Moved from structured-logger to Pino for simplicity and reliability
