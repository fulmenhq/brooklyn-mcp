/**
 * Browser Pool Manager for Brooklyn MCP Server
 * Enterprise-ready browser automation with team isolation and resource management
 */

import { existsSync } from "node:fs";
import { basename } from "node:path";
import type { Page } from "playwright";
import { config } from "../shared/config.js";
import { getLogger } from "../shared/pino-logger.js";
import { BrowserFactory } from "./browser/browser-factory.js";
import type { BrowserInstance } from "./browser/browser-instance.js";
import { BrowserPool } from "./browser/browser-pool.js";
import {
  ContentExtractionService,
  type DescribeHtmlArgs,
  type DescribeHtmlResult,
  type ExtractTableDataArgs,
  type ExtractTableDataResult,
  type GetAttributeArgs,
  type GetAttributeResult,
  type GetBoundingBoxArgs,
  type GetBoundingBoxResult,
  type GetHtmlArgs,
  type GetHtmlResult,
  type IsEnabledArgs,
  type IsEnabledResult,
  type IsVisibleArgs,
  type IsVisibleResult,
} from "./content/content-extraction-service.js";
import {
  type AddScriptTagArgs,
  type AddScriptTagResult,
  type EvaluateExpressionArgs,
  type EvaluateExpressionResult,
  type ExecuteScriptArgs,
  type ExecuteScriptResult,
  type GetConsoleMessagesArgs,
  type GetConsoleMessagesResult,
  JavaScriptExecutionService,
} from "./javascript/javascript-execution-service.js";
import {
  ScreenshotStorageManager,
  type ScreenshotStorageResult,
} from "./screenshot-storage-manager.js";
import {
  type GenerateSelectorArgs,
  type GenerateSelectorResult,
  SmartSelectorService,
} from "./selector/smart-selector-service.js";
import {
  type AnalyzeSpecificityArgs,
  type AnalyzeSpecificityResult,
  CSSAnalysisService,
  type DiffCSSArgs,
  type DiffCSSResult,
  type ExtractCSSArgs,
  type ExtractCSSResult,
  type GetComputedStylesArgs,
  type GetComputedStylesResult,
} from "./styling/css-analysis-service.js";
import { LocalHttpServer } from "./utilities/local-http-server.js";

const logger = getLogger("browser-pool-manager");

// Browser launch arguments interface
interface LaunchBrowserArgs {
  teamId?: string;
  browserType?: "chromium" | "firefox" | "webkit";
  headless?: boolean;
  userAgent?: string;
  viewport?: { width: number; height: number };
  timeout?: number;
  extraHttpHeaders?: Record<string, string>;
}

// Navigation arguments interface
interface NavigateArgs {
  browserId: string;
  url: string;
  timeout?: number;
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
  // Optional: allow force semantics for idempotent flows using same args bag
  force?: boolean;
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

// inspect_network arguments and result
export interface InspectNetworkArgs {
  browserId: string;
  filter?: { urlPattern?: string; method?: string };
  redact?: string[];
  includeRaw?: boolean;
}

export interface InspectNetworkResult {
  success: boolean;
  requests: {
    url: string;
    method: string;
    requestHeaders: Record<string, string>;
    status: number | null;
    responseHeaders: Record<string, string>;
    timestamp: string;
  }[];
  count: number;
  redacted: boolean;
}

// paginate_table arguments and result
export interface PaginateTableArgs {
  browserId: string;
  tableSelector: string;
  nextButton: string;
  maxPages?: number;
}

export interface PaginateTableResult {
  success: boolean;
  allData: Record<string, string>[];
  headers: string[];
  pages: number;
  totalRows: number;
  maxPagesReached?: boolean;
}

const DEFAULT_REDACT_HEADERS = [
  "Authorization",
  "Cookie",
  "Set-Cookie",
  "Proxy-Authorization",
  "X-API-Key",
  "X-Auth-Token",
];

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

interface HoverElementArgs {
  browserId: string;
  selector: string;
  timeout?: number;
  force?: boolean;
  position?: { x: number; y: number };
  index?: number;
}

interface SelectOptionArgs {
  browserId: string;
  selector: string;
  value?: string;
  label?: string;
  index?: number;
  timeout?: number;
}

interface ClearElementArgs {
  browserId: string;
  selector: string;
  timeout?: number;
  force?: boolean;
}

interface DragAndDropArgs {
  browserId: string;
  sourceSelector: string;
  targetSelector: string;
  sourcePosition?: { x: number; y: number };
  targetPosition?: { x: number; y: number };
  timeout?: number;
  force?: boolean;
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
  private jsExecutor: JavaScriptExecutionService;
  private cssAnalyzer: CSSAnalysisService;
  private selectorGenerator: SmartSelectorService;
  private contentExtractor: ContentExtractionService;

  constructor(managerConfig: BrowserPoolManagerConfig = {}) {
    this.maxBrowsers = managerConfig.maxBrowsers || config.maxBrowsers || 10;
    this.storageManager = new ScreenshotStorageManager();
    this.jsExecutor = new JavaScriptExecutionService();
    this.cssAnalyzer = new CSSAnalysisService();
    this.selectorGenerator = new SmartSelectorService();
    this.contentExtractor = new ContentExtractionService();

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
        extraHttpHeaders?: Record<string, string>;
      }) => {
        const instance = await this.factory.createInstance({
          id: `browser-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          teamId: config.teamId,
          browserType: config.browserType || "chromium",
          headless: config.headless ?? true,
          timeout: config.timeout ?? 30000,
          viewport: config.viewport ?? { width: 1920, height: 1080 },
          userAgent: config.userAgent,
          extraHttpHeaders: config.extraHttpHeaders,
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

    // Stop all HTTP servers
    await LocalHttpServer.stopAll();

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
      extraHttpHeaders: paramHeaders,
    } = args;

    // Resolve headers: MCP param takes priority, then env var fallback
    const { resolveExtraHttpHeaders, redactHeaders } = await import("./config.js");
    const resolvedHeaders = resolveExtraHttpHeaders(paramHeaders);

    logger.info("Launching browser", {
      teamId,
      browserType,
      headless,
      activeSessions: this.sessions.size,
      maxBrowsers: this.maxBrowsers,
      hasExtraHeaders: !!resolvedHeaders,
      extraHeaderKeys: resolvedHeaders ? Object.keys(resolvedHeaders) : undefined,
      extraHeaders: resolvedHeaders ? redactHeaders(resolvedHeaders) : undefined,
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
          extraHttpHeaders: resolvedHeaders,
        },
      });

      const browserId = allocation.instance.id;

      // Configure page
      let page = allocation.page;
      try {
        if (userAgent) {
          await page.setExtraHTTPHeaders({
            "User-Agent": userAgent,
          });
        }
      } catch {
        // recover if page is closed
        page = await allocation.instance.getMainPage();
        if (userAgent) {
          await page.setExtraHTTPHeaders({
            "User-Agent": userAgent,
          });
        }
      }

      try {
        await page.setViewportSize(viewport);
      } catch {
        // If page was closed or invalid, recreate and retry once
        const newPage = await allocation.instance.getMainPage();
        await newPage.setViewportSize(viewport);
        page = newPage;
      }

      // Ensure session is registered before returning so router can navigate immediately
      const sessionRecord = {
        instance: allocation.instance,
        page,
        teamId,
      };
      // set default timeouts on the active page
      page.setDefaultTimeout(timeout);
      page.setDefaultNavigationTimeout(timeout);

      // Store session keyed by browserId
      this.sessions.set(browserId, sessionRecord);

      // Initialize page services for JavaScript and CSS analysis
      this.initializePageServices(page, browserId);

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
        userAgent: userAgent || (await page.evaluate(() => navigator.userAgent)),
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
    const {
      browserId,
      url,
      timeout = 30000,
      waitUntil = "domcontentloaded",
      force,
    } = args as NavigateArgs & { force?: boolean };

    logger.info("Navigating browser", { browserId, url, waitUntil });

    let session = this.sessions.get(browserId);
    if (!session) {
      // If session is missing and caller indicates idempotent/force semantics,
      // treat as no-op for navigation (cannot navigate a missing session).
      if (force) {
        throw new Error(`Browser session not found: ${browserId}`);
      }
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
      // Idempotent: if force=true or during teardown races, treat as already closed
      if (force) {
        this.sessions.delete(browserId);
        await this.pool.remove(browserId, true).catch(() => undefined);
        return { success: true, browserId };
      }
      throw new Error(`Browser session not found: ${browserId}`);
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

  // ========== JavaScript Execution Methods (UX Speed Tools) ==========

  /**
   * Execute JavaScript in browser context - enables instant UX modifications
   * Critical for achieving <10 second time to first design change
   */
  async executeScript(args: ExecuteScriptArgs): Promise<ExecuteScriptResult> {
    const session = this.sessions.get(args.browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${args.browserId}`);
    }

    session.instance.touch();
    return await this.jsExecutor.executeScript(session.page, args);
  }

  /**
   * Evaluate JavaScript expression and return value
   * Perfect for getting computed values from the page
   */
  async evaluateExpression(args: EvaluateExpressionArgs): Promise<EvaluateExpressionResult> {
    const session = this.sessions.get(args.browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${args.browserId}`);
    }

    session.instance.touch();
    return await this.jsExecutor.evaluateExpression(session.page, args);
  }

  /**
   * Get console messages for debugging
   * Essential for understanding JavaScript execution results
   */
  async getConsoleMessages(args: GetConsoleMessagesArgs): Promise<GetConsoleMessagesResult> {
    const session = this.sessions.get(args.browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${args.browserId}`);
    }

    session.instance.touch();
    return await this.jsExecutor.getConsoleMessages(args);
  }

  /**
   * Add script tag to inject utilities or libraries
   */
  async addScriptTag(args: AddScriptTagArgs): Promise<AddScriptTagResult> {
    const session = this.sessions.get(args.browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${args.browserId}`);
    }

    session.instance.touch();
    return await this.jsExecutor.addScriptTag(session.page, args);
  }

  // ========== CSS Analysis Methods (UX Understanding Tools) ==========

  /**
   * Extract CSS styles for an element - understand current state in <1 second
   * Core tool for rapid UX iteration
   */
  async extractCSS(args: ExtractCSSArgs): Promise<ExtractCSSResult> {
    const session = this.sessions.get(args.browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${args.browserId}`);
    }

    session.instance.touch();
    return await this.cssAnalyzer.extractCSS(session.page, args);
  }

  /**
   * Get computed styles with inheritance information
   * Shows what's inherited vs directly applied
   */
  async getComputedStyles(args: GetComputedStylesArgs): Promise<GetComputedStylesResult> {
    const session = this.sessions.get(args.browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${args.browserId}`);
    }

    session.instance.touch();
    return await this.cssAnalyzer.getComputedStyles(session.page, args);
  }

  /**
   * Diff CSS to track changes after modifications
   * Essential for validating UX changes
   */
  async diffCSS(args: DiffCSSArgs): Promise<DiffCSSResult> {
    const session = this.sessions.get(args.browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${args.browserId}`);
    }

    session.instance.touch();
    return await this.cssAnalyzer.diffCSS(session.page, args);
  }

  /**
   * Analyze CSS specificity to debug cascade issues
   * Helps understand why styles aren't applying
   */
  async analyzeSpecificity(args: AnalyzeSpecificityArgs): Promise<AnalyzeSpecificityResult> {
    const session = this.sessions.get(args.browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${args.browserId}`);
    }

    session.instance.touch();
    return await this.cssAnalyzer.analyzeSpecificity(session.page, args);
  }

  /**
   * Focus an element on the page
   * Essential for accessibility and keyboard navigation workflows
   */
  async focusElement(args: { browserId: string; selector: string; timeout?: number }): Promise<{
    success: boolean;
    selector: string;
    focused: boolean;
  }> {
    const { browserId, selector, timeout = 5000 } = args;

    logger.info("Focusing element", { browserId, selector });

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
      await session.page.locator(selector).focus({ timeout });

      // Verify the element is focused
      const focused = await session.page.evaluate((sel) => {
        const element = document.querySelector(sel);
        return element === document.activeElement;
      }, selector);

      return {
        success: true,
        selector,
        focused,
      };
    } catch (error) {
      logger.error("Failed to focus element", {
        browserId,
        selector,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to focus element: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Hover over an element to trigger hover states and CSS transitions
   * Essential for testing interactive UI elements and dropdown menus
   */
  async hoverElement(args: HoverElementArgs): Promise<{
    success: boolean;
    selector: string;
    boundingBox?: { x: number; y: number; width: number; height: number };
    position?: { x: number; y: number };
  }> {
    const { browserId, selector, timeout = 5000, force = false, position, index = 0 } = args;

    logger.info("Hovering over element", { browserId, selector, position });

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
      // Use nth to select specific element when multiple matches
      const locator = session.page.locator(selector).nth(index);

      // Get bounding box for response
      const boundingBox = await locator.boundingBox({ timeout });

      if (position) {
        // Hover at specific position relative to element
        await locator.hover({
          position,
          timeout,
          force,
        });
      } else {
        // Hover at center of element
        await locator.hover({
          timeout,
          force,
        });
      }

      const result = {
        success: true,
        selector,
        boundingBox: boundingBox || undefined,
        position: position || undefined,
      };

      logger.info("Element hovered successfully", {
        browserId,
        selector,
        boundingBox,
        position,
      });

      return result;
    } catch (error) {
      logger.error("Failed to hover over element", {
        browserId,
        selector,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to hover over element: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Select an option from a dropdown or select element
   * Supports selection by value, label text, or index
   */
  async selectOption(args: SelectOptionArgs): Promise<{
    success: boolean;
    selector: string;
    selectedValue?: string;
    selectedLabel?: string;
    selectedIndex?: number;
  }> {
    const { browserId, selector, value, label, index, timeout = 5000 } = args;

    logger.info("Selecting option", { browserId, selector, value, label, index });

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

    // Validation: At least one selection criteria must be provided
    if (value === undefined && label === undefined && index === undefined) {
      throw new Error("select_option requires at least one of: value, label, or index");
    }

    try {
      const selectElement = session.page.locator(selector);

      // Verify it's a select element
      await selectElement.waitFor({ timeout });

      let selectedValue: string | undefined;
      let selectedLabel: string | undefined;
      let selectedIndex: number | undefined;

      if (value !== undefined) {
        // Select by value
        await selectElement.selectOption({ value }, { timeout });
        selectedValue = value;

        // Get the selected option's label
        selectedLabel = await selectElement.evaluate((select: HTMLSelectElement, val: string) => {
          const option = select.querySelector(`option[value="${val}"]`) as HTMLOptionElement;
          return option?.textContent?.trim() || "";
        }, value);

        selectedIndex = await selectElement.evaluate((select: HTMLSelectElement, val: string) => {
          const option = select.querySelector(`option[value="${val}"]`) as HTMLOptionElement;
          return option ? option.index : -1;
        }, value);
      } else if (label !== undefined) {
        // Select by label text
        await selectElement.selectOption({ label }, { timeout });

        // Get the selected option's value and index
        const optionData = await selectElement.evaluate(
          (select: HTMLSelectElement, labelText: string) => {
            const options = Array.from(select.options);
            const option = options.find((opt) => opt.textContent?.trim() === labelText);
            return option
              ? {
                  value: option.value,
                  index: option.index,
                }
              : null;
          },
          label,
        );

        if (optionData) {
          selectedValue = optionData.value;
          selectedIndex = optionData.index;
          selectedLabel = label;
        }
      } else if (index !== undefined) {
        // Select by index
        await selectElement.selectOption({ index }, { timeout });
        selectedIndex = index;

        // Get the selected option's value and label
        const optionData = await selectElement.evaluate(
          (select: HTMLSelectElement, idx: number) => {
            const option = select.options[idx];
            return option
              ? {
                  value: option.value,
                  label: option.textContent?.trim() || "",
                }
              : null;
          },
          index,
        );

        if (optionData) {
          selectedValue = optionData.value;
          selectedLabel = optionData.label;
        }
      }

      const result = {
        success: true,
        selector,
        selectedValue,
        selectedLabel,
        selectedIndex,
      };

      logger.info("Option selected successfully", {
        browserId,
        selector,
        selectedValue,
        selectedLabel,
        selectedIndex,
      });

      return result;
    } catch (error) {
      logger.error("Failed to select option", {
        browserId,
        selector,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to select option: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Clear the content of an input field, textarea, or editable element
   * Essential for form automation and input field management
   */
  async clearElement(args: ClearElementArgs): Promise<{
    success: boolean;
    selector: string;
    cleared: boolean;
    previousValue?: string;
  }> {
    const { browserId, selector, timeout = 5000, force = false } = args;

    logger.info("Clearing element", { browserId, selector, force });

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
      const element = session.page.locator(selector);

      // Wait for element to be available
      await element.waitFor({ timeout });

      // Get the current value before clearing
      const previousValue = await element.evaluate((el: HTMLElement) => {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          return el.value;
        }
        if (el.contentEditable === "true") {
          return el.textContent || el.innerText || "";
        }
        return "";
      });

      // Check if element is clearable
      const isClearable = await element.evaluate((el: HTMLElement) => {
        return (
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          el.contentEditable === "true"
        );
      });

      if (!(isClearable || force)) {
        throw new Error("Element is not clearable (not input, textarea, or contenteditable)");
      }

      // Clear the element using different strategies based on type
      await element.evaluate((el: HTMLElement) => {
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          // For input and textarea elements
          el.value = "";
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        } else if (el.contentEditable === "true") {
          // For contenteditable elements
          el.textContent = "";
          el.dispatchEvent(new Event("input", { bubbles: true }));
        } else {
          // Fallback: try to clear any text content
          if ("value" in el) {
            (el as HTMLInputElement).value = "";
          } else {
            el.textContent = "";
          }
        }
      });

      const result = {
        success: true,
        selector,
        cleared: true,
        previousValue: previousValue || undefined,
      };

      logger.info("Element cleared successfully", {
        browserId,
        selector,
        previousValueLength: previousValue?.length || 0,
      });

      return result;
    } catch (error) {
      logger.error("Failed to clear element", {
        browserId,
        selector,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to clear element: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Drag an element from a source location to a target location
   * Essential for testing drag-and-drop interactions and UI reordering
   */
  async dragAndDrop(args: DragAndDropArgs): Promise<{
    success: boolean;
    sourceSelector: string;
    targetSelector: string;
    dragCompleted: boolean;
  }> {
    const {
      browserId,
      sourceSelector,
      targetSelector,
      sourcePosition,
      targetPosition,
      timeout = 5000,
      force = false,
    } = args;

    logger.info("Performing drag and drop", {
      browserId,
      sourceSelector,
      targetSelector,
      sourcePosition,
      targetPosition,
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
      const sourceElement = session.page.locator(sourceSelector);
      const targetElement = session.page.locator(targetSelector);

      // Wait for both elements to be available
      await sourceElement.waitFor({ timeout });
      await targetElement.waitFor({ timeout });

      // Get bounding boxes for positioning
      const sourceBoundingBox = await sourceElement.boundingBox({ timeout });
      const targetBoundingBox = await targetElement.boundingBox({ timeout });

      if (!(sourceBoundingBox && targetBoundingBox)) {
        throw new Error("Could not get bounding boxes for source or target elements");
      }

      // Calculate source position
      const sourceX = sourcePosition
        ? sourceBoundingBox.x + sourcePosition.x
        : sourceBoundingBox.x + sourceBoundingBox.width / 2;
      const sourceY = sourcePosition
        ? sourceBoundingBox.y + sourcePosition.y
        : sourceBoundingBox.y + sourceBoundingBox.height / 2;

      // Calculate target position
      const targetX = targetPosition
        ? targetBoundingBox.x + targetPosition.x
        : targetBoundingBox.x + targetBoundingBox.width / 2;
      const targetY = targetPosition
        ? targetBoundingBox.y + targetPosition.y
        : targetBoundingBox.y + targetBoundingBox.height / 2;

      // Perform the drag and drop operation
      await session.page.mouse.move(sourceX, sourceY);
      await session.page.mouse.down();

      // Small delay to ensure drag is initiated
      await session.page.waitForTimeout(100);

      await session.page.mouse.move(targetX, targetY, { steps: 10 });
      await session.page.mouse.up();

      // Alternative approach using Playwright's dragTo if the above doesn't work
      // This is more reliable for some drag-and-drop implementations
      try {
        if (sourcePosition || targetPosition) {
          // Use manual positioning for precise control
          await sourceElement.hover({
            position: sourcePosition,
            timeout,
            force,
          });
          await session.page.mouse.down();
          await targetElement.hover({
            position: targetPosition,
            timeout,
            force,
          });
          await session.page.mouse.up();
        } else {
          // Use Playwright's built-in dragTo for standard scenarios
          await sourceElement.dragTo(targetElement, {
            timeout,
            force,
          });
        }
      } catch (dragError) {
        // If both methods fail, we still want to report the result
        logger.warn("Alternative drag method also failed", {
          error: dragError instanceof Error ? dragError.message : String(dragError),
        });
      }

      const result = {
        success: true,
        sourceSelector,
        targetSelector,
        dragCompleted: true,
      };

      logger.info("Drag and drop completed successfully", {
        browserId,
        sourceSelector,
        targetSelector,
        sourcePosition,
        targetPosition,
      });

      return result;
    } catch (error) {
      logger.error("Failed to perform drag and drop", {
        browserId,
        sourceSelector,
        targetSelector,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to perform drag and drop: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ========================================================================
  // Navigation wait helpers
  // ========================================================================

  async waitForUrl(args: {
    browserId: string;
    exact?: string;
    pattern?: string;
    timeout?: number;
  }): Promise<{ success: boolean; url: string; matched: "exact" | "pattern" }> {
    const { browserId, exact, pattern, timeout = 30000 } = args;

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

    if (!!exact === !!pattern) {
      throw new Error("wait_for_url requires exactly one of 'exact' or 'pattern'");
    }

    try {
      if (exact) {
        await session.page.waitForURL(exact, { timeout });
        return { success: true, url: session.page.url(), matched: "exact" };
      }

      // Treat pattern as regex string for flexibility
      const regex = new RegExp(pattern as string);
      await session.page.waitForURL(regex, { timeout });
      return { success: true, url: session.page.url(), matched: "pattern" };
    } catch (error) {
      logger.error("wait_for_url failed", {
        browserId,
        exact,
        pattern,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `wait_for_url failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async waitForNavigation(args: {
    browserId: string;
    waitUntil?: "load" | "domcontentloaded" | "networkidle";
    timeout?: number;
  }): Promise<{ success: boolean; url: string; state: string }> {
    const { browserId, waitUntil = "load", timeout = 30000 } = args;
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
      await session.page.waitForNavigation({ waitUntil, timeout });
      return { success: true, url: session.page.url(), state: waitUntil };
    } catch (error) {
      logger.error("wait_for_navigation failed", {
        browserId,
        waitUntil,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `wait_for_navigation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async waitForNetworkIdle(args: {
    browserId: string;
    timeout?: number;
  }): Promise<{ success: boolean; state: string }> {
    const { browserId, timeout = 30000 } = args;
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
      await session.page.waitForLoadState("networkidle", { timeout });
      return { success: true, state: "networkidle" };
    } catch (error) {
      logger.error("wait_for_network_idle failed", {
        browserId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `wait_for_network_idle failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ========================================================================
  // Scrolling helpers
  // ========================================================================

  async scrollIntoView(args: {
    browserId: string;
    selector: string;
    timeout?: number;
  }): Promise<{ success: boolean; selector: string }> {
    const { browserId, selector, timeout = 5000 } = args;
    let session = this.sessions.get(browserId);
    if (!session) throw new Error(`Browser session not found: ${browserId}`);
    if (!session.page || session.page.isClosed()) {
      const newPage = await session.instance.getMainPage();
      session = { ...session, page: newPage };
      this.sessions.set(browserId, session);
    }
    session.instance.touch();
    try {
      const locator = session.page.locator(selector);
      await locator.scrollIntoViewIfNeeded({ timeout });
      return { success: true, selector };
    } catch (error) {
      logger.error("scroll_into_view failed", { browserId, selector, error: String(error) });
      throw new Error(
        `scroll_into_view failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async scrollTo(args: {
    browserId: string;
    x: number;
    y: number;
    behavior?: "auto" | "smooth";
  }): Promise<{ success: boolean; x: number; y: number }> {
    const { browserId, x, y, behavior = "auto" } = args;
    let session = this.sessions.get(browserId);
    if (!session) throw new Error(`Browser session not found: ${browserId}`);
    if (!session.page || session.page.isClosed()) {
      const newPage = await session.instance.getMainPage();
      session = { ...session, page: newPage };
      this.sessions.set(browserId, session);
    }
    session.instance.touch();
    try {
      await session.page.evaluate(
        ({ x, y, behavior }) => {
          window.scrollTo({ left: x, top: y, behavior });
        },
        { x, y, behavior },
      );
      return { success: true, x, y };
    } catch (error) {
      logger.error("scroll_to failed", { browserId, x, y, error: String(error) });
      throw new Error(
        `scroll_to failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async scrollBy(args: {
    browserId: string;
    dx: number;
    dy: number;
    behavior?: "auto" | "smooth";
  }): Promise<{ success: boolean; dx: number; dy: number }> {
    const { browserId, dx, dy, behavior = "auto" } = args;
    let session = this.sessions.get(browserId);
    if (!session) throw new Error(`Browser session not found: ${browserId}`);
    if (!session.page || session.page.isClosed()) {
      const newPage = await session.instance.getMainPage();
      session = { ...session, page: newPage };
      this.sessions.set(browserId, session);
    }
    session.instance.touch();
    try {
      await session.page.evaluate(
        ({ dx, dy, behavior }) => {
          window.scrollBy({ left: dx, top: dy, behavior });
        },
        { dx, dy, behavior },
      );
      return { success: true, dx, dy };
    } catch (error) {
      logger.error("scroll_by failed", { browserId, dx, dy, error: String(error) });
      throw new Error(
        `scroll_by failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ========================================================================
  // Visual overlays
  // ========================================================================

  async highlightElementBounds(args: {
    browserId: string;
    selector: string;
    options?: { color?: string; outline?: string; showMargin?: boolean; showPadding?: boolean };
    timeout?: number;
  }): Promise<{
    success: boolean;
    highlightId: string;
    bounds: { x: number; y: number; width: number; height: number };
  }> {
    const { browserId, selector, options = {}, timeout = 5000 } = args;
    let session = this.sessions.get(browserId);
    if (!session) throw new Error(`Browser session not found: ${browserId}`);
    if (!session.page || session.page.isClosed()) {
      const newPage = await session.instance.getMainPage();
      session = { ...session, page: newPage };
      this.sessions.set(browserId, session);
    }
    session.instance.touch();

    try {
      await session.page.waitForSelector(selector, { timeout });
      const result = await session.page.evaluate(
        (payload) => {
          const { selector, options } = payload as {
            selector: string;
            options: {
              color?: string;
              outline?: string;
              showMargin?: boolean;
              showPadding?: boolean;
            };
          };
          const el = document.querySelector(selector) as HTMLElement | null;
          if (!el) throw new Error(`Element not found: ${selector}`);
          const rect = el.getBoundingClientRect();
          const overlay = document.createElement("div");
          const id = `brooklyn-overlay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          overlay.id = id;
          overlay.style.position = "absolute";
          overlay.style.left = `${rect.left + window.scrollX}px`;
          overlay.style.top = `${rect.top + window.scrollY}px`;
          overlay.style.width = `${rect.width}px`;
          overlay.style.height = `${rect.height}px`;
          overlay.style.pointerEvents = "none";
          overlay.style.zIndex = "2147483647";
          overlay.style.background = options.color || "rgba(255,0,0,0.35)";
          overlay.style.outline = options.outline || "2px solid rgba(255,0,0,0.9)";
          document.body.appendChild(overlay);
          return {
            highlightId: id,
            bounds: {
              x: Math.round(rect.left + window.scrollX),
              y: Math.round(rect.top + window.scrollY),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
          };
        },
        { selector, options },
      );

      logger.info("Element bounds highlighted", {
        browserId,
        selector,
        highlightId: result.highlightId,
      });

      return { success: true, highlightId: result.highlightId, bounds: result.bounds };
    } catch (error) {
      logger.error("highlight_element_bounds failed", {
        browserId,
        selector,
        error: String(error),
      });
      throw new Error(
        `highlight_element_bounds failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async showLayoutGrid(args: {
    browserId: string;
    gridSize?: number;
    color?: string;
  }): Promise<{ success: boolean; overlayId: string; gridSize: number }> {
    const { browserId, gridSize = 20, color = "rgba(255,0,0,0.3)" } = args;
    let session = this.sessions.get(browserId);
    if (!session) throw new Error(`Browser session not found: ${browserId}`);
    if (!session.page || session.page.isClosed()) {
      const newPage = await session.instance.getMainPage();
      session = { ...session, page: newPage };
      this.sessions.set(browserId, session);
    }
    session.instance.touch();

    try {
      const overlayId = await session.page.evaluate(
        (payload) => {
          const { gridSize, color } = payload as { gridSize: number; color: string };
          const overlay = document.createElement("div");
          const id = `brooklyn-grid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          overlay.id = id;
          overlay.style.position = "fixed";
          overlay.style.left = "0";
          overlay.style.top = "0";
          overlay.style.width = "100%";
          overlay.style.height = "100%";
          overlay.style.pointerEvents = "none";
          overlay.style.zIndex = "2147483646";
          overlay.style.backgroundImage = `linear-gradient(${color} 1px, transparent 1px), linear-gradient(90deg, ${color} 1px, transparent 1px)`;
          overlay.style.backgroundSize = `${gridSize}px ${gridSize}px, ${gridSize}px ${gridSize}px`;
          document.body.appendChild(overlay);
          return id;
        },
        { gridSize, color },
      );

      logger.info("Layout grid overlay shown", { browserId, overlayId, gridSize });
      return { success: true, overlayId, gridSize };
    } catch (error) {
      logger.error("show_layout_grid failed", { browserId, error: String(error) });
      throw new Error(
        `show_layout_grid failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ========================================================================
  // CSS simulation & diagnostics
  // ========================================================================

  async simulateCssChange(args: {
    browserId: string;
    selector: string;
    cssRules: Record<string, string>;
    important?: boolean;
  }): Promise<{
    success: boolean;
    overallChanged: boolean;
    changes: Array<{
      property: string;
      before: string;
      after: string;
      changed: boolean;
      needsImportant?: boolean;
    }>;
  }> {
    const { browserId, selector, cssRules, important = false } = args;
    let session = this.sessions.get(browserId);
    if (!session) throw new Error(`Browser session not found: ${browserId}`);
    if (!session.page || session.page.isClosed()) {
      const newPage = await session.instance.getMainPage();
      session = { ...session, page: newPage };
      this.sessions.set(browserId, session);
    }
    session.instance.touch();

    try {
      const result = await session.page.evaluate(
        (payload) => {
          const { selector, cssRules, important } = payload as {
            selector: string;
            cssRules: Record<string, string>;
            important: boolean;
          };
          const el = document.querySelector(selector) as HTMLElement | null;
          if (!el) throw new Error(`Element not found: ${selector}`);

          const computed = window.getComputedStyle(el);
          const before: Record<string, string> = {};
          for (const prop of Object.keys(cssRules)) {
            before[prop] = computed.getPropertyValue(prop);
          }

          // Inject style element for selector
          const id = `brooklyn-sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const style = document.createElement("style");
          style.id = id;
          const importantSuffix = important ? " !important" : "";
          const body = Object.entries(cssRules)
            .map(([k, v]) => `${k}: ${v}${importantSuffix};`)
            .join(" ");
          style.textContent = `${selector} { ${body} }`;
          document.head.appendChild(style);

          // Force style recalc
          void el.offsetWidth;
          const computedAfter = window.getComputedStyle(el);
          const after: Record<string, string> = {};
          const changes: Array<{
            property: string;
            before: string;
            after: string;
            changed: boolean;
            needsImportant?: boolean;
          }> = [];

          for (const prop of Object.keys(cssRules)) {
            const beforeVal = before[prop] ?? "";
            const afterVal = computedAfter.getPropertyValue(prop) ?? "";
            after[prop] = afterVal;
            const changed = beforeVal !== afterVal;
            changes.push({ property: prop, before: beforeVal, after: afterVal, changed });
          }

          // Cleanup
          style.remove();

          return {
            overallChanged: changes.some((c) => c.changed),
            changes,
          };
        },
        { selector, cssRules, important },
      );

      // If not important and some properties didn’t change, probe with inline !important per property
      if (!important) {
        const probe = await session.page.evaluate(
          (payload) => {
            const { selector, cssRules } = payload as {
              selector: string;
              cssRules: Record<string, string>;
            };
            const el = document.querySelector(selector) as HTMLElement | null;
            if (!el) throw new Error(`Element not found: ${selector}`);
            const computed = window.getComputedStyle(el);
            const before: Record<string, string> = {};
            const props = Object.keys(cssRules);
            for (const p of props) before[p] = computed.getPropertyValue(p);

            const needsImportant: Record<string, boolean> = {};
            for (const p of props) {
              const prev = el.style.getPropertyValue(p);
              const prevPriority = el.style.getPropertyPriority(p);
              el.style.setProperty(p, cssRules[p] || "", "important");
              const after = window.getComputedStyle(el).getPropertyValue(p);
              needsImportant[p] = before[p] !== after;
              // revert inline
              if (prev) el.style.setProperty(p, prev, prevPriority);
              else el.style.removeProperty(p);
            }
            return needsImportant;
          },
          { selector, cssRules },
        );

        for (const c of result.changes) {
          if (!c.changed && probe[c.property]) c.needsImportant = true;
        }
      }

      return { success: true, overallChanged: result.overallChanged, changes: result.changes };
    } catch (error) {
      logger.error("simulate_css_change failed", { browserId, selector, error: String(error) });
      throw new Error(
        `simulate_css_change failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async whyStyleNotApplied(args: {
    browserId: string;
    selector: string;
    property: string;
    desiredValue?: string;
  }): Promise<{
    success: boolean;
    property: string;
    computed: { before: string; after?: string };
    reasons: string[];
    recommendations?: string[];
  }> {
    const { browserId, selector, property, desiredValue } = args;
    let session = this.sessions.get(browserId);
    if (!session) throw new Error(`Browser session not found: ${browserId}`);
    if (!session.page || session.page.isClosed()) {
      const newPage = await session.instance.getMainPage();
      session = { ...session, page: newPage };
      this.sessions.set(browserId, session);
    }
    session.instance.touch();

    // Gather baseline info (position, display) and computed value
    const baseline = await session.page.evaluate(
      (payload) => {
        const { selector, property } = payload as { selector: string; property: string };
        const el = document.querySelector(selector) as HTMLElement | null;
        if (!el) throw new Error(`Element not found: ${selector}`);
        const cs = window.getComputedStyle(el);
        return {
          computed: cs.getPropertyValue(property),
          position: cs.position,
          display: cs.display,
          isInline: cs.display === "inline",
        };
      },
      { selector, property },
    );

    const reasons: string[] = (() => {
      const rs: string[] = [];
      // Heuristics for common pitfalls
      if (["top", "left", "right", "bottom"].includes(property) && baseline.position === "static") {
        rs.push("Position is static; offsets only take effect when position != static");
      }
      if (property === "z-index" && baseline.position === "static") {
        rs.push("z-index applies to positioned/flex/grid contexts; position is static");
      }
      if (["width", "height"].includes(property) && baseline.display === "inline") {
        rs.push("width/height have no effect on inline non-replaced elements");
      }
      if (["margin-top", "margin-bottom"].includes(property) && baseline.display === "inline") {
        rs.push("vertical margins don’t apply to inline elements");
      }
      return rs;
    })();

    let after: string | undefined;
    if (desiredValue) {
      // Use simulateCssChange for this single property
      const sim = await this.simulateCssChange({
        browserId,
        selector,
        cssRules: { [property]: desiredValue },
        important: false,
      });
      const change = sim.changes.find((c) => c.property === property);
      if (change) {
        after = change.after;
        if (!change.changed) {
          if (change.needsImportant) {
            reasons.push(
              "Change requires higher precedence; !important or higher specificity wins",
            );
          } else {
            reasons.push(
              "Property/value may be overridden by cascade or not applicable in current context",
            );
          }
        }
      }
    } else {
      reasons.push("Provide 'desiredValue' to test if the change would take effect");
    }

    const recommendations: string[] = (() => {
      const recs: string[] = [];
      if (reasons.some((r) => r.includes("static")) && property !== "position") {
        recs.push("Set position: relative on the element or appropriate ancestor");
      }
      if (
        reasons.some((r) => r.includes("inline")) &&
        ["width", "height", "margin-top", "margin-bottom"].includes(property)
      ) {
        recs.push("Change display to inline-block, block, or flex to apply the property");
      }
      if (reasons.some((r) => r.includes("precedence"))) {
        recs.push("Prefer reducing specificity or refactoring rules over using !important");
      }
      return recs;
    })();

    return {
      success: true,
      property,
      computed: { before: baseline.computed, ...(after ? { after } : {}) },
      reasons,
      recommendations: recommendations.length ? recommendations : undefined,
    };
  }

  async getApplicableRules(args: {
    browserId: string;
    selector: string;
    properties?: string[];
    limit?: number;
  }): Promise<{
    success: boolean;
    selector: string;
    rules: Array<{
      selector: string;
      specificity: [number, number, number];
      source: { origin: string; href?: string };
      order: number;
      properties: Array<{ name: string; value: string; important: boolean }>;
    }>;
  }> {
    const { browserId, selector, properties, limit = 50 } = args;
    let session = this.sessions.get(browserId);
    if (!session) throw new Error(`Browser session not found: ${browserId}`);
    if (!session.page || session.page.isClosed()) {
      const newPage = await session.instance.getMainPage();
      session = { ...session, page: newPage };
      this.sessions.set(browserId, session);
    }
    session.instance.touch();

    const result = await session.page.evaluate(
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Browser-side cascade scan requires iterative logic
      (payload) => {
        const { selector, properties, limit } = payload as {
          selector: string;
          properties?: string[];
          limit: number;
        };
        const el = document.querySelector(selector) as HTMLElement | null;
        if (!el) throw new Error(`Element not found: ${selector}`);

        const computeSpecificity = (sel: string): [number, number, number] => {
          // Basic specificity: [ids, classes/attrs/pseudo-classes, tags/pseudo-elements]
          const ids = (sel.match(/#[a-zA-Z0-9_-]+/g) || []).length;
          const classes = (sel.match(/\.[a-zA-Z0-9_-]+/g) || []).length;
          const attrs = (sel.match(/\[[^\]]+\]/g) || []).length;
          const pseudos = (sel.match(/:(?!:)[a-zA-Z0-9_-]+/g) || []).length;
          const tags = (sel.match(/(^|\s|\+|~|>)\s*[a-zA-Z0-9_-]+/g) || []).length;
          const pseudoEls = (sel.match(/::[a-zA-Z0-9_-]+/g) || []).length;
          return [ids, classes + attrs + pseudos, tags + pseudoEls];
        };

        const collected: Array<{
          selector: string;
          specificity: [number, number, number];
          source: { origin: string; href?: string };
          order: number;
          properties: Array<{ name: string; value: string; important: boolean }>;
        }> = [];

        let order = 0;
        for (const sheet of Array.from(document.styleSheets)) {
          let href: string | undefined;
          try {
            href = (sheet as CSSStyleSheet).href || undefined;
            const rules = (sheet as CSSStyleSheet).cssRules;
            for (const rule of Array.from(rules)) {
              if ((rule as CSSStyleRule).selectorText) {
                const sel = (rule as CSSStyleRule).selectorText || "";
                if (!sel) continue;
                // matches may throw for invalid selectors
                let matches = false;
                try {
                  matches = el.matches(sel);
                } catch {
                  matches = false;
                }
                if (matches) {
                  const specificity = computeSpecificity(sel);
                  const style = (rule as CSSStyleRule).style;
                  const props: Array<{ name: string; value: string; important: boolean }> = [];
                  const propList =
                    properties && properties.length > 0
                      ? properties
                      : Array.from({ length: style.length }, (_, i) => style.item(i));
                  for (const p of propList) {
                    if (!p) continue;
                    const val = style.getPropertyValue(p);
                    if (val) {
                      props.push({
                        name: p,
                        value: val,
                        important: style.getPropertyPriority(p) === "important",
                      });
                    }
                  }
                  if (props.length > 0) {
                    collected.push({
                      selector: sel,
                      specificity,
                      source: { origin: "author", href },
                      order: order++,
                      properties: props,
                    });
                  }
                }
              }
            }
          } catch {
            // Cross-origin stylesheets may throw; skip
          }
          if (collected.length >= limit) break;
        }

        return { success: true, selector, rules: collected.slice(0, limit) };
      },
      { selector, properties, limit },
    );

    return result as {
      success: boolean;
      selector: string;
      rules: Array<{
        selector: string;
        specificity: [number, number, number];
        source: { origin: string; href?: string };
        order: number;
        properties: Array<{ name: string; value: string; important: boolean }>;
      }>;
    };
  }

  async getEffectiveComputed(args: {
    browserId: string;
    selector: string;
    property: string;
  }): Promise<{
    success: boolean;
    selector: string;
    property: string;
    value: string;
    source?: { type: string; selector?: string; href?: string };
    specificity?: [number, number, number];
    important?: boolean;
  }> {
    const { browserId, selector, property } = args;
    let session = this.sessions.get(browserId);
    if (!session) throw new Error(`Browser session not found: ${browserId}`);
    if (!session.page || session.page.isClosed()) {
      const newPage = await session.instance.getMainPage();
      session = { ...session, page: newPage };
      this.sessions.set(browserId, session);
    }
    session.instance.touch();

    const result = await session.page.evaluate(
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Browser-side winner selection requires evaluation logic
      (payload) => {
        const { selector, property } = payload as { selector: string; property: string };
        const el = document.querySelector(selector) as HTMLElement | null;
        if (!el) throw new Error(`Element not found: ${selector}`);
        const value = window.getComputedStyle(el).getPropertyValue(property);

        const computeSpecificity = (sel: string): [number, number, number] => {
          const ids = (sel.match(/#[a-zA-Z0-9_-]+/g) || []).length;
          const classes = (sel.match(/\.[a-zA-Z0-9_-]+/g) || []).length;
          const attrs = (sel.match(/\[[^\]]+\]/g) || []).length;
          const pseudos = (sel.match(/:(?!:)[a-zA-Z0-9_-]+/g) || []).length;
          const tags = (sel.match(/(^|\s|\+|~|>)\s*[a-zA-Z0-9_-]+/g) || []).length;
          const pseudoEls = (sel.match(/::[a-zA-Z0-9_-]+/g) || []).length;
          return [ids, classes + attrs + pseudos, tags + pseudoEls];
        };

        // Collect candidate declarations
        type Candidate = {
          selector?: string;
          specificity: [number, number, number];
          important: boolean;
          origin: string;
          href?: string;
          order: number;
          value: string;
          type: string;
        };

        const candidates: Candidate[] = [];

        // Inline style as candidate
        const inlineVal = el.style.getPropertyValue(property);
        if (inlineVal) {
          candidates.push({
            selector: undefined,
            specificity: [1, 0, 0],
            important: el.style.getPropertyPriority(property) === "important",
            origin: "author",
            order: Number.MAX_SAFE_INTEGER - 1,
            value: inlineVal,
            type: "inline",
          });
        }

        let order = 0;
        for (const sheet of Array.from(document.styleSheets)) {
          let href: string | undefined;
          try {
            href = (sheet as CSSStyleSheet).href || undefined;
            const rules = (sheet as CSSStyleSheet).cssRules;
            for (const rule of Array.from(rules)) {
              if ((rule as CSSStyleRule).selectorText) {
                const sel = (rule as CSSStyleRule).selectorText || "";
                if (!sel) continue;
                let matches = false;
                try {
                  matches = el.matches(sel);
                } catch {
                  matches = false;
                }
                if (!matches) continue;
                const style = (rule as CSSStyleRule).style;
                const val = style.getPropertyValue(property);
                if (!val) continue;
                candidates.push({
                  selector: sel,
                  specificity: computeSpecificity(sel),
                  important: style.getPropertyPriority(property) === "important",
                  origin: "author",
                  href,
                  order: order++,
                  value: val,
                  type: "author",
                });
              }
            }
          } catch {
            // Cross-origin stylesheet; skip
          }
        }

        // Determine winner: important > specificity > order (last wins)
        const winner = candidates.sort((a, b) => {
          if (a.important !== b.important) return a.important ? 1 : -1;
          if (a.specificity[0] !== b.specificity[0]) return a.specificity[0] - b.specificity[0];
          if (a.specificity[1] !== b.specificity[1]) return a.specificity[1] - b.specificity[1];
          if (a.specificity[2] !== b.specificity[2]) return a.specificity[2] - b.specificity[2];
          return a.order - b.order;
        })[candidates.length - 1];

        return {
          success: true,
          selector,
          property,
          value,
          source: winner
            ? { type: winner.type, selector: winner.selector, href: winner.href }
            : undefined,
          specificity: winner ? winner.specificity : undefined,
          important: winner ? winner.important : undefined,
        };
      },
      { selector, property },
    );

    return result as {
      success: boolean;
      selector: string;
      property: string;
      value: string;
      source?: { type: string; selector?: string; href?: string };
      specificity?: [number, number, number];
      important?: boolean;
    };
  }

  async removeOverlay(args: {
    browserId: string;
    overlayId: string;
  }): Promise<{ success: boolean; removed: boolean }> {
    const { browserId, overlayId } = args;
    let session = this.sessions.get(browserId);
    if (!session) throw new Error(`Browser session not found: ${browserId}`);
    if (!session.page || session.page.isClosed()) {
      const newPage = await session.instance.getMainPage();
      session = { ...session, page: newPage };
      this.sessions.set(browserId, session);
    }
    session.instance.touch();
    try {
      const removed = await session.page.evaluate((id) => {
        const el = document.getElementById(id);
        if (el?.parentNode) {
          el.parentNode.removeChild(el);
          return true;
        }
        return false;
      }, overlayId);
      logger.info("Overlay removed", { browserId, overlayId, removed });
      return { success: true, removed };
    } catch (error) {
      logger.error("remove_overlay failed", { browserId, overlayId, error: String(error) });
      throw new Error(
        `remove_overlay failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ========================================================================
  // CSS overrides (apply/revert)
  // ========================================================================

  async applyCssOverride(args: {
    browserId: string;
    selector: string;
    cssRules: Record<string, string>;
    important?: boolean;
  }): Promise<{ success: boolean; overrideId: string }> {
    const { browserId, selector, cssRules, important = false } = args;
    let session = this.sessions.get(browserId);
    if (!session) throw new Error(`Browser session not found: ${browserId}`);
    if (!session.page || session.page.isClosed()) {
      const newPage = await session.instance.getMainPage();
      session = { ...session, page: newPage };
      this.sessions.set(browserId, session);
    }
    session.instance.touch();

    try {
      const overrideId = await session.page.evaluate(
        (payload) => {
          const { selector, cssRules, important } = payload as {
            selector: string;
            cssRules: Record<string, string>;
            important: boolean;
          };
          const id = `brooklyn-override-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const style = document.createElement("style");
          style.id = id;
          style.setAttribute("data-brooklyn-override", "true");
          const importantSuffix = important ? " !important" : "";
          const body = Object.entries(cssRules)
            .map(([k, v]) => `${k}: ${v}${importantSuffix};`)
            .join(" ");
          style.textContent = `${selector} { ${body} }`;
          document.head.appendChild(style);
          return id;
        },
        { selector, cssRules, important },
      );
      logger.info("CSS override applied", { browserId, selector, overrideId });
      return { success: true, overrideId };
    } catch (error) {
      logger.error("apply_css_override failed", { browserId, selector, error: String(error) });
      throw new Error(
        `apply_css_override failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async revertCssChanges(args: {
    browserId: string;
    overrideId: string;
  }): Promise<{ success: boolean; removed: boolean }> {
    const { browserId, overrideId } = args;
    let session = this.sessions.get(browserId);
    if (!session) throw new Error(`Browser session not found: ${browserId}`);
    if (!session.page || session.page.isClosed()) {
      const newPage = await session.instance.getMainPage();
      session = { ...session, page: newPage };
      this.sessions.set(browserId, session);
    }
    session.instance.touch();
    try {
      const removed = await session.page.evaluate((id) => {
        const el = document.getElementById(id);
        if (el?.parentNode) {
          el.parentNode.removeChild(el);
          return true;
        }
        return false;
      }, overrideId);
      logger.info("CSS override reverted", { browserId, overrideId, removed });
      return { success: true, removed };
    } catch (error) {
      logger.error("revert_css_changes failed", { browserId, overrideId, error: String(error) });
      throw new Error(
        `revert_css_changes failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ========================================================================
  // Layout structure + whitespace
  // ========================================================================

  async getLayoutTree(args: {
    browserId: string;
    rootSelector?: string;
    maxDepth?: number;
    maxChildren?: number;
  }): Promise<{ tree: unknown }> {
    const { browserId, rootSelector, maxDepth = 3, maxChildren = 20 } = args;
    let session = this.sessions.get(browserId);
    if (!session) throw new Error(`Browser session not found: ${browserId}`);
    if (!session.page || session.page.isClosed()) {
      const newPage = await session.instance.getMainPage();
      session = { ...session, page: newPage };
      this.sessions.set(browserId, session);
    }
    session.instance.touch();

    const tree = await session.page.evaluate(
      (payload) => {
        const { rootSelector, maxDepth, maxChildren } = payload as {
          rootSelector?: string;
          maxDepth: number;
          maxChildren: number;
        };
        const root = rootSelector ? document.querySelector(rootSelector) : document.body;
        const toNode = (el: Element, depth: number): Record<string, unknown> => {
          const rect = (el as HTMLElement).getBoundingClientRect();
          const cs = window.getComputedStyle(el as HTMLElement);
          const node: Record<string, unknown> = {
            tag: el.tagName.toLowerCase(),
            class: (el as HTMLElement).className || undefined,
            id: (el as HTMLElement).id || undefined,
            position: cs.position,
            display: cs.display,
            bounds: {
              x: Math.round(rect.left + window.scrollX),
              y: Math.round(rect.top + window.scrollY),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            },
          };
          if (depth < maxDepth) {
            const children = Array.from(el.children).slice(0, maxChildren);
            if (children.length) {
              (node as { children?: Array<Record<string, unknown>> }).children = children.map((c) =>
                toNode(c, depth + 1),
              );
            }
          }
          return node;
        };
        return { tree: root ? toNode(root, 1) : null };
      },
      { rootSelector, maxDepth, maxChildren },
    );

    return tree;
  }

  async measureWhitespace(args: {
    browserId: string;
    containerSelector: string;
    minGap?: number;
  }): Promise<{
    gaps: Array<{ type: string; size: number; elements: string[] }>;
    totalWhitespace: number;
  }> {
    const { browserId, containerSelector, minGap = 1 } = args;
    let session = this.sessions.get(browserId);
    if (!session) throw new Error(`Browser session not found: ${browserId}`);
    if (!session.page || session.page.isClosed()) {
      const newPage = await session.instance.getMainPage();
      session = { ...session, page: newPage };
      this.sessions.set(browserId, session);
    }
    session.instance.touch();

    const result = await session.page.evaluate(
      (payload) => {
        const { containerSelector, minGap } = payload as {
          containerSelector: string;
          minGap: number;
        };
        const container = document.querySelector(containerSelector) as HTMLElement | null;
        if (!container) throw new Error(`Container not found: ${containerSelector}`);
        const children = Array.from(container.children) as HTMLElement[];
        const rects = children.map((el) => ({ el, rect: el.getBoundingClientRect() }));
        rects.sort((a, b) => a.rect.top - b.rect.top);
        const gaps: Array<{ type: string; size: number; elements: string[] }> = [];
        let totalWhitespace = 0;
        for (let i = 0; i < rects.length - 1; i++) {
          const prev = rects[i];
          const next = rects[i + 1];
          if (!(prev && next)) continue;
          const a = prev.rect;
          const b = next.rect;
          const gap = Math.round(b.top - (a.top + a.height));
          if (gap >= minGap) {
            totalWhitespace += gap;
            gaps.push({
              type: "vertical",
              size: gap,
              elements: [prev.el.tagName.toLowerCase(), next.el.tagName.toLowerCase()],
            });
          }
        }
        return { gaps, totalWhitespace };
      },
      { containerSelector, minGap },
    );

    return result;
  }

  async findLayoutContainers(args: { browserId: string }): Promise<{
    containers: Array<{
      selector: string;
      type: string;
      properties: Record<string, string>;
    }>;
  }> {
    const { browserId } = args;
    let session = this.sessions.get(browserId);
    if (!session) throw new Error(`Browser session not found: ${browserId}`);
    if (!session.page || session.page.isClosed()) {
      const newPage = await session.instance.getMainPage();
      session = { ...session, page: newPage };
      this.sessions.set(browserId, session);
    }
    session.instance.touch();

    const containers: {
      containers: Array<{
        selector: string;
        type: string;
        properties: Record<string, string>;
      }>;
    } = await session.page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll("*"));
      const results: Array<{
        selector: string;
        type: string;
        properties: Record<string, string>;
      }> = [];
      const toSelector = (el: Element): string => {
        if ((el as HTMLElement).id) return `#${(el as HTMLElement).id}`;
        const cls = (el as HTMLElement).className?.toString().trim();
        if (cls) return `${el.tagName.toLowerCase()}.${cls.split(/\s+/).join(".")}`;
        return el.tagName.toLowerCase();
      };
      const computeType = (display: string, position: string): string => {
        if (display === "flex") return "flex";
        if (display === "grid") return "grid";
        if (["relative", "absolute", "fixed", "sticky"].includes(position)) return "positioned";
        return "";
      };
      const collectProperties = (
        type: string,
        cs: CSSStyleDeclaration,
        display: string,
        position: string,
      ): Record<string, string> => {
        if (type === "flex") {
          return {
            display,
            flexDirection: cs.flexDirection,
            alignItems: cs.alignItems,
            justifyContent: cs.justifyContent,
          };
        }
        if (type === "grid") {
          return {
            display,
            gridTemplateColumns: cs.gridTemplateColumns,
            gridTemplateRows: cs.gridTemplateRows,
            gap: cs.gap,
          };
        }
        return { position };
      };
      for (const el of nodes) {
        const cs = window.getComputedStyle(el as HTMLElement);
        const display = cs.display;
        const position = cs.position;
        const type = computeType(display, position);
        if (!type) continue;
        const properties: Record<string, string> = collectProperties(type, cs, display, position);
        results.push({ selector: toSelector(el), type, properties });
      }
      return { containers: results };
    });

    return containers;
  }

  /**
   * Generate smart CSS selectors from natural language descriptions
   * Helps AI reduce friction with "find the red button" workflows
   */
  async generateSelector(args: GenerateSelectorArgs): Promise<GenerateSelectorResult> {
    const session = this.sessions.get(args.browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${args.browserId}`);
    }

    session.instance.touch();
    return await this.selectorGenerator.generateSelector(session.page, args);
  }

  // ========================================================================
  // Phase 1C: Content Extraction Extensions
  // ========================================================================

  /**
   * Extract HTML content from page or specific element for AI analysis
   */
  async getHtml(args: GetHtmlArgs): Promise<GetHtmlResult> {
    const session = this.sessions.get(args.browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${args.browserId}`);
    }

    session.instance.touch();
    return await this.contentExtractor.getHtml(session.page, args);
  }

  /**
   * Get attribute value(s) from an element for inspection and validation
   */
  async getAttribute(args: GetAttributeArgs): Promise<GetAttributeResult> {
    const session = this.sessions.get(args.browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${args.browserId}`);
    }

    session.instance.touch();
    return await this.contentExtractor.getAttribute(session.page, args);
  }

  /**
   * Get element geometry and positioning information for layout analysis
   */
  async getBoundingBox(args: GetBoundingBoxArgs): Promise<GetBoundingBoxResult> {
    const session = this.sessions.get(args.browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${args.browserId}`);
    }

    session.instance.touch();
    return await this.contentExtractor.getBoundingBox(session.page, args);
  }

  /**
   * Check if an element is visible in the viewport for UX validation
   */
  async isVisible(args: IsVisibleArgs): Promise<IsVisibleResult> {
    const session = this.sessions.get(args.browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${args.browserId}`);
    }

    session.instance.touch();
    return await this.contentExtractor.isVisible(session.page, args);
  }

  /**
   * Check if an element is enabled and interactive for form validation
   */
  async isEnabled(args: IsEnabledArgs): Promise<IsEnabledResult> {
    const session = this.sessions.get(args.browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${args.browserId}`);
    }

    session.instance.touch();
    return await this.contentExtractor.isEnabled(session.page, args);
  }

  async describeHtml(args: DescribeHtmlArgs): Promise<DescribeHtmlResult> {
    const session = this.sessions.get(args.browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${args.browserId}`);
    }

    session.instance.touch();
    return await this.contentExtractor.describeHtml(session.page, args);
  }

  /**
   * Extract structured data from an HTML table element
   */
  async extractTableData(args: ExtractTableDataArgs): Promise<ExtractTableDataResult> {
    const session = this.sessions.get(args.browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${args.browserId}`);
    }

    session.instance.touch();
    return await this.contentExtractor.extractTableData(session.page, args);
  }

  /**
   * Inspect recent network events from the browser session's ring buffer.
   */
  async inspectNetwork(args: InspectNetworkArgs): Promise<InspectNetworkResult> {
    const session = this.sessions.get(args.browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${args.browserId}`);
    }

    session.instance.touch();
    let events = session.instance.getNetworkEvents();

    // Apply filters
    if (args.filter?.urlPattern) {
      const pattern = args.filter.urlPattern;
      events = events.filter((e) => e.url.includes(pattern));
    }
    if (args.filter?.method) {
      const method = args.filter.method.toUpperCase();
      events = events.filter((e) => e.method === method);
    }

    // Determine raw mode
    const includeRaw = args.includeRaw === true;
    const fullHeaderSupport = process.env["BROOKLYN_FULL_HEADER_SUPPORT"] === "true";

    if (includeRaw && !fullHeaderSupport) {
      const error = new Error(
        "includeRaw requires BROOKLYN_FULL_HEADER_SUPPORT=true environment variable",
      ) as Error & { code?: string };
      error.code = "RAW_HEADERS_NOT_ALLOWED";
      throw error;
    }

    // When raw mode, limit to 10 and log audit entry
    if (includeRaw) {
      events = events.slice(-10);
      getLogger("inspect-network").warn("Raw header access granted", {
        browserId: args.browserId,
        eventCount: events.length,
        audit: true,
      });
    }

    // Redaction: baseline sensitive headers always enforced in non-raw mode,
    // caller-specified headers are additive (union), never a replacement.
    const baselineHeaders = DEFAULT_REDACT_HEADERS.map((h) => h.toLowerCase());
    const userHeaders = (args.redact ?? []).map((h) => h.toLowerCase());
    const redactSet = new Set([...baselineHeaders, ...userHeaders]);

    const redactMap = (hdrs: Record<string, string>): Record<string, string> => {
      if (includeRaw) return hdrs;
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(hdrs)) {
        out[key] = redactSet.has(key.toLowerCase()) ? "[REDACTED]" : value;
      }
      return out;
    };

    const requests = events.map((e) => ({
      url: e.url,
      method: e.method,
      requestHeaders: redactMap(e.requestHeaders),
      status: e.status,
      responseHeaders: redactMap(e.responseHeaders),
      timestamp: e.timestamp,
    }));

    return {
      success: true,
      requests,
      count: requests.length,
      redacted: !includeRaw,
    };
  }

  /**
   * Paginate through a multi-page table, extracting and merging data.
   */
  async paginateTable(args: PaginateTableArgs): Promise<PaginateTableResult> {
    const session = this.sessions.get(args.browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${args.browserId}`);
    }

    session.instance.touch();

    const maxPages = args.maxPages ?? 10;
    const allData: Record<string, string>[] = [];
    const seenRows = new Set<string>();
    let headers: string[] = [];
    let pageCount = 0;
    let maxPagesReached = false;

    for (let page = 0; page < maxPages; page++) {
      // Extract current page data
      const extraction = await this.contentExtractor.extractTableData(session.page, {
        browserId: args.browserId,
        selector: args.tableSelector,
      });

      if (page === 0) {
        headers = extraction.headers;
      }

      // Dedupe by serialized row content
      for (const row of extraction.data) {
        const key = JSON.stringify(row);
        if (!seenRows.has(key)) {
          seenRows.add(key);
          allData.push(row);
        }
      }

      pageCount++;

      // Check if next button exists and is clickable
      const nextBtn = session.page.locator(args.nextButton);
      const isVisible = await nextBtn.isVisible().catch(() => false);
      const isEnabled = await nextBtn.isEnabled().catch(() => false);

      if (!(isVisible && isEnabled)) {
        break; // No more pages
      }

      // If this is the last iteration and button is still active, flag limit hit
      if (page === maxPages - 1) {
        maxPagesReached = true;
        break;
      }

      // Click next and wait for table to reload
      await nextBtn.click();
      await session.page.waitForLoadState("networkidle").catch(() => {
        // Fallback: wait a short time for SPA-style pagination
      });
      await session.page.waitForSelector(args.tableSelector, { timeout: 5000 }).catch(() => {
        // Table may already be visible
      });
    }

    return {
      success: true,
      allData,
      headers,
      pages: pageCount,
      totalRows: allData.length,
      ...(maxPagesReached ? { maxPagesReached: true } : {}),
    };
  }

  /**
   * Initialize console capture when launching a browser
   * Must be called after page creation
   */
  private initializePageServices(page: Page, browserId: string): void {
    // Initialize console capture for JavaScript debugging
    this.jsExecutor.initializeConsoleCapture(page, browserId);
  }

  /**
   * Render a PDF file in the browser for visual analysis and interaction
   * Uses browser's native PDF viewer for accurate rendering
   */
  async renderPdf(args: {
    browserId: string;
    pdfPath: string;
    page?: number;
    zoom?: number;
    waitForRender?: number;
  }): Promise<{
    success: boolean;
    message: string;
    pageCount?: number;
    currentPage?: number;
  }> {
    const { browserId, pdfPath, page: pageNum = 1, zoom = 1.0, waitForRender = 2000 } = args;

    logger.info("Rendering PDF", { browserId, pdfPath, page: pageNum, zoom });

    // Validate file exists
    if (!existsSync(pdfPath)) {
      throw new Error(`PDF file not found: ${pdfPath}`);
    }

    const session = this.sessions.get(browserId);
    if (!session) {
      throw new Error(`Browser session not found: ${browserId}`);
    }

    try {
      // Get or create HTTP server for this session
      const httpServer = await LocalHttpServer.getInstance(browserId);

      // Serve the PDF with viewer for DOM access
      const { url } = await httpServer.servePdfWithViewer(pdfPath);

      logger.info("Navigating to PDF viewer", { browserId, url });

      // Navigate to the PDF viewer page
      await session.page.goto(url, {
        waitUntil: "networkidle",
        timeout: 30000,
      });

      // Wait for PDF to render
      await session.page.waitForTimeout(waitForRender);

      // Wait for our custom PDF.js viewer to fully load
      await session.page
        .waitForFunction(
          () => {
            const win = window as unknown as { brooklynPdfHelpers?: unknown };
            return typeof win.brooklynPdfHelpers !== "undefined";
          },
          {
            timeout: 10000,
          },
        )
        .catch(() => {
          // Fallback if helpers aren't available
          logger.warn("PDF helpers not available, continuing without DOM access");
        });

      // Get PDF metadata and apply page/zoom settings
      const result = await session.page.evaluate(
        ({ targetPage, targetZoom }) => {
          const win = window as unknown as {
            brooklynPdfHelpers?: Record<string, unknown>;
            pdfMetadata?: { numPages?: number };
          };

          // Our custom PDF.js viewer
          if (win.brooklynPdfHelpers && win.pdfMetadata) {
            // Navigate to specific page
            if (targetPage > 1) {
              const pageElement = document.getElementById(`page-${targetPage}`);
              if (pageElement) {
                pageElement.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            }

            // Apply zoom
            if (targetZoom !== 1.0) {
              const container = document.getElementById("pdf-container");
              if (container) {
                container.style.transform = `scale(${targetZoom})`;
                container.style.transformOrigin = "top left";
              }
            }

            return {
              pageCount: win.pdfMetadata.numPages || 1,
              currentPage: targetPage,
              hasTextLayer: true,
              helpers: Object.keys(win.brooklynPdfHelpers || {}),
            };
          }

          // Fallback - PDF rendered without our viewer
          return {
            pageCount: undefined,
            currentPage: targetPage,
            hasTextLayer: false,
          };
        },
        { targetPage: pageNum, targetZoom: zoom },
      );

      logger.info("PDF rendered successfully", {
        browserId,
        pdfPath,
        url,
        pageCount: result.pageCount,
        currentPage: result.currentPage,
      });

      return {
        success: true,
        message: `PDF rendered: ${basename(pdfPath)} at ${url}`,
        pageCount: result.pageCount,
        currentPage: result.currentPage,
      };
    } catch (error) {
      logger.error("Failed to render PDF", {
        browserId,
        pdfPath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to render PDF: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
