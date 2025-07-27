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
import { getLogger } from "../shared/pino-logger.js";

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
  private pollInterval?: NodeJS.Timeout;

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
      } catch (seekError) {
        // If createReadStream fails, fall back to polling approach
        this.getLogger().info("CreateReadStream failed, using polling approach", {
          error: seekError instanceof Error ? seekError.message : String(seekError),
        });
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
        // Named pipes can have transient errors - log but continue unless critical
        const errorMessage = error.message;
        if (errorMessage.includes("EPIPE") || errorMessage.includes("ECONNRESET")) {
          this.getLogger().warn("Input pipe connection lost", { error: errorMessage });
          this.stop();
        } else {
          this.getLogger().error("Input pipe error (continuing)", { error: errorMessage });
        }
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
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line);
    } catch (error) {
      this.getLogger().error("Failed to parse message", { line, error });
      return;
    }

    if (!(msg["jsonrpc"] && msg["method"])) return;

    const isNotification = msg["id"] == null;
    if (isNotification) {
      if ((msg["method"] as string) === "notifications/initialized") {
        return;
      }
      return;
    }

    let response: Record<string, unknown>;
    try {
      response = await this.processRequest(msg);
    } catch (e) {
      response = this.createErrorResponse(msg["id"], e);
    }

    this.sendResponse(response);
  }

  private async processRequest(msg: Record<string, unknown>): Promise<Record<string, unknown>> {
    const method = msg["method"] as string;
    const params = msg["params"] as Record<string, unknown> | undefined;
    const id = msg["id"];

    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: params?.["protocolVersion"] || "2024-11-05",
            serverInfo: { name: "brooklyn-mcp-server", version: buildConfig.version },
            capabilities: {
              tools: { listChanged: true },
              resources: {},
              roots: {},
            },
          },
        };
      case "tools/list":
        if (!this.toolListHandler) throw new Error("Tool list handler not set");
        return { jsonrpc: "2.0", id, result: await this.toolListHandler() };
      case "tools/call": {
        if (!this.toolCallHandler) throw new Error("Tool call handler not set");
        const toolCallParams = params as { name: string; arguments?: Record<string, unknown> };
        return {
          jsonrpc: "2.0",
          id,
          result: await this.toolCallHandler({
            method: "tools/call",
            params: {
              name: toolCallParams.name,
              arguments: toolCallParams.arguments ?? {},
            },
          }),
        };
      }
      default:
        throw new Error("Method not found");
    }
  }

  private createErrorResponse(id: unknown, error: unknown): Record<string, unknown> {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32600,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }

  private sendResponse(response: Record<string, unknown>): void {
    if (this.outputStream && !this.outputStream.destroyed) {
      this.outputStream.write(`${JSON.stringify(response)}\n`);
    }
  }

  /**
   * Fallback polling mode for problematic named pipes
   */
  private startPollingMode(inputPipe: string): void {
    const POLL_INTERVAL_MS = 100;

    // Use periodic polling as fallback
    this.pollInterval = setInterval(() => {
      if (!this.running) {
        if (this.pollInterval) {
          clearInterval(this.pollInterval);
          this.pollInterval = undefined;
        }
        return;
      }

      try {
        // Try to read from pipe synchronously (less efficient but more reliable for FIFOs)
        const data = fs.readFileSync(inputPipe, "utf8");
        if (data.trim()) {
          const lines = data.split("\n");
          for (const line of lines) {
            if (line.trim()) {
              this.handleIncomingMessage(line.trim());
            }
          }
        }
      } catch (error) {
        // Log occasional errors but don't spam logs for empty pipe reads
        if (
          error instanceof Error &&
          !error.message.includes("EAGAIN") &&
          !error.message.includes("ENOENT")
        ) {
          this.getLogger().debug("Polling read error", { error: error.message });
        }
      }
    }, POLL_INTERVAL_MS);
  }

  /**
   * Stop the MCP transport
   * Closes the named pipes and cleans up resources
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    // Clean up polling interval if running
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }

    // Close streams
    if (this.inputStream) {
      this.inputStream.destroy();
      this.inputStream = undefined;
    }
    if (this.outputStream) {
      this.outputStream.end();
      this.outputStream = undefined;
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
