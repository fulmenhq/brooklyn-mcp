/**
 * Tests for BrowserInstance class
 */

import type { Browser, BrowserContext, Page } from "playwright";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserInstance, type BrowserInstanceConfig } from "./browser-instance.js";

// Mock logger
vi.mock("../../shared/pino-logger.js", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe("BrowserInstance", () => {
  let browserInstance: BrowserInstance;
  let mockBrowser: Browser;
  let mockContext: BrowserContext;
  let mockPage: Page;

  const config: BrowserInstanceConfig = {
    id: "test-instance",
    teamId: "test-team",
    browserType: "chromium",
    headless: true,
    timeout: 30000,
    viewport: { width: 1920, height: 1080 },
  };

  beforeEach(() => {
    // Create mock page
    mockPage = {
      isClosed: vi.fn(() => false),
      close: vi.fn().mockResolvedValue(undefined),
      setDefaultTimeout: vi.fn(),
      setDefaultNavigationTimeout: vi.fn(),
      on: vi.fn(),
    } as unknown as Page;

    // Create mock context
    mockContext = {
      newPage: vi.fn(async () => mockPage),
      close: vi.fn(),
      pages: vi.fn(() => []),
    } as unknown as BrowserContext;

    // Create mock browser
    mockBrowser = {
      isConnected: vi.fn(() => true),
      newContext: vi.fn(async () => mockContext),
      close: vi.fn(),
    } as unknown as Browser;

    browserInstance = new BrowserInstance(config);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("should initialize with correct properties", () => {
      expect(browserInstance.id).toBe("test-instance");
      expect(browserInstance.teamId).toBe("test-team");
      expect(browserInstance.browserType).toBe("chromium");
      expect(browserInstance.isActive).toBe(false);
      expect(browserInstance.healthStatus).toBe("healthy");
    });

    it("should initialize browser and context", async () => {
      await browserInstance.initialize(mockBrowser);

      expect(mockBrowser.newContext).toHaveBeenCalledWith({
        viewport: config.viewport,
        userAgent: config.userAgent,
        ignoreHTTPSErrors: true,
      });
      expect(browserInstance.isActive).toBe(true);
    });
  });

  describe("page management", () => {
    beforeEach(async () => {
      await browserInstance.initialize(mockBrowser);
    });

    it("should create a new page", async () => {
      const page = await browserInstance.createPage();

      expect(mockContext.newPage).toHaveBeenCalled();
      expect(mockPage.setDefaultTimeout).toHaveBeenCalledWith(30000);
      expect(mockPage.setDefaultNavigationTimeout).toHaveBeenCalledWith(30000);
      expect(page).toBe(mockPage);
    });

    it("should track page metrics", async () => {
      await browserInstance.createPage();
      const metrics = browserInstance.getMetrics();

      expect(metrics.pageCount).toBe(1);
    });

    it("should throw error if not initialized", async () => {
      const uninitializedInstance = new BrowserInstance(config);

      await expect(uninitializedInstance.createPage()).rejects.toThrow(
        "Browser instance not initialized",
      );
    });

    it("should throw error if not active", async () => {
      await browserInstance.close();

      await expect(browserInstance.createPage()).rejects.toThrow("Browser instance is not active");
    });
  });

  describe("health checks", () => {
    beforeEach(async () => {
      await browserInstance.initialize(mockBrowser);
    });

    it("should report healthy when browser is connected", async () => {
      const isHealthy = await browserInstance.checkHealth();

      expect(isHealthy).toBe(true);
      expect(browserInstance.healthStatus).toBe("healthy");
    });

    it("should report unhealthy when browser is disconnected", async () => {
      mockBrowser.isConnected = vi.fn(() => false);

      const isHealthy = await browserInstance.checkHealth();

      expect(isHealthy).toBe(false);
      expect(browserInstance.healthStatus).toBe("unhealthy");
    });
  });

  describe("closing", () => {
    beforeEach(async () => {
      await browserInstance.initialize(mockBrowser);
    });

    it("should close gracefully", async () => {
      await browserInstance.createPage();
      await browserInstance.close();

      expect(mockPage.close).toHaveBeenCalled();
      expect(mockContext.close).toHaveBeenCalled();
      expect(mockBrowser.close).toHaveBeenCalled();
      expect(browserInstance.isActive).toBe(false);
    });

    it("should force close even with errors", async () => {
      // Create a new page with error-throwing close
      const errorPage = {
        isClosed: vi.fn(() => false),
        close: vi.fn().mockRejectedValue(new Error("Page close failed")),
        setDefaultTimeout: vi.fn(),
        setDefaultNavigationTimeout: vi.fn(),
        on: vi.fn(),
      } as unknown as Page;

      mockContext.newPage = vi.fn(async () => errorPage);
      mockContext.close = vi.fn().mockRejectedValue(new Error("Context close failed"));
      mockBrowser.close = vi.fn().mockRejectedValue(new Error("Browser close failed"));

      await browserInstance.createPage();
      await browserInstance.close(true);

      expect(browserInstance.isActive).toBe(false);
    });
  });

  describe("idle detection", () => {
    beforeEach(async () => {
      await browserInstance.initialize(mockBrowser);
    });

    it("should detect idle state", async () => {
      // Wait for more than maxIdleMs
      const maxIdleMs = 100;
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(browserInstance.isIdle(maxIdleMs)).toBe(true);
    });

    it("should not be idle with open pages", async () => {
      await browserInstance.createPage();
      const maxIdleMs = 1000;

      expect(browserInstance.isIdle(maxIdleMs)).toBe(false);
    });
  });

  describe("summary", () => {
    it("should return instance summary", async () => {
      await browserInstance.initialize(mockBrowser);
      const summary = browserInstance.getSummary();

      expect(summary).toMatchObject({
        id: "test-instance",
        teamId: "test-team",
        browserType: "chromium",
        isActive: true,
        pageCount: 0,
        healthStatus: "healthy",
      });
      expect(summary.createdAt).toBeInstanceOf(Date);
      expect(summary.lastUsed).toBeInstanceOf(Date);
      expect(summary.metrics).toBeDefined();
    });
  });
});
