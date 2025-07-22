/**
 * Core Brooklyn automation engine
 * Transport-agnostic business logic for browser automation
 */

import type { CallToolRequest, CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ToolCallHandler, ToolListHandler, Transport } from "./transport.js";

import { getLogger } from "../shared/structured-logger.js";
import { BrowserPoolManager } from "./browser-pool-manager.js";
import type { BrooklynConfig } from "./config.js";
import { ToolDiscoveryService } from "./discovery/tool-discovery-service.js";
import { OnboardingTools } from "./onboarding-tools.js";
import { PluginManager } from "./plugin-manager.js";
import { SecurityMiddleware } from "./security-middleware.js";
import type { EnhancedTool } from "./tool-definitions.js";

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
  private logger: ReturnType<typeof getLogger> | null = null;
  private readonly config: BrooklynConfig;

  private getLogger() {
    if (!this.logger) {
      this.logger = getLogger("brooklyn-engine");
    }
    return this.logger;
  }

  private pluginManager: PluginManager;
  private browserPool: BrowserPoolManager;
  private security: SecurityMiddleware;
  private discovery: ToolDiscoveryService;

  private transports = new Map<string, Transport>();
  private isInitialized = false;

  constructor(options: BrooklynEngineOptions) {
    this.config = options.config;

    // Correlation ID will be included in log metadata instead
    // (logger.js doesn't support setGlobalContext)

    this.pluginManager = new PluginManager();
    this.browserPool = new BrowserPoolManager();
    this.security = new SecurityMiddleware({
      allowedDomains: this.config.security.allowedDomains,
      rateLimiting: this.config.security.rateLimit,
      maxBrowsers: this.config.browsers.maxInstances,
      teamIsolation: true,
    });

    this.discovery = new ToolDiscoveryService({
      version: this.config.version,
      serverName: "Brooklyn MCP Server",
      description: "Enterprise-ready browser automation platform with AI-friendly tool discovery",
      capabilities: [
        "browser-automation",
        "screenshot-capture",
        "web-navigation",
        "content-extraction",
        "form-automation",
      ],
      categories: [],
    });

    // Register standard categories
    this.registerStandardCategories();
  }

  /**
   * Register standard tool categories
   */
  private registerStandardCategories(): void {
    const categories = [
      {
        id: "browser-lifecycle",
        name: "Browser Lifecycle",
        description: "Tools for managing browser instances",
        icon: "🌐",
      },
      {
        id: "navigation",
        name: "Navigation",
        description: "Tools for navigating web pages",
        icon: "🧭",
      },
      {
        id: "content-capture",
        name: "Content Capture",
        description: "Tools for capturing page content",
        icon: "📸",
      },
      {
        id: "interaction",
        name: "Interaction",
        description: "Tools for interacting with page elements",
        icon: "🖱️",
      },
      {
        id: "discovery",
        name: "Discovery",
        description: "Tools for discovering and understanding available capabilities",
        icon: "🔍",
      },
      {
        id: "onboarding",
        name: "Onboarding",
        description: "Tools for getting started with Brooklyn",
        icon: "🚀",
      },
    ];

    for (const category of categories) {
      this.discovery.registerCategory(category);
    }
  }

  /**
   * Initialize the Brooklyn engine
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.getLogger().info("Initializing Brooklyn engine", {
      service: this.config.serviceName,
      version: this.config.version,
      teamId: this.config.teamId,
      maxBrowsers: this.config.browsers.maxInstances,
    });

    // Initialize browser pool
    await this.browserPool.initialize();

    // Connect onboarding tools to browser pool
    OnboardingTools.setBrowserPool(this.browserPool);

    // Register all tools with discovery service
    await this.registerAllTools();

    // Load plugins
    await this.pluginManager.loadPlugins();

    this.isInitialized = true;
    this.getLogger().info("Brooklyn engine initialized successfully");
  }

  /**
   * Register all tools with the discovery service
   */
  private async registerAllTools(): Promise<void> {
    try {
      // Register enhanced core tools
      const { getAllTools } = await import("./tool-definitions.js");
      const enhancedTools = getAllTools();
      this.discovery.registerTools(enhancedTools);

      // Register onboarding tools as enhanced tools
      const onboardingTools = OnboardingTools.getTools();
      const enhancedOnboarding: EnhancedTool[] = onboardingTools.map((tool) => ({
        ...tool,
        category: "onboarding",
        examples: [],
        errors: [],
      }));
      this.discovery.registerTools(enhancedOnboarding);

      this.getLogger().info("Registered tools with discovery service", {
        coreTools: enhancedTools.length,
        onboardingTools: enhancedOnboarding.length,
        totalTools: this.discovery.getMetadata().totalTools,
      });
    } catch (error) {
      this.getLogger().warn("Failed to register enhanced tools, using basic tools", { error });

      // Register basic tools as fallback
      const basicTools = this.getBasicCoreTools();
      const enhancedBasic: EnhancedTool[] = basicTools.map((tool) => ({
        ...tool,
        category: this.inferCategory(tool.name),
        examples: [],
        errors: [],
      }));
      this.discovery.registerTools(enhancedBasic);
    }
  }

  /**
   * Infer category from tool name
   */
  private inferCategory(toolName: string): string {
    if (toolName.includes("browser") || toolName.includes("launch") || toolName.includes("close")) {
      return "browser-lifecycle";
    }
    if (toolName.includes("navigate") || toolName.includes("go_")) {
      return "navigation";
    }
    if (
      toolName.includes("screenshot") ||
      toolName.includes("pdf") ||
      toolName.includes("content")
    ) {
      return "content-capture";
    }
    if (toolName.includes("click") || toolName.includes("type") || toolName.includes("select")) {
      return "interaction";
    }
    if (toolName.includes("brooklyn_")) {
      return "discovery";
    }
    return "general";
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
    this.getLogger().info("Transport added", { name, type: transport.type });
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
    this.getLogger().info("Transport started", { name, type: transport.type });
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
    this.getLogger().info("Transport stopped", { name });
  }

  /**
   * Start all transports
   */
  async startAll(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const startPromises = Array.from(this.transports.entries()).map(async ([name, transport]) => {
      try {
        await transport.start();
        this.getLogger().info("Transport started", { name, type: transport.type });
      } catch (error) {
        this.getLogger().error("Failed to start transport", {
          name,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    });

    await Promise.all(startPromises);
    this.getLogger().info("All transports started", {
      count: this.transports.size,
      transports: Array.from(this.transports.keys()),
    });
  }

  /**
   * Stop all transports and cleanup
   */
  async cleanup(): Promise<void> {
    this.getLogger().info("Shutting down Brooklyn engine");

    // Stop all transports
    const stopPromises = Array.from(this.transports.values()).map((transport) =>
      transport
        .stop()
        .catch((error) => this.getLogger().error("Error stopping transport", { error })),
    );
    await Promise.all(stopPromises);

    // Clean up browser pool
    await this.browserPool.cleanup();

    // Clean up plugins
    await this.pluginManager.cleanup();

    this.transports.clear();
    this.isInitialized = false;
    this.getLogger().info("Brooklyn engine shutdown complete");
  }

  /**
   * Get engine status
   */
  getStatus() {
    const transportStatus = Array.from(this.transports.entries()).map(([name, transport]) => ({
      name,
      type: transport.type,
      running: transport.isRunning(),
    }));

    return {
      initialized: this.isInitialized,
      config: {
        serviceName: this.config.serviceName,
        version: this.config.version,
        teamId: this.config.teamId,
        maxBrowsers: this.config.browsers.maxInstances,
      },
      transports: transportStatus,
      browserPool: this.browserPool.getStatus(),
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

      this.getLogger().debug("Tool list requested", {
        transport: transportName,
        correlationId,
      });

      try {
        // Get all tools from discovery service (already includes plugin tools)
        const allTools = this.discovery.getMCPTools();

        // Also add any plugin tools not yet registered with discovery
        const pluginTools = this.pluginManager.getAllTools();
        const discoveredToolNames = new Set(allTools.map((t) => t.name));

        for (const pluginTool of pluginTools) {
          if (!discoveredToolNames.has(pluginTool.name)) {
            allTools.push(pluginTool);
            // Register with discovery for future use
            this.discovery.registerTool({
              ...pluginTool,
              category: "plugin",
              examples: [],
              errors: [],
            });
          }
        }

        this.getLogger().debug("Tool list generated", {
          transport: transportName,
          correlationId,
          toolCount: allTools.length,
          categories: this.discovery.getCategories().map((c) => c.id),
        });

        return { tools: allTools };
      } catch (error) {
        this.getLogger().error("Failed to generate tool list", {
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

      this.getLogger().debug("Tool call received", {
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

        // Apply security middleware with context
        await this.security.validateRequest(request, {
          teamId: this.config.teamId,
          userId: context.userId,
        });

        let result: unknown;

        // Route to appropriate handler
        if (this.isCoreTools(name)) {
          result = await this.handleCoreTool(name, args, context);
        } else if (this.isOnboardingTools(name)) {
          result = await OnboardingTools.handleTool(name, args);
        } else {
          result = await this.pluginManager.handleToolCall(name, args);
        }

        this.getLogger().debug("Tool call completed", {
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
        this.getLogger().error("Tool call failed", {
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
   * Get core tools from enhanced tool definitions
   */
  private async getCoreTools(): Promise<Tool[]> {
    try {
      const { getAllTools } = await import("./tool-definitions.js");
      const enhancedTools = getAllTools();

      // Convert enhanced tools to MCP Tool format
      return enhancedTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));
    } catch (error) {
      // Fallback to basic tools if enhanced definitions not available yet
      this.getLogger().warn("Enhanced tool definitions not available, using basic tools", {
        error,
      });
      return this.getBasicCoreTools();
    }
  }

  /**
   * Get basic core tools (fallback)
   */
  private getBasicCoreTools(): Tool[] {
    return [
      {
        name: "launch_browser",
        description: "Launch a new browser instance (Chromium, Firefox, or WebKit)",
        inputSchema: {
          type: "object",
          properties: {
            browserType: {
              type: "string",
              enum: ["chromium", "firefox", "webkit"],
              default: "chromium",
            },
            headless: {
              type: "boolean",
              default: true,
            },
          },
        },
      },
      {
        name: "navigate_to_url",
        description: "Navigate browser to a specific URL",
        inputSchema: {
          type: "object",
          properties: {
            browserId: { type: "string" },
            url: { type: "string" },
          },
          required: ["browserId", "url"],
        },
      },
      {
        name: "take_screenshot",
        description: "Capture a screenshot of the current page",
        inputSchema: {
          type: "object",
          properties: {
            browserId: { type: "string" },
            fullPage: { type: "boolean", default: false },
          },
          required: ["browserId"],
        },
      },
      {
        name: "brooklyn_list_tools",
        description: "List all available Brooklyn tools organized by category",
        inputSchema: {
          type: "object",
          properties: {
            category: { type: "string" },
            includeExamples: { type: "boolean", default: true },
          },
        },
      },
      {
        name: "brooklyn_tool_help",
        description: "Get detailed help and examples for a specific tool",
        inputSchema: {
          type: "object",
          properties: {
            toolName: { type: "string" },
          },
          required: ["toolName"],
        },
      },
    ];
  }

  /**
   * Check if tool is a core tool
   */
  private isCoreTools(toolName: string): boolean {
    const coreTools = [
      // Browser lifecycle
      "launch_browser",
      "close_browser",
      "list_active_browsers",
      // Navigation
      "navigate_to_url",
      "go_back",
      // Element interaction
      "click_element",
      "fill_text",
      "fill_form",
      "wait_for_element",
      "get_text_content",
      "validate_element_presence",
      "find_elements",
      // Content capture
      "take_screenshot",
      // Discovery
      "brooklyn_list_tools",
      "brooklyn_tool_help",
    ];
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
  private async handleCoreTool(
    name: string,
    args: unknown,
    context: BrooklynContext,
  ): Promise<unknown> {
    this.getLogger().debug("Executing core tool", {
      tool: name,
      correlationId: context.correlationId,
    });

    try {
      switch (name) {
        // Browser lifecycle tools
        case "launch_browser":
          return await this.browserPool.launchBrowser(args as any);
        case "close_browser":
          return await this.browserPool.closeBrowser(args as any);
        case "list_active_browsers":
          return await this.browserPool.listActiveBrowsers();

        // Navigation tools
        case "navigate_to_url":
          return await this.browserPool.navigate(args as any);
        case "go_back":
          return await this.browserPool.goBack(args as any);

        // Element interaction tools
        case "click_element":
          return await this.browserPool.clickElement(args as any);
        case "fill_text":
          return await this.browserPool.fillText(args as any);
        case "fill_form":
          return await this.browserPool.fillForm(args as any);
        case "wait_for_element":
          return await this.browserPool.waitForElement(args as any);
        case "get_text_content":
          return await this.browserPool.getTextContent(args as any);
        case "validate_element_presence":
          return await this.browserPool.validateElementPresence(args as any);
        case "find_elements":
          return await this.browserPool.findElements(args as any);

        // Content capture tools
        case "take_screenshot":
          return await this.browserPool.screenshot(args as any);

        // Discovery tools
        case "brooklyn_list_tools":
          return await this.handleListTools(args as any);
        case "brooklyn_tool_help":
          return await this.handleToolHelp(args as any);

        default:
          throw new Error(`Unknown core tool: ${name}`);
      }
    } catch (error) {
      this.getLogger().error("Core tool execution failed", {
        tool: name,
        correlationId: context.correlationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Handle brooklyn_list_tools discovery tool
   */
  private async handleListTools(args: {
    category?: string;
    includeExamples?: boolean;
  }): Promise<unknown> {
    if (args.category) {
      const tools = this.discovery.getToolsByCategory(args.category);
      return {
        category: args.category,
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          examples: args.includeExamples ? tool.examples : undefined,
        })),
        count: tools.length,
      };
    }
    const categories = this.discovery.getCategories();
    const metadata = this.discovery.getMetadata();

    return {
      serverName: metadata.serverName,
      version: metadata.version,
      description: metadata.description,
      categories: categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        icon: cat.icon,
      })),
      totalTools: metadata.totalTools,
      toolsByCategory: categories.map((category) => ({
        category: category.id,
        name: category.name,
        tools: this.discovery.getToolsByCategory(category.id).map((tool) => tool.name),
        count: this.discovery.getToolsByCategory(category.id).length,
      })),
      capabilities: metadata.capabilities,
      lastUpdated: metadata.lastUpdated,
    };
  }

  /**
   * Handle brooklyn_tool_help discovery tool
   */
  private async handleToolHelp(args: { toolName: string }): Promise<unknown> {
    const tool = this.discovery.getTool(args.toolName);
    if (!tool) {
      // Try searching for the tool
      const searchResults = this.discovery.searchTools(args.toolName);
      if (searchResults.length > 0) {
        const suggestions = searchResults.slice(0, 3).map((r) => r.tool.name);
        throw new Error(
          `Tool '${args.toolName}' not found. Did you mean one of: ${suggestions.join(", ")}?`,
        );
      }
      throw new Error(`Tool '${args.toolName}' not found`);
    }

    // Get category info
    const category = this.discovery.getCategory(tool.category);

    return {
      name: tool.name,
      description: tool.description,
      category: {
        id: tool.category,
        name: category?.name || tool.category,
        description: category?.description,
      },
      inputSchema: tool.inputSchema,
      examples: tool.examples || [],
      errors: tool.errors || [],
      // Add related tools
      relatedTools: this.discovery
        .getToolsByCategory(tool.category)
        .filter((t) => t.name !== tool.name)
        .slice(0, 3)
        .map((t) => ({ name: t.name, description: t.description })),
    };
  }

  /**
   * Generate correlation ID for request tracking
   */
  private generateCorrelationId(): string {
    return `brooklyn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
