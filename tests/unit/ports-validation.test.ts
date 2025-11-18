/**
 * Ports Interface Validation Tests
 * Testing TypeScript interface compliance and type safety for src/ports/
 */

import { describe, expect, it } from "vitest";

import type {
  BrowserInstance,
  BrowserPool,
  BrowserType,
  NavigateOptions,
  ScreenshotOptions,
  UsageMetrics,
} from "../../src/ports/browser.js";
import type {
  BrooklenError,
  BrooklenStatus,
  CommunicationProvider,
  CommunicationTools,
} from "../../src/ports/communication.js";
import type { Config, TeamConfig } from "../../src/ports/config.js";
import type { PluginContext, PluginManager, WebPilotPlugin } from "../../src/ports/plugin.js";

describe("Browser Port Interfaces", () => {
  describe("BrowserInstance", () => {
    it("should have required properties with correct types", () => {
      const mockInstance: BrowserInstance = {
        id: "test-browser-001",
        type: "chromium",
        teamId: "team-alpha",
        createdAt: new Date(),
        lastUsed: new Date(),
        browser: {}, // Playwright browser instance (unknown type)
        context: {}, // Optional browser context
      };

      expect(mockInstance.id).toBe("test-browser-001");
      expect(mockInstance.type).toBe("chromium");
      expect(mockInstance.teamId).toBe("team-alpha");
      expect(mockInstance.createdAt).toBeInstanceOf(Date);
      expect(mockInstance.lastUsed).toBeInstanceOf(Date);
      expect(mockInstance.browser).toBeDefined();
      expect(mockInstance.context).toBeDefined();
    });

    it("should support all valid browser types", () => {
      const validTypes: BrowserType[] = ["chromium", "firefox", "webkit"];

      for (const type of validTypes) {
        const instance: BrowserInstance = {
          id: `test-${type}`,
          type,
          teamId: "test-team",
          createdAt: new Date(),
          lastUsed: new Date(),
          browser: {},
        };
        expect(instance.type).toBe(type);
      }
    });
  });

  describe("NavigateOptions", () => {
    it("should support all valid waitUntil options", () => {
      const options: NavigateOptions[] = [
        { waitUntil: "load" },
        { waitUntil: "domcontentloaded" },
        { waitUntil: "networkidle" },
        { timeout: 30000 },
        { waitUntil: "load", timeout: 15000 },
      ];

      for (const option of options) {
        expect(option).toBeDefined();
        if (option.waitUntil) {
          expect(["load", "domcontentloaded", "networkidle"]).toContain(option.waitUntil);
        }
        if (option.timeout) {
          expect(typeof option.timeout).toBe("number");
        }
      }
    });
  });

  describe("ScreenshotOptions", () => {
    it("should support valid screenshot configurations", () => {
      const options: ScreenshotOptions = {
        fullPage: true,
        quality: 90,
        format: "png",
        clip: {
          x: 100,
          y: 100,
          width: 800,
          height: 600,
        },
      };

      expect(options.fullPage).toBe(true);
      expect(options.quality).toBe(90);
      expect(options.format).toBe("png");
      expect(options.clip).toEqual({
        x: 100,
        y: 100,
        width: 800,
        height: 600,
      });
    });
  });

  describe("UsageMetrics", () => {
    it("should track browser pool metrics correctly", () => {
      const metrics: UsageMetrics = {
        count: 5,
        totalMemory: 1024000000, // ~1GB
        averageLifetime: 300000, // 5 minutes
        errorRate: 0.02, // 2%
      };

      expect(metrics.count).toBe(5);
      expect(metrics.totalMemory).toBe(1024000000);
      expect(metrics.averageLifetime).toBe(300000);
      expect(metrics.errorRate).toBe(0.02);
    });
  });
});

describe("Communication Port Interfaces", () => {
  describe("BrooklenStatus", () => {
    it("should represent system status correctly", () => {
      const status: BrooklenStatus = {
        service: "brooklyn-mcp",
        status: "healthy",
        uptime: 86400000, // 24 hours
        browserPool: {
          total: 10,
          available: 7,
          active: 3,
        },
        teams: {
          active: 3,
          totalUsage: 150,
        },
        timestamp: new Date(),
      };

      expect(status.service).toBe("brooklyn-mcp");
      expect(status.status).toBe("healthy");
      expect(["healthy", "degraded", "unhealthy"]).toContain(status.status);
      expect(status.browserPool.total).toBe(10);
      expect(status.browserPool.available).toBe(7);
      expect(status.browserPool.active).toBe(3);
    });
  });

  describe("BrooklenError", () => {
    it("should capture error information with context", () => {
      const error: BrooklenError = {
        severity: "high",
        message: "Browser pool exhausted",
        context: {
          teamId: "team-beta",
          activeRequests: 15,
          maxBrowsers: 10,
        },
        timestamp: new Date(),
        teamId: "team-beta",
      };

      expect(error.severity).toBe("high");
      expect(["low", "medium", "high", "critical"]).toContain(error.severity);
      expect(error.message).toBe("Browser pool exhausted");
      expect(error.context["teamId"]).toBe("team-beta");
      expect(error.timestamp).toBeInstanceOf(Date);
    });
  });

  describe("CommunicationTools", () => {
    it("should define MCP tool schema correctly", () => {
      const tool: CommunicationTools = {
        name: "brooklyn_notify",
        description: "Send notifications to team communication channels",
        inputSchema: {
          type: "object",
          properties: {
            platform: {
              type: "string",
              enum: ["slack", "mattermost"],
            },
            channel: {
              type: "string",
              description: "Channel or user to notify",
            },
            message: {
              type: "string",
              description: "Message to send",
            },
            type: {
              type: "string",
              enum: ["message", "status", "error"],
              default: "message",
            },
          },
          required: ["platform", "channel", "message"],
        },
      };

      expect(tool.name).toBe("brooklyn_notify");
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.required).toEqual(["platform", "channel", "message"]);
      expect(tool.inputSchema.properties.platform.enum).toEqual(["slack", "mattermost"]);
    });
  });
});

describe("Config Port Interfaces", () => {
  describe("Config", () => {
    it("should define main service configuration", () => {
      const config: Config = {
        serviceName: "brooklyn-mcp",
        displayName: "Brooklyn MCP Server",
        version: "1.6.3",
        environment: "development",
        port: 3000,
        maxBrowsers: 10,
        browserTimeout: 30000,
        headless: true,
        allocationStrategy: "team-isolated",
        rateLimitRequests: 100,
        rateLimitWindow: 60000,
        allowedDomains: ["localhost", "example.com"],
        configPath: "/path/to/config",
        logLevel: "info",
      };

      expect(config.serviceName).toBe("brooklyn-mcp");
      expect(config.port).toBe(3000);
      expect(config.maxBrowsers).toBe(10);
      expect(config.headless).toBe(true);
      expect(config.allowedDomains).toContain("localhost");
      expect(["round-robin", "least-used", "team-isolated"]).toContain(config.allocationStrategy);
    });
  });

  describe("TeamConfig", () => {
    it("should define team-specific configuration", () => {
      const teamConfig: TeamConfig = {
        id: "team-gamma",
        name: "Gamma Team",
        allowedDomains: ["gamma.example.com"],
        browserPreferences: {
          headless: false,
          timeout: 45000,
          viewport: {
            width: 1920,
            height: 1080,
          },
          userAgent: "Mozilla/5.0 (Custom)",
        },
        customTools: ["gamma_analyzer", "gamma_reporter"],
        rateLimit: {
          requests: 50,
          window: 30000,
          enabled: true,
        },
        maxBrowsers: 5,
      };

      expect(teamConfig.id).toBe("team-gamma");
      expect(teamConfig.name).toBe("Gamma Team");
      expect(teamConfig.maxBrowsers).toBe(5);
      expect(teamConfig.browserPreferences?.viewport?.width).toBe(1920);
      expect(teamConfig.rateLimit?.enabled).toBe(true);
    });
  });
});

describe("Plugin Port Interfaces", () => {
  describe("WebPilotPlugin", () => {
    it("should define plugin structure with lifecycle hooks", () => {
      const plugin: WebPilotPlugin = {
        name: "test-plugin",
        version: "1.0.0",
        team: "test-team",
        description: "Test plugin for validation",
        tools: [
          {
            name: "test_tool",
            description: "A test tool",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
        ],
        setup: async () => {
          // Setup logic
        },
        teardown: async () => {
          // Cleanup logic
        },
        onBrowserCreate: async (browser: unknown) => {
          // Browser creation hook
          expect(browser).toBeDefined();
        },
        onBrowserDestroy: async (browserId: string) => {
          // Browser destruction hook
          expect(typeof browserId).toBe("string");
        },
      };

      expect(plugin.name).toBe("test-plugin");
      expect(plugin.version).toBe("1.0.0");
      expect(plugin.team).toBe("test-team");
      expect(plugin.tools).toHaveLength(1);
      expect(plugin.tools[0]?.name).toBe("test_tool");
      expect(typeof plugin.setup).toBe("function");
      expect(typeof plugin.teardown).toBe("function");
    });
  });

  describe("PluginContext", () => {
    it("should provide execution context for plugins", () => {
      const context: PluginContext = {
        teamId: "test-team",
        userId: "user-123",
        config: {
          pluginSettings: {
            feature1: true,
            timeout: 5000,
          },
        },
        logger: {
          info: () => {},
          error: () => {},
          debug: () => {},
        },
      };

      expect(context.teamId).toBe("test-team");
      expect(context.userId).toBe("user-123");
      expect(context.config).toBeDefined();
      expect(context.logger).toBeDefined();
    });
  });
});

describe("Type Safety and Interface Compliance", () => {
  it("should ensure proper TypeScript strict mode compliance", () => {
    // Test that all interfaces can be implemented without type errors

    const mockBrowserPool: BrowserPool = {
      acquire: async (teamId: string, type: BrowserType): Promise<BrowserInstance> => {
        return {
          id: `${teamId}-${type}`,
          type,
          teamId,
          createdAt: new Date(),
          lastUsed: new Date(),
          browser: {},
        };
      },
      release: async (_teamId: string, _browserId: string): Promise<void> => {
        // Release logic
      },
      cleanup: async (): Promise<void> => {
        // Cleanup logic
      },
      getUsage: async (_teamId?: string): Promise<UsageMetrics> => {
        return {
          count: 0,
          totalMemory: 0,
          averageLifetime: 0,
          errorRate: 0,
        };
      },
      getAvailableBrowsers: async (): Promise<number> => {
        return 10;
      },
    };

    const mockCommProvider: CommunicationProvider = {
      name: "test-provider",
      sendMessage: async (_channel: string, _message: string): Promise<void> => {
        // Send message logic
      },
      sendNotification: async (_user: string, _message: string): Promise<void> => {
        // Send notification logic
      },
      sendStatusUpdate: async (_channel: string, _status: BrooklenStatus): Promise<void> => {
        // Send status logic
      },
      sendErrorAlert: async (_channel: string, _error: BrooklenError): Promise<void> => {
        // Send error logic
      },
    };

    const mockPluginManager: PluginManager = {
      register: async (_plugin: WebPilotPlugin): Promise<void> => {
        // Registration logic
      },
      unregister: async (_pluginName: string): Promise<void> => {
        // Unregistration logic
      },
      getPlugins: (): WebPilotPlugin[] => {
        return [];
      },
      getToolsByTeam: (_teamId: string) => {
        return [];
      },
      validatePlugin: async (_plugin: WebPilotPlugin): Promise<boolean> => {
        return true;
      },
    };

    expect(mockBrowserPool).toBeDefined();
    expect(mockCommProvider).toBeDefined();
    expect(mockPluginManager).toBeDefined();
  });
});
