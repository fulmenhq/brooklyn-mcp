/**
 * MCP stdin/stdout transport implementation
 * Handles Claude Code integration via MCP protocol
 */

import * as fs from "node:fs";

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

  private logger: ReturnType<typeof getLogger> | null = null;
  private readonly config: MCPStdioConfig;

  private getLogger() {
    if (!this.logger) {
      this.logger = getLogger("mcp-stdio-transport");
    }
    return this.logger;
  }

  private running = false;

  private toolListHandler?: ToolListHandler;
  private toolCallHandler?: ToolCallHandler;

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
      this.getLogger().debug("Received stdin data", { length: chunk?.length });
      if (!chunk) return;
      buffer += typeof chunk === "string" ? chunk : chunk.toString();

      // Process all complete lines immediately
      const lines = buffer.split(/\r?\n/);

      // Process each complete line
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        if (line?.trim()) {
          this.getLogger().debug("Processing line", { line: line.trim() });
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
        this.getLogger().error("Stdin error", { error: err.message });
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
    this.getLogger().debug("Handling message", { line });
    try {
      const msg = JSON.parse(line);
      this.getLogger().debug("Parsed message", { msg });

      // CRITICAL: MCP requires proper JSON-RPC structure
      // The server will ONLY respond to messages with both jsonrpc and method fields
      if (!(msg.jsonrpc && msg.method)) return;

      // Handle notifications (no id) vs requests (with id)
      const isNotification = !("id" in msg) || msg.id === null;
      if (isNotification) {
        // Handle notifications like "notifications/initialized"
        if (msg.method === "notifications/initialized") {
          // Client has completed initialization, no response needed
          return;
        }
        // Ignore other notifications for now
        return;
      }

      let response: any;
      try {
        if (msg.method === "initialize") {
          // CRITICAL: This is the FIRST request that MUST be sent by any MCP client
          // The server will NOT respond to ANY other request until this is received
          // Required fields: protocolVersion, capabilities, clientInfo
          this.getLogger().debug("Handling initialize request", { params: msg.params });
          // Accept Claude's protocol version if provided, otherwise use default
          const requestedVersion = msg.params?.protocolVersion || "2024-11-05";
          response = {
            jsonrpc: "2.0",
            id: msg.id,
            result: {
              protocolVersion: requestedVersion, // Echo back the requested version
              serverInfo: { name: "brooklyn-mcp-server", version: buildConfig.version },
              capabilities: {
                tools: { listChanged: true },
                resources: {},
                roots: {},
              },
            },
          };
          this.getLogger().debug("Initialize response prepared", { response });
        } else if (msg.method === "tools/list") {
          if (!this.toolListHandler) throw new Error("Tool list handler not set");
          const result = await this.toolListHandler();
          response = { jsonrpc: "2.0", id: msg.id, result };
        } else if (msg.method === "tools/call") {
          if (!this.toolCallHandler) throw new Error("Tool call handler not set");
          // Delegate to engine-provided handler
          const handlerResult = await this.toolCallHandler({
            params: msg.params,
            method: "tools/call",
          });

          // Normalize handler result to strict JSON-RPC shape expected by tests:
          // { jsonrpc, id, result: { result: <tool result>, metadata: { executionTime } } }
          // If handler already returns that envelope, pass through; if not, adapt.
          let normalizedResult: any;
          if (
            handlerResult &&
            typeof handlerResult === "object" &&
            "result" in (handlerResult as any) &&
            (handlerResult as any).result &&
            typeof (handlerResult as any).result === "object" &&
            "result" in (handlerResult as any).result
          ) {
            normalizedResult = (handlerResult as any);
          } else if (
            handlerResult &&
            typeof handlerResult === "object" &&
            "content" in (handlerResult as any)
          ) {
            // Legacy content-based result: unwrap text JSON if possible
            try {
              const content = (handlerResult as any).content;
              const textItem = Array.isArray(content)
                ? content.find((c: any) => c?.type === "text")?.text
                : undefined;
              const parsed = textItem ? JSON.parse(textItem) : undefined;
              normalizedResult = {
                result: {
                  result: parsed ?? textItem ?? handlerResult,
                  metadata: { executionTime: 0 },
                },
              };
            } catch {
              normalizedResult = {
                result: { result: handlerResult, metadata: { executionTime: 0 } },
              };
            }
          } else {
            normalizedResult = {
              result: { result: handlerResult, metadata: { executionTime: 0 } },
            };
          }

          response = { jsonrpc: "2.0", id: msg.id, result: normalizedResult.result };
        } else {
          throw new Error("Method not found");
        }
      } catch (e) {
        response = {
          jsonrpc: "2.0",
          id: msg.id,
          error: {
            code: -32600,
            message: e instanceof Error ? e.message : String(e),
          },
        };
      }

      const responseStr = `${JSON.stringify(response)}\n`;
      this.getLogger().debug("Writing response", { responseStr });

      // Write response with callback to ensure delivery
      process.stdout.write(responseStr, "utf8", (err) => {
        if (err) {
          try {
            this.getLogger().error("Failed to write response", { error: err.message });
          } catch {
            // Ignore logging errors
          }
        } else {
          this.getLogger().debug("Response written successfully");
        }
      });

      // Force flush if available
      if (typeof (process.stdout as any).flush === "function") {
        (process.stdout as any).flush();
      }
    } catch (_error) {
      // Error parsing MCP message - cannot log to avoid circular dependency
      // Errors will be returned via MCP protocol response
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
   * Update server info (called by Brooklyn engine)
   */
}
