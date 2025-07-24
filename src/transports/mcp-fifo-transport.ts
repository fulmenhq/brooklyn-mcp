/**
 * MCP FIFO transport implementation for development mode
 * Uses low-level file descriptors to properly handle named pipes
 */

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
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
 * MCP FIFO transport for development mode
 *
 * Uses child processes to handle named pipes properly.
 * This avoids the seek errors that occur with Node.js streams.
 */
export class MCPFifoTransport implements Transport {
  readonly name = "mcp-fifo";
  readonly type = TransportType.MCP_STDIO;

  private logger: ReturnType<typeof getLogger> | null = null;
  private readonly config: MCPStdioConfig;
  private catProcess?: ChildProcess;
  private outputFd?: number;

  private getLogger() {
    if (!this.logger) {
      this.logger = getLogger("mcp-fifo-transport");
    }
    return this.logger;
  }

  private running = false;

  private toolListHandler?: ToolListHandler;
  private toolCallHandler?: ToolCallHandler;

  constructor(config: MCPStdioConfig) {
    this.config = config;
    if (!(config.options?.inputPipe && config.options?.outputPipe)) {
      throw new Error("Named pipes are required for MCPFifoTransport");
    }
  }

  /**
   * Initialize the MCP transport
   */
  async initialize(): Promise<void> {
    // Transport initialization
  }

  /**
   * Start the MCP transport
   * Uses cat process for reading and direct fd for writing
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

    this.getLogger().info("Opening FIFO pipes", { inputPipe, outputPipe });

    try {
      // Start cat process first to read from input pipe
      this.catProcess = spawn("cat", [inputPipe]);

      // Now open output pipe for writing
      // Note: This will block until a reader connects, which is expected behavior
      setTimeout(() => {
        try {
          this.outputFd = fs.openSync(outputPipe, fs.constants.O_WRONLY);
          this.getLogger().info("Output pipe opened successfully");
        } catch (err) {
          this.getLogger().error("Failed to open output pipe", {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }, 100); // Small delay to ensure pipes are ready

      let buffer = "";

      this.catProcess.stdout?.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
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

      this.catProcess.stderr?.on("data", (data: Buffer) => {
        this.getLogger().error("Cat process error", { error: data.toString() });
      });

      this.catProcess.on("exit", (code) => {
        this.getLogger().info("Cat process exited", { code });
        this.stop();
      });

      this.running = true;
      this.getLogger().info("FIFO transport started");
    } catch (error) {
      this.getLogger().error("Failed to open FIFO pipes", {
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

      // Write response to output pipe using file descriptor
      if (this.outputFd !== undefined) {
        const responseStr = `${JSON.stringify(response)}\n`;
        fs.writeSync(this.outputFd, responseStr);
      }
    } catch (error) {
      this.getLogger().error("Error handling MCP message", {
        error: error instanceof Error ? error.message : String(error),
        line,
      });
    }
  }

  /**
   * Stop the MCP transport
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    // Kill cat process
    if (this.catProcess) {
      this.catProcess.kill();
    }

    // Close output fd
    if (this.outputFd !== undefined) {
      fs.closeSync(this.outputFd);
    }

    this.getLogger().info("FIFO transport stopped");
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
