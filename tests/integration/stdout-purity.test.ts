/**
 * Architecture Committee v2: Automated stdout purity tests
 *
 * CRITICAL: Prevents MCP protocol regressions by validating that Brooklyn MCP server
 * maintains zero stdout contamination. This is essential for Claude Code integration.
 *
 * Test Strategy:
 * - Child process MCP testing with separate stdout/stderr capture
 * - JSON-RPC purity validation on stdout
 * - Structured log routing verification on stderr
 * - Regression prevention for Architecture Committee compliance
 *
 * CI/CD Requirements:
 * - Tests will fail if existing Brooklyn processes are running
 * - In CI/CD environments, run cleanup before tests: pkill -f brooklyn
 * - This ensures tests reflect real-world conditions
 * - Local developers must manage their Brooklyn instances properly
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InstanceManager } from "../../src/core/instance-manager.js";

interface MCP_Message {
  jsonrpc: string;
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

interface TestResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  duration: number;
}

// Test configuration
const BROOKLYN_PATH = resolve(process.cwd(), "src", "cli", "brooklyn.ts");
const TEST_TIMEOUT = 60000; // 60 seconds

// CRITICAL: Sequential execution prevents timing races between child processes
// and makes logs easier to follow. Heavy child-process tests should never run
// in parallel as they can cause tinypool worker crashes from resource contention.
describe.sequential("Architecture Committee: MCP Stdout Purity Tests", () => {
  beforeAll(async () => {
    // Enable stderr for tests to pass expect(stderr).toBeTruthy()
    process.env["BROOKLYN_MCP_STDERR"] = "true";

    // Ensure test environment is clean
    process.env["BROOKLYN_LOG_LEVEL"] = "debug";
    process.env["BROOKLYN_TEST_MODE"] = "true";

    // CRITICAL: Force cleanup of any lingering processes from other tests
    const instanceManager = new InstanceManager();

    // Cleanup all Brooklyn processes first with timeout
    await Promise.race([
      instanceManager.cleanupAllProcesses(),
      new Promise((resolve) => setTimeout(resolve, 5000)), // 5s timeout
    ]);

    // Wait for processes to fully terminate (bounded)
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Force cleanup of common test ports that might be in use
    const { execSync } = await import("node:child_process");
    try {
      // Kill any processes using common MCP ports
      execSync("lsof -ti:3000,3001,3002,8080,8081 | xargs kill -9 2>/dev/null || true", {
        stdio: "ignore",
      });
    } catch {
      // Ignore port cleanup errors
    }

    // Wait for port cleanup
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Check for existing Brooklyn processes after cleanup
    try {
      const processes = await InstanceManager.findBrooklynProcesses();

      if (processes.length > 0) {
        throw new Error(
          `\n\nExisting Brooklyn server processes detected after cleanup. Please clean up manually:\n${processes.join("\n")}\n\nRun one of:\n  - bun run server:cleanup  (for production server)\n  - bun run dev:brooklyn:cleanup  (for dev mode)\n  - pkill -f 'brooklyn mcp'  (manual cleanup)\n\n`,
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("Existing Brooklyn")) {
        throw error;
      }
      // Ignore other errors from process detection
    }
  });

  afterAll(async () => {
    // Cleanup test environment
    process.env["BROOKLYN_TEST_MODE"] = undefined;
    process.env["BROOKLYN_MCP_STDERR"] = undefined;

    // Ensure all test-spawned processes are cleaned up with timeout
    const instanceManager = new InstanceManager();
    await Promise.race([
      instanceManager.cleanupAllProcesses(),
      new Promise((resolve) => setTimeout(resolve, 3000)), // 3s timeout
    ]);

    // Small delay to ensure cleanup completes (bounded)
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  /**
   * CRITICAL TEST: MCP Initialize Request Purity
   *
   * Architecture Committee Requirement: Initialize request must return pure JSON-RPC
   * on stdout with all logging routed to stderr.
   */
  it(
    "should maintain stdout purity during MCP initialize",
    async () => {
      const initializeRequest = {
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: { roots: {} },
          clientInfo: {
            name: "claude-code",
            version: "1.0.61",
          },
        },
        jsonrpc: "2.0",
        id: 0,
      };

      const result = await runMCPTest(JSON.stringify(initializeRequest));

      // Check if server exited due to existing instance
      if (result.exitCode === 1 && !result.stdout && !result.stderr) {
        throw new Error(
          "MCP server exited immediately (exit code 1). This usually means another Brooklyn instance is running.\n" +
            "Run 'pkill -f brooklyn' to clean up, then try again.",
        );
      }

      // CRITICAL: stdout must contain ONLY JSON-RPC response
      expect(result.stdout.trim()).toBeTruthy();

      // Validate JSON-RPC response structure
      const stdoutLines = result.stdout.trim().split("\n");
      expect(stdoutLines).toHaveLength(1); // Should be single JSON response

      const response: MCP_Message = JSON.parse(stdoutLines[0]!);
      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBe(0);
      expect(response.result).toBeDefined();
      expect(response.result).toHaveProperty("protocolVersion");
      expect(response.result).toHaveProperty("capabilities");

      // CRITICAL: All logging must go to stderr
      expect(result.stderr).toBeTruthy();

      // Verify structured logging format on stderr
      const stderrLines = result.stderr.trim().split("\n");
      let validLogCount = 0;

      for (const line of stderrLines) {
        if (line.trim()) {
          try {
            const logEntry = JSON.parse(line);
            // Validate Pino structured log format
            expect(logEntry).toHaveProperty("time"); // Pino uses 'time' not 'timestamp'
            expect(logEntry).toHaveProperty("level"); // Pino uses numeric levels
            expect(logEntry).toHaveProperty("module"); // Pino child logger with module
            expect(logEntry).toHaveProperty("msg"); // Pino uses 'msg' not 'message'
            validLogCount++;
          } catch (_parseError) {
            // Non-JSON stderr line (may be acceptable debug output)
            // Skip logging to maintain test console purity
          }
        }
      }

      // Should have some structured logs
      expect(validLogCount).toBeGreaterThan(0);
    },
    TEST_TIMEOUT,
  );

  /**
   * CRITICAL TEST: Tool Discovery Request Purity
   *
   * Architecture Committee Requirement: Tool discovery must maintain JSON-RPC purity
   * even during complex operations.
   */
  it(
    "should maintain stdout purity during tool discovery",
    async () => {
      const toolsRequest = {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      };

      // First initialize the session
      const initResult = await runMCPTest(
        JSON.stringify({
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: { roots: {} },
            clientInfo: { name: "claude-code", version: "1.0.61" },
          },
          jsonrpc: "2.0",
          id: 0,
        }),
      );

      // Check if server exited due to existing instance
      if (initResult.exitCode === 1 && !initResult.stdout && !initResult.stderr) {
        throw new Error(
          "MCP server exited immediately (exit code 1). This usually means another Brooklyn instance is running.\n" +
            "Run 'pkill -f brooklyn' to clean up, then try again.",
        );
      }

      // Process may exit with null (SIGTERM) or 0 (normal exit) - both are acceptable
      expect(initResult.exitCode === 0 || initResult.exitCode === null).toBe(true);

      // Then test tools/list
      const result = await runMCPTest(JSON.stringify(toolsRequest));

      // Validate stdout contains only JSON-RPC
      const stdoutLines = result.stdout
        .trim()
        .split("\n")
        .filter((line) => line.trim());
      expect(stdoutLines.length).toBe(1);

      const response: MCP_Message = JSON.parse(stdoutLines[0]!);
      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBe(2);
      expect(response.result).toBeDefined();
      expect(response.result).toHaveProperty("tools");

      // Verify stderr contains structured logs
      expect(result.stderr).toBeTruthy();
    },
    TEST_TIMEOUT,
  );

  /**
   * ARCHITECTURE COMMITTEE TEST: Multi-Request Session Purity
   *
   * Tests that complex MCP sessions maintain purity across multiple requests.
   */
  it(
    "should maintain purity across multiple MCP requests",
    async () => {
      const requests = [
        {
          method: "initialize",
          params: {
            protocolVersion: "2025-06-18",
            capabilities: { roots: {} },
            clientInfo: { name: "claude-code", version: "1.0.61" },
          },
          jsonrpc: "2.0",
          id: 0,
        },
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        },
      ];

      const requestInput = requests.map((req) => JSON.stringify(req)).join("\n");
      const result = await runMCPTest(requestInput);

      // Parse all stdout responses
      const stdoutLines = result.stdout
        .trim()
        .split("\n")
        .filter((line) => line.trim());
      expect(stdoutLines.length).toBeGreaterThanOrEqual(1);

      // Each line should be valid JSON-RPC
      for (const line of stdoutLines) {
        const response: MCP_Message = JSON.parse(line);
        expect(response.jsonrpc).toBe("2.0");
        expect(response.id).toBeDefined();
      }

      // Stderr should contain structured logs from all operations
      expect(result.stderr).toBeTruthy();
      const stderrLines = result.stderr.trim().split("\n");
      expect(stderrLines.length).toBeGreaterThan(0);
    },
    TEST_TIMEOUT * 2,
  );

  /**
   * REGRESSION TEST: Error Condition Purity
   *
   * Ensures that even error conditions maintain stdout purity.
   */
  it(
    "should maintain purity even during error conditions",
    async () => {
      const invalidRequest = {
        jsonrpc: "2.0",
        id: 3,
        method: "invalid/method",
        params: {},
      };

      const result = await runMCPTest(JSON.stringify(invalidRequest));

      // Stdout should still contain only JSON-RPC (error response)
      const stdoutLines = result.stdout
        .trim()
        .split("\n")
        .filter((line) => line.trim());
      if (stdoutLines.length > 0) {
        const response: MCP_Message = JSON.parse(stdoutLines[0]!);
        expect(response.jsonrpc).toBe("2.0");
        expect(response.id).toBe(3);
        // Should have either result or error, not both
        expect(response.result || response.error).toBeDefined();
      }

      // Error details should go to stderr
      expect(result.stderr).toBeTruthy();
    },
    TEST_TIMEOUT,
  );
});

/**
 * Run MCP test with child process isolation
 *
 * @param input - JSON-RPC request(s) to send to MCP server
 * @returns Test result with separated stdout/stderr
 */
async function runMCPTest(input: string): Promise<TestResult> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let stdout = "";
    let stderr = "";
    let childClosed = false;
    let serverReady = false;

    // Spawning child process
    const child = spawn("bun", [BROOKLYN_PATH, "mcp", "start"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        BROOKLYN_LOG_LEVEL: "info",
        BROOKLYN_TEST_MODE: "true",
      },
    });

    // DIAGNOSTIC: Log child PID and input payload for debugging hung tests
    if (process.env["DEBUG_STDOUT_PURITY"]) {
      // biome-ignore lint/suspicious/noConsole: Debug diagnostic output for test failures
      console.error(
        `[runMCPTest] Spawned child PID=${child.pid}, input=${input.substring(0, 100)}...`,
      );
    }

    child.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
    });

    // CRITICAL: Listen for mcp-stdio-ready signal to eliminate timing races
    // Instead of blindly waiting 3s, we wait until the server explicitly signals
    // that the transport is listening and ready for requests.
    child.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;

      // Check for ready signal in this chunk
      if (!serverReady && chunk.includes('"msg":"mcp-stdio-ready"')) {
        serverReady = true;
        if (process.env["DEBUG_STDOUT_PURITY"]) {
          // biome-ignore lint/suspicious/noConsole: Debug diagnostic output for test failures
          console.error(`[runMCPTest] PID=${child.pid} signaled ready, sending input now`);
        }
        // Server is ready, send input immediately
        sendInput();
      }
    });

    child.on("close", (code) => {
      const duration = Date.now() - startTime;
      childClosed = true;
      clearTimeout(timeout);
      resolve({
        stdout,
        stderr,
        exitCode: code,
        duration,
      });
    });

    child.on("spawn", () => {});
    child.on("error", (err) => {
      childClosed = true;
      clearTimeout(timeout);
      reject(new Error(`Child process error: ${err.message}`));
    });
    child.on("exit", () => {});

    const timeout = setTimeout(() => {
      // DIAGNOSTIC: Log timeout occurrence
      if (process.env["DEBUG_STDOUT_PURITY"]) {
        // biome-ignore lint/suspicious/noConsole: Debug diagnostic output for test failures
        console.error(
          `[runMCPTest] Test timeout after ${TEST_TIMEOUT}ms, PID=${child.pid}, killing...`,
        );
      }

      // First try SIGTERM for graceful shutdown
      child.kill("SIGTERM");

      // CRITICAL: If process doesn't close within 1s, force kill with SIGKILL
      // This prevents lingering processes that cause "Worker exited unexpectedly"
      setTimeout(() => {
        if (!childClosed && child.pid) {
          if (process.env["DEBUG_STDOUT_PURITY"]) {
            // biome-ignore lint/suspicious/noConsole: Debug diagnostic output for test failures
            console.error(`[runMCPTest] Force killing PID=${child.pid} with SIGKILL`);
          }
          try {
            process.kill(child.pid, "SIGKILL");
          } catch (_err) {
            // Process might have already exited
          }
        }
      }, 1000);

      reject(new Error(`Test timeout after ${TEST_TIMEOUT}ms`));
    }, TEST_TIMEOUT);

    // Helper function to send input to child stdin
    let inputSent = false;
    const sendInput = () => {
      if (inputSent || !child.stdin || child.killed) return;
      inputSent = true;

      if (process.env["DEBUG_STDOUT_PURITY"]) {
        // biome-ignore lint/suspicious/noConsole: Debug diagnostic output for test failures
        console.error(`[runMCPTest] Writing to stdin: ${input.substring(0, 100)}...`);
      }

      child.stdin.write(`${input}\n`);

      // OPTIMIZED: Reduced from 3s to 1s drain delay
      setTimeout(() => {
        if (!child.killed && child.stdin) {
          child.stdin.end();
        }
      }, 1000);
    };

    // FALLBACK: If ready signal never arrives, send input after 3s anyway
    // This maintains backwards compatibility if the ready signal fails for any reason.
    // Once the server is mature, this timeout could be reduced further or removed entirely.
    const fallbackTimer = setTimeout(() => {
      if (!(serverReady || inputSent)) {
        if (process.env["DEBUG_STDOUT_PURITY"]) {
          // biome-ignore lint/suspicious/noConsole: Debug diagnostic output for test failures
          console.error(
            `[runMCPTest] PID=${child.pid} ready signal timeout, falling back to blind send`,
          );
        }
        sendInput();
      }
    }, 3000);

    child.on("close", () => {
      clearTimeout(timeout);
      clearTimeout(fallbackTimer);
    });
  });
}
