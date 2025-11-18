/**
 * MCP Request/Response Tracing Middleware for Claude Code Debugging
 * Provides visibility into MCP communication during Claude sessions
 */

import { getLogger } from "../shared/pino-logger.js";

const logger = getLogger("mcp-debug");

export interface MCPTraceConfig {
  /** Enable request/response tracing to stderr */
  traceToStderr: boolean;
  /** Include request payloads in traces */
  includeRequests: boolean;
  /** Include response payloads in traces */
  includeResponses: boolean;
  /** Maximum payload size to trace (prevent huge logs) */
  maxPayloadSize: number;
  /** Filter traces by tool name pattern */
  toolFilter?: string;
}

export class MCPDebugMiddleware {
  private config: MCPTraceConfig;
  private requestCounter = 0;

  constructor(config?: Partial<MCPTraceConfig>) {
    this.config = {
      traceToStderr: process.env["BROOKLYN_MCP_TRACE"] === "true",
      includeRequests: process.env["BROOKLYN_MCP_TRACE_REQUESTS"] !== "false",
      includeResponses: process.env["BROOKLYN_MCP_TRACE_RESPONSES"] !== "false",
      maxPayloadSize: Number.parseInt(process.env["BROOKLYN_MCP_TRACE_MAX_SIZE"] || "2048", 10),
      toolFilter: process.env["BROOKLYN_MCP_TRACE_FILTER"],
      ...config,
    };
  }

  /**
   * Trace incoming MCP request
   */
  traceRequest(method: string, params: Record<string, unknown>, id?: unknown): void {
    const requestId = ++this.requestCounter;

    // Apply tool filter if configured
    if (this.config.toolFilter && method === "tools/call") {
      const toolName = params?.["name"] as string;
      if (toolName && !toolName.includes(this.config.toolFilter)) {
        return;
      }
    }

    if (!this.config.includeRequests) return;

    const truncatedParams = this.truncatePayload(params);
    const trace = {
      type: "MCP_REQUEST",
      requestId,
      method,
      id,
      params: truncatedParams,
      timestamp: new Date().toISOString(),
    };

    this.outputTrace(trace);
  }

  /**
   * Trace outgoing MCP response
   */
  traceResponse(
    method: string,
    response: Record<string, unknown>,
    id?: unknown,
    requestId?: number,
  ): void {
    // Apply tool filter if configured
    if (this.config.toolFilter && method === "tools/call") {
      const result = response?.["result"] as Record<string, unknown> | undefined;
      const toolName = result?.["name"] as string;
      if (toolName && !toolName.includes(this.config.toolFilter)) {
        return;
      }
    }

    if (!this.config.includeResponses) return;

    const truncatedResponse = this.truncatePayload(response);
    const trace = {
      type: "MCP_RESPONSE",
      requestId: requestId || this.requestCounter,
      method,
      id,
      response: truncatedResponse,
      timestamp: new Date().toISOString(),
    };

    this.outputTrace(trace);
  }

  /**
   * Trace tool execution details
   */
  traceToolExecution(
    toolName: string,
    args: Record<string, unknown>,
    result: unknown,
    error?: Error,
  ): void {
    if (this.config.toolFilter && !toolName.includes(this.config.toolFilter)) {
      return;
    }

    const trace = {
      type: "TOOL_EXECUTION",
      tool: toolName,
      args: this.truncatePayload(args),
      result: error ? undefined : this.truncatePayload(result),
      error: error ? { message: error.message, stack: error.stack } : undefined,
      timestamp: new Date().toISOString(),
    };

    this.outputTrace(trace);
  }

  /**
   * Output trace to configured destinations
   */
  private outputTrace(trace: Record<string, unknown>): void {
    const traceMessage = JSON.stringify(trace, null, 2);

    // Always log to file via pino logger
    logger.info("MCP_TRACE", trace);

    // Optionally output to stderr for immediate visibility
    if (this.config.traceToStderr) {
      process.stderr.write("\n=== BROOKLYN MCP TRACE ===\n");
      process.stderr.write(`${traceMessage}\n`);
      process.stderr.write("=== END TRACE ===\n\n");
    }
  }

  /**
   * Truncate large payloads to prevent log flooding
   */
  private truncatePayload(payload: unknown): unknown {
    if (!payload || typeof payload !== "object") return payload;

    const json = JSON.stringify(payload);
    if (json.length <= this.config.maxPayloadSize) {
      return payload;
    }

    // BUGFIX: Don't try to JSON.parse truncated JSON - it's malformed
    // Instead, return the truncated string as a preview
    const truncatedJson = json.substring(0, this.config.maxPayloadSize);
    return {
      _truncated: true,
      _originalSize: json.length,
      _preview: `${truncatedJson}...[truncated]`,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): MCPTraceConfig {
    return { ...this.config };
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(updates: Partial<MCPTraceConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// Global debug middleware instance
export const mcpDebugMiddleware = new MCPDebugMiddleware();

/**
 * Convenience functions for common tracing patterns
 */
export function traceIncomingMCPRequest(
  method: string,
  params: Record<string, unknown>,
  id?: unknown,
): void {
  mcpDebugMiddleware.traceRequest(method, params, id);
}

export function traceOutgoingMCPResponse(
  method: string,
  response: Record<string, unknown>,
  id?: unknown,
): void {
  mcpDebugMiddleware.traceResponse(method, response, id);
}

export function traceToolCall(
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
  error?: Error,
): void {
  mcpDebugMiddleware.traceToolExecution(toolName, args, result, error);
}
