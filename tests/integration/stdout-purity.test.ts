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
 */

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
const TEST_TIMEOUT = 10000; // 10 seconds

describe("Architecture Committee: MCP Stdout Purity Tests", () => {
  beforeAll(() => {
    // Ensure test environment is clean
    process.env["BROOKLYN_LOG_LEVEL"] = "debug";
    process.env["BROOKLYN_TEST_MODE"] = "true";
  });

  afterAll(() => {
    // Cleanup test environment
    process.env["BROOKLYN_TEST_MODE"] = undefined;
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
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "stdout-purity-test",
            version: "1.0.0",
          },
        },
      };

      const result = await runMCPTest(JSON.stringify(initializeRequest));

      // CRITICAL: stdout must contain ONLY JSON-RPC response
      expect(result.stdout.trim()).toBeTruthy();

      // Validate JSON-RPC response structure
      const stdoutLines = result.stdout.trim().split("\n");
      expect(stdoutLines).toHaveLength(1); // Should be single JSON response

      const response: MCP_Message = JSON.parse(stdoutLines[0]!);
      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBe(1);
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
            // Validate structured log format
            expect(logEntry).toHaveProperty("timestamp");
            expect(logEntry).toHaveProperty("level");
            expect(logEntry).toHaveProperty("logger");
            expect(logEntry).toHaveProperty("message");
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
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0.0" },
          },
        }),
      );

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
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "multi-test", version: "1.0.0" },
          },
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
    let responseReceived = false;

    // Start Brooklyn MCP server as child process
    const child = spawn("bun", [BROOKLYN_PATH, "mcp", "start"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        BROOKLYN_LOG_LEVEL: "info", // Less verbose for testing
        BROOKLYN_TEST_MODE: "true",
      },
    });

    // Capture stdout (should be pure JSON-RPC)
    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();

      // Check if we received a complete JSON-RPC response
      if (stdout.includes('"jsonrpc":"2.0"') && !responseReceived) {
        responseReceived = true;
        // Give a small delay to capture any additional output
        setTimeout(() => {
          child.kill("SIGTERM");
        }, 100);
      }
    });

    // Capture stderr (should be structured logs)
    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    // Handle child process exit
    child.on("close", (code) => {
      const duration = Date.now() - startTime;
      resolve({
        stdout,
        stderr,
        exitCode: code,
        duration,
      });
    });

    // Handle child process errors
    child.on("error", (error) => {
      reject(new Error(`Child process error: ${error.message}`));
    });

    // Timeout protection
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(
        new Error(
          `Test timeout after ${TEST_TIMEOUT}ms. stdout: ${stdout.substring(0, 200)}, stderr: ${stderr.substring(0, 200)}`,
        ),
      );
    }, TEST_TIMEOUT);

    // Wait for server to start, then send request
    setTimeout(() => {
      if (child.stdin && !child.killed) {
        child.stdin.write(input);
        child.stdin.write("\n");
        // Keep stdin open for MCP protocol
      }
    }, 500);

    // Clear timeout when child exits
    child.on("close", () => {
      clearTimeout(timeout);
    });
  });
}
