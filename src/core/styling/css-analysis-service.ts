/**
 * CSS Analysis Service for Brooklyn MCP Server
 * Enables AI to understand and analyze web page styling
 * Critical for rapid UX iteration - understand styles in <1 second
 */

import type { Page } from "playwright";
import { getLogger } from "../../shared/pino-logger.js";

// Lazy logger initialization pattern
let logger: ReturnType<typeof getLogger> | null = null;
function ensureLogger() {
  if (!logger) {
    logger = getLogger("css-analysis");
  }
  return logger;
}

// CSS extraction arguments
export interface ExtractCSSArgs {
  browserId: string;
  selector: string;
  includeInherited?: boolean;
  includeComputed?: boolean;
  properties?: string[];
  pseudoElements?: string[];
  timeout?: number;
}

// CSS extraction result
export interface ExtractCSSResult {
  success: boolean;
  styles: Record<string, string>;
  cssText: string;
  specificity?: number;
  source: "inline" | "stylesheet" | "computed";
  selector: string;
  executionTime: number;
}

// Computed styles arguments
export interface GetComputedStylesArgs {
  browserId: string;
  selector: string;
  properties?: string[];
  timeout?: number;
}

// Computed styles result
export interface GetComputedStylesResult {
  success: boolean;
  computed: Record<string, string>;
  inherited: Record<string, string>;
  overridden: Record<string, string>;
  selector: string;
  executionTime: number;
}

// CSS diff arguments
export interface DiffCSSArgs {
  browserId: string;
  selector: string;
  baseline: Record<string, string>;
  timeout?: number;
}

// CSS diff result
export interface DiffCSSResult {
  success: boolean;
  added: Record<string, string>;
  modified: Record<string, { old: string; new: string }>;
  removed: string[];
  selector: string;
}

// Specificity analysis arguments
export interface AnalyzeSpecificityArgs {
  browserId: string;
  selector: string;
  timeout?: number;
}

// Specificity rule
export interface SpecificityRule {
  selector: string;
  specificity: [number, number, number, number]; // [inline, id, class, element]
  properties: Record<string, string>;
  source: string;
}

// Specificity analysis result
export interface AnalyzeSpecificityResult {
  success: boolean;
  rules: SpecificityRule[];
  winningRule: SpecificityRule | null;
  selector: string;
}

// Batch CSS extraction arguments
export interface BatchExtractCSSArgs {
  browserId: string;
  selectors: string[];
  includeComputed?: boolean;
  timeout?: number;
}

// Batch CSS extraction result
export interface BatchExtractCSSResult {
  success: boolean;
  results: Record<string, ExtractCSSResult>;
  executionTime: number;
}

/**
 * Service for analyzing CSS and styles in browser context
 * Enables rapid understanding of current page styling
 */
export class CSSAnalysisService {
  private readonly defaultTimeout = 30000;
  private styleCache = new Map<string, { styles: Record<string, string>; timestamp: number }>();
  private readonly cacheTimeout = 5000; // 5 seconds cache

  /**
   * Extract CSS styles for an element
   * Core function for understanding current styling
   */
  async extractCSS(page: Page, args: ExtractCSSArgs): Promise<ExtractCSSResult> {
    const startTime = Date.now();
    const _timeout = args.timeout || this.defaultTimeout;

    try {
      ensureLogger().info("Extracting CSS", {
        browserId: args.browserId,
        selector: args.selector,
        includeInherited: args.includeInherited,
        includeComputed: args.includeComputed,
      });

      // Check cache for performance
      const cacheKey = `${args.browserId}-${args.selector}`;
      const cached = this.styleCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout && !args.includeComputed) {
        ensureLogger().info("Returning cached styles", { browserId: args.browserId });
        return {
          success: true,
          styles: cached.styles,
          cssText: this.stylesToCSSText(cached.styles),
          source: "computed",
          selector: args.selector,
          executionTime: Date.now() - startTime,
        };
      }

      const result = (await page.evaluate(
        ({
          selector,
          includeInherited: _includeInherited,
          includeComputed,
          properties,
          pseudoElements,
        }) => {
          // Helper function: Calculate specificity
          const calculateSpecificity = (sel: string): number => {
            const idCount = (sel.match(/#[\w-]+/g) || []).length;
            const classCount = (sel.match(/\.[\w-]+/g) || []).length;
            const elementCount = (sel.match(/^[a-z]+|[\s>+~][a-z]+/gi) || []).length;
            return idCount * 100 + classCount * 10 + elementCount;
          };

          // Helper function: Extract computed styles
          const extractComputedStyles = (element: Element, properties?: string[]) => {
            const styles: Record<string, string> = {};
            const computed = window.getComputedStyle(element);
            const propertiesToExtract = properties || Array.from(computed);

            for (const prop of propertiesToExtract) {
              const value = computed.getPropertyValue(prop);
              if (value && value !== "initial" && value !== "inherit") {
                styles[prop] = value;
              }
            }
            return styles;
          };

          // Helper function: Extract inline styles
          const extractInlineStyles = (element: Element, properties?: string[]) => {
            const styles: Record<string, string> = {};
            if (element instanceof HTMLElement && element.style.cssText) {
              const inlineStyles = element.style;
              for (let i = 0; i < inlineStyles.length; i++) {
                const prop = inlineStyles[i];
                if (prop && (!properties || properties.includes(prop))) {
                  styles[prop] = inlineStyles.getPropertyValue(prop);
                }
              }
            }
            return styles;
          };

          // Helper function: Extract pseudo-element styles
          const extractPseudoStyles = (element: Element, pseudoElements: string[]) => {
            const styles: Record<string, string> = {};
            for (const pseudo of pseudoElements) {
              const pseudoComputed = window.getComputedStyle(element, pseudo);
              const pseudoPrefix = `${pseudo}::`;

              for (const prop of Array.from(pseudoComputed)) {
                const value = pseudoComputed.getPropertyValue(prop);
                if (value && value !== "initial" && prop) {
                  styles[`${pseudoPrefix}${prop}`] = value;
                }
              }
            }
            return styles;
          };

          // Main logic
          const element = document.querySelector(selector);
          if (!element) {
            throw new Error(`Element not found: ${selector}`);
          }

          let styles: Record<string, string> = {};
          let source: "inline" | "stylesheet" | "computed" = "computed";

          // Extract computed styles if requested
          if (includeComputed !== false) {
            styles = { ...styles, ...extractComputedStyles(element, properties) };
          }

          // Extract inline styles
          const inlineStyles = extractInlineStyles(element, properties);
          if (Object.keys(inlineStyles).length > 0) {
            source = "inline";
            styles = { ...styles, ...inlineStyles };
          }

          // Extract pseudo-element styles
          if (pseudoElements && pseudoElements.length > 0) {
            styles = { ...styles, ...extractPseudoStyles(element, pseudoElements) };
          }

          return {
            styles,
            source,
            specificity: calculateSpecificity(selector),
          };
        },
        {
          selector: args.selector,
          includeInherited: args.includeInherited,
          includeComputed: args.includeComputed,
          properties: args.properties,
          pseudoElements: args.pseudoElements,
        },
      )) as {
        styles: Record<string, string>;
        source: "inline" | "stylesheet" | "computed";
        specificity: number;
      };

      // Cache the result for performance
      this.styleCache.set(cacheKey, { styles: result.styles, timestamp: Date.now() });

      const executionTime = Date.now() - startTime;

      ensureLogger().info("CSS extracted successfully", {
        browserId: args.browserId,
        selector: args.selector,
        propertyCount: Object.keys(result.styles).length,
        executionTime,
      });

      return {
        success: true,
        styles: result.styles,
        cssText: this.stylesToCSSText(result.styles),
        specificity: result.specificity,
        source: result.source,
        selector: args.selector,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      ensureLogger().error("CSS extraction failed", {
        browserId: args.browserId,
        selector: args.selector,
        error: errorMessage,
        executionTime,
      });

      return {
        success: false,
        styles: {},
        cssText: "",
        source: "computed",
        selector: args.selector,
        executionTime,
      };
    }
  }

  /**
   * Get computed styles with inheritance chain
   * Shows what styles are inherited vs directly applied
   */
  async getComputedStyles(
    page: Page,
    args: GetComputedStylesArgs,
  ): Promise<GetComputedStylesResult> {
    const startTime = Date.now();
    const _timeout = args.timeout || this.defaultTimeout;

    try {
      ensureLogger().info("Getting computed styles", {
        browserId: args.browserId,
        selector: args.selector,
        propertyFilter: args.properties?.length,
      });

      const result = (await page.evaluate(
        ({ selector, properties }) => {
          // Helper: Get inheritable properties list
          const getInheritableProps = () => [
            "color",
            "font",
            "font-family",
            "font-size",
            "font-weight",
            "line-height",
            "text-align",
            "text-indent",
            "text-transform",
            "letter-spacing",
            "word-spacing",
            "white-space",
            "direction",
          ];

          // Helper: Check if property is inheritable
          const isInheritableProperty = (prop: string) => {
            return getInheritableProps().some((p) => prop?.startsWith(p));
          };

          // Helper: Process computed styles
          const processComputedStyles = (
            _element: Element,
            computedStyle: CSSStyleDeclaration,
            parentStyle: CSSStyleDeclaration | null,
            propsToCheck: string[],
          ) => {
            const computed: Record<string, string> = {};
            const inherited: Record<string, string> = {};

            for (const prop of propsToCheck) {
              const value = computedStyle.getPropertyValue(prop);

              if (value) {
                computed[prop] = value;

                // Check inheritance
                if (parentStyle) {
                  const parentValue = parentStyle.getPropertyValue(prop);
                  if (parentValue === value && prop && isInheritableProperty(prop)) {
                    inherited[prop] = value;
                  }
                }
              }
            }

            return { computed, inherited };
          };

          // Helper: Check for overridden styles
          const checkOverriddenStyles = (element: Element, computedStyle: CSSStyleDeclaration) => {
            const overridden: Record<string, string> = {};

            if (element instanceof HTMLElement && element.style.cssText) {
              for (let i = 0; i < element.style.length; i++) {
                const prop = element.style[i];
                if (prop) {
                  const inlineValue = element.style.getPropertyValue(prop);
                  const computedValue = computedStyle.getPropertyValue(prop);

                  if (inlineValue !== computedValue) {
                    overridden[prop] = computedValue;
                  }
                }
              }
            }

            return overridden;
          };

          // Main logic
          const element = document.querySelector(selector);
          if (!element) {
            throw new Error(`Element not found: ${selector}`);
          }

          const computedStyle = window.getComputedStyle(element);
          const parentElement = element.parentElement;
          const parentStyle = parentElement ? window.getComputedStyle(parentElement) : null;
          const propsToCheck = properties || Array.from(computedStyle);

          const { computed, inherited } = processComputedStyles(
            element,
            computedStyle,
            parentStyle,
            propsToCheck,
          );
          const overridden = checkOverriddenStyles(element, computedStyle);

          return { computed, inherited, overridden };
        },
        { selector: args.selector, properties: args.properties },
      )) as {
        computed: Record<string, string>;
        inherited: Record<string, string>;
        overridden: Record<string, string>;
      };

      const executionTime = Date.now() - startTime;

      ensureLogger().info("Computed styles retrieved", {
        browserId: args.browserId,
        selector: args.selector,
        computedCount: Object.keys(result.computed).length,
        inheritedCount: Object.keys(result.inherited).length,
        overriddenCount: Object.keys(result.overridden).length,
        executionTime,
      });

      return {
        success: true,
        computed: result.computed,
        inherited: result.inherited,
        overridden: result.overridden,
        selector: args.selector,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      ensureLogger().error("Failed to get computed styles", {
        browserId: args.browserId,
        selector: args.selector,
        error: errorMessage,
        executionTime,
      });

      return {
        success: false,
        computed: {},
        inherited: {},
        overridden: {},
        selector: args.selector,
        executionTime,
      };
    }
  }

  /**
   * Diff CSS styles to track changes
   * Essential for validating UX modifications
   */
  async diffCSS(page: Page, args: DiffCSSArgs): Promise<DiffCSSResult> {
    try {
      ensureLogger().info("Diffing CSS", {
        browserId: args.browserId,
        selector: args.selector,
        baselineCount: Object.keys(args.baseline).length,
      });

      // Extract current styles
      const current = await this.extractCSS(page, {
        browserId: args.browserId,
        selector: args.selector,
        includeComputed: true,
        timeout: args.timeout,
      });

      if (!current.success) {
        return {
          success: false,
          added: {},
          modified: {},
          removed: [],
          selector: args.selector,
        };
      }

      const added: Record<string, string> = {};
      const modified: Record<string, { old: string; new: string }> = {};
      const removed: string[] = [];

      // Find added and modified properties
      for (const [prop, value] of Object.entries(current.styles)) {
        if (!(prop in args.baseline)) {
          added[prop] = value;
        } else if (args.baseline[prop] !== value) {
          modified[prop] = {
            old: args.baseline[prop] || "",
            new: value,
          };
        }
      }

      // Find removed properties
      for (const prop of Object.keys(args.baseline)) {
        if (!(prop in current.styles)) {
          removed.push(prop);
        }
      }

      ensureLogger().info("CSS diff completed", {
        browserId: args.browserId,
        selector: args.selector,
        addedCount: Object.keys(added).length,
        modifiedCount: Object.keys(modified).length,
        removedCount: removed.length,
      });

      return {
        success: true,
        added,
        modified,
        removed,
        selector: args.selector,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      ensureLogger().error("CSS diff failed", {
        browserId: args.browserId,
        selector: args.selector,
        error: errorMessage,
      });

      return {
        success: false,
        added: {},
        modified: {},
        removed: [],
        selector: args.selector,
      };
    }
  }

  /**
   * Analyze CSS specificity to debug cascade issues
   * Helps understand why certain styles aren't applying
   */
  async analyzeSpecificity(
    page: Page,
    args: AnalyzeSpecificityArgs,
  ): Promise<AnalyzeSpecificityResult> {
    const _timeout = args.timeout || this.defaultTimeout;

    try {
      ensureLogger().info("Analyzing CSS specificity", {
        browserId: args.browserId,
        selector: args.selector,
      });

      const result = (await page.evaluate(
        ({ selector }) => {
          // Helper: Calculate CSS specificity
          const calculateSpecificity = (sel: string): [number, number, number, number] => {
            const inline = 0; // Would be 1 for inline styles
            const ids = (sel.match(/#[\w-]+/g) || []).length;
            const classes =
              (sel.match(/\.[\w-]+/g) || []).length +
              (sel.match(/\[[\w-]+/g) || []).length +
              (sel.match(/:[\w-]+/g) || []).length;
            const elements = (sel.match(/^[a-z]+|[\s>+~][a-z]+/gi) || []).length;

            return [inline, ids, classes, elements];
          };

          // Helper: Extract properties from CSS style rule
          const extractRuleProperties = (rule: CSSStyleRule): Record<string, string> => {
            const properties: Record<string, string> = {};
            for (let i = 0; i < rule.style.length; i++) {
              const prop = rule.style[i];
              if (prop) {
                properties[prop] = rule.style.getPropertyValue(prop);
              }
            }
            return properties;
          };

          // Helper: Process stylesheet rules
          const processStylesheetRules = (element: Element, rules: SpecificityRule[]) => {
            for (const sheet of Array.from(document.styleSheets)) {
              try {
                const cssRules = sheet.cssRules || sheet.rules;

                for (const rule of Array.from(cssRules)) {
                  if (rule instanceof CSSStyleRule && element.matches(rule.selectorText)) {
                    rules.push({
                      selector: rule.selectorText,
                      specificity: calculateSpecificity(rule.selectorText),
                      properties: extractRuleProperties(rule),
                      source: sheet.href || "inline-stylesheet",
                    });
                  }
                }
              } catch (_e) {
                // Ignore CORS errors for stylesheets
              }
            }
          };

          // Helper: Add inline styles
          const addInlineStyles = (element: Element, rules: SpecificityRule[]) => {
            if (element instanceof HTMLElement && element.style.cssText) {
              const inlineProps: Record<string, string> = {};

              for (let i = 0; i < element.style.length; i++) {
                const prop = element.style[i];
                if (prop) {
                  inlineProps[prop] = element.style.getPropertyValue(prop);
                }
              }

              if (Object.keys(inlineProps).length > 0) {
                rules.push({
                  selector: "inline-style",
                  specificity: [1, 0, 0, 0], // Inline styles have highest specificity
                  properties: inlineProps,
                  source: "inline",
                });
              }
            }
          };

          // Helper: Sort rules by specificity
          const sortBySpecificity = (rules: SpecificityRule[]) => {
            rules.sort((a, b) => {
              for (let i = 0; i < 4; i++) {
                const aSpec = a.specificity?.[i] ?? 0;
                const bSpec = b.specificity?.[i] ?? 0;
                if (aSpec !== bSpec) {
                  return bSpec - aSpec;
                }
              }
              return 0;
            });
          };

          // Main logic
          const element = document.querySelector(selector);
          if (!element) {
            throw new Error(`Element not found: ${selector}`);
          }

          const rules: SpecificityRule[] = [];

          processStylesheetRules(element, rules);
          addInlineStyles(element, rules);
          sortBySpecificity(rules);

          return {
            rules,
            winningRule: rules.length > 0 ? rules[0] : null,
          };
        },
        { selector: args.selector },
      )) as { rules: SpecificityRule[]; winningRule: SpecificityRule | null };

      ensureLogger().info("Specificity analysis completed", {
        browserId: args.browserId,
        selector: args.selector,
        ruleCount: result.rules.length,
        winner: result.winningRule?.selector,
      });

      return {
        success: true,
        rules: result.rules,
        winningRule: result.winningRule,
        selector: args.selector,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      ensureLogger().error("Specificity analysis failed", {
        browserId: args.browserId,
        selector: args.selector,
        error: errorMessage,
      });

      return {
        success: false,
        rules: [],
        winningRule: null,
        selector: args.selector,
      };
    }
  }

  /**
   * Batch extract CSS for multiple selectors
   * Optimized for performance when checking multiple elements
   */
  async batchExtractCSS(page: Page, args: BatchExtractCSSArgs): Promise<BatchExtractCSSResult> {
    const startTime = Date.now();

    try {
      ensureLogger().info("Batch extracting CSS", {
        browserId: args.browserId,
        selectorCount: args.selectors.length,
      });

      // Execute all extractions in parallel for speed
      const promises = args.selectors.map((selector) =>
        this.extractCSS(page, {
          browserId: args.browserId,
          selector,
          includeComputed: args.includeComputed,
          timeout: args.timeout,
        }),
      );

      const results = await Promise.all(promises);

      // Map results to selectors
      const resultMap: Record<string, ExtractCSSResult> = {};
      args.selectors.forEach((selector, index) => {
        const result = results[index];
        if (result) {
          resultMap[selector] = result;
        }
      });

      const executionTime = Date.now() - startTime;

      ensureLogger().info("Batch CSS extraction completed", {
        browserId: args.browserId,
        selectorCount: args.selectors.length,
        executionTime,
      });

      return {
        success: true,
        results: resultMap,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      ensureLogger().error("Batch CSS extraction failed", {
        browserId: args.browserId,
        error: errorMessage,
        executionTime,
      });

      return {
        success: false,
        results: {},
        executionTime,
      };
    }
  }

  /**
   * Convert styles object to CSS text
   */
  private stylesToCSSText(styles: Record<string, string>): string {
    return Object.entries(styles)
      .map(([prop, value]) => `${prop}: ${value};`)
      .join(" ");
  }

  /**
   * Clear style cache for a browser
   */
  clearCache(browserId?: string): void {
    if (browserId) {
      // Clear cache for specific browser
      const keysToDelete: string[] = [];
      for (const key of this.styleCache.keys()) {
        if (key.startsWith(`${browserId}-`)) {
          keysToDelete.push(key);
        }
      }
      for (const key of keysToDelete) {
        this.styleCache.delete(key);
      }
    } else {
      // Clear all cache
      this.styleCache.clear();
    }

    ensureLogger().info("Style cache cleared", { browserId });
  }
}
