/**
 * Browser Installation Manager - Core of Phase 0
 * Implements progressive browser installation with 96% distribution size reduction
 * Architecture Committee approved patterns from docemist
 */

import { existsSync, mkdirSync } from "node:fs";
import { constants, access, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { getLogger } from "../../shared/pino-logger.js";
import { InstallationProgressTracker } from "./installation-progress-tracker.js";
import { getSystemBrowserDetector } from "./system-browser-detector.js";
import {
  BROWSER_INSTALL_TIMEOUT,
  type BrowserAvailabilityResult,
  BrowserInstallationError,
  type BrowserInstallationOptions,
  type BrowserInstallationStatus,
  type BrowserType,
  type InstallationCache,
  MAX_INSTALLATION_RETRIES,
} from "./types.js";

// Lazy logger initialization
let logger: ReturnType<typeof getLogger> | null = null;
function ensureLogger() {
  if (!logger) {
    logger = getLogger("browser-installation-manager");
  }
  return logger;
}

export class BrowserInstallationManager {
  private readonly installDir: string;
  private readonly cacheFile: string;
  private installationCache: InstallationCache = {};
  private readonly systemDetector = getSystemBrowserDetector();
  private activeInstallations = new Map<BrowserType, Promise<string>>();

  constructor(customInstallDir?: string) {
    // Default to user home directory for browser installations
    this.installDir = customInstallDir || join(homedir(), ".brooklyn", "browsers");
    this.cacheFile = join(this.installDir, "installation-cache.json");

    // Ensure install directory exists
    if (!existsSync(this.installDir)) {
      mkdirSync(this.installDir, { recursive: true });
    }

    // Load installation cache
    this.loadCache().catch(() => {
      // Cache load failure is not critical, continue with empty cache
    });
  }

  /**
   * Ensure browser is available using progressive fallback strategy
   * 1. Check if already installed by Brooklyn
   * 2. Try system browser fallback
   * 3. Auto-install on first use
   */
  async ensureBrowserAvailable(
    type: BrowserType,
    options?: Partial<BrowserInstallationOptions>,
  ): Promise<BrowserAvailabilityResult> {
    ensureLogger().info("Ensuring browser availability", { type, options });

    // Check if installation is already in progress
    const activeInstall = this.activeInstallations.get(type);
    if (activeInstall) {
      ensureLogger().info("Browser installation already in progress, waiting...", { type });
      try {
        const executablePath = await activeInstall;
        return {
          isAvailable: true,
          source: "installed",
          executablePath,
          requiresInstallation: false,
        };
      } catch (error) {
        ensureLogger().error("Active installation failed", {
          type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 1. Check if browser already installed
    const installedPath = await this.checkInstalledBrowser(type);
    if (installedPath) {
      ensureLogger().info("Browser already installed", { type, path: installedPath });
      return {
        isAvailable: true,
        source: "installed",
        executablePath: installedPath,
        requiresInstallation: false,
      };
    }

    // 2. Try system browser fallback
    const systemBrowser = await this.systemDetector.detectBrowser(type);
    if (systemBrowser?.isUsable) {
      ensureLogger().info("Using system browser", {
        type,
        path: systemBrowser.executablePath,
        version: systemBrowser.version,
      });
      return {
        isAvailable: true,
        source: "system",
        executablePath: systemBrowser.executablePath,
        version: systemBrowser.version,
        requiresInstallation: false,
      };
    }

    // 3. Browser not available, installation required
    if (options?.interactive === false) {
      ensureLogger().info("Browser not available and non-interactive mode", { type });
      return {
        isAvailable: false,
        source: "none",
        requiresInstallation: true,
      };
    }

    // Auto-install browser
    ensureLogger().info("Browser not found, starting installation", { type });
    const installPromise = this.installBrowser(type, options);
    this.activeInstallations.set(type, installPromise);

    try {
      const executablePath = await installPromise;
      return {
        isAvailable: true,
        source: "installed",
        executablePath,
        requiresInstallation: false,
      };
    } finally {
      this.activeInstallations.delete(type);
    }
  }

  /**
   * Install browser with progress tracking
   */
  async installBrowser(
    type: BrowserType,
    options?: Partial<BrowserInstallationOptions>,
  ): Promise<string> {
    const tracker = new InstallationProgressTracker(type);

    if (options?.onProgress) {
      tracker.onProgress(options.onProgress);
    }

    try {
      // Check if already installed (unless force reinstall)
      if (!options?.forceReinstall) {
        const existingPath = await this.checkInstalledBrowser(type);
        if (existingPath) {
          tracker.complete("Browser already installed");
          return existingPath;
        }
      }

      tracker.setPhase("downloading");

      // Use Playwright's installation mechanism
      const executablePath = await this.downloadAndInstallBrowser(type, tracker);

      tracker.setPhase("verifying");
      await this.verifyInstallation(type, executablePath);

      // Update cache
      await this.updateCache(type, {
        installed: true,
        version: await this.getBrowserVersion(type, executablePath),
        path: executablePath,
        lastChecked: new Date(),
      });

      tracker.complete();
      return executablePath;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      tracker.fail(errorMessage);
      throw new BrowserInstallationError(
        `Failed to install ${type}: ${errorMessage}`,
        "INSTALL_FAILED",
        type,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get browser installation status
   */
  async getBrowserStatus(type: BrowserType): Promise<BrowserInstallationStatus> {
    const cached = this.installationCache[type];
    if (cached) {
      return cached;
    }

    // Check if browser is installed
    const installedPath = await this.checkInstalledBrowser(type);
    if (installedPath) {
      const status: BrowserInstallationStatus = {
        installed: true,
        path: installedPath,
        version: await this.getBrowserVersion(type, installedPath),
        lastChecked: new Date(),
      };
      await this.updateCache(type, status);
      return status;
    }

    return {
      installed: false,
      lastChecked: new Date(),
    };
  }

  /**
   * Get status of all browser types
   */
  async getAllBrowserStatus(): Promise<Record<BrowserType, BrowserInstallationStatus>> {
    const types: BrowserType[] = ["chromium", "firefox", "webkit"];
    const results: Partial<Record<BrowserType, BrowserInstallationStatus>> = {};

    await Promise.all(
      types.map(async (type) => {
        results[type] = await this.getBrowserStatus(type);
      }),
    );

    return results as Record<BrowserType, BrowserInstallationStatus>;
  }

  // Private helper methods

  private async checkInstalledBrowser(type: BrowserType): Promise<string | null> {
    // Check cache first
    const cached = this.installationCache[type];
    if (cached?.installed && cached.path) {
      try {
        await access(cached.path, constants.X_OK);
        return cached.path;
      } catch {
        // Cached path no longer valid
        delete this.installationCache[type];
      }
    }

    // Check for browser directories in Playwright cache
    try {
      const cacheBase =
        process.platform === "darwin"
          ? join(homedir(), "Library", "Caches")
          : join(homedir(), ".cache");
      const playwrightCacheDir = join(cacheBase, "ms-playwright");

      if (!existsSync(playwrightCacheDir)) {
        return null;
      }

      // Look for browser-specific directories with version suffixes
      const { readdir } = await import("node:fs/promises");
      const entries = await readdir(playwrightCacheDir);
      const browserDirs = entries.filter((entry) => entry.startsWith(`${type}-`));

      if (browserDirs.length === 0) {
        return null;
      }

      // Use the most recent version (highest number)  
      const latestDir = browserDirs.sort().pop();
      if (!latestDir) {
        return null;
      }
      const browserPath = join(playwrightCacheDir, latestDir);

      // Verify the directory exists and contains browser files
      if (existsSync(browserPath)) {
        // Return the browser directory path - Playwright will handle the executable path
        return browserPath;
      }
    } catch (error) {
      ensureLogger().debug("Browser detection failed", {
        type,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return null;
  }

  private async downloadAndInstallBrowser(
    type: BrowserType,
    _tracker: InstallationProgressTracker,
  ): Promise<string> {
    ensureLogger().info("Downloading browser via Playwright", { type });

    // Import playwright dynamically to avoid bundling browsers
    const playwright = await import("playwright");

    // Install specific browser using Playwright's CLI
    const { spawnSync } = await import("node:child_process");

    // Run playwright install command
    const result = spawnSync("npx", ["playwright", "install", type], {
      stdio: "pipe",
      encoding: "utf8",
      timeout: BROWSER_INSTALL_TIMEOUT,
    });

    if (result.error) {
      throw new Error(`Failed to run playwright install: ${result.error.message}`);
    }

    if (result.status !== 0) {
      throw new Error(`Playwright install failed: ${result.stderr || result.stdout}`);
    }

    // Get the executable path after installation
    let executablePath: string;
    switch (type) {
      case "chromium":
        executablePath = playwright.chromium.executablePath();
        break;
      case "firefox":
        executablePath = playwright.firefox.executablePath();
        break;
      case "webkit":
        executablePath = playwright.webkit.executablePath();
        break;
      default:
        throw new Error(`Unknown browser type: ${type}`);
    }

    if (!(executablePath && existsSync(executablePath))) {
      throw new Error("Browser installation completed but executable not found");
    }

    return executablePath;
  }

  private async verifyInstallation(type: BrowserType, executablePath: string): Promise<void> {
    ensureLogger().info("Verifying browser installation", { type, executablePath });

    try {
      // Check if file exists and is executable
      await access(executablePath, constants.X_OK);

      // Try to launch the browser to verify it works
      const { chromium, firefox, webkit } = await import("playwright");
      let browser: unknown;

      switch (type) {
        case "chromium":
          browser = await chromium.launch({
            headless: true,
            timeout: 10000,
          });
          break;
        case "firefox":
          browser = await firefox.launch({
            headless: true,
            timeout: 10000,
          });
          break;
        case "webkit":
          browser = await webkit.launch({
            headless: true,
            timeout: 10000,
          });
          break;
      }

      if (browser && typeof browser === "object" && "close" in browser) {
        await (browser as { close: () => Promise<void> }).close();
      }

      ensureLogger().info("Browser verification successful", { type });
    } catch (error) {
      throw new Error(
        `Browser verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async getBrowserVersion(
    _type: BrowserType,
    executablePath: string,
  ): Promise<string | undefined> {
    try {
      const { execSync } = await import("node:child_process");
      const versionCommand = `"${executablePath}" --version`;
      const output = execSync(versionCommand, { encoding: "utf8" }).trim();

      // Extract version number
      const versionMatch = output.match(/(\d+\.\d+(\.\d+)*)/);
      return versionMatch ? versionMatch[1] : undefined;
    } catch {
      return undefined;
    }
  }

  private async loadCache(): Promise<void> {
    try {
      const cacheData = await readFile(this.cacheFile, "utf8");
      this.installationCache = JSON.parse(cacheData);

      // Convert date strings back to Date objects
      for (const key of Object.keys(this.installationCache)) {
        const entry = this.installationCache[key];
        if (entry?.lastChecked) {
          entry.lastChecked = new Date(entry.lastChecked);
        }
      }
    } catch {
      // Cache doesn't exist or is invalid, start fresh
      this.installationCache = {};
    }
  }

  private async updateCache(type: BrowserType, status: BrowserInstallationStatus): Promise<void> {
    this.installationCache[type] = status;

    try {
      await writeFile(this.cacheFile, JSON.stringify(this.installationCache, null, 2));
    } catch (error) {
      ensureLogger().warn("Failed to update installation cache", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get the path where a browser would be installed
   * Public method for browser info commands
   */
  getBrowserPath(_type: BrowserType): string {
    // Use Playwright's actual cache location (macOS uses Library/Caches, Linux uses .cache)
    const cacheBase =
      process.platform === "darwin"
        ? join(homedir(), "Library", "Caches")
        : join(homedir(), ".cache");
    const playwrightCacheDir = join(cacheBase, "ms-playwright");

    // Playwright installs browsers with version suffixes, so we return the base directory
    // The actual detection logic will scan for version-specific directories
    return playwrightCacheDir;
  }

  /**
   * Check if a browser is installed
   */
  async isBrowserInstalled(type: BrowserType): Promise<boolean> {
    const status = await this.getBrowserStatus(type);
    return status.installed;
  }

  /**
   * Clean browser cache
   */
  async cleanCache(): Promise<void> {
    ensureLogger().info("Cleaning browser cache");

    // Clear installation cache
    this.installationCache = {};

    // Update cache file
    try {
      await writeFile(this.cacheFile, JSON.stringify(this.installationCache, null, 2));
    } catch (error) {
      ensureLogger().warn("Failed to clean cache", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get system browser detector
   */
  getSystemBrowserDetector() {
    return this.systemDetector;
  }
}

// Singleton instance
let managerInstance: BrowserInstallationManager | null = null;

export function getBrowserInstallationManager(
  customInstallDir?: string,
): BrowserInstallationManager {
  if (!managerInstance) {
    managerInstance = new BrowserInstallationManager(customInstallDir);
  }
  return managerInstance;
}
