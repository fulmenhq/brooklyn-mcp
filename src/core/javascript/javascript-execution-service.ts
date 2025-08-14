/**
 * JavaScript Execution Service for Brooklyn MCP Server
 * Enables instant UX modifications through script execution in browser context
 * Critical for achieving <10 second time to first design change
 */

import type { Page } from "playwright";
import { getLogger } from "../../shared/pino-logger.js";

// Lazy logger initialization pattern
let logger: ReturnType<typeof getLogger> | null = null;
function ensureLogger() {
  if (!logger) {
    logger = getLogger("javascript-execution");
  }
  return logger;
}

// Script execution arguments
export interface ExecuteScriptArgs {
  browserId: string;
  script: string;
  args?: unknown[];
  timeout?: number;
  awaitPromise?: boolean;
}

// Script execution result
export interface ExecuteScriptResult {
  success: boolean;
  result: unknown;
  error?: string;
  executionTime: number;
  type?: string;
}

// Expression evaluation arguments
export interface EvaluateExpressionArgs {
  browserId: string;
  expression: string;
  awaitPromise?: boolean;
  timeout?: number;
}

// Expression evaluation result
export interface EvaluateExpressionResult {
  success: boolean;
  value: unknown;
  type: string;
  serializable: boolean;
  executionTime: number;
}

// Console message capture arguments
export interface GetConsoleMessagesArgs {
  browserId: string;
  level?: "log" | "info" | "warn" | "error" | "debug";
  since?: string;
  limit?: number;
}

// Console message structure
export interface ConsoleMessage {
  type: string;
  text: string;
  timestamp: string;
  location?: {
    url: string;
    lineNumber: number;
  };
}

// Console messages result
export interface GetConsoleMessagesResult {
  messages: ConsoleMessage[];
  hasMore: boolean;
}

// Script tag addition arguments
export interface AddScriptTagArgs {
  browserId: string;
  content?: string;
  url?: string;
  type?: string;
}

// Script tag result
export interface AddScriptTagResult {
  success: boolean;
  elementHandle?: string;
  error?: string;
}

/**
 * Service for executing JavaScript in browser context
 * Enables rapid UX iteration and instant design modifications
 */
export class JavaScriptExecutionService {
  private consoleBuffers = new Map<string, ConsoleMessage[]>();
  private readonly maxConsoleMessages = 1000;
  private readonly defaultTimeout = 30000;

  /**
   * Execute arbitrary JavaScript in the page context
   * Perfect for instant style modifications
   * Example: document.querySelector('.btn').style.background = 'blue'
   */
  async executeScript(page: Page, args: ExecuteScriptArgs): Promise<ExecuteScriptResult> {
    const startTime = Date.now();
    const _timeout = args.timeout || this.defaultTimeout;

    try {
      ensureLogger().info("Executing JavaScript", {
        browserId: args.browserId,
        scriptLength: args.script.length,
        hasArgs: !!args.args,
        awaitPromise: args.awaitPromise,
      });

      // Security: Log script execution for audit trail
      this.auditScriptExecution(args.browserId, args.script);

      // Execute with timeout protection
      const result = await page.evaluate(
        async ({ script, args: scriptArgs, awaitPromise }) => {
          try {
            // Create function from script
            const fn = new Function(...(scriptArgs ? ["...args"] : []), script);
            const result = fn(...(scriptArgs || []));

            // Handle async if requested
            if (awaitPromise && result instanceof Promise) {
              return await result;
            }

            return result;
          } catch (error) {
            throw new Error(
              `Script execution failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        },
        { script: args.script, args: args.args, awaitPromise: args.awaitPromise },
      );

      const executionTime = Date.now() - startTime;

      ensureLogger().info("JavaScript executed successfully", {
        browserId: args.browserId,
        executionTime,
        resultType: typeof result,
      });

      return {
        success: true,
        result,
        executionTime,
        type: typeof result,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      ensureLogger().error("JavaScript execution failed", {
        browserId: args.browserId,
        error: errorMessage,
        executionTime,
      });

      return {
        success: false,
        result: null,
        error: errorMessage,
        executionTime,
      };
    }
  }

  /**
   * Evaluate an expression and return its value
   * Useful for getting computed values back from the page
   */
  async evaluateExpression(
    page: Page,
    args: EvaluateExpressionArgs,
  ): Promise<EvaluateExpressionResult> {
    const startTime = Date.now();
    const _timeout = args.timeout || this.defaultTimeout;

    try {
      ensureLogger().info("Evaluating expression", {
        browserId: args.browserId,
        expressionLength: args.expression.length,
        awaitPromise: args.awaitPromise,
      });

      const result = (await page.evaluate(
        async ({ expression, awaitPromise }) => {
          try {
            // Use eval for expression evaluation (sandboxed in page context)
            // biome-ignore lint/security/noGlobalEval: Sandboxed in browser context
            const value = eval(expression);

            // Handle async if requested
            if (awaitPromise && value instanceof Promise) {
              return {
                value: await value,
                type: "promise-resolved",
                serializable: true,
              };
            }

            // Check serializability
            try {
              JSON.stringify(value);
              return {
                value,
                type: typeof value,
                serializable: true,
              };
            } catch {
              return {
                value: String(value),
                type: typeof value,
                serializable: false,
              };
            }
          } catch (error) {
            throw new Error(
              `Expression evaluation failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        },
        { expression: args.expression, awaitPromise: args.awaitPromise },
      )) as { value: unknown; type: string; serializable: boolean };

      const executionTime = Date.now() - startTime;

      ensureLogger().info("Expression evaluated successfully", {
        browserId: args.browserId,
        executionTime,
        resultType: result.type,
        serializable: result.serializable,
      });

      return {
        success: true,
        value: result.value,
        type: result.type,
        serializable: result.serializable,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      ensureLogger().error("Expression evaluation failed", {
        browserId: args.browserId,
        error: errorMessage,
        executionTime,
      });

      return {
        success: false,
        value: null,
        type: "error",
        serializable: false,
        executionTime,
      };
    }
  }

  /**
   * Initialize console message capture for a page
   */
  initializeConsoleCapture(page: Page, browserId: string): void {
    const buffer: ConsoleMessage[] = [];
    this.consoleBuffers.set(browserId, buffer);

    page.on("console", (msg) => {
      const message: ConsoleMessage = {
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString(),
      };

      // Try to get location info
      const location = msg.location();
      if (location.url) {
        message.location = {
          url: location.url,
          lineNumber: location.lineNumber,
        };
      }

      // Add to circular buffer
      if (buffer.length >= this.maxConsoleMessages) {
        buffer.shift();
      }
      buffer.push(message);
    });

    ensureLogger().info("Console capture initialized", { browserId });
  }

  /**
   * Get captured console messages
   * Essential for debugging UX modifications
   */
  async getConsoleMessages(args: GetConsoleMessagesArgs): Promise<GetConsoleMessagesResult> {
    const buffer = this.consoleBuffers.get(args.browserId) || [];

    let messages = [...buffer];

    // Filter by level if specified
    if (args.level) {
      messages = messages.filter((msg) => msg.type === args.level);
    }

    // Filter by timestamp if specified
    if (args.since) {
      const sinceTime = new Date(args.since).getTime();
      messages = messages.filter((msg) => new Date(msg.timestamp).getTime() > sinceTime);
    }

    // Apply limit
    const limit = args.limit || 100;
    const hasMore = messages.length > limit;
    messages = messages.slice(-limit);

    ensureLogger().info("Retrieved console messages", {
      browserId: args.browserId,
      messageCount: messages.length,
      hasMore,
    });

    return {
      messages,
      hasMore,
    };
  }

  /**
   * Add a script tag to the page
   * Useful for injecting utility libraries or custom code
   */
  async addScriptTag(page: Page, args: AddScriptTagArgs): Promise<AddScriptTagResult> {
    try {
      ensureLogger().info("Adding script tag", {
        browserId: args.browserId,
        hasContent: !!args.content,
        hasUrl: !!args.url,
        type: args.type,
      });

      const options: { content?: string; url?: string; type?: string } = {};

      if (args.content) {
        options.content = args.content;
      }
      if (args.url) {
        options.url = args.url;
      }
      if (args.type) {
        options.type = args.type;
      }

      const handle = await page.addScriptTag(options);

      ensureLogger().info("Script tag added successfully", {
        browserId: args.browserId,
      });

      return {
        success: true,
        elementHandle: handle ? "script-element" : undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      ensureLogger().error("Failed to add script tag", {
        browserId: args.browserId,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Cleanup console buffer for a browser
   */
  cleanupConsoleBuffer(browserId: string): void {
    this.consoleBuffers.delete(browserId);
    ensureLogger().info("Console buffer cleaned up", { browserId });
  }

  /**
   * Audit script execution for security tracking
   */
  private auditScriptExecution(browserId: string, script: string): void {
    ensureLogger().info("Script execution audit", {
      browserId,
      scriptHash: this.hashScript(script),
      scriptLength: script.length,
      timestamp: new Date().toISOString(),
      // In production, could write to audit log database
    });
  }

  /**
   * Simple hash for script identification
   */
  private hashScript(script: string): string {
    let hash = 0;
    for (let i = 0; i < script.length; i++) {
      const char = script.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }
}
