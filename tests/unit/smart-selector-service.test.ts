/**
 * Smart Selector Service Unit Tests
 *
 * Tests business logic for natural language to CSS selector generation
 * without requiring external network access.
 */

import type { Page } from "playwright";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type GenerateSelectorArgs,
  SmartSelectorService,
} from "../../src/core/selector/smart-selector-service.js";

// Mock the logger to prevent dependency issues
vi.mock("../../src/shared/pino-logger.js", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe("SmartSelectorService", () => {
  let service: SmartSelectorService;
  let mockPage: Page;

  beforeEach(() => {
    service = new SmartSelectorService();

    // Create mock Page object
    mockPage = {
      evaluate: vi.fn(),
    } as any;
  });

  describe("generateSelector", () => {
    it("should generate selectors for button elements", async () => {
      const mockResult = {
        selectors: [
          {
            selector: "button",
            confidence: 0.7,
            stability: "medium" as const,
            matches: 5,
            description: "Matches 5 elements",
            reasoning: "Selected based on semantic HTML element with good confidence match",
          },
          {
            selector: '[data-action="submit"]',
            confidence: 0.8,
            stability: "high" as const,
            matches: 1,
            description: "Matches 1 element",
            reasoning: "Selected based on stable data attributes with high confidence match",
          },
        ],
        totalCandidates: 15,
        keywordsFound: {
          colors: [],
          elements: ["button"],
          text: [],
          positions: [],
          states: [],
          attributes: [],
        },
      };

      (mockPage.evaluate as any).mockResolvedValue(mockResult);

      const args: GenerateSelectorArgs = {
        browserId: "test-browser",
        description: "the submit button",
      };

      const result = await service.generateSelector(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.description).toBe("the submit button");
      expect(result.selectors).toHaveLength(2);
      expect(result.selectors[0]?.selector).toBe("button");
      expect(result.selectors[0]?.confidence).toBe(0.7);
      expect(result.selectors[1]?.selector).toBe('[data-action="submit"]');
      expect(result.selectors[1]?.stability).toBe("high");
      expect(typeof result.executionTime).toBe("number");
    });

    it("should handle color-based descriptions", async () => {
      const mockResult = {
        selectors: [
          {
            selector: ".red-button",
            confidence: 0.6,
            stability: "low" as const,
            matches: 2,
            description: "Matches 2 elements",
            reasoning: "Selected based on CSS class matching description",
          },
          {
            selector: '[class*="red"]',
            confidence: 0.5,
            stability: "low" as const,
            matches: 3,
            description: "Matches 3 elements",
            reasoning: "Selected based on CSS class matching description",
          },
        ],
        totalCandidates: 8,
        keywordsFound: {
          colors: ["red"],
          elements: ["button"],
          text: [],
          positions: [],
          states: [],
          attributes: [],
        },
      };

      (mockPage.evaluate as any).mockResolvedValue(mockResult);

      const args: GenerateSelectorArgs = {
        browserId: "test-browser",
        description: "the red button",
      };

      const result = await service.generateSelector(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.selectors[0]?.selector).toBe(".red-button");
      expect(result.selectors[0]?.confidence).toBe(0.6);
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          description: "the red button",
        }),
      );
    });

    it("should handle text-based descriptions", async () => {
      const mockResult = {
        selectors: [
          {
            selector: '[aria-label="Save changes"]',
            confidence: 0.9,
            stability: "high" as const,
            matches: 1,
            description: "Matches 1 element",
            reasoning: "Selected based on accessibility attributes with high confidence match",
          },
        ],
        totalCandidates: 6,
        keywordsFound: {
          colors: [],
          elements: [],
          text: ["Save changes"],
          positions: [],
          states: [],
          attributes: [],
        },
      };

      (mockPage.evaluate as any).mockResolvedValue(mockResult);

      const args: GenerateSelectorArgs = {
        browserId: "test-browser",
        description: 'button with text "Save changes"',
      };

      const result = await service.generateSelector(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.selectors[0]?.selector).toBe('[aria-label="Save changes"]');
      expect(result.selectors[0]?.stability).toBe("high");
      expect(result.selectors[0]?.confidence).toBe(0.9);
    });

    it("should handle position-based descriptions", async () => {
      const mockResult = {
        selectors: [
          {
            selector: "button:first-child",
            confidence: 0.6,
            stability: "medium" as const,
            matches: 1,
            description: "Matches 1 element",
            reasoning: "Selected based on semantic HTML element",
          },
        ],
        totalCandidates: 4,
        keywordsFound: {
          colors: [],
          elements: ["button"],
          text: [],
          positions: ["first"],
          states: [],
          attributes: [],
        },
      };

      (mockPage.evaluate as any).mockResolvedValue(mockResult);

      const args: GenerateSelectorArgs = {
        browserId: "test-browser",
        description: "the first button",
      };

      const result = await service.generateSelector(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.selectors[0]?.selector).toBe("button:first-child");
      expect(result.selectors[0]?.confidence).toBe(0.6);
    });

    it("should handle context parameter", async () => {
      const mockResult = {
        selectors: [
          {
            selector: "form button",
            confidence: 0.7,
            stability: "medium" as const,
            matches: 2,
            description: "Matches 2 elements",
            reasoning: "Selected based on semantic HTML element with good confidence match",
          },
        ],
        totalCandidates: 3,
        keywordsFound: {
          colors: [],
          elements: ["button"],
          text: [],
          positions: [],
          states: [],
          attributes: [],
        },
      };

      (mockPage.evaluate as any).mockResolvedValue(mockResult);

      const args: GenerateSelectorArgs = {
        browserId: "test-browser",
        description: "button",
        context: "form",
      };

      const result = await service.generateSelector(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.selectors[0]?.selector).toBe("form button");
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          context: "form",
        }),
      );
    });

    it("should respect preferStable parameter", async () => {
      const mockResult = {
        selectors: [
          {
            selector: '[data-testid="submit-btn"]',
            confidence: 0.8,
            stability: "high" as const,
            matches: 1,
            description: "Matches 1 element",
            reasoning: "Selected based on stable data attributes with high confidence match",
          },
        ],
        totalCandidates: 5,
        keywordsFound: {
          colors: [],
          elements: ["button"],
          text: [],
          positions: [],
          states: [],
          attributes: ["submit"],
        },
      };

      (mockPage.evaluate as any).mockResolvedValue(mockResult);

      const args: GenerateSelectorArgs = {
        browserId: "test-browser",
        description: "submit button",
        preferStable: true,
      };

      const result = await service.generateSelector(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.selectors[0]?.stability).toBe("high");
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          preferStable: true,
        }),
      );
    });

    it("should limit number of selectors returned", async () => {
      const mockResult = {
        selectors: [
          {
            selector: "button",
            confidence: 0.7,
            stability: "medium" as const,
            matches: 5,
            description: "Matches 5 elements",
            reasoning: "Selected based on semantic HTML element",
          },
          {
            selector: ".btn",
            confidence: 0.6,
            stability: "low" as const,
            matches: 3,
            description: "Matches 3 elements",
            reasoning: "Selected based on CSS class matching description",
          },
        ],
        totalCandidates: 10,
        keywordsFound: {
          colors: [],
          elements: ["button"],
          text: [],
          positions: [],
          states: [],
          attributes: [],
        },
      };

      (mockPage.evaluate as any).mockResolvedValue(mockResult);

      const args: GenerateSelectorArgs = {
        browserId: "test-browser",
        description: "button",
        maxSelectors: 2,
      };

      const result = await service.generateSelector(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.selectors).toHaveLength(2);
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          maxSelectors: 2,
        }),
      );
    });

    it("should handle timeout parameter", async () => {
      const mockResult = {
        selectors: [
          {
            selector: "input",
            confidence: 0.8,
            stability: "medium" as const,
            matches: 1,
            description: "Matches 1 element",
            reasoning: "Selected based on semantic HTML element with high confidence match",
          },
        ],
        totalCandidates: 2,
        keywordsFound: {
          colors: [],
          elements: ["input"],
          text: [],
          positions: [],
          states: [],
          attributes: [],
        },
      };

      (mockPage.evaluate as any).mockResolvedValue(mockResult);

      const args: GenerateSelectorArgs = {
        browserId: "test-browser",
        description: "input field",
        timeout: 10000,
      };

      const result = await service.generateSelector(mockPage, args);

      expect(result.success).toBe(true);
      expect(typeof result.executionTime).toBe("number");
    });

    it("should generate recommendations when no elements found", async () => {
      const mockResult = {
        selectors: [], // No selectors found
        totalCandidates: 0,
        keywordsFound: {
          colors: [],
          elements: [],
          text: [],
          positions: [],
          states: [],
          attributes: [],
        },
      };

      (mockPage.evaluate as any).mockResolvedValue(mockResult);

      const args: GenerateSelectorArgs = {
        browserId: "test-browser",
        description: "nonexistent element",
      };

      const result = await service.generateSelector(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.selectors).toHaveLength(0);
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations[0]).toBeDefined();
    });

    it("should generate recommendations for low confidence matches", async () => {
      const mockResult = {
        selectors: [
          {
            selector: "div",
            confidence: 0.3, // Low confidence
            stability: "low" as const,
            matches: 10,
            description: "Matches 10 elements",
            reasoning: "Selected based on semantic HTML element",
          },
        ],
        totalCandidates: 1,
        keywordsFound: {
          colors: [],
          elements: [],
          text: [],
          positions: [],
          states: [],
          attributes: [],
        },
      };

      (mockPage.evaluate as any).mockResolvedValue(mockResult);

      const args: GenerateSelectorArgs = {
        browserId: "test-browser",
        description: "vague description",
      };

      const result = await service.generateSelector(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);
      // Should provide some recommendation for low confidence
    });

    it("should generate recommendations for fragile selectors", async () => {
      const mockResult = {
        selectors: [
          {
            selector: ".css-class-123",
            confidence: 0.7,
            stability: "low" as const, // Low stability
            matches: 1,
            description: "Matches 1 element",
            reasoning: "Selected based on CSS class matching description",
          },
        ],
        totalCandidates: 1,
        keywordsFound: {
          colors: [],
          elements: [],
          text: [],
          positions: [],
          states: [],
          attributes: [],
        },
      };

      (mockPage.evaluate as any).mockResolvedValue(mockResult);

      const args: GenerateSelectorArgs = {
        browserId: "test-browser",
        description: "element",
      };

      const result = await service.generateSelector(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);
      // Should provide some recommendation for fragile selectors
    });

    it("should generate recommendations for too many matches", async () => {
      const mockResult = {
        selectors: [
          {
            selector: "div",
            confidence: 0.6,
            stability: "medium" as const,
            matches: 15, // Many matches
            description: "Matches 15 elements",
            reasoning: "Selected based on semantic HTML element",
          },
        ],
        totalCandidates: 1,
        keywordsFound: {
          colors: [],
          elements: ["div"],
          text: [],
          positions: [],
          states: [],
          attributes: [],
        },
      };

      (mockPage.evaluate as any).mockResolvedValue(mockResult);

      const args: GenerateSelectorArgs = {
        browserId: "test-browser",
        description: "div element",
      };

      const result = await service.generateSelector(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);
      // Should provide recommendation for too many matches
    });

    it("should suggest stable selectors when preferStable is true but none found", async () => {
      const mockResult = {
        selectors: [
          {
            selector: ".btn-class",
            confidence: 0.7,
            stability: "low" as const, // No high stability selectors
            matches: 1,
            description: "Matches 1 element",
            reasoning: "Selected based on CSS class matching description",
          },
        ],
        totalCandidates: 1,
        keywordsFound: {
          colors: [],
          elements: ["button"],
          text: [],
          positions: [],
          states: [],
          attributes: [],
        },
      };

      (mockPage.evaluate as any).mockResolvedValue(mockResult);

      const args: GenerateSelectorArgs = {
        browserId: "test-browser",
        description: "button",
        preferStable: true,
      };

      const result = await service.generateSelector(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.recommendations.length).toBeGreaterThan(0);
      // Should provide recommendation for stable selectors
    });
  });

  describe("Error handling", () => {
    it("should handle page evaluation errors gracefully", async () => {
      (mockPage.evaluate as any).mockRejectedValue(new Error("Page evaluation failed"));

      const args: GenerateSelectorArgs = {
        browserId: "test-browser",
        description: "button",
      };

      const result = await service.generateSelector(mockPage, args);

      expect(result.success).toBe(false);
      expect(result.description).toBe("button");
      expect(result.selectors).toHaveLength(0);
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(typeof result.executionTime).toBe("number");
    });

    it("should handle empty descriptions", async () => {
      const mockResult = {
        selectors: [],
        totalCandidates: 0,
        keywordsFound: {
          colors: [],
          elements: [],
          text: [],
          positions: [],
          states: [],
          attributes: [],
        },
      };

      (mockPage.evaluate as any).mockResolvedValue(mockResult);

      const args: GenerateSelectorArgs = {
        browserId: "test-browser",
        description: "", // Empty description
      };

      const result = await service.generateSelector(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.description).toBe("");
      expect(result.selectors).toHaveLength(0);
    });

    it("should handle network timeouts", async () => {
      (mockPage.evaluate as any).mockImplementation(
        () => new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 100)),
      );

      const args: GenerateSelectorArgs = {
        browserId: "test-browser",
        description: "button",
        timeout: 50, // Very short timeout
      };

      const result = await service.generateSelector(mockPage, args);

      expect(result.success).toBe(false);
      expect(result.recommendations[0]).toContain("generation failed");
    });
  });

  describe("Complex scenarios", () => {
    it("should handle multiple keywords in description", async () => {
      const mockResult = {
        selectors: [
          {
            selector: "nav .primary.blue-btn",
            confidence: 0.8,
            stability: "low" as const,
            matches: 1,
            description: "Matches 1 element",
            reasoning:
              "Selected based on CSS class matching description with good confidence match",
          },
        ],
        totalCandidates: 5,
        keywordsFound: {
          colors: ["blue"],
          elements: ["button", "nav"],
          text: [],
          positions: ["primary"],
          states: [],
          attributes: [],
        },
      };

      (mockPage.evaluate as any).mockResolvedValue(mockResult);

      const args: GenerateSelectorArgs = {
        browserId: "test-browser",
        description: "primary blue button in navigation",
      };

      const result = await service.generateSelector(mockPage, args);

      expect(result.success).toBe(true);
      expect(result.selectors[0]?.confidence).toBe(0.8);
      expect(result.selectors[0]?.selector).toBe("nav .primary.blue-btn");
    });

    it("should prioritize stability when requested", async () => {
      const mockResult = {
        selectors: [
          {
            selector: '[data-action="submit"]',
            confidence: 0.9,
            stability: "high" as const, // Should be first due to high stability
            matches: 1,
            description: "Matches 1 element",
            reasoning: "Selected based on stable data attributes with high confidence match",
          },
          {
            selector: ".submit-btn",
            confidence: 0.95,
            stability: "low" as const, // Higher confidence but low stability
            matches: 1,
            description: "Matches 1 element",
            reasoning:
              "Selected based on CSS class matching description with high confidence match",
          },
        ],
        totalCandidates: 8,
        keywordsFound: {
          colors: [],
          elements: ["button"],
          text: [],
          positions: [],
          states: [],
          attributes: ["submit"],
        },
      };

      (mockPage.evaluate as any).mockResolvedValue(mockResult);

      const args: GenerateSelectorArgs = {
        browserId: "test-browser",
        description: "submit button",
        preferStable: true,
      };

      const result = await service.generateSelector(mockPage, args);

      expect(result.success).toBe(true);
      // Should prioritize the stable selector first
      expect(result.selectors[0]?.stability).toBe("high");
      expect(result.selectors[0]?.selector).toBe('[data-action="submit"]');
    });
  });
});
