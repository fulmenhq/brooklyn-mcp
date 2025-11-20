/**
 * MCP FIFO transport implementation for development mode
 * Uses low-level file descriptors to properly handle named pipes
 */

import * as fs from "node:fs";
import { constants as fsConstants } from "node:fs";
import * as readline from "node:readline";

import type { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import type {
  MCPStdioConfig,
  ToolCallHandler,
  ToolListHandler,
  Transport,
} from "../core/transport.js";
import { TransportType } from "../core/transport.js";
import { negotiateHandshake } from "../shared/mcp-handshake.js";
import { getLogger } from "../shared/pino-logger.js";

// Type definitions for JSON-RPC messages
interface JsonRpcMessage {
  jsonrpc: string;
  method: string;
  id?: number | string | null;
  params?: unknown;
}

interface JsonRpcRequest extends JsonRpcMessage {
  id: number | string;
}

interface InitializeParams {
  protocolVersion?: string;
}

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
  private readStream?: fs.ReadStream;
  private lineReader?: readline.Interface;
  private inputFd?: number;
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
   * Uses non-blocking FIFO operations to avoid deadlock
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

    this.getLogger().info("Opening FIFO pipes with non-blocking approach", {
      inputPipe,
      outputPipe,
    });

    try {
      this.getLogger().debug("Starting FIFO transport with non-blocking I/O");

      // Log to stderr for debugging in foreground mode
      process.stderr.write("[FIFO] Starting transport with pipes:\n");
      process.stderr.write(`[FIFO]   Input:  ${inputPipe}\n`);
      process.stderr.write(`[FIFO]   Output: ${outputPipe}\n`);

      // Step 1: Open input pipe in non-blocking mode
      process.stderr.write("[FIFO] Opening input pipe in non-blocking mode...\n");
      try {
        this.inputFd = fs.openSync(inputPipe, fsConstants.O_RDONLY | fsConstants.O_NONBLOCK);
      } catch (error) {
        const err = error as { code?: string; message?: string };
        if (err.code === "ENXIO") {
          // No writer connected yet - this is OK, we'll wait
          process.stderr.write("[FIFO] Input pipe opened (no writer yet)\n");
          this.inputFd = fs.openSync(inputPipe, fsConstants.O_RDONLY | fsConstants.O_NONBLOCK);
        } else {
          throw error;
        }
      }

      // Create read stream from the file descriptor
      this.readStream = fs.createReadStream("", {
        fd: this.inputFd,
        encoding: "utf8",
        highWaterMark: 16,
        autoClose: false,
      });

      // Create readline interface for line-by-line processing
      this.lineReader = readline.createInterface({
        input: this.readStream,
        crlfDelay: Number.POSITIVE_INFINITY,
      });

      // Step 2: Open output pipe with retries
      await this.openOutputPipeNonBlocking(outputPipe);

      // Step 3: Streams are ready

      // Handle each line of input
      this.lineReader.on("line", (inputLine: string) => {
        const trimmedLine = inputLine.trim();
        if (trimmedLine) {
          process.stderr.write(
            `[FIFO] Received data from input pipe (${trimmedLine.length} chars)\n`,
          );
          process.stderr.write(`[FIFO] Data: ${trimmedLine.substring(0, 100)}...\n`);
          this.handleIncomingMessage(trimmedLine);
        }
      });

      // Handle errors
      this.readStream.on("error", (error: Error) => {
        this.getLogger().error("Read stream error", { error: error.message });
        process.stderr.write(`[FIFO] Error reading from pipe: ${error.message}\n`);
      });

      // Handle stream end
      this.readStream.on("end", () => {
        this.getLogger().info("Input pipe closed");
        process.stderr.write("[FIFO] Input pipe closed\n");
        this.stop();
      });

      this.running = true;
      this.getLogger().info("FIFO transport started successfully - ready for MCP communication");

      // Log final status to stderr with usage instructions
      process.stderr.write("[FIFO] Transport started successfully!\n");
      process.stderr.write("[FIFO] Ready to receive MCP messages\n");
      process.stderr.write("\n[FIFO] IMPORTANT: To avoid hanging, follow this order:\n");
      process.stderr.write(`[FIFO] 1. FIRST open a reader: tail -f ${outputPipe} &\n`);
      process.stderr.write(`[FIFO] 2. THEN send messages: echo '<json>' > ${inputPipe}\n`);
      process.stderr.write("[FIFO] \n");
      process.stderr.write("[FIFO] Example:\n");
      process.stderr.write(`[FIFO]   tail -f ${outputPipe} &\n`);
      process.stderr.write(
        `[FIFO]   echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' > ${inputPipe}\n`,
      );
    } catch (error) {
      this.getLogger().error("Failed to start FIFO transport", {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Open output pipe with non-blocking retries to avoid deadlock
   */
  private async openOutputPipeNonBlocking(outputPipe: string): Promise<void> {
    const maxRetries = 30; // 5 second total timeout with exponential backoff
    let retryCount = 0;
    const baseDelay = 100;

    while (retryCount < maxRetries) {
      try {
        this.outputFd = fs.openSync(outputPipe, fs.constants.O_WRONLY | fs.constants.O_NONBLOCK);
        this.getLogger().debug("Output pipe opened successfully", {
          attempt: retryCount + 1,
          pipe: outputPipe,
        });
        return;
      } catch (error) {
        const err = error as { code?: string; message?: string };
        if (err.code === "ENXIO" || err.code === "EAGAIN" || err.code === "EINTR") {
          // Expected errors:
          // - ENXIO: no reader connected yet
          // - EAGAIN: would block (non-blocking mode)
          // - EINTR: interrupted system call
          retryCount++;
          const delay = baseDelay * 1.5 ** Math.min(retryCount, 5); // Exponential backoff, cap at 5

          this.getLogger().debug("Output pipe not ready, retrying", {
            attempt: retryCount,
            maxRetries,
            nextDelay: Math.round(delay),
            error: err.code,
            reason: err.code === "EINTR" ? "interrupted system call" : "no reader connected",
          });

          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          // Real error - fail fast
          this.getLogger().error("Failed to open output pipe - not a connection timing issue", {
            error: err.message,
            code: err.code,
            pipe: outputPipe,
          });
          throw new Error(`Failed to open output pipe: ${err.message}`);
        }
      }
    }

    throw new Error(`Timeout opening output pipe after ${maxRetries} attempts (5s timeout)`);
  }

  /**
   * Type guard for JSON-RPC messages
   */
  private isValidJsonRpcMessage(msg: unknown): msg is JsonRpcMessage {
    if (typeof msg !== "object" || msg === null) return false;
    const obj = msg as Record<string, unknown>;
    return typeof obj["jsonrpc"] === "string" && typeof obj["method"] === "string";
  }

  /**
   * Type guard for JSON-RPC requests (with id)
   */
  private isRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
    return msg.id !== undefined && msg.id !== null;
  }

  /**
   * Clean up resources
   */
  private async cleanup(): Promise<void> {
    if (this.lineReader) {
      this.lineReader.close();
      this.lineReader = undefined;
    }
    if (this.readStream) {
      this.readStream.destroy();
      this.readStream = undefined;
    }
    if (this.inputFd !== undefined) {
      try {
        fs.closeSync(this.inputFd);
      } catch {
        // Ignore close errors
      }
      this.inputFd = undefined;
    }
    if (this.outputFd !== undefined) {
      try {
        fs.closeSync(this.outputFd);
      } catch {
        // Ignore close errors
      }
      this.outputFd = undefined;
    }
  }

  private async handleIncomingMessage(line: string): Promise<void> {
    let msg: unknown;
    try {
      msg = JSON.parse(line);
      if (!this.isValidJsonRpcMessage(msg)) return;

      // Log to stderr for debugging
      process.stderr.write(`[FIFO] Processing: ${msg.method} (id: ${msg.id || "notification"})\n`);

      // Handle notifications (no id) vs requests (with id)
      if (!this.isRequest(msg)) {
        this.handleNotification(msg);
        return;
      }

      const response = await this.processRequest(msg);
      this.sendResponse(response, msg.method);
    } catch (error) {
      this.handleError(error, msg, line);
    }
  }

  private handleNotification(msg: JsonRpcMessage): void {
    // Handle notifications like "notifications/initialized"
    if (msg.method === "notifications/initialized") {
      // Client has completed initialization, no response needed
      return;
    }
    // Ignore other notifications for now
  }

  private async processRequest(msg: JsonRpcRequest): Promise<unknown> {
    try {
      switch (msg.method) {
        case "initialize":
          return this.handleInitialize(msg);
        case "tools/list":
          return await this.handleToolsList(msg);
        case "tools/call":
          return await this.handleToolsCall(msg);
        default:
          throw new Error("Method not found");
      }
    } catch (e) {
      return {
        jsonrpc: "2.0",
        id: msg.id,
        error: {
          code: -32600,
          message: e instanceof Error ? e.message : String(e),
        },
      };
    }
  }

  private handleInitialize(msg: JsonRpcRequest): unknown {
    const params = msg.params as InitializeParams | undefined;
    const clientVersion = params?.protocolVersion;
    const negotiation = negotiateHandshake(clientVersion);

    if (!negotiation.ok) {
      return {
        jsonrpc: "2.0",
        id: msg.id,
        error: negotiation.error,
      };
    }

    return {
      jsonrpc: "2.0",
      id: msg.id,
      result: negotiation.payload,
    };
  }

  private async handleToolsList(msg: JsonRpcRequest): Promise<unknown> {
    if (!this.toolListHandler) throw new Error("Tool list handler not set");
    const result = await this.toolListHandler();
    return { jsonrpc: "2.0", id: msg.id, result };
  }

  private async handleToolsCall(msg: JsonRpcRequest): Promise<unknown> {
    if (!this.toolCallHandler) throw new Error("Tool call handler not set");
    const result = await this.toolCallHandler(msg as CallToolRequest);
    return { jsonrpc: "2.0", id: msg.id, result };
  }

  private sendResponse(response: unknown, method: string): void {
    if (this.outputFd !== undefined) {
      const responseStr = `${JSON.stringify(response)}\n`;
      fs.writeSync(this.outputFd, responseStr);
      process.stderr.write(`[FIFO] Sent response for: ${method}\n`);
    }
  }

  private handleError(error: unknown, msg: unknown, line: string): void {
    const jsonRpcMsg = msg as JsonRpcMessage | undefined;
    const errorResponse = {
      jsonrpc: "2.0",
      id: jsonRpcMsg?.id || null,
      error: {
        code: -32600,
        message: error instanceof Error ? error.message : String(error),
      },
    };

    if (this.outputFd !== undefined && jsonRpcMsg?.id !== undefined) {
      const errorStr = `${JSON.stringify(errorResponse)}\n`;
      fs.writeSync(this.outputFd, errorStr);
    }

    this.getLogger().error("Error handling MCP message", {
      error: error instanceof Error ? error.message : String(error),
      line,
    });
  }

  /**
   * Stop the MCP transport
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;
    await this.cleanup();
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
