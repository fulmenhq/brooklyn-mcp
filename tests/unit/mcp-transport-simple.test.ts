/**
 * MCP Transport Simple Unit Tests
 *
 * Tests the basic Transport interface implementation
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Transport } from "../../src/core/transport.js";

describe("MCP Transport Basic Functionality", () => {
  let transport: Transport;

  beforeEach(async () => {
    // Create a real transport instance for testing
    const { createMCPStdio } = await import("../../src/transports/index.js");
    transport = await createMCPStdio();
  });

  describe("Transport Interface", () => {
    it("should have required properties", () => {
      expect(transport.name).toBeDefined();
      expect(transport.type).toBeDefined();
    });

    it("should have required methods", () => {
      expect(typeof transport.initialize).toBe("function");
      expect(typeof transport.start).toBe("function");
      expect(typeof transport.stop).toBe("function");
      expect(typeof transport.isRunning).toBe("function");
      expect(typeof transport.setToolListHandler).toBe("function");
      expect(typeof transport.setToolCallHandler).toBe("function");
    });

    it("should initialize successfully", async () => {
      await expect(transport.initialize()).resolves.not.toThrow();
    });

    it("should report not running initially", () => {
      expect(transport.isRunning()).toBe(false);
    });

    it("should accept tool handlers", () => {
      const toolListHandler = vi.fn().mockResolvedValue({ tools: [] });
      const toolCallHandler = vi.fn().mockResolvedValue({ content: [] });

      expect(() => transport.setToolListHandler(toolListHandler)).not.toThrow();
      expect(() => transport.setToolCallHandler(toolCallHandler)).not.toThrow();
    });
  });

  describe("Transport Lifecycle", () => {
    it("should handle stop when not started", async () => {
      await expect(transport.stop()).resolves.not.toThrow();
    });

    it("should maintain consistent state", () => {
      expect(transport.name).toBe("mcp-stdio");
      expect(transport.type).toBe("mcp-stdio");
    });
  });
});

describe("Transport Factory", () => {
  it("should create MCP stdio transport", async () => {
    const { createMCPStdio } = await import("../../src/transports/index.js");
    const transport = await createMCPStdio();

    expect(transport).toBeDefined();
    expect(transport.name).toBe("mcp-stdio");
    expect(transport.type).toBe("mcp-stdio");
  });

  it("should create HTTP transport", async () => {
    const { createHTTP } = await import("../../src/transports/index.js");
    const transport = await createHTTP(3000);

    expect(transport).toBeDefined();
    expect(transport.name).toBe("mcp-http");
    expect(transport.type).toBe("http");
  });

  it("should list available transports", async () => {
    const { getAvailableTransports } = await import("../../src/transports/index.js");
    const types = getAvailableTransports();

    expect(Array.isArray(types)).toBe(true);
    expect(types).toContain("mcp-stdio");
    expect(types).toContain("http");
  });
});
