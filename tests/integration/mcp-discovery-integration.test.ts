/**
 * MCP Discovery Integration Test
 *
 * Tests the integration between MCP protocol and the enhanced discovery system
 * Validates that Architecture's discovery service works through MCP tools
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BrooklynEngine, type BrooklynEngineOptions } from "../../src/core/brooklyn-engine.js";
import type { BrooklynConfig } from "../../src/core/config.js";
import { createMCPStdio } from "../../src/transports/index.js";

describe("MCP Discovery Integration", () => {
  let engine: BrooklynEngine;
  let transport: any;

  beforeAll(async () => {
    // Initialize logging
    const { initializeLogging } = await import("../../src/shared/pino-logger.js");
    const testConfig: BrooklynConfig = {
      serviceName: "brooklyn-test",
      version: "1.0.0",
      environment: "test",
      teamId: "test-team",
      logging: { level: "error", format: "json", maxFiles: 5, maxSize: "10MB" },
      transports: {
        mcp: { enabled: true },
        http: { enabled: false, port: 3001, host: "localhost", cors: false, rateLimiting: false },
      },
      browsers: {
        maxInstances: 3,
        defaultType: "chromium",
        headless: true,
        timeout: 30000,
      },
      security: {
        allowedDomains: ["*"],
        rateLimit: { requests: 100, windowMs: 60000 },
      },
      plugins: {
        directory: "",
        autoLoad: false,
        allowUserPlugins: false,
      },
      paths: {
        config: "",
        logs: "",
        plugins: "",
        browsers: "",
        pids: "",
      },
    };

    initializeLogging(testConfig);

    // Create Brooklyn engine
    const options: BrooklynEngineOptions = {
      config: testConfig,
      correlationId: "discovery-test",
    };

    engine = new BrooklynEngine(options);
    await engine.initialize();

    // Create mock transport to test tool handlers
    transport = await createMCPStdio();
    await engine.addTransport("test", transport);
  });

  afterAll(async () => {
    if (engine) {
      await engine.cleanup();
    }
  });

  describe("Discovery Service Integration", () => {
    it("should have discovery service initialized with categories", () => {
      const status = engine.getStatus();

      // Should have proper discovery integration
      expect(status.initialized).toBe(true);
      expect(status.browserPool).toBeDefined();
    });

    it("should provide brooklyn_list_tools through MCP", async () => {
      // Test that the tool is available in tool list
      const toolListHandler = (engine as any).createToolListHandler("test");
      const toolList = await toolListHandler();

      expect(toolList.tools).toBeDefined();
      expect(Array.isArray(toolList.tools)).toBe(true);
      expect(toolList.tools.length).toBeGreaterThan(0);

      // Should include discovery tools
      const discoveryTools = toolList.tools.filter(
        (tool: any) => tool.name === "brooklyn_list_tools" || tool.name === "brooklyn_tool_help",
      );
      expect(discoveryTools.length).toBeGreaterThan(0);
    });

    it("should provide brooklyn_tool_help through MCP", async () => {
      // Test that brooklyn_tool_help is available
      const toolListHandler = (engine as any).createToolListHandler("test");
      const toolList = await toolListHandler();

      const helpTool = toolList.tools.find((tool: any) => tool.name === "brooklyn_tool_help");
      expect(helpTool).toBeDefined();
      expect(helpTool.description).toContain("help");
    });

    it("should have enhanced core tools with rich metadata", async () => {
      // Get tool list
      const toolListHandler = (engine as any).createToolListHandler("test");
      const toolList = await toolListHandler();

      // Should have core browser automation tools
      const coreTools = [
        "launch_browser",
        "navigate_to_url",
        "take_screenshot",
        "brooklyn_list_tools",
        "brooklyn_tool_help",
      ];

      for (const toolName of coreTools) {
        const tool = toolList.tools.find((t: any) => t.name === toolName);
        expect(tool, `Tool ${toolName} should be available`).toBeDefined();
        expect(tool.description, `Tool ${toolName} should have description`).toBeDefined();
        expect(tool.inputSchema, `Tool ${toolName} should have input schema`).toBeDefined();
      }
    });

    it("should categorize tools properly", async () => {
      // Test brooklyn_list_tools to see categories
      const toolCallHandler = (engine as any).createToolCallHandler("test");

      const listRequest = {
        method: "tools/call" as const,
        params: {
          name: "brooklyn_list_tools",
          arguments: {},
        },
      };

      const response = await toolCallHandler(listRequest);
      expect(response.content).toBeDefined();
      expect(response.content[0].type).toBe("text");

      const result = JSON.parse(response.content[0].text);
      expect(result.categories).toBeDefined();
      expect(Array.isArray(result.categories)).toBe(true);
      expect(result.totalTools).toBeGreaterThan(0);

      // Should have standard categories
      const categoryIds = result.categories.map((c: any) => c.id);
      expect(categoryIds).toContain("browser-lifecycle");
      expect(categoryIds).toContain("navigation");
      expect(categoryIds).toContain("content-capture");
      expect(categoryIds).toContain("interaction");
      expect(categoryIds).toContain("javascript");
      expect(categoryIds).toContain("styling");
      expect(categoryIds).toContain("discovery");
      expect(categoryIds).toContain("onboarding");
    });

    it("should provide tool help with examples and errors", async () => {
      const toolCallHandler = (engine as any).createToolCallHandler("test");

      const helpRequest = {
        method: "tools/call" as const,
        params: {
          name: "brooklyn_tool_help",
          arguments: { toolName: "launch_browser" },
        },
      };

      const response = await toolCallHandler(helpRequest);
      expect(response.content).toBeDefined();
      expect(response.content[0].type).toBe("text");

      const result = JSON.parse(response.content[0].text);
      expect(result.name).toBe("launch_browser");
      expect(result.description).toBeDefined();
      expect(result.category).toBeDefined();
      expect(result.inputSchema).toBeDefined();
      expect(result.examples).toBeDefined();
      expect(result.errors).toBeDefined();
    });

    it("should handle tool search and suggestions", async () => {
      const toolCallHandler = (engine as any).createToolCallHandler("test");

      // Test with non-existent tool to trigger search
      const helpRequest = {
        method: "tools/call" as const,
        params: {
          name: "brooklyn_tool_help",
          arguments: { toolName: "nonexistent_tool" },
        },
      };

      const response = await toolCallHandler(helpRequest);
      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain("not found");
    });

    it("should ensure all tool categories from definitions are registered", async () => {
      // Import tool definitions to get all actual categories used
      const { getAllTools } = await import("../../src/core/tool-definitions.js");
      const allTools = getAllTools();

      // Extract unique categories from tool definitions
      const definedCategories = new Set(allTools.map((tool) => tool.category));

      // Get registered categories from discovery service
      const toolCallHandler = (engine as any).createToolCallHandler("test");
      const listRequest = {
        method: "tools/call" as const,
        params: {
          name: "brooklyn_list_tools",
          arguments: {},
        },
      };

      const response = await toolCallHandler(listRequest);
      const result = JSON.parse(response.content[0].text);
      const registeredCategories = new Set(result.categories.map((c: any) => c.id));

      // CRITICAL: Every category used in tool definitions MUST be registered
      // This prevents the issue where tools are counted but not accessible
      for (const definedCategory of definedCategories) {
        expect(
          registeredCategories.has(definedCategory),
          `Category '${definedCategory}' is used in tool definitions but not registered in brooklyn-engine.ts registerStandardCategories(). This causes tools to be counted but not accessible.`,
        ).toBe(true);
      }

      // Verify tool count matches (all tools should be accessible)
      expect(result.totalTools).toBe(allTools.length);
    });
  });

  describe("MCP Protocol Compliance", () => {
    it("should return proper MCP tool format", async () => {
      const toolListHandler = (engine as any).createToolListHandler("test");
      const toolList = await toolListHandler();

      // Check that tools conform to MCP Tool interface
      for (const tool of toolList.tools) {
        expect(tool).toHaveProperty("name");
        expect(tool).toHaveProperty("description");
        expect(tool).toHaveProperty("inputSchema");
        expect(typeof tool.name).toBe("string");
        expect(typeof tool.description).toBe("string");
        expect(typeof tool.inputSchema).toBe("object");
      }
    });

    it("should handle tool calls with proper error responses", async () => {
      const toolCallHandler = (engine as any).createToolCallHandler("test");

      // Test with invalid arguments
      const badRequest = {
        method: "tools/call" as const,
        params: {
          name: "brooklyn_tool_help",
          arguments: { toolName: "" }, // Empty toolName should trigger error
        },
      };

      const response = await toolCallHandler(badRequest);
      expect(response.isError).toBe(true);
      // Accept either generic "Error" prefix or current detailed not-found message
      const text = String(response.content?.[0]?.text ?? "");
      expect(
        text.includes("Error") ||
          text.includes("Tool '' not found") ||
          text.toLowerCase().includes("not found"),
      ).toBe(true);
    });
  });

  describe("Architecture Integration Validation", () => {
    it("should demonstrate ToolDiscoveryService reusability", async () => {
      // Test that the discovery service provides standardized interfaces
      const toolListHandler = (engine as any).createToolListHandler("test");
      const toolList = await toolListHandler();

      // Should have consistent structure that other MCP servers can use
      expect(toolList).toHaveProperty("tools");
      expect(Array.isArray(toolList.tools)).toBe(true);

      // Tools should have enhanced metadata
      const sampleTool = toolList.tools[0];
      expect(sampleTool).toHaveProperty("name");
      expect(sampleTool).toHaveProperty("description");
      expect(sampleTool).toHaveProperty("inputSchema");
    });

    it("should validate tool implementation standards compliance", async () => {
      const toolListHandler = (engine as any).createToolListHandler("test");
      const toolList = await toolListHandler();

      // Check naming conventions
      for (const tool of toolList.tools) {
        // Should follow verb_noun_modifier pattern or brooklyn_ prefix
        expect(tool.name).toMatch(/^[a-z]+(_[a-z]+)*$|^brooklyn_[a-z_]+$/);

        // Should have meaningful descriptions
        expect(tool.description.length).toBeGreaterThan(10);

        // Should have proper input schemas
        expect(tool.inputSchema).toHaveProperty("type");
        expect(tool.inputSchema.type).toBe("object");
      }
    });
  });
});
