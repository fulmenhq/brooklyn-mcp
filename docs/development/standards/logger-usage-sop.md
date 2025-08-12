# 🚨 BROOKLYN LOGGER USAGE - STANDARD OPERATING PROCEDURE (SOP)

**THIS SOP EXISTS BECAUSE INCORRECT LOGGER USAGE IS THE #1 CAUSE OF BUNDLED BINARY FAILURES AND SILENT CLI COMMAND FAILURES**

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

## 🚨 CRITICAL: Why CLI Commands CANNOT Use Structured Logging

**TESTED AUGUST 2025**: Attempting to use structured logging in CLI commands **FAILS COMPLETELY**.

### The MCP Transport Architecture

Brooklyn's logging system is designed around **MCP Protocol Requirements**:

1. **MCP Protocol**: Requires pure JSON-RPC on stdout - ANY other output breaks it
2. **Logger Starts Silent**: `silentUntilInitialized = true` - ALL logs are discarded until initialized
3. **Only MCP Server Initializes**: `setGlobalTransport()` is only called by `brooklyn mcp start`
4. **CLI Commands Never Initialize**: So structured logger calls are **DISCARDED COMPLETELY**

### Concrete Evidence

```typescript
// In pino-logger.ts lines 124-129:
if (globalConfig.silentUntilInitialized && !globalConfig.isInitialized) {
  // Do nothing - logs are discarded, not buffered
  return; // ❌ ALL CLI LOGS GO HERE - COMPLETE SILENCE
}
```

**Test Results**:

- ❌ `brooklyn ops info` with structured logging: **NO OUTPUT WHATSOEVER**
- ✅ `brooklyn ops info` with console.log: **WORKS PERFECTLY**

This is **NOT a bug** - it's **intentional design** to prevent MCP transport contamination.

## The Solution

### For Server/MCP Code: Use Lazy Logger Initialization

**ALWAYS USE LAZY INITIALIZATION for server and MCP code:**

```typescript
import { getLogger } from "../shared/pino-logger.js";

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

### For CLI Commands: MANDATORY console.log + process.exit(0)

**🚨 NON-NEGOTIABLE: CLI commands MUST use console.log - structured logging WILL NOT WORK**

**ZERO EXCEPTIONS**: Any CLI command using structured logging will produce **NO OUTPUT**.

```typescript
// CLI command pattern - use console.log directly
export function registerMyCliCommand(program: Command): void {
  program
    .command("my-command")
    .description("My CLI command")
    .action(async () => {
      console.log("🚀 Starting operation...");

      try {
        // Do CLI work here
        console.log("✅ Operation completed successfully");

        // Always exit explicitly for CLI commands
        process.exit(0);
      } catch (error) {
        console.error("❌ Operation failed:", error);
        process.exit(1);
      }
    });
}
```

## 🚨 WHEN TO USE WHICH PATTERN - MANDATORY GUIDELINES

### 🏗️ Use Structured Logger (Lazy Init) When:

- ✅ **MCP Server Code**: Files that handle MCP protocol messages
- ✅ **Background Services**: Long-running processes, database operations
- ✅ **Core Business Logic**: Classes and services that need structured logging
- ✅ **Server Components**: HTTP handlers, background workers
- ✅ **Error Tracking**: When you need structured error context

### 🖥️ Use console.log + process.exit When:

- ⚡ **CLI Commands**: `src/cli/commands/*.ts` files with Commander.js actions
- ⚡ **One-shot Operations**: Commands that run once and terminate
- ⚡ **User-facing Output**: When users need immediate visual feedback
- ⚡ **Terminal Tools**: Status checks, setup commands, cleanup operations
- ⚡ **Script-like Operations**: Anything that should behave like a shell script

### 🚫 NEVER TRY TO MIX THESE PATTERNS

**ARCHITECTURE RULE**: It is **IMPOSSIBLE** to use structured logging in CLI commands due to MCP transport requirements.

**If you attempt structured logging in CLI commands**:

- ❌ **NO OUTPUT** will be produced
- ❌ Command will appear to hang or fail silently
- ❌ Debugging will be extremely difficult
- ❌ Users will report "broken" commands

### 🎨 CLI Output Best Practices

**Emoji Usage in CLI Commands**:

- ⚡ **Simple emojis work**: 🔄 ⚠️ ❌ ✅ 📊 🚀
- ⚡ **Avoid complex emojis**: Some may display as `â` or other artifacts
- ⚡ **Test in different terminals**: VS Code, iTerm, Terminal.app, etc.
- ⚡ **Fallback to ASCII**: When in doubt, use `[OK]` `[ERROR]` `[INFO]`

**Terminal Compatibility**:

```typescript
// ✅ GOOD - Simple, widely supported
console.log("✅ Operation successful");
console.log("❌ Operation failed");
console.log("⚠️  Warning message");

// ⚠️  MAY DISPLAY INCORRECTLY - Complex emojis
console.log("🎯 Target achieved"); // Sometimes shows as â
console.log("🌉 Brooklyn ready"); // Sometimes shows as ââ

// ✅ SAFE FALLBACK - ASCII alternatives
console.log("[OK] Operation successful");
console.log("[ERROR] Operation failed");
console.log("[WARN] Warning message");
```

### 🔧 Biome.json Configuration for CLI Commands

**MANDATORY**: When creating new CLI command files, you MUST add them to the biome.json exclusion list.

**Why**: Biome normally flags `console.log` usage, but CLI commands are the ONLY place where it's required.

**Good News**: Brooklyn's `biome.json` is already configured for CLI commands!

**Current Configuration** (lines 139-157 in biome.json):

```json
{
  "include": [
    "src/cli/brooklyn.ts",
    "src/cli/brooklyn-server.ts",
    "src/cli/commands/*.ts", // 🎯 ALL CLI commands covered
    "src/cli/cleanup/*.ts",
    "src/core/brooklyn-repl.ts",
    "src/core/brooklyn-http.ts"
  ],
  "linter": {
    "rules": {
      "suspicious": {
        "noConsole": "off" // ✅ console.log allowed
      }
    }
  }
}
```

**What This Means**:

- ✅ **All files in `src/cli/commands/*.ts`** can use `console.log` without linting errors
- ✅ **New CLI command files** are automatically covered by the wildcard pattern
- ✅ **No manual biome.json updates needed** when adding new CLI commands

**Rule**: If your file is in `src/cli/commands/` and uses `console.log`, it's already configured correctly!

## Why This Happens

1. **Bundle Time**: The bundler evaluates module-level code during bundling
2. **Runtime Order**: The CLI initializes logging AFTER modules are loaded
3. **Timing Conflict**: Module-level `getLogger()` runs before logger is ready
4. **CLI vs Server Context**: CLI commands need immediate output, servers need structured logs

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
- [AGENT.md](../../AGENT.md) - Critical coding rules
- [CLAUDE.md](../../CLAUDE.md) - Common mistakes section

---

## Brooklyn-Specific Examples

### ✅ CLI Command (Fixed Pattern)

```typescript
// src/cli/commands/ops.ts
export function registerOpsCommand(program: Command): void {
  const ops = program.command("ops").description("Operational commands");

  ops
    .command("info")
    .description("Show system information")
    .action(async () => {
      console.log("🌉 Brooklyn System Information");
      console.log(`📦 Version: ${process.env["BROOKLYN_VERSION"]}`);
      console.log(`🖥️  Platform: ${process.platform}`);

      // Explicitly exit to return control to console
      process.exit(0);
    });
}
```

### ✅ MCP Server Code (Lazy Pattern)

```typescript
// src/core/brooklyn-engine.ts
import { getLogger } from "../shared/pino-logger.js";

let logger: ReturnType<typeof getLogger> | null = null;
function ensureLogger() {
  if (!logger) {
    logger = getLogger("brooklyn-engine");
  }
  return logger;
}

export class BrooklynEngine {
  async handleMCPRequest(request: any) {
    ensureLogger().info("Processing MCP request", { type: request.method });
    // ... handle request
  }
}
```

**Remember**:

- **CLI Commands**: Use `console.log` + `process.exit(0)` for immediate output and termination
- **Server Code**: Use lazy logger initialization for structured logging
- **When in doubt**: Check if it's a CLI command (immediate output) or server code (structured logs)
