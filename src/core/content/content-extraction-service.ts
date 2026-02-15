/**
 * Content Extraction Service for Phase 1C tools
 * Provides DOM content extraction, attribute inspection, and element state checking
 */

import type { Page } from "playwright";
import { type TokenizerModel, tokenizerService } from "../tokenizer-service.js";

export interface GetHtmlArgs {
  browserId: string;
  selector?: string;
  includeStyles?: boolean;
  prettify?: boolean;
  timeout?: number;
  maxTokens?: number;
  clientModel?: TokenizerModel;
}

export interface GetHtmlResult {
  success: boolean;
  html: string;
  source: string;
  length: number;
  computedStyles?: Record<string, unknown>;
}

export interface GetAttributeArgs {
  browserId: string;
  selector: string;
  attribute?: string;
  timeout?: number;
}

export interface GetAttributeResult {
  success: boolean;
  selector: string;
  attribute?: string;
  value?: string | null;
  exists?: boolean;
  attributes?: Record<string, string>;
}

export interface GetBoundingBoxArgs {
  browserId: string;
  selector: string;
  includeViewport?: boolean;
  timeout?: number;
}

export interface GetBoundingBoxResult {
  success: boolean;
  selector: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  viewport?: {
    x: number;
    y: number;
    visible: boolean;
  };
  center?: {
    x: number;
    y: number;
  };
}

export interface IsVisibleArgs {
  browserId: string;
  selector: string;
  timeout?: number;
}

export interface IsVisibleResult {
  success: boolean;
  selector: string;
  visible: boolean;
  inViewport: boolean;
  opacity: number;
  display: string;
}

export interface IsEnabledArgs {
  browserId: string;
  selector: string;
  timeout?: number;
}

export interface IsEnabledResult {
  success: boolean;
  selector: string;
  enabled: boolean;
  disabled: boolean;
  readonly: boolean;
  interactive: boolean;
}

export interface ExtractTableDataArgs {
  browserId: string;
  selector: string;
  format?: "json" | "csv";
  timeout?: number;
}

export interface ExtractTableDataResult {
  success: boolean;
  headers: string[];
  data: Record<string, string>[];
  rows: number;
  columns: number;
  selector: string;
  format: "json" | "csv";
  csv?: string;
}

export interface DescribeHtmlArgs {
  browserId: string;
  maxDepth?: number;
  timeout?: number;
  clientModel?: TokenizerModel;
}

export interface PageSection {
  selector: string;
  size: string;
  elements: number;
  description: string;
  sizeBytes: number;
}

export interface FormInfo {
  selector: string;
  inputs: number;
  description: string;
  hasPassword?: boolean;
  hasSubmit?: boolean;
}

export interface DescribeHtmlResult {
  success: boolean;
  pageStats: {
    totalSize: string;
    totalChars: number;
    domDepth: number;
    totalElements: number;
    tokenEstimate: number;
    tokenMethod: string;
  };
  structure: {
    sections: PageSection[];
    forms: FormInfo[];
    media: {
      images: number;
      videos: number;
      iframes: number;
    };
  };
  interactiveElements: {
    buttons: number;
    links: number;
    inputs: number;
    selects: number;
    textareas: number;
  };
  recommendations: string[];
}

export class ContentExtractionService {
  /**
   * Extract HTML content from page or specific element
   */
  async getHtml(page: Page, args: GetHtmlArgs): Promise<GetHtmlResult> {
    const {
      selector,
      includeStyles = false,
      prettify = true,
      timeout = 5000,
      maxTokens,
      clientModel = "default",
    } = args;

    // Use provided limit or get recommended limit for the model
    const tokenLimit = maxTokens || tokenizerService.getRecommendedLimit(clientModel);

    // Also enforce byte size limits as a safety net
    const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB absolute max
    const MAX_SIZE_CHARS = 1000000; // 1M chars absolute max

    try {
      let html: string;
      let source: string;
      let computedStyles: Record<string, unknown> | undefined;

      if (selector) {
        // Extract specific element HTML
        await page.waitForSelector(selector, { timeout });
        const element = await page.locator(selector).first();

        html = await element.innerHTML();
        source = selector;

        if (includeStyles) {
          computedStyles = await element.evaluate((el) => {
            const styles = window.getComputedStyle(el);
            const styleObj: Record<string, string> = {};
            for (let i = 0; i < styles.length; i++) {
              const prop = styles[i];
              if (prop) {
                styleObj[prop] = styles.getPropertyValue(prop);
              }
            }
            return styleObj;
          });
        }

        // Add outer element tag
        const outerHTML = await element.evaluate((el) => el.outerHTML);
        html = outerHTML;
      } else {
        // Extract full page HTML
        html = await page.content();
        source = "full-page";
      }

      // Check token limits using actual tokenizer
      const tokenCount = tokenizerService.countTokens(html, clientModel);

      // Check both token and size limits
      if (tokenCount.tokens > tokenLimit) {
        const error = new Error("Content exceeds token limit") as Error & {
          code?: string;
          details?: unknown;
          guidance?: string;
          alternatives?: string[];
        };
        error.code = "TOKEN_LIMIT_EXCEEDED";
        error.details = {
          tokens: tokenCount.tokens,
          maxTokens: tokenLimit,
          method: tokenCount.method,
          model: clientModel,
          sizeBytes: tokenCount.byteCount,
          sizeChars: tokenCount.characterCount,
          selector: selector || null,
          source,
        };
        error.guidance = `Content has ${tokenCount.tokens.toLocaleString()} tokens (limit: ${tokenLimit.toLocaleString()}). Use 'describe_html' to analyze structure, then extract specific sections.`;
        error.alternatives = [
          "describe_html() - Get page structure overview without content",
          "get_html({ selector: 'main' }) - Extract main content only",
          "get_html({ selector: 'article' }) - Extract article content",
          `get_html({ maxTokens: ${Math.floor(tokenLimit * 1.5)} }) - Increase token limit`,
          "find_elements() - List elements without content",
        ];
        throw error;
      }

      // Also check absolute size limits for safety
      if (tokenCount.byteCount > MAX_SIZE_BYTES || tokenCount.characterCount > MAX_SIZE_CHARS) {
        const error = new Error("Content exceeds absolute size limit") as Error & {
          code?: string;
          details?: unknown;
          guidance?: string;
          alternatives?: string[];
        };
        error.code = "SIZE_LIMIT_EXCEEDED";
        error.details = {
          tokens: tokenCount.tokens,
          sizeBytes: tokenCount.byteCount,
          sizeChars: tokenCount.characterCount,
          maxBytes: MAX_SIZE_BYTES,
          maxChars: MAX_SIZE_CHARS,
          sizeMB: (tokenCount.byteCount / (1024 * 1024)).toFixed(2),
        };
        error.guidance = "Content too large even with increased token limits. Must use selectors.";
        error.alternatives = [
          "describe_html() - Analyze structure first",
          "get_html({ selector: 'main' }) - Extract specific section",
        ];
        throw error;
      }

      // Prettify HTML if requested
      if (prettify && html) {
        // Basic HTML prettification
        html = html
          .replace(/></g, ">\n<")
          .replace(/^\s*\n/gm, "")
          .split("\n")
          .map((line, _index) => {
            const depth = (line.match(/^<[^/]/g) || []).length - (line.match(/<\//g) || []).length;
            return "  ".repeat(Math.max(0, depth)) + line.trim();
          })
          .join("\n");
      }

      return {
        success: true,
        html,
        source,
        length: html.length,
        computedStyles,
      };
    } catch (error) {
      throw new Error(
        `Failed to extract HTML: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Get attribute value(s) from an element
   */
  async getAttribute(page: Page, args: GetAttributeArgs): Promise<GetAttributeResult> {
    const { selector, attribute, timeout = 5000 } = args;

    try {
      await page.waitForSelector(selector, { timeout });
      const element = await page.locator(selector).first();

      if (attribute) {
        // Get specific attribute
        const value = await element.getAttribute(attribute);
        return {
          success: true,
          selector,
          attribute,
          value,
          exists: value !== null,
        };
      }

      // Get all attributes
      const attributes = await element.evaluate((el) => {
        const attrs: Record<string, string> = {};
        for (let i = 0; i < el.attributes.length; i++) {
          const attr = el.attributes[i];
          if (attr) {
            attrs[attr.name] = attr.value;
          }
        }
        return attrs;
      });

      return {
        success: true,
        selector,
        attributes,
      };
    } catch (error) {
      throw new Error(
        `Failed to get attribute: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Get element geometry and positioning information
   */
  async getBoundingBox(page: Page, args: GetBoundingBoxArgs): Promise<GetBoundingBoxResult> {
    const { selector, includeViewport = true, timeout = 5000 } = args;

    try {
      await page.waitForSelector(selector, { timeout });
      const element = await page.locator(selector).first();

      const box = await element.boundingBox();
      if (!box) {
        throw new Error("Element has no bounding box (may be hidden)");
      }

      const result: GetBoundingBoxResult = {
        success: true,
        selector,
        boundingBox: box,
      };

      if (includeViewport) {
        const viewport = page.viewportSize() || { width: 0, height: 0 };
        const viewportX = box.x;
        const viewportY = box.y;
        const visible =
          viewportX >= 0 &&
          viewportY >= 0 &&
          viewportX < viewport.width &&
          viewportY < viewport.height;

        result.viewport = {
          x: viewportX,
          y: viewportY,
          visible,
        };
      }

      // Calculate center point
      result.center = {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
      };

      return result;
    } catch (error) {
      throw new Error(
        `Failed to get bounding box: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Check if an element is visible in the viewport
   */
  async isVisible(page: Page, args: IsVisibleArgs): Promise<IsVisibleResult> {
    const { selector, timeout = 5000 } = args;

    try {
      await page.waitForSelector(selector, { timeout });
      const element = await page.locator(selector).first();

      const [visible, inViewport, opacity, display] = await element.evaluate((el) => {
        const styles = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        const isVisible =
          styles.display !== "none" && styles.visibility !== "hidden" && styles.opacity !== "0";

        const isInViewport =
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= window.innerHeight &&
          rect.right <= window.innerWidth;

        return [isVisible, isInViewport, Number.parseFloat(styles.opacity), styles.display];
      });

      return {
        success: true,
        selector,
        visible,
        inViewport,
        opacity,
        display,
      };
    } catch (error) {
      throw new Error(
        `Failed to check visibility: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Check if an element is enabled and interactive
   */
  async isEnabled(page: Page, args: IsEnabledArgs): Promise<IsEnabledResult> {
    const { selector, timeout = 5000 } = args;

    try {
      await page.waitForSelector(selector, { timeout });
      const element = await page.locator(selector).first();

      const [disabled, readonly, interactive] = await element.evaluate((el) => {
        const isDisabled =
          el.hasAttribute("disabled") || (el as HTMLInputElement).disabled === true;

        const isReadonly =
          el.hasAttribute("readonly") || (el as HTMLInputElement).readOnly === true;

        const isInteractive = !(isDisabled || isReadonly) && el.tabIndex >= 0;

        return [isDisabled, isReadonly, isInteractive];
      });

      return {
        success: true,
        selector,
        enabled: !disabled,
        disabled,
        readonly,
        interactive,
      };
    } catch (error) {
      throw new Error(
        `Failed to check enabled state: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Describe HTML structure without extracting content
   * Provides page analysis to prevent token overflow
   */
  async describeHtml(page: Page, args: DescribeHtmlArgs): Promise<DescribeHtmlResult> {
    try {
      // Analyze page structure
      const pageAnalysis = await page.evaluate(() => {
        // Helper to get size in bytes
        const getSizeBytes = (text: string): number => {
          return new TextEncoder().encode(text).length;
        };

        // Helper to format size
        const formatSize = (bytes: number): string => {
          if (bytes < 1024) return `${bytes}B`;
          if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
          return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
        };

        // Helper to calculate DOM depth
        const calculateDepth = (element: Element, currentDepth = 0): number => {
          if (!element.children.length) return currentDepth;
          let maxDepth = currentDepth;
          for (let i = 0; i < element.children.length; i++) {
            const child = element.children[i];
            if (child) {
              maxDepth = Math.max(maxDepth, calculateDepth(child, currentDepth + 1));
            }
          }
          return maxDepth;
        };

        // Get page HTML for size calculation
        const fullHtml = document.documentElement.outerHTML;
        const totalSize = getSizeBytes(fullHtml);
        const totalChars = fullHtml.length;

        // Analyze main sections
        const sections: Array<{
          selector: string;
          size: string;
          elements: number;
          description: string;
          sizeBytes: number;
        }> = [];

        // Common page sections to analyze
        const sectionSelectors = [
          { selector: "header", description: "Site header and navigation" },
          { selector: "nav", description: "Navigation elements" },
          { selector: "main", description: "Main content area" },
          { selector: "article", description: "Article content" },
          { selector: "aside", description: "Sidebar content" },
          { selector: "footer", description: "Site footer" },
          { selector: ".content", description: "Content container" },
          { selector: "#content", description: "Content by ID" },
        ];

        for (const { selector, description } of sectionSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            const html = element.outerHTML;
            const size = new TextEncoder().encode(html).length;
            const elementCount = element.querySelectorAll("*").length;
            sections.push({
              selector,
              size: formatSize(size),
              elements: elementCount,
              description,
              sizeBytes: getSizeBytes(html),
            });
          }
        }

        // Analyze forms
        const forms = Array.from(document.querySelectorAll("form")).map((form, index) => {
          const inputs = form.querySelectorAll("input, select, textarea").length;
          const hasPassword = !!form.querySelector("input[type='password']");
          const hasSubmit = !!form.querySelector("button[type='submit'], input[type='submit']");
          const id = form.id || `form-${index}`;
          return {
            selector: form.id ? `#${form.id}` : `form:nth-of-type(${index + 1})`,
            inputs,
            description: `Form: ${id}`,
            hasPassword,
            hasSubmit,
          };
        });

        // Count media elements
        const media = {
          images: document.querySelectorAll("img").length,
          videos: document.querySelectorAll("video").length,
          iframes: document.querySelectorAll("iframe").length,
        };

        // Count interactive elements
        const interactiveElements = {
          buttons: document.querySelectorAll("button").length,
          links: document.querySelectorAll("a").length,
          inputs: document.querySelectorAll("input").length,
          selects: document.querySelectorAll("select").length,
          textareas: document.querySelectorAll("textarea").length,
        };

        // Calculate DOM statistics
        const totalElements = document.querySelectorAll("*").length;
        const domDepth = calculateDepth(document.body);

        return {
          pageStats: {
            totalSize: formatSize(totalSize),
            totalChars,
            domDepth,
            totalElements,
            fullHtml, // Return the HTML for token counting in Node.js
          },
          structure: {
            sections,
            forms,
            media,
          },
          interactiveElements,
        };
      });

      // Generate recommendations based on analysis
      const recommendations: string[] = [];

      // Check if page is likely too large (>2MB is usually problematic)
      const totalSizeBytes = pageAnalysis.structure.sections.reduce(
        (sum, s) => sum + s.sizeBytes,
        0,
      );
      if (totalSizeBytes > 2 * 1024 * 1024) {
        recommendations.push(
          `Page too large (${pageAnalysis.pageStats.totalSize}). Use get_html with specific selectors.`,
        );

        // Recommend best sections to extract
        const largeSections = pageAnalysis.structure.sections
          .filter((s) => s.sizeBytes < 500000) // Sections under 500KB
          .sort((a, b) => b.elements - a.elements)
          .slice(0, 3);

        if (largeSections.length > 0) {
          recommendations.push(
            `Try extracting: ${largeSections.map((s) => `'${s.selector}' (${s.size})`).join(", ")}`,
          );
        }
      }

      if (pageAnalysis.structure.forms.length > 0) {
        recommendations.push(
          `${pageAnalysis.structure.forms.length} forms found. Use find_elements to locate form inputs.`,
        );
      }

      if (pageAnalysis.interactiveElements.buttons > 0) {
        recommendations.push(
          `${pageAnalysis.interactiveElements.buttons} buttons found. Use click_element for interaction.`,
        );
      }

      if (pageAnalysis.structure.media.iframes > 0) {
        recommendations.push(
          `${pageAnalysis.structure.media.iframes} iframes detected. Content may be isolated.`,
        );
      }

      if (pageAnalysis.pageStats.domDepth > 15) {
        recommendations.push(
          `Deep DOM structure (depth: ${pageAnalysis.pageStats.domDepth}). Consider targeting specific sections.`,
        );
      }

      // Calculate real token count using our tokenizer
      const fullHtml = pageAnalysis.pageStats.fullHtml;
      const clientModel = args.clientModel || "default";
      const tokenCount = tokenizerService.countTokens(fullHtml, clientModel);

      // Remove fullHtml from the response and add tokenEstimate
      const { fullHtml: _, ...pageStats } = pageAnalysis.pageStats;

      return {
        success: true,
        pageStats: {
          ...pageStats,
          tokenEstimate: tokenCount.tokens,
          tokenMethod: tokenCount.method,
        },
        structure: pageAnalysis.structure,
        interactiveElements: pageAnalysis.interactiveElements,
        recommendations,
      };
    } catch (error) {
      throw new Error(
        `Failed to describe HTML: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Extract structured data from an HTML table element.
   * Handles rowspan/colspan by expanding spanned cells into the grid.
   */
  async extractTableData(page: Page, args: ExtractTableDataArgs): Promise<ExtractTableDataResult> {
    const { selector, format = "json", timeout = 5000 } = args;

    try {
      await page.waitForSelector(selector, { timeout });

      const tableData = await page.evaluate((sel: string) => {
        const table = document.querySelector(sel);
        if (!table) {
          return { error: "Table element not found" };
        }

        const rows = table.querySelectorAll("tr");
        if (rows.length === 0) {
          return { headers: [] as string[], grid: [] as string[][], rowCount: 0, colCount: 0 };
        }

        const parsed = parseTableGrid(rows);
        const detected = detectHeaders(table, parsed.grid, rows);

        const colCount = Math.max(...parsed.grid.map((r) => r.length), 0);
        const headers = normalizeHeaders(detected.headers, colCount);
        const dataRows = parsed.grid.slice(detected.dataStartRow);

        return { headers, grid: dataRows, rowCount: dataRows.length, colCount };

        /* ----- helpers (scoped inside evaluate for serialization) ----- */

        function ensureRow(arr: (string | boolean)[][], idx: number): void {
          if (!arr[idx]) arr[idx] = [];
        }

        function parseTableGrid(allRows: NodeListOf<Element>) {
          const grid: string[][] = [];
          const occupied: boolean[][] = [];

          for (let r = 0; r < allRows.length; r++) {
            ensureRow(grid, r);
            ensureRow(occupied, r);
            processRow(r, allRows[r] as Element, grid, occupied);
          }
          return { grid };
        }

        function processRow(r: number, row: Element, grid: string[][], occupied: boolean[][]) {
          const cells = row.querySelectorAll("th, td");
          let cellIdx = 0;
          for (let c = 0; cellIdx < cells.length; c++) {
            while (occupied[r]?.[c]) {
              if (!grid[r]?.[c]) (grid[r] as string[])[c] = "";
              c++;
            }
            const cell = cells[cellIdx] as HTMLTableCellElement;
            const text = (cell.textContent || "").trim();
            (grid[r] as string[])[c] = text;
            markSpans(r, c, cell.rowSpan || 1, cell.colSpan || 1, text, grid, occupied);
            cellIdx++;
          }
        }

        function markSpans(
          r: number,
          c: number,
          rowSpan: number,
          colSpan: number,
          text: string,
          grid: string[][],
          occupied: boolean[][],
        ) {
          for (let rs = 0; rs < rowSpan; rs++) {
            for (let cs = 0; cs < colSpan; cs++) {
              if (rs === 0 && cs === 0) continue;
              const tr = r + rs;
              const tc = c + cs;
              ensureRow(occupied, tr);
              ensureRow(grid, tr);
              (occupied[tr] as boolean[])[tc] = true;
              (grid[tr] as string[])[tc] = text;
            }
          }
        }

        function detectHeaders(tbl: Element, grid: string[][], allRows: NodeListOf<Element>) {
          const thead = tbl.querySelector("thead");
          if (thead) {
            const headerRow = thead.querySelector("tr");
            if (headerRow) {
              return {
                headers: Array.from(headerRow.querySelectorAll("th, td")).map((c) =>
                  (c.textContent || "").trim(),
                ),
                dataStartRow: thead.querySelectorAll("tr").length,
              };
            }
          }
          if (grid[0] && (allRows[0]?.querySelectorAll("th").length ?? 0) > 0) {
            return { headers: grid[0], dataStartRow: 1 };
          }
          return { headers: [] as string[], dataStartRow: 0 };
        }

        function normalizeHeaders(hdrs: string[], colCount: number) {
          let result = hdrs;
          if (result.length === 0) {
            result = Array.from({ length: colCount }, (_, i) => `Column ${i + 1}`);
          }
          while (result.length < colCount) {
            result.push(`Column ${result.length + 1}`);
          }
          return result;
        }
      }, selector);

      if ("error" in tableData) {
        throw new Error(tableData.error as string);
      }

      const { headers, grid, rowCount, colCount } = tableData as {
        headers: string[];
        grid: string[][];
        rowCount: number;
        colCount: number;
      };

      // Convert grid rows to objects keyed by header
      const data = gridToObjects(grid, headers);

      const result: ExtractTableDataResult = {
        success: true,
        headers,
        data,
        rows: rowCount,
        columns: colCount,
        selector,
        format,
      };

      if (format === "csv") {
        result.csv = toCsv(headers, grid);
      }

      return result;
    } catch (error) {
      throw new Error(
        `Failed to extract table data: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }
}

/** Convert grid rows to array of objects keyed by header names. */
function gridToObjects(grid: string[][], headers: string[]): Record<string, string>[] {
  return grid.map((row) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      const key = headers[i] ?? `Column ${i + 1}`;
      obj[key] = row[i] ?? "";
    }
    return obj;
  });
}

/** Escape and format a value for CSV output. */
function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

/** Convert headers + grid into a CSV string. */
function toCsv(headers: string[], grid: string[][]): string {
  const lines = [headers.map(escapeCsv).join(",")];
  for (const row of grid) {
    lines.push(row.map((c) => escapeCsv(c ?? "")).join(","));
  }
  return lines.join("\n");
}
