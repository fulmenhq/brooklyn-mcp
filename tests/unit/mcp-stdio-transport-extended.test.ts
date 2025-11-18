/**
 * MCP STDIO Transport Extended Unit Tests
 *
 * Phase 3: Comprehensive STDIO transport functionality testing
 * Tests message handling, JSON-RPC protocol, and response formatting
 * Target: 11.76% → 70%+ coverage for STDIO transport
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MCPStdioConfig } from "../../src/core/transport.js";
import { TransportType } from "../../src/core/transport.js";

describe("MCP STDIO Transport Extended Tests", () => {
  let stdioTransport: any;
  let mockStdoutWrite: any;
  let mockStdinOn: any;
  let mockStdinResume: any;
  let mockStdinPause: any;
  let mockStdinRemoveAllListeners: any;

  const testConfig: MCPStdioConfig = {
    type: TransportType.MCP_STDIO,
    options: {},
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock process.stdout.write
    mockStdoutWrite = vi.fn();
    Object.defineProperty(process.stdout, "write", {
      writable: true,
      value: mockStdoutWrite,
    });

    // Mock process.stdin methods
    mockStdinOn = vi.fn();
    mockStdinResume = vi.fn();
    mockStdinPause = vi.fn();
    mockStdinRemoveAllListeners = vi.fn();

    Object.defineProperty(process.stdin, "on", {
      writable: true,
      value: mockStdinOn,
    });
    Object.defineProperty(process.stdin, "resume", {
      writable: true,
      value: mockStdinResume,
    });
    Object.defineProperty(process.stdin, "pause", {
      writable: true,
      value: mockStdinPause,
    });
    Object.defineProperty(process.stdin, "removeAllListeners", {
      writable: true,
      value: mockStdinRemoveAllListeners,
    });
    Object.defineProperty(process.stdin, "setEncoding", {
      writable: true,
      value: vi.fn(),
    });

    // Create transport instance
    const { MCPStdioTransport } = await import("../../src/transports/mcp-stdio-transport.js");
    stdioTransport = new MCPStdioTransport(testConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Message Handling - Initialize", () => {
    it("should handle valid initialize request", async () => {
      const toolListHandler = vi.fn().mockResolvedValue({ tools: [] });
      const toolCallHandler = vi.fn();

      stdioTransport.setToolListHandler(toolListHandler);
      stdioTransport.setToolCallHandler(toolCallHandler);

      await stdioTransport.start();

      // Simulate stdin data event
      const initializeMessage = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18" },
      };

      const dataCallback = mockStdinOn.mock.calls.find((call: any) => call[0] === "data")[1];
      dataCallback(`${JSON.stringify(initializeMessage)}\n`);

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockStdoutWrite).toHaveBeenCalled();
      const writtenData = mockStdoutWrite.mock.calls[0][0];
      const response = JSON.parse(writtenData);

      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBe(1);
      expect(response.result.protocolVersion).toBe("2025-06-18");
      expect(response.result.serverInfo.name).toBe("brooklyn-mcp-server");
    });

    it("should reject unsupported protocol version", async () => {
      await stdioTransport.start();

      const initializeMessage = {
        jsonrpc: "2.0",
        id: 2,
        method: "initialize",
        params: { protocolVersion: "2024-01-01" },
      };

      const dataCallback = mockStdinOn.mock.calls.find((call: any) => call[0] === "data")[1];
      dataCallback(`${JSON.stringify(initializeMessage)}\n`);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockStdoutWrite).toHaveBeenCalled();
      const writtenData = mockStdoutWrite.mock.calls[0][0];
      const response = JSON.parse(writtenData);

      expect(response.error.code).toBe(-32600);
      expect(response.error.message).toContain("Unsupported protocolVersion");
    });
  });

  describe("Message Handling - Tools/List", () => {
    it("should handle tools/list request with handler", async () => {
      const toolListHandler = vi.fn().mockResolvedValue({
        tools: [{ name: "test_tool", description: "A test tool" }],
      });

      stdioTransport.setToolListHandler(toolListHandler);
      await stdioTransport.start();

      const listMessage = {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/list",
      };

      const dataCallback = mockStdinOn.mock.calls.find((call: any) => call[0] === "data")[1];
      dataCallback(`${JSON.stringify(listMessage)}\n`);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(toolListHandler).toHaveBeenCalled();
      expect(mockStdoutWrite).toHaveBeenCalled();
      const writtenData = mockStdoutWrite.mock.calls[0][0];
      const response = JSON.parse(writtenData);

      expect(response.result.tools).toHaveLength(1);
      expect(response.result.tools[0].name).toBe("test_tool");
    });

    it("should handle tools/list request without handler", async () => {
      await stdioTransport.start();

      const listMessage = {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/list",
      };

      const dataCallback = mockStdinOn.mock.calls.find((call: any) => call[0] === "data")[1];
      dataCallback(`${JSON.stringify(listMessage)}\n`);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockStdoutWrite).toHaveBeenCalled();
      const writtenData = mockStdoutWrite.mock.calls[0][0];
      const response = JSON.parse(writtenData);

      expect(response.error.code).toBe(-32601);
      expect(response.error.message).toContain("Method not found");
    });
  });

  describe("Message Handling - Tools/Call", () => {
    it("should handle tools/call request with valid params", async () => {
      const toolCallHandler = vi.fn().mockResolvedValue({
        result: {
          result: { message: "Tool executed" },
          metadata: { executionTime: 100 },
        },
      });

      stdioTransport.setToolCallHandler(toolCallHandler);
      await stdioTransport.start();

      const callMessage = {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "test_tool", arguments: {} },
      };

      const dataCallback = mockStdinOn.mock.calls.find((call: any) => call[0] === "data")[1];
      dataCallback(`${JSON.stringify(callMessage)}\n`);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(toolCallHandler).toHaveBeenCalledWith({
        params: { name: "test_tool", arguments: {} },
        method: "tools/call",
      });

      expect(mockStdoutWrite).toHaveBeenCalled();
      const writtenData = mockStdoutWrite.mock.calls[0][0];
      const response = JSON.parse(writtenData);

      expect(response.result.content).toHaveLength(1);
      expect(response.result.content[0].type).toBe("text");
      const result = JSON.parse(response.result.content[0].text);
      // The transport normalizes the response to the inner result object
      expect(result).toHaveProperty("message", "Tool executed");
    });

    it("should handle tools/call request with invalid params", async () => {
      const toolCallHandler = vi.fn();

      stdioTransport.setToolCallHandler(toolCallHandler);
      await stdioTransport.start();

      const callMessage = {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: { arguments: {} }, // Missing name
      };

      const dataCallback = mockStdinOn.mock.calls.find((call: any) => call[0] === "data")[1];
      dataCallback(`${JSON.stringify(callMessage)}\n`);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockStdoutWrite).toHaveBeenCalled();
      const writtenData = mockStdoutWrite.mock.calls[0][0];
      const response = JSON.parse(writtenData);

      expect(response.error.code).toBe(-32602);
      expect(response.error.message).toContain("Invalid params");
    });
  });

  describe("Message Handling - Notifications", () => {
    it("should ignore notifications/initialized", async () => {
      await stdioTransport.start();

      const notificationMessage = {
        jsonrpc: "2.0",
        method: "notifications/initialized",
      };

      const dataCallback = mockStdinOn.mock.calls.find((call: any) => call[0] === "data")[1];
      dataCallback(`${JSON.stringify(notificationMessage)}\n`);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should not write any response for notifications
      expect(mockStdoutWrite).not.toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should handle malformed JSON", async () => {
      await stdioTransport.start();

      const dataCallback = mockStdinOn.mock.calls.find((call: any) => call[0] === "data")[1];
      dataCallback('{"invalid": json}\n');

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockStdoutWrite).toHaveBeenCalled();
      const writtenData = mockStdoutWrite.mock.calls[0][0];
      const response = JSON.parse(writtenData);

      expect(response.error.code).toBe(-32700);
      expect(response.error.message).toBe("Parse error");
    });

    it("should handle unknown methods", async () => {
      await stdioTransport.start();

      const unknownMessage = {
        jsonrpc: "2.0",
        id: 7,
        method: "unknown/method",
      };

      const dataCallback = mockStdinOn.mock.calls.find((call: any) => call[0] === "data")[1];
      dataCallback(`${JSON.stringify(unknownMessage)}\n`);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockStdoutWrite).toHaveBeenCalled();
      const writtenData = mockStdoutWrite.mock.calls[0][0];
      const response = JSON.parse(writtenData);

      expect(response.error.code).toBe(-32601);
      expect(response.error.message).toContain("Method not found");
    });
  });

  describe("Transport Lifecycle - Start/Stop", () => {
    it("should handle start and stop correctly", async () => {
      expect(stdioTransport.isRunning()).toBe(false);

      await stdioTransport.start();
      expect(stdioTransport.isRunning()).toBe(true);
      expect(mockStdinResume).toHaveBeenCalled();

      await stdioTransport.stop();
      expect(stdioTransport.isRunning()).toBe(false);
      expect(mockStdinPause).toHaveBeenCalled();
    });

    it("should prevent multiple starts", async () => {
      await stdioTransport.start();
      expect(stdioTransport.isRunning()).toBe(true);

      await stdioTransport.start(); // Should not change state
      expect(stdioTransport.isRunning()).toBe(true);
    });

    it("should handle stop when not running", async () => {
      expect(stdioTransport.isRunning()).toBe(false);
      await expect(stdioTransport.stop()).resolves.not.toThrow();
      expect(stdioTransport.isRunning()).toBe(false);
    });
  });

  describe("Buffer Handling", () => {
    it("should handle partial messages correctly", async () => {
      await stdioTransport.start();

      const dataCallback = mockStdinOn.mock.calls.find((call: any) => call[0] === "data")[1];

      // Send partial message
      dataCallback('{"jsonrpc": "2.0", "id": 8, "method": "initialize"');

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockStdoutWrite).not.toHaveBeenCalled();

      // Send rest of message
      dataCallback(', "params": {}}\n');

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockStdoutWrite).toHaveBeenCalled();
    });

    it("should handle multiple messages in one chunk", async () => {
      await stdioTransport.start();

      const dataCallback = mockStdinOn.mock.calls.find((call: any) => call[0] === "data")[1];

      const message1 = JSON.stringify({
        jsonrpc: "2.0",
        id: 9,
        method: "initialize",
        params: {},
      });

      const message2 = JSON.stringify({
        jsonrpc: "2.0",
        id: 10,
        method: "tools/list",
      });

      dataCallback(`${message1}\n${message2}\n`);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockStdoutWrite).toHaveBeenCalledTimes(2);
    });
  });

  describe("Response Formatting", () => {
    it("should format responses with proper MCP structure", async () => {
      const toolCallHandler = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "test result" }],
      });

      stdioTransport.setToolCallHandler(toolCallHandler);
      await stdioTransport.start();

      const callMessage = {
        jsonrpc: "2.0",
        id: 11,
        method: "tools/call",
        params: { name: "test_tool" },
      };

      const dataCallback = mockStdinOn.mock.calls.find((call: any) => call[0] === "data")[1];
      dataCallback(`${JSON.stringify(callMessage)}\n`);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockStdoutWrite).toHaveBeenCalled();
      const writtenData = mockStdoutWrite.mock.calls[0][0];
      expect(writtenData).toMatch(/\n$/); // Should end with newline

      const response = JSON.parse(writtenData);
      expect(response.jsonrpc).toBe("2.0");
      expect(response.id).toBe(11);
      expect(response.result).toBeDefined();
    });
  });
});
