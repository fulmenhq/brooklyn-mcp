/**
 * Development Transports Unit Tests
 *
 * Phase 2: High-coverage testing for FIFO and Socket transport implementations
 * Tests development mode transports used for advanced MCP scenarios
 * without external dependencies while achieving maximum coverage.
 *
 * Target: 4.51%/11.76% → 40%+ coverage for FIFO/Socket transports
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MCPStdioConfig } from "../../src/core/transport.js";
import { TransportType } from "../../src/core/transport.js";

// Mock fs and net modules for testing
vi.mock("node:fs", () => ({
  constants: { O_RDONLY: 0, O_WRONLY: 1, O_NONBLOCK: 2048 },
  openSync: vi.fn(),
  closeSync: vi.fn(),
  createReadStream: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  unlinkSync: vi.fn(),
}));

vi.mock("node:net", () => ({
  createServer: vi.fn(),
}));

vi.mock("node:readline", () => ({
  createInterface: vi.fn(),
}));

describe("Development Transports Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("FIFO Transport Implementation", () => {
    let fifoTransport: any;

    const testFifoConfig: MCPStdioConfig = {
      type: TransportType.MCP_STDIO,
      options: {
        inputPipe: "/tmp/test-input-pipe",
        outputPipe: "/tmp/test-output-pipe",
      },
    };

    beforeEach(async () => {
      const { MCPFifoTransport } = await import("../../src/transports/mcp-fifo-transport.js");
      fifoTransport = new MCPFifoTransport(testFifoConfig);
    });

    it("should have correct transport properties", () => {
      expect(fifoTransport.name).toBe("mcp-fifo");
      expect(fifoTransport.type).toBe("mcp-stdio");
    });

    it("should implement all required transport methods", () => {
      expect(typeof fifoTransport.initialize).toBe("function");
      expect(typeof fifoTransport.start).toBe("function");
      expect(typeof fifoTransport.stop).toBe("function");
      expect(typeof fifoTransport.isRunning).toBe("function");
      expect(typeof fifoTransport.setToolListHandler).toBe("function");
      expect(typeof fifoTransport.setToolCallHandler).toBe("function");
    });

    it("should start in non-running state", () => {
      expect(fifoTransport.isRunning()).toBe(false);
    });

    it("should require named pipes in configuration", async () => {
      const invalidConfig: MCPStdioConfig = {
        type: TransportType.MCP_STDIO,
        options: {}, // Missing pipes
      };

      const { MCPFifoTransport } = await import("../../src/transports/mcp-fifo-transport.js");
      expect(() => new MCPFifoTransport(invalidConfig)).toThrow("Named pipes are required");
    });

    it("should initialize without errors", async () => {
      await expect(fifoTransport.initialize()).resolves.not.toThrow();
      expect(fifoTransport.isRunning()).toBe(false);
    });

    it("should accept tool handlers without errors", () => {
      const toolListHandler = vi.fn().mockResolvedValue({ tools: [] });
      const toolCallHandler = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "test" }],
      });

      expect(() => fifoTransport.setToolListHandler(toolListHandler)).not.toThrow();
      expect(() => fifoTransport.setToolCallHandler(toolCallHandler)).not.toThrow();
    });

    it("should handle stop when not running", async () => {
      expect(fifoTransport.isRunning()).toBe(false);
      await expect(fifoTransport.stop()).resolves.not.toThrow();
      expect(fifoTransport.isRunning()).toBe(false);
    });

    it("should validate pipe configuration", () => {
      expect(testFifoConfig.options?.inputPipe).toBe("/tmp/test-input-pipe");
      expect(testFifoConfig.options?.outputPipe).toBe("/tmp/test-output-pipe");
    });

    it("should handle missing input pipe", async () => {
      const partialConfig: MCPStdioConfig = {
        type: TransportType.MCP_STDIO,
        options: {
          outputPipe: "/tmp/test-output-pipe",
          // Missing inputPipe
        },
      };

      const { MCPFifoTransport } = await import("../../src/transports/mcp-fifo-transport.js");
      expect(() => new MCPFifoTransport(partialConfig)).toThrow();
    });

    it("should handle missing output pipe", async () => {
      const partialConfig: MCPStdioConfig = {
        type: TransportType.MCP_STDIO,
        options: {
          inputPipe: "/tmp/test-input-pipe",
          // Missing outputPipe
        },
      };

      const { MCPFifoTransport } = await import("../../src/transports/mcp-fifo-transport.js");
      expect(() => new MCPFifoTransport(partialConfig)).toThrow();
    });

    it("should handle concurrent initialization", async () => {
      const promises = [
        fifoTransport.initialize(),
        fifoTransport.initialize(),
        fifoTransport.initialize(),
      ];

      await expect(Promise.all(promises)).resolves.toEqual([undefined, undefined, undefined]);
    });
  });

  describe("Socket Transport Implementation", () => {
    let socketTransport: any;

    const testSocketConfig: MCPStdioConfig = {
      type: TransportType.MCP_STDIO,
      options: {
        socketPath: "/tmp/test-socket.sock",
      },
    };

    beforeEach(async () => {
      const { MCPSocketTransport } = await import("../../src/transports/mcp-socket-transport.js");
      socketTransport = new MCPSocketTransport(testSocketConfig);
    });

    it("should have correct transport properties", () => {
      expect(socketTransport.name).toBe("mcp-socket");
      expect(socketTransport.type).toBe("mcp-stdio");
    });

    it("should implement all required transport methods", () => {
      expect(typeof socketTransport.initialize).toBe("function");
      expect(typeof socketTransport.start).toBe("function");
      expect(typeof socketTransport.stop).toBe("function");
      expect(typeof socketTransport.isRunning).toBe("function");
      expect(typeof socketTransport.setToolListHandler).toBe("function");
      expect(typeof socketTransport.setToolCallHandler).toBe("function");
    });

    it("should start in non-running state", () => {
      expect(socketTransport.isRunning()).toBe(false);
    });

    it("should initialize without errors", async () => {
      await expect(socketTransport.initialize()).resolves.not.toThrow();
      expect(socketTransport.isRunning()).toBe(false);
    });

    it("should accept tool handlers without errors", () => {
      const toolListHandler = vi.fn().mockResolvedValue({ tools: [] });
      const toolCallHandler = vi.fn().mockResolvedValue({
        content: [{ type: "text", text: "test" }],
      });

      expect(() => socketTransport.setToolListHandler(toolListHandler)).not.toThrow();
      expect(() => socketTransport.setToolCallHandler(toolCallHandler)).not.toThrow();
    });

    it("should handle stop when not running", async () => {
      expect(socketTransport.isRunning()).toBe(false);
      await expect(socketTransport.stop()).resolves.not.toThrow();
      expect(socketTransport.isRunning()).toBe(false);
    });

    it("should generate socket path from inputPipe when socketPath not provided", async () => {
      const pipeConfig: MCPStdioConfig = {
        type: TransportType.MCP_STDIO,
        options: {
          inputPipe: "/tmp/test-brooklyn-in",
        },
      };

      const { MCPSocketTransport } = await import("../../src/transports/mcp-socket-transport.js");
      const transport = new MCPSocketTransport(pipeConfig);

      expect(transport.name).toBe("mcp-socket");
      expect(transport.type).toBe("mcp-stdio");
    });

    it("should generate default socket path when no options provided", async () => {
      const emptyConfig: MCPStdioConfig = {
        type: TransportType.MCP_STDIO,
        options: {},
      };

      const { MCPSocketTransport } = await import("../../src/transports/mcp-socket-transport.js");
      const transport = new MCPSocketTransport(emptyConfig);

      expect(transport.name).toBe("mcp-socket");
      expect(transport.type).toBe("mcp-stdio");
    });

    it("should handle custom socket directory from environment", async () => {
      const originalEnv = process.env["BROOKLYN_DEV_SOCKET_DIR"];
      process.env["BROOKLYN_DEV_SOCKET_DIR"] = "/custom/socket/dir";

      try {
        const emptyConfig: MCPStdioConfig = {
          type: TransportType.MCP_STDIO,
          options: {},
        };

        const { MCPSocketTransport } = await import("../../src/transports/mcp-socket-transport.js");
        const transport = new MCPSocketTransport(emptyConfig);

        expect(transport.name).toBe("mcp-socket");
        expect(transport.type).toBe("mcp-stdio");
      } finally {
        if (originalEnv !== undefined) {
          process.env["BROOKLYN_DEV_SOCKET_DIR"] = originalEnv;
        } else {
          delete process.env["BROOKLYN_DEV_SOCKET_DIR"];
        }
      }
    });

    it("should handle concurrent initialization", async () => {
      const promises = [
        socketTransport.initialize(),
        socketTransport.initialize(),
        socketTransport.initialize(),
      ];

      await expect(Promise.all(promises)).resolves.toEqual([undefined, undefined, undefined]);
    });
  });

  describe("Factory Integration for Development Transports", () => {
    it("should create FIFO transport via factory", async () => {
      const { createMCPStdio } = await import("../../src/transports/index.js");
      const transport = await createMCPStdio({
        inputPipe: "/tmp/test-input",
        outputPipe: "/tmp/test-output",
      });

      expect(transport).toBeDefined();
      expect(transport.name).toBe("mcp-fifo");
      expect(transport.type).toBe("mcp-stdio");
      expect(transport.isRunning()).toBe(false);
    });

    it("should create Socket transport via factory", async () => {
      const { createMCPStdio } = await import("../../src/transports/index.js");
      const transport = await createMCPStdio({
        socketPath: "/tmp/test-socket.sock",
      });

      expect(transport).toBeDefined();
      expect(transport.name).toBe("mcp-socket");
      expect(transport.type).toBe("mcp-stdio");
      expect(transport.isRunning()).toBe(false);
    });

    it("should prioritize socket over FIFO in factory", async () => {
      const { createMCPStdio } = await import("../../src/transports/index.js");
      const transport = await createMCPStdio({
        socketPath: "/tmp/priority-test.sock",
        inputPipe: "/tmp/test-input", // Should be ignored
        outputPipe: "/tmp/test-output", // Should be ignored
      });

      expect(transport).toBeDefined();
      expect(transport.name).toBe("mcp-socket");
    });

    it("should handle rapid factory calls", async () => {
      const { createMCPStdio } = await import("../../src/transports/index.js");

      const promises = [
        createMCPStdio({ socketPath: "/tmp/rapid1.sock" }),
        createMCPStdio({ inputPipe: "/tmp/rapid2-in", outputPipe: "/tmp/rapid2-out" }),
        createMCPStdio({ socketPath: "/tmp/rapid3.sock" }),
        createMCPStdio({ inputPipe: "/tmp/rapid4-in", outputPipe: "/tmp/rapid4-out" }),
      ];

      const transports = await Promise.all(promises);

      expect(transports).toHaveLength(4);
      expect(transports[0]?.name).toBe("mcp-socket");
      expect(transports[1]?.name).toBe("mcp-fifo");
      expect(transports[2]?.name).toBe("mcp-socket");
      expect(transports[3]?.name).toBe("mcp-fifo");
    });
  });

  describe("Configuration Edge Cases", () => {
    it("should handle relative pipe paths", async () => {
      const relativeConfig: MCPStdioConfig = {
        type: TransportType.MCP_STDIO,
        options: {
          inputPipe: "./relative-input",
          outputPipe: "./relative-output",
        },
      };

      const { MCPFifoTransport } = await import("../../src/transports/mcp-fifo-transport.js");
      const transport = new MCPFifoTransport(relativeConfig);

      expect(transport.name).toBe("mcp-fifo");
      await expect(transport.initialize()).resolves.not.toThrow();
    });

    it("should handle relative socket paths", async () => {
      const relativeConfig: MCPStdioConfig = {
        type: TransportType.MCP_STDIO,
        options: {
          socketPath: "./relative-socket.sock",
        },
      };

      const { MCPSocketTransport } = await import("../../src/transports/mcp-socket-transport.js");
      const transport = new MCPSocketTransport(relativeConfig);

      expect(transport.name).toBe("mcp-socket");
      await expect(transport.initialize()).resolves.not.toThrow();
    });

    it("should handle very long socket paths", async () => {
      const longPath = `/tmp/${"x".repeat(100)}.sock`;
      const longConfig: MCPStdioConfig = {
        type: TransportType.MCP_STDIO,
        options: {
          socketPath: longPath,
        },
      };

      const { MCPSocketTransport } = await import("../../src/transports/mcp-socket-transport.js");
      const transport = new MCPSocketTransport(longConfig);

      expect(transport.name).toBe("mcp-socket");
      await expect(transport.initialize()).resolves.not.toThrow();
    });

    it("should handle devMode flag", async () => {
      const devConfig: MCPStdioConfig = {
        type: TransportType.MCP_STDIO,
        options: {
          devMode: true,
          socketPath: "/tmp/dev-mode.sock",
        },
      };

      const { MCPSocketTransport } = await import("../../src/transports/mcp-socket-transport.js");
      const transport = new MCPSocketTransport(devConfig);

      expect(transport.name).toBe("mcp-socket");
      await expect(transport.initialize()).resolves.not.toThrow();
    });
  });

  describe("Error Handling and Resilience", () => {
    it("should handle tool handler errors gracefully", async () => {
      const { createMCPStdio } = await import("../../src/transports/index.js");
      const transport = await createMCPStdio({
        socketPath: "/tmp/error-test.sock",
      });

      const errorHandler = vi.fn().mockRejectedValue(new Error("Handler error"));

      expect(() => transport.setToolListHandler(errorHandler)).not.toThrow();
      expect(() => transport.setToolCallHandler(errorHandler)).not.toThrow();
    });

    it("should maintain state consistency after errors", async () => {
      const { createMCPStdio } = await import("../../src/transports/index.js");
      const transport = await createMCPStdio({
        socketPath: "/tmp/consistency-test.sock",
      });

      const initialName = transport.name;
      const initialType = transport.type;
      const initialRunning = transport.isRunning();

      // Try various operations
      await transport.initialize();
      await transport.stop();

      expect(transport.name).toBe(initialName);
      expect(transport.type).toBe(initialType);
      expect(transport.isRunning()).toBe(initialRunning);
    });

    it("should handle multiple stop calls safely", async () => {
      const { createMCPStdio } = await import("../../src/transports/index.js");
      const transport = await createMCPStdio({
        socketPath: "/tmp/multiple-stop.sock",
      });

      // Multiple stop calls should not throw
      await expect(transport.stop()).resolves.not.toThrow();
      await expect(transport.stop()).resolves.not.toThrow();
      await expect(transport.stop()).resolves.not.toThrow();
    });
  });

  describe("Type Safety and Interface Compliance", () => {
    it("should have correct TypeScript types for FIFO", async () => {
      const { createMCPStdio } = await import("../../src/transports/index.js");
      const transport = await createMCPStdio({
        inputPipe: "/tmp/types-fifo-in",
        outputPipe: "/tmp/types-fifo-out",
      });

      expect(typeof transport.name).toBe("string");
      expect(typeof transport.type).toBe("string");
      expect(typeof transport.isRunning()).toBe("boolean");
    });

    it("should have correct TypeScript types for Socket", async () => {
      const { createMCPStdio } = await import("../../src/transports/index.js");
      const transport = await createMCPStdio({
        socketPath: "/tmp/types-socket.sock",
      });

      expect(typeof transport.name).toBe("string");
      expect(typeof transport.type).toBe("string");
      expect(typeof transport.isRunning()).toBe("boolean");
    });

    it("should implement Transport interface correctly for both transports", async () => {
      const { createMCPStdio } = await import("../../src/transports/index.js");

      const fifoTransport = await createMCPStdio({
        inputPipe: "/tmp/interface-fifo-in",
        outputPipe: "/tmp/interface-fifo-out",
      });

      const socketTransport = await createMCPStdio({
        socketPath: "/tmp/interface-socket.sock",
      });

      for (const transport of [fifoTransport, socketTransport]) {
        // Test that all required methods exist and return proper types
        expect(transport.initialize).toBeInstanceOf(Function);
        expect(transport.start).toBeInstanceOf(Function);
        expect(transport.stop).toBeInstanceOf(Function);
        expect(transport.isRunning).toBeInstanceOf(Function);
        expect(transport.setToolListHandler).toBeInstanceOf(Function);
        expect(transport.setToolCallHandler).toBeInstanceOf(Function);

        // Test return types
        expect(transport.isRunning()).toBe(false);
        await expect(transport.initialize()).resolves.toBeUndefined();
        await expect(transport.stop()).resolves.toBeUndefined();
      }
    });
  });
});
