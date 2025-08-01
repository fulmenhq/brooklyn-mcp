/**
 * Integration tests for Brooklyn HTTP Mode
 * Tests REST API endpoints and MCP protocol over HTTP
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BrooklynHTTP } from "../../src/core/brooklyn-http.js";

describe("Brooklyn HTTP Mode Integration", () => {
  let httpServer: BrooklynHTTP;
  let baseUrl: string;
  const testPort = 8081; // Different port to avoid conflicts

  beforeAll(async () => {
    // Start HTTP server for testing
    httpServer = new BrooklynHTTP({
      port: testPort,
      host: "127.0.0.1",
      cors: true,
      teamId: "http-test",
    });

    baseUrl = `http://127.0.0.1:${testPort}`;
    await httpServer.start();

    // Wait a moment for server to be fully ready
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    if (httpServer) {
      await httpServer.stop();
    }
  });

  describe("Health and Status Endpoints", () => {
    it("should return health check", async () => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        status: "healthy",
        version: "1.3.3",
        tools: expect.any(Number),
        teamId: "http-test",
      });
      expect(data.executionTime).toBeGreaterThanOrEqual(0);
      expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("should return metrics", async () => {
      const response = await fetch(`${baseUrl}/metrics`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        memory: {
          rss: expect.stringMatching(/^\d+MB$/),
          heapUsed: expect.stringMatching(/^\d+MB$/),
          heapTotal: expect.stringMatching(/^\d+MB$/),
        },
        uptime: expect.stringMatching(/^\d+s$/),
        version: "1.3.3",
        tools: expect.any(Number),
      });
    });
  });

  describe("Tools Endpoints", () => {
    it("should list available tools", async () => {
      const response = await fetch(`${baseUrl}/tools`);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.tools).toBeInstanceOf(Array);
      expect(data.data.total).toBeGreaterThan(0);

      // Check that we have expected browser tools
      const toolNames = data.data.tools.map((tool: any) => tool.name);
      expect(toolNames).toContain("launch_browser");
      expect(toolNames).toContain("navigate_to_url");
      expect(toolNames).toContain("take_screenshot");
      expect(toolNames).toContain("close_browser");
    });

    it("should call brooklyn_status tool successfully", async () => {
      const response = await fetch(`${baseUrl}/tools/brooklyn_status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          arguments: {},
        }),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.executionTime).toBeGreaterThanOrEqual(0);
    });

    it("should return 404 for unknown tool", async () => {
      const response = await fetch(`${baseUrl}/tools/nonexistent_tool`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          arguments: {},
        }),
      });

      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain("Tool not found: nonexistent_tool");
    });

    it("should handle malformed JSON in request body", async () => {
      const response = await fetch(`${baseUrl}/tools/brooklyn_status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: "invalid json",
      });

      expect(response.status).toBe(500);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain("Invalid JSON");
    });
  });

  describe("MCP Protocol Endpoint", () => {
    it("should handle MCP tools/list request", async () => {
      const mcpRequest = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(mcpRequest),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.jsonrpc).toBe("2.0");
      expect(data.id).toBe(1);
      expect(data.result.tools).toBeInstanceOf(Array);
      expect(data.result.tools.length).toBeGreaterThan(0);
    });

    it("should handle MCP tools/call request", async () => {
      const mcpRequest = {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "brooklyn_status",
          arguments: {},
        },
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(mcpRequest),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.jsonrpc).toBe("2.0");
      expect(data.id).toBe(2);
      expect(data.result).toBeDefined();
    });

    it("should return error for unsupported MCP method", async () => {
      const mcpRequest = {
        jsonrpc: "2.0",
        id: 3,
        method: "unsupported/method",
        params: {},
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(mcpRequest),
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain("Unsupported MCP method: unsupported/method");
    });

    it("should handle malformed MCP request", async () => {
      const invalidRequest = {
        // Missing required fields
        method: "tools/list",
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(invalidRequest),
      });

      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain("Invalid MCP request format");
    });
  });

  describe("CORS Headers", () => {
    it("should include CORS headers in responses", async () => {
      const response = await fetch(`${baseUrl}/health`);

      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.headers.get("access-control-allow-methods")).toContain("GET");
      expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    });

    it("should handle OPTIONS preflight request", async () => {
      const response = await fetch(`${baseUrl}/tools`, {
        method: "OPTIONS",
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.headers.get("access-control-allow-methods")).toContain("GET");
      expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    });
  });

  describe("Error Handling", () => {
    it("should return 404 for unknown endpoints", async () => {
      const response = await fetch(`${baseUrl}/unknown`);
      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain("Not found: GET /unknown");
    });

    it("should return proper content-type headers", async () => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.headers.get("content-type")).toBe("application/json");
    });
  });
});
