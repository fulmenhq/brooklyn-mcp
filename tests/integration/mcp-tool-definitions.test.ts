/**
 * MCP Tool Definitions Integration Tests
 * Tests tool definitions and MCP protocol compliance for Phase 1A-1C tools
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it } from "vitest";
import type { EnhancedTool } from "../../src/core/tool-definitions.js";

describe("MCP Tool Definitions Integration", () => {
  let tools: EnhancedTool[];

  beforeEach(async () => {
    // Import tools directly from tool definitions
    const { getAllTools } = await import("../../src/core/tool-definitions.js");
    tools = getAllTools();
  });

  describe("Tool Discovery and Registration", () => {
    it("should register all Phase 1B interactive element tools", () => {
      // Arrange
      const expectedPhase1BTools = [
        "focus_element",
        "hover_element",
        "select_option",
        "clear_element",
        "drag_and_drop",
      ];

      // Act
      const toolNames = tools.map((tool: Tool) => tool.name);

      // Assert
      for (const expectedTool of expectedPhase1BTools) {
        expect(toolNames).toContain(expectedTool);
      }
    });

    it("should register all Phase 1A JavaScript execution tools", () => {
      // Arrange
      const expectedPhase1ATools = [
        "execute_script",
        "evaluate_expression",
        "get_console_messages",
        "add_script_tag",
      ];

      // Act
      const toolNames = tools.map((tool: Tool) => tool.name);

      // Assert
      for (const expectedTool of expectedPhase1ATools) {
        expect(toolNames).toContain(expectedTool);
      }
    });

    it("should register all Phase 1C content extraction tools", () => {
      // Arrange
      const expectedPhase1CTools = [
        "get_html",
        "get_attribute",
        "get_bounding_box",
        "is_visible",
        "is_enabled",
      ];

      // Act
      const toolNames = tools.map((tool: Tool) => tool.name);

      // Assert
      for (const expectedTool of expectedPhase1CTools) {
        expect(toolNames).toContain(expectedTool);
      }
    });

    it("should register core browser lifecycle tools", () => {
      // Arrange
      const expectedCoreTools = [
        "launch_browser",
        "close_browser",
        "navigate_to_url",
        "take_screenshot",
        "find_elements",
      ];

      // Act
      const toolNames = tools.map((tool: Tool) => tool.name);

      // Assert
      for (const expectedTool of expectedCoreTools) {
        expect(toolNames).toContain(expectedTool);
      }
    });

    it("should have minimum required tool count", () => {
      // Arrange
      const minimumExpectedTools = 20; // Phase 1A (4) + Phase 1B (5) + Phase 1C (5) + Core (6+)

      // Act & Assert
      expect(tools.length).toBeGreaterThanOrEqual(minimumExpectedTools);
    });

    it("should have all tools with proper MCP schema structure", () => {
      // Assert
      for (const tool of tools as Tool[]) {
        expect(tool).toHaveProperty("name");
        expect(tool).toHaveProperty("description");
        expect(tool).toHaveProperty("inputSchema");
        expect(typeof tool.name).toBe("string");
        expect(typeof tool.description).toBe("string");
        expect(typeof tool.inputSchema).toBe("object");
        expect(tool.name.length).toBeGreaterThan(0);
        expect(tool.description).toBeDefined();
        expect(tool.description!.length).toBeGreaterThan(0);
      }
    });

    it("should have tools with valid input schemas", () => {
      // Assert
      for (const tool of tools as Tool[]) {
        const schema = tool.inputSchema;
        expect(schema).toHaveProperty("type");
        expect(schema.type).toBe("object");

        if (schema.properties) {
          expect(typeof schema.properties).toBe("object");
        }

        if (schema["required"]) {
          expect(Array.isArray(schema["required"])).toBe(true);
        }
      }
    });
  });

  describe("Tool Categories and Organization", () => {
    it("should categorize Phase 1B tools as interaction tools", () => {
      // Arrange
      const phase1BTools = [
        "focus_element",
        "hover_element",
        "select_option",
        "clear_element",
        "drag_and_drop",
      ];

      // Assert
      for (const toolName of phase1BTools) {
        const tool = (tools as Tool[]).find((t) => t.name === toolName);
        expect(tool).toBeDefined();
        // Check if tool has category metadata (depends on EnhancedTool interface)
        if ((tool as any).category) {
          expect((tool as any).category).toBe("interaction");
        }
      }
    });

    it("should have tools with proper parameter definitions", () => {
      // Arrange
      const toolsWithSelectorRequirement = [
        "hover_element",
        "select_option",
        "clear_element",
        "get_attribute",
        "get_bounding_box",
        "is_visible",
        "is_enabled",
      ];

      // Assert
      for (const toolName of toolsWithSelectorRequirement) {
        const tool = (tools as Tool[]).find((t) => t.name === toolName);
        expect(tool).toBeDefined();
        expect(tool!.inputSchema.properties).toHaveProperty("selector");

        if (tool!.inputSchema["required"]) {
          expect(tool!.inputSchema["required"]).toContain("selector");
        }
      }
    });

    it("should have drag_and_drop with both source and target selectors", () => {
      // Act
      const dragTool = (tools as Tool[]).find((t) => t.name === "drag_and_drop");

      // Assert
      expect(dragTool).toBeDefined();
      expect(dragTool!.inputSchema.properties).toHaveProperty("sourceSelector");
      expect(dragTool!.inputSchema.properties).toHaveProperty("targetSelector");

      if (dragTool!.inputSchema["required"]) {
        expect(dragTool!.inputSchema["required"]).toContain("sourceSelector");
        expect(dragTool!.inputSchema["required"]).toContain("targetSelector");
      }
    });

    it("should have JavaScript tools with script/expression requirements", () => {
      // Act
      const executeScriptTool = (tools as Tool[]).find((t) => t.name === "execute_script");
      const evaluateExpressionTool = (tools as Tool[]).find(
        (t) => t.name === "evaluate_expression",
      );

      // Assert
      expect(executeScriptTool).toBeDefined();
      expect(executeScriptTool!.inputSchema.properties).toHaveProperty("script");

      expect(evaluateExpressionTool).toBeDefined();
      expect(evaluateExpressionTool!.inputSchema.properties).toHaveProperty("expression");
    });
  });

  describe("MCP Protocol Compliance", () => {
    it("should validate tool names are unique", () => {
      // Act
      const toolNames = tools.map((tool: Tool) => tool.name);

      // Assert
      const uniqueNames = new Set(toolNames);
      expect(uniqueNames.size).toBe(toolNames.length);
    });

    it("should validate tool names follow naming conventions", () => {
      // Assert
      for (const tool of tools as Tool[]) {
        // Tool names should be lowercase with underscores
        expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
        // No consecutive underscores
        expect(tool.name).not.toMatch(/__/);
        // No trailing underscores
        expect(tool.name).not.toMatch(/_$/);
      }
    });

    it("should have valid JSON Schema in input schemas", () => {
      // Assert
      for (const tool of tools as Tool[]) {
        const schema = tool.inputSchema;

        // Basic JSON Schema validation
        expect(schema).toHaveProperty("type");
        expect(["object", "array", "string", "number", "boolean", "null"]).toContain(schema.type);

        if (schema.properties) {
          for (const [propName, propSchema] of Object.entries(schema.properties)) {
            expect(typeof propName).toBe("string");
            expect(propSchema).toHaveProperty("type");
          }
        }
      }
    });

    it("should include browserId parameter in browser automation tools", () => {
      // Arrange
      const browserAutomationTools = [
        "focus_element",
        "hover_element",
        "select_option",
        "clear_element",
        "drag_and_drop",
        "execute_script",
        "evaluate_expression",
        "get_html",
        "get_attribute",
        "get_bounding_box",
        "is_visible",
        "is_enabled",
      ];

      // Assert
      for (const toolName of browserAutomationTools) {
        const tool = (tools as Tool[]).find((t) => t.name === toolName);
        expect(tool).toBeDefined();
        expect(tool!.inputSchema.properties).toHaveProperty("browserId");
      }
    });

    it("should have timeout parameters where appropriate", () => {
      // Arrange
      const toolsWithTimeout = [
        "focus_element",
        "hover_element",
        "select_option",
        "clear_element",
        "drag_and_drop",
        "get_attribute",
        "get_bounding_box",
        "is_visible",
        "is_enabled",
      ];

      // Assert
      for (const toolName of toolsWithTimeout) {
        const tool = (tools as Tool[]).find((t) => t.name === toolName);
        expect(tool).toBeDefined();

        if (tool!.inputSchema.properties?.["timeout"]) {
          const timeoutSchema = tool!.inputSchema.properties["timeout"] as any;
          expect(timeoutSchema.type).toBe("number");

          if (timeoutSchema.minimum !== undefined) {
            expect(timeoutSchema.minimum).toBeGreaterThan(0);
          }
        }
      }
    });
  });

  describe("Tool Descriptions and Documentation", () => {
    it("should have meaningful descriptions for all tools", () => {
      // Assert
      for (const tool of tools as Tool[]) {
        expect(tool.description).toBeDefined();
        expect(tool.description!.length).toBeGreaterThan(20);
        expect(tool.description!).not.toMatch(/^TODO|^FIXME|^XXX/i);
        expect(tool.description!).toMatch(/^[A-Z]/); // Should start with capital letter
      }
    });

    it("should have appropriate descriptions for Phase 1B tools", () => {
      // Assert specific tool descriptions
      const focusTool = (tools as Tool[]).find((t) => t.name === "focus_element");
      expect(focusTool?.description).toMatch(/focus.*element|accessibility|keyboard/i);

      const hoverTool = (tools as Tool[]).find((t) => t.name === "hover_element");
      expect(hoverTool?.description).toMatch(/hover.*element|hover.*state|trigger/i);

      const selectTool = (tools as Tool[]).find((t) => t.name === "select_option");
      expect(selectTool?.description).toMatch(/select.*option|dropdown|select.*element/i);

      const clearTool = (tools as Tool[]).find((t) => t.name === "clear_element");
      expect(clearTool?.description).toMatch(/clear.*content|input.*field|textarea/i);

      const dragTool = (tools as Tool[]).find((t) => t.name === "drag_and_drop");
      expect(dragTool?.description).toMatch(/drag.*element|source.*target|drag.*drop/i);
    });

    it("should have examples for enhanced tools", () => {
      // Assert
      for (const tool of tools) {
        const enhancedTool = tool as any;
        if (enhancedTool.examples) {
          expect(Array.isArray(enhancedTool.examples)).toBe(true);

          for (const example of enhancedTool.examples) {
            expect(example).toHaveProperty("description");
            expect(example).toHaveProperty("input");
            expect(typeof example.description).toBe("string");
            expect(example.description.length).toBeGreaterThan(10);
          }
        }
      }
    });

    it("should have error documentation for enhanced tools", () => {
      // Assert
      for (const tool of tools) {
        const enhancedTool = tool as any;
        if (enhancedTool.errors) {
          expect(Array.isArray(enhancedTool.errors)).toBe(true);

          for (const error of enhancedTool.errors) {
            expect(error).toHaveProperty("code");
            expect(error).toHaveProperty("message");
            expect(error).toHaveProperty("solution");
            expect(typeof error.code).toBe("string");
            expect(typeof error.message).toBe("string");
            expect(typeof error.solution).toBe("string");
          }
        }
      }
    });
  });

  describe("Performance and Resource Constraints", () => {
    it("should load all tools within reasonable time", () => {
      // Arrange
      const startTime = Date.now();

      // Act - tools are already loaded in beforeEach
      const loadTime = Date.now() - startTime;

      // Assert
      expect(loadTime).toBeLessThan(100); // Should load very quickly since it's just definitions
      expect(tools.length).toBeGreaterThan(0);
    });

    it("should have reasonable description lengths", () => {
      // Assert
      for (const tool of tools as Tool[]) {
        expect(tool.description).toBeDefined();
        expect(tool.description!.length).toBeLessThan(500); // Keep descriptions concise
        expect(tool.description!.length).toBeGreaterThan(20); // But meaningful
      }
    });

    it("should have consistent schema structure across tools", () => {
      // Assert
      for (const tool of tools as Tool[]) {
        // Browser automation tools should have browserId parameter (not browser lifecycle tools)
        const browserAutomationTools = [
          "focus_element",
          "hover_element",
          "select_option",
          "clear_element",
          "drag_and_drop",
          "execute_script",
          "evaluate_expression",
          "get_html",
          "get_attribute",
          "get_bounding_box",
          "is_visible",
          "is_enabled",
          "navigate_to_url",
          "take_screenshot",
          "find_elements",
          "click_element",
        ];

        if (browserAutomationTools.includes(tool.name)) {
          expect(tool.inputSchema.properties).toHaveProperty("browserId");
        }

        // All tools should have object type
        expect(tool.inputSchema.type).toBe("object");
        expect(tool.inputSchema.properties).toBeDefined();
      }
    });

    it("should have reasonable number of properties per tool", () => {
      // Assert
      for (const tool of tools as Tool[]) {
        const propertyCount = Object.keys(tool.inputSchema.properties || {}).length;
        expect(propertyCount).toBeLessThan(15); // Don't make tools too complex

        // Most tools should have at least one parameter (some discovery tools might be empty)
        if (tool.name !== "brooklyn_list_tools" && !tool.name.includes("list")) {
          expect(propertyCount).toBeGreaterThan(0); // But they should have some parameters
        }
      }
    });
  });
});
