/**
 * MCP stdin/stdout transport implementation
 * Handles Claude Code integration via MCP protocol
 */

import * as fs from "node:fs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

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
  private readonly config: MCPStdioConfig;

  private getLogger() {
    if (!this.logger) {
      this.logger = getLogger("mcp-stdio-transport");
    }
    return this.logger;
  }

  private server: Server;
  private transport: StdioServerTransport | null = null;
  private running = false;

  private toolListHandler?: ToolListHandler;
  private toolCallHandler?: ToolCallHandler;

  constructor(config: MCPStdioConfig) {
    this.config = config;

    // Initialize MCP Server
    // Note: Server name and version will be provided by Brooklyn engine
    this.server = new Server(
      {
        name: "brooklyn-mcp-server", // Default, will be overridden
        version: "1.1.6", // Embedded at build time
      },
      {
        capabilities: {
          tools: {}, // Brooklyn provides tools
        },
      },
    );
  }

  /**
   * Initialize the MCP transport
   */
  async initialize(): Promise<void> {
    this.getLogger().info("Initializing MCP stdio transport");

    // Set up MCP request handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      if (!this.toolListHandler) {
        throw new Error("Tool list handler not set");
      }

      this.getLogger().debug("MCP tool list request received");
      return await this.toolListHandler();
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (!this.toolCallHandler) {
        throw new Error("Tool call handler not set");
      }

      this.getLogger().debug("MCP tool call request received", {
        tool: request.params.name,
      });

      return await this.toolCallHandler(request);
    });

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

    this.getLogger().info("Starting MCP stdio transport");

    try {
      // Create transport based on configuration
      if (this.config.options?.inputPipe && this.config.options?.outputPipe) {
        // Development mode with named pipes
        this.getLogger().info("Using named pipes for development mode", {
          inputPipe: this.config.options.inputPipe,
          outputPipe: this.config.options.outputPipe,
        });

        // Create pipe-based transport with proper stream handling
        const inputStream = fs.createReadStream(this.config.options.inputPipe);
        const outputStream = fs.createWriteStream(this.config.options.outputPipe);

        // Create custom StdioServerTransport that uses our pipe streams
        this.transport = new StdioServerTransport();

        // Connect to server with custom streams by overriding the transport's streams
        // We need to replace stdin/stdout with our pipe streams
        const originalStdin = process.stdin;
        const originalStdout = process.stdout;

        try {
          // Temporarily replace stdin/stdout with our pipe streams
          (process as any).stdin = inputStream;
          (process as any).stdout = outputStream;

          await this.server.connect(this.transport);

          this.getLogger().info("MCP server connected to named pipes successfully");
        } finally {
          // Restore original stdin/stdout
          (process as any).stdin = originalStdin;
          (process as any).stdout = originalStdout;
        }

        // Keep process alive by preventing pipe streams from ending the process
        inputStream.on("end", () => {
          this.getLogger().info("Input pipe ended, stopping transport");
          this.stop().catch((err) =>
            this.getLogger().error("Error stopping transport", { error: err }),
          );
        });

        inputStream.on("error", (error) => {
          this.getLogger().error("Input pipe error", { error });
        });

        outputStream.on("error", (error) => {
          this.getLogger().error("Output pipe error", { error });
        });
      } else {
        // Standard stdio transport
        this.transport = new StdioServerTransport();

        // Connect to stdin/stdout
        await this.server.connect(this.transport);
      }

      this.running = true;
      this.getLogger().info("MCP stdio transport started successfully");

      // Note: MCP server will now handle requests via stdin/stdout
      // The process will stay alive until stdin is closed or process is terminated
    } catch (error) {
      this.getLogger().error("Failed to start MCP stdio transport", {
        error: error instanceof Error ? error.message : String(error),
      });
      this.running = false;
      throw error;
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

    this.getLogger().info("Stopping MCP stdio transport");

    try {
      // For stdio transport, we typically don't explicitly "stop"
      // The connection is managed by the parent process (Claude Code)
      // But we can clean up our state

      this.running = false;
      this.transport = null;

      this.getLogger().info("MCP stdio transport stopped");
    } catch (error) {
      this.getLogger().error("Error stopping MCP stdio transport", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
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
  updateServerInfo(name: string, version: string): void {
    // Note: MCP SDK doesn't allow updating server info after creation
    // This would need to be set during construction in a real implementation
    this.getLogger().debug("Server info update requested", { name, version });
  }
}
