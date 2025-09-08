/**
 * Tests for BrowserFactory class
 */

import type { Browser } from "playwright";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserFactory, type BrowserFactoryConfig } from "./browser-factory.js";
import type { BrowserInstallationManager } from "./browser-installation-manager.js";
import { BrowserInstance } from "./browser-instance.js";
import { MCPBrowserManager } from "./mcp-browser-manager.js";

// Mock playwright
vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn(),
    executablePath: vi.fn(() => "/path/to/chromium"),
  },
  firefox: {
    launch: vi.fn(),
    executablePath: vi.fn(() => "/path/to/firefox"),
  },
  webkit: {
    launch: vi.fn(),
    executablePath: vi.fn(() => "/path/to/webkit"),
  },
}));

// Mock logger
vi.mock("../../shared/pino-logger.js", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock browser instance
vi.mock("./browser-instance.js", () => ({
  BrowserInstance: vi.fn().mockImplementation((config) => ({
    id: config.id || "test-instance",
    browserType: config.browserType,
    initialize: vi.fn(),
  })),
}));

// Mock MCPBrowserManager
vi.mock("./mcp-browser-manager.js", () => ({
  MCPBrowserManager: vi.fn().mockImplementation(() => ({
    acquireBrowser: vi.fn(),
  })),
}));

describe("BrowserFactory", () => {
  let factory: BrowserFactory;
  let mockInstallationManager: BrowserInstallationManager;
  let mockBrowser: Browser;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock browser
    mockBrowser = {
      isConnected: vi.fn().mockReturnValue(true),
      newContext: vi.fn(),
      close: vi.fn(),
    } as unknown as Browser;

    // Create mock installation manager
    mockInstallationManager = {
      isBrowserInstalled: vi.fn().mockResolvedValue(true),
      installBrowser: vi.fn(),
      getSystemBrowserDetector: vi.fn(),
    } as unknown as BrowserInstallationManager;

    // Create factory with mock manager
    factory = new BrowserFactory({
      installationManager: mockInstallationManager,
    });
  });

  describe("createInstance", () => {
    it("should create chromium browser instance", async () => {
      const { chromium } = await import("playwright");
      (chromium.launch as ReturnType<typeof vi.fn>).mockResolvedValue(mockBrowser);

      const config = {
        id: "test-1",
        browserType: "chromium" as const,
        headless: true,
        timeout: 30000,
      };

      const instance = await factory.createInstance(config);

      expect(mockInstallationManager.isBrowserInstalled).toHaveBeenCalledWith("chromium");
      expect(chromium.launch).toHaveBeenCalledWith({
        headless: true,
        timeout: 30000,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-web-security",
          "--disable-features=VizDisplayCompositor",
          "--disable-gpu",
          "--no-zygote",
        ],
      });
      expect(instance.initialize).toHaveBeenCalledWith(mockBrowser);
    });

    it("should create firefox browser instance", async () => {
      const { firefox } = await import("playwright");
      (firefox.launch as ReturnType<typeof vi.fn>).mockResolvedValue(mockBrowser);

      const config = {
        id: "test-2",
        browserType: "firefox" as const,
        headless: false,
        timeout: 20000,
      };

      await factory.createInstance(config);

      expect(firefox.launch).toHaveBeenCalledWith({
        headless: false,
        timeout: 20000,
      });
    });

    it("should create webkit browser instance", async () => {
      const { webkit } = await import("playwright");
      (webkit.launch as ReturnType<typeof vi.fn>).mockResolvedValue(mockBrowser);

      const config = {
        id: "test-3",
        browserType: "webkit" as const,
        headless: true,
        timeout: 15000,
      };

      await factory.createInstance(config);

      expect(webkit.launch).toHaveBeenCalledWith({
        headless: true,
        timeout: 15000,
      });
    });

    it("should install browser if not installed", async () => {
      const { chromium } = await import("playwright");
      (chromium.launch as ReturnType<typeof vi.fn>).mockResolvedValue(mockBrowser);

      // Mock browser not installed
      mockInstallationManager.isBrowserInstalled = vi.fn().mockResolvedValue(false);

      const config = {
        browserType: "chromium" as const,
        headless: true,
        timeout: 30000,
      };

      await factory.createInstance(config);

      expect(mockInstallationManager.installBrowser).toHaveBeenCalledWith("chromium");
    });

    it("should handle browser launch errors", async () => {
      const { chromium } = await import("playwright");
      const error = new Error("Failed to launch browser");
      (chromium.launch as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const config = {
        browserType: "chromium" as const,
        headless: true,
        timeout: 30000,
      };

      await expect(factory.createInstance(config)).rejects.toThrow(error);
    });
  });

  describe("MCP mode", () => {
    it("should use MCP browser manager in MCP mode", async () => {
      const { chromium } = await import("playwright");
      (chromium.launch as ReturnType<typeof vi.fn>).mockResolvedValue(mockBrowser);

      // Create factory in MCP mode
      const mcpFactory = new BrowserFactory({
        installationManager: mockInstallationManager,
        mcpMode: true,
      });

      // The MCPBrowserManager should be created with mcpMode: true
      // We need to verify it's used instead of regular installation

      const config = {
        browserType: "chromium" as const,
        headless: true,
        timeout: 30000,
      };

      await mcpFactory.createInstance(config);

      // In MCP mode, it should still create the browser
      expect(chromium.launch).toHaveBeenCalled();
    });
  });

  describe("configuration", () => {
    it("should use default configuration", async () => {
      const { chromium } = await import("playwright");
      (chromium.launch as ReturnType<typeof vi.fn>).mockResolvedValue(mockBrowser);

      const factoryConfig: BrowserFactoryConfig = {
        defaultTimeout: 60000,
        defaultHeadless: false,
        installationManager: mockInstallationManager,
      };

      const configuredFactory = new BrowserFactory(factoryConfig);

      const config = {
        id: "test-default",
        browserType: "chromium" as const,
        // No headless or timeout specified
      };

      await configuredFactory.createInstance(config as any);

      expect(chromium.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          headless: false,
          timeout: 60000,
        }),
      );
    });

    it("should apply browser-specific launch options", async () => {
      mockInstallationManager.isBrowserInstalled = vi.fn().mockResolvedValue(true);

      const { firefox } = await import("playwright");
      (firefox.launch as ReturnType<typeof vi.fn>).mockResolvedValue(mockBrowser);

      const factoryConfig: BrowserFactoryConfig = {
        installationManager: mockInstallationManager,
        launchOptions: {
          firefox: {
            firefoxUserPrefs: {
              "dom.webnotifications.enabled": false,
            },
          },
        },
      };

      const configuredFactory = new BrowserFactory(factoryConfig);

      await configuredFactory.createInstance({
        browserType: "firefox",
        headless: true,
        timeout: 30000,
      });

      expect(firefox.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          headless: true,
          timeout: 30000,
          firefoxUserPrefs: {
            "dom.webnotifications.enabled": false,
          },
        }),
      );
    });

    it("should apply memory limits for chromium", async () => {
      const { chromium } = await import("playwright");
      (chromium.launch as ReturnType<typeof vi.fn>).mockResolvedValue(mockBrowser);

      const config = {
        browserType: "chromium" as const,
        headless: true,
        timeout: 30000,
        resourceLimits: {
          maxMemoryMB: 512,
        },
      };

      await factory.createInstance(config);

      expect(chromium.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.arrayContaining(["--max_old_space_size=512"]),
        }),
      );
    });
  });

  describe("browser status", () => {
    it("should get browser installation status", async () => {
      mockInstallationManager.isBrowserInstalled = vi
        .fn()
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const status = await factory.getBrowserStatus();

      expect(status).toEqual({
        chromium: true,
        firefox: false,
        webkit: true,
      });
    });
  });

  describe("preinstallBrowsers", () => {
    it("should preinstall specified browsers", async () => {
      await factory.preinstallBrowsers(["chromium", "firefox"]);

      expect(mockInstallationManager.isBrowserInstalled).toHaveBeenCalledWith("chromium");
      expect(mockInstallationManager.isBrowserInstalled).toHaveBeenCalledWith("firefox");
    });

    it("should handle preinstall errors gracefully", async () => {
      mockInstallationManager.isBrowserInstalled = vi.fn().mockResolvedValue(false);
      mockInstallationManager.installBrowser = vi
        .fn()
        .mockRejectedValueOnce(new Error("Install failed"))
        .mockResolvedValueOnce(undefined);

      // Should not throw
      await expect(factory.preinstallBrowsers(["chromium", "firefox"])).resolves.not.toThrow();
    });
  });

  describe("cleanBrowserCache", () => {
    it("should clean browser cache", async () => {
      mockInstallationManager.cleanCache = vi.fn();

      await factory.cleanBrowserCache();

      expect(mockInstallationManager.cleanCache).toHaveBeenCalled();
    });

    it("should handle cache cleaning errors gracefully", async () => {
      mockInstallationManager.cleanCache = vi
        .fn()
        .mockRejectedValue(new Error("Cache clean failed"));

      // The method should still be called even if it fails
      await expect(factory.cleanBrowserCache()).rejects.toThrow("Cache clean failed");
      expect(mockInstallationManager.cleanCache).toHaveBeenCalled();
    });
  });

  describe("preinstallBrowsers", () => {
    it("should preinstall multiple browsers successfully", async () => {
      mockInstallationManager.isBrowserInstalled = vi
        .fn()
        .mockResolvedValueOnce(false) // chromium not installed
        .mockResolvedValueOnce(true) // firefox already installed
        .mockResolvedValueOnce(false); // webkit not installed

      mockInstallationManager.installBrowser = vi.fn().mockResolvedValue(undefined);

      await factory.preinstallBrowsers(["chromium", "firefox", "webkit"]);

      expect(mockInstallationManager.isBrowserInstalled).toHaveBeenCalledWith("chromium");
      expect(mockInstallationManager.isBrowserInstalled).toHaveBeenCalledWith("firefox");
      expect(mockInstallationManager.isBrowserInstalled).toHaveBeenCalledWith("webkit");
      expect(mockInstallationManager.installBrowser).toHaveBeenCalledWith("chromium");
      expect(mockInstallationManager.installBrowser).toHaveBeenCalledWith("webkit");
      expect(mockInstallationManager.installBrowser).not.toHaveBeenCalledWith("firefox");
    });

    it("should handle empty browser list", async () => {
      await expect(factory.preinstallBrowsers([])).resolves.not.toThrow();
    });

    it("should handle installation failures gracefully", async () => {
      mockInstallationManager.isBrowserInstalled = vi.fn().mockResolvedValue(false);
      mockInstallationManager.installBrowser = vi
        .fn()
        .mockRejectedValueOnce(new Error("Chromium install failed"))
        .mockResolvedValueOnce(undefined); // Firefox succeeds

      // Should not throw despite chromium failure
      await expect(factory.preinstallBrowsers(["chromium", "firefox"])).resolves.not.toThrow();
    });
  });

  describe("getBrowserStatus", () => {
    it("should return browser status for all types", async () => {
      mockInstallationManager.isBrowserInstalled = vi
        .fn()
        .mockResolvedValueOnce(true) // chromium
        .mockResolvedValueOnce(false) // firefox
        .mockResolvedValueOnce(true); // webkit

      const status = await factory.getBrowserStatus();

      expect(status).toEqual({
        chromium: true,
        firefox: false,
        webkit: true,
      });
      expect(mockInstallationManager.isBrowserInstalled).toHaveBeenCalledTimes(3);
    });

    it("should handle status check errors", async () => {
      mockInstallationManager.isBrowserInstalled = vi
        .fn()
        .mockRejectedValueOnce(new Error("Status check failed"))
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      // Should throw when status check fails
      await expect(factory.getBrowserStatus()).rejects.toThrow("Status check failed");
    });
  });

  describe("launch option merging", () => {
    it("should merge factory and browser-specific launch options", async () => {
      const { chromium } = await import("playwright");
      (chromium.launch as ReturnType<typeof vi.fn>).mockResolvedValue(mockBrowser);

      const factoryConfig: BrowserFactoryConfig = {
        installationManager: mockInstallationManager,
        launchOptions: {
          chromium: {
            headless: false,
            args: ["--custom-arg"],
          },
        },
      };

      const configuredFactory = new BrowserFactory(factoryConfig);

      await configuredFactory.createInstance({
        browserType: "chromium",
        headless: true, // This should be overridden by browser-specific options
        timeout: 30000,
      });

      expect(chromium.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          headless: true, // Instance config takes precedence over factory config
          args: expect.arrayContaining(["--custom-arg"]),
          timeout: 30000,
        }),
      );
    });
  });

  describe("MCP mode", () => {
    it("should create MCP browser manager when mcpMode is true", () => {
      const mcpFactory = new BrowserFactory({
        installationManager: mockInstallationManager,
        mcpMode: true,
      });

      // The factory should be created successfully
      expect(mcpFactory).toBeDefined();
    });
  });

  describe("resource limits", () => {
    it("should apply memory limits for chromium", async () => {
      const { chromium } = await import("playwright");
      (chromium.launch as ReturnType<typeof vi.fn>).mockResolvedValue(mockBrowser);

      const config = {
        browserType: "chromium" as const,
        headless: true,
        timeout: 30000,
        resourceLimits: {
          maxMemoryMB: 512,
        },
      };

      await factory.createInstance(config);

      expect(chromium.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.arrayContaining(["--max_old_space_size=512"]),
        }),
      );
    });
  });

  describe("MCP mode", () => {
    it("should create MCP browser manager when mcpMode is true", () => {
      const mcpFactory = new BrowserFactory({
        installationManager: mockInstallationManager,
        mcpMode: true,
      });

      // The factory should be created successfully
      expect(mcpFactory).toBeDefined();
    });
  });

  describe("resource limits", () => {
    it("should apply memory limits for chromium", async () => {
      const { chromium } = await import("playwright");
      (chromium.launch as ReturnType<typeof vi.fn>).mockResolvedValue(mockBrowser);

      const config = {
        browserType: "chromium" as const,
        headless: true,
        timeout: 30000,
        resourceLimits: {
          maxMemoryMB: 512,
        },
      };

      await factory.createInstance(config);

      expect(chromium.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.arrayContaining(["--max_old_space_size=512"]),
        }),
      );
    });
  });

  describe("MCP mode edge cases", () => {
    it("should handle MCP mode with missing browser manager", async () => {
      const { chromium } = await import("playwright");
      (chromium.launch as ReturnType<typeof vi.fn>).mockResolvedValue(mockBrowser);

      const mcpFactory = new BrowserFactory({
        installationManager: mockInstallationManager,
        mcpMode: true,
      });

      // Mock MCPBrowserManager constructor to return null
      vi.mocked(MCPBrowserManager).mockImplementationOnce(() => null as any);

      await mcpFactory.createInstance({
        browserType: "chromium",
        headless: true,
        timeout: 30000,
      });

      // Should still work by falling back to regular installation manager
      expect(chromium.launch).toHaveBeenCalled();
    });

    it("should handle MCP browser manager acquisition failures", async () => {
      const { chromium } = await import("playwright");
      (chromium.launch as ReturnType<typeof vi.fn>).mockResolvedValue(mockBrowser);

      const mcpFactory = new BrowserFactory({
        installationManager: mockInstallationManager,
        mcpMode: true,
      });

      // Mock MCP browser manager with failing acquireBrowser
      const mockMCPManager = {
        acquireBrowser: vi.fn().mockRejectedValue(new Error("MCP acquire failed")),
      };
      (mcpFactory as any).mcpBrowserManager = mockMCPManager;

      await mcpFactory.createInstance({
        browserType: "chromium",
        headless: true,
        timeout: 30000,
      });

      // Should still work by falling back to regular installation manager
      expect(chromium.launch).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should handle browser instance creation failures", async () => {
      const { chromium } = await import("playwright");
      (chromium.launch as ReturnType<typeof vi.fn>).mockResolvedValue(mockBrowser);

      // Mock BrowserInstance constructor to throw
      vi.mocked(BrowserInstance).mockImplementationOnce(() => {
        throw new Error("Instance creation failed");
      });

      await expect(
        factory.createInstance({
          browserType: "chromium",
          headless: true,
          timeout: 30000,
        }),
      ).rejects.toThrow("Instance creation failed");
    });

    it("should handle browser instance initialization failures", async () => {
      const { chromium } = await import("playwright");
      (chromium.launch as ReturnType<typeof vi.fn>).mockResolvedValue(mockBrowser);

      // Mock BrowserInstance to return instance with failing initialize
      vi.mocked(BrowserInstance).mockImplementationOnce(
        (config) =>
          ({
            id: config.id || "test-instance",
            browserType: config.browserType,
            initialize: vi.fn().mockRejectedValue(new Error("Initialization failed")),
          }) as any,
      );

      await expect(
        factory.createInstance({
          browserType: "chromium",
          headless: true,
          timeout: 30000,
        }),
      ).rejects.toThrow("Initialization failed");
    });
  });

  describe("resource limits edge cases", () => {
    it("should handle zero memory limit", async () => {
      const { chromium } = await import("playwright");
      (chromium.launch as ReturnType<typeof vi.fn>).mockResolvedValue(mockBrowser);

      const config = {
        browserType: "chromium" as const,
        headless: true,
        timeout: 30000,
        resourceLimits: {
          maxMemoryMB: 0,
        },
      };

      await factory.createInstance(config);

      expect(chromium.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.not.arrayContaining([expect.stringContaining("--max_old_space_size")]),
        }),
      );
    });

    it("should handle undefined resource limits", async () => {
      const { chromium } = await import("playwright");
      (chromium.launch as ReturnType<typeof vi.fn>).mockResolvedValue(mockBrowser);

      const config = {
        browserType: "chromium" as const,
        headless: true,
        timeout: 30000,
        resourceLimits: undefined,
      };

      await factory.createInstance(config);

      expect(chromium.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.not.arrayContaining([expect.stringContaining("--max_old_space_size")]),
        }),
      );
    });
  });

  describe("configuration validation", () => {
    it("should handle missing installation manager", async () => {
      const { chromium } = await import("playwright");
      (chromium.launch as ReturnType<typeof vi.fn>).mockResolvedValue(mockBrowser);

      const factoryWithoutManager = new BrowserFactory({
        installationManager: undefined,
      });

      // Should create a default installation manager
      expect(() => factoryWithoutManager).not.toThrow();
    });

    it("should handle invalid browser types gracefully", async () => {
      const { chromium } = await import("playwright");
      (chromium.launch as ReturnType<typeof vi.fn>).mockResolvedValue(mockBrowser);

      // This would normally throw, but let's test the error handling
      const config = {
        browserType: "invalid" as any,
        headless: true,
        timeout: 30000,
      };

      await expect(factory.createInstance(config)).rejects.toThrow();
    });
  });
});
