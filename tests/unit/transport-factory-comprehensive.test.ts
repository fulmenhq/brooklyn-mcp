/**
 * Comprehensive Transport Factory and Registry Tests
 *
 * Phase 1: Low-risk, high-coverage gain testing for transport layer
 * Tests factory methods, registry operations, and configuration validation
 * without external dependencies or complex integration scenarios.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  HTTPConfig,
  MCPStdioConfig,
  Transport,
  TransportConfig,
} from "../../src/core/transport.js";
import { TransportRegistry, TransportType } from "../../src/core/transport.js";

describe("Transport Factory Comprehensive Tests", () => {
  beforeEach(() => {
    // Clear any registered transports before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any running transports
    vi.restoreAllMocks();
  });

  describe("Transport Registry Operations", () => {
    it("should register and create MCP stdio transport", async () => {
      const { registerTransports, createTransport } = await import("../../src/transports/index.js");

      registerTransports();

      const config: MCPStdioConfig = {
        type: TransportType.MCP_STDIO,
        options: {},
      };

      const transport = await createTransport(config);

      expect(transport).toBeDefined();
      expect(transport.name).toBe("mcp-stdio");
      expect(transport.type).toBe("mcp-stdio");
      expect(typeof transport.initialize).toBe("function");
      expect(typeof transport.start).toBe("function");
      expect(typeof transport.stop).toBe("function");
    });

    it("should register and create HTTP transport", async () => {
      const { registerTransports, createTransport } = await import("../../src/transports/index.js");

      registerTransports();

      const config: HTTPConfig = {
        type: TransportType.HTTP,
        options: {
          port: 3001,
          host: "localhost",
          cors: true,
        },
      };

      const transport = await createTransport(config);

      expect(transport).toBeDefined();
      expect(transport.name).toBe("mcp-http");
      expect(transport.type).toBe("http");
    });

    it("should list all available transport types", async () => {
      const { getAvailableTransports } = await import("../../src/transports/index.js");

      const types = getAvailableTransports();

      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThan(0);
      expect(types).toContain("mcp-stdio");
      expect(types).toContain("http");
    });

    it("should handle registry operations consistently", async () => {
      const { registerTransports, getAvailableTransports } = await import(
        "../../src/transports/index.js"
      );

      // Multiple registrations should be idempotent
      registerTransports();
      registerTransports();

      const types = getAvailableTransports();
      expect(types).toHaveLength(2); // Should not duplicate
    });
  });

  describe("MCP Stdio Transport Factory", () => {
    it("should create standard stdio transport with minimal config", async () => {
      const { createMCPStdio } = await import("../../src/transports/index.js");

      const transport = await createMCPStdio();

      expect(transport).toBeDefined();
      expect(transport.name).toBe("mcp-stdio");
      expect(transport.type).toBe("mcp-stdio");
      expect(transport.isRunning()).toBe(false);
    });

    it("should create socket transport with socketPath option", async () => {
      const { createMCPStdio } = await import("../../src/transports/index.js");

      const transport = await createMCPStdio({
        socketPath: "/tmp/test-socket",
      });

      expect(transport).toBeDefined();
      expect(transport.name).toBe("mcp-socket");
      expect(transport.type).toBe("mcp-stdio");
    });

    it("should create FIFO transport with pipe options", async () => {
      const { createMCPStdio } = await import("../../src/transports/index.js");

      const transport = await createMCPStdio({
        inputPipe: "/tmp/test-input",
        outputPipe: "/tmp/test-output",
      });

      expect(transport).toBeDefined();
      expect(transport.name).toBe("mcp-fifo");
      expect(transport.type).toBe("mcp-stdio");
    });

    it("should prioritize socket over FIFO when both options provided", async () => {
      const { createMCPStdio } = await import("../../src/transports/index.js");

      const transport = await createMCPStdio({
        socketPath: "/tmp/test-socket",
        inputPipe: "/tmp/test-input", // Should be ignored
        outputPipe: "/tmp/test-output", // Should be ignored
      });

      expect(transport).toBeDefined();
      expect(transport.name).toBe("mcp-socket");
    });

    it("should handle undefined dev options gracefully", async () => {
      const { createMCPStdio } = await import("../../src/transports/index.js");

      const transport = await createMCPStdio(undefined);

      expect(transport).toBeDefined();
      expect(transport.name).toBe("mcp-stdio");
    });

    it("should handle empty dev options object", async () => {
      const { createMCPStdio } = await import("../../src/transports/index.js");

      const transport = await createMCPStdio({});

      expect(transport).toBeDefined();
      expect(transport.name).toBe("mcp-stdio");
    });
  });

  describe("HTTP Transport Factory", () => {
    it("should create HTTP transport with port only", async () => {
      const { createHTTP } = await import("../../src/transports/index.js");

      const transport = await createHTTP(3002);

      expect(transport).toBeDefined();
      expect(transport.name).toBe("mcp-http");
      expect(transport.type).toBe("http");
    });

    it("should create HTTP transport with port and host", async () => {
      const { createHTTP } = await import("../../src/transports/index.js");

      const transport = await createHTTP(3003, "127.0.0.1");

      expect(transport).toBeDefined();
      expect(transport.name).toBe("mcp-http");
    });

    it("should create HTTP transport with CORS disabled", async () => {
      const { createHTTP } = await import("../../src/transports/index.js");

      const transport = await createHTTP(3004, "localhost", false);

      expect(transport).toBeDefined();
      expect(transport.name).toBe("mcp-http");
    });

    it("should handle various port numbers", async () => {
      const { createHTTP } = await import("../../src/transports/index.js");

      // Test different port ranges
      const transport1 = await createHTTP(8080);
      const transport2 = await createHTTP(9000);
      const transport3 = await createHTTP(3000);

      expect(transport1).toBeDefined();
      expect(transport2).toBeDefined();
      expect(transport3).toBeDefined();
    });

    it("should handle edge case port values", async () => {
      const { createHTTP } = await import("../../src/transports/index.js");

      // Test minimum valid port
      const transport1 = await createHTTP(1024);
      expect(transport1).toBeDefined();

      // Test high port number
      const transport2 = await createHTTP(65000);
      expect(transport2).toBeDefined();
    });
  });

  describe("Transport Interface Compliance", () => {
    it("should create transports with complete interface", async () => {
      const { createMCPStdio, createHTTP } = await import("../../src/transports/index.js");

      const stdioTransport = await createMCPStdio();
      const httpTransport = await createHTTP(3005);

      // Test required properties
      for (const transport of [stdioTransport, httpTransport]) {
        expect(transport.name).toBeDefined();
        expect(transport.type).toBeDefined();
        expect(typeof transport.name).toBe("string");
        expect(typeof transport.type).toBe("string");

        // Test required methods
        expect(typeof transport.initialize).toBe("function");
        expect(typeof transport.start).toBe("function");
        expect(typeof transport.stop).toBe("function");
        expect(typeof transport.isRunning).toBe("function");
        expect(typeof transport.setToolListHandler).toBe("function");
        expect(typeof transport.setToolCallHandler).toBe("function");

        // Test initial state
        expect(transport.isRunning()).toBe(false);
      }
    });

    it("should support tool handler registration", async () => {
      const { createMCPStdio } = await import("../../src/transports/index.js");

      const transport = await createMCPStdio();

      const toolListHandler = vi.fn().mockResolvedValue({ tools: [] });
      const toolCallHandler = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "test" }],
      });

      expect(() => transport.setToolListHandler(toolListHandler)).not.toThrow();
      expect(() => transport.setToolCallHandler(toolCallHandler)).not.toThrow();
    });

    it("should handle initialization without errors", async () => {
      const { createMCPStdio, createHTTP } = await import("../../src/transports/index.js");

      const stdioTransport = await createMCPStdio();
      const httpTransport = await createHTTP(3006);

      // Should initialize without throwing
      await expect(stdioTransport.initialize()).resolves.not.toThrow();
      await expect(httpTransport.initialize()).resolves.not.toThrow();
    });

    it("should handle stop operation when not started", async () => {
      const { createMCPStdio, createHTTP } = await import("../../src/transports/index.js");

      const stdioTransport = await createMCPStdio();
      const httpTransport = await createHTTP(3007);

      // Should stop gracefully even when not started
      await expect(stdioTransport.stop()).resolves.not.toThrow();
      await expect(httpTransport.stop()).resolves.not.toThrow();
    });
  });

  describe("Configuration Validation", () => {
    it("should handle missing optional HTTP config properties", async () => {
      const { createTransport } = await import("../../src/transports/index.js");

      const config: HTTPConfig = {
        type: TransportType.HTTP,
        options: {
          port: 3008,
          // host and cors are optional
        },
      };

      const transport = await createTransport(config);
      expect(transport).toBeDefined();
    });

    it("should handle empty MCP stdio options", async () => {
      const { createTransport } = await import("../../src/transports/index.js");

      const config: MCPStdioConfig = {
        type: TransportType.MCP_STDIO,
        options: {}, // Empty options should work
      };

      const transport = await createTransport(config);
      expect(transport).toBeDefined();
    });

    it("should create transports with consistent naming", async () => {
      const { createMCPStdio, createHTTP } = await import("../../src/transports/index.js");

      const stdioTransport1 = await createMCPStdio();
      const stdioTransport2 = await createMCPStdio();
      const httpTransport1 = await createHTTP(3009);
      const httpTransport2 = await createHTTP(3010);

      // Names should be consistent across instances
      expect(stdioTransport1.name).toBe(stdioTransport2.name);
      expect(httpTransport1.name).toBe(httpTransport2.name);

      // Types should be consistent
      expect(stdioTransport1.type).toBe("mcp-stdio");
      expect(httpTransport1.type).toBe("http");
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("should handle rapid factory calls", async () => {
      const { createMCPStdio, createHTTP } = await import("../../src/transports/index.js");

      // Create multiple transports rapidly
      const promises = [
        createMCPStdio(),
        createHTTP(3011),
        createMCPStdio({ socketPath: "/tmp/test1" }),
        createHTTP(3012, "localhost"),
        createMCPStdio({ inputPipe: "/tmp/in", outputPipe: "/tmp/out" }),
      ];

      const transports = await Promise.all(promises);

      expect(transports).toHaveLength(5);
      for (const transport of transports) {
        expect(transport).toBeDefined();
        expect(typeof transport.name).toBe("string");
        expect(typeof transport.type).toBe("string");
      }
    });

    it("should maintain registry state across multiple operations", async () => {
      const { registerTransports, getAvailableTransports, createMCPStdio, createHTTP } =
        await import("../../src/transports/index.js");

      // Initial state
      const types1 = getAvailableTransports();
      expect(types1.length).toBeGreaterThan(0);

      // Create some transports
      await createMCPStdio();
      await createHTTP(3013);

      // Registry should remain consistent
      const types2 = getAvailableTransports();
      expect(types2).toEqual(types1);

      // Re-register should not change anything
      registerTransports();
      const types3 = getAvailableTransports();
      expect(types3).toEqual(types1);
    });

    it("should handle concurrent registry access", async () => {
      const { getAvailableTransports, createMCPStdio, createHTTP } = await import(
        "../../src/transports/index.js"
      );

      // Concurrent operations
      const operations = Promise.all([
        getAvailableTransports(),
        createMCPStdio(),
        createHTTP(3014),
        getAvailableTransports(),
      ]);

      const [types1, stdioTransport, httpTransport, types2] = await operations;

      expect(types1).toEqual(types2);
      expect(stdioTransport).toBeDefined();
      expect(httpTransport).toBeDefined();
    });
  });
});
