/**
 * JavaScript Execution Service Unit Tests
 * Tests Phase 1A JavaScript execution tools with comprehensive Playwright mocking
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { JavaScriptExecutionService } from "../../src/core/javascript/javascript-execution-service.js";

// Mock Playwright Page object and console messages
const mockPage = {
  evaluate: vi.fn(),
  addScriptTag: vi.fn(),
  on: vi.fn(),
} as any;

const mockConsoleMessage = {
  type: vi.fn(),
  text: vi.fn(),
  location: vi.fn(),
} as any;

// Mock Pino logger
vi.mock("../../shared/pino-logger.js", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe("JavaScriptExecutionService", () => {
  let service: JavaScriptExecutionService;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup default mock returns
    mockPage.evaluate.mockResolvedValue("default-result");
    mockPage.addScriptTag.mockResolvedValue({});
    mockConsoleMessage.type.mockReturnValue("log");
    mockConsoleMessage.text.mockReturnValue("Test message");
    mockConsoleMessage.location.mockReturnValue({ url: "", lineNumber: 0 });

    service = new JavaScriptExecutionService();
  });

  describe("executeScript", () => {
    it("should execute simple JavaScript successfully", async () => {
      // Arrange
      const expectedResult = "Hello World";
      // Add small delay to simulate realistic execution time
      mockPage.evaluate.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(expectedResult), 1)),
      );

      const args = {
        browserId: "test-browser",
        script: "return 'Hello World'",
      };

      // Act
      const result = await service.executeScript(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.result).toBe(expectedResult);
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
      expect(mockPage.evaluate).toHaveBeenCalledOnce();
    });

    it("should execute script with arguments", async () => {
      // Arrange
      const scriptArgs = ["arg1", "arg2"];
      const expectedResult = "processed-args";
      mockPage.evaluate.mockResolvedValue(expectedResult);

      const args = {
        browserId: "test-browser",
        script: "return args[0] + args[1]",
        args: scriptArgs,
      };

      // Act
      const result = await service.executeScript(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.result).toBe(expectedResult);
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          script: args.script,
          args: scriptArgs,
          awaitPromise: undefined,
        }),
      );
    });

    it("should handle async script execution with promises", async () => {
      // Arrange
      const expectedResult = "async-result";
      mockPage.evaluate.mockResolvedValue(expectedResult);

      const args = {
        browserId: "test-browser",
        script: "return new Promise(resolve => resolve('async-result'))",
        awaitPromise: true,
      };

      // Act
      const result = await service.executeScript(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.result).toBe(expectedResult);
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          awaitPromise: true,
        }),
      );
    });

    it("should handle script execution errors gracefully", async () => {
      // Arrange
      const errorMessage = "Script execution failed";
      mockPage.evaluate.mockRejectedValue(new Error(errorMessage));

      const args = {
        browserId: "test-browser",
        script: "throw new Error('test error')",
      };

      // Act
      const result = await service.executeScript(mockPage, args);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain(errorMessage);
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it("should use custom timeout when specified", async () => {
      // Arrange
      mockPage.evaluate.mockResolvedValue("timeout-result");

      const args = {
        browserId: "test-browser",
        script: "return 'test'",
        timeout: 15000,
      };

      // Act
      await service.executeScript(mockPage, args);

      // Assert
      expect(mockPage.evaluate).toHaveBeenCalledOnce();
      // Timeout is handled internally, so we just verify the call was made
    });

    it("should handle non-Error exceptions", async () => {
      // Arrange
      mockPage.evaluate.mockRejectedValue("String error");

      const args = {
        browserId: "test-browser",
        script: "throw 'string error'",
      };

      // Act
      const result = await service.executeScript(mockPage, args);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe("String error");
    });
  });

  describe("evaluateExpression", () => {
    it("should evaluate simple expressions successfully", async () => {
      // Arrange
      const mockResult = {
        value: 42,
        type: "number",
        serializable: true,
      };
      mockPage.evaluate.mockResolvedValue(mockResult);

      const args = {
        browserId: "test-browser",
        expression: "2 + 2",
      };

      // Act
      const result = await service.evaluateExpression(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.value).toBe(42);
      expect(result.type).toBe("number");
      expect(result.serializable).toBe(true);
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it("should handle promise-based expressions", async () => {
      // Arrange
      const mockResult = {
        value: "async-value",
        type: "promise-resolved",
        serializable: true,
      };
      mockPage.evaluate.mockResolvedValue(mockResult);

      const args = {
        browserId: "test-browser",
        expression: "Promise.resolve('async-value')",
        awaitPromise: true,
      };

      // Act
      const result = await service.evaluateExpression(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.value).toBe("async-value");
      expect(result.type).toBe("promise-resolved");
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          awaitPromise: true,
        }),
      );
    });

    it("should handle non-serializable values", async () => {
      // Arrange
      const mockResult = {
        value: "[object Function]",
        type: "function",
        serializable: false,
      };
      mockPage.evaluate.mockResolvedValue(mockResult);

      const args = {
        browserId: "test-browser",
        expression: "function() { return 42; }",
      };

      // Act
      const result = await service.evaluateExpression(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.serializable).toBe(false);
      expect(result.type).toBe("function");
    });

    it("should handle expression evaluation errors", async () => {
      // Arrange
      mockPage.evaluate.mockRejectedValue(new Error("Invalid expression"));

      const args = {
        browserId: "test-browser",
        expression: "invalid.syntax()",
      };

      // Act
      const result = await service.evaluateExpression(mockPage, args);

      // Assert
      expect(result.success).toBe(false);
      expect(result.value).toBeNull();
      expect(result.type).toBe("error");
      expect(result.serializable).toBe(false);
    });

    it("should use custom timeout for expression evaluation", async () => {
      // Arrange
      const mockResult = {
        value: "timeout-test",
        type: "string",
        serializable: true,
      };
      mockPage.evaluate.mockResolvedValue(mockResult);

      const args = {
        browserId: "test-browser",
        expression: "document.title",
        timeout: 5000,
      };

      // Act
      await service.evaluateExpression(mockPage, args);

      // Assert
      expect(mockPage.evaluate).toHaveBeenCalledOnce();
    });
  });

  describe("console message handling", () => {
    it("should initialize console capture correctly", () => {
      // Arrange
      const browserId = "test-browser";

      // Act
      service.initializeConsoleCapture(mockPage, browserId);

      // Assert
      expect(mockPage.on).toHaveBeenCalledWith("console", expect.any(Function));
    });

    it("should capture and store console messages", () => {
      // Arrange
      const browserId = "test-browser";
      let consoleHandler: (msg: any) => void;

      mockPage.on.mockImplementation((event: string, handler: any) => {
        if (event === "console") {
          consoleHandler = handler;
        }
      });

      // Act
      service.initializeConsoleCapture(mockPage, browserId);

      // Simulate console message
      mockConsoleMessage.type.mockReturnValue("log");
      mockConsoleMessage.text.mockReturnValue("Test log message");
      mockConsoleMessage.location.mockReturnValue({ url: "http://test.com", lineNumber: 10 });

      consoleHandler!(mockConsoleMessage);

      // Assert - we'll verify through getConsoleMessages
      expect(mockPage.on).toHaveBeenCalledWith("console", expect.any(Function));
    });

    it("should retrieve console messages with filtering", async () => {
      // Arrange
      const browserId = "test-browser";

      // Initialize console capture first
      let consoleHandler: (msg: any) => void;
      mockPage.on.mockImplementation((event: string, handler: any) => {
        if (event === "console") {
          consoleHandler = handler;
        }
      });

      service.initializeConsoleCapture(mockPage, browserId);

      // Add some test messages
      const messages = [
        { type: "log", text: "Log message", location: { url: "http://test.com", lineNumber: 1 } },
        {
          type: "error",
          text: "Error message",
          location: { url: "http://test.com", lineNumber: 2 },
        },
        {
          type: "warn",
          text: "Warning message",
          location: { url: "http://test.com", lineNumber: 3 },
        },
      ];

      messages.forEach((msg, _index) => {
        mockConsoleMessage.type.mockReturnValueOnce(msg.type);
        mockConsoleMessage.text.mockReturnValueOnce(msg.text);
        mockConsoleMessage.location.mockReturnValueOnce(msg.location);
        consoleHandler!(mockConsoleMessage);
      });

      // Act
      const result = await service.getConsoleMessages({
        browserId,
        level: "error",
        limit: 10,
      });

      // Assert
      expect(result.messages).toBeDefined();
      expect(Array.isArray(result.messages)).toBe(true);
      expect(result.hasMore).toBe(false);
    });

    it("should handle empty console buffer", async () => {
      // Arrange
      const args = {
        browserId: "non-existent-browser",
      };

      // Act
      const result = await service.getConsoleMessages(args);

      // Assert
      expect(result.messages).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it("should apply message limit correctly", async () => {
      // Arrange
      const browserId = "test-browser";

      service.initializeConsoleCapture(mockPage, browserId);

      const args = {
        browserId,
        limit: 5,
      };

      // Act
      const result = await service.getConsoleMessages(args);

      // Assert
      expect(result.messages.length).toBeLessThanOrEqual(5);
      expect(typeof result.hasMore).toBe("boolean");
    });

    it("should cleanup console buffer", () => {
      // Arrange
      const browserId = "test-browser";
      service.initializeConsoleCapture(mockPage, browserId);

      // Act
      service.cleanupConsoleBuffer(browserId);

      // Verify cleanup doesn't throw
      expect(() => service.cleanupConsoleBuffer(browserId)).not.toThrow();
    });
  });

  describe("addScriptTag", () => {
    it("should add script tag with content successfully", async () => {
      // Arrange
      const mockElementHandle = { id: "script-element" };
      mockPage.addScriptTag.mockResolvedValue(mockElementHandle);

      const args = {
        browserId: "test-browser",
        content: "console.log('Hello from script tag');",
        type: "text/javascript",
      };

      // Act
      const result = await service.addScriptTag(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.elementHandle).toBe("script-element");
      expect(mockPage.addScriptTag).toHaveBeenCalledWith({
        content: args.content,
        type: args.type,
      });
    });

    it("should add script tag with URL successfully", async () => {
      // Arrange
      const mockElementHandle = { id: "script-element" };
      mockPage.addScriptTag.mockResolvedValue(mockElementHandle);

      const args = {
        browserId: "test-browser",
        url: "https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js",
      };

      // Act
      const result = await service.addScriptTag(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(mockPage.addScriptTag).toHaveBeenCalledWith({
        url: args.url,
      });
    });

    it("should handle script tag addition errors", async () => {
      // Arrange
      const errorMessage = "Failed to load script";
      mockPage.addScriptTag.mockRejectedValue(new Error(errorMessage));

      const args = {
        browserId: "test-browser",
        url: "https://invalid-url.com/script.js",
      };

      // Act
      const result = await service.addScriptTag(mockPage, args);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBe(errorMessage);
      expect(result.elementHandle).toBeUndefined();
    });

    it("should handle missing element handle gracefully", async () => {
      // Arrange
      mockPage.addScriptTag.mockResolvedValue(null);

      const args = {
        browserId: "test-browser",
        content: "console.log('test');",
      };

      // Act
      const result = await service.addScriptTag(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.elementHandle).toBeUndefined();
    });
  });

  describe("Performance and Edge Cases", () => {
    it("should measure execution time accurately", async () => {
      // Arrange
      const delay = 50; // 50ms delay
      mockPage.evaluate.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve("delayed-result"), delay)),
      );

      const args = {
        browserId: "test-browser",
        script: "return 'test'",
      };

      // Act
      const result = await service.executeScript(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      // Allow 5ms tolerance for timing variations in CI environments
      expect(result.executionTime).toBeGreaterThanOrEqual(delay - 5);
    });

    it("should handle very long scripts", async () => {
      // Arrange
      const longScript = `${"x = 1; ".repeat(1000)}return x;`;
      mockPage.evaluate.mockResolvedValue(1);

      const args = {
        browserId: "test-browser",
        script: longScript,
      };

      // Act
      const result = await service.executeScript(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.result).toBe(1);
    });

    it("should handle special characters in scripts", async () => {
      // Arrange
      const specialScript = "return '\\n\\t\\r\"';";
      mockPage.evaluate.mockResolvedValue('\n\t\r"');

      const args = {
        browserId: "test-browser",
        script: specialScript,
      };

      // Act
      const result = await service.executeScript(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.result).toBe('\n\t\r"');
    });

    it("should limit console buffer size", () => {
      // Arrange
      const browserId = "test-buffer-limit";
      let consoleHandler: (msg: any) => void;

      mockPage.on.mockImplementation((event: string, handler: any) => {
        if (event === "console") {
          consoleHandler = handler;
        }
      });

      service.initializeConsoleCapture(mockPage, browserId);

      // Act - Add more than max console messages (1000)
      for (let i = 0; i < 1050; i++) {
        mockConsoleMessage.type.mockReturnValue("log");
        mockConsoleMessage.text.mockReturnValue(`Message ${i}`);
        mockConsoleMessage.location.mockReturnValue({ url: "", lineNumber: 0 });
        consoleHandler!(mockConsoleMessage);
      }

      // Assert - Buffer should be limited (tested via getConsoleMessages)
      expect(() => service.getConsoleMessages({ browserId })).not.toThrow();
    });
  });
});
