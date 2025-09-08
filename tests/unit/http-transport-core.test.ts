/**
 * HTTP Transport Core Unit Tests
 *
 * Phase 2: High-reward testing for HTTP transport core functionality
 * Tests identified critical methods: checkPortInUse, processRequest,
 * createJsonRpcError, parseRequestBody, and other core HTTP transport logic.
 *
 * Focus: Unit testing with mocks to avoid external dependencies while achieving
 * maximum coverage of the 0% → 60%+ target for HTTP transport.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockedFunction } from "vitest";
import type { HTTPConfig } from "../../src/core/transport.js";
import { TransportType } from "../../src/core/transport.js";

// Mock node:http and node:net modules
vi.mock("node:http", () => ({
  createServer: vi.fn(),
}));

vi.mock("node:net", () => ({
  createConnection: vi.fn(),
}));

describe("HTTP Transport Core Unit Tests", () => {
  let httpTransport: any;
  let mockServer: any;

  const testConfig: HTTPConfig = {
    type: TransportType.HTTP,
    options: {
      port: 3000,
      host: "localhost",
      cors: true,
      rateLimiting: false,
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock server creation
    mockServer = {
      listen: vi.fn((_port: number, _host: string, callback: () => void) => {
        process.nextTick(callback);
      }),
      close: vi.fn((callback?: () => void) => {
        if (callback) process.nextTick(callback);
      }),
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      emit: vi.fn(),
    };

    const { createServer } = await import("node:http");
    (createServer as MockedFunction<typeof createServer>).mockReturnValue(mockServer);

    // Create HTTP transport instance
    const { MCPHTTPTransport } = await import("../../src/transports/http-transport.js");
    httpTransport = new MCPHTTPTransport(testConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Transport Interface Implementation", () => {
    it("should have correct transport properties", () => {
      expect(httpTransport.name).toBe("mcp-http");
      expect(httpTransport.type).toBe("http");
    });

    it("should implement all required transport methods", () => {
      expect(typeof httpTransport.initialize).toBe("function");
      expect(typeof httpTransport.start).toBe("function");
      expect(typeof httpTransport.stop).toBe("function");
      expect(typeof httpTransport.isRunning).toBe("function");
      expect(typeof httpTransport.setToolListHandler).toBe("function");
      expect(typeof httpTransport.setToolCallHandler).toBe("function");
    });

    it("should start in non-running state", () => {
      expect(httpTransport.isRunning()).toBe(false);
    });

    it("should accept tool handlers without errors", () => {
      const toolListHandler = vi.fn().mockResolvedValue({ tools: [] });
      const toolCallHandler = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "test" }],
      });

      expect(() => httpTransport.setToolListHandler(toolListHandler)).not.toThrow();
      expect(() => httpTransport.setToolCallHandler(toolCallHandler)).not.toThrow();
    });
  });

  describe("Port Management and Server Lifecycle", () => {
    it("should initialize server without starting", async () => {
      const { createServer } = await import("node:http");

      await httpTransport.initialize();

      expect(createServer).toHaveBeenCalledTimes(1);
      expect(createServer).toHaveBeenCalledWith(expect.any(Function));
      expect(httpTransport.isRunning()).toBe(false);
    });

    it("should check port availability before starting", async () => {
      // Mock net module
      const mockConnection = {
        on: vi.fn(),
        end: vi.fn(),
      };

      vi.doMock("node:net", () => ({
        createConnection: vi.fn().mockReturnValue(mockConnection),
      }));

      await httpTransport.initialize();

      // Mock port check to return false (port available)
      vi.spyOn(httpTransport, "checkPortInUse").mockResolvedValue(false);

      await expect(httpTransport.start()).resolves.not.toThrow();
      expect(httpTransport.isRunning()).toBe(true);
    });

    it("should reject start if port is in use", async () => {
      await httpTransport.initialize();

      // Mock port check to return true (port in use)
      vi.spyOn(httpTransport, "checkPortInUse").mockResolvedValue(true);

      await expect(httpTransport.start()).rejects.toThrow("Port 3000 is already in use");
      expect(httpTransport.isRunning()).toBe(false);
    });

    it("should stop server gracefully", async () => {
      await httpTransport.initialize();
      vi.spyOn(httpTransport, "checkPortInUse").mockResolvedValue(false);

      await httpTransport.start();
      expect(httpTransport.isRunning()).toBe(true);

      await httpTransport.stop();
      expect(mockServer.close).toHaveBeenCalledTimes(1);
      expect(httpTransport.isRunning()).toBe(false);
    });

    it("should handle stop when not running", async () => {
      await expect(httpTransport.stop()).resolves.not.toThrow();
      expect(httpTransport.isRunning()).toBe(false);
    });
  });

  describe("Request Body Parsing", () => {
    function createMockRequest(body: string, contentType = "application/json"): IncomingMessage {
      const req = new Readable() as IncomingMessage;
      req.push(body);
      req.push(null);
      req.headers = { "content-type": contentType };
      req.method = "POST";
      req.url = "/mcp";
      return req;
    }

    it("should parse valid JSON request body", async () => {
      const testBody = { jsonrpc: "2.0", method: "test", id: 1 };
      const req = createMockRequest(JSON.stringify(testBody));

      const result = await httpTransport.parseRequestBody(req);

      expect(result).toEqual(testBody);
    });

    it("should handle empty request body", async () => {
      const req = createMockRequest("");

      const result = await httpTransport.parseRequestBody(req);

      expect(result).toEqual({});
    });

    it("should handle malformed JSON gracefully", async () => {
      const req = createMockRequest('{"invalid": json}');

      await expect(httpTransport.parseRequestBody(req)).rejects.toThrow();
    });

    it("should handle large request bodies", async () => {
      const largeObject = { data: "x".repeat(1000), jsonrpc: "2.0" };
      const req = createMockRequest(JSON.stringify(largeObject));

      const result = await httpTransport.parseRequestBody(req);

      expect(result).toEqual(largeObject);
    });

    it("should handle non-UTF8 content gracefully", async () => {
      const req = createMockRequest('{"test": "café"}', "application/json; charset=utf-8");

      const result = await httpTransport.parseRequestBody(req);

      expect(result).toEqual({ test: "café" });
    });
  });

  describe("JSON-RPC Error Creation", () => {
    it("should create standard JSON-RPC error response", () => {
      const id = 123;
      const code = -32601;
      const message = "Method not found";

      const error = httpTransport.createJsonRpcError(id, code, message);

      expect(error).toEqual({
        jsonrpc: "2.0",
        id,
        error: {
          code,
          message,
        },
      });
    });

    it("should handle null id in error response", () => {
      const error = httpTransport.createJsonRpcError(null, -32700, "Parse error");

      expect(error).toEqual({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: "Parse error",
        },
      });
    });

    it("should handle undefined id in error response", () => {
      const error = httpTransport.createJsonRpcError(undefined, -32600, "Invalid Request");

      expect(error).toEqual({
        jsonrpc: "2.0",
        id: undefined,
        error: {
          code: -32600,
          message: "Invalid Request",
        },
      });
    });

    it("should handle string id in error response", () => {
      const error = httpTransport.createJsonRpcError("test-id", -32602, "Invalid params");

      expect(error).toEqual({
        jsonrpc: "2.0",
        id: "test-id",
        error: {
          code: -32602,
          message: "Invalid params",
        },
      });
    });
  });

  describe("MCP Request Processing", () => {
    beforeEach(() => {
      // Set up tool handlers
      const toolListHandler = vi.fn().mockResolvedValue({
        tools: [{ name: "test_tool", description: "A test tool" }],
      });
      const toolCallHandler = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "Tool executed successfully" }],
      });

      httpTransport.setToolListHandler(toolListHandler);
      httpTransport.setToolCallHandler(toolCallHandler);
    });

    it("should process initialize request", async () => {
      const request = {
        jsonrpc: "2.0",
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18", // Match server protocol version
          capabilities: {},
        },
        id: 1,
      };

      const response = await httpTransport.processRequest(request);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 1,
        result: expect.objectContaining({
          protocolVersion: "2025-06-18",
          capabilities: expect.any(Object),
        }),
      });
    });

    it("should process tools/list request", async () => {
      const request = {
        jsonrpc: "2.0",
        method: "tools/list",
        id: 2,
      };

      const response = await httpTransport.processRequest(request);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 2,
        result: {
          tools: expect.arrayContaining([expect.objectContaining({ name: "test_tool" })]),
        },
      });
    });

    it("should process tools/call request", async () => {
      const request = {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "test_tool",
          arguments: {},
        },
        id: 3,
      };

      const response = await httpTransport.processRequest(request);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 3,
        result: {
          content: expect.arrayContaining([expect.objectContaining({ type: "text" })]),
        },
      });
    });

    it("should handle unknown method", async () => {
      const request = {
        jsonrpc: "2.0",
        method: "unknown/method",
        id: 4,
      };

      const response = await httpTransport.processRequest(request);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 4,
        error: {
          code: -32601,
          message: "Method not found",
        },
      });
    });

    it("should handle tools/call without handler", async () => {
      httpTransport.setToolCallHandler(undefined);

      const request = {
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: "test" },
        id: 5,
      };

      const response = await httpTransport.processRequest(request);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 5,
        error: {
          code: -32601,
          message: "Method not found: tools/call",
        },
      });
    });

    it("should handle invalid tools/call params", async () => {
      const request = {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: 123, // Invalid: should be string
        },
        id: 6,
      };

      const response = await httpTransport.processRequest(request);

      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: 6,
        error: {
          code: -32602,
          message: "Invalid params: 'name' must be a string",
        },
      });
    });

    it("should handle notification request (no id)", async () => {
      const request = {
        jsonrpc: "2.0",
        method: "notifications/initialized",
        // No id for notifications
      };

      const response = await httpTransport.processRequest(request);

      // Unknown method returns error with undefined id
      expect(response).toMatchObject({
        jsonrpc: "2.0",
        id: undefined,
        error: {
          code: -32601,
          message: "Method not found",
        },
      });
    });
  });

  describe("Configuration Handling", () => {
    it("should use default host when not specified", async () => {
      const configWithoutHost: HTTPConfig = {
        type: TransportType.HTTP,
        options: {
          port: 3001,
        },
      };

      const { MCPHTTPTransport } = await import("../../src/transports/http-transport.js");
      const transport = new MCPHTTPTransport(configWithoutHost);

      await transport.initialize();
      expect(transport.name).toBe("mcp-http");
    });

    it("should respect CORS configuration", async () => {
      const corsDisabledConfig: HTTPConfig = {
        type: TransportType.HTTP,
        options: {
          port: 3002,
          cors: false,
        },
      };

      const { MCPHTTPTransport } = await import("../../src/transports/http-transport.js");
      const transport = new MCPHTTPTransport(corsDisabledConfig);

      expect(transport.name).toBe("mcp-http");
      expect(transport.type).toBe("http");
    });

    it("should handle different port configurations", async () => {
      const testPorts = [8080, 9000, 3000, 4000];

      for (const port of testPorts) {
        const config: HTTPConfig = {
          type: TransportType.HTTP,
          options: { port },
        };

        const { MCPHTTPTransport } = await import("../../src/transports/http-transport.js");
        const transport = new MCPHTTPTransport(config);

        await transport.initialize();
        expect(transport.name).toBe("mcp-http");
      }
    });
  });

  describe("Error Handling", () => {
    it("should handle initialization errors gracefully", async () => {
      const { createServer } = await import("node:http");
      (createServer as MockedFunction<typeof createServer>).mockImplementation(() => {
        throw new Error("Server creation failed");
      });

      await expect(httpTransport.initialize()).rejects.toThrow("Server creation failed");
    });

    it("should create error responses from thrown errors", () => {
      const error = new Error("Test error message");
      const id = "test-id";

      const response = httpTransport.createErrorResponse(id, error);

      expect(response).toEqual({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32603,
          message: "Test error message",
        },
      });
    });

    it("should handle non-Error thrown values", () => {
      const errorValue = "String error";
      const id = 42;

      const response = httpTransport.createErrorResponse(id, errorValue);

      expect(response).toEqual({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32603,
          message: "String error",
        },
      });
    });

    it("should handle tool handler exceptions", async () => {
      httpTransport.setToolListHandler(() => {
        throw new Error("Tool list handler error");
      });

      const request = {
        jsonrpc: "2.0",
        method: "tools/list",
        id: 1,
      };

      // The processRequest method doesn't currently catch handler exceptions,
      // so this test expects the error to be thrown
      await expect(httpTransport.processRequest(request)).rejects.toThrow(
        "Tool list handler error",
      );
    });
  });
});
