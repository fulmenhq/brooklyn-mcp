/**
 * Browser Pool Manager for Brooklyn MCP Server
 * Enterprise-ready browser automation with team isolation and resource management
 */

import type { Page } from "playwright";
import { config } from "../shared/config.js";
import { getLogger } from "../shared/pino-logger.js";
import { BrowserFactory } from "./browser/browser-factory.js";
import type { BrowserInstance } from "./browser/browser-instance.js";
import { type AllocationRequest, BrowserPool } from "./browser/browser-pool.js";
import {
  ScreenshotStorageManager,
  type ScreenshotStorageResult,
} from "./screenshot-storage-manager.js";

const logger = getLogger("browser-pool-manager");

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

// Element interaction arguments interfaces
interface ClickElementArgs {
  browserId: string;
  selector: string;
  waitForClickable?: boolean;
  timeout?: number;
}

interface FillTextArgs {
  browserId: string;
  selector: string;
  text: string;
  clearFirst?: boolean;
  timeout?: number;
}

interface FillFormArgs {
  browserId: string;
  fieldMapping: Record<string, string>;
  timeout?: number;
}

interface WaitForElementArgs {
  browserId: string;
  selector: string;
  state?: "attached" | "detached" | "visible" | "hidden";
  timeout?: number;
}

interface GetTextContentArgs {
  browserId: string;
  selector: string;
  timeout?: number;
}

interface ValidateElementPresenceArgs {
  browserId: string;
  selector: string;
  shouldExist?: boolean;
  timeout?: number;
}

interface FindElementsArgs {
  browserId: string;
  selector: string;
  timeout?: number;
}

export interface BrowserPoolManagerConfig {
  maxBrowsers?: number;
  mcpMode?: boolean;
  allocationStrategy?: "round-robin" | "least-used" | "team-isolated";
  defaultTimeout?: number;
  defaultHeadless?: boolean;
}

/**
 * Main browser pool manager class
 */
export class BrowserPoolManager {
  private pool: BrowserPool;
  private factory: BrowserFactory;
  private sessions = new Map<string, { instance: BrowserInstance; page: Page; teamId?: string }>();
  private storageManager: ScreenshotStorageManager;
  private maxBrowsers: number;

  constructor(managerConfig: BrowserPoolManagerConfig = {}) {
    this.maxBrowsers = managerConfig.maxBrowsers || config.maxBrowsers || 10;
    this.storageManager = new ScreenshotStorageManager();

    // Initialize browser factory with MCP mode awareness
    // Prioritize explicit config over environment variable
    const mcpMode = managerConfig.mcpMode ?? process.env["MCP_MODE"] === "true";
    this.factory = new BrowserFactory({
      mcpMode,
      defaultTimeout: managerConfig.defaultTimeout || 30000,
      defaultHeadless: managerConfig.defaultHeadless ?? true,
    });

    // Initialize browser pool with enterprise configuration
    this.pool = new BrowserPool({
      maxSize: this.maxBrowsers,
      minSize: 0,
      maxIdleTime: 30 * 60 * 1000, // 30 minutes
      warmupSize: 0,
      allocationStrategy:
        managerConfig.allocationStrategy || config.allocationStrategy || "least-used",
      createInstance: async (config: {
        teamId?: string;
        browserType?: "chromium" | "firefox" | "webkit";
        // Optionally allow per-request overrides threaded via allocation metadata
        headless?: boolean;
        timeout?: number;
        viewport?: { width: number; height: number };
        userAgent?: string;
      }) => {
        const instance = await this.factory.createInstance({
          id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          teamId: config.teamId,
          browserType: config.browserType || "chromium",
          headless: config.headless ?? true,
          timeout: config.timeout ?? 30000,
          viewport: config.viewport ?? { width: 1920, height: 1080 },
          userAgent: config.userAgent,
        });
        return instance;
      },
    });
  }

  async initialize(): Promise<void> {
    logger.info("Initializing browser pool manager", {
      maxBrowsers: this.maxBrowsers,
      allocationStrategy: config.allocationStrategy,
    });

    await this.pool.initialize();

    logger.info("Browser pool manager initialized successfully");
  }

  async cleanup(): Promise<void> {
    logger.info("Cleaning up browser pool", {
      activeSessions: this.sessions.size,
    });

    // Close all active sessions
    const closePromises = Array.from(this.sessions.keys()).map((browserId) =>
      this.closeBrowser({ browserId, force: true }).catch((err) => {
        logger.error("Failed to close session during cleanup", {
          browserId,
          error: err.message,
        });
      }),
    );

    await Promise.allSettled(closePromises);

    // Shutdown the pool
    await this.pool.shutdown();

    logger.info("Browser pool cleanup completed");
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

    logger.info("Launching browser", {
      teamId,
      browserType,
      headless,
      activeSessions: this.sessions.size,
      maxBrowsers: this.maxBrowsers,
    });

    try {
      // Allocate browser from pool, threading launch options where supported
      const allocation = await this.pool.allocate({
        teamId,
        browserType,
        priority: "normal",
        metadata: {
          headless,
          timeout,
          viewport,
          userAgent,
        },
      });

      const browserId = allocation.instance.id;

      // Configure page
      if (userAgent) {
        await allocation.page.setExtraHTTPHeaders({
          "User-Agent": userAgent,
        });
      }

      try {
        await allocation.page.setViewportSize(viewport);
      } catch {
        // If page was closed or invalid, recreate and retry once
        const newPage = await allocation.instance.getMainPage();
        await newPage.setViewportSize(viewport);
        this.sessions.set(browserId, {
          instance: allocation.instance,
          page: newPage,
          teamId,
        });
      }
      const activeSession = this.sessions.get(browserId) ?? {
        instance: allocation.instance,
        page: allocation.page,
        teamId,
      };
      activeSession.page.setDefaultTimeout(timeout);
      activeSession.page.setDefaultNavigationTimeout(timeout);
      // Ensure session map is up to date
      this.sessions.set(allocation.instance.id, activeSession);

      // Store session
      this.sessions.set(browserId, {
        instance: allocation.instance,
        page: allocation.page,
        teamId,
      });

      logger.info("Browser launched successfully", {
        browserId,
        browserType,
        teamId,
        allocationTime: allocation.allocationTime,
        activeSessions: this.sessions.size,
      });

      return {
        browserId,
        browserType,
        headless,
        userAgent: userAgent || (await allocation.page.evaluate(() => navigator.userAgent)),
        viewport,
      };
    } catch (error) {
      logger.error("Failed to launch browser", {
        teamId,
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

    logger.info("Navigating browser", { browserId, url, waitUntil });

    let session = this.sessions.get(browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${browserId}`);
    }
    // Self-heal closed/crashed page
    if (!session.page || session.page.isClosed()) {
      const newPage = await session.instance.getMainPage();
      session = { ...session, page: newPage };
      this.sessions.set(browserId, session);
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }

    const startTime = Date.now();
    session.instance.touch();

    // Retry navigate once on transient failure
    const attempt = async () => {
      // Re-read session to satisfy TS and ensure freshness
      const current = this.sessions.get(browserId);
      if (!current) {
        throw new Error(`Browser session not found: ${browserId}`);
      }
      if (!current.page || current.page.isClosed()) {
        const newPage = await current.instance.getMainPage();
        const healed = { instance: current.instance, page: newPage, teamId: current.teamId };
        this.sessions.set(browserId, healed);
        return await newPage.goto(url, { timeout, waitUntil });
      }
      return await current.page.goto(url, { timeout, waitUntil });
    };

    try {
      const response = await attempt();

      const loadTime = Date.now() - startTime;
      const title = await session.page.title();
      const finalUrl = session.page.url();

      logger.info("Navigation completed", {
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
      logger.error("Navigation failed", {
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
    data?: string;
  }> {
    const {
      browserId,
      fullPage = false,
      quality = 90,
      type = "png",
      clip,
      returnFormat = "file",
      teamId,
      sessionId,
      encryption,
    } = args;

    logger.info("Taking screenshot", {
      browserId,
      fullPage,
      type,
      quality,
      returnFormat,
    });

    let session = this.sessions.get(browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${browserId}`);
    }
    if (!session.page || session.page.isClosed()) {
      const newPage = await session.instance.getMainPage();
      session = { ...session, page: newPage };
      this.sessions.set(browserId, session);
    }

    session.instance.touch();

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

      // Save to file storage
      const storageResult: ScreenshotStorageResult = await this.storageManager.saveScreenshot(
        buffer,
        dimensions,
        {
          sessionId: effectiveSessionId,
          browserId,
          teamId: teamId || session.teamId,
          format: type,
          quality,
          fullPage,
          encryption,
        },
      );

      logger.info("Screenshot saved", {
        browserId,
        filePath: storageResult.filePath,
        fileSize: storageResult.fileSize,
        auditId: storageResult.auditId,
      });

      const response = {
        filePath: storageResult.filePath,
        filename: storageResult.filename,
        format: storageResult.format,
        dimensions,
        fileSize: storageResult.fileSize,
        auditId: storageResult.auditId,
        returnFormat,
      };

      // Backward compatibility for base64_thumbnail
      if (returnFormat === "base64_thumbnail") {
        const thumbnailBuffer = buffer.length > 10000 ? buffer.slice(0, 10000) : buffer;
        return {
          ...response,
          data: thumbnailBuffer.toString("base64"),
        };
      }

      return response;
    } catch (error) {
      logger.error("Screenshot failed", {
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

    logger.info("Closing browser", { browserId, force });

    let session = this.sessions.get(browserId);
    if (!session) {
      // Idempotent close: attempt to clean pool entry if exists, then return success
      try {
        await this.pool.release(browserId).catch(() => undefined);
        await this.pool.remove(browserId, true).catch(() => undefined);
      } catch {
        // ignore
      }
      return { success: true, browserId };
    }
    if (!session.page || session.page.isClosed()) {
      const newPage = await session.instance.getMainPage();
      session = { ...session, page: newPage };
      this.sessions.set(browserId, session);
    }

    try {
      // Release instance back to pool
      await this.pool.release(browserId).catch(async () => {
        // If release fails, force remove
        await this.pool.remove(browserId, true);
      });

      // Remove from sessions
      this.sessions.delete(browserId);

      logger.info("Browser closed successfully", {
        browserId,
        remainingSessions: this.sessions.size,
      });

      return {
        success: true,
        browserId,
      };
    } catch (error) {
      logger.error("Failed to close browser", {
        browserId,
        error: error instanceof Error ? error.message : String(error),
      });

      if (force) {
        // Force remove from pool
        await this.pool.remove(browserId, true).catch(() => undefined);
        this.sessions.delete(browserId);
        return { success: true, browserId };
      }

      // Idempotent behavior: report success even if underlying close raced
      return { success: true, browserId };
    }
  }

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
    const browsers = Array.from(this.sessions.entries()).map(([browserId, session]) => {
      let currentUrl: string | undefined;
      try {
        currentUrl = session.page?.url();
      } catch {
        currentUrl = undefined;
      }
      return {
        browserId,
        browserType: session.instance.browserType,
        headless: true,
        launchedAt: session.instance.createdAt,
        currentUrl,
        teamId: session.teamId,
        isActive: session.instance.isActive,
      };
    });

    return { browsers };
  }

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
      session.instance.touch();
      await session.page.goBack();
      const url = session.page.url();

      logger.info("Browser navigated back", {
        browserId: args.browserId,
        url,
      });

      return {
        browserId: args.browserId,
        status: "navigated_back",
        url,
      };
    } catch (error) {
      logger.error("Go back failed", {
        browserId: args.browserId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

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
    const _poolStatus = this.pool.getStatus();
    const sessions = Array.from(this.sessions.entries()).map(([id, session]) => ({
      id,
      teamId: session.teamId,
      createdAt: session.instance.createdAt,
      lastUsed: session.instance.lastUsed,
      isActive: session.instance.isActive,
    }));

    return {
      activeSessions: this.sessions.size,
      maxBrowsers: this.maxBrowsers,
      sessions,
    };
  }

  // Element interaction methods
  async clickElement(args: ClickElementArgs): Promise<{
    success: boolean;
    message: string;
    selector: string;
  }> {
    const { browserId, selector, waitForClickable = true, timeout = 5000 } = args;

    logger.info("Clicking element", { browserId, selector });

    let session = this.sessions.get(browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${browserId}`);
    }
    if (!session.page || session.page.isClosed()) {
      const newPage = await session.instance.getMainPage();
      session = { ...session, page: newPage };
      this.sessions.set(browserId, session);
    }

    session.instance.touch();

    try {
      if (waitForClickable) {
        await session.page.waitForSelector(selector, {
          state: "visible",
          timeout,
        });
      }

      await session.page.click(selector);

      logger.info("Element clicked successfully", { browserId, selector });
      return {
        success: true,
        message: "Element clicked successfully",
        selector,
      };
    } catch (error) {
      logger.error("Failed to click element", {
        browserId,
        selector,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to click element: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async fillText(args: FillTextArgs): Promise<{
    success: boolean;
    message: string;
    selector: string;
    textLength: number;
  }> {
    const { browserId, selector, text, clearFirst = true, timeout = 5000 } = args;

    logger.info("Filling text", {
      browserId,
      selector,
      textLength: text.length,
      clearFirst,
    });

    let session = this.sessions.get(browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${browserId}`);
    }
    if (!session.page || session.page.isClosed()) {
      const newPage = await session.instance.getMainPage();
      session = { ...session, page: newPage };
      this.sessions.set(browserId, session);
    }

    session.instance.touch();

    try {
      await session.page.waitForSelector(selector, { timeout });

      if (clearFirst) {
        await session.page.fill(selector, text);
      } else {
        await session.page.type(selector, text);
      }

      logger.info("Text filled successfully", {
        browserId,
        selector,
        textLength: text.length,
      });
      return {
        success: true,
        message: "Text filled successfully",
        selector,
        textLength: text.length,
      };
    } catch (error) {
      logger.error("Failed to fill text", {
        browserId,
        selector,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to fill text: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async fillForm(args: FillFormArgs): Promise<{
    success: boolean;
    message: string;
    fieldsProcessed: number;
    results: Array<{ selector: string; success: boolean; textLength?: number; error?: string }>;
  }> {
    const { browserId, fieldMapping, timeout = 5000 } = args;
    const fields = Object.entries(fieldMapping);

    logger.info("Filling form", { browserId, fieldsCount: fields.length });

    let session = this.sessions.get(browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${browserId}`);
    }
    if (!session.page || session.page.isClosed()) {
      const newPage = await session.instance.getMainPage();
      session = { ...session, page: newPage };
      this.sessions.set(browserId, session);
    }

    session.instance.touch();

    const results: Array<{
      selector: string;
      success: boolean;
      textLength?: number;
      error?: string;
    }> = [];
    let successCount = 0;

    for (const [selector, text] of fields) {
      try {
        await this.fillText({ browserId, selector, text, timeout });
        results.push({ selector, success: true, textLength: text.length });
        successCount++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({ selector, success: false, error: errorMessage });
        logger.warn("Failed to fill form field", {
          browserId,
          selector,
          error: errorMessage,
        });
      }
    }

    const allSuccess = successCount === fields.length;
    logger.info("Form filling completed", {
      browserId,
      fieldsProcessed: fields.length,
      successCount,
      allSuccess,
    });

    if (!allSuccess) {
      throw new Error("Some form fields could not be filled");
    }

    return {
      success: true,
      message: "Form filled successfully",
      fieldsProcessed: fields.length,
      results,
    };
  }

  async waitForElement(args: WaitForElementArgs): Promise<{
    success: boolean;
    message: string;
    selector: string;
    state: string;
    waitTime: number;
  }> {
    const { browserId, selector, state = "visible", timeout = 30000 } = args;
    const startTime = Date.now();

    logger.info("Waiting for element", { browserId, selector, state, timeout });

    const session = this.sessions.get(browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${browserId}`);
    }

    session.instance.touch();

    try {
      await session.page.waitForSelector(selector, { state, timeout });
      const waitTime = Date.now() - startTime;

      logger.info("Element found", { browserId, selector, state, waitTime });
      return {
        success: true,
        message: "Element found",
        selector,
        state,
        waitTime,
      };
    } catch (error) {
      const waitTime = Date.now() - startTime;
      logger.error("Element wait timeout", {
        browserId,
        selector,
        state,
        waitTime,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Element did not reach expected state within timeout: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getTextContent(args: GetTextContentArgs): Promise<{
    success: boolean;
    textContent: string;
    selector: string;
  }> {
    const { browserId, selector, timeout = 5000 } = args;

    logger.info("Getting text content", { browserId, selector });

    const session = this.sessions.get(browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${browserId}`);
    }

    session.instance.touch();

    try {
      await session.page.waitForSelector(selector, { timeout });
      const textContent = await session.page.textContent(selector);

      logger.info("Text content retrieved", {
        browserId,
        selector,
        textLength: textContent?.length || 0,
      });
      return {
        success: true,
        textContent: textContent || "",
        selector,
      };
    } catch (error) {
      logger.error("Failed to get text content", {
        browserId,
        selector,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to get text content: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async validateElementPresence(args: ValidateElementPresenceArgs): Promise<{
    success: boolean;
    elementExists: boolean;
    message: string;
    selector: string;
  }> {
    const { browserId, selector, shouldExist = true, timeout = 5000 } = args;

    logger.info("Validating element presence", { browserId, selector, shouldExist });

    const session = this.sessions.get(browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${browserId}`);
    }

    session.instance.touch();

    try {
      const elementExists = await session.page
        .waitForSelector(selector, { timeout, state: "attached" })
        .then(() => true)
        .catch(() => false);

      const validationPassed = elementExists === shouldExist;

      if (validationPassed) {
        logger.info("Element validation passed", {
          browserId,
          selector,
          elementExists,
          shouldExist,
        });
        return {
          success: true,
          elementExists,
          message: "Element validation passed",
          selector,
        };
      }

      const message = shouldExist
        ? `Element should exist but was not found: ${selector}`
        : `Element should not exist but was found: ${selector}`;
      throw new Error(message);
    } catch (error) {
      logger.error("Element validation failed", {
        browserId,
        selector,
        shouldExist,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async findElements(args: FindElementsArgs): Promise<{
    success: boolean;
    elements: Array<{ selector: string; text: string }>;
    count: number;
  }> {
    const { browserId, selector, timeout = 5000 } = args;

    logger.info("Finding elements", { browserId, selector });

    const session = this.sessions.get(browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${browserId}`);
    }

    session.instance.touch();

    try {
      // Wait a short time for elements to potentially appear
      await session.page.waitForTimeout(Math.min(timeout, 1000));

      const elements = await session.page.$$(selector);
      const elementData = await Promise.all(
        elements.map(async (element, index) => {
          const text = await element.textContent();
          return {
            selector: `${selector}:nth-child(${index + 1})`,
            text: text || "",
          };
        }),
      );

      logger.info("Elements found", { browserId, selector, count: elements.length });
      return {
        success: true,
        elements: elementData,
        count: elements.length,
      };
    } catch (error) {
      logger.error("Failed to find elements", {
        browserId,
        selector,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to find elements: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
