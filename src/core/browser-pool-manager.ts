/**
 * Browser pool manager for Brooklyn MCP server
 * Enterprise-ready Playwright integration with resource management
 */

import { randomUUID } from "node:crypto";
import { chromium, firefox, webkit } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";

import { config } from "../shared/config.js";
import { getLogger } from "../shared/logger.js";
import {
  ScreenshotStorageManager,
  type ScreenshotStorageResult,
} from "./screenshot-storage-manager.js";

// ARCHITECTURE FIX: Lazy logger initialization to avoid circular dependency
let logger: ReturnType<typeof getLogger> | null = null;

function ensureLogger() {
  if (!logger) {
    logger = getLogger("browser-pool");
  }
  return logger;
}

// Browser session interface
interface BrowserSession {
  id: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  teamId?: string;
  createdAt: Date;
  lastUsed: Date;
  isActive: boolean;
}

// Browser launch arguments interface
interface LaunchBrowserArgs {
  teamId?: string;
  browserType?: "chromium" | "firefox" | "webkit";
  headless?: boolean;
  userAgent?: string;
  viewport?: { width: number; height: number };
  timeout?: number;
}

// Navigation arguments interface
interface NavigateArgs {
  browserId: string;
  url: string;
  timeout?: number;
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
}

// Screenshot arguments interface
interface ScreenshotArgs {
  browserId: string;
  fullPage?: boolean;
  quality?: number;
  type?: "png" | "jpeg";
  clip?: { x: number; y: number; width: number; height: number };
  // Architecture Committee approved new options
  returnFormat?: "file" | "url" | "base64_thumbnail";
  teamId?: string;
  sessionId?: string;
  encryption?: boolean;
  outputPath?: string;
}

// Close browser arguments interface
interface CloseBrowserArgs {
  browserId: string;
  force?: boolean;
}

export class BrowserPoolManager {
  private sessions = new Map<string, BrowserSession>();
  private maxBrowsers: number;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly cleanupIntervalMs = 5 * 60 * 1000; // 5 minutes
  private readonly maxIdleTime = 30 * 60 * 1000; // 30 minutes
  private readonly storageManager: ScreenshotStorageManager;

  constructor() {
    this.maxBrowsers = config.maxBrowsers || 10;
    this.storageManager = new ScreenshotStorageManager();
  }

  async initialize(): Promise<void> {
    ensureLogger().info("Initializing browser pool", {
      maxBrowsers: this.maxBrowsers,
      cleanupInterval: this.cleanupIntervalMs,
      maxIdleTime: this.maxIdleTime,
    });

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleSessions().catch((error) => {
        ensureLogger().error("Failed to cleanup idle sessions", { error });
      });
    }, this.cleanupIntervalMs);

    ensureLogger().info("Browser pool initialized successfully");
  }

  async cleanup(): Promise<void> {
    ensureLogger().info("Cleaning up browser pool", { activeSessions: this.sessions.size });

    // Clear cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Close all browser sessions
    const closePromises = Array.from(this.sessions.values()).map((session) =>
      this.closeBrowserSession(session),
    );

    await Promise.allSettled(closePromises);
    this.sessions.clear();

    ensureLogger().info("Browser pool cleanup completed");
  }

  async launchBrowser(args: LaunchBrowserArgs): Promise<{
    browserId: string;
    browserType: string;
    headless: boolean;
    userAgent: string;
    viewport: { width: number; height: number };
  }> {
    const {
      teamId,
      browserType = "chromium",
      headless = true,
      userAgent,
      viewport = { width: 1920, height: 1080 },
      timeout = 30000,
    } = args;

    ensureLogger().info("Launching browser", {
      teamId,
      browserType,
      headless,
      activeSessions: this.sessions.size,
      maxBrowsers: this.maxBrowsers,
    });

    // Check browser pool limits
    if (this.sessions.size >= this.maxBrowsers) {
      // Try to clean up idle sessions first
      await this.cleanupIdleSessions();

      if (this.sessions.size >= this.maxBrowsers) {
        throw new Error(
          `Browser pool limit reached (${this.maxBrowsers}). Please close unused browsers.`,
        );
      }
    }

    const browserId = randomUUID();
    const now = new Date();

    try {
      // Launch browser based on type
      let browserInstance: Browser;
      switch (browserType) {
        case "firefox":
          browserInstance = await firefox.launch({
            headless,
            timeout,
          });
          break;
        case "webkit":
          browserInstance = await webkit.launch({
            headless,
            timeout,
          });
          break;
        default:
          browserInstance = await chromium.launch({
            headless,
            timeout,
            args: [
              "--no-sandbox",
              "--disable-setuid-sandbox",
              "--disable-dev-shm-usage",
              "--disable-web-security",
              "--disable-features=VizDisplayCompositor",
            ],
          });
          break;
      }

      // Create browser context
      const context = await browserInstance.newContext({
        viewport,
        userAgent,
        ignoreHTTPSErrors: true,
      });

      // Create page
      const page = await context.newPage();

      // Configure page timeouts
      page.setDefaultTimeout(timeout);
      page.setDefaultNavigationTimeout(timeout);

      // Store session
      const session: BrowserSession = {
        id: browserId,
        browser: browserInstance,
        context,
        page,
        teamId,
        createdAt: now,
        lastUsed: now,
        isActive: true,
      };

      this.sessions.set(browserId, session);

      ensureLogger().info("Browser launched successfully", {
        browserId,
        browserType,
        teamId,
        activeSessions: this.sessions.size,
      });

      return {
        browserId,
        browserType,
        headless,
        userAgent: userAgent || (await page.evaluate(() => navigator.userAgent)),
        viewport,
      };
    } catch (error) {
      ensureLogger().error("Failed to launch browser", {
        browserId,
        browserType,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to launch ${browserType} browser: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async navigate(args: NavigateArgs): Promise<{
    success: boolean;
    url: string;
    title: string;
    statusCode?: number;
    loadTime: number;
  }> {
    const { browserId, url, timeout = 30000, waitUntil = "domcontentloaded" } = args;

    ensureLogger().info("Navigating browser", { browserId, url, waitUntil });

    const session = this.sessions.get(browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${browserId}`);
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }

    const startTime = Date.now();
    session.lastUsed = new Date();

    try {
      const response = await session.page.goto(url, {
        timeout,
        waitUntil,
      });

      const loadTime = Date.now() - startTime;
      const title = await session.page.title();
      const finalUrl = session.page.url();

      ensureLogger().info("Navigation completed", {
        browserId,
        url: finalUrl,
        title,
        loadTime,
        statusCode: response?.status(),
      });

      return {
        success: true,
        url: finalUrl,
        title,
        statusCode: response?.status(),
        loadTime,
      };
    } catch (error) {
      const loadTime = Date.now() - startTime;
      ensureLogger().error("Navigation failed", {
        browserId,
        url,
        loadTime,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Navigation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async screenshot(args: ScreenshotArgs): Promise<{
    filePath: string;
    filename: string;
    format: string;
    dimensions: { width: number; height: number };
    fileSize: number;
    auditId: string;
    returnFormat: string;
    data?: string; // Only for base64_thumbnail backward compatibility
  }> {
    const {
      browserId,
      fullPage = false,
      quality = 90,
      type = "png",
      clip,
      returnFormat = "file", // Default to file storage (Architecture Committee guidance)
      teamId,
      sessionId,
      encryption,
    } = args;

    ensureLogger().info("Taking screenshot with file storage", {
      browserId,
      fullPage,
      type,
      quality,
      returnFormat,
      teamId,
      sessionId,
    });

    const session = this.sessions.get(browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${browserId}`);
    }

    session.lastUsed = new Date();

    try {
      const screenshotOptions: Parameters<Page["screenshot"]>[0] = {
        fullPage,
        type,
        quality: type === "jpeg" ? quality : undefined,
        clip,
      };

      const buffer = await session.page.screenshot(screenshotOptions);

      // Get page dimensions
      const dimensions = await session.page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      }));

      // Generate session ID if not provided
      const effectiveSessionId = sessionId || `browser-session-${browserId}`;

      // Save to file storage using ScreenshotStorageManager
      const storageResult: ScreenshotStorageResult = await this.storageManager.saveScreenshot(
        buffer,
        dimensions,
        {
          sessionId: effectiveSessionId,
          browserId,
          teamId,
          format: type,
          quality,
          fullPage,
          encryption,
        },
      );

      ensureLogger().info("Screenshot saved to file storage", {
        browserId,
        filePath: storageResult.filePath,
        fileSize: storageResult.fileSize,
        auditId: storageResult.auditId,
        returnFormat,
      });

      // Prepare response based on return format
      const response = {
        filePath: storageResult.filePath,
        filename: storageResult.filename,
        format: storageResult.format,
        dimensions,
        fileSize: storageResult.fileSize,
        auditId: storageResult.auditId,
        returnFormat,
      };

      // Backward compatibility: provide base64 thumbnail for legacy clients
      if (returnFormat === "base64_thumbnail") {
        // Generate small thumbnail (max 64x64) to stay under 10K tokens
        const thumbnailBuffer = buffer.length > 10000 ? buffer.slice(0, 10000) : buffer; // Simple truncation for now

        return {
          ...response,
          data: thumbnailBuffer.toString("base64"),
        };
      }

      return response;
    } catch (error) {
      ensureLogger().error("Screenshot failed", {
        browserId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Screenshot failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async closeBrowser(args: CloseBrowserArgs): Promise<{
    success: boolean;
    browserId: string;
  }> {
    const { browserId, force = false } = args;

    ensureLogger().info("Closing browser", { browserId, force });

    const session = this.sessions.get(browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${browserId}`);
    }

    try {
      await this.closeBrowserSession(session, force);
      this.sessions.delete(browserId);

      ensureLogger().info("Browser closed successfully", {
        browserId,
        remainingSessions: this.sessions.size,
      });

      return {
        success: true,
        browserId,
      };
    } catch (error) {
      ensureLogger().error("Failed to close browser", {
        browserId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to close browser: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * List all active browsers
   */
  async listActiveBrowsers(): Promise<{
    browsers: Array<{
      browserId: string;
      browserType: string;
      headless: boolean;
      launchedAt: Date;
      currentUrl?: string;
      teamId?: string;
      isActive: boolean;
    }>;
  }> {
    const browsers = Array.from(this.sessions.values()).map((session) => ({
      browserId: session.id,
      browserType: "chromium", // TODO: Track actual browser type
      headless: true, // TODO: Track actual headless mode
      launchedAt: session.createdAt,
      currentUrl: session.page.url(),
      teamId: session.teamId,
      isActive: session.isActive,
    }));

    return { browsers };
  }

  /**
   * Navigate browser back in history
   */
  async goBack(args: { browserId: string }): Promise<{
    browserId: string;
    status: string;
    url?: string;
  }> {
    const session = this.sessions.get(args.browserId);
    if (!session) {
      throw new Error(`Browser with ID ${args.browserId} not found`);
    }

    try {
      session.lastUsed = new Date();

      // Navigate back in history
      await session.page.goBack();
      const url = session.page.url();

      ensureLogger().info("Browser navigated back", {
        browserId: args.browserId,
        url,
      });

      return {
        browserId: args.browserId,
        status: "navigated_back",
        url,
      };
    } catch (error) {
      ensureLogger().error("Go back failed", {
        browserId: args.browserId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // Get browser pool status
  getStatus(): {
    activeSessions: number;
    maxBrowsers: number;
    sessions: Array<{
      id: string;
      teamId?: string;
      createdAt: Date;
      lastUsed: Date;
      isActive: boolean;
    }>;
  } {
    return {
      activeSessions: this.sessions.size,
      maxBrowsers: this.maxBrowsers,
      sessions: Array.from(this.sessions.values()).map((session) => ({
        id: session.id,
        teamId: session.teamId,
        createdAt: session.createdAt,
        lastUsed: session.lastUsed,
        isActive: session.isActive,
      })),
    };
  }

  // Private helper methods
  private async closeBrowserSession(session: BrowserSession, force = false): Promise<void> {
    try {
      if (session.page && !session.page.isClosed()) {
        await session.page.close();
      }
    } catch (error) {
      ensureLogger().warn("Failed to close page", {
        sessionId: session.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      if (session.context && !session.context.pages().length) {
        await session.context.close();
      }
    } catch (error) {
      ensureLogger().warn("Failed to close context", {
        sessionId: session.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      if (session.browser?.isConnected()) {
        await session.browser.close();
      }
    } catch (error) {
      if (force) {
        ensureLogger().warn("Force closing browser despite error", {
          sessionId: session.id,
          error: error instanceof Error ? error.message : String(error),
        });
      } else {
        throw error;
      }
    }
  }

  private async cleanupIdleSessions(): Promise<void> {
    const now = Date.now();
    const sessionsToCleanup: string[] = [];

    for (const [id, session] of this.sessions) {
      const idleTime = now - session.lastUsed.getTime();
      if (idleTime > this.maxIdleTime) {
        sessionsToCleanup.push(id);
      }
    }

    if (sessionsToCleanup.length > 0) {
      ensureLogger().info("Cleaning up idle sessions", {
        count: sessionsToCleanup.length,
        sessions: sessionsToCleanup,
      });

      for (const sessionId of sessionsToCleanup) {
        const session = this.sessions.get(sessionId);
        if (session) {
          try {
            await this.closeBrowserSession(session, true);
            this.sessions.delete(sessionId);
          } catch (error) {
            ensureLogger().error("Failed to cleanup idle session", {
              sessionId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
    }
  }
}
