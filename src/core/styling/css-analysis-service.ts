/**
 * CSS Analysis Service for Brooklyn MCP Server
 * Enables AI to understand and analyze web page styling
 * Critical for rapid UX iteration - understand styles in <1 second
 */

import type { Page } from "playwright";
import { getLogger } from "../../shared/pino-logger.js";
import { TokenizerService } from "../tokenizer-service.js";

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
  maxTokens?: number; // Maximum tokens to return (default: 10000)
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

  // NEW: Response size control
  conflictsOnly?: boolean; // Only show conflicting rules (DEFAULT: true)
  properties?: string[]; // Filter to specific CSS properties
  maxRules?: number; // Limit rules returned (DEFAULT: 10)
  summarize?: boolean; // Summary vs detailed analysis (DEFAULT: true)

  // NEW: Analysis scope
  includeInherited?: boolean; // Include inherited rules (DEFAULT: false)
  pseudoElements?: string[]; // Analyze :hover, :focus, etc.
}

// Specificity rule
export interface SpecificityRule {
  selector: string;
  specificity: [number, number, number, number]; // [inline, id, class, element]
  properties: Record<string, string>;
  source: string;
}

// Specificity conflict
export interface SpecificityConflict {
  property: string;
  winningRule: { selector: string; specificity: [number, number, number, number]; value: string };
  overriddenRules: Array<{
    selector: string;
    specificity: [number, number, number, number];
    value: string;
  }>;
  reason: string; // "Higher specificity" | "Source order" | "!important"
}

// Specificity analysis result
export interface AnalyzeSpecificityResult {
  success: boolean;
  selector: string;

  // Focused response structure
  summary: {
    totalRules: number;
    conflicts: number;
    highestSpecificity: [number, number, number, number];
    appliedRule: string;
  };

  conflicts?: SpecificityConflict[]; // Only when conflicts exist
  rules?: SpecificityRule[]; // Limited by maxRules
  recommendations?: string[]; // AI-actionable advice

  executionTime: number;
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
  private readonly tokenizerService = new TokenizerService();

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

      // Apply token limits if specified
      const maxTokens = args.maxTokens || 10000;
      let cssText = this.stylesToCSSText(result.styles);

      // Count tokens
      const tokenResult = this.tokenizerService.countTokens(cssText);
      const tokenCount = tokenResult.tokens;

      // If over limit, try to reduce by filtering properties
      if (tokenCount > maxTokens) {
        ensureLogger().warn("CSS extraction exceeds token limit", {
          browserId: args.browserId,
          selector: args.selector,
          tokenCount,
          maxTokens,
        });

        // Try to reduce by keeping only essential properties
        const essentialProps = [
          "display",
          "position",
          "width",
          "height",
          "margin",
          "padding",
          "color",
          "background",
          "background-color",
          "font-size",
          "font-family",
          "border",
          "opacity",
          "visibility",
          "z-index",
          "overflow",
          "flex",
          "grid",
          "transform",
          "transition",
        ];

        const filteredStyles: Record<string, string> = {};
        for (const prop of essentialProps) {
          if (result.styles[prop]) {
            filteredStyles[prop] = result.styles[prop];
          }
        }

        cssText = this.stylesToCSSText(filteredStyles);
        const filteredTokenResult = this.tokenizerService.countTokens(cssText);
        const filteredTokenCount = filteredTokenResult.tokens;

        if (filteredTokenCount > maxTokens) {
          // Still too large, return error
          throw new Error(
            `CSS extraction exceeds token limit: ${filteredTokenCount} > ${maxTokens}. Use properties parameter to filter specific properties.`,
          );
        }

        result.styles = filteredStyles;
        ensureLogger().info("CSS filtered to essential properties", {
          browserId: args.browserId,
          selector: args.selector,
          originalCount: Object.keys(result.styles).length,
          filteredCount: Object.keys(filteredStyles).length,
          tokenCount: filteredTokenCount,
        });
      }

      const executionTime = Date.now() - startTime;

      ensureLogger().info("CSS extracted successfully", {
        browserId: args.browserId,
        selector: args.selector,
        propertyCount: Object.keys(result.styles).length,
        tokenCount: this.tokenizerService.countTokens(cssText).tokens,
        executionTime,
      });

      return {
        success: true,
        styles: result.styles,
        cssText,
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
   * Generate AI-actionable recommendations based on analysis results
   */
  private generateRecommendations(result: {
    conflicts: Array<{
      property: string;
      winningRule: { selector: string; specificity: [number, number, number, number] };
      reason: string;
    }>;
    highestSpecificity: [number, number, number, number];
    totalRules: number;
  }): string[] {
    const recommendations: string[] = [];

    if (result.conflicts.length > 0) {
      for (const conflict of result.conflicts) {
        if (conflict.reason === "Higher specificity" && conflict.winningRule.specificity[1] > 0) {
          recommendations.push(
            `Consider reducing specificity for ${conflict.winningRule.selector} to make styles more maintainable`,
          );
        }
        if (conflict.reason === "!important") {
          recommendations.push(
            `Avoid !important for ${conflict.property}. Use specific selectors instead`,
          );
        }
        if (conflict.reason === "Source order") {
          recommendations.push(
            `${conflict.property} is determined by source order. Consider more specific selectors`,
          );
        }
      }
    }

    if (result.highestSpecificity[1] > 2) {
      recommendations.push("Consider using CSS custom properties for theme consistency");
    }

    if (result.totalRules > 10) {
      recommendations.push(
        "Many rules apply to this element. Consider component-based CSS organization",
      );
    }

    return recommendations;
  }

  /**
   * Build the response object based on analysis options
   */
  private buildSpecificityResponse(
    args: AnalyzeSpecificityArgs,
    result: {
      rules: SpecificityRule[];
      conflicts: Array<{
        property: string;
        winningRule: {
          selector: string;
          specificity: [number, number, number, number];
          value: string;
        };
        overriddenRules: Array<{
          selector: string;
          specificity: [number, number, number, number];
          value: string;
        }>;
        reason: string;
      }>;
      totalRules: number;
      highestSpecificity: [number, number, number, number];
      appliedRule: string;
    },
    executionTime: number,
    recommendations: string[],
  ): AnalyzeSpecificityResult {
    const conflictsOnly = args.conflictsOnly ?? true;
    const maxRules = args.maxRules ?? 10;
    const summarize = args.summarize ?? true;

    const response: AnalyzeSpecificityResult = {
      success: true,
      selector: args.selector,
      summary: {
        totalRules: result.totalRules,
        conflicts: result.conflicts.length,
        highestSpecificity: result.highestSpecificity,
        appliedRule: result.appliedRule,
      },
      executionTime,
    };

    // Add conflicts if they exist (always include when present, regardless of conflictsOnly)
    if (result.conflicts.length > 0) {
      response.conflicts = result.conflicts;
    }

    // Add limited rules if detailed analysis requested (not summary-only)
    if (!(summarize && conflictsOnly)) {
      response.rules = result.rules.slice(0, maxRules);
    }

    // Add recommendations
    if (recommendations.length > 0) {
      response.recommendations = recommendations;
    }

    return response;
  }

  /**
   * Analyze CSS specificity to debug cascade issues
   * Enhanced with conflict detection and AI-friendly responses
   */
  async analyzeSpecificity(
    page: Page,
    args: AnalyzeSpecificityArgs,
  ): Promise<AnalyzeSpecificityResult> {
    const startTime = Date.now();
    const _timeout = args.timeout || this.defaultTimeout;

    // Set defaults for enhanced options
    const conflictsOnly = args.conflictsOnly ?? true;
    const maxRules = args.maxRules ?? 10;
    const summarize = args.summarize ?? true;
    const includeInherited = args.includeInherited ?? false;

    try {
      ensureLogger().info("Analyzing CSS specificity (enhanced)", {
        browserId: args.browserId,
        selector: args.selector,
        conflictsOnly,
        maxRules,
        summarize,
        properties: args.properties?.length,
      });

      const result = (await page.evaluate(
        ({ selector, properties, includeInherited: _includeInherited, pseudoElements }) => {
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

          // Helper: Check if selector has !important
          const hasImportant = (value: string): boolean => {
            return value.includes("!important");
          };

          // Helper: Extract properties from CSS style rule
          const extractRuleProperties = (
            rule: CSSStyleRule,
            propertyFilter?: string[],
          ): Record<string, string> => {
            const properties: Record<string, string> = {};
            for (let i = 0; i < rule.style.length; i++) {
              const prop = rule.style[i];
              if (prop && (!propertyFilter || propertyFilter.includes(prop))) {
                properties[prop] = rule.style.getPropertyValue(prop);
              }
            }
            return properties;
          };

          // Helper: Process a single stylesheet
          const processStylesheet = (
            sheet: CSSStyleSheet,
            element: Element,
            rules: SpecificityRule[],
            propertyFilter?: string[],
          ) => {
            try {
              const cssRules = sheet.cssRules || sheet.rules;

              for (const rule of Array.from(cssRules)) {
                if (rule instanceof CSSStyleRule && element.matches(rule.selectorText)) {
                  const ruleProperties = extractRuleProperties(rule, propertyFilter);
                  if (Object.keys(ruleProperties).length > 0) {
                    rules.push({
                      selector: rule.selectorText,
                      specificity: calculateSpecificity(rule.selectorText),
                      properties: ruleProperties,
                      source: sheet.href || "inline-stylesheet",
                    });
                  }
                }
              }
            } catch (_e) {
              // Ignore CORS errors for stylesheets
            }
          };

          // Helper: Process stylesheet rules
          const processStylesheetRules = (
            element: Element,
            rules: SpecificityRule[],
            propertyFilter?: string[],
          ) => {
            for (const sheet of Array.from(document.styleSheets)) {
              processStylesheet(sheet, element, rules, propertyFilter);
            }
          };

          // Helper: Add inline styles
          const addInlineStyles = (
            element: Element,
            rules: SpecificityRule[],
            propertyFilter?: string[],
          ) => {
            if (element instanceof HTMLElement && element.style.cssText) {
              const inlineProps: Record<string, string> = {};

              for (let i = 0; i < element.style.length; i++) {
                const prop = element.style[i];
                if (prop && (!propertyFilter || propertyFilter.includes(prop))) {
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

          // Helper: Add pseudo-element styles
          const addPseudoStyles = (
            element: Element,
            rules: SpecificityRule[],
            pseudoElements: string[],
            propertyFilter?: string[],
          ) => {
            for (const pseudo of pseudoElements) {
              const computedStyle = window.getComputedStyle(element, pseudo);
              const pseudoProps: Record<string, string> = {};

              const propsToCheck = propertyFilter || Array.from(computedStyle);
              for (const prop of propsToCheck) {
                const value = computedStyle.getPropertyValue(prop);
                if (value && value !== "initial" && value !== "inherit") {
                  pseudoProps[prop] = value;
                }
              }

              if (Object.keys(pseudoProps).length > 0) {
                rules.push({
                  selector: `${selector}${pseudo}`,
                  specificity: calculateSpecificity(`${selector}${pseudo}`),
                  properties: pseudoProps,
                  source: "pseudo-element",
                });
              }
            }
          };

          // Helper: Sort rules by specificity and source order
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

          // Helper: Group rules by property for conflict detection
          const groupRulesByProperty = (rules: SpecificityRule[]) => {
            const propertyMap = new Map<string, Array<{ rule: SpecificityRule; value: string }>>();

            for (const rule of rules) {
              for (const [prop, value] of Object.entries(rule.properties)) {
                if (!propertyMap.has(prop)) {
                  propertyMap.set(prop, []);
                }
                propertyMap.get(prop)?.push({ rule, value });
              }
            }

            return propertyMap;
          };

          // Helper: Sort rules by specificity and importance
          const sortRulesByPriority = (
            rulesForProperty: Array<{ rule: SpecificityRule; value: string }>,
          ) => {
            return rulesForProperty.sort((a, b) => {
              // Check for !important first
              const aImportant = hasImportant(a.value);
              const bImportant = hasImportant(b.value);
              if (aImportant !== bImportant) {
                return aImportant ? -1 : 1;
              }

              // Then by specificity
              for (let i = 0; i < 4; i++) {
                const aSpec = a.rule.specificity?.[i] ?? 0;
                const bSpec = b.rule.specificity?.[i] ?? 0;
                if (aSpec !== bSpec) {
                  return bSpec - aSpec;
                }
              }
              return 0;
            });
          };

          // Helper: Determine conflict reason
          const getConflictReason = (
            winner: { rule: SpecificityRule; value: string },
            firstOverridden?: { rule: SpecificityRule; value: string },
          ) => {
            if (hasImportant(winner.value)) {
              return "!important";
            }
            if (
              firstOverridden &&
              winner.rule.specificity.join() === firstOverridden.rule.specificity.join()
            ) {
              return "Source order";
            }
            return "Higher specificity";
          };

          // Helper: Detect conflicts between rules (with limits to prevent token overrun)
          const detectConflicts = (rules: SpecificityRule[]) => {
            const conflicts: Array<{
              property: string;
              winningRule: {
                selector: string;
                specificity: [number, number, number, number];
                value: string;
              };
              overriddenRules: Array<{
                selector: string;
                specificity: [number, number, number, number];
                value: string;
              }>;
              reason: string;
            }> = [];

            const propertyMap = groupRulesByProperty(rules);

            // Find conflicts for each property
            for (const [property, rulesForProperty] of propertyMap) {
              if (rulesForProperty.length > 1) {
                const sortedRules = sortRulesByPriority(rulesForProperty);
                const winner = sortedRules[0];
                const overridden = sortedRules.slice(1);

                if (winner && overridden.length > 0) {
                  const reason = getConflictReason(winner, overridden[0]);

                  conflicts.push({
                    property,
                    winningRule: {
                      selector: winner.rule.selector,
                      specificity: winner.rule.specificity,
                      value: winner.value,
                    },
                    overriddenRules: overridden.map((o) => ({
                      selector: o.rule.selector,
                      specificity: o.rule.specificity,
                      value: o.value,
                    })),
                    reason,
                  });
                }
              }
            }

            return conflicts;
          };

          // Main logic
          const element = document.querySelector(selector);
          if (!element) {
            throw new Error(`Element not found: ${selector}`);
          }

          const rules: SpecificityRule[] = [];

          processStylesheetRules(element, rules, properties);
          addInlineStyles(element, rules, properties);

          if (pseudoElements && pseudoElements.length > 0) {
            addPseudoStyles(element, rules, pseudoElements, properties);
          }

          sortBySpecificity(rules);
          const allConflicts = detectConflicts(rules);

          // Apply limits inside browser evaluation to prevent token overrun
          const limitedRules = rules.slice(0, 10); // Hard limit to prevent massive responses
          const limitedConflicts = allConflicts.slice(0, 5); // Limit conflicts too

          return {
            rules: limitedRules,
            conflicts: limitedConflicts,
            totalRules: rules.length,
            highestSpecificity:
              rules.length > 0 ? rules[0]?.specificity || [0, 0, 0, 0] : [0, 0, 0, 0],
            appliedRule: rules.length > 0 ? rules[0]?.selector || "none" : "none",
          };
        },
        {
          selector: args.selector,
          properties: args.properties,
          includeInherited,
          pseudoElements: args.pseudoElements || [],
        },
      )) as {
        rules: SpecificityRule[];
        conflicts: Array<{
          property: string;
          winningRule: {
            selector: string;
            specificity: [number, number, number, number];
            value: string;
          };
          overriddenRules: Array<{
            selector: string;
            specificity: [number, number, number, number];
            value: string;
          }>;
          reason: string;
        }>;
        totalRules: number;
        highestSpecificity: [number, number, number, number];
        appliedRule: string;
      };

      const executionTime = Date.now() - startTime;

      // Generate AI-actionable recommendations
      const recommendations = this.generateRecommendations(result);

      // Build response based on options
      const response = this.buildSpecificityResponse(args, result, executionTime, recommendations);

      ensureLogger().info("Enhanced specificity analysis completed", {
        browserId: args.browserId,
        selector: args.selector,
        totalRules: result.totalRules,
        conflicts: result.conflicts.length,
        appliedRule: result.appliedRule,
        executionTime,
      });

      return response;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      ensureLogger().error("Enhanced specificity analysis failed", {
        browserId: args.browserId,
        selector: args.selector,
        error: errorMessage,
        executionTime,
      });

      return {
        success: false,
        selector: args.selector,
        summary: {
          totalRules: 0,
          conflicts: 0,
          highestSpecificity: [0, 0, 0, 0],
          appliedRule: "none",
        },
        executionTime,
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
