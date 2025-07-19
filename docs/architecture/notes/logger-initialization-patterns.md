# Logger Initialization Patterns - Architecture Note

## Issue Summary

**Date**: 2025-07-19  
**Status**: Resolved  
**Impact**: Critical - Prevented MCP server startup

### Problem

Brooklyn MCP server was failing with the error:

```
Failed to start MCP server: Logger registry not initialized. Call initialize() first.
```

This occurred despite having logger initialization at the top of the CLI entry point.

### Root Cause Analysis

The issue was caused by **import-time logger usage** combined with **dual logger systems**:

1. **Import-Time Side Effects**: Several modules were creating logger instances at module import time
2. **Dual Logger Systems**: The codebase had two separate logger implementations:
   - `src/shared/logger.ts` - Winston-based logger (most modules)
   - `src/shared/structured-logger.ts` - Custom structured logger (brooklyn-engine)
3. **Circular Dependencies**: Logger initialization couldn't complete before modules tried to use it

### Modules Affected

- `src/core/browser-pool-manager.ts` - Used `const logger = getLogger()` at module level
- `src/core/config.ts` - Same pattern
- `src/core/plugin-manager.ts` - Used `import { logger }` directly
- `src/core/brooklyn-engine.ts` - Mixed logger imports (structured-logger vs logger)

## Solution Applied

### 1. Lazy Logger Initialization Pattern

Replace import-time logger creation with lazy initialization:

```typescript
// ❌ BAD - Import time logger
import { getLogger } from "../shared/logger.js";
const logger = getLogger("module-name");

// ✅ GOOD - Lazy logger initialization
import { getLogger } from "../shared/logger.js";

let logger: ReturnType<typeof getLogger> | null = null;

function ensureLogger() {
  if (!logger) {
    logger = getLogger("module-name");
  }
  return logger;
}

// Usage in methods
class MyClass {
  someMethod() {
    ensureLogger().info("Log message");
  }
}
```

### 2. Consistent Logger Imports

Ensure all modules import from the same logger implementation:

```typescript
// ✅ Consistent - All use logger.js
import { getLogger } from "../shared/logger.js";

// ❌ Inconsistent - Mixed imports cause separate registries
import { getLogger } from "../shared/structured-logger.js";
```

### 3. Top-Level Initialization

Initialize logging before ANY other imports in CLI entry point:

```typescript
#!/usr/bin/env bun

// CRITICAL: Initialize logging BEFORE any imports
import { initializeLogging } from "../shared/structured-logger.js";

// Minimal config for bootstrap
const minimalConfig = {
  serviceName: "brooklyn-mcp-server",
  logging: { level: "info", format: "json" },
  // ... other required fields
};

initializeLogging(minimalConfig);

// NOW safe to import modules that use logger
import { Command } from "commander";
import { BrooklynEngine } from "../core/brooklyn-engine.js";
// ... rest of imports
```

## Architectural Recommendations

### 1. Single Logger System

**Recommendation**: Consolidate to one logger implementation

- Remove dual logger systems (logger.ts vs structured-logger.ts)
- Choose one consistent API across the codebase
- Avoid confusion and import errors

### 2. Dependency Injection Pattern

**Future Direction**: Consider dependency injection for cleaner architecture:

```typescript
class BrooklynEngine {
  constructor(
    private config: Config,
    private logger: Logger,
    private browserPool: BrowserPool,
  ) {
    // Dependencies explicitly passed, no import-time issues
  }
}
```

### 3. No Side Effects During Import

**Best Practice**: Modules should not execute code during import

- Class definitions only
- Function definitions only
- Constants are OK if they don't call functions
- Defer all initialization to explicit init methods

### 4. Logger Type Safety

Use proper TypeScript types for logger instances:

```typescript
// Define return type for lazy loggers
type Logger = ReturnType<typeof getLogger>;

// Use in lazy initialization
let logger: Logger | null = null;
```

## Testing Considerations

### Unit Tests

Mock logger at module level for tests:

```typescript
// In test files
vi.mock("../shared/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));
```

### Integration Tests

Ensure logger is initialized before running integration tests:

```typescript
// In test setup
beforeAll(() => {
  initializeLogging(testConfig);
});
```

## Lessons Learned

1. **Import Order Matters**: Logger initialization must happen before any module imports
2. **Lazy Initialization**: Safer pattern for shared resources like loggers
3. **Consistent Dependencies**: All modules must use the same logger implementation
4. **No Import Side Effects**: Critical for predictable initialization order

## Future Improvements

1. **Unified Logger**: Merge logger.ts and structured-logger.ts into one system
2. **Dependency Injection**: Move to DI container for better dependency management
3. **Build-Time Validation**: Add linter rules to catch import-time logger usage
4. **Logger Factory**: Centralized factory pattern for logger creation

## References

- Original error: "Logger registry not initialized. Call initialize() first."
- Fix implemented: 2025-07-19
- Architecture Committee guidance on logger initialization patterns
