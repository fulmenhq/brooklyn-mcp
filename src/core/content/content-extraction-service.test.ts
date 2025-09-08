/**
 * Content Extraction Service Unit Tests
 * Tests Phase 1C content extraction tools with comprehensive Playwright mocking
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContentExtractionService } from "./content-extraction-service.js";

// Mock Playwright Page object comprehensively
const mockPage = {
  waitForSelector: vi.fn(),
  locator: vi.fn(),
  content: vi.fn(),
  viewportSize: vi.fn(),
} as any;

const mockElement = {
  innerHTML: vi.fn(),
  evaluate: vi.fn(),
  getAttribute: vi.fn(),
  boundingBox: vi.fn(),
} as any;

const mockLocator = {
  first: vi.fn(() => mockElement),
} as any;

describe("ContentExtractionService", () => {
  let service: ContentExtractionService;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup default mock returns
    mockPage.locator.mockReturnValue(mockLocator);
    mockPage.viewportSize.mockReturnValue({ width: 1920, height: 1080 });
    mockPage.waitForSelector.mockResolvedValue({}); // Mock successful selector wait

    service = new ContentExtractionService();
  });

  describe("getHtml", () => {
    it("should extract full page HTML successfully", async () => {
      // Arrange
      const mockHtml = "<!DOCTYPE html><html><body>Test content</body></html>";
      mockPage.content.mockResolvedValue(mockHtml);

      const args = {
        browserId: "test-browser",
        prettify: false,
      };

      // Act
      const result = await service.getHtml(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.html).toBe(mockHtml);
      expect(result.source).toBe("full-page");
      expect(result.length).toBe(mockHtml.length);
      expect(mockPage.content).toHaveBeenCalledOnce();
    });

    it("should extract specific element HTML with selector", async () => {
      // Arrange
      const mockInnerHTML = "<div>Element content</div>";
      const mockOuterHTML = "<div class='test'>Element content</div>";
      mockElement.innerHTML.mockResolvedValue(mockInnerHTML);
      mockElement.evaluate.mockResolvedValue(mockOuterHTML);

      const args = {
        browserId: "test-browser",
        selector: ".test-element",
        timeout: 5000,
      };

      // Act
      const result = await service.getHtml(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.html).toBe(mockOuterHTML);
      expect(result.source).toBe(".test-element");
      expect(mockPage.waitForSelector).toHaveBeenCalledWith(".test-element", { timeout: 5000 });
      expect(mockPage.locator).toHaveBeenCalledWith(".test-element");
    });

    it("should include computed styles when requested", async () => {
      // Arrange
      const mockOuterHTML = "<div class='test'>Element content</div>";
      const mockStyles = { display: "flex", color: "red" };

      mockElement.evaluate
        .mockResolvedValueOnce(mockStyles) // First call for styles
        .mockResolvedValueOnce(mockOuterHTML); // Second call for outerHTML

      const args = {
        browserId: "test-browser",
        selector: ".test-element",
        includeStyles: true,
      };

      // Act
      const result = await service.getHtml(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.computedStyles).toEqual(mockStyles);
      expect(mockElement.evaluate).toHaveBeenCalledTimes(2);
    });

    it("should prettify HTML when requested", async () => {
      // Arrange
      const uglyHtml = "<div><span>Test</span><p>Content</p></div>";
      mockPage.content.mockResolvedValue(uglyHtml);

      const args = {
        browserId: "test-browser",
        prettify: true,
      };

      // Act
      const result = await service.getHtml(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.html).toContain("\n"); // Should have newlines
      expect(result.html).toMatch(/\s+<span>/); // Should have indentation
    });

    it("should handle selector timeout errors gracefully", async () => {
      // Arrange
      mockPage.waitForSelector.mockRejectedValue(new Error("Timeout waiting for selector"));

      const args = {
        browserId: "test-browser",
        selector: ".non-existent",
        timeout: 1000,
      };

      // Act & Assert
      await expect(service.getHtml(mockPage, args)).rejects.toThrow(
        "Failed to extract HTML: Timeout waiting for selector",
      );
    });

    it("should handle unknown errors gracefully", async () => {
      // Arrange
      mockPage.content.mockRejectedValue("Unknown error string");

      const args = {
        browserId: "test-browser",
      };

      // Act & Assert
      await expect(service.getHtml(mockPage, args)).rejects.toThrow(
        "Failed to extract HTML: Unknown error",
      );
    });
  });

  describe("getAttribute", () => {
    it("should get specific attribute value", async () => {
      // Arrange
      const attributeValue = "submit";
      mockElement.getAttribute.mockResolvedValue(attributeValue);

      const args = {
        browserId: "test-browser",
        selector: "#submit-button",
        attribute: "type",
      };

      // Act
      const result = await service.getAttribute(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.selector).toBe("#submit-button");
      expect(result.attribute).toBe("type");
      expect(result.value).toBe(attributeValue);
      expect(result.exists).toBe(true);
      expect(mockElement.getAttribute).toHaveBeenCalledWith("type");
    });

    it("should detect non-existent attribute", async () => {
      // Arrange
      mockElement.getAttribute.mockResolvedValue(null);

      const args = {
        browserId: "test-browser",
        selector: "#test-element",
        attribute: "disabled",
      };

      // Act
      const result = await service.getAttribute(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.value).toBeNull();
      expect(result.exists).toBe(false);
    });

    it("should get all attributes when no specific attribute requested", async () => {
      // Arrange
      const mockAttributes = {
        id: "test-element",
        class: "btn btn-primary",
        "data-testid": "submit-button",
      };

      mockElement.evaluate.mockResolvedValue(mockAttributes);

      const args = {
        browserId: "test-browser",
        selector: "#test-element",
      };

      // Act
      const result = await service.getAttribute(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.attributes).toEqual(mockAttributes);
      expect(result.attribute).toBeUndefined();
    });

    it("should handle element not found error", async () => {
      // Arrange
      mockPage.waitForSelector.mockRejectedValue(new Error("Element not found"));

      const args = {
        browserId: "test-browser",
        selector: ".missing-element",
        attribute: "id",
      };

      // Act & Assert
      await expect(service.getAttribute(mockPage, args)).rejects.toThrow(
        "Failed to get attribute: Element not found",
      );
    });
  });

  describe("getBoundingBox", () => {
    it("should get element bounding box with viewport information", async () => {
      // Arrange
      const mockBox = { x: 100, y: 200, width: 300, height: 150 };
      mockElement.boundingBox.mockResolvedValue(mockBox);

      const args = {
        browserId: "test-browser",
        selector: ".test-element",
        includeViewport: true,
      };

      // Act
      const result = await service.getBoundingBox(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.boundingBox).toEqual(mockBox);
      expect(result.viewport).toEqual({
        x: 100,
        y: 200,
        visible: true,
      });
      expect(result.center).toEqual({
        x: 250, // 100 + 300/2
        y: 275, // 200 + 150/2
      });
    });

    it("should detect element outside viewport", async () => {
      // Arrange
      const mockBox = { x: 2000, y: 1500, width: 100, height: 50 }; // Outside 1920x1080 viewport
      mockElement.boundingBox.mockResolvedValue(mockBox);

      const args = {
        browserId: "test-browser",
        selector: ".off-screen-element",
        includeViewport: true,
      };

      // Act
      const result = await service.getBoundingBox(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.viewport?.visible).toBe(false);
    });

    it("should work without viewport information", async () => {
      // Arrange
      const mockBox = { x: 50, y: 75, width: 200, height: 100 };
      mockElement.boundingBox.mockResolvedValue(mockBox);

      const args = {
        browserId: "test-browser",
        selector: ".test-element",
        includeViewport: false,
      };

      // Act
      const result = await service.getBoundingBox(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.viewport).toBeUndefined();
      expect(result.center).toBeDefined();
    });

    it("should handle hidden elements with no bounding box", async () => {
      // Arrange
      // Override the default waitForSelector mock for this test
      mockPage.waitForSelector.mockResolvedValueOnce({}); // Element found
      mockElement.boundingBox.mockResolvedValue(null);

      const args = {
        browserId: "test-browser",
        selector: ".hidden-element",
      };

      // Act & Assert
      await expect(service.getBoundingBox(mockPage, args)).rejects.toThrow(
        "Element has no bounding box (may be hidden)",
      );
    });
  });

  describe("isVisible", () => {
    it("should detect visible element", async () => {
      // Arrange
      mockElement.evaluate.mockResolvedValue([true, true, 1, "block"]);

      const args = {
        browserId: "test-browser",
        selector: ".visible-element",
      };

      // Act
      const result = await service.isVisible(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.visible).toBe(true);
      expect(result.inViewport).toBe(true);
      expect(result.opacity).toBe(1);
      expect(result.display).toBe("block");
    });

    it("should detect hidden element", async () => {
      // Arrange
      mockElement.evaluate.mockResolvedValue([false, false, 0, "none"]);

      const args = {
        browserId: "test-browser",
        selector: ".hidden-element",
      };

      // Act
      const result = await service.isVisible(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.visible).toBe(false);
      expect(result.inViewport).toBe(false);
      expect(result.opacity).toBe(0);
      expect(result.display).toBe("none");
    });

    it("should handle element evaluation errors", async () => {
      // Arrange
      // Override the default waitForSelector mock for this test
      mockPage.waitForSelector.mockResolvedValueOnce({}); // Element found
      mockElement.evaluate.mockRejectedValue(new Error("Element evaluation failed"));

      const args = {
        browserId: "test-browser",
        selector: ".problematic-element",
      };

      // Act & Assert
      await expect(service.isVisible(mockPage, args)).rejects.toThrow(
        "Failed to check visibility: Element evaluation failed",
      );
    });
  });

  describe("isEnabled", () => {
    it("should detect enabled interactive element", async () => {
      // Arrange
      mockElement.evaluate.mockResolvedValue([false, false, true]); // [disabled, readonly, interactive]

      const args = {
        browserId: "test-browser",
        selector: "#submit-button",
      };

      // Act
      const result = await service.isEnabled(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.enabled).toBe(true);
      expect(result.disabled).toBe(false);
      expect(result.readonly).toBe(false);
      expect(result.interactive).toBe(true);
    });

    it("should detect disabled element", async () => {
      // Arrange
      mockElement.evaluate.mockResolvedValue([true, false, false]); // [disabled, readonly, interactive]

      const args = {
        browserId: "test-browser",
        selector: "#disabled-input",
      };

      // Act
      const result = await service.isEnabled(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.enabled).toBe(false);
      expect(result.disabled).toBe(true);
      expect(result.readonly).toBe(false);
      expect(result.interactive).toBe(false);
    });

    it("should detect readonly element", async () => {
      // Arrange
      mockElement.evaluate.mockResolvedValue([false, true, false]); // [disabled, readonly, interactive]

      const args = {
        browserId: "test-browser",
        selector: "#readonly-field",
      };

      // Act
      const result = await service.isEnabled(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.enabled).toBe(true); // not disabled
      expect(result.disabled).toBe(false);
      expect(result.readonly).toBe(true);
      expect(result.interactive).toBe(false); // readonly means not interactive
    });

    it("should handle timeout errors gracefully", async () => {
      // Arrange
      mockPage.waitForSelector.mockRejectedValue(new Error("Timeout"));

      const args = {
        browserId: "test-browser",
        selector: ".slow-loading-element",
        timeout: 1000,
      };

      // Act & Assert
      await expect(service.isEnabled(mockPage, args)).rejects.toThrow(
        "Failed to check enabled state: Timeout",
      );
    });
  });

  describe("Performance and Edge Cases", () => {
    it("should complete operations within reasonable time", async () => {
      // Arrange
      mockPage.content.mockResolvedValue("<html><body>Fast response</body></html>");

      const args = {
        browserId: "test-browser",
      };

      // Act
      const startTime = Date.now();
      const result = await service.getHtml(mockPage, args);
      const executionTime = Date.now() - startTime;

      // Assert
      expect(result.success).toBe(true);
      expect(executionTime).toBeLessThan(100); // Should be very fast with mocks
    });

    it("should handle empty HTML content", async () => {
      // Arrange
      mockPage.content.mockResolvedValue("");

      const args = {
        browserId: "test-browser",
        prettify: true,
      };

      // Act
      const result = await service.getHtml(mockPage, args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.html).toBe("");
      expect(result.length).toBe(0);
    });

    it("should handle malformed selectors gracefully", async () => {
      // Arrange
      mockPage.waitForSelector.mockRejectedValue(new Error("Invalid selector syntax"));

      const args = {
        browserId: "test-browser",
        selector: ">>>invalid<<<selector",
      };

      // Act & Assert
      await expect(service.getAttribute(mockPage, args)).rejects.toThrow(
        "Failed to get attribute: Invalid selector syntax",
      );
    });

    it("should use default timeout values", async () => {
      // Arrange
      // Override the default waitForSelector mock for this test
      mockPage.waitForSelector.mockResolvedValueOnce({}); // Element found
      mockElement.getAttribute.mockResolvedValue("test-value");

      const args = {
        browserId: "test-browser",
        selector: "#test-element",
        attribute: "value",
        // No timeout specified - should use default 5000
      };

      // Act
      await service.getAttribute(mockPage, args);

      // Assert
      expect(mockPage.waitForSelector).toHaveBeenCalledWith("#test-element", { timeout: 5000 });
    });
  });
});
