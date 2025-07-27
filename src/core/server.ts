/**
 * Core MCP server implementation for Fulmen MCP Brooklyn
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import { config } from "../shared/config.js";
import { getLogger } from "../shared/pino-logger.js";
import { BrowserPoolManager } from "./browser-pool-manager.js";

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
  private browserPool: BrowserPoolManager;
  private security: SecurityMiddleware;

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
    this.browserPool = new BrowserPoolManager();
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

        let result: unknown;

        // Check if it's a core tool
        if (this.isCoreTools(name)) {
          result = await this.handleCoreTool(name, args);
        }
        // Check if it's an onboarding tool
        else if (this.isOnboardingTools(name)) {
          result = await OnboardingTools.handleTool(name, args);
        }
        // Delegate to plugin manager
        else {
          result = await this.pluginManager.handleToolCall(name, args);
        }

        return {
          content: [
            {
              type: "text" as const,
              text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        logger.error("Tool call failed", {
          tool: name,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });

    // Initialize browser pool
    await this.browserPool.initialize();

    // Connect onboarding tools to browser pool
    OnboardingTools.setBrowserPool(this.browserPool);

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

    // Clean up browser pool
    await this.browserPool.cleanup();

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
        name: "navigate",
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
        name: "screenshot",
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
    const coreTools = ["launch_browser", "navigate", "screenshot", "close_browser"];
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
      switch (name) {
        case "launch_browser":
          return await this.browserPool.launchBrowser(args as any);
        case "navigate":
          return await this.browserPool.navigate(args as any);
        case "screenshot":
          return await this.browserPool.screenshot(args as any);
        case "close_browser":
          return await this.browserPool.closeBrowser(args as any);
        default:
          throw new Error(`Unknown core tool: ${name}`);
      }
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
