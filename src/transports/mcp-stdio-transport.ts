/**
 * MCP stdin/stdout transport implementation
 * Handles Claude Code integration via MCP protocol
 */

import type {
  MCPStdioConfig,
  ToolCallHandler,
  ToolListHandler,
  Transport,
} from "../core/transport.js";
import { TransportType } from "../core/transport.js";
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
  private readonly _config: MCPStdioConfig;

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
    this._config = config;
    // Config stored for future use (dev mode, pipe configuration)
  }

  /**
   * Initialize the MCP transport
   */
  async initialize(): Promise<void> {
    this.getLogger().info("Initializing MCP stdio transport");

    this.getLogger().info("MCP stdio transport initialized");
  }

  /**
   * Start the MCP transport
   * Connects to stdin/stdout and begins listening for MCP requests
   */
  async start(): Promise<void> {
    if (this.running) {
      this.getLogger().warn("MCP stdio transport already running");
      return;
    }

    this.getLogger().info("Starting custom MCP stdio transport");

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
      this.getLogger().info("Stdin ended, stopping transport");
      this.stop();
    });

    this.running = true;
    this.getLogger().info("Custom MCP stdio transport started successfully");
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
              serverInfo: { name: "brooklyn-mcp-server", version: "1.1.6" },
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
            method: "tools/call",
            params: msg.params,
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
    } catch (error) {
      this.getLogger().error("Error parsing MCP message", {
        line,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Stop the MCP transport
   * Note: For stdio transport, this typically means the process will exit
   */
  async stop(): Promise<void> {
    if (!this.running) {
      this.getLogger().warn("MCP stdio transport not running");
      return;
    }

    this.running = false;
    process.stdin.pause();
    this.getLogger().info("Custom MCP stdio transport stopped");
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
    this.getLogger().debug("Tool list handler set");
  }

  /**
   * Set tool call handler
   */
  setToolCallHandler(handler: ToolCallHandler): void {
    this.toolCallHandler = handler;
    this.getLogger().debug("Tool call handler set");
  }

  /**
   * Update server info (called by Brooklyn engine)
   */
}
