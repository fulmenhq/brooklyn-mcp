/**
 * MCP Error Handler - Formats errors for AI-friendly consumption
 * Provides helpful context and recovery suggestions
 */

import { getLogger } from "../../shared/pino-logger.js";
import type { MCPRequestContext } from "./mcp-request-context.js";

const logger = getLogger("mcp-error-handler");

export interface MCPError {
  code: string;
  message: string;
  details?: unknown;
  context?: MCPRequestContext;
  suggestions?: string[];
  retryable?: boolean;
  userMessage?: string;
}

/**
 * Common error codes for browser operations
 */
export enum BrowserErrorCode {
  // Lifecycle errors
  BROWSER_LAUNCH_FAILED = "BROWSER_LAUNCH_FAILED",
  BROWSER_NOT_FOUND = "BROWSER_NOT_FOUND",
  BROWSER_ALREADY_CLOSED = "BROWSER_ALREADY_CLOSED",

  // Navigation errors
  NAVIGATION_TIMEOUT = "NAVIGATION_TIMEOUT",
  NAVIGATION_FAILED = "NAVIGATION_FAILED",
  INVALID_URL = "INVALID_URL",

  // Element errors
  ELEMENT_NOT_FOUND = "ELEMENT_NOT_FOUND",
  ELEMENT_NOT_VISIBLE = "ELEMENT_NOT_VISIBLE",
  ELEMENT_NOT_CLICKABLE = "ELEMENT_NOT_CLICKABLE",

  // Execution errors
  SCRIPT_EXECUTION_FAILED = "SCRIPT_EXECUTION_FAILED",
  SCRIPT_TIMEOUT = "SCRIPT_TIMEOUT",

  // Resource errors
  POOL_EXHAUSTED = "POOL_EXHAUSTED",
  MEMORY_LIMIT_EXCEEDED = "MEMORY_LIMIT_EXCEEDED",

  // Permission errors
  ACCESS_DENIED = "ACCESS_DENIED",
  TEAM_MISMATCH = "TEAM_MISMATCH",

  // General errors
  TIMEOUT = "TIMEOUT",
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * Error handler that formats errors for AI consumption
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Architectural pattern - Error handler with extensible formatting strategies
export class MCPErrorHandler {
  /**
   * Handle and format an error
   */
  static handle(error: unknown, operation: string, context?: MCPRequestContext): MCPError {
    logger.error("Handling MCP error", {
      operation,
      error: error instanceof Error ? error.message : String(error),
      context: context ? { requestId: context.requestId, teamId: context.teamId } : undefined,
    });

    // Handle known error types
    if (error instanceof Error) {
      return MCPErrorHandler.handleError(error, operation, context);
    }

    // Handle string errors
    if (typeof error === "string") {
      return MCPErrorHandler.handleStringError(error, operation, context);
    }

    // Unknown error type
    return {
      code: BrowserErrorCode.UNKNOWN_ERROR,
      message: "An unknown error occurred during the browser operation",
      details: { error: String(error), operation },
      context,
      suggestions: [
        "Check the browser logs for more details",
        "Ensure the browser is properly initialized",
        "Try restarting the operation",
      ],
      retryable: true,
    };
  }

  /**
   * Handle Error instances
   */
  private static handleError(
    error: Error,
    operation: string,
    context?: MCPRequestContext,
  ): MCPError {
    const message = error.message.toLowerCase();

    // Timeout errors
    if (message.includes("timeout")) {
      return MCPErrorHandler.createTimeoutError(error, operation, context);
    }

    // Element not found
    if (message.includes("no element") || message.includes("not found")) {
      return MCPErrorHandler.createElementNotFoundError(error, operation, context);
    }

    // Navigation errors
    if (message.includes("navigation") || message.includes("navigate")) {
      return MCPErrorHandler.createNavigationError(error, operation, context);
    }

    // Access denied
    if (message.includes("access denied") || message.includes("permission")) {
      return MCPErrorHandler.createAccessDeniedError(error, operation, context);
    }

    // Browser closed
    if (message.includes("closed") || message.includes("disconnected")) {
      return MCPErrorHandler.createBrowserClosedError(error, operation, context);
    }

    // Pool exhausted
    if (message.includes("pool") || message.includes("limit reached")) {
      return MCPErrorHandler.createPoolExhaustedError(error, operation, context);
    }

    // Default error
    return {
      code: BrowserErrorCode.UNKNOWN_ERROR,
      message: error.message,
      details: {
        operation,
        stack: error.stack,
      },
      context,
      suggestions: MCPErrorHandler.getGeneralSuggestions(operation),
      retryable: true,
    };
  }

  /**
   * Handle string errors
   */
  private static handleStringError(
    error: string,
    operation: string,
    context?: MCPRequestContext,
  ): MCPError {
    return {
      code: BrowserErrorCode.UNKNOWN_ERROR,
      message: error,
      details: { operation },
      context,
      suggestions: MCPErrorHandler.getGeneralSuggestions(operation),
      retryable: true,
    };
  }

  /**
   * Create timeout error
   */
  private static createTimeoutError(
    error: Error,
    operation: string,
    context?: MCPRequestContext,
  ): MCPError {
    return {
      code: BrowserErrorCode.TIMEOUT,
      message: "The browser operation timed out",
      userMessage: "The operation took too long to complete. The page may be slow or unresponsive.",
      details: {
        operation,
        originalError: error.message,
      },
      context,
      suggestions: [
        "Increase the timeout value for this operation",
        "Check if the target website is responding",
        "Verify your internet connection",
        "Try again with a smaller operation",
      ],
      retryable: true,
    };
  }

  /**
   * Create element not found error
   */
  private static createElementNotFoundError(
    error: Error,
    operation: string,
    context?: MCPRequestContext,
  ): MCPError {
    return {
      code: BrowserErrorCode.ELEMENT_NOT_FOUND,
      message: "Could not find the requested element on the page",
      userMessage: "The element you're looking for doesn't exist on the page or hasn't loaded yet.",
      details: {
        operation,
        originalError: error.message,
      },
      context,
      suggestions: [
        "Verify the CSS selector or XPath is correct",
        "Wait for the page to fully load before searching",
        "Check if the element is inside an iframe",
        "Use browser developer tools to inspect the page structure",
        "Try a more general selector first, then refine",
      ],
      retryable: true,
    };
  }

  /**
   * Create navigation error
   */
  private static createNavigationError(
    error: Error,
    operation: string,
    context?: MCPRequestContext,
  ): MCPError {
    return {
      code: BrowserErrorCode.NAVIGATION_FAILED,
      message: "Failed to navigate to the requested page",
      userMessage: "The browser couldn't load the requested page.",
      details: {
        operation,
        originalError: error.message,
      },
      context,
      suggestions: [
        "Check if the URL is correct and accessible",
        "Verify the website is not blocking automated browsers",
        "Try with a different wait condition (load, domcontentloaded, networkidle)",
        "Check if the site requires authentication",
      ],
      retryable: true,
    };
  }

  /**
   * Create access denied error
   */
  private static createAccessDeniedError(
    error: Error,
    operation: string,
    context?: MCPRequestContext,
  ): MCPError {
    return {
      code: BrowserErrorCode.ACCESS_DENIED,
      message: "Access denied for this browser operation",
      userMessage: "You don't have permission to access this browser instance.",
      details: {
        operation,
        originalError: error.message,
        teamId: context?.teamId,
      },
      context,
      suggestions: [
        "Use a browser instance that belongs to your team",
        "Launch a new browser instance",
        "Check the browser ID is correct",
      ],
      retryable: false,
    };
  }

  /**
   * Create browser closed error
   */
  private static createBrowserClosedError(
    error: Error,
    operation: string,
    context?: MCPRequestContext,
  ): MCPError {
    return {
      code: BrowserErrorCode.BROWSER_ALREADY_CLOSED,
      message: "The browser instance is already closed",
      userMessage: "This browser window has been closed and can't be used anymore.",
      details: {
        operation,
        originalError: error.message,
      },
      context,
      suggestions: [
        "Launch a new browser instance",
        "Check if the browser was closed by another operation",
        "Verify the browser ID is correct",
      ],
      retryable: false,
    };
  }

  /**
   * Create pool exhausted error
   */
  private static createPoolExhaustedError(
    error: Error,
    operation: string,
    context?: MCPRequestContext,
  ): MCPError {
    return {
      code: BrowserErrorCode.POOL_EXHAUSTED,
      message: "Browser pool limit reached",
      userMessage:
        "Too many browser instances are already running. Please close some before launching new ones.",
      details: {
        operation,
        originalError: error.message,
      },
      context,
      suggestions: [
        "Close unused browser instances",
        "Wait for other operations to complete",
        "Check with your administrator to increase the pool limit",
      ],
      retryable: true,
    };
  }

  /**
   * Get general suggestions based on operation
   */
  private static getGeneralSuggestions(operation: string): string[] {
    const suggestions: string[] = [];

    if (operation.includes("click")) {
      suggestions.push(
        "Ensure the element is visible and clickable",
        "Try scrolling the element into view first",
        "Check if the element is covered by another element",
      );
    }

    if (operation.includes("fill") || operation.includes("type")) {
      suggestions.push(
        "Verify the input field is not disabled",
        "Check if the field requires focus before typing",
        "Ensure the field accepts the type of value you're entering",
      );
    }

    if (operation.includes("screenshot")) {
      suggestions.push(
        "Make sure the page has finished loading",
        "Check if the viewport size is appropriate",
        "Verify disk space is available for saving screenshots",
      );
    }

    // Add general suggestions
    suggestions.push(
      "Check the browser console for JavaScript errors",
      "Verify the page doesn't require specific permissions or cookies",
      "Try the operation manually to understand the expected behavior",
    );

    return suggestions;
  }

  /**
   * Check if an error is retryable
   */
  static isRetryable(error: MCPError): boolean {
    return error.retryable ?? false;
  }

  /**
   * Format error for logging
   */
  static toLogFormat(error: MCPError): Record<string, unknown> {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      requestId: error.context?.requestId,
      teamId: error.context?.teamId,
      suggestions: error.suggestions?.length,
    };
  }
}
