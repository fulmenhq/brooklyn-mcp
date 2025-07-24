/**
 * MCP named pipe transport implementation for development mode
 * Handles communication via named pipes instead of stdin/stdout
 */

import * as fs from "node:fs";
import { createReadStream, createWriteStream } from "node:fs";
import type { Readable, Writable } from "node:stream";

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
 * MCP named pipe transport for development mode
 *
 * Uses named pipes (FIFOs) for communication instead of stdin/stdout.
 * This allows multiple instances and better process isolation.
 */
export class MCPPipeTransport implements Transport {
  readonly name = "mcp-pipe";
  readonly type = TransportType.MCP_STDIO;

  private logger: ReturnType<typeof getLogger> | null = null;
  private readonly config: MCPStdioConfig;
  private inputStream?: Readable;
  private outputStream?: Writable;

  private getLogger() {
    if (!this.logger) {
      this.logger = getLogger("mcp-pipe-transport");
    }
    return this.logger;
  }

  private running = false;

  private toolListHandler?: ToolListHandler;
  private toolCallHandler?: ToolCallHandler;

  constructor(config: MCPStdioConfig) {
    this.config = config;
    if (!(config.options?.inputPipe && config.options?.outputPipe)) {
      throw new Error("Named pipes are required for MCPPipeTransport");
    }
  }

  /**
   * Initialize the MCP transport
   */
  async initialize(): Promise<void> {
    // Transport initialization - logging deferred to avoid circular dependency
  }

  /**
   * Start the MCP transport
   * Opens named pipes and begins listening for MCP requests
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    const options = this.config.options;
    if (!(options?.inputPipe && options?.outputPipe)) {
      throw new Error("Named pipes are required but not provided");
    }

    const { inputPipe, outputPipe } = options;

    this.getLogger().info("Opening named pipes", { inputPipe, outputPipe });

    try {
      // Use simple createWriteStream for output (works fine with named pipes)
      this.outputStream = createWriteStream(outputPipe, { encoding: "utf8" });

      // Simple approach: just use the existing createReadStream but catch the error
      // and continue - many times it still works even with the seek error
      try {
        this.inputStream = createReadStream(inputPipe, { encoding: "utf8" });
      } catch (_seekError) {
        // If createReadStream fails, fall back to polling approach
        this.getLogger().info("CreateReadStream failed, using polling approach");
        this.startPollingMode(inputPipe);
        this.running = true;
        this.getLogger().info("Named pipe transport started (polling mode)");
        return;
      }

      let buffer = "";

      this.inputStream.on("data", (chunk: string) => {
        buffer += chunk;
        let lineEnd: number = buffer.indexOf("\n");
        while (lineEnd !== -1) {
          const line = buffer.slice(0, lineEnd).trim();
          if (line) {
            this.handleIncomingMessage(line);
          }
          buffer = buffer.slice(lineEnd + 1);
          lineEnd = buffer.indexOf("\n");
        }
      });

      this.inputStream.on("end", () => {
        this.getLogger().info("Input pipe closed, stopping transport");
        this.stop();
      });

      this.inputStream.on("error", (error) => {
        // Log error but don't stop - named pipes are finicky
        this.getLogger().error("Input pipe error (continuing)", { error: error.message });
      });

      this.outputStream.on("error", (error) => {
        this.getLogger().error("Output pipe error", { error: error.message });
        this.stop();
      });

      this.running = true;
      this.getLogger().info("Named pipe transport started");
    } catch (error) {
      this.getLogger().error("Failed to open named pipes", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async handleIncomingMessage(line: string): Promise<void> {
    try {
      const msg = JSON.parse(line);
      if (!(msg.jsonrpc && msg.id && msg.method)) return;

      let response: unknown;
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

      // Write response to output pipe
      if (this.outputStream && !this.outputStream.destroyed) {
        this.outputStream.write(`${JSON.stringify(response)}\n`);
      }
    } catch (error) {
      this.getLogger().error("Error handling MCP message", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Fallback polling mode for problematic named pipes
   */
  private startPollingMode(inputPipe: string): void {
    // Use periodic polling as fallback
    const pollInterval = setInterval(() => {
      if (!this.running) {
        clearInterval(pollInterval);
        return;
      }

      try {
        // Try to read from pipe synchronously
        const data = fs.readFileSync(inputPipe, "utf8");
        if (data.trim()) {
          const lines = data.split("\n");
          for (const line of lines) {
            if (line.trim()) {
              this.handleIncomingMessage(line.trim());
            }
          }
        }
      } catch (_error) {
        // Ignore read errors in polling mode - pipe might be empty
      }
    }, 100); // Poll every 100ms
  }

  /**
   * Stop the MCP transport
   * Closes the named pipes
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    // Close streams
    if (this.inputStream) {
      this.inputStream.destroy();
    }
    if (this.outputStream) {
      this.outputStream.end();
    }

    this.getLogger().info("Named pipe transport stopped");
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
  }

  /**
   * Set tool call handler
   */
  setToolCallHandler(handler: ToolCallHandler): void {
    this.toolCallHandler = handler;
  }
}
