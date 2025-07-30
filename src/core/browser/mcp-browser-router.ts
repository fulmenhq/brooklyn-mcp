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

      switch (tool) {
        case "launch_browser":
          result = await this.launchBrowser(params, context);
          metadata.browserId = (result as { browserId: string }).browserId;
          break;

        case "navigate_to_url":
          result = await this.navigateToUrl(params, context);
          metadata.browserId = params["browserId"] as string;
          break;

        case "take_screenshot":
          result = await this.takeScreenshot(params, context);
          metadata.browserId = params["browserId"] as string;
          break;

        case "find_elements":
          result = await this.findElements(params, context);
          metadata.browserId = params["browserId"] as string;
          break;

        case "click_element":
          result = await this.clickElement(params, context);
          metadata.browserId = params["browserId"] as string;
          break;

        case "fill_form_fields":
          result = await this.fillFormFields(params, context);
          metadata.browserId = params["browserId"] as string;
          break;

        case "execute_javascript":
          result = await this.executeJavaScript(params, context);
          metadata.browserId = params["browserId"] as string;
          break;

        case "get_page_content":
          result = await this.getPageContent(params, context);
          metadata.browserId = params["browserId"] as string;
          break;

        case "close_browser":
          result = await this.closeBrowser(params, context);
          break;

        case "fill_text":
          result = await this.fillText(params, context);
          metadata.browserId = params["browserId"] as string;
          break;

        case "wait_for_element":
          result = await this.waitForElement(params, context);
          metadata.browserId = params["browserId"] as string;
          break;

        case "get_text_content":
          result = await this.getTextContent(params, context);
          metadata.browserId = params["browserId"] as string;
          break;

        case "validate_element_presence":
          result = await this.validateElementPresence(params, context);
          metadata.browserId = params["browserId"] as string;
          break;

        case "go_back":
          result = await this.goBack(params, context);
          metadata.browserId = params["browserId"] as string;
          break;

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

      return {
        success: false,
        error: this.formatError(error, tool),
        metadata: {
          executionTime,
          teamId: context.teamId,
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
    } = params;

    const result = await this.poolManager.launchBrowser({
      teamId: context.teamId,
      browserType: browserType as "chromium" | "firefox" | "webkit",
      headless: headless as boolean,
      viewport: viewport as { width: number; height: number },
      userAgent: userAgent as string | undefined,
    });

    // Track session for team isolation
    this.activeSessions.set(result.browserId, {
      teamId: context.teamId,
      createdAt: new Date(),
    });

    return result;
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
    const { browserId, force = false } = params;

    this.validateBrowserAccess(browserId as string, context.teamId);

    const result = await this.poolManager.closeBrowser({
      browserId: browserId as string,
      force: force as boolean,
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
          details: {
            tool,
            suggestion: "This browser belongs to another team. Use the correct browser ID.",
          },
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
