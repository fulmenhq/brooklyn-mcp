/**
 * MCP Router Parameter Validation Tests
 * Tests parameter validation for all Phase 1A-1C MCP tools
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCPBrowserRouter } from "../../src/core/browser/mcp-browser-router.js";
import type { MCPRequestContext } from "../../src/core/browser/mcp-request-context.js";

// Mock browser pool manager
const mockPoolManager = {
  focusElement: vi.fn(),
  hoverElement: vi.fn(),
  selectOption: vi.fn(),
  clearElement: vi.fn(),
  dragAndDrop: vi.fn(),
  executeScript: vi.fn(),
  evaluateExpression: vi.fn(),
  getConsoleMessages: vi.fn(),
  addScriptTag: vi.fn(),
  extractCSS: vi.fn(),
  getComputedStyles: vi.fn(),
  diffCSS: vi.fn(),
  analyzeSpecificity: vi.fn(),
  getHtml: vi.fn(),
  getAttribute: vi.fn(),
  getBoundingBox: vi.fn(),
  isVisible: vi.fn(),
  isEnabled: vi.fn(),
} as any;

// Mock context
const mockContext: MCPRequestContext = {
  teamId: "test-team",
  requestId: "test-request",
  timestamp: new Date(),
};

// Mock Pino logger
vi.mock("../../src/shared/pino-logger.js", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe("MCP Router Parameter Validation", () => {
  let router: MCPBrowserRouter;

  beforeEach(() => {
    vi.clearAllMocks();
    router = new MCPBrowserRouter(mockPoolManager);

    // Setup mock session for browser resolution
    (router as any).activeSessions.set("test-browser", {
      teamId: "test-team",
      createdAt: new Date(),
    });

    // Setup default successful responses
    mockPoolManager.focusElement.mockResolvedValue({
      success: true,
      selector: "test",
      focused: true,
    });
    mockPoolManager.hoverElement.mockResolvedValue({
      success: true,
      selector: "test",
      hovered: true,
    });
    mockPoolManager.selectOption.mockResolvedValue({
      success: true,
      selector: "test",
      selectedValue: "test",
    });
    mockPoolManager.clearElement.mockResolvedValue({
      success: true,
      selector: "test",
      cleared: true,
    });
    mockPoolManager.dragAndDrop.mockResolvedValue({
      success: true,
      sourceSelector: "test",
      targetSelector: "test2",
      completed: true,
    });
  });

  describe("Phase 1B: Interactive Element Enhancement", () => {
    describe("focus_element parameter validation", () => {
      it("should pass through missing selector to browser pool manager", async () => {
        // Arrange
        const request = {
          tool: "focus_element",
          params: {
            browserId: "test-browser",
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert - focus_element doesn't validate selector at router level
        expect(result.success).toBe(true);
        expect(mockPoolManager.focusElement).toHaveBeenCalledWith({
          browserId: "test-browser",
          selector: undefined,
          timeout: undefined,
        });
      });

      it("should accept valid parameters", async () => {
        // Arrange
        const request = {
          tool: "focus_element",
          params: {
            browserId: "test-browser",
            selector: "#test-input",
            timeout: 5000,
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(true);
        expect(mockPoolManager.focusElement).toHaveBeenCalledWith({
          browserId: "test-browser",
          selector: "#test-input",
          timeout: 5000,
        });
      });

      it("should use default timeout when not provided", async () => {
        // Arrange
        const request = {
          tool: "focus_element",
          params: {
            browserId: "test-browser",
            selector: "#test-input",
          },
          context: mockContext,
        };

        // Act
        await router.route(request);

        // Assert
        expect(mockPoolManager.focusElement).toHaveBeenCalledWith({
          browserId: "test-browser",
          selector: "#test-input",
          timeout: undefined,
        });
      });

      it("should handle invalid timeout values", async () => {
        // Arrange
        const request = {
          tool: "focus_element",
          params: {
            browserId: "test-browser",
            selector: "#test-input",
            timeout: "invalid",
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(true);
        expect(mockPoolManager.focusElement).toHaveBeenCalledWith({
          browserId: "test-browser",
          selector: "#test-input",
          timeout: "invalid",
        });
      });
    });

    describe("hover_element parameter validation", () => {
      it("should require selector parameter", async () => {
        // Arrange
        const request = {
          tool: "hover_element",
          params: {
            browserId: "test-browser",
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain("selector");
      });

      it("should accept valid hover parameters", async () => {
        // Arrange
        const request = {
          tool: "hover_element",
          params: {
            browserId: "test-browser",
            selector: ".hover-target",
            timeout: 10000,
            force: true,
            position: { x: 10, y: 20 },
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(true);
        expect(mockPoolManager.hoverElement).toHaveBeenCalledWith({
          browserId: "test-browser",
          selector: ".hover-target",
          timeout: 10000,
          force: true,
          position: { x: 10, y: 20 },
        });
      });

      it("should handle boolean and position parameter types", async () => {
        // Arrange
        const request = {
          tool: "hover_element",
          params: {
            browserId: "test-browser",
            selector: ".hover-target",
            force: false,
            position: { x: 0, y: 0 },
          },
          context: mockContext,
        };

        // Act
        await router.route(request);

        // Assert
        expect(mockPoolManager.hoverElement).toHaveBeenCalledWith({
          browserId: "test-browser",
          selector: ".hover-target",
          timeout: undefined,
          force: false,
          position: { x: 0, y: 0 },
        });
      });
    });

    describe("select_option parameter validation", () => {
      it("should require selector parameter", async () => {
        // Arrange
        const request = {
          tool: "select_option",
          params: {
            browserId: "test-browser",
            value: "option1",
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain("selector");
      });

      it("should accept selection by value", async () => {
        // Arrange
        const request = {
          tool: "select_option",
          params: {
            browserId: "test-browser",
            selector: "#test-select",
            value: "option2",
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(true);
        expect(mockPoolManager.selectOption).toHaveBeenCalledWith({
          browserId: "test-browser",
          selector: "#test-select",
          value: "option2",
          label: undefined,
          index: undefined,
          timeout: undefined,
        });
      });

      it("should accept selection by label", async () => {
        // Arrange
        const request = {
          tool: "select_option",
          params: {
            browserId: "test-browser",
            selector: "#test-select",
            label: "Option Two",
          },
          context: mockContext,
        };

        // Act
        await router.route(request);

        // Assert
        expect(mockPoolManager.selectOption).toHaveBeenCalledWith({
          browserId: "test-browser",
          selector: "#test-select",
          value: undefined,
          label: "Option Two",
          index: undefined,
          timeout: undefined,
        });
      });

      it("should accept selection by index", async () => {
        // Arrange
        const request = {
          tool: "select_option",
          params: {
            browserId: "test-browser",
            selector: "#test-select",
            index: 2,
          },
          context: mockContext,
        };

        // Act
        await router.route(request);

        // Assert
        expect(mockPoolManager.selectOption).toHaveBeenCalledWith({
          browserId: "test-browser",
          selector: "#test-select",
          value: undefined,
          label: undefined,
          index: 2,
          timeout: undefined,
        });
      });

      it("should handle multiple selection criteria", async () => {
        // Arrange - providing both value and label (implementation should handle priority)
        const request = {
          tool: "select_option",
          params: {
            browserId: "test-browser",
            selector: "#test-select",
            value: "option1",
            label: "Option One",
            timeout: 8000,
          },
          context: mockContext,
        };

        // Act
        await router.route(request);

        // Assert
        expect(mockPoolManager.selectOption).toHaveBeenCalledWith({
          browserId: "test-browser",
          selector: "#test-select",
          value: "option1",
          label: "Option One",
          index: undefined,
          timeout: 8000,
        });
      });
    });

    describe("clear_element parameter validation", () => {
      it("should require selector parameter", async () => {
        // Arrange
        const request = {
          tool: "clear_element",
          params: {
            browserId: "test-browser",
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain("selector");
      });

      it("should accept valid clear parameters", async () => {
        // Arrange
        const request = {
          tool: "clear_element",
          params: {
            browserId: "test-browser",
            selector: "#text-input",
            timeout: 15000,
            force: true,
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(true);
        expect(mockPoolManager.clearElement).toHaveBeenCalledWith({
          browserId: "test-browser",
          selector: "#text-input",
          timeout: 15000,
          force: true,
        });
      });

      it("should handle optional parameters", async () => {
        // Arrange
        const request = {
          tool: "clear_element",
          params: {
            browserId: "test-browser",
            selector: "#text-input",
          },
          context: mockContext,
        };

        // Act
        await router.route(request);

        // Assert
        expect(mockPoolManager.clearElement).toHaveBeenCalledWith({
          browserId: "test-browser",
          selector: "#text-input",
          timeout: undefined,
          force: undefined,
        });
      });
    });

    describe("drag_and_drop parameter validation", () => {
      it("should require sourceSelector parameter", async () => {
        // Arrange
        const request = {
          tool: "drag_and_drop",
          params: {
            browserId: "test-browser",
            targetSelector: "#drop-zone",
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain("sourceSelector");
      });

      it("should require targetSelector parameter", async () => {
        // Arrange
        const request = {
          tool: "drag_and_drop",
          params: {
            browserId: "test-browser",
            sourceSelector: "#draggable",
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain("targetSelector");
      });

      it("should accept valid drag and drop parameters", async () => {
        // Arrange
        const request = {
          tool: "drag_and_drop",
          params: {
            browserId: "test-browser",
            sourceSelector: "#draggable",
            targetSelector: "#drop-zone",
            sourcePosition: { x: 5, y: 5 },
            targetPosition: { x: 50, y: 50 },
            timeout: 20000,
            force: true,
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(true);
        expect(mockPoolManager.dragAndDrop).toHaveBeenCalledWith({
          browserId: "test-browser",
          sourceSelector: "#draggable",
          targetSelector: "#drop-zone",
          sourcePosition: { x: 5, y: 5 },
          targetPosition: { x: 50, y: 50 },
          timeout: 20000,
          force: true,
        });
      });

      it("should handle partial position parameters", async () => {
        // Arrange
        const request = {
          tool: "drag_and_drop",
          params: {
            browserId: "test-browser",
            sourceSelector: "#draggable",
            targetSelector: "#drop-zone",
            sourcePosition: { x: 10, y: 10 },
          },
          context: mockContext,
        };

        // Act
        await router.route(request);

        // Assert
        expect(mockPoolManager.dragAndDrop).toHaveBeenCalledWith({
          browserId: "test-browser",
          sourceSelector: "#draggable",
          targetSelector: "#drop-zone",
          sourcePosition: { x: 10, y: 10 },
          targetPosition: undefined,
          timeout: undefined,
          force: undefined,
        });
      });
    });
  });

  describe("Phase 1A: JavaScript Execution", () => {
    beforeEach(() => {
      mockPoolManager.executeScript.mockResolvedValue({
        success: true,
        result: "script result",
      });
      mockPoolManager.evaluateExpression.mockResolvedValue({
        success: true,
        result: "expression result",
      });
      mockPoolManager.getConsoleMessages.mockResolvedValue({
        success: true,
        messages: [],
      });
      mockPoolManager.addScriptTag.mockResolvedValue({
        success: true,
        elementId: "script-123",
      });
    });

    describe("execute_script parameter validation", () => {
      it("should require script parameter", async () => {
        // Arrange
        const request = {
          tool: "execute_script",
          params: {
            browserId: "test-browser",
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain("script");
      });

      it("should accept valid script execution parameters", async () => {
        // Arrange
        const request = {
          tool: "execute_script",
          params: {
            browserId: "test-browser",
            script: "document.title = 'Test';",
            args: ["arg1", "arg2"],
            timeout: 10000,
            awaitPromise: true,
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(true);
        expect(mockPoolManager.executeScript).toHaveBeenCalledWith({
          browserId: "test-browser",
          script: "document.title = 'Test';",
          args: ["arg1", "arg2"],
          timeout: 10000,
          awaitPromise: true,
        });
      });
    });

    describe("evaluate_expression parameter validation", () => {
      it("should require expression parameter", async () => {
        // Arrange
        const request = {
          tool: "evaluate_expression",
          params: {
            browserId: "test-browser",
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain("expression");
      });

      it("should accept valid expression parameters", async () => {
        // Arrange
        const request = {
          tool: "evaluate_expression",
          params: {
            browserId: "test-browser",
            expression: "document.readyState",
            timeout: 5000,
            awaitPromise: false,
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(true);
        expect(mockPoolManager.evaluateExpression).toHaveBeenCalledWith({
          browserId: "test-browser",
          expression: "document.readyState",
          timeout: 5000,
          awaitPromise: false,
        });
      });
    });

    describe("add_script_tag parameter validation", () => {
      it("should require either content or url parameter", async () => {
        // Arrange
        const request = {
          tool: "add_script_tag",
          params: {
            browserId: "test-browser",
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toMatch(/content.*url/);
      });

      it("should accept content parameter", async () => {
        // Arrange
        const request = {
          tool: "add_script_tag",
          params: {
            browserId: "test-browser",
            content: "console.log('test');",
            type: "text/javascript",
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(true);
        expect(mockPoolManager.addScriptTag).toHaveBeenCalledWith({
          browserId: "test-browser",
          content: "console.log('test');",
          url: undefined,
          type: "text/javascript",
        });
      });

      it("should accept url parameter", async () => {
        // Arrange
        const request = {
          tool: "add_script_tag",
          params: {
            browserId: "test-browser",
            url: "https://example.com/script.js",
          },
          context: mockContext,
        };

        // Act
        await router.route(request);

        // Assert
        expect(mockPoolManager.addScriptTag).toHaveBeenCalledWith({
          browserId: "test-browser",
          content: undefined,
          url: "https://example.com/script.js",
          type: undefined,
        });
      });
    });

    describe("get_console_messages parameter validation", () => {
      it("should work with all optional parameters", async () => {
        // Arrange
        const request = {
          tool: "get_console_messages",
          params: {
            browserId: "test-browser",
            level: "error",
            since: "2024-01-01T00:00:00Z",
            limit: 50,
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(true);
        expect(mockPoolManager.getConsoleMessages).toHaveBeenCalledWith({
          browserId: "test-browser",
          level: "error",
          since: "2024-01-01T00:00:00Z",
          limit: 50,
        });
      });

      it("should work with no optional parameters", async () => {
        // Arrange
        const request = {
          tool: "get_console_messages",
          params: {
            browserId: "test-browser",
          },
          context: mockContext,
        };

        // Act
        await router.route(request);

        // Assert
        expect(mockPoolManager.getConsoleMessages).toHaveBeenCalledWith({
          browserId: "test-browser",
          level: undefined,
          since: undefined,
          limit: undefined,
        });
      });
    });
  });

  describe("Phase 1C: Content Extraction", () => {
    beforeEach(() => {
      mockPoolManager.getHtml.mockResolvedValue({
        success: true,
        html: "<div>test</div>",
      });
      mockPoolManager.getAttribute.mockResolvedValue({
        success: true,
        attribute: "value",
        value: "test-value",
      });
      mockPoolManager.getBoundingBox.mockResolvedValue({
        success: true,
        boundingBox: { x: 0, y: 0, width: 100, height: 50 },
      });
      mockPoolManager.isVisible.mockResolvedValue({
        success: true,
        visible: true,
      });
      mockPoolManager.isEnabled.mockResolvedValue({
        success: true,
        enabled: true,
      });
    });

    describe("get_html parameter validation", () => {
      it("should work with optional selector", async () => {
        // Arrange
        const request = {
          tool: "get_html",
          params: {
            browserId: "test-browser",
            selector: "#content",
            includeStyles: true,
            prettify: true,
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(true);
        expect(mockPoolManager.getHtml).toHaveBeenCalledWith({
          browserId: "test-browser",
          selector: "#content",
          includeStyles: true,
          prettify: true,
          timeout: undefined,
        });
      });

      it("should work without selector (full page)", async () => {
        // Arrange
        const request = {
          tool: "get_html",
          params: {
            browserId: "test-browser",
          },
          context: mockContext,
        };

        // Act
        await router.route(request);

        // Assert
        expect(mockPoolManager.getHtml).toHaveBeenCalledWith({
          browserId: "test-browser",
          selector: undefined,
          includeStyles: undefined,
          prettify: undefined,
          timeout: undefined,
        });
      });
    });

    describe("get_attribute parameter validation", () => {
      it("should require selector parameter", async () => {
        // Arrange
        const request = {
          tool: "get_attribute",
          params: {
            browserId: "test-browser",
            attribute: "href",
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain("selector");
      });

      it("should accept valid attribute parameters", async () => {
        // Arrange
        const request = {
          tool: "get_attribute",
          params: {
            browserId: "test-browser",
            selector: "a.link",
            attribute: "href",
            timeout: 8000,
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(true);
        expect(mockPoolManager.getAttribute).toHaveBeenCalledWith({
          browserId: "test-browser",
          selector: "a.link",
          attribute: "href",
          timeout: 8000,
        });
      });

      it("should work without specific attribute (get all)", async () => {
        // Arrange
        const request = {
          tool: "get_attribute",
          params: {
            browserId: "test-browser",
            selector: "input",
          },
          context: mockContext,
        };

        // Act
        await router.route(request);

        // Assert
        expect(mockPoolManager.getAttribute).toHaveBeenCalledWith({
          browserId: "test-browser",
          selector: "input",
          attribute: undefined,
          timeout: undefined,
        });
      });
    });

    describe("get_bounding_box parameter validation", () => {
      it("should require selector parameter", async () => {
        // Arrange
        const request = {
          tool: "get_bounding_box",
          params: {
            browserId: "test-browser",
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain("selector");
      });

      it("should accept valid bounding box parameters", async () => {
        // Arrange
        const request = {
          tool: "get_bounding_box",
          params: {
            browserId: "test-browser",
            selector: ".element",
            includeViewport: true,
            timeout: 12000,
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(true);
        expect(mockPoolManager.getBoundingBox).toHaveBeenCalledWith({
          browserId: "test-browser",
          selector: ".element",
          includeViewport: true,
          timeout: 12000,
        });
      });
    });

    describe("is_visible parameter validation", () => {
      it("should require selector parameter", async () => {
        // Arrange
        const request = {
          tool: "is_visible",
          params: {
            browserId: "test-browser",
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain("selector");
      });

      it("should accept valid visibility parameters", async () => {
        // Arrange
        const request = {
          tool: "is_visible",
          params: {
            browserId: "test-browser",
            selector: ".modal",
            timeout: 6000,
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(true);
        expect(mockPoolManager.isVisible).toHaveBeenCalledWith({
          browserId: "test-browser",
          selector: ".modal",
          timeout: 6000,
        });
      });
    });

    describe("is_enabled parameter validation", () => {
      it("should require selector parameter", async () => {
        // Arrange
        const request = {
          tool: "is_enabled",
          params: {
            browserId: "test-browser",
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(false);
        expect(result.error?.message).toContain("selector");
      });

      it("should accept valid enabled parameters", async () => {
        // Arrange
        const request = {
          tool: "is_enabled",
          params: {
            browserId: "test-browser",
            selector: "button.submit",
            timeout: 4000,
          },
          context: mockContext,
        };

        // Act
        const result = await router.route(request);

        // Assert
        expect(result.success).toBe(true);
        expect(mockPoolManager.isEnabled).toHaveBeenCalledWith({
          browserId: "test-browser",
          selector: "button.submit",
          timeout: 4000,
        });
      });
    });
  });

  describe("Browser ID Resolution", () => {
    it("should handle missing browserId with active session", async () => {
      // Arrange
      const request = {
        tool: "focus_element",
        params: {
          selector: "#test-input",
        },
        context: mockContext,
      };

      // Act
      const result = await router.route(request);

      // Assert
      expect(result.success).toBe(true);
      expect(mockPoolManager.focusElement).toHaveBeenCalledWith({
        browserId: "test-browser", // Should resolve to existing session
        selector: "#test-input",
        timeout: undefined,
      });
    });

    it("should handle legacy parameter aliases", async () => {
      // Arrange - using 'id' instead of 'browserId'
      const request = {
        tool: "focus_element",
        params: {
          id: "test-browser",
          selector: "#test-input",
        },
        context: mockContext,
      };

      // Act
      await router.route(request);

      // Assert
      expect(mockPoolManager.focusElement).toHaveBeenCalledWith({
        browserId: "test-browser",
        selector: "#test-input",
        timeout: undefined,
      });
    });

    it("should handle browser_id alias", async () => {
      // Arrange - using 'browser_id' instead of 'browserId'
      const request = {
        tool: "focus_element",
        params: {
          browser_id: "test-browser",
          selector: "#test-input",
        },
        context: mockContext,
      };

      // Act
      await router.route(request);

      // Assert
      expect(mockPoolManager.focusElement).toHaveBeenCalledWith({
        browserId: "test-browser",
        selector: "#test-input",
        timeout: undefined,
      });
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("should handle null parameters gracefully", async () => {
      // Arrange
      const request = {
        tool: "focus_element",
        params: {
          browserId: "test-browser",
          selector: null,
        },
        context: mockContext,
      };

      // Act
      await router.route(request);

      // Assert
      expect(mockPoolManager.focusElement).toHaveBeenCalledWith({
        browserId: "test-browser",
        selector: null,
        timeout: undefined,
      });
    });

    it("should handle undefined parameters", async () => {
      // Arrange
      const request = {
        tool: "hover_element",
        params: {
          browserId: "test-browser",
          selector: "#hover-target",
          position: undefined,
        },
        context: mockContext,
      };

      // Act
      await router.route(request);

      // Assert
      expect(mockPoolManager.hoverElement).toHaveBeenCalledWith({
        browserId: "test-browser",
        selector: "#hover-target",
        timeout: undefined,
        force: undefined,
        position: undefined,
      });
    });

    it("should handle empty object parameters", async () => {
      // Arrange
      const request = {
        tool: "select_option",
        params: {},
        context: mockContext,
      };

      // Act
      const result = await router.route(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("selector");
    });

    it("should handle invalid parameter types", async () => {
      // Arrange
      const request = {
        tool: "clear_element",
        params: {
          browserId: "test-browser",
          selector: "#text-input",
          timeout: "not-a-number",
          force: "not-a-boolean",
        },
        context: mockContext,
      };

      // Act
      await router.route(request);

      // Assert - Should pass through invalid types to pool manager for handling
      expect(mockPoolManager.clearElement).toHaveBeenCalledWith({
        browserId: "test-browser",
        selector: "#text-input",
        timeout: "not-a-number",
        force: "not-a-boolean",
      });
    });
  });
});
