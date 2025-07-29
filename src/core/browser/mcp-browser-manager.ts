/**
 * MCP Browser Manager for silent browser acquisition
 * Ensures no stdout contamination during MCP protocol operations
 */

import { getLogger } from "../../shared/pino-logger.js";
import type { BrowserInstallationManager } from "./browser-installation-manager.js";
import type { BrowserType } from "./types.js";

const logger = getLogger("mcp-browser-manager");

export class MCPBrowserManager {
  private installationManager: BrowserInstallationManager;
  private installationPromises = new Map<BrowserType, Promise<void>>();

  constructor(installationManager: BrowserInstallationManager) {
    this.installationManager = installationManager;
  }

  /**
   * Silently acquire a browser, installing if necessary
   * This method ensures no stdout output during MCP operations
   */
  async acquireBrowser(browserType: BrowserType): Promise<void> {
    // Check if browser is already installed
    const isInstalled = await this.installationManager.isBrowserInstalled(browserType);
    if (isInstalled) {
      logger.debug("Browser already installed", { browserType });
      return;
    }

    // Check if installation is already in progress
    const existingPromise = this.installationPromises.get(browserType);
    if (existingPromise) {
      logger.debug("Browser installation already in progress", { browserType });
      return existingPromise;
    }

    // Start silent installation
    const installPromise = this.performSilentInstallation(browserType);
    this.installationPromises.set(browserType, installPromise);

    try {
      await installPromise;
    } finally {
      this.installationPromises.delete(browserType);
    }
  }

  /**
   * Perform silent browser installation
   */
  private async performSilentInstallation(browserType: BrowserType): Promise<void> {
    logger.info("Starting silent browser installation", { browserType });

    try {
      // The installation manager already handles silent mode
      // It logs to stderr/file, not stdout
      await this.installationManager.installBrowser(browserType, {
        silent: true,
        skipProgress: true,
      });

      logger.info("Silent browser installation completed", { browserType });
    } catch (error) {
      logger.error("Silent browser installation failed", {
        browserType,
        error: error instanceof Error ? error.message : String(error),
      });

      // In MCP mode, we should fail gracefully without corrupting stdout
      throw new Error(
        `Browser installation failed: ${browserType}. Please run 'brooklyn browser install ${browserType}' manually.`,
      );
    }
  }

  /**
   * Check if all browsers are ready
   */
  async ensureAllBrowsersReady(): Promise<{
    chromium: boolean;
    firefox: boolean;
    webkit: boolean;
  }> {
    const status = {
      chromium: await this.installationManager.isBrowserInstalled("chromium"),
      firefox: await this.installationManager.isBrowserInstalled("firefox"),
      webkit: await this.installationManager.isBrowserInstalled("webkit"),
    };

    logger.debug("Browser readiness check", status);
    return status;
  }

  /**
   * Get browser installation paths
   */
  async getBrowserPaths(): Promise<{
    chromium?: string;
    firefox?: string;
    webkit?: string;
  }> {
    const paths: Record<string, string | undefined> = {};

    for (const browserType of ["chromium", "firefox", "webkit"] as BrowserType[]) {
      try {
        const detector = this.installationManager.getSystemBrowserDetector();
        const browserInfo = await detector.detectBrowser(browserType);
        if (browserInfo?.executablePath) {
          paths[browserType] = browserInfo.executablePath;
        }
      } catch {
        // Ignore errors for missing browsers
      }
    }

    return paths;
  }
}
