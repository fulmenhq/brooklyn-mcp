/**
 * MCP Streamable HTTP transport implementation
 * Implements MCP spec for HTTP transport with SSE support
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";

import type { HTTPConfig, ToolCallHandler, ToolListHandler, Transport } from "../core/transport.js";
import { TransportType } from "../core/transport.js";
import { buildConfig } from "../shared/build-config.js";
import { getLogger } from "../shared/pino-logger.js";

/**
 * MCP Streamable HTTP transport
 * Handles JSON-RPC over HTTP POST with optional SSE for streaming
 */
export class MCPHTTPTransport implements Transport {
  readonly name = "mcp-http";
  readonly type = TransportType.HTTP;

  private logger = getLogger("mcp-http-transport");
  private readonly config: HTTPConfig;
  private server: ReturnType<typeof createServer> | null = null;
  private running = false;
  private toolListHandler?: ToolListHandler;
  private toolCallHandler?: ToolCallHandler;

  constructor(config: HTTPConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    this.logger.info("Initializing MCP HTTP transport", {
      port: this.config.options.port,
      host: this.config.options.host || "localhost",
    });

    this.server = createServer(async (req, res) => {
      try {
        await this.handleRequest(req, res);
      } catch (error) {
        this.logger.error("MCP HTTP request error", {
          url: req.url,
          method: req.method,
          error: error instanceof Error ? error.message : String(error),
        });

        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -32603,
                message: "Internal error",
              },
            }),
          );
        }
      }
    });

    this.server.on("error", (error) => {
      this.logger.error("MCP HTTP server error", { error: error.message });
    });
  }

  async start(): Promise<void> {
    if (this.running) {
      this.logger.warn("MCP HTTP transport already running");
      return;
    }

    if (!this.server) {
      throw new Error("MCP HTTP transport not initialized");
    }

    this.logger.info("Starting MCP HTTP transport");

    return new Promise((resolve, reject) => {
      if (!this.server) {
        reject(new Error("Server not initialized"));
        return;
      }

      this.server.listen(this.config.options.port, this.config.options.host || "localhost", () => {
        this.running = true;
        this.logger.info("MCP HTTP transport started", {
          port: this.config.options.port,
          host: this.config.options.host || "localhost",
        });
        resolve();
      });

      this.server.on("error", (error) => {
        this.logger.error("Failed to start MCP HTTP transport", { error: error.message });
        this.running = false;
        reject(error);
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.running) {
      this.logger.warn("MCP HTTP transport not running");
      return;
    }

    if (!this.server) {
      this.logger.warn("MCP HTTP server not initialized");
      return;
    }

    this.logger.info("Stopping MCP HTTP transport");

    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((error) => {
        if (error) {
          this.logger.error("Error stopping MCP HTTP transport", { error: error.message });
          reject(error);
        } else {
          this.running = false;
          this.logger.info("MCP HTTP transport stopped");
          resolve();
        }
      });
    });
  }

  isRunning(): boolean {
    return this.running;
  }

  setToolListHandler(handler: ToolListHandler): void {
    this.toolListHandler = handler;
  }

  setToolCallHandler(handler: ToolCallHandler): void {
    this.toolCallHandler = handler;
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Allow", "POST");
      res.end();
      return;
    }

    const body = await this.parseRequestBody(req);
    const msg = body as Record<string, unknown>;

    if (!(msg["jsonrpc"] && msg["method"])) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32600, message: "Invalid Request" },
        }),
      );
      return;
    }

    const id = msg["id"];
    if (id == null) {
      res.statusCode = 204;
      res.end();
      return;
    }

    let response: Record<string, unknown>;
    try {
      response = await this.processRequest(msg);
    } catch (e) {
      response = this.createErrorResponse(msg["id"], e);
    }

    // Check if SSE is requested for streaming
    if (req.headers.accept === "text/event-stream") {
      this.handleSSE(res, response);
    } else {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(response));
    }
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
            protocolVersion: params?.["protocolVersion"] || "2025-06-18",
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
        const callParams = params ?? {};
        if (typeof callParams["name"] !== "string")
          throw new Error("Missing or invalid 'name' in params");
        const args = (callParams["arguments"] ?? {}) as Record<string, unknown>;
        const toolInput = {
          name: callParams["name"] as string,
          arguments: args,
        };
        return {
          jsonrpc: "2.0",
          id,
          result: await this.toolCallHandler({
            params: toolInput,
            method,
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

  private handleSSE(res: ServerResponse, response: Record<string, unknown>): void {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Send initial response
    res.write(`data: ${JSON.stringify(response)}\n\n`);

    // For streaming, we can add logic here if needed for notifications
    // For now, close after initial response
    res.end();
  }

  private parseRequestBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
      req.on("error", reject);
    });
  }
}
