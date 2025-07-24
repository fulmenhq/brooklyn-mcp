# 🚨 CRITICAL: Logger Initialization Pattern

**THIS FILE EXISTS BECAUSE MODULE-LEVEL LOGGER INITIALIZATION IS THE #1 CAUSE OF BUNDLED BINARY FAILURES**

## The Problem

When you write this innocent-looking code:

```typescript
import { getLogger } from "../shared/structured-logger.js";
const logger = getLogger("my-module"); // 💥 EXECUTES DURING BUNDLE!
```

The bundler executes `getLogger()` during the bundling process, BEFORE the CLI has initialized the logger registry. This causes:

- "Logger registry not initialized" errors
- Complete failure of ALL Brooklyn commands
- Hours of debugging frustration

## The Solution

**ALWAYS USE LAZY INITIALIZATION:**

```typescript
import { getLogger } from "../shared/structured-logger.js";

// Create a lazy-initialized logger
let logger: ReturnType<typeof getLogger> | null = null;

function ensureLogger() {
  if (!logger) {
    logger = getLogger("my-module");
  }
  return logger;
}

// Use it in your code
export class MyClass {
  someMethod() {
    ensureLogger().info("This is safe!"); // ✅ Called after initialization
  }
}
```

## Why This Happens

1. **Bundle Time**: The bundler evaluates module-level code during bundling
2. **Runtime Order**: The CLI initializes logging AFTER modules are loaded
3. **Timing Conflict**: Module-level `getLogger()` runs before logger is ready

## Quick Reference

### ❌ NEVER DO THIS

```typescript
const logger = getLogger("module"); // Module-level
class MyClass {
  logger = getLogger("class"); // Class property
  constructor() {
    this.logger = getLogger("constructor"); // Constructor without check
  }
}
```

### ✅ ALWAYS DO THIS

```typescript
let logger: ReturnType<typeof getLogger> | null = null;
function ensureLogger() {
  if (!logger) logger = getLogger("module");
  return logger;
}
```

## Real Example from Brooklyn

This exact pattern fixed the `MCPDevManager` in July 2025:

```typescript
export class MCPDevManager {
  private logger: Logger | null = null;

  private getLogger(): Logger {
    if (!this.logger) {
      try {
        const loggerModule = require("../shared/structured-logger.js");
        this.logger = loggerModule.getLogger("brooklyn-mcp-dev");
      } catch (_error) {
        // Fallback if logger not available
        this.logger = {
          /* console.error fallback */
        };
      }
    }
    return this.logger;
  }

  async start(): Promise<void> {
    this.getLogger().info("Starting..."); // Safe!
  }
}
```

## Testing Your Fix

After applying the pattern:

1. Rebuild: `bun run build`
2. Install: `bun install`
3. Test ALL commands:
   - `brooklyn status`
   - `brooklyn mcp dev-status`
   - `brooklyn --help`

If ANY command shows "Logger registry not initialized", you haven't fixed all instances.

## See Also

- [Full Logging Guide](./logging_and_telemetry_guide.md) - Complete documentation
- [AGENTS.md](../../AGENTS.md) - Critical coding rules
- [CLAUDE.md](../../CLAUDE.md) - Common mistakes section

---

**Remember**: When in doubt, LAZY INIT! It's better to have slightly verbose code than a broken production binary.
