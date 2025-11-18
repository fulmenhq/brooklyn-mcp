/**
 * System browser detection for fallback support
 * Finds browsers already installed on the system
 */

import { exec } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { promisify } from "node:util";
import { getLogger } from "../../shared/pino-logger.js";
import type { BrowserType, SystemBrowserInfo } from "./types.js";
import { PLATFORM_BROWSER_PATHS } from "./types.js";

const execAsync = promisify(exec);

// Lazy logger initialization
let logger: ReturnType<typeof getLogger> | null = null;
function ensureLogger() {
  if (!logger) {
    logger = getLogger("system-browser-detector");
  }
  return logger;
}

export class SystemBrowserDetector {
  private readonly platform: string;
  private readonly homeDir: string;
  private cachedResults = new Map<BrowserType, SystemBrowserInfo | null>();
  private readonly cacheTimeout = 5 * 60 * 1000; // 5 minutes
  private lastCacheTime = 0;

  constructor() {
    this.platform = platform();
    this.homeDir = homedir();
  }

  /**
   * Detect if a system browser is available
   */
  async detectBrowser(browserType: BrowserType): Promise<SystemBrowserInfo | null> {
    // Check cache first
    if (this.isCacheValid()) {
      const cached = this.cachedResults.get(browserType);
      if (cached !== undefined) {
        return cached;
      }
    }

    ensureLogger().info("Detecting system browser", { browserType, platform: this.platform });

    try {
      const browserInfo = await this.findBrowser(browserType);

      // Cache the result
      this.cachedResults.set(browserType, browserInfo);
      this.lastCacheTime = Date.now();

      if (browserInfo) {
        ensureLogger().info("System browser found", {
          browserType,
          path: browserInfo.executablePath,
          version: browserInfo.version,
        });
      } else {
        ensureLogger().info("System browser not found", { browserType });
      }

      return browserInfo;
    } catch (error) {
      ensureLogger().error("Error detecting system browser", {
        browserType,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Detect all available system browsers
   */
  async detectAllBrowsers(): Promise<Map<BrowserType, SystemBrowserInfo>> {
    const results = new Map<BrowserType, SystemBrowserInfo>();
    const browserTypes: BrowserType[] = ["chromium", "firefox", "webkit"];

    await Promise.all(
      browserTypes.map(async (type) => {
        const info = await this.detectBrowser(type);
        if (info) {
          results.set(type, info);
        }
      }),
    );

    return results;
  }

  /**
   * Clear the detection cache
   */
  clearCache(): void {
    this.cachedResults.clear();
    this.lastCacheTime = 0;
  }

  // Private helper methods

  private isCacheValid(): boolean {
    return Date.now() - this.lastCacheTime < this.cacheTimeout;
  }

  private async findBrowser(browserType: BrowserType): Promise<SystemBrowserInfo | null> {
    const paths = this.getBrowserPaths(browserType);

    for (const pathTemplate of paths) {
      const path = this.expandPath(pathTemplate);

      try {
        await access(path, constants.X_OK);

        // Found executable, try to get version
        const version = await this.getBrowserVersion(browserType, path);

        return {
          type: browserType,
          executablePath: path,
          version,
          isUsable: true,
        };
      } catch {}
    }

    // Try command line detection as fallback
    return this.detectViaCommand(browserType);
  }

  private getBrowserPaths(browserType: BrowserType): string[] {
    const platformPaths = PLATFORM_BROWSER_PATHS[this.platform];
    if (!platformPaths) {
      ensureLogger().warn("Unsupported platform for browser detection", {
        platform: this.platform,
      });
      return [];
    }

    return platformPaths[browserType] || [];
  }

  private expandPath(path: string): string {
    let expandedPath = path;

    // Expand home directory
    if (expandedPath.startsWith("~")) {
      expandedPath = expandedPath.replace("~", this.homeDir);
    }

    // Expand environment variables (Windows)
    if (this.platform === "win32") {
      expandedPath = expandedPath.replace(/%([^%]+)%/g, (_, varName) => {
        return process.env[varName] || "";
      });
    }

    return expandedPath;
  }

  private async detectViaCommand(browserType: BrowserType): Promise<SystemBrowserInfo | null> {
    const commands = this.getDetectionCommands(browserType);

    for (const command of commands) {
      try {
        const { stdout } = await execAsync(command);
        const path = stdout.trim();

        if (path) {
          // Verify the path is executable
          await access(path, constants.X_OK);

          const version = await this.getBrowserVersion(browserType, path);

          return {
            type: browserType,
            executablePath: path,
            version,
            isUsable: true,
          };
        }
      } catch {}
    }

    return null;
  }

  private getDetectionCommands(browserType: BrowserType): string[] {
    if (this.platform === "win32") {
      // Windows commands
      switch (browserType) {
        case "chromium":
          return ["where chrome.exe", "where chromium.exe"];
        case "firefox":
          return ["where firefox.exe"];
        case "webkit":
          return []; // WebKit not available as system browser on Windows
        default:
          return [];
      }
    }
    // Unix-like commands
    switch (browserType) {
      case "chromium":
        return [
          "which chromium",
          "which chromium-browser",
          "which google-chrome",
          "which google-chrome-stable",
        ];
      case "firefox":
        return ["which firefox"];
      case "webkit":
        return []; // WebKit not available as system browser
      default:
        return [];
    }
  }

  private async getBrowserVersion(
    browserType: BrowserType,
    executablePath: string,
  ): Promise<string | undefined> {
    const versionCommands: Record<BrowserType, string[]> = {
      chromium: ["--version"],
      firefox: ["--version"],
      webkit: [], // Safari version detection is complex
    };

    const args = versionCommands[browserType];
    if (!args || args.length === 0) {
      return undefined;
    }

    try {
      const { stdout } = await execAsync(`"${executablePath}" ${args.join(" ")}`);
      const version = this.parseVersion(stdout.trim());
      return version;
    } catch (error) {
      ensureLogger().debug("Failed to get browser version", {
        browserType,
        path: executablePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  private parseVersion(versionOutput: string): string | undefined {
    // Extract version number from output
    // Examples:
    // "Google Chrome 120.0.6099.129"
    // "Mozilla Firefox 121.0"
    // "Chromium 120.0.6099.129"

    const versionMatch = versionOutput.match(/(\d+\.\d+(\.\d+)*)/);
    return versionMatch ? versionMatch[1] : undefined;
  }
}

/**
 * Singleton instance for system browser detection
 */
let detectorInstance: SystemBrowserDetector | null = null;

export function getSystemBrowserDetector(): SystemBrowserDetector {
  if (!detectorInstance) {
    detectorInstance = new SystemBrowserDetector();
  }
  return detectorInstance;
}
