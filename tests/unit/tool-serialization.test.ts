/**
 * Test that tool definitions can be properly serialized and parsed
 */

import { describe, expect, it } from "vitest";
import { ToolDiscoveryService } from "../../src/core/discovery/tool-discovery-service.js";
import { getAllTools } from "../../src/core/tool-definitions.js";

describe("Tool Serialization", () => {
  it("should serialize all tools to valid JSON", () => {
    const tools = getAllTools();

    // Test direct serialization
    const jsonString = JSON.stringify({ tools });
    expect(() => JSON.parse(jsonString)).not.toThrow();

    const parsed = JSON.parse(jsonString);
    expect(parsed.tools).toHaveLength(tools.length);
  });

  it("should serialize MCP-compliant tools list", () => {
    const discovery = new ToolDiscoveryService({
      version: "1.0.0",
      serverName: "test",
      description: "test",
      capabilities: [],
      categories: [],
    });

    const enhancedTools = getAllTools();
    discovery.registerTools(enhancedTools);

    const mcpTools = discovery.getMCPTools();

    // Test MCP tools serialization
    const toolsListResponse = {
      tools: mcpTools,
    };

    const jsonString = JSON.stringify(toolsListResponse);
    expect(() => JSON.parse(jsonString)).not.toThrow();

    // Verify structure matches MCP spec
    const parsed = JSON.parse(jsonString);
    expect(parsed.tools).toBeDefined();
    expect(Array.isArray(parsed.tools)).toBe(true);

    // Check each tool has only MCP-compliant properties
    for (const tool of parsed.tools) {
      expect(tool).toHaveProperty("name");
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("inputSchema");

      // Should NOT have enhanced properties
      expect(tool).not.toHaveProperty("category");
      expect(tool).not.toHaveProperty("examples");
      expect(tool).not.toHaveProperty("errors");
    }
  });

  it("should handle large JSON payloads", () => {
    const discovery = new ToolDiscoveryService({
      version: "1.0.0",
      serverName: "test",
      description: "test",
      capabilities: [],
      categories: [],
    });

    const enhancedTools = getAllTools();
    discovery.registerTools(enhancedTools);

    const mcpTools = discovery.getMCPTools();
    const response = { tools: mcpTools };

    const jsonString = JSON.stringify(response);
    const sizeInKB = new TextEncoder().encode(jsonString).length / 1024;

    // Log size info (commented out to avoid biome errors)
    // console.log(`Tool list JSON size: ${sizeInKB.toFixed(2)} KB`);
    // console.log(`Number of tools: ${mcpTools.length}`);

    // Check if size is reasonable
    expect(sizeInKB).toBeLessThan(500); // Should be under 500KB

    // Should still parse correctly
    expect(() => JSON.parse(jsonString)).not.toThrow();
  });

  it("should not have problematic characters in tool descriptions", () => {
    const tools = getAllTools();

    for (const tool of tools) {
      // Check for unescaped quotes or other problematic characters
      const description = tool.description;

      // Description should not have unescaped quotes that could break JSON
      expect(description).not.toMatch(/(?<!\\)"/); // No unescaped quotes

      // Check that description can be safely serialized
      const testObj = { description };
      expect(() => JSON.stringify(testObj)).not.toThrow();
      expect(() => JSON.parse(JSON.stringify(testObj))).not.toThrow();
    }
  });

  it("should validate inputSchema is valid JSON Schema", () => {
    const tools = getAllTools();

    for (const tool of tools) {
      // inputSchema should be a valid object
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.inputSchema).toBe("object");

      // Should have 'type' property
      expect(tool.inputSchema).toHaveProperty("type");

      // Should serialize without issues
      const schemaString = JSON.stringify(tool.inputSchema);
      expect(() => JSON.parse(schemaString)).not.toThrow();
    }
  });

  it("should test HTTP transport serialization", () => {
    // Simulate what HTTP transport does
    const discovery = new ToolDiscoveryService({
      version: "1.0.0",
      serverName: "brooklyn-mcp-server",
      description: "Brooklyn MCP Server",
      capabilities: [],
      categories: [],
    });

    const enhancedTools = getAllTools();
    discovery.registerTools(enhancedTools);

    // Simulate the tool list handler
    const toolListResult = {
      tools: discovery.getMCPTools(),
    };

    // This is what gets sent over HTTP
    const httpResponse = {
      jsonrpc: "2.0",
      id: 1,
      result: toolListResult,
    };

    const jsonString = JSON.stringify(httpResponse);

    // Should not throw
    expect(() => JSON.parse(jsonString)).not.toThrow();

    // Check structure
    const parsed = JSON.parse(jsonString);
    expect(parsed.jsonrpc).toBe("2.0");
    expect(parsed.id).toBe(1);
    expect(parsed.result).toBeDefined();
    expect(parsed.result.tools).toBeDefined();
    expect(Array.isArray(parsed.result.tools)).toBe(true);
  });
});
