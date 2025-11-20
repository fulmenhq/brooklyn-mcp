/**
 * MCP Unix Socket transport implementation for development mode
 * Reliable alternative to named pipes with full Node.js compatibility
 */

import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";

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
 * MCP Unix Socket transport for development mode
 *
 * Uses Unix domain sockets for reliable, bidirectional communication.
 * Avoids all the blocking and compatibility issues with Node.js named pipes.
 */
export class MCPSocketTransport implements Transport {
  readonly name = "mcp-socket";
  readonly type = TransportType.MCP_STDIO;

  private logger: ReturnType<typeof getLogger> | null = null;
  private readonly config: MCPStdioConfig;
  private server?: net.Server;
  private socketPath: string;
  private running = false;

  private toolListHandler?: ToolListHandler;
  private toolCallHandler?: ToolCallHandler;

  private getLogger() {
    if (!this.logger) {
      this.logger = getLogger("mcp-socket-transport");
    }
    return this.logger;
  }

  constructor(config: MCPStdioConfig) {
    this.config = config;

    // Extract socket path from options or generate default
    this.socketPath = this.generateSocketPath();

    if (!this.socketPath) {
      throw new Error("Socket path is required for MCPSocketTransport");
    }
  }

  private generateSocketPath(): string {
    // Check for explicit socket path
    if (this.config.options?.socketPath) {
      return this.config.options.socketPath as string;
    }

    // Generate from inputPipe if provided (for compatibility)
    if (this.config.options?.inputPipe) {
      const inputPipe = this.config.options.inputPipe as string;
      const baseName = path.basename(inputPipe, "-in");
      const dirName = path.dirname(inputPipe);
      return path.join(dirName, `${baseName}.sock`);
    }

    // Default socket path
    const timestamp = Date.now();
    const instanceUuid = Math.random().toString(36).substring(2, 8);
    const socketDir = process.env["BROOKLYN_DEV_SOCKET_DIR"] || "/tmp";
    return path.join(socketDir, `brooklyn-mcp-dev-${instanceUuid}-${timestamp}.sock`);
  }

  /**
   * Initialize the MCP transport
   */
  async initialize(): Promise<void> {
    // Transport initialization
  }

  /**
   * Start the MCP transport
   * Creates Unix domain socket server for reliable communication
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.getLogger().info("Starting Unix socket transport", {
      socketPath: this.socketPath,
    });

    try {
      // Clean up any existing socket file
      await this.cleanupSocket();

      // Create Unix domain socket server
      this.server = net.createServer((socket) => {
        this.handleConnection(socket);
      });

      // Set up server error handling
      this.server.on("error", (error) => {
        this.getLogger().error("Socket server error", { error: error.message });
      });

      // Start listening on Unix socket
      await new Promise<void>((resolve, reject) => {
        this.server?.listen(this.socketPath, () => {
          this.getLogger().info("✅ Unix socket transport started successfully", {
            socketPath: this.socketPath,
          });
          resolve();
        });

        this.server?.on("error", reject);
      });

      // Set secure permissions on socket file
      fs.chmodSync(this.socketPath, 0o600);

      this.running = true;

      // Log usage instructions
      this.logUsageInstructions();
    } catch (error) {
      this.getLogger().error("Failed to start socket transport", {
        error: error instanceof Error ? error.message : String(error),
      });
      await this.cleanup();
      throw error;
    }
  }

  private async cleanupSocket(): Promise<void> {
    try {
      if (fs.existsSync(this.socketPath)) {
        fs.unlinkSync(this.socketPath);
        this.getLogger().debug("Cleaned up existing socket file", {
          socketPath: this.socketPath,
        });
      }
    } catch (error) {
      this.getLogger().warn("Error cleaning up socket file", {
        error: error instanceof Error ? error.message : String(error),
        socketPath: this.socketPath,
      });
    }
  }

  private logUsageInstructions(): void {
    // Log to stderr for debugging in foreground mode
    process.stderr.write("[SOCKET] Transport started successfully!\n");
    process.stderr.write("[SOCKET] Ready to receive MCP messages\n");
    process.stderr.write("\n[SOCKET] Usage instructions:\n");
    process.stderr.write(
      `[SOCKET]   Test connection: echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | nc -U ${this.socketPath}\n`,
    );
    process.stderr.write(`[SOCKET]   Interactive mode: nc -U ${this.socketPath}\n`);
    process.stderr.write("[SOCKET]   Or use any Unix socket client\n");
    process.stderr.write("[SOCKET] \n");
  }

  private handleConnection(socket: net.Socket): void {
    this.getLogger().info("New client connected to socket");

    // Set up socket data handling
    socket.setEncoding("utf8");

    let buffer = "";

    socket.on("data", (chunk: string) => {
      buffer += chunk;

      // Process complete lines (JSON-RPC messages)
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine) {
          this.handleIncomingMessage(trimmedLine, socket);
        }
      }
    });

    socket.on("error", (error: Error) => {
      this.getLogger().error("Socket connection error", {
        error: error.message,
      });
    });

    socket.on("close", () => {
      this.getLogger().info("Client disconnected from socket");
    });
  }

  private async handleIncomingMessage(line: string, socket: net.Socket): Promise<void> {
    let msg: unknown;
    try {
      msg = JSON.parse(line);
      if (!this.isValidJsonRpcMessage(msg)) {
        this.sendError(socket, null, "Invalid JSON-RPC message format");
        return;
      }

      // Log to stderr for debugging
      process.stderr.write(
        `[SOCKET] Processing: ${msg.method} (id: ${msg.id || "notification"})\n`,
      );

      // Handle notifications (no id) vs requests (with id)
      if (!this.isRequest(msg)) {
        this.handleNotification(msg);
        return;
      }

      const response = await this.processRequest(msg);
      this.sendResponse(socket, response, msg.method);
    } catch (error) {
      this.handleError(error, msg, line, socket);
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

  private sendResponse(socket: net.Socket, response: unknown, method: string): void {
    try {
      const responseStr = `${JSON.stringify(response)}\n`;
      socket.write(responseStr);
      process.stderr.write(`[SOCKET] Sent response for: ${method}\n`);
    } catch (error) {
      this.getLogger().error("Error sending response", {
        error: error instanceof Error ? error.message : String(error),
        method,
      });
    }
  }

  private sendError(socket: net.Socket, id: string | number | null, message: string): void {
    const errorResponse = {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32600,
        message,
      },
    };

    try {
      const errorStr = `${JSON.stringify(errorResponse)}\n`;
      socket.write(errorStr);
    } catch (error) {
      this.getLogger().error("Error sending error response", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private handleError(error: unknown, msg: unknown, line: string, socket: net.Socket): void {
    const jsonRpcMsg = msg as JsonRpcMessage | undefined;
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (jsonRpcMsg?.id !== undefined) {
      this.sendError(socket, jsonRpcMsg.id, errorMessage);
    }

    this.getLogger().error("Error handling MCP message", {
      error: errorMessage,
      line,
    });
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
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server?.close(() => {
          this.getLogger().debug("Socket server closed");
          resolve();
        });
      });
      this.server = undefined;
    }

    await this.cleanupSocket();
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
    this.getLogger().info("Socket transport stopped");
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

  /**
   * Get the socket path for external access
   */
  getSocketPath(): string {
    return this.socketPath;
  }
}
