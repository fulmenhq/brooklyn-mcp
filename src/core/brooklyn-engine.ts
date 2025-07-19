/**
 * Core Brooklyn automation engine
 * Transport-agnostic business logic for browser automation
 */

import type { Tool, CallToolRequest, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Transport, ToolListHandler, ToolCallHandler } from "./transport.js";

import { getLogger } from "../shared/structured-logger.js";
import { BrowserPoolManager } from "./browser-pool-manager.js";
import { OnboardingTools } from "./onboarding-tools.js";
import { PluginManager } from "./plugin-manager.js";
import { SecurityMiddleware } from "./security-middleware.js";
import type { BrooklynConfig } from "./config.js";

/**
 * Brooklyn engine initialization options
 */
export interface BrooklynEngineOptions {
  config: BrooklynConfig;
  correlationId?: string;
}

/**
 * Brooklyn engine context for request processing
 */
export interface BrooklynContext {
  teamId: string;
  userId?: string;
  correlationId: string;
  permissions: string[];
  transport: string;
}

/**
 * Core Brooklyn automation engine
 * Handles all business logic independent of transport mechanism
 */
export class BrooklynEngine {
  private readonly logger = getLogger("brooklyn-engine");
  private readonly config: BrooklynConfig;
  
  private pluginManager: PluginManager;
  private browserPool: BrowserPoolManager;
  private security: SecurityMiddleware;
  
  private transports = new Map<string, Transport>();
  private isInitialized = false;

  constructor(options: BrooklynEngineOptions) {
    this.config = options.config;
    
    // Set global context if correlation ID provided
    if (options.correlationId) {
      this.logger.setGlobalContext({ correlationId: options.correlationId });
    }
    
    this.pluginManager = new PluginManager();
    this.browserPool = new BrowserPoolManager(this.config.browsers);
    this.security = new SecurityMiddleware();
  }

  /**
   * Initialize the Brooklyn engine
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.logger.info("Initializing Brooklyn engine", {
      service: this.config.serviceName,
      version: this.config.version,
      teamId: this.config.teamId,
      maxBrowsers: this.config.browsers.maxInstances,
    });

    // Initialize browser pool
    await this.browserPool.initialize();

    // Connect onboarding tools to browser pool
    OnboardingTools.setBrowserPool(this.browserPool);

    // Load plugins
    await this.pluginManager.loadPlugins();

    this.isInitialized = true;
    this.logger.info("Brooklyn engine initialized successfully");
  }

  /**
   * Add a transport to the engine
   */
  async addTransport(name: string, transport: Transport): Promise<void> {
    if (this.transports.has(name)) {
      throw new Error(`Transport ${name} already exists`);
    }

    // Set up transport handlers
    transport.setToolListHandler(this.createToolListHandler(name));
    transport.setToolCallHandler(this.createToolCallHandler(name));

    // Initialize transport
    await transport.initialize();
    
    this.transports.set(name, transport);
    this.logger.info("Transport added", { name, type: transport.type });
  }

  /**
   * Start a specific transport
   */
  async startTransport(name: string): Promise<void> {
    const transport = this.transports.get(name);
    if (!transport) {
      throw new Error(`Transport ${name} not found`);
    }

    if (!this.isInitialized) {
      await this.initialize();
    }

    await transport.start();
    this.logger.info("Transport started", { name, type: transport.type });
  }

  /**
   * Stop a specific transport
   */
  async stopTransport(name: string): Promise<void> {
    const transport = this.transports.get(name);
    if (!transport) {
      throw new Error(`Transport ${name} not found`);
    }

    await transport.stop();
    this.logger.info("Transport stopped", { name });
  }

  /**
   * Start all transports
   */
  async startAll(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const startPromises = Array.from(this.transports.entries()).map(
      async ([name, transport]) => {
        try {
          await transport.start();
          this.logger.info("Transport started", { name, type: transport.type });
        } catch (error) {
          this.logger.error("Failed to start transport", { 
            name, 
            error: error instanceof Error ? error.message : String(error) 
          });
          throw error;
        }
      }
    );

    await Promise.all(startPromises);
    this.logger.info("All transports started", { 
      count: this.transports.size,
      transports: Array.from(this.transports.keys())
    });
  }

  /**
   * Stop all transports and cleanup
   */
  async cleanup(): Promise<void> {
    this.logger.info("Shutting down Brooklyn engine");

    // Stop all transports
    const stopPromises = Array.from(this.transports.values()).map(
      transport => transport.stop().catch(error => 
        this.logger.error("Error stopping transport", { error })
      )
    );
    await Promise.all(stopPromises);

    // Clean up browser pool
    await this.browserPool.cleanup();

    // Clean up plugins
    await this.pluginManager.cleanup();

    this.transports.clear();
    this.isInitialized = false;
    this.logger.info("Brooklyn engine shutdown complete");
  }

  /**
   * Get engine status
   */
  getStatus() {
    const transportStatus = Array.from(this.transports.entries()).map(
      ([name, transport]) => ({
        name,
        type: transport.type,
        running: transport.isRunning(),
      })
    );

    return {
      initialized: this.isInitialized,
      config: {
        serviceName: this.config.serviceName,
        version: this.config.version,
        teamId: this.config.teamId,
        maxBrowsers: this.config.maxBrowsers,
      },
      transports: transportStatus,
      browserPool: {
        ...this.browserPool.getStats(),
        metrics: this.browserPool.getResourceMetrics(),
      },
      plugins: {
        loaded: this.pluginManager.getAllTools().length,
      },
    };
  }

  /**
   * Create tool list handler for a transport
   */
  private createToolListHandler(transportName: string): ToolListHandler {
    return async () => {
      const correlationId = this.generateCorrelationId();
      
      this.logger.debug("Tool list requested", { 
        transport: transportName,
        correlationId 
      });

      try {
        const coreTools = await this.getCoreTools();
        const onboardingTools = OnboardingTools.getTools();
        const pluginTools = this.pluginManager.getAllTools();

        const allTools = [...coreTools, ...onboardingTools, ...pluginTools];
        
        this.logger.debug("Tool list generated", { 
          transport: transportName,
          correlationId,
          toolCount: allTools.length 
        });

        return { tools: allTools };
      } catch (error) {
        this.logger.error("Failed to generate tool list", {
          transport: transportName,
          correlationId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    };
  }

  /**
   * Create tool call handler for a transport
   */
  private createToolCallHandler(transportName: string): ToolCallHandler {
    return async (request: CallToolRequest) => {
      const correlationId = this.generateCorrelationId();
      const { name, arguments: args } = request.params;

      this.logger.debug("Tool call received", {
        transport: transportName,
        correlationId,
        tool: name,
        args,
      });

      try {
        // Create context for this request
        const context: BrooklynContext = {
          teamId: this.config.teamId,
          correlationId,
          permissions: [], // TODO: Extract from request
          transport: transportName,
        };

        // Apply security middleware
        await this.security.validateRequest(request);

        let result: unknown;

        // Route to appropriate handler
        if (this.isCoreTools(name)) {
          result = await this.handleCoreTool(name, args, context);
        } else if (this.isOnboardingTools(name)) {
          result = await OnboardingTools.handleTool(name, args);
        } else {
          result = await this.pluginManager.handleToolCall(name, args);
        }

        this.logger.debug("Tool call completed", {
          transport: transportName,
          correlationId,
          tool: name,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        this.logger.error("Tool call failed", {
          transport: transportName,
          correlationId,
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
    };
  }

  /**
   * Get core tools
   */
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

  /**
   * Check if tool is a core tool
   */
  private isCoreTools(toolName: string): boolean {
    const coreTools = ["launch_browser", "navigate", "screenshot", "close_browser"];
    return coreTools.includes(toolName);
  }

  /**
   * Check if tool is an onboarding tool
   */
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

  /**
   * Handle core tool execution
   */
  private async handleCoreTool(name: string, args: unknown, context: BrooklynContext): Promise<unknown> {
    this.logger.debug("Executing core tool", { 
      tool: name, 
      correlationId: context.correlationId 
    });

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
      this.logger.error("Core tool execution failed", {
        tool: name,
        correlationId: context.correlationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generate correlation ID for request tracking
   */
  private generateCorrelationId(): string {
    return `brooklyn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}