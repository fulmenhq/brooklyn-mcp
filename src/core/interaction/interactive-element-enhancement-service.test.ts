/**
 * Interactive Element Enhancement Service Unit Tests
 * Tests Phase 1B interactive element tools with comprehensive Playwright mocking
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { InteractiveElementEnhancementService } from "./interactive-element-enhancement-service.js";

// Mock Playwright Page object comprehensively
const mockPage = {
  waitForSelector: vi.fn(),
  locator: vi.fn(),
  evaluate: vi.fn(),
} as any;

const mockLocator = {
  hover: vi.fn(),
  fill: vi.fn(),
  dragTo: vi.fn(),
  selectOption: vi.fn(),
  evaluate: vi.fn(),
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

describe("InteractiveElementEnhancementService", () => {
  let service: InteractiveElementEnhancementService;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup default mock returns
    mockPage.locator.mockReturnValue(mockLocator);
    mockPage.waitForSelector.mockResolvedValue({}); // Mock successful selector wait
    mockLocator.hover.mockResolvedValue(undefined);
    mockLocator.fill.mockResolvedValue(undefined);
    mockLocator.dragTo.mockResolvedValue(undefined);
    mockLocator.selectOption.mockResolvedValue(undefined);
    mockLocator.evaluate.mockResolvedValue("select");

    service = new InteractiveElementEnhancementService();
  });

  describe("focusElement", () => {
    it("should focus element successfully", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: "#test-input",
        timeout: 5000,
      };

      mockPage.evaluate.mockResolvedValue({
        success: true,
        focused: true,
        message: "Element focused successfully",
      });

      // Act
      const result = await service.focusElement(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.selector).toBe("#test-input");
      expect(result.focused).toBe(true);
      expect(result.message).toBe("Element focused successfully");
      expect(mockPage.waitForSelector).toHaveBeenCalledWith("#test-input", { timeout: 5000 });
    });

    it("should handle element not found during focus", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: "#missing-element",
      };

      mockPage.evaluate.mockResolvedValue({
        success: false,
        focused: false,
        message: "Element not found",
      });

      // Act
      const result = await service.focusElement(mockPage, args);

      // Assert
      expect(result.success).toBe(false);
      expect(result.focused).toBe(false);
      expect(result.message).toBe("Element not found");
    });

    it("should handle focus failure gracefully", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: "#disabled-input",
      };

      mockPage.evaluate.mockResolvedValue({
        success: false,
        focused: false,
        message: "Focus failed: Element is disabled",
      });

      // Act
      const result = await service.focusElement(mockPage, args);

      // Assert
      expect(result.success).toBe(false);
      expect(result.focused).toBe(false);
      expect(result.message).toBe("Focus failed: Element is disabled");
    });

    it("should use default timeout when not specified", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: "#test-button",
      };

      mockPage.evaluate.mockResolvedValue({
        success: true,
        focused: true,
        message: "Element focused successfully",
      });

      // Act
      await service.focusElement(mockPage, args);

      // Assert
      expect(mockPage.waitForSelector).toHaveBeenCalledWith("#test-button", { timeout: 30000 });
    });

    it("should throw error when page operation fails", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: "#test-input",
      };

      mockPage.waitForSelector.mockRejectedValue(new Error("Selector timeout"));

      // Act & Assert
      await expect(service.focusElement(mockPage, args)).rejects.toThrow(
        "Failed to focus element: Selector timeout",
      );
    });
  });

  describe("hoverElement", () => {
    it("should hover over element successfully", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: ".hover-target",
        timeout: 5000,
      };

      mockPage.evaluate.mockResolvedValue({
        hovered: true,
        message: "Hover completed successfully",
      });

      // Act
      const result = await service.hoverElement(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.selector).toBe(".hover-target");
      expect(result.hovered).toBe(true);
      expect(result.message).toBe("Hover completed successfully");
      expect(mockLocator.hover).toHaveBeenCalledWith({ force: false, timeout: 5000 });
    });

    it("should hover with custom position", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: ".hover-target",
        position: { x: 10, y: 20 },
        force: true,
      };

      mockPage.evaluate.mockResolvedValue({
        hovered: true,
        message: "Hover completed successfully",
      });

      // Act
      const result = await service.hoverElement(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(mockLocator.hover).toHaveBeenCalledWith({
        position: { x: 10, y: 20 },
        force: true,
        timeout: 30000,
      });
    });

    it("should handle hover timeout", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: ".slow-element",
      };

      mockPage.waitForSelector.mockRejectedValue(new Error("Timeout waiting for selector"));

      // Act & Assert
      await expect(service.hoverElement(mockPage, args)).rejects.toThrow(
        "Failed to hover element: Timeout waiting for selector",
      );
    });

    it("should handle element not found after hover", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: ".dynamic-element",
      };

      mockPage.evaluate.mockResolvedValue({
        hovered: false,
        message: "Element not found after hover",
      });

      // Act
      const result = await service.hoverElement(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.hovered).toBe(false);
      expect(result.message).toBe("Element not found after hover");
    });

    it("should use default parameters for hover", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: ".default-hover",
      };

      mockPage.evaluate.mockResolvedValue({
        hovered: true,
        message: "Hover completed successfully",
      });

      // Act
      await service.hoverElement(mockPage, args);

      // Assert
      expect(mockLocator.hover).toHaveBeenCalledWith({ force: false, timeout: 30000 });
    });
  });

  describe("selectOption", () => {
    it("should select option by value successfully", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: "#test-select",
        value: "option2",
      };

      mockLocator.evaluate
        .mockResolvedValueOnce("select") // Tag name check
        .mockResolvedValueOnce({
          // Selected option details
          success: true,
          selectedValue: "option2",
          selectedText: "Option Two",
          selectedIndex: 1,
          message: "Option selected successfully",
        });

      // Act
      const result = await service.selectOption(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.selector).toBe("#test-select");
      expect(result.selectedValue).toBe("option2");
      expect(result.selectedText).toBe("Option Two");
      expect(result.selectedIndex).toBe(1);
      expect(mockLocator.selectOption).toHaveBeenCalledWith({ value: "option2" });
    });

    it("should select option by label successfully", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: "#test-select",
        label: "Option Three",
      };

      mockLocator.evaluate.mockResolvedValueOnce("select").mockResolvedValueOnce({
        success: true,
        selectedValue: "option3",
        selectedText: "Option Three",
        selectedIndex: 2,
        message: "Option selected successfully",
      });

      // Act
      const result = await service.selectOption(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.selectedValue).toBe("option3");
      expect(result.selectedText).toBe("Option Three");
      expect(result.selectedIndex).toBe(2);
      expect(mockLocator.selectOption).toHaveBeenCalledWith({ label: "Option Three" });
    });

    it("should select option by index successfully", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: "#test-select",
        index: 0,
      };

      mockLocator.evaluate.mockResolvedValueOnce("select").mockResolvedValueOnce({
        success: true,
        selectedValue: "option1",
        selectedText: "Option One",
        selectedIndex: 0,
        message: "Option selected successfully",
      });

      // Act
      const result = await service.selectOption(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.selectedIndex).toBe(0);
      expect(mockLocator.selectOption).toHaveBeenCalledWith({ index: 0 });
    });

    it("should throw error when no selection criteria provided", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: "#test-select",
      };

      // Act & Assert
      await expect(service.selectOption(mockPage, args)).rejects.toThrow(
        "selectOption requires either value, label, or index parameter",
      );
    });

    it("should handle select element not found", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: "#missing-select",
        value: "test",
      };

      mockPage.waitForSelector.mockRejectedValue(new Error("Element not found"));

      // Act & Assert
      await expect(service.selectOption(mockPage, args)).rejects.toThrow(
        "Failed to select option: Element not found",
      );
    });

    it("should handle non-select element", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: "#not-select",
        value: "test",
      };

      mockLocator.evaluate.mockResolvedValueOnce("div"); // Not a select element

      // Act & Assert
      await expect(service.selectOption(mockPage, args)).rejects.toThrow(
        "Failed to select option: Element is not a select element",
      );
    });

    it("should handle selectOption failure", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: "#test-select",
        value: "non-existent",
      };

      mockLocator.evaluate.mockResolvedValueOnce("select");
      mockLocator.selectOption.mockRejectedValue(new Error("Option not found"));

      // Act & Assert
      await expect(service.selectOption(mockPage, args)).rejects.toThrow(
        "Failed to select option: Selection failed: Option not found",
      );
    });

    it("should use custom timeout", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: "#test-select",
        value: "option1",
        timeout: 10000,
      };

      mockLocator.evaluate.mockResolvedValueOnce("select").mockResolvedValueOnce({
        success: true,
        selectedValue: "option1",
        selectedText: "Option One",
        selectedIndex: 0,
        message: "Option selected successfully",
      });

      // Act
      await service.selectOption(mockPage, args);

      // Assert
      expect(mockPage.waitForSelector).toHaveBeenCalledWith("#test-select", { timeout: 10000 });
    });

    it("should handle case when no option is selected after selection attempt", async () => {
      // Arrange - Mock a select element with no valid selection
      const args = {
        browserId: "test-browser",
        selector: "#test-select",
        value: "test-value",
      };

      mockLocator.evaluate
        .mockResolvedValueOnce("select") // First call: confirm it's a select element
        .mockResolvedValueOnce({
          // Second call: simulate no option selected
          success: false,
          message: "No option selected",
        });

      // Act & Assert
      await expect(service.selectOption(mockPage, args)).rejects.toThrow(
        "Failed to select option: No option selected",
      );
      expect(mockLocator.evaluate).toHaveBeenCalledTimes(2);
    });
  });

  describe("clearElement", () => {
    it("should clear input element successfully", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: "#test-input",
      };

      // Mock getting previous value
      mockPage.evaluate
        .mockResolvedValueOnce("previous text") // First call gets previous value
        .mockResolvedValueOnce(""); // Second call verifies clearing

      // Act
      const result = await service.clearElement(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.selector).toBe("#test-input");
      expect(result.cleared).toBe(true);
      expect(result.previousValue).toBe("previous text");
      expect(result.message).toBe("Element cleared successfully");
      expect(mockLocator.fill).toHaveBeenCalledWith("", { timeout: 30000 });
    });

    it("should clear element with force option", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: "#readonly-input",
        force: true,
        timeout: 5000,
      };

      mockPage.evaluate.mockResolvedValueOnce("readonly content").mockResolvedValueOnce("");

      // Act
      const result = await service.clearElement(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.cleared).toBe(true);
      expect(mockLocator.fill).toHaveBeenCalledWith("", { force: true, timeout: 5000 });
    });

    it("should handle element that was not fully cleared", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: "#persistent-input",
      };

      mockPage.evaluate
        .mockResolvedValueOnce("original text")
        .mockResolvedValueOnce("remaining text");

      // Act
      const result = await service.clearElement(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.cleared).toBe(false);
      expect(result.message).toBe("Element may not be fully cleared");
    });

    it("should handle textarea clearing", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: "#test-textarea",
      };

      mockPage.evaluate.mockResolvedValueOnce("Multi-line\ncontent here").mockResolvedValueOnce("");

      // Act
      const result = await service.clearElement(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.cleared).toBe(true);
      expect(result.previousValue).toBe("Multi-line\ncontent here");
    });

    it("should handle element not found", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: "#missing-input",
      };

      mockPage.evaluate.mockResolvedValue(null);

      // Act
      const result = await service.clearElement(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.previousValue).toBeUndefined();
    });

    it("should handle clearing timeout", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: "#slow-input",
      };

      mockPage.waitForSelector.mockRejectedValue(new Error("Element timeout"));

      // Act & Assert
      await expect(service.clearElement(mockPage, args)).rejects.toThrow(
        "Failed to clear element: Element timeout",
      );
    });

    it("should handle empty element gracefully", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: "#empty-input",
      };

      mockPage.evaluate
        .mockResolvedValueOnce("") // Already empty
        .mockResolvedValueOnce(""); // Still empty after clear

      // Act
      const result = await service.clearElement(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.cleared).toBe(true);
      expect(result.previousValue).toBe(""); // Expected empty string, not undefined
    });
  });

  describe("dragAndDrop", () => {
    it("should perform drag and drop successfully", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        sourceSelector: "#draggable",
        targetSelector: "#dropzone",
      };

      mockPage.evaluate.mockResolvedValue({
        sourceExists: true,
        targetExists: true,
        completed: true,
      });

      // Act
      const result = await service.dragAndDrop(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.sourceSelector).toBe("#draggable");
      expect(result.targetSelector).toBe("#dropzone");
      expect(result.completed).toBe(true);
      expect(result.message).toBe("Drag and drop operation completed successfully");
      expect(mockLocator.dragTo).toHaveBeenCalledWith(mockLocator, {
        force: false,
        timeout: 30000,
      });
    });

    it("should drag and drop with custom positions", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        sourceSelector: "#draggable",
        targetSelector: "#dropzone",
        sourcePosition: { x: 5, y: 5 },
        targetPosition: { x: 50, y: 50 },
        force: true,
        timeout: 10000,
      };

      mockPage.evaluate.mockResolvedValue({
        sourceExists: true,
        targetExists: true,
        completed: true,
      });

      // Act
      const result = await service.dragAndDrop(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(mockLocator.dragTo).toHaveBeenCalledWith(mockLocator, {
        force: true,
        timeout: 10000,
        sourcePosition: { x: 5, y: 5 },
        targetPosition: { x: 50, y: 50 },
      });
    });

    it("should handle source element not found", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        sourceSelector: "#missing-source",
        targetSelector: "#dropzone",
      };

      mockPage.waitForSelector.mockRejectedValueOnce(new Error("Source element not found"));

      // Act & Assert
      await expect(service.dragAndDrop(mockPage, args)).rejects.toThrow(
        "Failed to drag and drop: Source element not found",
      );
    });

    it("should handle target element not found", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        sourceSelector: "#draggable",
        targetSelector: "#missing-target",
      };

      mockPage.waitForSelector
        .mockResolvedValueOnce({}) // Source found
        .mockRejectedValueOnce(new Error("Target element not found")); // Target not found

      // Act & Assert
      await expect(service.dragAndDrop(mockPage, args)).rejects.toThrow(
        "Failed to drag and drop: Target element not found",
      );
    });

    it("should handle drag operation failure", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        sourceSelector: "#draggable",
        targetSelector: "#dropzone",
      };

      mockLocator.dragTo.mockRejectedValue(new Error("Drag operation failed"));

      // Act & Assert
      await expect(service.dragAndDrop(mockPage, args)).rejects.toThrow(
        "Failed to drag and drop: Drag operation failed",
      );
    });

    it("should verify drag completion with source position only", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        sourceSelector: "#draggable",
        targetSelector: "#dropzone",
        sourcePosition: { x: 10, y: 10 },
      };

      mockPage.evaluate.mockResolvedValue({
        sourceExists: true,
        targetExists: true,
        completed: true,
      });

      // Act
      const result = await service.dragAndDrop(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(mockLocator.dragTo).toHaveBeenCalledWith(mockLocator, {
        force: false,
        timeout: 30000,
        sourcePosition: { x: 10, y: 10 },
      });
    });

    it("should verify drag completion with target position only", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        sourceSelector: "#draggable",
        targetSelector: "#dropzone",
        targetPosition: { x: 100, y: 100 },
      };

      mockPage.evaluate.mockResolvedValue({
        sourceExists: true,
        targetExists: true,
        completed: true,
      });

      // Act
      const result = await service.dragAndDrop(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(mockLocator.dragTo).toHaveBeenCalledWith(mockLocator, {
        force: false,
        timeout: 30000,
        targetPosition: { x: 100, y: 100 },
      });
    });

    it("should handle concurrent element checks", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        sourceSelector: "#draggable",
        targetSelector: "#dropzone",
      };

      // Verify Promise.all is called for concurrent waiting
      const waitForSelectorSpy = vi.spyOn(Promise, "all");

      mockPage.evaluate.mockResolvedValue({
        sourceExists: true,
        targetExists: true,
        completed: true,
      });

      // Act
      await service.dragAndDrop(mockPage, args);

      // Assert
      expect(waitForSelectorSpy).toHaveBeenCalled();
    });

    it("should verify drag and drop completion with proper element verification", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        sourceSelector: ".draggable-item",
        targetSelector: ".drop-zone",
      };

      // Mock the verification logic for drag and drop completion
      mockPage.evaluate.mockResolvedValue({
        sourceExists: true,
        targetExists: true,
        completed: true,
      });

      // Act
      const result = await service.dragAndDrop(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.completed).toBe(true);
      expect(result.sourceSelector).toBe(".draggable-item");
      expect(result.targetSelector).toBe(".drop-zone");
      expect(mockPage.evaluate).toHaveBeenCalledWith(expect.any(Function), {
        srcSel: ".draggable-item",
        tgtSel: ".drop-zone",
      });
    });
  });

  describe("Error Handling", () => {
    it("should handle page evaluation errors in focusElement", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: "#test-input",
      };

      mockPage.evaluate.mockRejectedValue(new Error("Page evaluation failed"));

      // Act & Assert
      await expect(service.focusElement(mockPage, args)).rejects.toThrow(
        "Failed to focus element: Page evaluation failed",
      );
    });

    it("should handle locator errors in hoverElement", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: ".hover-target",
      };

      mockLocator.hover.mockRejectedValue(new Error("Hover operation failed"));

      // Act & Assert
      await expect(service.hoverElement(mockPage, args)).rejects.toThrow(
        "Failed to hover element: Hover operation failed",
      );
    });

    it("should handle fill errors in clearElement", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: "#test-input",
      };

      mockPage.evaluate.mockResolvedValueOnce("previous text");
      mockLocator.fill.mockRejectedValue(new Error("Fill operation failed"));

      // Act & Assert
      await expect(service.clearElement(mockPage, args)).rejects.toThrow(
        "Failed to clear element: Fill operation failed",
      );
    });

    it("should handle string errors gracefully", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: "#test-input",
      };

      mockPage.waitForSelector.mockRejectedValue("String error message");

      // Act & Assert
      await expect(service.focusElement(mockPage, args)).rejects.toThrow(
        "Failed to focus element: String error message",
      );
    });
  });

  describe("Performance and Edge Cases", () => {
    it("should handle rapid successive focus operations", async () => {
      // Arrange
      const args1 = { browserId: "test-browser", selector: "#input1" };
      const args2 = { browserId: "test-browser", selector: "#input2" };

      mockPage.evaluate.mockResolvedValue({
        success: true,
        focused: true,
        message: "Element focused successfully",
      });

      // Act
      const [result1, result2] = await Promise.all([
        service.focusElement(mockPage, args1),
        service.focusElement(mockPage, args2),
      ]);

      // Assert
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(mockPage.waitForSelector).toHaveBeenCalledTimes(2);
    });

    it("should handle complex selectors correctly", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: 'div[data-testid="complex-selector"] > input:nth-child(2)',
      };

      mockPage.evaluate.mockResolvedValue({
        success: true,
        focused: true,
        message: "Element focused successfully",
      });

      // Act
      const result = await service.focusElement(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        'div[data-testid="complex-selector"] > input:nth-child(2)',
        { timeout: 30000 },
      );
    });

    it("should handle extremely long timeouts", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: "#slow-element",
        timeout: 120000, // 2 minutes
      };

      mockPage.evaluate.mockResolvedValue({
        hovered: true,
        message: "Hover completed successfully",
      });

      // Act
      await service.hoverElement(mockPage, args);

      // Assert
      expect(mockPage.waitForSelector).toHaveBeenCalledWith("#slow-element", { timeout: 120000 });
    });

    it("should handle zero timeout gracefully", async () => {
      // Arrange
      const args = {
        browserId: "test-browser",
        selector: "#immediate-element",
        timeout: 0,
      };

      mockLocator.evaluate.mockResolvedValueOnce("select").mockResolvedValueOnce({
        success: true,
        selectedValue: "test",
        selectedText: "Test",
        selectedIndex: 0,
        message: "Option selected successfully",
      });

      // Act
      const result = await service.selectOption(mockPage, { ...args, value: "test" });

      // Assert
      expect(result.success).toBe(true);
      expect(mockPage.waitForSelector).toHaveBeenCalledWith("#immediate-element", { timeout: 0 });
    });
  });
});
