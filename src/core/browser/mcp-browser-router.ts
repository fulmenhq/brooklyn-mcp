/**
 * MCP Browser Router - Routes MCP tool requests to browser pool
 * Integrates the enterprise browser infrastructure with MCP protocol
 */

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

    const browserIdFromParams = (params && (params as Record<string, unknown>)["browserId"]) as
      | string
      | undefined;

    try {
      const result = await this.dispatch(tool, params, context);
      const metadata: BrowserToolResponse["metadata"] = {
        executionTime: Date.now() - startTime,
        teamId: context.teamId,
        browserId: browserIdFromParams,
      };

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

      const browserIdVal =
        browserIdFromParams ||
        (typeof (error as { browserId?: string }).browserId === "string"
          ? (error as { browserId?: string }).browserId
          : undefined);

      return {
        success: false,
        error: this.formatError(
          (error instanceof Error ? error : new Error(String(error))).message.includes(
            "session not found",
          ) ||
            (error instanceof Error ? error : new Error(String(error))).message.includes(
              "Browser session not found",
            )
            ? new Error(`Browser session not found: ${browserIdVal ?? "unknown"}`)
            : error instanceof Error
              ? error
              : new Error(String(error)),
          tool,
        ),
        metadata: {
          executionTime,
          teamId: context.teamId,
          browserId: browserIdVal,
        },
      };
    }
  }

  // Split dispatch into a dedicated method to reduce cognitive complexity
  private async dispatch(
    tool: string,
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    // Normalize legacy parameter aliases early
    if (!params["browserId"] && (params as Record<string, unknown>)["id"]) {
      params["browserId"] = (params as Record<string, unknown>)["id"] as string;
    }
    if (!params["browserId"] && (params as Record<string, unknown>)["browser_id"]) {
      params["browserId"] = (params as Record<string, unknown>)["browser_id"] as string;
    }

    switch (tool) {
      case "launch_browser":
        return await this.launchBrowser(params, context);
      case "navigate_to_url":
        return await this.navigateToUrl(params, context);
      case "take_screenshot":
        return await this.takeScreenshot(params, context);
      case "find_elements":
        return await this.findElements(params, context);
      case "click_element":
        return await this.clickElement(params, context);
      case "fill_form_fields":
        return await this.fillFormFields(params, context);
      case "execute_javascript":
        return await this.executeJavaScript(params, context);
      case "get_page_content":
        return await this.getPageContent(params, context);
      case "close_browser":
        return await this.closeBrowser(params, context);
      case "fill_text":
        return await this.fillText(params, context);
      case "wait_for_element":
        return await this.waitForElement(params, context);
      case "get_text_content":
        return await this.getTextContent(params, context);
      case "validate_element_presence":
        return await this.validateElementPresence(params, context);
      case "go_back":
        return await this.goBack(params, context);
      default:
        throw new Error(`Unknown browser tool: ${tool}`);
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
      headless = true,
      viewport = { width: 1280, height: 720 },
      userAgent,
      timeout = 30000,
    } = params as {
      headless?: boolean;
      viewport?: { width: number; height: number };
      userAgent?: string;
      timeout?: number;
    };

    const result = await this.poolManager.launchBrowser({
      teamId: context.teamId,
      // default to chromium when no explicit browserType was provided
      browserType: "chromium",
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
      success: true,
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
    } = params as {
      browserId?: string;
      fullPage?: boolean;
      clip?: { x: number; y: number; width: number; height: number };
      type?: "png" | "jpeg";
      quality?: number;
      returnFormat?: "file" | "url" | "base64_thumbnail";
    };

    this.validateBrowserAccess(browserId as string, context.teamId);

    return this.poolManager.screenshot({
      browserId: browserId as string,
      fullPage: fullPage as boolean,
      clip: clip as { x: number; y: number; width: number; height: number } | undefined,
      type: type as "png" | "jpeg",
      quality: quality as number | undefined,
      returnFormat: returnFormat as "file" | "url" | "base64_thumbnail",
      // no timeout parameter here; pool manager doesn't accept it in the current API
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

    this.validateBrowserAccess(browserId as string, context.teamId);

    return this.poolManager.findElements({
      browserId: browserId as string,
      selector: selector as string,
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

    this.validateBrowserAccess(browserId as string, context.teamId);

    return this.poolManager.clickElement({
      browserId: browserId as string,
      selector: selector as string,
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
    const {
      browserId,
      selector,
      timeout = 30000,
    } = params as {
      browserId?: string;
      selector?: string;
      timeout?: number;
    };

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
