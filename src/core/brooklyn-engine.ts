/**
 * Core Brooklyn automation engine
 * Transport-agnostic business logic for browser automation
 */

import type { CallToolRequest, Tool } from "@modelcontextprotocol/sdk/types.js";
import { attachProgressMetadata, getProgressContext } from "../shared/mcp-progress.js";
import { normalizeCallToolResult } from "../shared/mcp-response.js";
import { getLogger, initializeLogging, isLoggingInitialized } from "../shared/pino-logger.js";
import { MCPBrowserRouter } from "./browser/mcp-browser-router.js";
import { MCPRequestContextFactory } from "./browser/mcp-request-context.js";
import { BrowserPoolManager } from "./browser-pool-manager.js";
import type { BrooklynConfig } from "./config.js";
import { ToolDiscoveryService } from "./discovery/tool-discovery-service.js";
import { BrooklynDocsService } from "./documentation/brooklyn-docs-service.js";
import type { DocumentationQueryArgs } from "./documentation/types.js";
import { OnboardingTools } from "./onboarding-tools.js";
import { PluginManager } from "./plugin-manager.js";
import { SecurityMiddleware } from "./security-middleware.js";
import type { EnhancedTool } from "./tool-definitions.js";
import type {
  ToolCallHandler,
  ToolListHandler,
  Transport,
  TransportRequestMetadata,
} from "./transport.js";

/**
 * Brooklyn engine initialization options
 */
export interface BrooklynEngineOptions {
  config: BrooklynConfig;
  correlationId?: string;
  /** Enable MCP mode for silent browser installation (REPL, dev mode) */
  mcpMode?: boolean;
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
  auth?: unknown;
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
  private browserRouter: MCPBrowserRouter | null = null;
  private security: SecurityMiddleware;
  private discovery: ToolDiscoveryService;
  private imageProcessing: any | null = null;
  private docsService: BrooklynDocsService;

  private transports = new Map<string, Transport>();
  private isInitialized = false;

  constructor(options: BrooklynEngineOptions) {
    this.config = options.config;

    // Correlation ID will be included in log metadata instead
    // (logger.js doesn't support setGlobalContext)

    this.pluginManager = new PluginManager();
    this.browserPool = new BrowserPoolManager({
      mcpMode: options.mcpMode,
      maxBrowsers: this.config.browsers.maxInstances,
    });
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
        "image-processing",
        "documentation",
      ],
      categories: [],
    });

    // Initialize documentation service
    this.docsService = new BrooklynDocsService();

    // Initialize image processing service lazily when needed

    // Register standard categories
    this.registerStandardCategories();
  }

  /**
   * Lazy-load ImageProcessingService to avoid eager SVGO dependency loading
   */
  private async ensureImageProcessing(): Promise<any> {
    if (!this.imageProcessing) {
      const { ImageProcessingService } = await import("./image/image-processing-service.js");
      this.imageProcessing = new ImageProcessingService();
    }
    return this.imageProcessing;
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
        id: "javascript",
        name: "JavaScript Execution",
        description: "Tools for JavaScript execution and browser scripting",
        icon: "⚡",
      },
      {
        id: "styling",
        name: "CSS Styling",
        description: "Tools for CSS analysis and style extraction",
        icon: "🎨",
      },
      {
        id: "image-processing",
        name: "Image Processing",
        description: "Tools for SVG optimization, format conversion, and image analysis",
        icon: "🖼️",
      },
      {
        id: "rendering",
        name: "Rendering",
        description: "Tools for rendering various document formats in the browser",
        icon: "📄",
      },
      {
        id: "documentation",
        name: "Documentation",
        description: "Tools for accessing and searching documentation with platform-aware guidance",
        icon: "📚",
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
      {
        id: "pdf-analysis",
        name: "PDF Analysis",
        description: "Tools for analyzing and processing PDF documents",
        icon: "📄",
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

    // Defer logging to avoid circular dependency during startup
    try {
      this.getLogger().info("Initializing Brooklyn engine", {
        service: this.config.serviceName,
        version: this.config.version,
        teamId: this.config.teamId,
        maxBrowsers: this.config.browsers.maxInstances,
      });
    } catch {
      // Logger not ready yet, skip logging
    }

    // Initialize database for screenshot inventory
    try {
      const { getDatabaseManager } = await import("./database/database-manager.js");
      const dbManager = await getDatabaseManager();
      const isHealthy = await dbManager.isHealthy();

      try {
        this.getLogger().info("Database initialized", {
          healthy: isHealthy,
          instanceId: dbManager.getInstanceId(),
        });
      } catch {
        // Logger not ready yet, skip logging
      }
    } catch (error) {
      // Log database initialization failure but continue
      // Some features like screenshot inventory won't work without DB
      try {
        this.getLogger().warn("Database initialization failed - screenshot inventory disabled", {
          error: error instanceof Error ? error.message : String(error),
        });
      } catch {
        // Logger not ready yet, skip logging
      }
    }

    // Initialize browser pool
    await this.browserPool.initialize();

    // Initialize browser router (Phase 2 integration)
    this.browserRouter = new MCPBrowserRouter(this.browserPool);

    // Connect onboarding tools to browser pool
    OnboardingTools.setBrowserPool(this.browserPool);

    // Register all tools with discovery service
    await this.registerAllTools();

    // Load plugins
    await this.pluginManager.loadPlugins();

    this.isInitialized = true;

    // Defer logging to avoid circular dependency during startup
    try {
      this.getLogger().info("Brooklyn engine initialized successfully");
    } catch {
      // Logger not ready yet, skip logging
    }
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

      // Defer logging to avoid circular dependency during startup
      try {
        this.getLogger().info("Registered tools with discovery service", {
          coreTools: enhancedTools.length,
          onboardingTools: enhancedOnboarding.length,
          totalTools: this.discovery.getMetadata().totalTools,
        });
      } catch {
        // Logger not ready yet, skip logging
      }
    } catch (error) {
      // Defer logging to avoid circular dependency during startup
      try {
        this.getLogger().warn("Failed to register enhanced tools, using basic tools", { error });
      } catch {
        // Logger not ready yet, skip logging
      }

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

    // Defer logging to avoid circular dependency during startup
    try {
      this.getLogger().info("Transport added", { name, type: transport.type });
    } catch {
      // Logger not ready yet, skip logging
    }
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

    // Defer logging to avoid circular dependency during startup
    try {
      this.getLogger().info("Transport started", { name, type: transport.type });
    } catch {
      // Logger not ready yet, skip logging
    }
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
   * Execute a tool call directly (for REPL and testing)
   */
  async executeToolCall(request: CallToolRequest, context: BrooklynContext): Promise<any> {
    const handler = this.createToolCallHandlerWithContext(context);
    return await handler(request);
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

    // Clean up database connection
    try {
      const { getDatabaseManager } = await import("./database/database-manager.js");
      const dbManager = await getDatabaseManager();
      await dbManager.close();
      this.getLogger().info("Database connection closed");
    } catch (error) {
      this.getLogger().debug("Database cleanup skipped", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

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

      try {
        this.getLogger().debug("Tool list requested", {
          transport: transportName,
          correlationId,
        });
      } catch {
        // Logger not ready yet, skip logging
      }

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

        try {
          this.getLogger().debug("Tool list generated", {
            transport: transportName,
            correlationId,
            toolCount: allTools.length,
            categories: this.discovery.getCategories().map((c) => c.id),
          });
        } catch {
          // Logger not ready yet, skip logging
        }

        return { tools: allTools };
      } catch (error) {
        try {
          this.getLogger().error("Failed to generate tool list", {
            transport: transportName,
            correlationId,
            error: error instanceof Error ? error.message : String(error),
          });
        } catch {
          // Logger not ready yet, skip logging
        }
        throw error;
      }
    };
  }

  /**
   * Create tool call handler for a transport
   */
  /**
   * Create a tool call handler with a specific context (for testing)
   */
  private createToolCallHandlerWithContext(context: BrooklynContext): ToolCallHandler {
    return async (request: CallToolRequest) => {
      // DEFENSIVE: Ensure logging is initialized before tool execution
      if (!isLoggingInitialized()) {
        try {
          initializeLogging(this.config);
        } catch {
          // continue without logging
        }
      }

      const { name, arguments: args } = request.params;
      const progressContext = getProgressContext(request);

      const startTime = Date.now();
      try {
        this.getLogger().debug("Tool call received", {
          transport: context.transport,
          correlationId: context.correlationId,
          tool: name,
          args,
        });
      } catch {}

      try {
        // Apply security middleware with context
        await this.security.validateRequest(request, {
          teamId: context.teamId,
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

        const duration = Date.now() - startTime;
        try {
          this.getLogger().info("Tool call successful", {
            transport: context.transport,
            correlationId: context.correlationId,
            tool: name,
            duration,
          });
        } catch {}

        return attachProgressMetadata(normalizeCallToolResult(result), progressContext);
      } catch (error) {
        const duration = Date.now() - startTime;
        try {
          this.getLogger().error("Tool call failed", {
            transport: context.transport,
            correlationId: context.correlationId,
            tool: name,
            duration,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
        } catch {}

        // Let the error propagate - transport will handle MCP formatting
        throw error;
      }
    };
  }

  private createToolCallHandler(transportName: string): ToolCallHandler {
    return async (request: CallToolRequest, metadata?: TransportRequestMetadata) => {
      // DEFENSIVE: Ensure logging is initialized before tool execution
      if (!isLoggingInitialized()) {
        try {
          initializeLogging(this.config);
        } catch {
          // continue without logging
        }
      }

      const correlationId = this.generateCorrelationId();
      const { name, arguments: args } = request.params;

      const startTime = Date.now();
      try {
        this.getLogger().debug("Tool call received", {
          transport: transportName,
          correlationId,
          tool: name,
          args,
        });
      } catch {}

      try {
        const derivedTeamId = metadata?.teamId ?? this.config.teamId;
        const derivedUserId = metadata?.userId;

        // Create context for this request
        const context: BrooklynContext = {
          teamId: derivedTeamId,
          userId: derivedUserId,
          correlationId,
          permissions: [], // TODO: Extract from request
          transport: transportName,
          auth: metadata?.auth,
        };

        // Apply security middleware with context
        await this.security.validateRequest(request, {
          teamId: derivedTeamId,
          userId: derivedUserId,
        });

        let rawResult: unknown;

        // Route to appropriate handler
        if (this.isCoreTools(name)) {
          rawResult = await this.handleCoreTool(name, args, context);
        } else if (this.isOnboardingTools(name)) {
          rawResult = await OnboardingTools.handleTool(name, args);
        } else {
          rawResult = await this.pluginManager.handleToolCall(name, args);
        }

        const executionTime = Date.now() - startTime;

        try {
          this.getLogger().debug("Tool call completed", {
            transport: transportName,
            correlationId,
            tool: name,
            executionTime,
          });
        } catch {}

        // Standardize response envelope for all tools
        const duration = executionTime;
        const traceId = correlationId;

        // If rawResult already looks like our envelope, augment as needed
        let envelope: Record<string, unknown>;
        if (rawResult && typeof rawResult === "object" && Object.hasOwn(rawResult, "success")) {
          const r = rawResult as {
            success?: boolean;
            data?: unknown;
            result?: unknown;
            diagnostics?: { durationMs?: number };
          };
          // Ensure data exists
          if (r.data === undefined && Object.hasOwn(r, "result")) {
            (r as Record<string, unknown>)["data"] = (rawResult as Record<string, unknown>)[
              "result"
            ];
          }
          // Ensure diagnostics.durationMs exists
          const diagnostics = {
            ...(r.diagnostics || {}),
            durationMs: r.diagnostics?.durationMs || duration,
          };
          envelope = { ...r, diagnostics, traceId };
        } else {
          // Wrap arbitrary result
          envelope = {
            success: true,
            data: rawResult,
            diagnostics: { durationMs: duration },
            traceId,
          };
        }

        const progressContext = getProgressContext(request);
        return attachProgressMetadata(normalizeCallToolResult(envelope), progressContext);
      } catch (error) {
        const executionTime = Date.now() - startTime;
        try {
          this.getLogger().error("Tool call failed", {
            transport: transportName,
            correlationId,
            tool: name,
            executionTime,
            error: error instanceof Error ? error.message : String(error),
          });
        } catch {}

        // Return error response in MCP format for tests
        const progressContext = getProgressContext(request);
        return attachProgressMetadata(
          normalizeCallToolResult({
            isError: true,
            error: error instanceof Error ? error.message : String(error),
          }),
          progressContext,
        );
      }
    };
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
      "wait_for_url",
      "wait_for_navigation",
      "wait_for_network_idle",
      // Element interaction
      "click_element",
      "focus_element",
      "hover_element",
      "select_option",
      "clear_element",
      "drag_and_drop",
      "fill_text",
      "fill_form",
      "wait_for_element",
      "get_text_content",
      "validate_element_presence",
      "find_elements",
      "generate_selector",
      // Content capture
      "take_screenshot",
      "list_screenshots",
      "get_screenshot",
      // Phase 1C: Content extraction extensions
      "get_html",
      "describe_html",
      "get_attribute",
      "get_bounding_box",
      "is_visible",
      "is_enabled",
      // v0.3.3: Table extraction, network inspection, pagination
      "extract_table_data",
      "inspect_network",
      "paginate_table",
      // JavaScript execution (UX automation)
      "execute_script",
      "evaluate_expression",
      "get_console_messages",
      "add_script_tag",
      // Scrolling and layout overlays
      "scroll_into_view",
      "scroll_to",
      "scroll_by",
      "highlight_element_bounds",
      "show_layout_grid",
      "remove_overlay",
      // CSS overrides
      "apply_css_override",
      "revert_css_changes",
      // Layout structure
      "get_layout_tree",
      "measure_whitespace",
      "find_layout_containers",
      // CSS analysis (UX understanding)
      "extract_css",
      "get_computed_styles",
      "diff_css",
      "analyze_specificity",
      // CSS simulation and diagnostics
      "simulate_css_change",
      "why_style_not_applied",
      "get_applicable_rules",
      "get_effective_computed",
      // Rendering tools (visual format conversion)
      "render_pdf",
      // PDF Content Analysis (Brooklyn MCP v1.6.3)
      "analyze_pdf_content",
      "extract_pdf_text",
      "search_pdf_content",
      "extract_pdf_tables",
      "analyze_pdf_layout",
      "compare_pdf_versions",
      "summarize_pdf_content",
      "extract_pdf_forms",
      // Image processing (Brooklyn MCP v1.6.0)
      "compress_svg",
      "analyze_svg",
      "convert_svg_to_png",
      "convert_svg_to_multi_png",
      "list_processed_assets",
      "get_processed_asset",
      "purge_processed_assets",
      // Documentation
      "brooklyn_docs",
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
      "brooklyn_logs",
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
          // Phase 2: Use router for launch_browser
          if (this.browserRouter) {
            const request = {
              tool: name,
              params: args as Record<string, unknown>,
              context: MCPRequestContextFactory.create({
                teamId: context.teamId,
                userId: context.userId,
                metadata: {
                  permissions: context.permissions,
                  correlationId: context.correlationId,
                },
              }),
            };
            const response = await this.browserRouter.route(request);
            if (!response.success) {
              throw new Error(response.error?.message || "Browser launch failed");
            }
            return response.result;
          }
          // Fallback to direct pool access
          return await this.browserPool.launchBrowser(args as any);

        case "close_browser":
          // Phase 2: Use router for close_browser
          if (this.browserRouter) {
            const request = {
              tool: name,
              params: args as Record<string, unknown>,
              context: MCPRequestContextFactory.create({
                teamId: context.teamId,
                userId: context.userId,
                metadata: {
                  permissions: context.permissions,
                  correlationId: context.correlationId,
                },
              }),
            };
            const response = await this.browserRouter.route(request);
            if (!response.success) {
              throw new Error(response.error?.message || "Browser close failed");
            }
            return response.result;
          }
          // Fallback to direct pool access
          return await this.browserPool.closeBrowser(args as any);

        case "list_active_browsers":
          return await this.browserPool.listActiveBrowsers();

        // Navigation tools
        case "navigate_to_url":
          // Phase 2: Use router for navigate_to_url
          if (this.browserRouter) {
            const request = {
              tool: name,
              params: args as Record<string, unknown>,
              context: MCPRequestContextFactory.create({
                teamId: context.teamId,
                userId: context.userId,
                metadata: {
                  permissions: context.permissions,
                  correlationId: context.correlationId,
                },
              }),
            };
            const response = await this.browserRouter.route(request);
            if (!response.success) {
              throw new Error(response.error?.message || "Navigation failed");
            }
            return response.result;
          }
          // Fallback to direct pool access
          return await this.browserPool.navigate(args as any);

        case "go_back":
          // Phase 2: Use router for go_back
          if (this.browserRouter) {
            const request = {
              tool: name,
              params: args as Record<string, unknown>,
              context: MCPRequestContextFactory.create({
                teamId: context.teamId,
                userId: context.userId,
                metadata: {
                  permissions: context.permissions,
                  correlationId: context.correlationId,
                },
              }),
            };
            const response = await this.browserRouter.route(request);
            if (!response.success) {
              throw new Error(response.error?.message || "Go back failed");
            }
            return response.result;
          }
          // Fallback to direct pool access
          return await this.browserPool.goBack(args as any);

        case "wait_for_url":
        case "wait_for_navigation":
        case "wait_for_network_idle":
          if (this.browserRouter) {
            const request = {
              tool: name,
              params: args as Record<string, unknown>,
              context: MCPRequestContextFactory.create({
                teamId: context.teamId,
                userId: context.userId,
                metadata: {
                  permissions: context.permissions,
                  correlationId: context.correlationId,
                },
              }),
            };
            const response = await this.browserRouter.route(request);
            if (!response.success) {
              throw new Error(response.error?.message || `${name} failed`);
            }
            return response.result;
          }
          throw new Error(`${name} requires browser pool connection`);

        // Element interaction tools
        case "click_element":
          // Phase 2: Use router for click_element
          if (this.browserRouter) {
            const request = {
              tool: name,
              params: args as Record<string, unknown>,
              context: MCPRequestContextFactory.create({
                teamId: context.teamId,
                userId: context.userId,
                metadata: {
                  permissions: context.permissions,
                  correlationId: context.correlationId,
                },
              }),
            };
            const response = await this.browserRouter.route(request);
            if (!response.success) {
              throw new Error(response.error?.message || "Click element failed");
            }
            return response.result;
          }
          // Fallback to direct pool access
          return await this.browserPool.clickElement(args as any);

        case "focus_element":
          // Phase 2: Use router for focus_element
          if (this.browserRouter) {
            const request = {
              tool: name,
              params: args as Record<string, unknown>,
              context: MCPRequestContextFactory.create({
                teamId: context.teamId,
                userId: context.userId,
                metadata: {
                  permissions: context.permissions,
                  correlationId: context.correlationId,
                },
              }),
            };
            const response = await this.browserRouter.route(request);
            if (!response.success) {
              throw new Error(response.error?.message || "Focus element failed");
            }
            return response.result;
          }
          // Fallback to direct pool access
          return await this.browserPool.focusElement(args as any);

        case "hover_element":
          // Phase 2: Use router for hover_element
          if (this.browserRouter) {
            const request = {
              tool: name,
              params: args as Record<string, unknown>,
              context: MCPRequestContextFactory.create({
                teamId: context.teamId,
                userId: context.userId,
                metadata: {
                  permissions: context.permissions,
                  correlationId: context.correlationId,
                },
              }),
            };
            const response = await this.browserRouter.route(request);
            if (!response.success) {
              throw new Error(response.error?.message || "Hover element failed");
            }
            return response.result;
          }
          // Fallback to direct pool access
          return await this.browserPool.hoverElement(args as any);

        case "select_option":
          // Phase 2: Use router for select_option
          if (this.browserRouter) {
            const request = {
              tool: name,
              params: args as Record<string, unknown>,
              context: MCPRequestContextFactory.create({
                teamId: context.teamId,
                userId: context.userId,
                metadata: {
                  permissions: context.permissions,
                  correlationId: context.correlationId,
                },
              }),
            };
            const response = await this.browserRouter.route(request);
            if (!response.success) {
              throw new Error(response.error?.message || "Select option failed");
            }
            return response.result;
          }
          // Fallback to direct pool access
          return await this.browserPool.selectOption(args as any);

        case "clear_element":
          // Phase 2: Use router for clear_element
          if (this.browserRouter) {
            const request = {
              tool: name,
              params: args as Record<string, unknown>,
              context: MCPRequestContextFactory.create({
                teamId: context.teamId,
                userId: context.userId,
                metadata: {
                  permissions: context.permissions,
                  correlationId: context.correlationId,
                },
              }),
            };
            const response = await this.browserRouter.route(request);
            if (!response.success) {
              throw new Error(response.error?.message || "Clear element failed");
            }
            return response.result;
          }
          // Fallback to direct pool access
          return await this.browserPool.clearElement(args as any);

        case "drag_and_drop":
          // Phase 2: Use router for drag_and_drop
          if (this.browserRouter) {
            const request = {
              tool: name,
              params: args as Record<string, unknown>,
              context: MCPRequestContextFactory.create({
                teamId: context.teamId,
                userId: context.userId,
                metadata: {
                  permissions: context.permissions,
                  correlationId: context.correlationId,
                },
              }),
            };
            const response = await this.browserRouter.route(request);
            if (!response.success) {
              throw new Error(response.error?.message || "Drag and drop failed");
            }
            return response.result;
          }
          // Fallback to direct pool access
          return await this.browserPool.dragAndDrop(args as any);

        case "fill_text":
          // Phase 2: Use router for fill_text
          if (this.browserRouter) {
            const request = {
              tool: name,
              params: args as Record<string, unknown>,
              context: MCPRequestContextFactory.create({
                teamId: context.teamId,
                userId: context.userId,
                metadata: {
                  permissions: context.permissions,
                  correlationId: context.correlationId,
                },
              }),
            };
            const response = await this.browserRouter.route(request);
            if (!response.success) {
              throw new Error(response.error?.message || "Fill text failed");
            }
            return response.result;
          }
          // Fallback to direct pool access
          return await this.browserPool.fillText(args as any);

        case "fill_form":
          // Phase 2: Use router for fill_form (maps to fill_form_fields in router)
          if (this.browserRouter) {
            const request = {
              tool: "fill_form_fields",
              params: args as Record<string, unknown>,
              context: MCPRequestContextFactory.create({
                teamId: context.teamId,
                userId: context.userId,
                metadata: {
                  permissions: context.permissions,
                  correlationId: context.correlationId,
                },
              }),
            };
            const response = await this.browserRouter.route(request);
            if (!response.success) {
              throw new Error(response.error?.message || "Fill form failed");
            }
            return response.result;
          }
          // Fallback to direct pool access
          return await this.browserPool.fillForm(args as any);

        case "wait_for_element":
          // Phase 2: Use router for wait_for_element
          if (this.browserRouter) {
            const request = {
              tool: name,
              params: args as Record<string, unknown>,
              context: MCPRequestContextFactory.create({
                teamId: context.teamId,
                userId: context.userId,
                metadata: {
                  permissions: context.permissions,
                  correlationId: context.correlationId,
                },
              }),
            };
            const response = await this.browserRouter.route(request);
            if (!response.success) {
              throw new Error(response.error?.message || "Wait for element failed");
            }
            return response.result;
          }
          // Fallback to direct pool access
          return await this.browserPool.waitForElement(args as any);

        case "scroll_into_view":
        case "scroll_to":
        case "scroll_by":
        case "highlight_element_bounds":
        case "show_layout_grid":
        case "remove_overlay":
        case "apply_css_override":
        case "revert_css_changes":
        case "simulate_css_change":
        case "why_style_not_applied":
        case "get_applicable_rules":
        case "get_effective_computed":
        case "get_layout_tree":
        case "measure_whitespace":
        case "find_layout_containers":
          if (this.browserRouter) {
            const request = {
              tool: name,
              params: args as Record<string, unknown>,
              context: MCPRequestContextFactory.create({
                teamId: context.teamId,
                userId: context.userId,
                metadata: {
                  permissions: context.permissions,
                  correlationId: context.correlationId,
                },
              }),
            };
            const response = await this.browserRouter.route(request);
            if (!response.success) {
              throw new Error(response.error?.message || `${name} failed`);
            }
            return response.result;
          }
          throw new Error(`${name} requires browser pool connection`);

        case "get_text_content":
          // Phase 2: Use router for get_text_content
          if (this.browserRouter) {
            const request = {
              tool: name,
              params: args as Record<string, unknown>,
              context: MCPRequestContextFactory.create({
                teamId: context.teamId,
                userId: context.userId,
                metadata: {
                  permissions: context.permissions,
                  correlationId: context.correlationId,
                },
              }),
            };
            const response = await this.browserRouter.route(request);
            if (!response.success) {
              throw new Error(response.error?.message || "Get text content failed");
            }
            return response.result;
          }
          // Fallback to direct pool access
          return await this.browserPool.getTextContent(args as any);

        case "validate_element_presence":
          // Phase 2: Use router for validate_element_presence
          if (this.browserRouter) {
            const request = {
              tool: name,
              params: args as Record<string, unknown>,
              context: MCPRequestContextFactory.create({
                teamId: context.teamId,
                userId: context.userId,
                metadata: {
                  permissions: context.permissions,
                  correlationId: context.correlationId,
                },
              }),
            };
            const response = await this.browserRouter.route(request);
            if (!response.success) {
              throw new Error(response.error?.message || "Validate element presence failed");
            }
            return response.result;
          }
          // Fallback to direct pool access
          return await this.browserPool.validateElementPresence(args as any);

        case "find_elements":
          // Phase 2: Use router for find_elements
          if (this.browserRouter) {
            const request = {
              tool: name,
              params: args as Record<string, unknown>,
              context: MCPRequestContextFactory.create({
                teamId: context.teamId,
                userId: context.userId,
                metadata: {
                  permissions: context.permissions,
                  correlationId: context.correlationId,
                },
              }),
            };
            const response = await this.browserRouter.route(request);
            if (!response.success) {
              throw new Error(response.error?.message || "Find elements failed");
            }
            return response.result;
          }
          // Fallback to direct pool access
          return await this.browserPool.findElements(args as any);

        case "generate_selector":
          // Route through the browser router
          if (this.browserRouter) {
            const request = {
              tool: name,
              params: args as Record<string, unknown>,
              context: MCPRequestContextFactory.create({
                teamId: context.teamId,
                userId: context.userId,
                metadata: {
                  permissions: context.permissions,
                  correlationId: context.correlationId,
                },
              }),
            };
            const response = await this.browserRouter.route(request);
            if (!response.success) {
              throw new Error(response.error?.message || "Generate selector failed");
            }
            return response.result;
          }
          throw new Error("generate_selector requires browser pool connection");

        // Content capture tools
        case "take_screenshot":
          // Phase 2: Use router for take_screenshot
          if (this.browserRouter) {
            const request = {
              tool: name,
              params: args as Record<string, unknown>,
              context: MCPRequestContextFactory.create({
                teamId: context.teamId,
                userId: context.userId,
                metadata: {
                  permissions: context.permissions,
                  correlationId: context.correlationId,
                },
              }),
            };
            const response = await this.browserRouter.route(request);
            if (!response.success) {
              throw new Error(response.error?.message || "Screenshot failed");
            }
            return response.result;
          }
          // Fallback to direct pool access
          return await this.browserPool.screenshot(args as any);

        case "list_screenshots":
          // Phase 2: Use router for list_screenshots
          if (this.browserRouter) {
            const request = {
              tool: name,
              params: args as Record<string, unknown>,
              context: MCPRequestContextFactory.create({
                teamId: context.teamId,
                userId: context.userId,
                metadata: {
                  permissions: context.permissions,
                  correlationId: context.correlationId,
                },
              }),
            };
            const response = await this.browserRouter.route(request);
            if (!response.success) {
              throw new Error(response.error?.message || "List screenshots failed");
            }
            return response.result;
          }
          // No fallback for list_screenshots - requires database
          throw new Error("Screenshot inventory requires database connection");

        case "get_screenshot":
          // Phase 2: Use router for get_screenshot
          if (this.browserRouter) {
            const request = {
              tool: name,
              params: args as Record<string, unknown>,
              context: MCPRequestContextFactory.create({
                teamId: context.teamId,
                userId: context.userId,
                metadata: {
                  permissions: context.permissions,
                  correlationId: context.correlationId,
                },
              }),
            };
            const response = await this.browserRouter.route(request);
            if (!response.success) {
              throw new Error(response.error?.message || "Get screenshot failed");
            }
            return response.result;
          }
          // No fallback for get_screenshot - requires database
          throw new Error("Screenshot retrieval requires database connection");

        // Phase 1C: Content extraction extensions
        case "get_html":
        case "describe_html":
        case "get_attribute":
        case "get_bounding_box":
        case "is_visible":
        case "is_enabled":
        case "extract_table_data":
        case "inspect_network":
        case "paginate_table":
          // Route all content extraction tools through the browser router
          if (this.browserRouter) {
            const request = {
              tool: name,
              params: args as Record<string, unknown>,
              context: MCPRequestContextFactory.create({
                teamId: context.teamId,
                userId: context.userId,
                metadata: {
                  permissions: context.permissions,
                  correlationId: context.correlationId,
                },
              }),
            };
            const response = await this.browserRouter.route(request);
            if (!response.success) {
              throw new Error(response.error?.message || `${name} failed`);
            }
            return response.result;
          }
          throw new Error(`${name} requires browser pool connection`);

        // JavaScript execution tools (UX automation)
        case "execute_script":
        case "evaluate_expression":
        case "get_console_messages":
        case "add_script_tag":
        // CSS analysis tools (UX understanding)
        case "extract_css":
        case "get_computed_styles":
        case "diff_css":
        case "analyze_specificity":
        case "render_pdf":
        case "analyze_pdf_content":
        case "extract_pdf_text":
        case "search_pdf_content":
        case "extract_pdf_tables":
        case "analyze_pdf_layout":
        case "compare_pdf_versions":
        case "summarize_pdf_content":
        case "extract_pdf_forms":
          // Route all PDF tools through the browser router
          if (this.browserRouter) {
            const request = {
              tool: name,
              params: args as Record<string, unknown>,
              context: MCPRequestContextFactory.create({
                teamId: context.teamId,
                userId: context.userId,
                metadata: {
                  permissions: context.permissions,
                  correlationId: context.correlationId,
                },
              }),
            };
            const response = await this.browserRouter.route(request);
            if (!response.success) {
              throw new Error(response.error?.message || `${name} failed`);
            }
            return response.result;
          }
          throw new Error(`${name} requires browser pool connection`);

        // Image Processing tools - Brooklyn MCP v1.6.0
        case "compress_svg":
          return await (await this.ensureImageProcessing()).compressSVG({
            ...(args as any),
            teamId: context.teamId,
          });
        case "analyze_svg":
          return await (await this.ensureImageProcessing()).analyzeSVG(args as any);
        case "convert_svg_to_png":
          return await (await this.ensureImageProcessing()).convertSVGToPNG({
            ...(args as any),
            teamId: context.teamId,
          });
        case "convert_svg_to_multi_png":
          return await (await this.ensureImageProcessing()).convertSVGToMultiPNG({
            ...(args as any),
            teamId: context.teamId,
          });
        case "list_processed_assets":
          return await (await this.ensureImageProcessing()).listAssets({
            ...(args as any),
            teamId: context.teamId,
          });
        case "get_processed_asset":
          return await (await this.ensureImageProcessing()).getAsset({
            ...(args as any),
            teamId: context.teamId,
          });
        case "purge_processed_assets":
          return await (await this.ensureImageProcessing()).purgeAssets({
            ...(args as any),
            teamId: context.teamId,
          });

        // Documentation tools
        case "brooklyn_docs":
          return await this.handleBrooklynDocs(args as any);

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
   * Handle brooklyn_docs tool - intelligent documentation access
   */
  private async handleBrooklynDocs(args: DocumentationQueryArgs): Promise<unknown> {
    this.getLogger().info("Accessing Brooklyn documentation", {
      topic: args.topic,
      search: args.search,
      platform: args.platform,
      format: args.format,
    });

    try {
      return await this.docsService.getFormatted(args);
    } catch (error) {
      this.getLogger().error("Documentation access failed", {
        args,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new Error(
        `Documentation access failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Generate correlation ID for request tracking
   */
  private generateCorrelationId(): string {
    return `brooklyn-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }
}
