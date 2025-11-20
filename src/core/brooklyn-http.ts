/**
 * Brooklyn HTTP Mode - REST API server for programmatic tool testing
 * Phase 3 of dev mode refactoring - enables CI/CD integration and automated testing
 */

import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { parse } from "node:url";
import type { CallToolRequestParams, Tool } from "@modelcontextprotocol/sdk/types.js";

import { negotiateHandshake } from "../shared/mcp-handshake.js";
import { createCallToolRequest } from "../shared/mcp-request.js";
import { getLogger } from "../shared/pino-logger.js";
import { type BrooklynContext, BrooklynEngine } from "./brooklyn-engine.js";
import { loadConfig } from "./config.js";
import { OnboardingTools } from "./onboarding-tools.js";
import {
  browserLifecycleTools,
  contentCaptureTools,
  interactionTools,
  navigationTools,
} from "./tool-definitions.js";

export interface HTTPModeOptions {
  port?: number;
  host?: string;
  cors?: boolean;
  teamId?: string;
  verbose?: boolean;
  background?: boolean;
  pidFile?: string;
}

export interface ToolCallRequest {
  arguments?: Record<string, unknown>;
}

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  executionTime: number;
  timestamp: string;
}

export class BrooklynHTTP {
  private server: Server;
  private brooklynEngine!: BrooklynEngine;
  private context: BrooklynContext;
  private availableTools: Tool[] = [];
  private options: HTTPModeOptions;
  private readonly logger = getLogger("brooklyn-http");

  constructor(options: HTTPModeOptions = {}) {
    this.options = {
      port: 8080,
      host: "0.0.0.0",
      cors: true,
      ...options,
    };

    // Create HTTP context
    this.context = {
      teamId: options.teamId || "http-session",
      userId: "http-user",
      correlationId: `http-${Date.now()}`,
      permissions: ["browser:*"], // Full browser permissions for HTTP mode
      transport: "http",
    };

    this.server = createServer((req, res) => {
      this.handleRequest(req, res).catch((error) => {
        this.logger.error("Request handling error", { error, url: req.url });
        this.sendError(res, 500, "Internal server error");
      });
    });
  }

  async start(): Promise<void> {
    try {
      // Load configuration and initialize Brooklyn engine
      const config = await loadConfig();
      this.brooklynEngine = new BrooklynEngine({
        config,
        mcpMode: true, // Enable silent browser installation for HTTP mode
      });
      await this.brooklynEngine.initialize();

      // Get available tools from definitions
      this.availableTools = [
        ...browserLifecycleTools,
        ...navigationTools,
        ...interactionTools,
        ...contentCaptureTools,
        ...OnboardingTools.getTools(),
      ];

      // Start HTTP server
      return new Promise((resolve, reject) => {
        this.server.listen(this.options.port, this.options.host, () => {
          this.logger.info("Brooklyn HTTP Mode started", {
            port: this.options.port,
            host: this.options.host,
            tools: this.availableTools.length,
            teamId: this.context.teamId,
            background: this.options.background,
            pid: process.pid,
          });

          // Handle background mode after server starts successfully
          if (this.options.background) {
            this.writePidFile();
            this.setupGracefulShutdown();
            // Background mode - minimal output
            console.log(
              `Brooklyn HTTP server started in background (PID: ${process.pid}, Port: ${this.options.port})`,
            );
            this.setupBackgroundMode(); // Detach after message is printed
          } else {
            // Only show console output in foreground mode
            console.log("🌉 Brooklyn HTTP Mode v1.3.3");
            console.log(`🚀 Server running at http://${this.options.host}:${this.options.port}`);
            console.log(`📊 Available tools: ${this.availableTools.length}`);
            console.log(`🏷️  Team: ${this.context.teamId}`);
            console.log("");
            console.log("API Endpoints:");
            console.log("  GET  /tools           - List available tools");
            console.log("  POST /tools/{name}    - Call a tool directly");
            console.log("  POST /mcp             - Standard MCP protocol");
            console.log("  GET  /health          - Server health check");
            console.log("  GET  /metrics         - Performance metrics");
            console.log("");
          }

          resolve();
        });

        this.server.on("error", reject);
      });
    } catch (error) {
      this.logger.error("Failed to start Brooklyn HTTP server", { error });
      throw error;
    }
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        this.logger.info("Brooklyn HTTP server stopped");
        this.cleanupPidFile();
        resolve();
      });
    });
  }

  private setupBackgroundMode(): void {
    // Detach from parent process stdin - Bun uses Web Streams API
    try {
      // Type assertion for Bun-specific cancel method
      const stdinWithCancel = process.stdin as typeof process.stdin & { cancel?: () => void };
      if (stdinWithCancel && typeof stdinWithCancel.cancel === "function") {
        // Bun approach: cancel the ReadableStream
        stdinWithCancel.cancel();
      }
      // In background mode, we don't need to do much more
      // The PID file and signal handlers are already set up
    } catch (error) {
      // Ignore stdin detachment errors - not critical for background operation
      this.logger.debug("Could not detach stdin in background mode", { error });
    }
  }

  private writePidFile(): void {
    const pidFile =
      this.options.pidFile || join(process.cwd(), `.brooklyn-http-${this.options.port}.pid`);
    try {
      writeFileSync(pidFile, process.pid.toString(), "utf8");
      this.logger.info("PID file written", { pidFile, pid: process.pid });
    } catch (error) {
      this.logger.warn("Failed to write PID file", { pidFile, error });
    }
  }

  private cleanupPidFile(): void {
    const pidFile =
      this.options.pidFile || join(process.cwd(), `.brooklyn-http-${this.options.port}.pid`);
    try {
      if (existsSync(pidFile)) {
        unlinkSync(pidFile);
        this.logger.info("PID file cleaned up", { pidFile });
      }
    } catch (error) {
      this.logger.warn("Failed to cleanup PID file", { pidFile, error });
    }
  }

  private setupGracefulShutdown(): void {
    const gracefulShutdown = async (signal: string) => {
      this.logger.info("Received shutdown signal", { signal });
      try {
        await this.stop();
        process.exit(0);
      } catch (error) {
        this.logger.error("Error during graceful shutdown", { error });
        process.exit(1);
      }
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    process.on("SIGHUP", () => gracefulShutdown("SIGHUP"));
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startTime = Date.now();
    const url = parse(req.url || "", true);
    const path = url.pathname || "";
    const method = req.method?.toUpperCase() || "GET";

    // Enable CORS if configured
    if (this.options.cors) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

      if (method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }
    }

    this.logger.info("HTTP request", { method, path, userAgent: req.headers["user-agent"] });

    try {
      // Route requests
      if (method === "GET" && path === "/health") {
        await this.handleHealthCheck(res, startTime);
      } else if (method === "GET" && path === "/metrics") {
        await this.handleMetrics(res, startTime);
      } else if (method === "GET" && path === "/tools") {
        await this.handleListTools(res, startTime);
      } else if (method === "POST" && path.startsWith("/tools/")) {
        const toolName = path.substring(7); // Remove '/tools/' prefix
        await this.handleCallTool(req, res, toolName, startTime);
      } else if (method === "POST" && path === "/mcp") {
        await this.handleMCPProtocol(req, res, startTime);
      } else if (path === "/mcp") {
        // Only POST is supported for /mcp; return 400 on other verbs
        this.sendError(res, 400, `Unsupported MCP method: ${method}`);
      } else {
        this.sendError(res, 404, `Not found: ${method} ${path}`);
      }
    } catch (error) {
      this.logger.error("Request processing error", { error, method, path });
      this.sendError(res, 500, "Internal server error");
    }
  }

  private async handleHealthCheck(res: ServerResponse, startTime: number): Promise<void> {
    const response: APIResponse = {
      success: true,
      data: {
        status: "healthy",
        version: "1.3.3",
        uptime: process.uptime(),
        tools: this.availableTools.length,
        teamId: this.context.teamId,
      },
      executionTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };

    this.sendJSON(res, 200, response);
  }

  private async handleMetrics(res: ServerResponse, startTime: number): Promise<void> {
    const memUsage = process.memoryUsage();

    const response: APIResponse = {
      success: true,
      data: {
        memory: {
          rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        },
        uptime: `${Math.round(process.uptime())}s`,
        version: "1.3.3",
        tools: this.availableTools.length,
      },
      executionTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };

    this.sendJSON(res, 200, response);
  }

  private async handleListTools(res: ServerResponse, startTime: number): Promise<void> {
    const toolsData = this.availableTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      category: (tool as { category?: string }).category || "general",
      inputSchema: tool.inputSchema,
    }));

    const response: APIResponse = {
      success: true,
      data: {
        tools: toolsData,
        total: toolsData.length,
      },
      executionTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };

    this.sendJSON(res, 200, response);
  }

  private async handleCallTool(
    req: IncomingMessage,
    res: ServerResponse,
    toolName: string,
    startTime: number,
  ): Promise<void> {
    try {
      // Find the tool
      const tool = this.availableTools.find((t) => t.name === toolName);
      if (!tool) {
        this.sendError(res, 404, `Tool not found: ${toolName}`);
        return;
      }

      // Parse request body
      const body = await this.parseRequestBody(req);
      const toolRequest = body as ToolCallRequest;

      // Create MCP-style request
      const mcpRequest = createCallToolRequest({
        name: toolName,
        arguments: toolRequest.arguments,
      });

      // Execute tool via Brooklyn engine
      const mcpResponse = await this.brooklynEngine.executeToolCall(mcpRequest, this.context);

      // Extract result from MCP response
      let result: unknown;
      if (mcpResponse.content?.[0] && mcpResponse.content[0].type === "text") {
        try {
          result = JSON.parse(mcpResponse.content[0].text);
        } catch {
          result = mcpResponse.content[0].text;
        }
      } else {
        result = mcpResponse;
      }

      const response: APIResponse = {
        success: true,
        data: result,
        executionTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      };

      this.sendJSON(res, 200, response);
    } catch (error) {
      this.logger.error("Tool execution error", { error, toolName });
      this.sendError(
        res,
        500,
        `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async handleMCPProtocol(
    req: IncomingMessage,
    res: ServerResponse,
    _startTime: number,
  ): Promise<void> {
    try {
      // Parse JSON-RPC body
      const body = (await this.parseRequestBody(req)) as Record<string, unknown>;

      // JSON-RPC envelope validation
      const jsonrpc = body["jsonrpc"];
      const method = body["method"];
      const id = body["id"];
      const params = (body["params"] as Record<string, unknown> | undefined) ?? undefined;

      if (jsonrpc !== "2.0" || typeof method !== "string") {
        // JSON-RPC Invalid Request (HTTP 400 + success:false envelope for integration tests)
        this.sendError(res, 400, "Invalid MCP request format");
        return;
      }

      // Notifications (no id) -> 204 No Content
      if (id == null) {
        res.writeHead(204);
        res.end();
        return;
      }

      // Process supported methods per MCP spec
      if (method === "initialize") {
        const clientVersion = (params?.["protocolVersion"] as string | undefined) ?? undefined;
        const negotiation = negotiateHandshake(clientVersion);

        if (!negotiation.ok) {
          this.sendJSON(res, 200, {
            jsonrpc: "2.0",
            id,
            error: negotiation.error,
          });
          return;
        }

        this.sendJSON(res, 200, {
          jsonrpc: "2.0",
          id,
          result: negotiation.payload,
        });
        return;
      }

      if (method === "tools/list") {
        // Wire compatibility: use snake_case input_schema per MCP JSON expectations
        const tools = this.availableTools.map((t) => {
          const { inputSchema, ...rest } = t as Record<string, unknown>;
          // MCP server spec (2025-06-18) uses camelCase: inputSchema
          return inputSchema ? { ...rest, inputSchema } : rest;
        });

        this.sendJSON(res, 200, {
          jsonrpc: "2.0",
          id,
          result: { tools },
        });
        return;
      }

      if (method === "tools/call") {
        // Validate params
        const name = params?.["name"];
        if (typeof name !== "string") {
          this.sendJSON(res, 200, {
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "Invalid params: 'name' must be a string" },
          });
          return;
        }

        const callParams: CallToolRequestParams = {
          name,
          arguments: (params?.["arguments"] as Record<string, unknown>) ?? {},
        };

        const meta = params?.["_meta"];
        if (meta && typeof meta === "object") {
          callParams._meta = meta as CallToolRequestParams["_meta"];
        }

        const mcpRequest = createCallToolRequest(callParams);

        const mcpResponse = await this.brooklynEngine.executeToolCall(mcpRequest, this.context);

        // Return raw MCP result (content blocks) in JSON-RPC result
        this.sendJSON(res, 200, { jsonrpc: "2.0", id, result: mcpResponse });
        return;
      }

      // Unknown method -> HTTP 400 to match integration expectations (include method name)
      const methodName = typeof method === "string" ? method : "unknown";
      this.sendError(res, 400, `Unsupported MCP method: ${methodName}`);
    } catch (error) {
      this.logger.error("MCP protocol error", { error });
      // Surface as HTTP 400 with simple envelope for integration tests
      this.sendError(res, 400, "Invalid MCP request format");
    }
  }

  private async parseRequestBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let body = "";

      req.on("data", (chunk) => {
        body += chunk.toString();
      });

      req.on("end", () => {
        try {
          if (body.trim() === "") {
            resolve({});
          } else {
            resolve(JSON.parse(body));
          }
        } catch (error) {
          reject(
            new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`),
          );
        }
      });

      req.on("error", reject);
    });
  }

  private sendJSON(res: ServerResponse, statusCode: number, data: unknown): void {
    res.setHeader("Content-Type", "application/json");
    res.writeHead(statusCode);
    res.end(JSON.stringify(data, null, 2));
  }

  private sendError(res: ServerResponse, statusCode: number, message: string): void {
    const response: APIResponse = {
      success: false,
      error: message,
      executionTime: 0,
      timestamp: new Date().toISOString(),
    };

    this.sendJSON(res, statusCode, response);
  }
}
