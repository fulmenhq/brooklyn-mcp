/**
 * Browser instance management for enterprise browser pool
 * Handles lifecycle of individual browser instances with health monitoring
 */

import { randomUUID } from "node:crypto";
import type { Browser, BrowserContext, Page } from "playwright";
import { getLogger } from "../../shared/pino-logger.js";

const logger = getLogger("browser-instance");

export interface BrowserInstanceConfig {
  id?: string;
  teamId?: string;
  browserType: "chromium" | "firefox" | "webkit";
  headless: boolean;
  timeout: number;
  userAgent?: string;
  viewport?: { width: number; height: number };
  resourceLimits?: {
    maxMemoryMB?: number;
    maxCpuPercent?: number;
  };
}

export interface BrowserInstanceMetrics {
  memoryUsage?: number;
  cpuUsage?: number;
  pageCount: number;
  requestCount: number;
  errorCount: number;
  lastHealthCheck: Date;
  healthStatus: "healthy" | "degraded" | "unhealthy";
}

export class BrowserInstance {
  public readonly id: string;
  public readonly teamId?: string;
  public readonly browserType: "chromium" | "firefox" | "webkit";
  public readonly createdAt: Date;

  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private pages: Map<string, Page> = new Map();
  private _lastUsed: Date;
  private _isActive = false;
  private metrics: BrowserInstanceMetrics;
  private healthCheckInterval?: NodeJS.Timeout;
  private readonly config: BrowserInstanceConfig;

  constructor(config: BrowserInstanceConfig) {
    this.id = config.id || randomUUID();
    this.teamId = config.teamId;
    this.browserType = config.browserType;
    this.config = config;
    this.createdAt = new Date();
    this._lastUsed = new Date();
    this.metrics = {
      pageCount: 0,
      requestCount: 0,
      errorCount: 0,
      lastHealthCheck: new Date(),
      healthStatus: "healthy",
    };
  }

  get lastUsed(): Date {
    return this._lastUsed;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  get healthStatus(): "healthy" | "degraded" | "unhealthy" {
    return this.metrics.healthStatus;
  }

  /**
   * Initialize browser instance with browser and context
   */
  async initialize(browser: Browser): Promise<void> {
    logger.info("Initializing browser instance", {
      id: this.id,
      browserType: this.browserType,
      teamId: this.teamId,
    });

    this.browser = browser;
    this._isActive = true;

    // Create browser context with configuration
    this.context = await browser.newContext({
      viewport: this.config.viewport,
      userAgent: this.config.userAgent,
      ignoreHTTPSErrors: true,
    });

    // Start health monitoring
    this.startHealthMonitoring();

    logger.info("Browser instance initialized", { id: this.id });
  }

  /**
   * Create a new page in this browser instance
   */
  async createPage(): Promise<Page> {
    if (!this.context) {
      throw new Error("Browser instance not initialized");
    }

    if (!this._isActive) {
      throw new Error("Browser instance is not active");
    }

    const page = await this.context.newPage();
    const pageId = randomUUID();

    // Configure page
    page.setDefaultTimeout(this.config.timeout);
    page.setDefaultNavigationTimeout(this.config.timeout);

    // Track page
    this.pages.set(pageId, page);
    this.metrics.pageCount = this.pages.size;
    this._lastUsed = new Date();

    // Monitor page events
    page.on("request", () => {
      this.metrics.requestCount++;
    });

    page.on("pageerror", () => {
      this.metrics.errorCount++;
    });

    page.on("close", () => {
      this.pages.delete(pageId);
      this.metrics.pageCount = this.pages.size;
    });

    logger.debug("Page created", {
      instanceId: this.id,
      pageId,
      pageCount: this.metrics.pageCount,
    });

    return page;
  }

  /**
   * Get the main page or create one if none exists
   */
  async getMainPage(): Promise<Page> {
    if (!this.context) {
      throw new Error("Browser instance not initialized");
    }

    // Return existing page if available
    const existingPage = Array.from(this.pages.values())[0];
    if (existingPage && !existingPage.isClosed()) {
      this._lastUsed = new Date();
      return existingPage;
    }

    // Create new page
    return this.createPage();
  }

  /**
   * Close a specific page
   */
  async closePage(pageId: string): Promise<void> {
    const page = this.pages.get(pageId);
    if (page && !page.isClosed()) {
      await page.close();
      this.pages.delete(pageId);
      this.metrics.pageCount = this.pages.size;
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): BrowserInstanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Perform health check
   */
  async checkHealth(): Promise<boolean> {
    try {
      if (!(this.browser?.isConnected() && this.context)) {
        this.metrics.healthStatus = "unhealthy";
        return false;
      }

      // Check if we can create and close a page
      const testPage = await this.context.newPage();
      await testPage.close();

      // Update health status based on metrics
      if (this.metrics.errorCount > 10) {
        this.metrics.healthStatus = "degraded";
      } else {
        this.metrics.healthStatus = "healthy";
      }

      this.metrics.lastHealthCheck = new Date();
      return true;
    } catch (error) {
      logger.error("Health check failed", {
        instanceId: this.id,
        error: error instanceof Error ? error.message : String(error),
      });
      this.metrics.healthStatus = "unhealthy";
      return false;
    }
  }

  /**
   * Close browser instance gracefully
   */
  async close(force = false): Promise<void> {
    logger.info("Closing browser instance", {
      id: this.id,
      force,
      pageCount: this.pages.size,
    });

    this._isActive = false;

    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Close all pages
    const closePromises = Array.from(this.pages.values()).map((page) => {
      if (!page.isClosed()) {
        return page.close().catch((err) => {
          logger.warn("Failed to close page", {
            instanceId: this.id,
            error: err.message,
          });
        });
      }
    });

    await Promise.allSettled(closePromises);
    this.pages.clear();

    // Close context
    if (this.context) {
      try {
        await this.context.close();
      } catch (error) {
        if (!force) throw error;
        logger.warn("Failed to close context", {
          instanceId: this.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Close browser
    if (this.browser?.isConnected()) {
      try {
        await this.browser.close();
      } catch (error) {
        if (!force) throw error;
        logger.warn("Failed to close browser", {
          instanceId: this.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info("Browser instance closed", { id: this.id });
  }

  /**
   * Check if instance is idle
   */
  isIdle(maxIdleMs: number): boolean {
    const idleTime = Date.now() - this._lastUsed.getTime();
    return idleTime > maxIdleMs && this.pages.size === 0;
  }

  /**
   * Update last used timestamp
   */
  touch(): void {
    this._lastUsed = new Date();
  }

  /**
   * Get instance summary for monitoring
   */
  getSummary() {
    return {
      id: this.id,
      teamId: this.teamId,
      browserType: this.browserType,
      createdAt: this.createdAt,
      lastUsed: this._lastUsed,
      isActive: this._isActive,
      pageCount: this.pages.size,
      healthStatus: this.metrics.healthStatus,
      metrics: this.getMetrics(),
    };
  }

  private startHealthMonitoring(): void {
    // Perform health check every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.checkHealth().catch((error) => {
        logger.error("Scheduled health check failed", {
          instanceId: this.id,
          error: error.message,
        });
      });
    }, 30000);
  }
}
