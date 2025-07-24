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
import { getLogger } from "../shared/structured-logger.js";

/**
 * MCP stdin/stdout transport for Claude Code integration
 *
 * CRITICAL: This transport communicates via stdin/stdout using JSON-RPC.
 * NEVER write to stdout directly - it will corrupt the MCP protocol.
 * All logging must go to stderr or files only.
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

    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    let buffer = "";
    process.stdin.on("data", (chunk) => {
      buffer += chunk;
      let lineEnd: number = buffer.indexOf("\n");
      while (lineEnd !== -1) {
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 1);
        this.handleIncomingMessage(line);
        lineEnd = buffer.indexOf("\n");
      }
    });

    process.stdin.on("end", () => {
      // Stdin ended, stopping transport
      this.stop();
    });

    this.running = true;
    // Transport started successfully
  }

  private async handleIncomingMessage(line: string): Promise<void> {
    try {
      const msg = JSON.parse(line);
      if (!(msg.jsonrpc && msg.id && msg.method)) return;

      let response: any;
      try {
        if (msg.method === "initialize") {
          response = {
            jsonrpc: "2.0",
            id: msg.id,
            result: {
              protocolVersion: "2024-11-05",
              serverInfo: { name: "brooklyn-mcp-server", version: buildConfig.version },
              capabilities: { tools: {} },
            },
          };
        } else if (msg.method === "tools/list") {
          if (!this.toolListHandler) throw new Error("Tool list handler not set");
          const result = await this.toolListHandler();
          response = { jsonrpc: "2.0", id: msg.id, result };
        } else if (msg.method === "tools/call") {
          if (!this.toolCallHandler) throw new Error("Tool call handler not set");
          const result = await this.toolCallHandler({
            params: msg.params,
            method: "tools/call",
          });
          response = { jsonrpc: "2.0", id: msg.id, result };
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

      process.stdout.write(`${JSON.stringify(response)}\n`);
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
