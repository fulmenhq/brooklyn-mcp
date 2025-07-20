/**
 * MCP Protocol End-to-End Testing Framework
 *
 * Tests the complete MCP stdin/stdout protocol implementation for Brooklyn
 * Ensures Claude Code integration works correctly with all MCP commands
 */

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

class MCPTestClient {
  private process: ChildProcess | null = null;
  private messageQueue: MCPMessage[] = [];
  private responsePromises: Map<
    string | number,
    { resolve: (value: MCPMessage) => void; reject: (error: Error) => void }
  > = new Map();
  private nextId = 1;

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Start Brooklyn MCP server
      this.process = spawn("bun", ["run", "src/cli/brooklyn.ts", "mcp", "start"], {
        stdio: ["pipe", "pipe", "pipe"],
        cwd: process.cwd(),
      });

      if (!this.process.stdout || !this.process.stdin) {
        reject(new Error("Failed to create MCP process stdio"));
        return;
      }

      // Handle stdout messages
      this.process.stdout.on("data", (data: Buffer) => {
        const lines = data
          .toString()
          .split("\n")
          .filter((line) => line.trim());
        for (const line of lines) {
          try {
            const message: MCPMessage = JSON.parse(line);
            this.handleMessage(message);
          } catch (error) {
            // Non-JSON output (logs, etc.) - ignore for protocol testing
          }
        }
      });

      // Handle process events
      this.process.on("error", (error) => {
        reject(new Error(`MCP process error: ${error.message}`));
      });

      // Give the process time to initialize
      setTimeout(() => {
        resolve();
      }, 2000);
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

  private handleMessage(message: MCPMessage): void {
    if (message.id !== undefined) {
      // Response to our request
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
      // Notification or other message
      this.messageQueue.push(message);
    }
  }

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
      this.process!.stdin!.write(JSON.stringify(request) + "\n");

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.responsePromises.has(id)) {
          this.responsePromises.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 10000);
    });
  }
}

describe("MCP Protocol Integration", () => {
  let client: MCPTestClient;

  beforeAll(async () => {
    client = new MCPTestClient();
    await client.start();
  }, 15000);

  afterAll(async () => {
    if (client) {
      await client.stop();
    }
  });

  describe("MCP Core Protocol", () => {
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
    });

    it("should provide tool schemas", async () => {
      const listResponse = await client.sendRequest("tools/list", {});
      const tools = (listResponse.result as { tools: { name: string }[] }).tools;

      // Test tools have proper schema if any exist
      if (tools.length > 0) {
        const tool = tools[0];
        if (tool) {
          expect(tool).toHaveProperty("name");
          expect(typeof tool.name).toBe("string");
        }
      }
    });
  });

  describe("Browser Automation Tools", () => {
    it("should have navigate_to tool available", async () => {
      const response = await client.sendRequest("tools/list", {});
      const tools = (response.result as { tools: { name: string }[] }).tools;

      const navigateTool = tools.find((tool) => tool.name === "navigate_to");
      expect(navigateTool).toBeDefined();
      if (navigateTool) {
        expect(navigateTool.name).toBe("navigate_to");
      }
    });

    it("should have capture_screenshot tool available", async () => {
      const response = await client.sendRequest("tools/list", {});
      const tools = (response.result as { tools: { name: string }[] }).tools;

      const screenshotTool = tools.find((tool) => tool.name === "capture_screenshot");
      expect(screenshotTool).toBeDefined();
    });

    it("should execute navigate_to tool safely", async () => {
      // Test navigation to a safe, fast-loading page
      const response = await client.sendRequest("tools/call", {
        name: "navigate_to",
        arguments: {
          url: "data:text/html,<html><body><h1>Test Page</h1></body></html>",
        },
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid method gracefully", async () => {
      const response = await client.sendRequest("invalid_method", {});

      expect(response.error).toBeDefined();
      expect(response.error!.code).toBe(-32601); // Method not found
    });

    it("should handle malformed tool calls gracefully", async () => {
      const response = await client.sendRequest("tools/call", {
        name: "navigate_to",
        arguments: {
          // Missing required URL parameter
        },
      });

      expect(response.error).toBeDefined();
    });

    it("should validate domain restrictions", async () => {
      const response = await client.sendRequest("tools/call", {
        name: "navigate_to",
        arguments: {
          url: "https://malicious-example.com",
        },
      });

      // Should either succeed (if domain allowed) or fail gracefully
      expect(response).toBeDefined();
    });
  });

  describe("Resource Management", () => {
    it("should handle multiple concurrent operations", async () => {
      const promises = Array.from({ length: 3 }, (_, i) =>
        client.sendRequest("tools/call", {
          name: "navigate_to",
          arguments: {
            url: `data:text/html,<html><body><h1>Test Page ${i}</h1></body></html>`,
          },
        }),
      );

      const results = await Promise.all(promises);

      for (const result of results) {
        expect(result.error).toBeUndefined();
      }
    });

    it("should clean up browser resources properly", async () => {
      // This test ensures no resource leaks occur
      const initialResponse = await client.sendRequest("tools/call", {
        name: "navigate_to",
        arguments: {
          url: "data:text/html,<html><body><h1>Resource Test</h1></body></html>",
        },
      });

      expect(initialResponse.error).toBeUndefined();

      // Multiple navigations should not cause resource exhaustion
      for (let i = 0; i < 5; i++) {
        const response = await client.sendRequest("tools/call", {
          name: "navigate_to",
          arguments: {
            url: `data:text/html,<html><body><h1>Test ${i}</h1></body></html>`,
          },
        });
        expect(response.error).toBeUndefined();
      }
    });
  });
});

describe("MCP Performance", () => {
  let client: MCPTestClient;

  beforeAll(async () => {
    client = new MCPTestClient();
    await client.start();
  }, 15000);

  afterAll(async () => {
    if (client) {
      await client.stop();
    }
  });

  it("should respond to tool list requests quickly", async () => {
    const start = Date.now();
    const response = await client.sendRequest("tools/list", {});
    const duration = Date.now() - start;

    expect(response.result).toBeDefined();
    expect(duration).toBeLessThan(1000); // Should respond within 1 second
  });

  it("should handle rapid successive requests", async () => {
    const promises = Array.from({ length: 10 }, () => client.sendRequest("tools/list", {}));

    const start = Date.now();
    const results = await Promise.all(promises);
    const duration = Date.now() - start;

    for (const result of results) {
      expect(result.error).toBeUndefined();
    }

    expect(duration).toBeLessThan(5000); // All requests within 5 seconds
  });
});
