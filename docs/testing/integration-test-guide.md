# Brooklyn Integration Test Guide

This guide helps you run Brooklyn's integration tests successfully, distinguishing between environment issues and actual test failures.

## Quick Start

### First Time Setup

```bash
# Prepare your environment for integration tests
bun run test:integration:prep

# Run integration tests
bun run test:integration

# Or combine both steps
bun run test:all:with-prep
```

### Environment Verification

Check if your environment is ready without making changes:

```bash
bun run test:integration:check
```

Expected output when ready:

```
🔍 Environment Status

✅ Playwright browsers: Installed
   All browsers installed (chromium, firefox, webkit)
✅ Brooklyn processes: None running
✅ Required ports: Available

✅ Environment: Ready for integration tests
```

## Test Categories

### Unit Tests (Fast, No Dependencies)

```bash
bun run test:unit
```

- ✅ No browser installation required
- ✅ No external dependencies
- ✅ Run in pre-commit hooks

### Integration Tests (Require Browsers)

```bash
# With automatic preparation
bun run test:integration:with-prep

# Without preparation (if already set up)
bun run test:integration
```

#### Integration Test Subcategories:

- **Mock Integration**: `bun run test:integration:mock` - No real browsers needed
- **Browser Integration**: `bun run test:integration:browser` - Requires Playwright browsers
- **Process Integration**: `bun run test:integration:process` - Tests process management

### E2E Tests (Currently Skipped)

```bash
bun run test:e2e
```

- Skipped pending enterprise browser infrastructure implementation

## Troubleshooting

### Common Issues and Solutions

#### "Browser not found" or "Failed to launch browser"

**Problem**: Playwright browsers are not installed.

**Solution**:

```bash
# Run the preparation script
bun run test:integration:prep

# Or install browsers manually
bun run setup:browsers
```

#### "Browser session already exists" or Similar Process Errors

**Problem**: Brooklyn processes are already running.

**Solution**:

```bash
# Check for running processes
brooklyn status

# Clean up all Brooklyn processes
brooklyn mcp cleanup

# Or use the prep script
bun run test:integration:prep
```

#### "Port 3000 already in use"

**Problem**: Another service is using a required port.

**Solution**:

```bash
# Find what's using port 3000
lsof -i :3000

# Kill the process or stop the service
kill -9 <PID>
```

#### Test Timeouts

**Problem**: Tests fail with timeout errors on slower machines.

**Solution**: Increase test timeouts in your test files or vitest config.

### Understanding Test Failures

#### Environment Failures vs Code Failures

**Environment Failure Indicators**:

- "Cannot find module 'playwright'"
- "Browser executable not found"
- "Failed to launch browser"
- "Port already in use"
- Process-related errors

**Code Failure Indicators**:

- Assertion errors (expected X but got Y)
- Type errors in test execution
- Logic errors in test scenarios
- API response mismatches

## CI/CD Integration

The same commands work in both local and CI environments. In addition, Brooklyn's release pipeline uses `release:validate` as the comprehensive quality gate before building and publishing artifacts.

```yaml
# GitHub Actions example
- name: Prepare and run integration tests
  run: bun run test:integration:with-prep

# Or separate steps
- name: Setup browsers
  run: bun run setup:browsers

- name: Run integration tests
  run: bun run test:integration

# Release validation (Ubuntu): format, typecheck, lint, tests, build, licenses, binaries
- name: Run release validation
  run: bun run release:validate
```

## Advanced Usage

### Selective Browser Installation

If you only need specific browsers:

```bash
# Install only Chromium
bunx playwright install chromium

# Install only Firefox
bunx playwright install firefox
```

### Browser Management

```bash
# Check installed browsers
brooklyn browser info

# Update browsers to latest versions
brooklyn browser update

# Clean browser cache
brooklyn browser clean
```

### Running Specific Test Suites

```bash
# Run only browser-based integration tests
bun run test:integration:browser

# Run only process-based integration tests
bun run test:integration:process

# Run tests matching a pattern
bun run test -- browser-router
```

## Best Practices

1. **Use Preparation Scripts**: Always use `test:integration:with-prep` for first-time runs
2. **Check Before Running**: Use `test:integration:check` to verify environment
3. **Clean Environment**: Ensure no Brooklyn processes are running before tests
4. **Isolate Failures**: Run unit tests first to isolate integration issues
5. **CI Parity**: Use the same commands locally and in CI

## Environment Variables

Useful environment variables for testing:

```bash
# Skip browser installation prompts
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 bun run test

# Use specific browser versions
PLAYWRIGHT_CHROMIUM_VERSION=latest bun run test

# Enable debug logging
DEBUG=pw:api bun run test:integration:browser
```

## Quick Reference

| Command                              | Purpose               | Requirements       |
| ------------------------------------ | --------------------- | ------------------ |
| `bun run test:unit`                  | Fast unit tests       | None               |
| `bun run test:integration:check`     | Check environment     | None               |
| `bun run test:integration:prep`      | Prepare environment   | None               |
| `bun run test:integration`           | Run integration tests | Browsers installed |
| `bun run test:integration:with-prep` | Prep + run tests      | None               |
| `bun run test:all:with-prep`         | Prep + all tests      | None               |
| `brooklyn mcp cleanup`               | Clean processes       | None               |
| `brooklyn browser info`              | Check browsers        | None               |

## Testing Patterns & Best Practices

### Child Process Testing

When testing MCP servers or CLI tools that spawn child processes, follow these critical patterns to prevent worker crashes and flaky tests:

#### 1. Mock `child_process` to Prevent Shell Execution

**Problem**: Tests that mock browser paths like `/path/to/chromium` can cause real shell executions during version checks.

**Solution**: Always mock `node:child_process` in tests that use browser or process-related functionality:

```typescript
// At the top of your test file, BEFORE importing the module under test
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock child_process to prevent shell execution of fake browser paths
vi.mock("node:child_process", () => ({
  execSync: vi.fn(() => "Chromium 120.0.0.0"),
  exec: vi.fn((cmd, opts, callback) => {
    if (callback) callback(null, { stdout: "Chromium 120.0.0.0", stderr: "" });
    return { stdout: "Chromium 120.0.0.0", stderr: "" };
  }),
  spawn: vi.fn(),
  spawnSync: vi.fn(() => ({ status: 0, stdout: "", stderr: "" })),
}));

// Now import your module
import { ModuleToTest } from "./module-to-test.js";
```

**Files that need this pattern**:

- Any test mocking Playwright browser paths
- Tests that interact with browser version detection
- Tests spawning child processes

#### 2. Ready Signal Synchronization

**Problem**: Blindly waiting for fixed timeouts (e.g., 3s) leads to race conditions and flaky tests.

**Solution**: Use ready signals from child processes:

```typescript
async function spawnAndWaitForReady(command: string[]): Promise<ChildProcess> {
  const child = spawn(command[0], command.slice(1), {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, BROOKLYN_TEST_MODE: "true" },
  });

  return new Promise((resolve, reject) => {
    let serverReady = false;

    child.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString();

      // Wait for ready signal
      if (!serverReady && chunk.includes('"msg":"mcp-stdio-ready"')) {
        serverReady = true;
        resolve(child);
      }
    });

    // Fallback timeout if signal never arrives
    setTimeout(() => {
      if (!serverReady) {
        reject(new Error("Server ready signal timeout"));
      }
    }, 5000);
  });
}
```

#### 3. Proper Cleanup with SIGKILL Fallback

**Problem**: Child processes that don't terminate cause "Worker exited unexpectedly" errors.

**Solution**: Always use SIGTERM → SIGKILL escalation:

```typescript
const timeout = setTimeout(() => {
  // First try graceful shutdown
  child.kill("SIGTERM");

  // Force kill if not closed within 1s
  setTimeout(() => {
    if (!childClosed && child.pid) {
      try {
        process.kill(child.pid, "SIGKILL");
      } catch {
        // Process might have already exited
      }
    }
  }, 1000);

  reject(new Error(`Test timeout after ${TIMEOUT}ms`));
}, TIMEOUT);

child.on("close", () => {
  childClosed = true;
  clearTimeout(timeout);
});
```

#### 4. Sequential Execution for Process-Heavy Tests

**Problem**: Parallel child process tests cause resource contention and worker crashes.

**Solution**: Use `describe.sequential` for tests that spawn processes:

```typescript
// CRITICAL: Sequential execution prevents timing races
describe.sequential("MCP Server Tests", () => {
  it("should start server", async () => {
    // Test implementation
  });
});
```

#### 5. Bootstrap Failure Logging

**Problem**: Silent startup failures cause confusing test errors.

**Solution**: Always log failures to stderr before exiting:

```typescript
try {
  await server.start();
} catch (error) {
  // CRITICAL: Log to stderr for test suite visibility
  logger.error("MCP server failed to start", {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  // Set exit code but don't call process.exit() in tests
  process.exitCode = 1;
}
```

### Debugging Integration Tests

#### Enable Debug Output

```bash
# Debug stdout-purity tests
DEBUG_STDOUT_PURITY=1 bun run test tests/integration/stdout-purity.test.ts

# Debug Playwright browser tests
DEBUG=pw:api bun run test:integration:browser

# Debug MCP protocol
BROOKLYN_MCP_STDERR=true bun run test tests/integration/
```

#### Check for Lingering Processes

```bash
# After failed tests, check for zombie processes
ps aux | grep brooklyn

# Clean up manually if needed
pkill -f brooklyn

# Or use the cleanup command
brooklyn mcp cleanup
```

#### Test Isolation with BROOKLYN_TEST_MODE

The stdout-purity tests spawn child Brooklyn processes with `BROOKLYN_TEST_MODE=true`.
This env var changes two behaviors in `brooklyn mcp start`:

1. **PID file duplicate check is skipped** — Test children start regardless of an existing
   Brooklyn server running for the same project. Without this, developers who have Brooklyn
   running as their MCP server (e.g., for Claude Code) would see test failures because the
   child process detects the PID file and exits with code 1.

2. **PID file write is skipped** — Test children do not write to the PID registry, preventing
   them from overwriting the developer's legitimate PID file.

The tests also intentionally do **not** call `cleanupAllProcesses()` in `beforeAll` or
`afterAll`. Killing all Brooklyn processes would terminate the developer's active MCP server,
which is destructive and unnecessary — each test spawns isolated child processes with their
own stdin/stdout pipes that do not conflict with external instances.

Test-spawned children clean up naturally when stdin is closed, or via SIGTERM/SIGKILL in
`runMCPTest`'s timeout handler.

### Performance Optimization

#### Browser Preflight Verification

The test suite now includes automatic browser verification before tests run:

```bash
# This runs automatically before tests
🔧 Setting up test infrastructure...
🌐 Verifying browser installations...
✅ Chromium verified: chromium-1194
✅ Test infrastructure setup complete!
```

**Benefits**:

- Fast failure (~1s vs 50s mid-test)
- Clear error messages
- Prevents "Worker exited unexpectedly"

#### Test Suite Performance

| Metric         | Before Optimization | After Optimization |
| -------------- | ------------------- | ------------------ |
| Duration       | 49s                 | 15s (70% faster)   |
| Exit Code      | 1 (with errors)     | 0 (clean pass)     |
| Worker Crashes | 1 unhandled error   | 0                  |

## Getting Help

If you encounter issues not covered here:

1. Check the [Brooklyn documentation](../README.md)
2. Review [BROOKLYN-SAFETY-PROTOCOLS.md](../../BROOKLYN-SAFETY-PROTOCOLS.md)
3. Check test logs: `/tmp/brooklyn-test-*.log`
4. Ask in the team chat with error details
5. File an issue with reproduction steps

Remember: Integration tests require a properly configured environment. When in doubt, run the preparation script!
