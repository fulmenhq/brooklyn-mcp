# CLI Implementation Standards - Standard Operating Procedures

**Purpose**: Document lessons learned from Brooklyn CLI implementation to prevent common mistakes and establish patterns for robust command-line interface development.

## 🚨 Critical Requirements (Zero-Tolerance)

### 1. Process Exit Handling

**MANDATORY**: Every CLI command must explicitly handle process exit with appropriate codes.

```typescript
// ✅ CORRECT - Explicit exit handling
.action(async (options) => {
  try {
    // ... command logic
    console.log("Operation completed successfully");
    process.exit(0); // Explicit success exit
  } catch (error) {
    console.error("Operation failed:", error);
    process.exit(1); // Explicit failure exit
  }
});
```

```typescript
// ❌ WRONG - Implicit exit (may hang)
.action(async (options) => {
  // ... command logic
  console.log("Done"); // No explicit exit - may hang
});
```

**Why This Matters**: CLI commands without explicit exit handling can hang indefinitely, especially with async operations, timers, or open handles.

### 2. Async Operation Timeouts

**MANDATORY**: All network requests, external process calls, and long-running operations must have explicit timeouts.

```typescript
// ✅ CORRECT - Network request with timeout
try {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeoutId);

  if (response.ok) {
    console.log("✅ Request successful");
  } else {
    console.log(`⚠️ Server error (${response.status})`);
  }
} catch (error) {
  if (error instanceof Error && error.name === "AbortError") {
    console.log("⏰ Request timed out");
  } else {
    console.log("❌ Request failed");
  }
}
```

```typescript
// ✅ CORRECT - Process operations with timeout
const timeoutPromise = new Promise<never>((_, reject) => {
  setTimeout(() => reject(new Error("Operation timeout")), 3000);
});

const operationPromise = execAsync("long-running-command");
const result = await Promise.race([operationPromise, timeoutPromise]);
```

```typescript
// ❌ WRONG - No timeout protection
const response = await fetch(url); // Can hang indefinitely
const { stdout } = await execAsync("command"); // Can hang indefinitely
```

### 3. File System Race Condition Protection

**MANDATORY**: Always check file existence before operations that might fail due to race conditions.

```typescript
// ✅ CORRECT - Race condition protection
if (existsSync(pidFile)) {
  unlinkSync(pidFile); // Safe - file checked first
}

// Or with try-catch for additional safety
try {
  if (existsSync(pidFile)) {
    unlinkSync(pidFile);
  }
} catch (error) {
  // File was removed by another process - that's OK
}
```

```typescript
// ❌ WRONG - Race condition prone
unlinkSync(pidFile); // Can fail if another process removed file
```

**Common Race Conditions**:

- PID file cleanup in concurrent operations
- Temporary file operations
- Lock file management
- Process status checks

## 🎯 Command Design Patterns

### 1. Command Structure Template

```typescript
const myCmd = program
  .command("my-command")
  .description("Clear description of what this command does")
  .option("--port <port>", "Port number", "8080") // Default value
  .option("--force", "Force operation without confirmation")
  .option("--timeout <ms>", "Operation timeout in milliseconds", "5000")
  .action(async options => {
    try {
      // 1. Validate inputs
      const port = Number.parseInt(options.port);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error("❌ Invalid port number");
        process.exit(1);
      }

      // 2. Execute operation with timeout protection
      await executeOperationWithTimeout(options);

      // 3. Success output
      console.log("✅ Operation completed successfully");
      process.exit(0);
    } catch (error) {
      // 4. Error handling
      console.error("❌ Operation failed:", error);
      process.exit(1);
    }
  });
```

### 2. Async Operation Wrapper Pattern

```typescript
/**
 * Generic timeout wrapper for async operations
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

// Usage:
const result = await withTimeout(fetch("https://api.example.com/data"), 5000, "API request");
```

### 3. Process Management Pattern

```typescript
/**
 * Safe process termination with escalation
 */
async function stopProcess(pid: number, force: boolean = false): Promise<boolean> {
  try {
    // 1. Try graceful shutdown
    process.kill(pid, "SIGTERM");
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 2. Check if process is gone
    try {
      process.kill(pid, 0); // Check if process exists

      // 3. Still running - escalate if requested
      if (force) {
        console.log(`⚠️ SIGTERM failed for PID ${pid}, trying SIGKILL...`);
        process.kill(pid, "SIGKILL");
        await new Promise(resolve => setTimeout(resolve, 1000));
        return true;
      }
      return false;
    } catch {
      // Process is gone - success!
      return true;
    }
  } catch (error) {
    // Process might already be dead - that's success
    return true;
  }
}
```

## 🛡️ Error Handling Standards

### 1. User-Friendly Error Messages

```typescript
// ✅ CORRECT - Actionable error messages
if (!existsSync(configFile)) {
  console.error("❌ Configuration file not found");
  console.error(`   Expected location: ${configFile}`);
  console.error("   💡 Run 'brooklyn init' to create configuration");
  process.exit(1);
}
```

```typescript
// ❌ WRONG - Cryptic errors
throw new Error("ENOENT"); // User has no idea what to do
```

### 2. Error Categories and Exit Codes

| Exit Code | Category      | Description                        | Example                                    |
| --------- | ------------- | ---------------------------------- | ------------------------------------------ |
| `0`       | Success       | Operation completed successfully   | Command executed without issues            |
| `1`       | User Error    | Invalid input, missing files, etc. | Invalid port number, missing config        |
| `2`       | System Error  | Permission denied, network failure | Can't write to directory, network timeout  |
| `3`       | Process Error | External process failure           | Browser launch failed, service unavailable |

### 3. Structured Error Information

```typescript
interface CLIError {
  code: string;
  message: string;
  details?: string;
  suggestion?: string;
  exitCode: number;
}

function handleError(error: CLIError): never {
  console.error(`❌ ${error.message}`);
  if (error.details) {
    console.error(`   ${error.details}`);
  }
  if (error.suggestion) {
    console.error(`   💡 ${error.suggestion}`);
  }
  process.exit(error.exitCode);
}
```

## 🔧 Argument Parsing Best Practices

### 1. Global vs Command-Level Options

```typescript
// Global options (available to all commands)
program
  .option("--verbose", "Enable verbose output")
  .option("--config <path>", "Configuration file path")
  .option("--timeout <ms>", "Global timeout in milliseconds", "30000");

// Command-specific options
program
  .command("serve")
  .option("--port <port>", "Server port", "8080") // Command-specific
  .option("--host <host>", "Server host", "localhost") // Command-specific
  .action((options, command) => {
    // Access global options via command.parent.opts()
    const globalOpts = command.parent?.opts() || {};
    const verbose = globalOpts.verbose;
    const timeout = Number.parseInt(globalOpts.timeout);

    // Access command options directly
    const port = Number.parseInt(options.port);
    const host = options.host;
  });
```

### 2. Input Validation Pattern

```typescript
function validateOptions(options: any): void {
  const errors: string[] = [];

  // Port validation
  if (options.port) {
    const port = Number.parseInt(options.port);
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push("Port must be a number between 1 and 65535");
    }
  }

  // Required options
  if (!options.teamId) {
    errors.push("Team ID is required (use --team-id)");
  }

  // File path validation
  if (options.config && !existsSync(options.config)) {
    errors.push(`Configuration file not found: ${options.config}`);
  }

  if (errors.length > 0) {
    console.error("❌ Invalid arguments:");
    errors.forEach(error => console.error(`   ${error}`));
    process.exit(1);
  }
}
```

### 3. Default Value Strategy

```typescript
// ✅ CORRECT - Explicit defaults with validation
.option("--port <port>", "Server port", "8080")
.option("--timeout <ms>", "Timeout in milliseconds", "5000")
.option("--retries <count>", "Number of retries", "3")
.action((options) => {
  const port = Number.parseInt(options.port);
  const timeout = Number.parseInt(options.timeout);
  const retries = Number.parseInt(options.retries);

  // Validate parsed values
  if (isNaN(port)) throw new Error("Invalid port number");
  if (isNaN(timeout) || timeout < 0) throw new Error("Invalid timeout");
  if (isNaN(retries) || retries < 0) throw new Error("Invalid retry count");
});
```

## 📊 Performance Considerations

### 1. Lazy Loading of Heavy Dependencies

```typescript
// ✅ CORRECT - Lazy load heavy imports
.action(async (options) => {
  try {
    // Only load playwright when actually needed
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    // ... rest of command
  } catch (error) {
    console.error("❌ Failed to initialize browser:", error);
    process.exit(1);
  }
});
```

```typescript
// ❌ WRONG - Heavy imports at module level
import { chromium } from "playwright"; // Loaded even for --help

.action(async (options) => {
  const browser = await chromium.launch();
});
```

### 2. Resource Cleanup

```typescript
// ✅ CORRECT - Proper resource cleanup
.action(async (options) => {
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch();
    // ... command logic

  } finally {
    // Always cleanup resources
    if (browser) {
      await browser.close();
    }
  }
});
```

## 🧪 Testing CLI Commands

### 1. Command Testing Pattern

```typescript
import { spawn } from "child_process";
import { promisify } from "util";

const execFile = promisify(spawn);

describe("CLI Commands", () => {
  test("should exit with code 0 on success", async () => {
    const result = await execFile("brooklyn", ["status"]);
    expect(result.code).toBe(0);
  });

  test("should handle invalid arguments", async () => {
    const result = await execFile("brooklyn", ["serve", "--port", "invalid"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Invalid port");
  });

  test("should timeout on long operations", async () => {
    const start = Date.now();
    const result = await execFile("brooklyn", ["long-operation", "--timeout", "1000"]);
    const duration = Date.now() - start;

    expect(result.code).toBe(1);
    expect(duration).toBeLessThan(2000); // Should timeout quickly
    expect(result.stderr).toContain("timed out");
  });
});
```

## 📋 Common Anti-Patterns to Avoid

| Anti-Pattern            | Problem                                        | Solution                                |
| ----------------------- | ---------------------------------------------- | --------------------------------------- |
| **Missing Exit Codes**  | `console.log("Done")` without `process.exit()` | Always use explicit `process.exit(0/1)` |
| **Unhandled Promises**  | `someAsyncFunction()` without `await`          | Always `await` async operations         |
| **Infinite Timeouts**   | `fetch(url)` without timeout                   | Use `AbortController` or `Promise.race` |
| **Race Conditions**     | `unlinkSync(file)` without existence check     | Check `existsSync()` first              |
| **Silent Failures**     | `try { ... } catch { }` with no logging        | Always log errors with context          |
| **Blocking Operations** | `readFileSync()` in hot paths                  | Use async alternatives when possible    |
| **Magic Numbers**       | `setTimeout(callback, 5000)`                   | Use named constants or options          |

## 🎯 Brooklyn-Specific Patterns

### 1. MCP Command Pattern

```typescript
const mcpCmd = program
  .command("mcp")
  .description("MCP server commands for Claude Code integration");

mcpCmd
  .command("start")
  .description("Start MCP server (stdin/stdout mode)")
  .option("--team-id <teamId>", "Team identifier")
  .action(async options => {
    try {
      const { BrooklynEngine } = await import("../core/brooklyn-engine.js");
      const engine = new BrooklynEngine({ teamId: options.teamId });

      await engine.initialize();
      // MCP server runs indefinitely - no explicit exit
    } catch (error) {
      console.error("❌ Failed to start MCP server:", error);
      process.exit(1);
    }
  });
```

### 2. Background Service Pattern

```typescript
mcpCmd
  .command("dev-http")
  .description("Start HTTP API server (defaults to background)")
  .option("--port <port>", "Server port", "8080")
  .option("--foreground", "Run in foreground (blocks terminal)")
  .action(async options => {
    try {
      if (!options.foreground) {
        // Background mode - spawn and exit
        const { spawn } = await import("node:child_process");
        const child = spawn(
          process.execPath,
          [
            process.argv[1],
            "mcp",
            "dev-http-daemon", // Use dedicated daemon command
            "--port",
            options.port,
          ],
          {
            detached: true,
            stdio: ["ignore", "ignore", "ignore"],
          },
        );

        child.unref();
        console.log(`Server started in background (PID: ${child.pid})`);
        process.exit(0); // Exit parent process
      } else {
        // Foreground mode - run server directly
        await startServerInForeground(options);
      }
    } catch (error) {
      console.error("❌ Failed to start server:", error);
      process.exit(1);
    }
  });
```

### 3. Process Management Pattern

```typescript
mcpCmd
  .command("cleanup")
  .description("Clean up stale processes and resources")
  .option("--force", "Force cleanup with SIGKILL")
  .action(async options => {
    try {
      const processes = await findBrooklynProcesses();
      console.log(`Found ${processes.length} Brooklyn processes`);

      let cleaned = 0;
      for (const proc of processes) {
        const success = await stopProcess(proc.pid, options.force);
        if (success) {
          cleaned++;
          console.log(`✅ Cleaned up process ${proc.pid}`);
        } else {
          console.log(`⚠️ Could not clean up process ${proc.pid}`);
        }
      }

      console.log(`\n🧹 Cleanup complete: ${cleaned}/${processes.length} processes`);
      process.exit(cleaned === processes.length ? 0 : 1);
    } catch (error) {
      console.error("❌ Cleanup failed:", error);
      process.exit(1);
    }
  });
```

## 🔍 Debugging and Troubleshooting

### 1. Debug Mode Pattern

```typescript
program.option("--debug", "Enable debug output").hook("preAction", thisCommand => {
  if (thisCommand.opts().debug) {
    process.env["DEBUG"] = "brooklyn:*";
    console.log("🐛 Debug mode enabled");
  }
});
```

### 2. Verbose Output Pattern

```typescript
function log(message: string, options: { verbose?: boolean } = {}) {
  if (options.verbose || process.env["VERBOSE"]) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }
}
```

### 3. Health Check Pattern

```typescript
mcpCmd
  .command("doctor")
  .description("Diagnose common issues")
  .action(async () => {
    const checks = [
      { name: "Node.js version", check: checkNodeVersion },
      { name: "Browser availability", check: checkBrowsers },
      { name: "Network connectivity", check: checkNetwork },
      { name: "File permissions", check: checkPermissions },
    ];

    let failed = 0;
    for (const { name, check } of checks) {
      try {
        await check();
        console.log(`✅ ${name}`);
      } catch (error) {
        console.log(`❌ ${name}: ${error}`);
        failed++;
      }
    }

    if (failed === 0) {
      console.log("\n🎉 All checks passed!");
      process.exit(0);
    } else {
      console.log(`\n⚠️ ${failed}/${checks.length} checks failed`);
      process.exit(1);
    }
  });
```

---

## 📝 Lessons Learned from Brooklyn

1. **Process Exit**: Missing `process.exit(0)` caused CLI commands to hang
2. **Network Timeouts**: `fetch()` operations without timeouts caused indefinite hangs
3. **PID File Race Conditions**: Concurrent operations caused ENOENT errors during cleanup
4. **False Positive Process Detection**: Overly broad `grep` patterns caught unrelated processes
5. **Async Operation Management**: Missing `await` on process operations caused timing issues

Following these patterns ensures reliable, user-friendly CLI commands that handle edge cases gracefully and provide clear feedback to users.
