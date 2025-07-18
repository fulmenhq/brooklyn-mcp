/**
 * Onboarding and self-documentation tools for Brooklyn MCP server
 * These tools help users get acquainted with Brooklyn's capabilities
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { config } from "../shared/config.js";
import { logger } from "../shared/logger.js";
import type { BrowserPoolManager } from "./browser-pool-manager.js";

export class OnboardingTools {
  private static browserPool: BrowserPoolManager | null = null;

  static setBrowserPool(pool: BrowserPoolManager): void {
    OnboardingTools.browserPool = pool;
  }

  static getTools(): Tool[] {
    return [
      {
        name: "brooklyn_status",
        description:
          "Get comprehensive status of Brooklyn MCP server including version, capabilities, and health",
        inputSchema: {
          type: "object",
          properties: {
            detail: {
              type: "string",
              enum: ["basic", "full", "teams"],
              description: "Level of detail in the status report",
              default: "basic",
            },
          },
          required: [],
        },
      },
      {
        name: "brooklyn_capabilities",
        description: "List all available browser automation capabilities and tools",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              enum: ["core", "plugins", "testing", "all"],
              description: "Category of capabilities to show",
              default: "all",
            },
          },
          required: [],
        },
      },
      {
        name: "brooklyn_getting_started",
        description: "Get a step-by-step guide for getting started with Brooklyn",
        inputSchema: {
          type: "object",
          properties: {
            use_case: {
              type: "string",
              enum: ["ai_development", "e2e_testing", "form_automation", "monitoring"],
              description: "Your primary use case for Brooklyn",
              default: "ai_development",
            },
            team_id: {
              type: "string",
              description: "Your team identifier (optional)",
            },
          },
          required: [],
        },
      },
      {
        name: "brooklyn_examples",
        description: "Get practical examples and code snippets for common Brooklyn tasks",
        inputSchema: {
          type: "object",
          properties: {
            task: {
              type: "string",
              enum: [
                "basic_navigation",
                "screenshot_comparison",
                "form_filling",
                "element_interaction",
                "wait_strategies",
                "error_handling",
                "all",
              ],
              description: "Type of example to show",
              default: "basic_navigation",
            },
            format: {
              type: "string",
              enum: ["claude_commands", "api_calls", "test_code"],
              description: "Format for the examples",
              default: "claude_commands",
            },
          },
          required: [],
        },
      },
      {
        name: "brooklyn_team_setup",
        description: "Help configure Brooklyn for your team's specific needs",
        inputSchema: {
          type: "object",
          properties: {
            team_id: {
              type: "string",
              description: "Your team identifier",
            },
            use_cases: {
              type: "array",
              items: {
                type: "string",
                enum: ["e2e_testing", "form_automation", "monitoring", "ux_development"],
              },
              description: "Your team's use cases",
            },
            domains: {
              type: "array",
              items: {
                type: "string",
              },
              description: "Domains your team needs to access",
            },
          },
          required: ["team_id"],
        },
      },
      {
        name: "brooklyn_troubleshooting",
        description: "Get help with common Brooklyn issues and debugging",
        inputSchema: {
          type: "object",
          properties: {
            issue: {
              type: "string",
              enum: [
                "connection_failed",
                "browser_wont_start",
                "domain_blocked",
                "timeout_errors",
                "performance_slow",
                "permissions_denied",
                "general",
              ],
              description: "Type of issue you're experiencing",
              default: "general",
            },
            error_message: {
              type: "string",
              description: "Any error message you're seeing",
            },
          },
          required: [],
        },
      },
    ];
  }

  static async handleTool(name: string, args: any): Promise<any> {
    logger.debug("Handling onboarding tool", { tool: name, args });

    switch (name) {
      case "brooklyn_status":
        return await OnboardingTools.getStatus(args);
      case "brooklyn_capabilities":
        return await OnboardingTools.getCapabilities(args);
      case "brooklyn_getting_started":
        return await OnboardingTools.getGettingStarted(args);
      case "brooklyn_examples":
        return await OnboardingTools.getExamples(args);
      case "brooklyn_team_setup":
        return await OnboardingTools.getTeamSetup(args);
      case "brooklyn_troubleshooting":
        return await OnboardingTools.getTroubleshooting(args);
      default:
        throw new Error(`Unknown onboarding tool: ${name}`);
    }
  }

  private static async getStatus(args: { detail?: string }): Promise<any> {
    const { detail = "basic" } = args;

    const basicStatus = {
      service: config.serviceName,
      version: config.version,
      status: "running",
      environment: config.environment,
      uptime: process.uptime(),
      capabilities: {
        browsers: ["chromium", "firefox", "webkit"],
        core_tools: ["launch_browser", "navigate", "screenshot", "close_browser"],
        features: ["multi_team", "security", "resource_management", "testing"],
      },
    };

    if (detail === "basic") {
      return basicStatus;
    }

    const fullStatus = {
      ...basicStatus,
      configuration: {
        max_browsers: config.maxBrowsers,
        headless: config.headless,
        rate_limit: {
          requests: config.rateLimitRequests,
          window: config.rateLimitWindow,
        },
      },
      resource_usage: {
        memory: process.memoryUsage(),
        cpu_usage: process.cpuUsage(),
      },
      browser_pool: OnboardingTools.browserPool
        ? await OnboardingTools.browserPool.getStatus()
        : {
            total_browsers: 0,
            available_browsers: 0,
            active_teams: 0,
          },
    };

    return fullStatus;
  }

  private static async getCapabilities(args: { category?: string }): Promise<any> {
    const { category = "all" } = args;

    const capabilities = {
      core_tools: {
        description: "Essential browser automation tools",
        tools: [
          { name: "launch_browser", description: "Launch a new browser instance" },
          { name: "navigate", description: "Navigate to a URL" },
          { name: "screenshot", description: "Take a screenshot of the page" },
          { name: "close_browser", description: "Close a browser instance" },
        ],
      },
      onboarding_tools: {
        description: "Tools to help you get started with Brooklyn",
        tools: [
          { name: "brooklyn_status", description: "Get server status and health" },
          { name: "brooklyn_capabilities", description: "List available capabilities" },
          { name: "brooklyn_getting_started", description: "Get started guide" },
          { name: "brooklyn_examples", description: "Get practical examples" },
          { name: "brooklyn_team_setup", description: "Configure team settings" },
          { name: "brooklyn_troubleshooting", description: "Get help with issues" },
        ],
      },
      // TODO: Add plugin tools when implemented
      plugin_tools: {
        description: "Team-specific and custom tools",
        tools: [],
      },
      testing_tools: {
        description: "Tools for e2e testing and validation",
        tools: [
          // TODO: Add testing-specific tools
        ],
      },
    };

    if (category === "all") {
      return capabilities;
    }

    const categoryMap: Record<string, keyof typeof capabilities> = {
      core: "core_tools",
      plugins: "plugin_tools",
      testing: "testing_tools",
    };

    const selectedCategory = categoryMap[category];
    if (!selectedCategory) {
      throw new Error(`Unknown category: ${category}`);
    }

    return { [selectedCategory]: capabilities[selectedCategory] };
  }

  private static async getGettingStarted(args: {
    use_case?: string;
    team_id?: string;
  }): Promise<any> {
    const { use_case = "ai_development", team_id } = args;

    const guides = {
      ai_development: {
        title: "Getting Started with Brooklyn for AI Development",
        steps: [
          {
            step: 1,
            title: "Verify Brooklyn Connection",
            description: "Make sure Claude can communicate with Brooklyn",
            command: "brooklyn_status",
          },
          {
            step: 2,
            title: "Launch Your First Browser",
            description: "Start a browser instance for automation",
            command: "launch_browser",
            params: { type: "chromium", headless: true, teamId: team_id || "default" },
          },
          {
            step: 3,
            title: "Navigate to a Website",
            description: "Navigate to a website to begin automation",
            command: "navigate",
            params: { browserId: "<browser_id_from_step_2>", url: "https://example.com" },
          },
          {
            step: 4,
            title: "Take a Screenshot",
            description: "Capture the current page state",
            command: "screenshot",
            params: { browserId: "<browser_id_from_step_2>", fullPage: true },
          },
          {
            step: 5,
            title: "Clean Up",
            description: "Close the browser when done",
            command: "close_browser",
            params: { browserId: "<browser_id_from_step_2>" },
          },
        ],
        next_steps: [
          "Explore brooklyn_examples for more complex scenarios",
          "Set up team configuration with brooklyn_team_setup",
          "Learn about testing capabilities",
        ],
      },
      e2e_testing: {
        title: "Getting Started with Brooklyn for E2E Testing",
        steps: [
          {
            step: 1,
            title: "Set Up Team Configuration",
            description: "Configure Brooklyn for your testing needs",
            command: "brooklyn_team_setup",
            params: {
              team_id: team_id || "testing-team",
              use_cases: ["e2e_testing"],
              domains: ["localhost:3000", "staging.example.com"],
            },
          },
          {
            step: 2,
            title: "Launch Browser for Testing",
            description: "Start a browser with testing configuration",
            command: "launch_browser",
            params: { type: "chromium", headless: true, teamId: team_id || "testing-team" },
          },
          {
            step: 3,
            title: "Navigate to Application",
            description: "Navigate to your application under test",
            command: "navigate",
            params: { browserId: "<browser_id>", url: "http://localhost:3000" },
          },
          {
            step: 4,
            title: "Perform Test Actions",
            description: "Use Brooklyn tools to interact with your application",
            note: "Additional tools for clicking, typing, and assertions coming soon",
          },
        ],
        next_steps: [
          "Integrate Brooklyn with your existing test framework",
          "Set up visual regression testing",
          "Configure CI/CD integration",
        ],
      },
    };

    const guide = guides[use_case as keyof typeof guides];
    if (!guide) {
      throw new Error(`Unknown use case: ${use_case}`);
    }

    return guide;
  }

  private static async getExamples(args: { task?: string; format?: string }): Promise<any> {
    const { task = "basic_navigation", format = "claude_commands" } = args;

    const examples = {
      basic_navigation: {
        title: "Basic Navigation Example",
        description: "Navigate to a website and capture a screenshot",
        claude_commands: [
          "Launch a chromium browser for team 'demo'",
          "Navigate to https://example.com",
          "Take a full-page screenshot",
          "Close the browser",
        ],
        api_calls: [
          { tool: "launch_browser", params: { type: "chromium", teamId: "demo" } },
          { tool: "navigate", params: { browserId: "browser_id", url: "https://example.com" } },
          { tool: "screenshot", params: { browserId: "browser_id", fullPage: true } },
          { tool: "close_browser", params: { browserId: "browser_id" } },
        ],
      },
      // TODO: Add more examples
    };

    const example = examples[task as keyof typeof examples];
    if (!example) {
      throw new Error(`Unknown task: ${task}`);
    }

    if (format === "claude_commands") {
      return {
        title: example.title,
        description: example.description,
        commands: example.claude_commands,
      };
    }

    if (format === "api_calls") {
      return {
        title: example.title,
        description: example.description,
        api_calls: example.api_calls,
      };
    }

    return example;
  }

  private static async getTeamSetup(args: {
    team_id: string;
    use_cases?: string[];
    domains?: string[];
  }): Promise<any> {
    const { team_id, use_cases = [], domains = [] } = args;

    // TODO: Implement actual team configuration
    const setupGuide = {
      team_id,
      configuration: {
        use_cases,
        domains,
        suggested_settings: {
          max_browsers: use_cases.includes("e2e_testing") ? 5 : 2,
          headless: true,
          rate_limit: {
            requests: 50,
            window: 60000,
          },
        },
      },
      next_steps: [
        "Test your configuration with brooklyn_status",
        "Try launching a browser with your team_id",
        "Set up monitoring for your team's usage",
      ],
      status: "configuration_preview",
      note: "Team configuration will be implemented in the next phase",
    };

    return setupGuide;
  }

  private static async getTroubleshooting(args: {
    issue?: string;
    error_message?: string;
  }): Promise<any> {
    const { issue = "general", error_message } = args;

    const troubleshooting = {
      connection_failed: {
        title: "Connection Failed",
        common_causes: [
          "Brooklyn MCP server not running",
          "Incorrect Claude configuration",
          "Network connectivity issues",
        ],
        solutions: [
          "Verify Brooklyn is running with: bun run dev",
          "Check Claude configuration file",
          "Test with brooklyn_status command",
        ],
      },
      browser_wont_start: {
        title: "Browser Won't Start",
        common_causes: [
          "Playwright browsers not installed",
          "Resource limits exceeded",
          "Permission issues",
        ],
        solutions: [
          "Install browsers with: bun run setup",
          "Check resource usage with brooklyn_status",
          "Verify team permissions",
        ],
      },
      domain_blocked: {
        title: "Domain Blocked",
        common_causes: [
          "Domain not in team allowlist",
          "Security policy restrictions",
          "Network firewall rules",
        ],
        solutions: [
          "Add domain to team configuration",
          "Check security settings",
          "Contact your administrator",
        ],
      },
      general: {
        title: "General Troubleshooting",
        first_steps: [
          "Check Brooklyn status with brooklyn_status",
          "Review error logs",
          "Verify team configuration",
        ],
        common_issues: [
          "Connection problems",
          "Browser startup issues",
          "Domain access restrictions",
          "Resource exhaustion",
        ],
      },
    };

    const guide = troubleshooting[issue as keyof typeof troubleshooting];
    if (!guide) {
      return troubleshooting.general;
    }

    if (error_message) {
      return {
        ...guide,
        error_analysis: {
          message: error_message,
          suggestions: [
            "Check the error message for specific details",
            "Look for common patterns in the troubleshooting guide",
            "Contact support if the issue persists",
          ],
        },
      };
    }

    return guide;
  }
}
