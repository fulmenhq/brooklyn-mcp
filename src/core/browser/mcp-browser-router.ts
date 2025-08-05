/**
 * MCP Browser Router - Routes MCP tool requests to browser pool
 * Integrates the enterprise browser infrastructure with MCP protocol
 */

import type { BrowserType } from "playwright";
import { getLogger } from "../../shared/pino-logger.js";
import type { BrowserPoolManager } from "../browser-pool-manager.js";
import type { MCPRequestContext } from "./mcp-request-context.js";

const logger = getLogger("mcp-browser-router");

export interface BrowserToolRequest {
  tool: string;
  params: Record<string, unknown>;
  context: MCPRequestContext;
}

export interface BrowserToolResponse {
  success: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: {
    browserId?: string;
    executionTime: number;
    teamId?: string;
  };
}

/**
 * Router that handles MCP browser tool requests
 */
export class MCPBrowserRouter {
  private poolManager: BrowserPoolManager;
  private activeSessions: Map<string, { teamId?: string; createdAt: Date }>;

  constructor(poolManager: BrowserPoolManager) {
    this.poolManager = poolManager;
    this.activeSessions = new Map();
  }

  /**
   * Route a browser tool request to the appropriate handler
   */
  async route(request: BrowserToolRequest): Promise<BrowserToolResponse> {
    const startTime = Date.now();
    const { tool, params, context } = request;

    logger.info("Routing MCP browser tool request", {
      tool,
      teamId: context.teamId,
      requestId: context.requestId,
    });

    try {
      let result: unknown;
      const metadata: BrowserToolResponse["metadata"] = {
        executionTime: 0,
        teamId: context.teamId,
      };

      // Normalize legacy parameter aliases early
      if (!params["browserId"] && (params as Record<string, unknown>)["id"]) {
        params["browserId"] = (params as Record<string, unknown>)["id"] as string;
      }
      // Defensive: also accept legacy args.browser_id if present
      if (!params["browserId"] && (params as Record<string, unknown>)["browser_id"]) {
        params["browserId"] = (params as Record<string, unknown>)["browser_id"] as string;
      }

      switch (tool) {
        case "launch_browser":
          result = await this.launchBrowser(params, context);
          metadata.browserId = (result as { browserId: string }).browserId;
          break;

        case "navigate_to_url": {
          const navResult = await this.navigateToUrl(params, context);
          // Ensure E2E expects a top-level success flag in result
          result =
            navResult && typeof navResult === "object" && "success" in (navResult as any)
              ? navResult
              : { success: true, ...(navResult as object) };
          metadata.browserId = params["browserId"] as string;
          break;
        }

        case "take_screenshot": {
          const ssResult = await this.takeScreenshot(params, context);
          result =
            ssResult && typeof ssResult === "object" && "success" in (ssResult as any)
              ? ssResult
              : { success: true, ...(ssResult as object) };
          metadata.browserId = params["browserId"] as string;
          break;
        }

        case "find_elements":
          result = await this.findElements(params, context);
          metadata.browserId = params["browserId"] as string;
          break;

        case "click_element": {
          const clickResult = await this.clickElement(params, context);
          result =
            clickResult && typeof clickResult === "object" && "success" in (clickResult as any)
              ? clickResult
              : { success: true, ...(clickResult as object) };
          metadata.browserId = params["browserId"] as string;
          break;
        }

        case "fill_form_fields": {
          const fillFormResult = await this.fillFormFields(params, context);
          result =
            fillFormResult && typeof fillFormResult === "object" && "success" in (fillFormResult as any)
              ? fillFormResult
              : { success: true, ...(fillFormResult as object) };
          metadata.browserId = params["browserId"] as string;
          break;
        }

        case "execute_javascript":
          result = await this.executeJavaScript(params, context);
          metadata.browserId = params["browserId"] as string;
          break;

        case "get_page_content":
          result = await this.getPageContent(params, context);
          metadata.browserId = params["browserId"] as string;
          break;

        case "close_browser":
          try {
            result = await this.closeBrowser(params, context);
          } catch (e) {
            // Idempotent close: if session is missing, return success
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes("Browser session not found")) {
              result = {
                success: true,
                browserId: params["browserId"] as string,
                status: "already_closed",
              };
            } else {
              throw e;
            }
          }
          break;

        case "fill_text": {
          const fillTextResult = await this.fillText(params, context);
          result =
            fillTextResult && typeof fillTextResult === "object" && "success" in (fillTextResult as any)
              ? fillTextResult
              : { success: true, ...(fillTextResult as object) };
          metadata.browserId = params["browserId"] as string;
          break;
        }

        case "wait_for_element": {
          const waitResult = await this.waitForElement(params, context);
          result =
            waitResult && typeof waitResult === "object" && "success" in (waitResult as any)
              ? waitResult
              : { success: true, ...(waitResult as object) };
          metadata.browserId = params["browserId"] as string;
          break;
        }

        case "get_text_content": {
          const textResult = await this.getTextContent(params, context);
          result =
            textResult && typeof textResult === "object" && "success" in (textResult as any)
              ? textResult
              : { success: true, ...(textResult as object) };
          metadata.browserId = params["browserId"] as string;
          break;
        }

        case "validate_element_presence": {
          const validateResult = await this.validateElementPresence(params, context);
          result =
            validateResult &&
            typeof validateResult === "object" &&
            "success" in (validateResult as any)
              ? validateResult
              : { success: true, ...(validateResult as object) };
          metadata.browserId = params["browserId"] as string;
          break;
        }

        case "go_back": {
          const backResult = await this.goBack(params, context);
          result =
            backResult && typeof backResult === "object" && "success" in (backResult as any)
              ? backResult
              : { success: true, ...(backResult as object) };
          metadata.browserId = params["browserId"] as string;
          break;
        }

        default:
          throw new Error(`Unknown browser tool: ${tool}`);
      }

      metadata.executionTime = Date.now() - startTime;

      logger.info("Browser tool request completed", {
        tool,
        teamId: context.teamId,
        executionTime: metadata.executionTime,
      });

      return {
        success: true,
        result,
        metadata,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      logger.error("Browser tool request failed", {
        tool,
        teamId: context.teamId,
        error: error instanceof Error ? error.message : String(error),
        executionTime,
      });

      // Normalize session-not-found errors to expected phrasing
      const err = error instanceof Error ? error : new Error(String(error));
      const browserId =
        (request.params && (request.params as Record<string, unknown>)["browserId"]) ||
        (typeof (error as { browserId?: unknown })?.browserId === "string"
          ? ((error as { browserId?: unknown }).browserId as string)
          : "unknown");
      const normalized =
        err.message.includes("session not found") || err.message.includes("Browser session not found")
          ? new Error(`Browser session not found: ${browserId}`)
          : err;
      // Ensure "Browser session not found" errors are not re-mapped to element-not-found

      return {
        success: false,
        error: this.formatError(normalized, tool),
        metadata: {
          executionTime,
          teamId: context.teamId,
          browserId: browserId === "unknown" ? undefined : (browserId as string),
        },
      };
    }
  }

  /**
   * Launch a new browser instance
   */
  private async launchBrowser(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const {
      browserType = "chromium",
      headless = true,
      viewport = { width: 1280, height: 720 },
      userAgent,
      timeout = 30000,
    } = params;

    const result = await this.poolManager.launchBrowser({
      teamId: context.teamId,
      browserType: browserType as "chromium" | "firefox" | "webkit",
      headless: headless as boolean,
      viewport: viewport as { width: number; height: number },
      userAgent: userAgent as string | undefined,
      timeout: timeout as number,
    });

    // Track session for team isolation
    this.activeSessions.set(result.browserId, {
      teamId: context.teamId,
      createdAt: new Date(),
    });

    // Standardize launch result for transports/tests expecting result.browserId at top-level
    return {
      browserId: result.browserId,
      status: "launched",
      browserType: result.browserType,
      headless: result.headless,
      viewport: result.viewport,
      userAgent: result.userAgent,
      teamId: context.teamId,
    };
  }

  /**
   * Navigate to a URL
   */
  private async navigateToUrl(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const { browserId, url, waitUntil = "load", timeout = 30000 } = params;

    this.validateBrowserAccess(browserId as string, context.teamId);

    return this.poolManager.navigate({
      browserId: browserId as string,
      url: url as string,
      waitUntil: waitUntil as "load" | "domcontentloaded" | "networkidle",
      timeout: timeout as number,
    });
  }

  /**
   * Take a screenshot
   */
  private async takeScreenshot(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const {
      browserId,
      fullPage = false,
      clip,
      type = "png",
      quality,
      returnFormat = "file",
      timeout = 30000,
    } = params;

    this.validateBrowserAccess(browserId as string, context.teamId);

    return this.poolManager.screenshot({
      browserId: browserId as string,
      fullPage: fullPage as boolean,
      clip: clip as { x: number; y: number; width: number; height: number } | undefined,
      type: type as "png" | "jpeg",
      quality: quality as number | undefined,
      returnFormat: returnFormat as "file" | "url" | "base64_thumbnail",
    });
  }

  /**
   * Find elements on the page
   */
  private async findElements(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const { browserId, selector } = params;
    // multiple option removed from interface

    this.validateBrowserAccess(browserId as string, context.teamId);

    return this.poolManager.findElements({
      browserId: browserId as string,
      selector: selector as string,
      // multiple option removed from interface
    });
  }

  /**
   * Click an element
   */
  private async clickElement(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const { browserId, selector } = params;
    // button, clickCount, delay options not available in current interface

    this.validateBrowserAccess(browserId as string, context.teamId);

    return this.poolManager.clickElement({
      browserId: browserId as string,
      selector: selector as string,
      // button option not available in interface
    });
  }

  /**
   * Fill form fields
   */
  private async fillFormFields(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const { browserId, fields } = params;

    this.validateBrowserAccess(browserId as string, context.teamId);

    // Convert array format to mapping format expected by pool manager
    const fieldMapping: Record<string, string> = {};
    const fieldArray = fields as Array<{ selector: string; value: string }>;
    for (const field of fieldArray) {
      fieldMapping[field.selector] = field.value;
    }

    return this.poolManager.fillForm({
      browserId: browserId as string,
      fieldMapping,
    });
  }

  /**
   * Execute JavaScript on the page
   */
  private async executeJavaScript(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const { browserId } = params;
    // script, args not used - method throws error

    this.validateBrowserAccess(browserId as string, context.teamId);

    // JavaScript execution not available in current pool manager
    throw new Error("JavaScript execution not yet implemented");
  }

  /**
   * Get page content
   */
  private async getPageContent(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const { browserId } = params;
    // format not used - method throws error

    this.validateBrowserAccess(browserId as string, context.teamId);

    // Page content retrieval not available in current pool manager
    throw new Error("Page content retrieval not yet implemented");
  }

  /**
   * Close a browser instance
   */
  private async closeBrowser(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const { browserId } = params;

    // Treat missing session as idempotent success on close (teardown races)
    try {
      this.validateBrowserAccess(browserId as string, context.teamId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Browser session not found")) {
        this.activeSessions.delete(browserId as string);
        return { success: true, browserId: browserId as string, status: "already_closed" };
      }
      throw e;
    }

    const result = await this.poolManager.closeBrowser({
      browserId: browserId as string,
      force: true, // force=true to avoid race-induced failures in teardown
    });

    // Remove from active sessions
    this.activeSessions.delete(browserId as string);

    return result;
  }

  /**
   * Fill text in an element
   */
  private async fillText(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const { browserId, selector, text, timeout = 30000 } = params;

    this.validateBrowserAccess(browserId as string, context.teamId);

    return this.poolManager.fillText({
      browserId: browserId as string,
      selector: selector as string,
      text: text as string,
      timeout: timeout as number,
    });
  }

  /**
   * Wait for an element to appear
   */
  private async waitForElement(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const { browserId, selector, timeout = 30000, state = "visible" } = params;

    this.validateBrowserAccess(browserId as string, context.teamId);

    return this.poolManager.waitForElement({
      browserId: browserId as string,
      selector: selector as string,
      timeout: timeout as number,
      state: state as "attached" | "detached" | "visible" | "hidden",
    });
  }

  /**
   * Get text content from an element
   */
  private async getTextContent(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const { browserId, selector, timeout = 30000 } = params;

    this.validateBrowserAccess(browserId as string, context.teamId);

    return this.poolManager.getTextContent({
      browserId: browserId as string,
      selector: selector as string,
      timeout: timeout as number,
    });
  }

  /**
   * Validate element presence on the page
   */
  private async validateElementPresence(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const { browserId, selector, shouldExist = true, timeout = 30000 } = params;

    this.validateBrowserAccess(browserId as string, context.teamId);

    return this.poolManager.validateElementPresence({
      browserId: browserId as string,
      selector: selector as string,
      shouldExist: shouldExist as boolean,
      timeout: timeout as number,
    });
  }

  /**
   * Navigate back in browser history
   */
  private async goBack(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const { browserId } = params;

    this.validateBrowserAccess(browserId as string, context.teamId);

    return this.poolManager.goBack({
      browserId: browserId as string,
    });
  }

  /**
   * Validate that a team has access to a browser
   */
  private validateBrowserAccess(browserId: string, teamId?: string): void {
    const session = this.activeSessions.get(browserId);

    if (!session) {
      throw new Error(`Browser session not found: ${browserId}`);
    }

    // If both have team IDs, they must match
    if (teamId && session.teamId && teamId !== session.teamId) {
      throw new Error(`Access denied: Browser ${browserId} belongs to team ${session.teamId}`);
    }
  }

  /**
   * Format errors for AI-friendly consumption
   */
  private formatError(error: unknown, tool: string): BrowserToolResponse["error"] {
    if (error instanceof Error) {
      // Common browser errors with AI-friendly messages
      if (error.message.includes("Timeout")) {
        return {
          code: "BROWSER_TIMEOUT",
          message: "The browser operation timed out. The page may be slow to load or unresponsive.",
          details: {
            tool,
            originalError: error.message,
            suggestion: "Try increasing the timeout or checking if the page is accessible.",
          },
        };
      }

      if (error.message.includes("Browser session not found")) {
        return {
          code: "BROOKLYN_SESSION_MISSING",
          message: error.message,
          details: { tool },
        };
      }

      if (error.message.includes("not found")) {
        return {
          code: "ELEMENT_NOT_FOUND",
          message:
            "Could not find the requested element on the page. The selector may be incorrect or the element may not have loaded yet.",
          details: {
            tool,
            originalError: error.message,
            suggestion: "Verify the selector is correct or wait for the page to fully load.",
          },
        };
      }

      if (error.message.includes("Access denied")) {
        return {
          code: "ACCESS_DENIED",
          message: error.message,
          details: { tool },
        };
      }

      // Default error formatting
      return {
        code: "BROWSER_ERROR",
        message: error.message,
        details: {
          tool,
          type: error.constructor.name,
        },
      };
    }

    // Unknown error type
    return {
      code: "UNKNOWN_ERROR",
      message: String(error),
      details: { tool },
    };
  }

  /**
   * Get router statistics
   */
  getStatistics(): {
    activeSessions: number;
    sessionsByTeam: Record<string, number>;
  } {
    const sessionsByTeam: Record<string, number> = {};

    for (const session of this.activeSessions.values()) {
      const team = session.teamId || "default";
      sessionsByTeam[team] = (sessionsByTeam[team] || 0) + 1;
    }

    return {
      activeSessions: this.activeSessions.size,
      sessionsByTeam,
    };
  }
}
