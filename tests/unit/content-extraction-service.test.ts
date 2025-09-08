/**
 * Content Extraction Service Unit Tests
 *
 * Tests business logic for DOM content extraction, attribute inspection,
 * and element state checking without requiring external network access.
 */

import type { Page } from "playwright";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ContentExtractionService,
  type DescribeHtmlArgs,
  type GetAttributeArgs,
  type GetBoundingBoxArgs,
  type GetHtmlArgs,
  type IsEnabledArgs,
  type IsVisibleArgs,
} from "../../src/core/content/content-extraction-service.js";

// Mock the tokenizer service to prevent dependency issues
vi.mock("../../src/core/tokenizer-service.js", () => ({
  tokenizerService: {
    getRecommendedLimit: vi.fn(() => 10000),
    countTokens: vi.fn(() => ({
      tokens: 100,
      method: "estimate",
      byteCount: 1000,
      characterCount: 500,
    })),
  },
}));

describe("ContentExtractionService", () => {
  let service: ContentExtractionService;
  let mockPage: Page;

  beforeEach(async () => {
    service = new ContentExtractionService();

    // Reset tokenizer service mock to default values
    const mockTokenizerService = await import("../../src/core/tokenizer-service.js");
    vi.mocked(mockTokenizerService.tokenizerService.getRecommendedLimit).mockReturnValue(10000);
    vi.mocked(mockTokenizerService.tokenizerService.countTokens).mockReturnValue({
      tokens: 100,
      method: "estimated",
      model: "default",
      byteCount: 1000,
      characterCount: 500,
    });

    // Create comprehensive mock Page object
    mockPage = {
      waitForSelector: vi.fn(),
      locator: vi.fn(() => ({
        first: vi.fn(() => ({
          innerHTML: vi.fn(),
          getAttribute: vi.fn(),
          evaluate: vi.fn(),
          boundingBox: vi.fn(),
        })),
      })),
      content: vi.fn(),
      viewportSize: vi.fn(),
      evaluate: vi.fn(),
    } as any;
  });

  describe("getHtml", () => {
    it("should extract full page HTML successfully", async () => {
      const mockHtml = "<html><body><h1>Test Page</h1></body></html>";
      (mockPage.content as any).mockResolvedValue(mockHtml);

      const args: GetHtmlArgs = {
        browserId: "test-browser",
        prettify: false,
      };

      const result = await service.getHtml(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.html).toBe(mockHtml);
      expect(result.source).toBe("full-page");
      expect(result.length).toBe(mockHtml.length);
      expect(mockPage.content).toHaveBeenCalledOnce();
    });

    it("should extract specific element HTML with selector", async () => {
      const mockInnerHtml = "<span>Test Content</span>";
      const mockOuterHtml = "<div><span>Test Content</span></div>";

      (mockPage.waitForSelector as any).mockResolvedValue(undefined);
      (mockPage.locator as any).mockReturnValue({
        first: () => ({
          innerHTML: vi.fn().mockResolvedValue(mockInnerHtml),
          evaluate: vi.fn().mockResolvedValue(mockOuterHtml),
        }),
      });

      const args: GetHtmlArgs = {
        browserId: "test-browser",
        selector: "div",
        prettify: false,
      };

      const result = await service.getHtml(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.html).toBe(mockOuterHtml);
      expect(result.source).toBe("div");
      expect(mockPage.waitForSelector).toHaveBeenCalledWith("div", { timeout: 5000 });
    });

    it("should include computed styles when requested", async () => {
      const mockHtml = "<div>Test</div>";
      const mockStyles = { color: "red", "font-size": "14px" };

      (mockPage.waitForSelector as any).mockResolvedValue(undefined);
      (mockPage.locator as any).mockReturnValue({
        first: () => ({
          innerHTML: vi.fn().mockResolvedValue("<div>Test</div>"),
          evaluate: vi
            .fn()
            .mockResolvedValueOnce(mockStyles) // for computed styles
            .mockResolvedValueOnce(mockHtml), // for outerHTML
        }),
      });

      const args: GetHtmlArgs = {
        browserId: "test-browser",
        selector: "div",
        includeStyles: true,
        prettify: false,
      };

      const result = await service.getHtml(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.computedStyles).toEqual(mockStyles);
    });

    it("should prettify HTML when requested", async () => {
      const mockHtml = "<html><body><h1>Test</h1></body></html>";
      (mockPage.content as any).mockResolvedValue(mockHtml);

      const args: GetHtmlArgs = {
        browserId: "test-browser",
        prettify: true,
      };

      const result = await service.getHtml(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.html).toContain("\n"); // Should contain newlines from prettification
    });

    it("should throw error when token limit exceeded", async () => {
      // Create a large HTML string that would exceed token limits
      const largeHtml = "x".repeat(10000000); // 10MB of content
      (mockPage.content as any).mockResolvedValue(largeHtml);

      // Mock tokenizer to return high token count
      const mockTokenizerService = await import("../../src/core/tokenizer-service.js");
      vi.mocked(mockTokenizerService.tokenizerService.countTokens).mockReturnValue({
        tokens: 50000, // High token count to exceed limit
        method: "estimated",
        model: "default",
        byteCount: 10000000,
        characterCount: 10000000,
      });

      const args: GetHtmlArgs = {
        browserId: "test-browser",
        maxTokens: 1000, // Very low limit to trigger error
      };

      await expect(service.getHtml(mockPage, args)).rejects.toThrow();
    });

    it("should handle timeout parameter correctly", async () => {
      const selector = "div";
      const timeout = 10000;

      (mockPage.waitForSelector as any).mockResolvedValue(undefined);
      (mockPage.locator as any).mockReturnValue({
        first: () => ({
          innerHTML: vi.fn().mockResolvedValue("test"),
          evaluate: vi.fn().mockResolvedValue("<div>test</div>"),
        }),
      });

      const args: GetHtmlArgs = {
        browserId: "test-browser",
        selector,
        timeout,
      };

      await service.getHtml(mockPage, args);

      expect(mockPage.waitForSelector).toHaveBeenCalledWith(selector, { timeout });
    });
  });

  describe("getAttribute", () => {
    it("should get specific attribute value", async () => {
      const attributeValue = "test-value";

      (mockPage.waitForSelector as any).mockResolvedValue(undefined);
      (mockPage.locator as any).mockReturnValue({
        first: () => ({
          getAttribute: vi.fn().mockResolvedValue(attributeValue),
        }),
      });

      const args: GetAttributeArgs = {
        browserId: "test-browser",
        selector: "div",
        attribute: "data-test",
      };

      const result = await service.getAttribute(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.selector).toBe("div");
      expect(result.attribute).toBe("data-test");
      expect(result.value).toBe(attributeValue);
      expect(result.exists).toBe(true);
    });

    it("should handle non-existent attribute", async () => {
      (mockPage.waitForSelector as any).mockResolvedValue(undefined);
      (mockPage.locator as any).mockReturnValue({
        first: () => ({
          getAttribute: vi.fn().mockResolvedValue(null),
        }),
      });

      const args: GetAttributeArgs = {
        browserId: "test-browser",
        selector: "div",
        attribute: "non-existent",
      };

      const result = await service.getAttribute(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.value).toBeNull();
      expect(result.exists).toBe(false);
    });

    it("should get all attributes when no specific attribute requested", async () => {
      const allAttributes = { id: "test-id", class: "test-class", "data-test": "value" };

      (mockPage.waitForSelector as any).mockResolvedValue(undefined);
      (mockPage.locator as any).mockReturnValue({
        first: () => ({
          evaluate: vi.fn().mockResolvedValue(allAttributes),
        }),
      });

      const args: GetAttributeArgs = {
        browserId: "test-browser",
        selector: "div",
      };

      const result = await service.getAttribute(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.attributes).toEqual(allAttributes);
    });

    it("should handle timeout parameter correctly", async () => {
      const timeout = 8000;

      (mockPage.waitForSelector as any).mockResolvedValue(undefined);
      (mockPage.locator as any).mockReturnValue({
        first: () => ({
          getAttribute: vi.fn().mockResolvedValue("value"),
        }),
      });

      const args: GetAttributeArgs = {
        browserId: "test-browser",
        selector: "button",
        attribute: "type",
        timeout,
      };

      await service.getAttribute(mockPage, args);

      expect(mockPage.waitForSelector).toHaveBeenCalledWith("button", { timeout });
    });
  });

  describe("getBoundingBox", () => {
    it("should get element bounding box successfully", async () => {
      const mockBoundingBox = { x: 100, y: 200, width: 300, height: 150 };

      (mockPage.waitForSelector as any).mockResolvedValue(undefined);
      (mockPage.locator as any).mockReturnValue({
        first: () => ({
          boundingBox: vi.fn().mockResolvedValue(mockBoundingBox),
        }),
      });
      (mockPage.viewportSize as any).mockReturnValue({ width: 1024, height: 768 });

      const args: GetBoundingBoxArgs = {
        browserId: "test-browser",
        selector: "div",
      };

      const result = await service.getBoundingBox(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.boundingBox).toEqual(mockBoundingBox);
      expect(result.center).toEqual({ x: 250, y: 275 }); // Center calculation
      expect(result.viewport?.visible).toBe(true); // Within viewport
    });

    it("should handle element with no bounding box", async () => {
      (mockPage.waitForSelector as any).mockResolvedValue(undefined);
      (mockPage.locator as any).mockReturnValue({
        first: () => ({
          boundingBox: vi.fn().mockResolvedValue(null),
        }),
      });

      const args: GetBoundingBoxArgs = {
        browserId: "test-browser",
        selector: "div",
      };

      await expect(service.getBoundingBox(mockPage, args)).rejects.toThrow(
        "Element has no bounding box (may be hidden)",
      );
    });

    it("should exclude viewport info when requested", async () => {
      const mockBoundingBox = { x: 100, y: 200, width: 300, height: 150 };

      (mockPage.waitForSelector as any).mockResolvedValue(undefined);
      (mockPage.locator as any).mockReturnValue({
        first: () => ({
          boundingBox: vi.fn().mockResolvedValue(mockBoundingBox),
        }),
      });

      const args: GetBoundingBoxArgs = {
        browserId: "test-browser",
        selector: "div",
        includeViewport: false,
      };

      const result = await service.getBoundingBox(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.viewport).toBeUndefined();
      expect(result.center).toBeDefined(); // Center should still be calculated
    });

    it("should detect element outside viewport", async () => {
      const mockBoundingBox = { x: 2000, y: 2000, width: 100, height: 100 }; // Outside viewport

      (mockPage.waitForSelector as any).mockResolvedValue(undefined);
      (mockPage.locator as any).mockReturnValue({
        first: () => ({
          boundingBox: vi.fn().mockResolvedValue(mockBoundingBox),
        }),
      });
      (mockPage.viewportSize as any).mockReturnValue({ width: 1024, height: 768 });

      const args: GetBoundingBoxArgs = {
        browserId: "test-browser",
        selector: "div",
      };

      const result = await service.getBoundingBox(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.viewport?.visible).toBe(false);
    });
  });

  describe("isVisible", () => {
    it("should detect visible element correctly", async () => {
      (mockPage.waitForSelector as any).mockResolvedValue(undefined);
      (mockPage.locator as any).mockReturnValue({
        first: () => ({
          evaluate: vi.fn().mockResolvedValue([true, true, 1.0, "block"]),
        }),
      });

      const args: IsVisibleArgs = {
        browserId: "test-browser",
        selector: "div",
      };

      const result = await service.isVisible(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.visible).toBe(true);
      expect(result.inViewport).toBe(true);
      expect(result.opacity).toBe(1.0);
      expect(result.display).toBe("block");
    });

    it("should detect hidden element correctly", async () => {
      (mockPage.waitForSelector as any).mockResolvedValue(undefined);
      (mockPage.locator as any).mockReturnValue({
        first: () => ({
          evaluate: vi.fn().mockResolvedValue([false, false, 0, "none"]),
        }),
      });

      const args: IsVisibleArgs = {
        browserId: "test-browser",
        selector: "div",
      };

      const result = await service.isVisible(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.visible).toBe(false);
      expect(result.inViewport).toBe(false);
      expect(result.opacity).toBe(0);
      expect(result.display).toBe("none");
    });

    it("should handle element outside viewport", async () => {
      (mockPage.waitForSelector as any).mockResolvedValue(undefined);
      (mockPage.locator as any).mockReturnValue({
        first: () => ({
          evaluate: vi.fn().mockResolvedValue([true, false, 1.0, "block"]),
        }),
      });

      const args: IsVisibleArgs = {
        browserId: "test-browser",
        selector: "div",
      };

      const result = await service.isVisible(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.visible).toBe(true); // Element itself is visible
      expect(result.inViewport).toBe(false); // But not in viewport
    });
  });

  describe("isEnabled", () => {
    it("should detect enabled element correctly", async () => {
      (mockPage.waitForSelector as any).mockResolvedValue(undefined);
      (mockPage.locator as any).mockReturnValue({
        first: () => ({
          evaluate: vi.fn().mockResolvedValue([false, false, true]), // [disabled, readonly, interactive]
        }),
      });

      const args: IsEnabledArgs = {
        browserId: "test-browser",
        selector: "button",
      };

      const result = await service.isEnabled(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.enabled).toBe(true);
      expect(result.disabled).toBe(false);
      expect(result.readonly).toBe(false);
      expect(result.interactive).toBe(true);
    });

    it("should detect disabled element correctly", async () => {
      (mockPage.waitForSelector as any).mockResolvedValue(undefined);
      (mockPage.locator as any).mockReturnValue({
        first: () => ({
          evaluate: vi.fn().mockResolvedValue([true, false, false]), // [disabled, readonly, interactive]
        }),
      });

      const args: IsEnabledArgs = {
        browserId: "test-browser",
        selector: "button",
      };

      const result = await service.isEnabled(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.enabled).toBe(false);
      expect(result.disabled).toBe(true);
      expect(result.readonly).toBe(false);
      expect(result.interactive).toBe(false);
    });

    it("should detect readonly element correctly", async () => {
      (mockPage.waitForSelector as any).mockResolvedValue(undefined);
      (mockPage.locator as any).mockReturnValue({
        first: () => ({
          evaluate: vi.fn().mockResolvedValue([false, true, false]), // [disabled, readonly, interactive]
        }),
      });

      const args: IsEnabledArgs = {
        browserId: "test-browser",
        selector: "input",
      };

      const result = await service.isEnabled(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.enabled).toBe(true); // Not disabled
      expect(result.disabled).toBe(false);
      expect(result.readonly).toBe(true);
      expect(result.interactive).toBe(false); // But not interactive
    });
  });

  describe("describeHtml", () => {
    it("should analyze page structure successfully", async () => {
      const mockPageAnalysis = {
        pageStats: {
          totalSize: "5.2KB",
          totalChars: 5324,
          domDepth: 8,
          totalElements: 45,
          fullHtml: "<html><body><main>Test content</main></body></html>",
        },
        structure: {
          sections: [
            {
              selector: "main",
              size: "2.1KB",
              elements: 12,
              description: "Main content area",
              sizeBytes: 2150,
            },
          ],
          forms: [
            {
              selector: "#login-form",
              inputs: 3,
              description: "Form: login-form",
              hasPassword: true,
              hasSubmit: true,
            },
          ],
          media: {
            images: 5,
            videos: 1,
            iframes: 0,
          },
        },
        interactiveElements: {
          buttons: 3,
          links: 8,
          inputs: 3,
          selects: 1,
          textareas: 1,
        },
      };

      (mockPage.evaluate as any).mockResolvedValue(mockPageAnalysis);

      const args: DescribeHtmlArgs = {
        browserId: "test-browser",
        maxDepth: 20,
      };

      const result = await service.describeHtml(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.pageStats).toBeDefined();
      expect(result.pageStats.tokenEstimate).toBeGreaterThan(0);
      expect(result.pageStats.tokenMethod).toBeDefined();
      expect(result.structure.sections).toHaveLength(1);
      expect(result.structure.forms).toHaveLength(1);
      expect(result.interactiveElements.buttons).toBe(3);
      expect(result.recommendations).toBeInstanceOf(Array);
    });

    it("should provide recommendations for large pages", async () => {
      // Mock the page analysis to include large sections that exceed 2MB total
      const largePage = {
        pageStats: {
          totalSize: "5.5MB", // Large page
          totalChars: 5500000,
          domDepth: 5,
          totalElements: 1000,
          fullHtml: "<html><body>Large content</body></html>", // Small HTML for tokenizer
        },
        structure: {
          sections: [
            {
              selector: "main",
              size: "1.5MB",
              elements: 200,
              description: "Main content",
              sizeBytes: 1572864, // 1.5MB in bytes (too large for recommendation)
            },
            {
              selector: "aside",
              size: "400KB",
              elements: 50,
              description: "Sidebar",
              sizeBytes: 409600, // 400KB in bytes - total = 1982464 bytes < 2MB, so let's make main bigger
            },
            {
              selector: "footer",
              size: "300KB",
              elements: 30,
              description: "Footer content",
              sizeBytes: 307200, // 300KB - total now = 2289664 bytes > 2MB
            },
          ],
          forms: [],
          media: { images: 0, videos: 0, iframes: 0 },
        },
        interactiveElements: { buttons: 0, links: 0, inputs: 0, selects: 0, textareas: 0 },
      };

      (mockPage.evaluate as any).mockResolvedValue(largePage);

      const args: DescribeHtmlArgs = {
        browserId: "test-browser",
      };

      const result = await service.describeHtml(mockPage, args);

      expect(result.success).toBe(true);

      // The combined section sizes (1572864 + 409600 + 307200 = 2289664) exceed 2MB threshold (2097152)
      // aside and footer are < 500KB so they should be recommended for extraction
      expect(result.recommendations.some((r) => r.includes("Page too large"))).toBe(true);
      expect(result.recommendations.some((r) => r.includes("Try extracting"))).toBe(true);
    });

    it("should provide form-specific recommendations", async () => {
      const pageWithForms = {
        pageStats: {
          totalSize: "10KB",
          totalChars: 10240,
          domDepth: 5,
          totalElements: 50,
          fullHtml: "<html><body><form><input></form></body></html>",
        },
        structure: {
          sections: [],
          forms: [
            {
              selector: "form",
              inputs: 5,
              description: "Contact form",
              hasPassword: false,
              hasSubmit: true,
            },
          ],
          media: { images: 0, videos: 0, iframes: 2 },
        },
        interactiveElements: { buttons: 3, links: 5, inputs: 5, selects: 0, textareas: 1 },
      };

      (mockPage.evaluate as any).mockResolvedValue(pageWithForms);

      const args: DescribeHtmlArgs = {
        browserId: "test-browser",
      };

      const result = await service.describeHtml(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.recommendations.some((r) => r.includes("forms found"))).toBe(true);
      expect(result.recommendations.some((r) => r.includes("buttons found"))).toBe(true);
      expect(result.recommendations.some((r) => r.includes("iframes detected"))).toBe(true);
    });

    it("should handle deep DOM structures", async () => {
      const deepDomPage = {
        pageStats: {
          totalSize: "15KB",
          totalChars: 15360,
          domDepth: 25, // Very deep
          totalElements: 100,
          fullHtml: "<html><body><div>Deep content</div></body></html>",
        },
        structure: {
          sections: [],
          forms: [],
          media: { images: 0, videos: 0, iframes: 0 },
        },
        interactiveElements: { buttons: 0, links: 0, inputs: 0, selects: 0, textareas: 0 },
      };

      (mockPage.evaluate as any).mockResolvedValue(deepDomPage);

      const args: DescribeHtmlArgs = {
        browserId: "test-browser",
      };

      const result = await service.describeHtml(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.recommendations.some((r) => r.includes("Deep DOM structure"))).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle page evaluation errors gracefully", async () => {
      (mockPage.evaluate as any).mockRejectedValue(new Error("Page evaluation failed"));

      const args: DescribeHtmlArgs = {
        browserId: "test-browser",
      };

      await expect(service.describeHtml(mockPage, args)).rejects.toThrow(
        "Failed to describe HTML: Page evaluation failed",
      );
    });

    it("should handle selector not found errors", async () => {
      (mockPage.waitForSelector as any).mockRejectedValue(new Error("Selector not found"));

      const args: GetHtmlArgs = {
        browserId: "test-browser",
        selector: "#non-existent",
      };

      await expect(service.getHtml(mockPage, args)).rejects.toThrow(
        "Failed to extract HTML: Selector not found",
      );
    });

    it("should handle attribute access errors", async () => {
      (mockPage.waitForSelector as any).mockResolvedValue(undefined);
      (mockPage.locator as any).mockReturnValue({
        first: () => ({
          getAttribute: vi.fn().mockRejectedValue(new Error("Attribute access failed")),
        }),
      });

      const args: GetAttributeArgs = {
        browserId: "test-browser",
        selector: "div",
        attribute: "test",
      };

      await expect(service.getAttribute(mockPage, args)).rejects.toThrow(
        "Failed to get attribute: Attribute access failed",
      );
    });
  });
});
