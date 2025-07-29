/**
 * Browser factory for consistent browser creation
 * Integrates with browser installation manager from Phase 0
 */

import { chromium, firefox, webkit } from "playwright";
import type { Browser, LaunchOptions } from "playwright";
import { getLogger } from "../../shared/pino-logger.js";
import { BrowserInstallationManager } from "./browser-installation-manager.js";
import { BrowserInstance, type BrowserInstanceConfig } from "./browser-instance.js";
import { MCPBrowserManager } from "./mcp-browser-manager.js";

const logger = getLogger("browser-factory");

export interface BrowserFactoryConfig {
  installationManager?: BrowserInstallationManager;
  mcpMode?: boolean;
  defaultTimeout?: number;
  defaultHeadless?: boolean;
  launchOptions?: {
    chromium?: LaunchOptions;
    firefox?: LaunchOptions;
    webkit?: LaunchOptions;
  };
}

export class BrowserFactory {
  private installationManager: BrowserInstallationManager;
  private mcpBrowserManager?: MCPBrowserManager;
  private config: BrowserFactoryConfig;

  constructor(config: BrowserFactoryConfig = {}) {
    this.config = config;
    this.installationManager = config.installationManager || new BrowserInstallationManager();

    if (config.mcpMode) {
      this.mcpBrowserManager = new MCPBrowserManager(this.installationManager);
    }
  }

  /**
   * Create a new browser instance
   */
  async createInstance(config: BrowserInstanceConfig): Promise<BrowserInstance> {
    logger.info("Creating browser instance", {
      browserType: config.browserType,
      teamId: config.teamId,
      headless: config.headless,
    });

    try {
      // Ensure browser is installed
      await this.ensureBrowserInstalled(config.browserType);

      // Launch browser
      const browser = await this.launchBrowser(config);

      // Create instance wrapper
      const instance = new BrowserInstance(config);
      await instance.initialize(browser);

      logger.info("Browser instance created", {
        instanceId: instance.id,
        browserType: config.browserType,
        teamId: config.teamId,
      });

      return instance;
    } catch (error) {
      logger.error("Failed to create browser instance", {
        browserType: config.browserType,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Ensure browser is installed before launching
   */
  private async ensureBrowserInstalled(
    browserType: "chromium" | "firefox" | "webkit",
  ): Promise<void> {
    if (this.config.mcpMode && this.mcpBrowserManager) {
      // Use MCP browser manager for silent acquisition
      await this.mcpBrowserManager.acquireBrowser(browserType);
    } else {
      // Use standard installation manager
      const installed = await this.installationManager.isBrowserInstalled(browserType);
      if (!installed) {
        logger.info("Browser not installed, installing now", { browserType });
        await this.installationManager.installBrowser(browserType);
      }
    }
  }

  /**
   * Launch browser with appropriate configuration
   */
  private async launchBrowser(config: BrowserInstanceConfig): Promise<Browser> {
    const launchOptions = this.buildLaunchOptions(config);

    logger.debug("Launching browser", {
      browserType: config.browserType,
      options: launchOptions,
    });

    switch (config.browserType) {
      case "firefox":
        return await firefox.launch(launchOptions);

      case "webkit":
        return await webkit.launch(launchOptions);

      default:
        return await chromium.launch(launchOptions);
    }
  }

  /**
   * Build launch options for browser
   */
  private buildLaunchOptions(config: BrowserInstanceConfig): LaunchOptions {
    const baseOptions: LaunchOptions = {
      headless: config.headless ?? this.config.defaultHeadless ?? true,
      timeout: config.timeout ?? this.config.defaultTimeout ?? 30000,
    };

    // Get browser-specific options
    const browserOptions = this.config.launchOptions?.[config.browserType] || {};

    // Merge options
    const options = { ...browserOptions, ...baseOptions };

    // Add Chromium-specific flags for better stability
    if (config.browserType === "chromium") {
      options.args = [
        ...(options.args || []),
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
        "--disable-gpu",
        "--no-zygote",
      ];

      // Add memory limits if specified
      if (config.resourceLimits?.maxMemoryMB) {
        options.args.push(`--max_old_space_size=${config.resourceLimits.maxMemoryMB}`);
      }
    }

    return options;
  }

  /**
   * Get browser installation status
   */
  async getBrowserStatus(): Promise<{
    chromium: boolean;
    firefox: boolean;
    webkit: boolean;
  }> {
    return {
      chromium: await this.installationManager.isBrowserInstalled("chromium"),
      firefox: await this.installationManager.isBrowserInstalled("firefox"),
      webkit: await this.installationManager.isBrowserInstalled("webkit"),
    };
  }

  /**
   * Preinstall browsers for warmup
   */
  async preinstallBrowsers(browsers: Array<"chromium" | "firefox" | "webkit">): Promise<void> {
    logger.info("Preinstalling browsers", { browsers });

    const installPromises = browsers.map(async (browserType) => {
      try {
        await this.ensureBrowserInstalled(browserType);
        logger.info("Browser preinstalled", { browserType });
      } catch (error) {
        logger.error("Failed to preinstall browser", {
          browserType,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    await Promise.allSettled(installPromises);
  }

  /**
   * Clean browser cache
   */
  async cleanBrowserCache(): Promise<void> {
    logger.info("Cleaning browser cache");
    await this.installationManager.cleanCache();
  }
}
