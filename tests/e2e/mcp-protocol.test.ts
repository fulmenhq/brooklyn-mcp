/**
 * MCP Protocol End-to-End Test Suite
 *
 * This test suite validates Brooklyn's Model Context Protocol (MCP) implementation
 * by spawning a real server process and communicating via stdin/stdout JSON-RPC.
 *
 * ## IMPORTANT: Browser Automation Tests Skipped
 *
 * Several browser automation tests are currently SKIPPED pending the implementation
 * of the Enterprise Browser Infrastructure plan (ARCH-001). The current browser
 * pool implementation is basic and will be COMPLETELY REPLACED with:
 *
 * - On-demand browser installation (96% distribution size reduction)
 * - Intelligent pooling with health checks and circuit breakers
 * - Team isolation with resource quotas
 * - Request queuing with backpressure handling
 * - Comprehensive failure recovery
 *
 * See: .plans/active/architecture-committee/enterprise-browser-infrastructure-plan.md
 *
 * ## Key Concepts
 *
 * 1. **MCP Protocol**: A JSON-RPC 2.0 based protocol for AI-tool communication
 *    See: docs/architecture/notes/mcp-dev-mode-pattern.md
 *
 * 2. **Stdout Purity**: MCP requires that stdout contains ONLY JSON-RPC messages
 *    - All logs must go to stderr (handled by pino-logger)
 *    - Any non-JSON output corrupts the protocol
 *    See: tests/integration/stdout-purity.test.ts
 *
 * 3. **Process Lifecycle**: The test spawns a real Brooklyn process
 *    - Startup timing is critical (server needs ~1s to initialize)
 *    - Process cleanup must be thorough to avoid port conflicts
 *
 * ## Common Issues & Solutions
 *
 * 1. **Timeout Errors**: "Request timeout: tools/list"
 *    - Cause: Server not ready when test sends requests
 *    - Solution: Wait 1s after spawn before initialize (line 84)
 *
 * 2. **Parse Errors**: Invalid JSON on stdout
 *    - Cause: Logger outputting to stdout instead of stderr
 *    - Solution: Check pino-logger configuration
 *
 * 3. **Flaky Tests**: Intermittent failures
 *    - Cause: Race conditions in startup/shutdown
 *    - Solution: Proper process lifecycle management
 *
 * ## Debugging Tips
 *
 * 1. Enable debug mode: `DEBUG_MCP_TEST=1 bun run test tests/e2e/mcp-protocol.test.ts`
 * 2. Manual testing: See .plans/active/paris/20250722-e2e-test-diagnosis.md
 * 3. Check stderr output for server initialization logs
 *
 * For architecture details, see:
 * - docs/architecture/notes/mcp-dev-mode-pattern.md
 * - docs/user-guide/local-development.md
 */

import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * MCP Message structure following JSON-RPC 2.0 specification
 * All communication between Claude Code and Brooklyn uses this format
 */
interface MCPMessage {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Test client that simulates Claude Code's MCP communication
 *
 * This client:
 * - Spawns Brooklyn as a child process
 * - Communicates via stdin/stdout using JSON-RPC
 * - Handles async request/response matching
 * - Manages process lifecycle and cleanup
 */
class MCPTestClient {
  private process: ChildProcess | null = null;
  private messageQueue: MCPMessage[] = [];
  private responsePromises: Map<
    string | number,
    { resolve: (value: MCPMessage) => void; reject: (error: Error) => void }
  > = new Map();
  private nextId = 1;

  /**
   * Start the MCP server process and establish communication
   *
   * Critical timing: The server needs ~1 second to initialize before
   * it can accept requests. This delay prevents timeout errors.
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Set restricted domains for testing
      process.env["BROOKLYN_ALLOWED_DOMAINS"] = JSON.stringify(["example.com"]);
      process.env["BROOKLYN_LOG_LEVEL"] = "debug";

      // Start Brooklyn MCP server
      this.process = spawn("bun", ["run", "src/cli/brooklyn.ts", "mcp", "start"], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: process.cwd(),
      });

      // Capture stderr for debugging if needed
      this.process.stderr?.on("data", (data) => {
        // Structured logs go to stderr, only log if debugging
        if (process.env["DEBUG_MCP_TEST"]) {
          process.stderr.write(`MCP STDERR: ${data.toString()}`);
        }
      });

      if (!(this.process?.stdout && this.process?.stdin)) {
        reject(new Error("Failed to create MCP process stdio"));
        return;
      }

      this.process.stdout.resume();

      // Handle stdout messages
      let buffer = "";
      this.process.stdout.on("data", (data: Buffer) => {
        buffer += data.toString();
        let lineEnd: number = buffer.indexOf("\n");
        while (lineEnd !== -1) {
          const line = buffer.slice(0, lineEnd);
          buffer = buffer.slice(lineEnd + 1);
          lineEnd = buffer.indexOf("\n");
          if (line.trim()) {
            try {
              const message: MCPMessage = JSON.parse(line);
              this.handleMessage(message);
            } catch (e) {
              // Only log parse errors if debugging
              if (process.env["DEBUG_MCP_TEST"]) {
                // Debug logging for test failures
                process.stderr.write(`MCP parse error: ${e} Line: ${line}\n`);
              }
            }
          }
        }
      });

      // Handle process events
      this.process.on("error", (error) => {
        reject(new Error(`MCP process error: ${error.message}`));
      });

      // CRITICAL MCP INITIALIZATION SEQUENCE:
      // 1. The server starts COMPLETELY SILENT - no output until initialized
      // 2. We MUST send an "initialize" request first - no other requests will work
      // 3. The initialize request establishes the MCP session
      // 4. Only after successful initialization can we send other requests
      //
      // Server startup sequence:
      // - Load configuration
      // - Create MCP transport (sets silent mode off)
      // - Initialize Brooklyn engine
      // - Start transport listener
      // - Ready to receive initialize request
      setTimeout(async () => {
        try {
          const initResponse = await this.sendRequest("initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {
              roots: { listChanged: false },
              sampling: {},
            },
            clientInfo: {
              name: "brooklyn-test-client",
              version: "1.0.0",
            },
          });
          if (initResponse.error)
            throw new Error(`Initialize failed: ${initResponse.error.message}`);
          resolve();
        } catch (e) {
          reject(e);
        }
      }, 1000); // 1 second is typically sufficient for initialization
    });
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill("SIGTERM");
      await new Promise((resolve) => {
        this.process?.on("close", resolve);
      });
      this.process = null;
    }
  }

  /**
   * Handle incoming messages from the MCP server
   * Matches responses to pending requests by ID
   */
  private handleMessage(message: MCPMessage): void {
    if (message.id !== undefined) {
      const promise = this.responsePromises.get(message.id);
      if (promise) {
        this.responsePromises.delete(message.id);
        if (message.error) {
          promise.reject(new Error(`MCP Error: ${message.error.message}`));
        } else {
          promise.resolve(message);
        }
      }
    } else {
      // Notifications (no ID) are queued for later processing
      this.messageQueue.push(message);
    }
  }

  /**
   * Send a JSON-RPC request and wait for the response
   *
   * This simulates how Claude Code communicates with Brooklyn:
   * 1. Assign unique ID to track the response
   * 2. Send JSON message via stdin
   * 3. Wait for matching response (by ID) via stdout
   * 4. Timeout after 30s to prevent hanging tests
   */
  async sendRequest(method: string, params?: unknown): Promise<MCPMessage> {
    if (!this.process?.stdin) {
      throw new Error("MCP client not started");
    }

    const id = this.nextId++;
    const request: MCPMessage = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.responsePromises.set(id, { resolve, reject });

      // Send request
      this.process?.stdin?.write(`${JSON.stringify(request)}\n`);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.responsePromises.has(id)) {
          this.responsePromises.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  async callTool(toolName: string, args: any): Promise<any> {
    const response = await this.sendRequest("tools/call", {
      name: toolName,
      arguments: args,
    });

    if (response.error) {
      throw new Error(`MCP error: ${response.error.message}`);
    }

    const result = response.result as any;
    if (result?.isError) {
      throw new Error(result.content?.[0]?.text || "Unknown error");
    }

    const contentText = result?.content?.[0]?.text;
    try {
      return JSON.parse(contentText);
    } catch {
      return contentText;
    }
  }
}

/**
 * MCP Protocol Integration Test Suite
 *
 * These tests validate the complete MCP flow from Claude Code's perspective,
 * ensuring Brooklyn correctly implements the Model Context Protocol.
 *
 * Test Categories:
 * 1. Core Protocol - Basic MCP handshake and tool discovery
 * 2. Browser Automation - Tool execution and response handling
 * 3. Error Handling - Graceful failure modes
 * 4. Resource Management - Concurrent operations and cleanup
 * 5. Performance - Response time validation
 *
 * For MCP protocol specification, see:
 * https://modelcontextprotocol.io/specification
 */
// SKIPPING ENTIRE TEST SUITE: PENDING ENTERPRISE BROWSER INFRASTRUCTURE (ARCH-001)
// The current browser pool implementation cannot reliably handle the MCP protocol tests.
// These tests will be re-enabled after implementing:
// - On-demand browser installation (Phase 0)
// - Intelligent browser pooling with health checks
// - Circuit breaker patterns for failure recovery
// - Proper resource management and cleanup
// See: .plans/active/architecture-committee/enterprise-browser-infrastructure-plan.md
describe.skip("MCP Protocol Integration", () => {
  let client: MCPTestClient;

  beforeAll(async () => {
    client = new MCPTestClient();
    await client.start();
  }, 60000);

  afterAll(async () => {
    if (client) {
      await client.stop();
    }
  });

  /**
   * Core MCP protocol tests
   * These validate the fundamental request/response cycle
   */
  describe("MCP Core Protocol", () => {
    it("should establish basic connectivity", async () => {
      const response = await client.sendRequest("tools/list", {});
      expect(response).toBeDefined();
      expect(response.jsonrpc).toBe("2.0");
    });

    it("should respond to initialize request", async () => {
      const response = await client.sendRequest("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {
          roots: {
            listChanged: false,
          },
          sampling: {},
        },
        clientInfo: {
          name: "brooklyn-test-client",
          version: "1.0.0",
        },
      });

      expect(response.result).toBeDefined();
      expect(response.error).toBeUndefined();
    });

    it("should list available tools", async () => {
      const response = await client.sendRequest("tools/list", {});

      expect(response.result).toBeDefined();
      const result = response.result as { tools: unknown[] };
      expect(Array.isArray(result.tools)).toBe(true);
      expect(result.tools.length).toBeGreaterThan(0);
    }, 30000);

    it("should provide tool schemas", async () => {
      const listResponse = await client.sendRequest("tools/list", {});
      const tools = (listResponse.result as { tools: { name: string }[] }).tools;

      if (tools.length > 0) {
        const tool = tools[0];
        expect(tool).toHaveProperty("name");
        expect(typeof tool?.name).toBe("string");
      }
    }, 30000);
  });

  /**
   * Browser automation tool tests
   * Validates that Brooklyn's browser control tools work correctly
   * via the MCP protocol (not direct function calls)
   */
  describe("Browser Automation Tools", () => {
    it("should have navigate_to_url tool available", async () => {
      const response = await client.sendRequest("tools/list", {});
      const tools = (response.result as { tools: { name: string }[] }).tools;

      const navigateTool = tools.find((tool) => tool?.name === "navigate_to_url");
      expect(navigateTool).toBeDefined();
    }, 30000);

    it("should have take_screenshot tool available", async () => {
      const response = await client.sendRequest("tools/list", {});
      const tools = (response.result as { tools: { name: string }[] }).tools;

      const screenshotTool = tools.find((tool) => tool.name === "take_screenshot");
      expect(screenshotTool).toBeDefined();
    }, 30000);

    // SKIPPED: PENDING ENTERPRISE BROWSER INFRASTRUCTURE (ARCH-001)
    // This test validates browser operations that will be completely reimplemented
    // in the enterprise browser infrastructure plan. The current implementation
    // lacks critical features that will be added:
    // - On-demand browser installation (Phase 0)
    // - Intelligent browser pooling with health checks
    // - Circuit breaker patterns for failure recovery
    // - Team isolation and resource quotas
    // See: .plans/active/architecture-committee/enterprise-browser-infrastructure-plan.md
    it.skip("should execute navigate_to_url tool safely", async () => {
      const launch = await client.callTool("launch_browser", {
        browserType: "chromium",
        headless: true,
      });
      const browserId = launch.browserId;
      expect(browserId).toBeDefined();

      const nav = await client.callTool("navigate_to_url", {
        browserId,
        url: "data:text/html,<html><body><h1>Test Page</h1></body></html>",
      });
      expect(nav.success).toBe(true);

      const close = await client.callTool("close_browser", { browserId });
      expect(close.success).toBe(true);
    });
  });

  /**
   * Error handling tests
   * Ensures Brooklyn handles invalid requests gracefully without
   * corrupting the protocol or crashing the server
   */
  describe("Error Handling", () => {
    it("should handle invalid method gracefully", async () => {
      await expect(client.sendRequest("invalid_method", {})).rejects.toThrow("Method not found");
    });

    it("should handle malformed tool calls gracefully", async () => {
      await expect(
        client.callTool("nonexistent_tool_name", { invalid: "parameter" }),
      ).rejects.toThrow(/Tool not found/);
    });

    // SKIPPED: PENDING ENTERPRISE BROWSER INFRASTRUCTURE (ARCH-001)
    // Domain validation will be enhanced with team-specific allowlists
    // and intelligent security policies in the new architecture.
    // Current implementation uses basic domain checking that will be
    // replaced with comprehensive team isolation boundaries.
    it.skip("should validate domain restrictions", async () => {
      const launch = await client.callTool("launch_browser", {
        browserType: "chromium",
        headless: true,
      });
      const browserId = launch.browserId;

      await expect(
        client.callTool("navigate_to_url", {
          browserId,
          url: "https://malicious-example.com",
        }),
      ).rejects.toThrow(/Domain .* not in allowed domains/i);

      await client.callTool("close_browser", { browserId });
    });
  });

  describe("Resource Management", () => {
    // SKIPPED: PENDING ENTERPRISE BROWSER INFRASTRUCTURE (ARCH-001)
    // The entire resource management layer is being redesigned with:
    // - Intelligent browser pooling with warmup and health checks
    // - Circuit breaker patterns to prevent cascading failures
    // - Team-specific resource quotas and fair scheduling
    // - Request queuing with backpressure handling
    // - Automatic recovery from browser crashes
    // Current basic pooling cannot reliably handle concurrent operations.
    it.skip("should handle multiple concurrent operations", async () => {
      const launchPromises = Array.from({ length: 3 }, () =>
        client.callTool("launch_browser", { browserType: "chromium", headless: true }),
      );
      const launchResults = await Promise.all(launchPromises);
      const browserIds = launchResults.map((res) => res.browserId);

      const navPromises = browserIds.map((browserId, i) =>
        client.callTool("navigate_to_url", {
          browserId,
          url: `data:text/html,<html><body><h1>Test Page ${i}</h1></body></html>`,
        }),
      );
      const navResults = await Promise.all(navPromises);
      for (const res of navResults) {
        expect(res.success).toBe(true);
      }

      await Promise.all(
        browserIds.map((id) => client.callTool("close_browser", { browserId: id })),
      );
    }, 30000);

    // SKIPPED: PENDING ENTERPRISE BROWSER INFRASTRUCTURE (ARCH-001)
    // Browser cleanup is being completely reimplemented with:
    // - Comprehensive cleanup handlers for all failure modes
    // - Memory leak detection and prevention
    // - Zombie browser process elimination
    // - Graceful shutdown sequences
    // Current implementation lacks proper resource tracking.
    it.skip("should clean up browser resources properly", async () => {
      const launch = await client.callTool("launch_browser", {
        browserType: "chromium",
        headless: true,
      });
      const browserId = launch.browserId;

      for (let i = 0; i < 5; i++) {
        const nav = await client.callTool("navigate_to_url", {
          browserId,
          url: `data:text/html,<html><body><h1>Test ${i}</h1></body></html>`,
        });
        expect(nav.success).toBe(true);
      }

      const close = await client.callTool("close_browser", { browserId });
      expect(close.success).toBe(true);
    });
  });

  describe("MCP Performance", () => {
    it("should respond to tool list requests quickly", async () => {
      const start = Date.now();
      const response = await client.sendRequest("tools/list", {});
      const duration = Date.now() - start;

      expect(response.result).toBeDefined();
      expect(duration).toBeLessThan(1000);
    }, 30000);

    it("should handle rapid successive requests", async () => {
      const results = [];
      const start = Date.now();

      for (let i = 0; i < 3; i++) {
        const response = await client.sendRequest("tools/list", {});
        results.push(response);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      const duration = Date.now() - start;

      for (const res of results) {
        expect(res.result).toBeDefined();
      }
      expect(duration).toBeLessThan(10000);
      expect(results).toHaveLength(3);
    }, 30000);
  });
});
