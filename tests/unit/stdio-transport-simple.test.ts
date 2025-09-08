/**
 * STDIO Transport Simple Unit Tests
 *
 * Phase 2: Core STDIO transport functionality testing
 * Tests basic transport implementation without complex mocking
 * Target: 0% → 50%+ coverage for STDIO transport
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MCPStdioConfig } from "../../src/core/transport.js";
import { TransportType } from "../../src/core/transport.js";

describe("STDIO Transport Simple Tests", () => {
  let stdioTransport: any;

  // Configuration template for reference
  const _testConfig: MCPStdioConfig = {
    type: TransportType.MCP_STDIO,
    options: {},
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create STDIO transport instance using factory
    const { createMCPStdio } = await import("../../src/transports/index.js");
    stdioTransport = await createMCPStdio();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Transport Interface Implementation", () => {
    it("should have correct transport properties", () => {
      expect(stdioTransport.name).toBe("mcp-stdio");
      expect(stdioTransport.type).toBe("mcp-stdio");
    });

    it("should implement all required transport methods", () => {
      expect(typeof stdioTransport.initialize).toBe("function");
      expect(typeof stdioTransport.start).toBe("function");
      expect(typeof stdioTransport.stop).toBe("function");
      expect(typeof stdioTransport.isRunning).toBe("function");
      expect(typeof stdioTransport.setToolListHandler).toBe("function");
      expect(typeof stdioTransport.setToolCallHandler).toBe("function");
    });

    it("should start in non-running state", () => {
      expect(stdioTransport.isRunning()).toBe(false);
    });

    it("should accept tool handlers without errors", () => {
      const toolListHandler = vi.fn().mockResolvedValue({ tools: [] });
      const toolCallHandler = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "test" }],
      });

      expect(() => stdioTransport.setToolListHandler(toolListHandler)).not.toThrow();
      expect(() => stdioTransport.setToolCallHandler(toolCallHandler)).not.toThrow();
    });
  });

  describe("Transport Lifecycle", () => {
    it("should initialize without errors", async () => {
      await expect(stdioTransport.initialize()).resolves.not.toThrow();
      expect(stdioTransport.isRunning()).toBe(false);
    });

    it("should handle stop when not running", async () => {
      expect(stdioTransport.isRunning()).toBe(false);
      await expect(stdioTransport.stop()).resolves.not.toThrow();
      expect(stdioTransport.isRunning()).toBe(false);
    });

    it("should maintain state consistency", () => {
      expect(stdioTransport.name).toBe("mcp-stdio");
      expect(stdioTransport.type).toBe("mcp-stdio");
      expect(stdioTransport.isRunning()).toBe(false);
    });
  });

  describe("Configuration Handling", () => {
    it("should handle empty configuration options", async () => {
      const emptyConfig: MCPStdioConfig = {
        type: TransportType.MCP_STDIO,
        options: {},
      };

      const { MCPStdioTransport } = await import("../../src/transports/mcp-stdio-transport.js");
      const transport = new MCPStdioTransport(emptyConfig);

      expect(transport.name).toBe("mcp-stdio");
      expect(transport.type).toBe("mcp-stdio");
      await expect(transport.initialize()).resolves.not.toThrow();
    });

    it("should handle configuration with development options", async () => {
      const devConfig: MCPStdioConfig = {
        type: TransportType.MCP_STDIO,
        options: {
          devMode: true,
          inputPipe: "/tmp/test-input",
          outputPipe: "/tmp/test-output",
        },
      };

      const { MCPStdioTransport } = await import("../../src/transports/mcp-stdio-transport.js");
      const transport = new MCPStdioTransport(devConfig);

      expect(transport.name).toBe("mcp-stdio");
      await expect(transport.initialize()).resolves.not.toThrow();
    });

    it("should handle configuration with socket options", async () => {
      const socketConfig: MCPStdioConfig = {
        type: TransportType.MCP_STDIO,
        options: {
          socketPath: "/tmp/test-socket",
        },
      };

      const { MCPStdioTransport } = await import("../../src/transports/mcp-stdio-transport.js");
      const transport = new MCPStdioTransport(socketConfig);

      expect(transport.name).toBe("mcp-stdio");
      await expect(transport.initialize()).resolves.not.toThrow();
    });
  });

  describe("Error Handling", () => {
    it("should handle initialization errors gracefully", async () => {
      // Test that initialization doesn't throw
      await expect(stdioTransport.initialize()).resolves.not.toThrow();
    });

    it("should handle multiple initializations", async () => {
      await stdioTransport.initialize();
      await expect(stdioTransport.initialize()).resolves.not.toThrow();
    });

    it("should handle tool handler edge cases", () => {
      // Test with undefined handlers
      expect(() => stdioTransport.setToolListHandler(undefined)).not.toThrow();
      expect(() => stdioTransport.setToolCallHandler(undefined)).not.toThrow();

      // Test with valid handlers
      const toolListHandler = vi.fn().mockResolvedValue({ tools: [] });
      const toolCallHandler = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "result" }],
      });

      expect(() => stdioTransport.setToolListHandler(toolListHandler)).not.toThrow();
      expect(() => stdioTransport.setToolCallHandler(toolCallHandler)).not.toThrow();
    });

    it("should maintain consistent state after operations", async () => {
      const initialName = stdioTransport.name;
      const initialType = stdioTransport.type;

      await stdioTransport.initialize();
      expect(stdioTransport.name).toBe(initialName);
      expect(stdioTransport.type).toBe(initialType);

      await stdioTransport.stop();
      expect(stdioTransport.name).toBe(initialName);
      expect(stdioTransport.type).toBe(initialType);
    });
  });

  describe("Factory Integration", () => {
    it("should create transport via factory with default options", async () => {
      const { createMCPStdio } = await import("../../src/transports/index.js");
      const transport = await createMCPStdio();

      expect(transport).toBeDefined();
      expect(transport.name).toBe("mcp-stdio");
      expect(transport.type).toBe("mcp-stdio");
      expect(transport.isRunning()).toBe(false);
    });

    it("should create transport via factory with socket options", async () => {
      const { createMCPStdio } = await import("../../src/transports/index.js");
      const transport = await createMCPStdio({
        socketPath: "/tmp/test-socket",
      });

      expect(transport).toBeDefined();
      expect(transport.name).toBe("mcp-socket");
      expect(transport.type).toBe("mcp-stdio");
    });

    it("should create transport via factory with FIFO options", async () => {
      const { createMCPStdio } = await import("../../src/transports/index.js");
      const transport = await createMCPStdio({
        inputPipe: "/tmp/test-input",
        outputPipe: "/tmp/test-output",
      });

      expect(transport).toBeDefined();
      expect(transport.name).toBe("mcp-fifo");
      expect(transport.type).toBe("mcp-stdio");
    });

    it("should prioritize socket over FIFO in factory", async () => {
      const { createMCPStdio } = await import("../../src/transports/index.js");
      const transport = await createMCPStdio({
        socketPath: "/tmp/test-socket",
        inputPipe: "/tmp/test-input", // Should be ignored
        outputPipe: "/tmp/test-output", // Should be ignored
      });

      expect(transport).toBeDefined();
      expect(transport.name).toBe("mcp-socket");
    });
  });

  describe("Type Safety and Interface Compliance", () => {
    it("should have correct TypeScript types", () => {
      expect(typeof stdioTransport.name).toBe("string");
      expect(typeof stdioTransport.type).toBe("string");
      expect(typeof stdioTransport.isRunning()).toBe("boolean");
    });

    it("should implement Transport interface correctly", async () => {
      // Test that all required methods exist and return proper types
      expect(stdioTransport.initialize).toBeInstanceOf(Function);
      expect(stdioTransport.start).toBeInstanceOf(Function);
      expect(stdioTransport.stop).toBeInstanceOf(Function);
      expect(stdioTransport.isRunning).toBeInstanceOf(Function);
      expect(stdioTransport.setToolListHandler).toBeInstanceOf(Function);
      expect(stdioTransport.setToolCallHandler).toBeInstanceOf(Function);

      // Test return types
      expect(stdioTransport.isRunning()).toBe(false);
      await expect(stdioTransport.initialize()).resolves.toBeUndefined();
      await expect(stdioTransport.stop()).resolves.toBeUndefined();
    });

    it("should handle concurrent operations safely", async () => {
      // Test concurrent initializations
      const promises = [
        stdioTransport.initialize(),
        stdioTransport.initialize(),
        stdioTransport.initialize(),
      ];

      await expect(Promise.all(promises)).resolves.toEqual([undefined, undefined, undefined]);
    });
  });
});
