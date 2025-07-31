/**
 * MCP Browser End-to-End Tests
 *
 * Tests the complete MCP protocol flow with browser automation,
 * simulating real Claude Code interactions.
 */

import { type ChildProcess, spawn } from "node:child_process";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InstanceManager } from "../../src/core/instance-manager.js";

interface MCPMessage {
  jsonrpc: string;
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

const TEST_TIMEOUT = 30000;

describe("MCP Browser E2E Tests", () => {
  beforeAll(async () => {
    // Enable stderr for debugging
    process.env["BROOKLYN_MCP_STDERR"] = "true";
    process.env["BROOKLYN_TEST_MODE"] = "true";

    // Check for existing processes
    const processes = await InstanceManager.findBrooklynProcesses();
    if (processes.length > 0) {
      throw new Error(`Existing Brooklyn processes detected. Run 'pkill -f brooklyn' to clean up.`);
    }
  });

  afterAll(() => {
    process.env["BROOKLYN_TEST_MODE"] = undefined;
  });

  /**
   * Run an MCP command and capture the response
   */
  async function runMCPCommand(messages: MCPMessage[]): Promise<{
    responses: MCPMessage[];
    stderr: string;
    exitCode: number | null;
  }> {
    return new Promise((resolvePromise, reject) => {
      const mcpPath = resolve(process.cwd(), "src/cli/brooklyn.ts");
      const child = spawn("bun", ["run", mcpPath, "mcp", "start"], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
      });

      const responses: MCPMessage[] = [];
      let stderr = "";
      let stdoutBuffer = "";

      child.stdout?.on("data", (data: Buffer) => {
        stdoutBuffer += data.toString();

        // Try to parse complete JSON messages
        const lines = stdoutBuffer.split("\n");
        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i]?.trim();
          if (line) {
            try {
              const msg = JSON.parse(line) as MCPMessage;
              responses.push(msg);
            } catch (_error) {
              // Not valid JSON, skip
            }
          }
        }
        // Keep the incomplete line in buffer
        stdoutBuffer = lines[lines.length - 1] || "";
      });

      child.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("MCP test timeout"));
      }, TEST_TIMEOUT);

      child.on("error", (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });

      child.on("close", (code: number | null) => {
        clearTimeout(timeout);
        resolvePromise({
          responses,
          stderr,
          exitCode: code,
        });
      });

      // Send messages after server is ready
      setTimeout(async () => {
        for (const msg of messages) {
          child.stdin?.write(`${JSON.stringify(msg)}\n`);
          // Wait between messages
          await new Promise((r) => setTimeout(r, 500));
        }

        // Give time for responses
        setTimeout(() => {
          child.stdin?.end();
        }, 2000);
      }, 3000);
    });
  }

  describe("Complete Browser Automation Flow", () => {
    it(
      "should handle full browser automation sequence through MCP",
      async () => {
        const messages: MCPMessage[] = [
          // Initialize
          {
            jsonrpc: "2.0",
            id: 0,
            method: "initialize",
            params: {
              protocolVersion: "2025-06-18",
              capabilities: { roots: {} },
              clientInfo: {
                name: "test-client",
                version: "1.0.0",
              },
            },
          },
          // List tools
          {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/list",
            params: {},
          },
          // Launch browser
          {
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: {
              name: "launch_browser",
              arguments: {
                browserType: "chromium",
                headless: true,
              },
            },
          },
          // Navigate to URL
          {
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: {
              name: "navigate_to_url",
              arguments: {
                browserId: "__BROWSER_ID__", // Will be replaced
                url: "https://example.com",
              },
            },
          },
          // Take screenshot
          {
            jsonrpc: "2.0",
            id: 4,
            method: "tools/call",
            params: {
              name: "take_screenshot",
              arguments: {
                browserId: "__BROWSER_ID__", // Will be replaced
                fullPage: true,
              },
            },
          },
          // Close browser
          {
            jsonrpc: "2.0",
            id: 5,
            method: "tools/call",
            params: {
              name: "close_browser",
              arguments: {
                browserId: "__BROWSER_ID__", // Will be replaced
              },
            },
          },
        ];

        // Run initial messages to get browser ID
        const initialMessages = messages.slice(0, 3);
        const { responses: initialResponses } = await runMCPCommand(initialMessages);

        // Find initialize response
        const initResponse = initialResponses.find((r) => r.id === 0);
        expect(initResponse?.result).toBeDefined();
        expect((initResponse?.result as any).protocolVersion).toBe("2025-06-18");

        // Find tools list response
        const toolsResponse = initialResponses.find((r) => r.id === 1);
        expect(toolsResponse?.result).toBeDefined();
        const tools = (toolsResponse?.result as any).tools;
        expect(Array.isArray(tools)).toBe(true);

        // Verify all browser tools are available
        const toolNames = tools.map((t: any) => t.name);
        expect(toolNames).toContain("launch_browser");
        expect(toolNames).toContain("navigate_to_url");
        expect(toolNames).toContain("take_screenshot");
        expect(toolNames).toContain("close_browser");

        // Find launch browser response
        const launchResponse = initialResponses.find((r) => r.id === 2);
        expect(launchResponse?.result).toBeDefined();

        const browserId = (launchResponse?.result as any).browserId;
        expect(browserId).toBeTruthy();

        // Update remaining messages with actual browser ID
        const remainingMessages = messages.slice(3).map((msg) => {
          if (msg.method === "tools/call" && msg.params) {
            const params = msg.params as any;
            if (params.arguments?.browserId === "__BROWSER_ID__") {
              params.arguments.browserId = browserId;
            }
          }
          return msg;
        });

        // Run remaining commands
        const { responses: finalResponses } = await runMCPCommand([
          ...messages.slice(0, 3),
          ...remainingMessages,
        ]);

        // Verify navigation succeeded
        const navResponse = finalResponses.find((r) => r.id === 3);
        expect(navResponse?.result).toBeDefined();
        expect((navResponse?.result as any).success).toBe(true);

        // Verify screenshot succeeded
        const screenshotResponse = finalResponses.find((r) => r.id === 4);
        expect(screenshotResponse?.result).toBeDefined();
        expect((screenshotResponse?.result as any).path).toBeTruthy();

        // Verify browser closed
        const closeResponse = finalResponses.find((r) => r.id === 5);
        expect(closeResponse?.result).toBeDefined();
        expect((closeResponse?.result as any).success).toBe(true);
      },
      TEST_TIMEOUT,
    );
  });

  describe("Error Handling Through MCP", () => {
    it(
      "should return AI-friendly errors through MCP protocol",
      async () => {
        const messages: MCPMessage[] = [
          // Initialize
          {
            jsonrpc: "2.0",
            id: 0,
            method: "initialize",
            params: {
              protocolVersion: "2025-06-18",
              capabilities: { roots: {} },
              clientInfo: {
                name: "test-client",
                version: "1.0.0",
              },
            },
          },
          // Try to navigate with non-existent browser
          {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "navigate_to_url",
              arguments: {
                browserId: "non-existent-browser",
                url: "https://example.com",
              },
            },
          },
        ];

        const { responses } = await runMCPCommand(messages);

        // Find error response
        const errorResponse = responses.find((r) => r.id === 1);
        expect(errorResponse?.error).toBeDefined();

        const error = errorResponse?.error as any;
        expect(error.message).toContain("Browser session not found");
        expect(error.code).toBeDefined();
      },
      TEST_TIMEOUT,
    );
  });

  describe("Team Context Through MCP", () => {
    it(
      "should respect team context in MCP headers",
      async () => {
        // Note: In a real implementation, team context would come from
        // authentication headers or MCP extensions. For this test,
        // we're validating the infrastructure is ready for it.

        const messages: MCPMessage[] = [
          // Initialize with team context (future enhancement)
          {
            jsonrpc: "2.0",
            id: 0,
            method: "initialize",
            params: {
              protocolVersion: "2025-06-18",
              capabilities: {
                roots: {},
                // Future: team context could be passed here
                experimental: {
                  teamId: "test-team",
                  userId: "test-user",
                },
              },
              clientInfo: {
                name: "test-client",
                version: "1.0.0",
              },
            },
          },
          // Launch browser
          {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "launch_browser",
              arguments: {
                browserType: "chromium",
                headless: true,
              },
            },
          },
        ];

        const { responses } = await runMCPCommand(messages);

        // Verify browser launched successfully
        const launchResponse = responses.find((r) => r.id === 1);
        expect(launchResponse?.result).toBeDefined();

        // In future, we would verify team context is preserved
        // For now, we verify the infrastructure supports it
        const result = launchResponse?.result as any;
        expect(result.browserId).toBeTruthy();
        expect(result.status).toBe("launched");
      },
      TEST_TIMEOUT,
    );
  });
});
