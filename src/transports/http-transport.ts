/**
 * HTTP transport implementation
 * Handles web server mode for monitoring, APIs, and dashboards
 */

import type { Server as HTTPServer } from "node:http";
import type { HTTPConfig, ToolCallHandler, ToolListHandler, Transport } from "../core/transport.js";
import { TransportType } from "../core/transport.js";
import { getLogger } from "../shared/structured-logger.js";

/**
 * HTTP transport for web server mode
 * Provides REST API endpoints and web interface
 */
export class HTTPTransport implements Transport {
  readonly name = "http";
  readonly type = TransportType.HTTP;

  private logger: ReturnType<typeof getLogger> | null = null;
  private readonly config: HTTPConfig;

  private getLogger() {
    if (!this.logger) {
      this.logger = getLogger("http-transport");
    }
    return this.logger;
  }

  private server: HTTPServer | null = null;
  private running = false;

  private toolListHandler?: ToolListHandler;
  private toolCallHandler?: ToolCallHandler;

  constructor(config: HTTPConfig) {
    this.config = config;
  }

  /**
   * Initialize the HTTP transport
   */
  async initialize(): Promise<void> {
    this.getLogger().info("Initializing HTTP transport", {
      port: this.config.options.port,
      host: this.config.options.host || "localhost",
    });

    // Create HTTP server
    const { createServer } = await import("node:http");

    this.server = createServer(async (req, res) => {
      try {
        await this.handleRequest(req, res);
      } catch (error) {
        this.getLogger().error("HTTP request error", {
          url: req.url,
          method: req.method,
          error: error instanceof Error ? error.message : String(error),
        });

        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: "Internal server error",
              message: error instanceof Error ? error.message : "Unknown error",
            }),
          );
        }
      }
    });

    // Handle server errors
    this.server.on("error", (error) => {
      this.getLogger().error("HTTP server error", {
        error: error.message,
      });
    });

    this.getLogger().info("HTTP transport initialized");
  }

  /**
   * Start the HTTP transport
   */
  async start(): Promise<void> {
    if (this.running) {
      this.getLogger().warn("HTTP transport already running");
      return;
    }

    if (!this.server) {
      throw new Error("HTTP transport not initialized");
    }

    this.getLogger().info("Starting HTTP transport");

    return new Promise((resolve, reject) => {
      if (!this.server) {
        reject(new Error("Server not initialized"));
        return;
      }

      this.server.listen(this.config.options.port, this.config.options.host || "localhost", () => {
        this.running = true;
        this.getLogger().info("HTTP transport started", {
          port: this.config.options.port,
          host: this.config.options.host || "localhost",
        });
        resolve();
      });

      this.server.on("error", (error) => {
        this.getLogger().error("Failed to start HTTP transport", {
          error: error.message,
        });
        this.running = false;
        reject(error);
      });
    });
  }

  /**
   * Stop the HTTP transport
   */
  async stop(): Promise<void> {
    if (!this.running) {
      this.getLogger().warn("HTTP transport not running");
      return;
    }

    if (!this.server) {
      this.getLogger().warn("HTTP server not initialized");
      return;
    }

    this.getLogger().info("Stopping HTTP transport");

    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((error) => {
        if (error) {
          this.getLogger().error("Error stopping HTTP transport", {
            error: error.message,
          });
          reject(error);
        } else {
          this.running = false;
          this.getLogger().info("HTTP transport stopped");
          resolve();
        }
      });
    });
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
   * Handle incoming HTTP requests
   */
  private async handleRequest(req: any, res: any): Promise<void> {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const method = req.method?.toUpperCase();

    this.getLogger().debug("HTTP request", {
      method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
    });

    // Set CORS headers if enabled
    if (this.config.options.cors) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }

    // Handle preflight requests
    if (method === "OPTIONS") {
      res.statusCode = 200;
      res.end();
      return;
    }

    // Route requests
    if (url.pathname === "/health") {
      await this.handleHealthCheck(req, res);
    } else if (url.pathname === "/status") {
      await this.handleStatus(req, res);
    } else if (url.pathname === "/tools" && method === "GET") {
      await this.handleToolList(req, res);
    } else if (url.pathname === "/tools/call" && method === "POST") {
      await this.handleToolCall(req, res);
    } else if (url.pathname === "/" || url.pathname === "/dashboard") {
      await this.handleDashboard(req, res);
    } else {
      await this.handleNotFound(req, res);
    }
  }

  /**
   * Handle health check endpoint
   */
  private async handleHealthCheck(_req: any, res: any): Promise<void> {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        status: "healthy",
        timestamp: new Date().toISOString(),
        transport: "http",
      }),
    );
  }

  /**
   * Handle status endpoint
   */
  private async handleStatus(_req: any, res: any): Promise<void> {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        transport: {
          name: this.name,
          type: this.type,
          running: this.running,
          config: {
            port: this.config.options.port,
            host: this.config.options.host || "localhost",
          },
        },
        timestamp: new Date().toISOString(),
      }),
    );
  }

  /**
   * Handle tool list endpoint
   */
  private async handleToolList(_req: any, res: any): Promise<void> {
    if (!this.toolListHandler) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Tool list handler not available",
        }),
      );
      return;
    }

    try {
      const result = await this.toolListHandler();
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(result));
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Failed to get tool list",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    }
  }

  /**
   * Handle tool call endpoint
   */
  private async handleToolCall(req: any, res: any): Promise<void> {
    if (!this.toolCallHandler) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Tool call handler not available",
        }),
      );
      return;
    }

    try {
      // Parse request body
      const body = await this.parseRequestBody(req);

      // Validate request format
      if (!body.params?.name) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: "Invalid request format",
            message: "Request must include params.name",
          }),
        );
        return;
      }

      // Create MCP-compatible request
      const mcpRequest = {
        method: "tools/call",
        params: {
          name: body.params.name,
          arguments: body.params.arguments || {},
        },
      };

      const result = await this.toolCallHandler(mcpRequest as any);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(result));
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Tool call failed",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    }
  }

  /**
   * Handle dashboard endpoint
   */
  private async handleDashboard(_req: any, res: any): Promise<void> {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Brooklyn MCP Server</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { color: #2c5aa0; }
        .endpoint { margin: 20px 0; padding: 10px; background: #f5f5f5; border-radius: 4px; }
        .method { font-weight: bold; color: #5cb85c; }
        .path { font-family: monospace; }
    </style>
</head>
<body>
    <h1 class="header">🌉 Brooklyn MCP Server</h1>
    <p>Web interface for Brooklyn browser automation platform.</p>
    
    <h2>Available Endpoints</h2>
    
    <div class="endpoint">
        <span class="method">GET</span> <span class="path">/health</span>
        <p>Health check endpoint</p>
    </div>
    
    <div class="endpoint">
        <span class="method">GET</span> <span class="path">/status</span>
        <p>Server status and configuration</p>
    </div>
    
    <div class="endpoint">
        <span class="method">GET</span> <span class="path">/tools</span>
        <p>List available automation tools</p>
    </div>
    
    <div class="endpoint">
        <span class="method">POST</span> <span class="path">/tools/call</span>
        <p>Execute automation tools via REST API</p>
    </div>
    
    <h2>Usage</h2>
    <p>This HTTP interface provides REST API access to Brooklyn's browser automation capabilities.</p>
    <p>For Claude Code integration, Brooklyn also supports MCP stdio mode.</p>
    
    <p><em>Brooklyn MCP Server v1.0 - Enterprise browser automation</em></p>
</body>
</html>`;

    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html");
    res.end(html);
  }

  /**
   * Handle 404 not found
   */
  private async handleNotFound(req: any, res: any): Promise<void> {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "Not found",
        message: `Path ${req.url} not found`,
      }),
    );
  }

  /**
   * Parse request body as JSON
   */
  private parseRequestBody(req: any): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = "";

      req.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });

      req.on("end", () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          resolve(parsed);
        } catch (_error) {
          reject(new Error("Invalid JSON in request body"));
        }
      });

      req.on("error", (error: Error) => {
        reject(error);
      });
    });
  }
}
