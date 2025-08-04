/**
 * Core MCP server implementation for Fulmen MCP Brooklyn
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import { config } from "../shared/config.js";
import { getLogger } from "../shared/pino-logger.js";
import { BrooklynEngine, type BrooklynContext } from "./brooklyn-engine.js";

// Lazy logger initialization to avoid circular dependency
const logger = getLogger("server");
import { OnboardingTools } from "./onboarding-tools.js";
import { PluginManager } from "./plugin-manager.js";
import { SecurityMiddleware } from "./security-middleware.js";

export interface ServerContext {
  teamId: string;
  userId?: string;
  permissions: string[];
}

export class MCPServer {
  private server: Server;
  private pluginManager: PluginManager;
  private security: SecurityMiddleware;
  private engine!: BrooklynEngine;
  private context!: BrooklynContext;

  constructor() {
    this.server = new Server(
      {
        name: config.serviceName,
        version: config.version,
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.pluginManager = new PluginManager();
    this.security = new SecurityMiddleware();
  }

  async initialize(): Promise<void> {
    logger.info("Initializing MCP server", {
      service: config.serviceName,
      version: config.version,
    });

    // Emit ready signal for tests
    if (process.env.NODE_ENV === "test") {
      process.stdout.write(`${JSON.stringify({ ready: true })}\n`);
    }

    // Set up core tool handlers
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug("Handling tools/list request");

      const coreTools = await this.getCoreTools();
      const onboardingTools = OnboardingTools.getTools();
      const pluginTools = this.pluginManager.getAllTools();

      return {
        tools: [...coreTools, ...onboardingTools, ...pluginTools],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      logger.debug("Tool call received", {
        tool: name,
        args,
      });

      try {
        // Apply security middleware
        await this.security.validateRequest(request);

        let rawResult: unknown;

        // Check if it's a core tool
        if (this.isCoreTools(name)) {
          rawResult = await this.handleCoreTool(name, args);
        }
        // Check if it's an onboarding tool
        else if (this.isOnboardingTools(name)) {
          rawResult = await OnboardingTools.handleTool(name, args);
        }
        // Delegate to plugin manager
        else {
          rawResult = await this.pluginManager.handleToolCall(name, args);
        }

        // Normalize to engine/router envelope expected by tests
        // Tests expect JSON-RPC result.result.browserId and metadata.executionTime
        const result =
          typeof rawResult === "object" && rawResult !== null
            ? (rawResult as any)
            : { value: rawResult };

        const response = {
          result: {
            result,
            metadata: {
              executionTime: typeof result?.executionTime === "number" ? result.executionTime : 0,
            },
          },
        };

        return response as any;
      } catch (error) {
        // Tests expect JSON-RPC error field populated
        logger.error("Tool call failed", {
          tool: name,
          error: error instanceof Error ? error.message : String(error),
        });

        return {
          error: {
            code: -32000,
            message: error instanceof Error ? error.message : "Tool execution failed",
            data:
              error && typeof error === "object"
                ? { detail: (error as any).stack || String(error) }
                : undefined,
          },
        } as any;
      }
    });

    // Initialize Brooklyn engine (unified router path)
    this.engine = new BrooklynEngine({
      config: (config as unknown) as import("./config.js").BrooklynConfig,
      mcpMode: true, // enable silent browser installation in MCP mode
    });

    // Default MCP server context; tool handlers may override teamId per request
    this.context = {
      teamId: (config as any).teamId || "default",
      permissions: ["browser:*"],
      transport: "stdio",
      correlationId: `mcp-${Date.now()}`,
    } as BrooklynContext;

    // Connect onboarding tools to unified status source
    OnboardingTools.setBrowserPool({
      // Adapter to preserve onboarding status queries via engine
      async getStatus() {
        return (await (this as any).engine?.getStatus?.()) ?? { activeSessions: 0, maxBrowsers: 0, sessions: [] };
      },
    } as unknown as any);

    // Load plugins
    await this.pluginManager.loadPlugins();

    logger.info("MCP server initialized successfully");
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info("MCP server connected via stdio");
    logger.info("Server ready for requests");
  }

  async stop(): Promise<void> {
    logger.info("Stopping MCP server");

    // Clean up engine
    if (this.engine) {
      await this.engine.cleanup();
    }

    // Clean up plugins
    await this.pluginManager.cleanup();

    logger.info("MCP server stopped");
  }

  private async getCoreTools(): Promise<Tool[]> {
    return [
      {
        name: "launch_browser",
        description: "Launch a new browser instance",
        inputSchema: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: ["chromium", "firefox", "webkit"],
              description: "Browser type to launch",
            },
            headless: {
              type: "boolean",
              description: "Run browser in headless mode",
              default: true,
            },
            teamId: {
              type: "string",
              description: "Team identifier for access control",
            },
          },
          required: ["type", "teamId"],
        },
      },
      {
        name: "navigate_to_url",
        description: "Navigate to a URL",
        inputSchema: {
          type: "object",
          properties: {
            browserId: {
              type: "string",
              description: "Browser instance ID",
            },
            url: {
              type: "string",
              description: "URL to navigate to",
            },
            waitUntil: {
              type: "string",
              enum: ["load", "domcontentloaded", "networkidle"],
              description: "Wait condition",
              default: "load",
            },
          },
          required: ["browserId", "url"],
        },
      },
      {
        name: "take_screenshot",
        description: "Take a screenshot of the page",
        inputSchema: {
          type: "object",
          properties: {
            browserId: {
              type: "string",
              description: "Browser instance ID",
            },
            fullPage: {
              type: "boolean",
              description: "Capture full page",
              default: false,
            },
            quality: {
              type: "number",
              description: "Image quality (0-100)",
              default: 80,
            },
          },
          required: ["browserId"],
        },
      },
      {
        name: "close_browser",
        description: "Close a browser instance",
        inputSchema: {
          type: "object",
          properties: {
            browserId: {
              type: "string",
              description: "Browser instance ID",
            },
          },
          required: ["browserId"],
        },
      },
    ];
  }

  private isCoreTools(toolName: string): boolean {
    const coreTools = ["launch_browser", "navigate_to_url", "take_screenshot", "close_browser"];
    return coreTools.includes(toolName);
  }

  private isOnboardingTools(toolName: string): boolean {
    const onboardingTools = [
      "brooklyn_status",
      "brooklyn_capabilities",
      "brooklyn_getting_started",
      "brooklyn_examples",
      "brooklyn_team_setup",
      "brooklyn_troubleshooting",
    ];
    return onboardingTools.includes(toolName);
  }

  private async handleCoreTool(name: string, args: unknown): Promise<unknown> {
    try {
      // Route ALL core tools through BrooklynEngine → MCPBrowserRouter
      // Map legacy tool names to engine/router names
      const mappedName =
        name === "navigate" ? "navigate_to_url" : name === "screenshot" ? "take_screenshot" : name;

      const response = await this.engine.executeToolCall(
        {
          params: {
            name: mappedName,
            arguments: (args as Record<string, unknown>) ?? {},
          },
          method: "tools/call",
        } as unknown as import("@modelcontextprotocol/sdk/types.js").CallToolRequest,
        this.context,
      );

      // Engine returns MCP-style content wrapper; unwrap into result value
      if ((response as any)?.error) {
        const err = (response as any).error;
        throw new Error(err?.message || "Tool execution failed");
      }

      // If content is a text block, try to parse JSON, else return as-is
      const content = (response as any)?.content;
      if (Array.isArray(content) && content.length > 0 && content[0]?.type === "text") {
        const text = content[0].text as string;
        try {
          return JSON.parse(text);
        } catch {
          return { message: text };
        }
      }

      // If already object/nested 'result', pass through
      return (response as any)?.result ?? response;
    } catch (error) {
      logger.error("Core tool execution failed", {
        tool: name,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

export async function createServer(): Promise<MCPServer> {
  const server = new MCPServer();
  await server.initialize();
  return server;
}
