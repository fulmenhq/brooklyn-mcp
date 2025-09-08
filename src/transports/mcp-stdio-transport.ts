/**
 * MCP stdin/stdout transport implementation
 * Handles Claude Code integration via MCP protocol
 */

import * as fs from "node:fs";

import { MCPDebugMiddleware } from "../core/mcp-debug-middleware.js";
import type {
  MCPStdioConfig,
  ToolCallHandler,
  ToolListHandler,
  Transport,
} from "../core/transport.js";
import { TransportType } from "../core/transport.js";
import { buildConfig } from "../shared/build-config.js";
import { getLogger } from "../shared/pino-logger.js";

/**
 * MCP stdin/stdout transport for Claude Code integration
 *
 * CRITICAL MCP PROTOCOL REQUIREMENTS:
 * 1. This transport communicates via stdin/stdout using JSON-RPC 2.0
 * 2. NEVER write to stdout except for JSON-RPC responses - it corrupts the protocol
 * 3. The server will NOT respond to ANY request until it receives a valid "initialize" request
 * 4. The initialize request MUST include: jsonrpc: "2.0", method: "initialize", params with protocolVersion
 * 5. All logging must go to stderr or files only
 * 6. The server starts COMPLETELY SILENT until the transport is created and initialized
 */
export class MCPStdioTransport implements Transport {
  readonly name = "mcp-stdio";
  readonly type = TransportType.MCP_STDIO;

  // Lazy logger to avoid module-level side effects and stdout pollution
  private _logger: ReturnType<typeof getLogger> | null = null;
  private readonly config: MCPStdioConfig;

  private logger() {
    if (!this._logger) {
      this._logger = getLogger("mcp-stdio-transport");
    }
    return this._logger;
  }

  private running = false;

  private toolListHandler?: ToolListHandler;
  private toolCallHandler?: ToolCallHandler;

  // MCP debug middleware for tracing (STDIO: file-only for Claude Code compatibility)
  private debugMiddleware = new MCPDebugMiddleware({ traceToStderr: false });

  constructor(config: MCPStdioConfig) {
    this.config = config;
  }

  /**
   * Initialize the MCP transport
   */
  async initialize(): Promise<void> {
    // Transport initialization - logging deferred to avoid circular dependency
  }

  /**
   * Start the MCP transport
   * Connects to stdin/stdout and begins listening for MCP requests
   */
  async start(): Promise<void> {
    if (this.running) {
      // Transport already running
      return;
    }

    // Set up stdin for reliable handling
    process.stdin.setEncoding("utf8");

    // Remove any existing listeners to avoid conflicts
    process.stdin.removeAllListeners("data");
    process.stdin.removeAllListeners("end");
    process.stdin.removeAllListeners("error");

    let buffer = "";

    // Handle data events
    process.stdin.on("data", (chunk: string | Buffer | undefined) => {
      this.logger().debug("Received stdin data", { length: chunk?.length });
      if (!chunk) return;
      buffer += typeof chunk === "string" ? chunk : chunk.toString();

      // Process all complete lines immediately
      const lines = buffer.split(/\r?\n/);

      // Process each complete line
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        if (line?.trim()) {
          this.logger().debug("Processing line", { line: line.trim() });
          // Use setImmediate to avoid blocking
          setImmediate(() => this.handleIncomingMessage(line.trim()));
        }
      }

      // Keep the last incomplete line
      buffer = lines[lines.length - 1] || "";
    });

    process.stdin.on("end", () => {
      // Process any remaining buffer
      if (buffer.trim()) {
        this.handleIncomingMessage(buffer.trim());
      }
      // Stdin ended, stopping transport
      this.stop();
    });

    process.stdin.on("error", (err) => {
      // Log error but don't crash
      try {
        this.logger().error("Stdin error", { error: err.message });
      } catch {
        // Ignore logging errors
      }
    });

    this.running = true;

    // Resume stdin AFTER all handlers are set up
    process.stdin.resume();

    // Transport started successfully
  }

  private async handleIncomingMessage(line: string): Promise<void> {
    this.logger().debug("Handling message", { line });
    try {
      const msg = JSON.parse(line);
      this.logger().debug("Parsed message", { msg });

      // MCP request tracing (file-only for STDIO compatibility)
      this.debugMiddleware.traceRequest(msg.method, msg.params || {}, msg.id);

      // CRITICAL: MCP requires proper JSON-RPC structure
      if (!(msg.jsonrpc && msg.method)) return;

      // Handle notifications (no id) vs requests (with id)
      const isNotification = !("id" in msg) || msg.id === null;
      if (isNotification) {
        if (msg.method === "notifications/initialized") {
          return;
        }
        return;
      }

      let response: any;

      if (msg.method === "initialize") {
        this.logger().debug("Handling initialize request", { params: msg.params });
        // Align with MCP SDK v0.5.0 reference version used across other transports
        const serverProtocolVersion = "2025-06-18";
        const clientVersion = (msg.params?.protocolVersion as string | undefined) ?? undefined;

        if (clientVersion && clientVersion !== serverProtocolVersion) {
          // Version mismatch: return JSON-RPC error with informative message
          response = {
            jsonrpc: "2.0",
            id: msg.id,
            error: {
              code: -32600,
              message: `Unsupported protocolVersion "${clientVersion}". Server supports "${serverProtocolVersion}".`,
              data: { supported: serverProtocolVersion },
            },
          };
        } else {
          response = {
            jsonrpc: "2.0",
            id: msg.id,
            result: {
              protocolVersion: serverProtocolVersion,
              serverInfo: { name: "brooklyn-mcp-server", version: buildConfig.version },
              capabilities: {
                tools: { listChanged: true },
              },
            },
          };
        }
        this.logger().debug("Initialize response prepared", { response });
      } else if (msg.method === "tools/list") {
        if (!this.toolListHandler) {
          response = this.createJsonRpcError(msg.id, -32601, "Method not found: tools/list");
        } else {
          const result = await this.toolListHandler();
          response = { jsonrpc: "2.0", id: msg.id, result };
        }
      } else if (msg.method === "tools/call") {
        if (!this.toolCallHandler) {
          response = this.createJsonRpcError(msg.id, -32601, "Method not found: tools/call");
        } else if (!msg.params || typeof (msg.params as any).name !== "string") {
          response = this.createJsonRpcError(
            msg.id,
            -32602,
            "Invalid params: 'name' must be a string",
          );
        } else {
          const handlerResult = await this.toolCallHandler({
            params: msg.params,
            method: "tools/call",
          });

          let normalizedEnvelope: { result: { result: any; metadata: { executionTime: number } } };
          const start = Date.now();

          if (
            handlerResult &&
            typeof handlerResult === "object" &&
            "success" in (handlerResult as any) &&
            (handlerResult as any).success === true &&
            "result" in (handlerResult as any)
          ) {
            normalizedEnvelope = {
              result: {
                result: (handlerResult as any).result,
                metadata: {
                  executionTime: Number((handlerResult as any).metadata?.executionTime) || 0,
                },
              },
            };
          } else if (
            handlerResult &&
            typeof handlerResult === "object" &&
            "result" in (handlerResult as any) &&
            (handlerResult as any).result &&
            typeof (handlerResult as any).result === "object" &&
            "result" in (handlerResult as any).result &&
            "metadata" in (handlerResult as any).result
          ) {
            normalizedEnvelope = handlerResult as any;
          } else if (
            handlerResult &&
            typeof handlerResult === "object" &&
            "content" in (handlerResult as any)
          ) {
            try {
              const content = (handlerResult as any).content;
              const textItem = Array.isArray(content)
                ? content.find((c: any) => c?.type === "text")?.text
                : undefined;
              const parsed = textItem ? JSON.parse(textItem) : undefined;
              normalizedEnvelope = {
                result: {
                  result: parsed ?? textItem ?? handlerResult,
                  metadata: { executionTime: 0 },
                },
              };
            } catch {
              normalizedEnvelope = {
                result: { result: handlerResult, metadata: { executionTime: 0 } },
              };
            }
          } else {
            normalizedEnvelope = {
              result: { result: handlerResult, metadata: { executionTime: 0 } },
            };
          }

          try {
            if (normalizedEnvelope?.result?.metadata) {
              normalizedEnvelope.result.metadata.executionTime =
                normalizedEnvelope.result.metadata.executionTime || Math.max(0, Date.now() - start);
            }
          } catch {
            // ignore
          }

          try {
            const toolName = (msg.params as any)?.name || (msg.params as any)?.tool || undefined;
            if (
              toolName === "launch_browser" &&
              normalizedEnvelope?.result &&
              normalizedEnvelope.result.result &&
              typeof normalizedEnvelope.result.result === "object"
            ) {
              const r = normalizedEnvelope.result.result as any;
              if (r && typeof r === "object" && "success" in r && "result" in r) {
                normalizedEnvelope.result.result = r.result;
              }
            }
          } catch {
            // ignore
          }

          let payload =
            normalizedEnvelope?.result?.result ?? normalizedEnvelope?.result ?? normalizedEnvelope;

          try {
            const toolName = (msg.params as any)?.name || (msg.params as any)?.tool || undefined;
            const toolRequiresSuccessFlag = [
              "navigate_to_url",
              "take_screenshot",
              "click_element",
              "fill_text",
              "fill_form_fields",
              "wait_for_element",
              "get_text_content",
              "validate_element_presence",
              "get_page_content",
              "go_back",
              "close_browser",
              "find_elements",
            ];
            if (
              toolRequiresSuccessFlag.includes(toolName as string) &&
              payload &&
              typeof payload === "object" &&
              !("success" in (payload as any))
            ) {
              payload = { success: true, ...(payload as object) };
            }
          } catch {
            // ignore shaping errors
          }

          // Transform to proper MCP protocol format with content array
          // See docs/development/mcp-protocol-guide.md for specification details
          const mcpResponse = {
            content: [
              {
                type: "text",
                text: JSON.stringify(payload),
              },
            ],
          };
          response = { jsonrpc: "2.0", id: msg.id, result: mcpResponse };
        }
      } else {
        response = this.createJsonRpcError(msg.id, -32601, "Method not found");
      }

      const responseStr = `${JSON.stringify(response)}\n`;
      this.logger().debug("Writing response", { responseStr });

      // MCP response tracing (file-only for STDIO compatibility)
      this.debugMiddleware.traceResponse(msg.method, response, msg.id);

      process.stdout.write(responseStr, "utf8", (err?: Error | null) => {
        if (err) {
          try {
            this.logger().error("Failed to write response", { error: err.message });
          } catch {
            // Ignore logging errors
          }
        } else {
          this.logger().debug("Response written successfully");
        }
      });

      if (typeof (process.stdout as any)?.flush === "function") {
        (process.stdout as any).flush();
      }
    } catch (_error) {
      try {
        const parseErr = this.createJsonRpcError(null, -32700, "Parse error");
        process.stdout.write(`${JSON.stringify(parseErr)}\n`, "utf8");
      } catch {
        // Swallow
      }
    }
  }

  /**
   * Stop the MCP transport
   * Note: For stdio transport, this typically means the process will exit
   */
  async stop(): Promise<void> {
    if (!this.running) {
      // Transport not running
      return;
    }

    this.running = false;
    process.stdin.pause();
    // Transport stopped
  }

  /**
   * Check if transport is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Set tool list handler
   */
  setToolListHandler(handler: ToolListHandler): void {
    this.toolListHandler = handler;
    // Defer logging to avoid circular dependency
  }

  /**
   * Set tool call handler
   */
  setToolCallHandler(handler: ToolCallHandler): void {
    this.toolCallHandler = handler;
    // Defer logging to avoid circular dependency
  }

  /**
   * JSON-RPC error helper
   */
  private createJsonRpcError(id: unknown, code: number, message: string, data?: unknown) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message,
        ...(data !== undefined ? { data } : {}),
      },
    };
  }

  /**
   * Update server info (called by Brooklyn engine)
   */
}
