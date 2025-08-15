/**
 * Smart Element Selector Generation Service for Brooklyn MCP Server
 * Converts natural language descriptions to robust CSS selectors
 * Critical for reducing AI frustration with element selection
 */

import type { Page } from "playwright";
import { getLogger } from "../../shared/pino-logger.js";

// Lazy logger initialization pattern
let logger: ReturnType<typeof getLogger> | null = null;
function ensureLogger() {
  if (!logger) {
    logger = getLogger("smart-selector");
  }
  return logger;
}

// Parsed description keywords
export interface ParsedDescription {
  colors: string[];
  elements: string[];
  text: string[];
  positions: string[];
  states: string[];
  attributes: string[];
}

// Smart selector generation arguments
export interface GenerateSelectorArgs {
  browserId: string;
  description: string; // "the blue submit button" | "main navigation menu"
  context?: string; // Parent element context
  preferStable?: boolean; // Prefer data-* over classes
  maxSelectors?: number; // Limit selectors returned (default: 5)
  timeout?: number;
}

// Generated selector result
export interface GeneratedSelector {
  selector: string;
  confidence: number; // 0-1 match confidence
  stability: "high" | "medium" | "low";
  matches: number; // Number of elements matched
  description: string; // Human-readable description
  reasoning: string; // Why this selector was chosen
}

// Smart selector generation result
export interface GenerateSelectorResult {
  success: boolean;
  description: string;
  selectors: GeneratedSelector[];
  recommendations: string[];
  executionTime: number;
}

/**
 * Service for generating intelligent CSS selectors from natural language
 * Reduces AI friction with "find the red button" workflows
 */
export class SmartSelectorService {
  private readonly defaultTimeout = 30000;

  /**
   * Generate smart selectors from natural language description
   * Uses multiple strategies for maximum reliability
   */
  async generateSelector(page: Page, args: GenerateSelectorArgs): Promise<GenerateSelectorResult> {
    const startTime = Date.now();
    const maxSelectors = args.maxSelectors ?? 5;
    const preferStable = args.preferStable ?? true;

    try {
      ensureLogger().info("Generating smart selectors", {
        browserId: args.browserId,
        description: args.description,
        context: args.context,
        preferStable,
        maxSelectors,
      });

      const result = (await page.evaluate(
        ({ description, context, preferStable: _preferStable, maxSelectors: _maxSelectors }) => {
          // Helper: Parse description for keywords
          const parseDescription = (desc: string) => {
            const lower = desc.toLowerCase();
            return {
              colors: (lower.match(
                /\b(red|blue|green|yellow|orange|purple|pink|black|white|gray|grey)\b/g,
              ) || []) as string[],
              elements: (lower.match(
                /\b(button|link|input|form|menu|nav|header|footer|sidebar|modal|dialog|card|table)\b/g,
              ) || []) as string[],
              text: (lower.match(/["'](.*?)["']|with text (.*?)$/g) || []) as string[],
              positions: (lower.match(
                /\b(first|last|second|third|main|primary|secondary|top|bottom|left|right)\b/g,
              ) || []) as string[],
              states: (lower.match(/\b(disabled|enabled|active|hover|focus|selected|checked)\b/g) ||
                []) as string[],
              attributes: (lower.match(/\b(submit|cancel|save|delete|edit|close|open)\b/g) ||
                []) as string[],
            };
          };

          // Helper: Generate attribute-based selectors
          const generateAttributeSelectors = (keywords: ReturnType<typeof parseDescription>) => {
            const selectors: string[] = [];

            // Data attributes (most stable)
            if (keywords.attributes.length > 0) {
              for (const attr of keywords.attributes) {
                selectors.push(`[data-${attr}]`);
                selectors.push(`[data-action="${attr}"]`);
                selectors.push(`[data-testid*="${attr}"]`);
              }
            }

            // Type attributes
            if (keywords.attributes.includes("submit")) {
              selectors.push('input[type="submit"]');
              selectors.push('button[type="submit"]');
            }

            // ARIA attributes
            if (keywords.elements.includes("button")) {
              selectors.push('[role="button"]');
            }
            if (keywords.elements.includes("nav") || keywords.elements.includes("menu")) {
              selectors.push('[role="navigation"]');
              selectors.push("nav");
            }

            return selectors;
          };

          // Helper: Generate color-element combinations
          const generateColorElementPatterns = (
            keywords: ReturnType<typeof parseDescription>,
          ): string[] => {
            const patterns: string[] = [];

            if (keywords.colors.length > 0 && keywords.elements.length > 0) {
              for (const color of keywords.colors) {
                for (const element of keywords.elements) {
                  patterns.push(`${color}-${element}`);
                  patterns.push(`${element}-${color}`);
                  patterns.push(`btn-${color}`);
                }
              }
            }

            return patterns;
          };

          // Helper: Generate element-specific patterns
          const generateElementPatterns = (
            keywords: ReturnType<typeof parseDescription>,
          ): string[] => {
            const patterns: string[] = [];

            if (keywords.elements.includes("button")) {
              patterns.push("btn", "button", "action-btn");
            }
            if (keywords.elements.includes("nav") || keywords.elements.includes("menu")) {
              patterns.push("nav", "menu", "navigation", "navbar");
            }

            return patterns;
          };

          // Helper: Generate class-based selectors
          const generateClassSelectors = (keywords: ReturnType<typeof parseDescription>) => {
            const selectors: string[] = [];
            const classPatterns = [
              ...generateColorElementPatterns(keywords),
              ...generateElementPatterns(keywords),
            ];

            // Generate selectors for class patterns
            for (const pattern of classPatterns) {
              selectors.push(`.${pattern}`);
              selectors.push(`[class*="${pattern}"]`);
            }

            return selectors;
          };

          // Helper: Generate text-based selectors
          const generateTextSelectors = (keywords: ReturnType<typeof parseDescription>) => {
            const selectors: string[] = [];

            // Extract text from quotes
            for (const textMatch of keywords.text) {
              const text = textMatch.replace(/["']/g, "").replace(/with text /, "");
              if (text && text.length > 0) {
                selectors.push(`*:contains("${text}")`); // Note: not standard CSS
                selectors.push(`[aria-label="${text}"]`);
                selectors.push(`[title="${text}"]`);
                selectors.push(`[alt="${text}"]`);
              }
            }

            return selectors;
          };

          // Helper: Generate semantic selectors
          const generateSemanticSelectors = (keywords: ReturnType<typeof parseDescription>) => {
            const selectors: string[] = [];

            // Semantic HTML elements
            if (keywords.elements.includes("button")) {
              selectors.push("button");
            }
            if (keywords.elements.includes("nav")) {
              selectors.push("nav");
            }
            if (keywords.elements.includes("header")) {
              selectors.push("header");
            }
            if (keywords.elements.includes("footer")) {
              selectors.push("footer");
            }
            if (keywords.elements.includes("form")) {
              selectors.push("form");
            }

            // Position-based
            if (keywords.positions.includes("first")) {
              selectors.push(":first-child", ":first-of-type");
            }
            if (keywords.positions.includes("last")) {
              selectors.push(":last-child", ":last-of-type");
            }

            return selectors;
          };

          // Helper: Get elements matching selector (handles :contains)
          const getMatchingElements = (selector: string): Element[] => {
            try {
              if (selector.includes(":contains(")) {
                const textMatch = selector.match(/:contains\("([^"]+)"\)/);
                if (textMatch?.[1]) {
                  const text = textMatch[1];
                  const baseSelector = selector.replace(/:contains\("[^"]+"\)/, "");
                  const candidateElements =
                    baseSelector === "*"
                      ? Array.from(document.querySelectorAll("*"))
                      : Array.from(document.querySelectorAll(baseSelector));

                  return candidateElements.filter((el) =>
                    el.textContent?.toLowerCase().includes(text.toLowerCase()),
                  );
                }
                return [];
              }
              return Array.from(document.querySelectorAll(selector));
            } catch {
              return [];
            }
          };

          // Helper: Calculate text match confidence
          const calculateTextConfidence = (
            element: Element,
            keywords: ReturnType<typeof parseDescription>,
          ): number => {
            const elementText = element.textContent?.toLowerCase() || "";
            let confidence = 0;

            for (const textMatch of keywords.text) {
              const text = textMatch
                .replace(/["']/g, "")
                .replace(/with text /, "")
                .toLowerCase();
              if (elementText.includes(text)) {
                confidence += 0.3;
              }
            }

            return confidence;
          };

          // Helper: Calculate element type confidence
          const calculateTypeConfidence = (
            element: Element,
            keywords: ReturnType<typeof parseDescription>,
          ): number => {
            const elementType = element.tagName.toLowerCase();
            return keywords.elements.includes(elementType) ? 0.2 : 0;
          };

          // Helper: Calculate color confidence
          const calculateColorConfidence = (
            element: Element,
            keywords: ReturnType<typeof parseDescription>,
          ): number => {
            const elementClasses = element.className?.toLowerCase() || "";
            let confidence = 0;

            for (const color of keywords.colors) {
              if (elementClasses.includes(color)) {
                confidence += 0.15;
              }
            }

            return confidence;
          };

          // Helper: Calculate attribute confidence
          const calculateAttributeConfidence = (
            element: Element,
            keywords: ReturnType<typeof parseDescription>,
          ): number => {
            const elementClasses = element.className?.toLowerCase() || "";
            let confidence = 0;

            for (const attr of keywords.attributes) {
              if (element.hasAttribute(attr) || elementClasses.includes(attr)) {
                confidence += 0.1;
              }
            }

            return confidence;
          };

          // Helper: Calculate confidence based on element matches
          const calculateElementConfidence = (
            elements: Element[],
            keywords: ReturnType<typeof parseDescription>,
          ): number => {
            let confidence = 0.5; // Base confidence

            for (const element of elements) {
              confidence += calculateTextConfidence(element, keywords);
              confidence += calculateTypeConfidence(element, keywords);
              confidence += calculateColorConfidence(element, keywords);
              confidence += calculateAttributeConfidence(element, keywords);
            }

            return Math.min(confidence, 1.0);
          };

          // Helper: Calculate selector stability
          const calculateStability = (selector: string): "high" | "medium" | "low" => {
            if (
              selector.includes("[data-") ||
              selector.includes("[aria-") ||
              selector.includes("[role=")
            ) {
              return "high";
            }
            if (selector.match(/^[a-z]+$/) || selector.includes(":")) {
              return "medium";
            }
            if (selector.includes(".") || selector.includes("#")) {
              return "low";
            }
            return "low";
          };

          // Helper: Test selector and calculate metrics
          const testSelector = (
            selector: string,
            keywords: ReturnType<typeof parseDescription>,
          ) => {
            const elements = getMatchingElements(selector);

            if (elements.length === 0) {
              return null;
            }

            let confidence = calculateElementConfidence(elements, keywords);
            const stability = calculateStability(selector);

            // Prefer stable selectors if requested
            if (_preferStable && stability === "high") {
              confidence += 0.1;
            }

            return {
              selector,
              confidence: Math.min(confidence, 1.0),
              stability,
              matches: elements.length,
              elements,
            };
          };

          // Main logic
          const keywords = parseDescription(description);
          const allSelectors: string[] = [];

          // Generate selectors by strategy
          allSelectors.push(...generateAttributeSelectors(keywords));
          allSelectors.push(...generateClassSelectors(keywords));
          allSelectors.push(...generateTextSelectors(keywords));
          allSelectors.push(...generateSemanticSelectors(keywords));

          // Add context if provided
          const contextSelectors = context ? allSelectors.map((sel) => `${context} ${sel}`) : [];
          allSelectors.push(...contextSelectors);

          // Test all selectors and rank them
          const testedSelectors = allSelectors
            .map((sel) => testSelector(sel, keywords))
            .filter((result): result is NonNullable<typeof result> => result !== null)
            .sort((a, b) => {
              // Sort by confidence first, then by specificity (fewer matches = more specific)
              if (Math.abs(a.confidence - b.confidence) > 0.1) {
                return b.confidence - a.confidence;
              }
              return a.matches - b.matches;
            })
            .slice(0, _maxSelectors);

          // Generate descriptions and reasoning
          const results = testedSelectors.map((result) => {
            const description = `Matches ${result.matches} element${result.matches !== 1 ? "s" : ""}`;
            let reasoning = "Selected based on ";

            if (result.selector.includes("[data-")) {
              reasoning += "stable data attributes";
            } else if (result.selector.includes("[aria-")) {
              reasoning += "accessibility attributes";
            } else if (result.selector.match(/^[a-z]+$/)) {
              reasoning += "semantic HTML element";
            } else if (result.selector.includes(".")) {
              reasoning += "CSS class matching description";
            } else {
              reasoning += "attribute matching";
            }

            if (result.confidence > 0.8) {
              reasoning += " with high confidence match";
            } else if (result.confidence > 0.6) {
              reasoning += " with good confidence match";
            }

            return {
              selector: result.selector,
              confidence: result.confidence,
              stability: result.stability,
              matches: result.matches,
              description,
              reasoning,
            };
          });

          return {
            selectors: results,
            totalCandidates: allSelectors.length,
            keywordsFound: keywords,
          };
        },
        {
          description: args.description,
          context: args.context,
          preferStable,
          maxSelectors,
        },
      )) as {
        selectors: Array<{
          selector: string;
          confidence: number;
          stability: "high" | "medium" | "low";
          matches: number;
          description: string;
          reasoning: string;
        }>;
        totalCandidates: number;
        keywordsFound: ParsedDescription;
      };

      const executionTime = Date.now() - startTime;

      // Generate recommendations
      const recommendations: string[] = [];

      if (result.selectors.length === 0) {
        recommendations.push(
          "No matching elements found. Try simplifying the description or checking element existence.",
        );
      } else {
        const bestSelector = result.selectors[0];
        if (bestSelector && bestSelector.confidence < 0.6) {
          recommendations.push(
            "Low confidence match. Consider adding more specific details to the description.",
          );
        }
        if (bestSelector && bestSelector.stability === "low") {
          recommendations.push(
            "Selected selector may be fragile. Consider adding data attributes for better stability.",
          );
        }
        if (result.selectors.some((s) => s.matches > 10)) {
          recommendations.push(
            "Some selectors match many elements. Add context or be more specific.",
          );
        }
        if (preferStable && !result.selectors.some((s) => s.stability === "high")) {
          recommendations.push(
            "No highly stable selectors found. Consider adding data-testid attributes to elements.",
          );
        }
      }

      ensureLogger().info("Smart selector generation completed", {
        browserId: args.browserId,
        description: args.description,
        selectorsFound: result.selectors.length,
        bestConfidence: result.selectors[0]?.confidence,
        executionTime,
      });

      return {
        success: true,
        description: args.description,
        selectors: result.selectors,
        recommendations,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      ensureLogger().error("Smart selector generation failed", {
        browserId: args.browserId,
        description: args.description,
        error: errorMessage,
        executionTime,
      });

      return {
        success: false,
        description: args.description,
        selectors: [],
        recommendations: [
          "Selector generation failed. Check that the page is loaded and description is clear.",
        ],
        executionTime,
      };
    }
  }
}
