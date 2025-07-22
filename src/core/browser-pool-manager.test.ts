/**
 * Tests for BrowserPoolManager
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserPoolManager } from "./browser-pool-manager.js";

// Mock playwright
vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn(),
  },
  firefox: {
    launch: vi.fn(),
  },
  webkit: {
    launch: vi.fn(),
  },
}));

// Mock config
vi.mock("../shared/config.js", () => ({
  config: {
    maxBrowsers: 5,
  },
}));

// Mock structured logger (winston eliminated)
vi.mock("../shared/structured-logger.js", () => ({
  getLogger: vi.fn(() => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  })),
}));

describe("BrowserPoolManager", () => {
  let browserPoolManager: BrowserPoolManager;
  let mockBrowser: any;
  let mockContext: any;
  let mockPage: any;

  beforeEach(() => {
    browserPoolManager = new BrowserPoolManager();

    // Setup mock browser, context, and page
    mockPage = {
      evaluate: vi.fn(),
      goto: vi.fn(),
      title: vi.fn(),
      url: vi.fn(),
      screenshot: vi.fn(),
      close: vi.fn(),
      isClosed: vi.fn(),
      setDefaultTimeout: vi.fn(),
      setDefaultNavigationTimeout: vi.fn(),
    };

    mockContext = {
      newPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn(),
      pages: vi.fn().mockReturnValue([]),
    };

    mockBrowser = {
      newContext: vi.fn().mockResolvedValue(mockContext),
      close: vi.fn(),
      isConnected: vi.fn().mockReturnValue(true),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("should initialize browser pool successfully", async () => {
      await browserPoolManager.initialize();

      const status = browserPoolManager.getStatus();
      expect(status.activeSessions).toBe(0);
      expect(status.maxBrowsers).toBe(5);
      expect(status.sessions).toEqual([]);
    });

    it("should cleanup browser pool successfully", async () => {
      await browserPoolManager.initialize();
      await browserPoolManager.cleanup();

      const status = browserPoolManager.getStatus();
      expect(status.activeSessions).toBe(0);
    });
  });

  describe("browser launch", () => {
    beforeEach(async () => {
      await browserPoolManager.initialize();
    });

    afterEach(async () => {
      await browserPoolManager.cleanup();
    });

    it("should launch chromium browser successfully", async () => {
      const { chromium } = await import("playwright");
      vi.mocked(chromium.launch).mockResolvedValue(mockBrowser);
      mockPage.evaluate.mockResolvedValue("Mozilla/5.0 Test");

      const result = await browserPoolManager.launchBrowser({
        browserType: "chromium",
        headless: true,
      });

      expect(result).toMatchObject({
        browserType: "chromium",
        headless: true,
        userAgent: "Mozilla/5.0 Test",
        viewport: { width: 1920, height: 1080 },
      });
      expect(result.browserId).toBeTruthy();
    });

    it("should launch firefox browser successfully", async () => {
      const { firefox } = await import("playwright");
      vi.mocked(firefox.launch).mockResolvedValue(mockBrowser);
      mockPage.evaluate.mockResolvedValue("Mozilla/5.0 Firefox");

      const result = await browserPoolManager.launchBrowser({
        browserType: "firefox",
        headless: true,
      });

      expect(result).toMatchObject({
        browserType: "firefox",
        headless: true,
        userAgent: "Mozilla/5.0 Firefox",
      });
    });

    it("should respect browser pool limits", async () => {
      const { chromium } = await import("playwright");
      vi.mocked(chromium.launch).mockResolvedValue(mockBrowser);
      mockPage.evaluate.mockResolvedValue("Mozilla/5.0 Test");

      // Launch browsers up to the limit
      for (let i = 0; i < 5; i++) {
        await browserPoolManager.launchBrowser({
          browserType: "chromium",
          headless: true,
        });
      }

      // Should throw error when exceeding limit
      await expect(
        browserPoolManager.launchBrowser({
          browserType: "chromium",
          headless: true,
        }),
      ).rejects.toThrow("Browser pool limit reached");
    });
  });

  describe("navigation", () => {
    let browserId: string;

    beforeEach(async () => {
      await browserPoolManager.initialize();
      const { chromium } = await import("playwright");
      vi.mocked(chromium.launch).mockResolvedValue(mockBrowser);
      mockPage.evaluate.mockResolvedValue("Mozilla/5.0 Test");

      const result = await browserPoolManager.launchBrowser({
        browserType: "chromium",
        headless: true,
      });
      browserId = result.browserId;
    });

    afterEach(async () => {
      await browserPoolManager.cleanup();
    });

    it("should navigate to valid URL successfully", async () => {
      const mockResponse = { status: () => 200 };
      mockPage.goto.mockResolvedValue(mockResponse);
      mockPage.title.mockResolvedValue("Test Page");
      mockPage.url.mockReturnValue("https://example.com");

      const result = await browserPoolManager.navigate({
        browserId,
        url: "https://example.com",
      });

      expect(result).toMatchObject({
        success: true,
        url: "https://example.com",
        title: "Test Page",
        statusCode: 200,
      });
      expect(result.loadTime).toBeGreaterThanOrEqual(0);
    });

    it("should throw error for invalid URL", async () => {
      await expect(
        browserPoolManager.navigate({
          browserId,
          url: "invalid-url",
        }),
      ).rejects.toThrow("Invalid URL");
    });

    it("should throw error for non-existent browser", async () => {
      await expect(
        browserPoolManager.navigate({
          browserId: "non-existent-id",
          url: "https://example.com",
        }),
      ).rejects.toThrow("Browser session not found");
    });
  });

  describe("screenshot", () => {
    let browserId: string;

    beforeEach(async () => {
      await browserPoolManager.initialize();
      const { chromium } = await import("playwright");
      vi.mocked(chromium.launch).mockResolvedValue(mockBrowser);
      mockPage.evaluate.mockResolvedValue("Mozilla/5.0 Test");

      const result = await browserPoolManager.launchBrowser({
        browserType: "chromium",
        headless: true,
      });
      browserId = result.browserId;
    });

    afterEach(async () => {
      await browserPoolManager.cleanup();
    });

    it("should take screenshot successfully", async () => {
      const mockBuffer = Buffer.from("fake-screenshot-data");
      mockPage.screenshot.mockResolvedValue(mockBuffer);
      mockPage.evaluate.mockResolvedValue({ width: 1920, height: 1080 });

      const result = await browserPoolManager.screenshot({
        browserId,
        fullPage: true,
        type: "png",
      });

      expect(result).toMatchObject({
        format: "png",
        dimensions: { width: 1920, height: 1080 },
        fileSize: expect.any(Number),
        returnFormat: "file",
      });
      expect(result.filePath).toBeTruthy();
      expect(result.auditId).toBeTruthy();
    });

    it("should throw error for non-existent browser", async () => {
      await expect(
        browserPoolManager.screenshot({
          browserId: "non-existent-id",
          fullPage: true,
        }),
      ).rejects.toThrow("Browser session not found");
    });
  });

  describe("browser close", () => {
    let browserId: string;

    beforeEach(async () => {
      await browserPoolManager.initialize();
      const { chromium } = await import("playwright");
      vi.mocked(chromium.launch).mockResolvedValue(mockBrowser);
      mockPage.evaluate.mockResolvedValue("Mozilla/5.0 Test");

      const result = await browserPoolManager.launchBrowser({
        browserType: "chromium",
        headless: true,
      });
      browserId = result.browserId;
    });

    afterEach(async () => {
      await browserPoolManager.cleanup();
    });

    it("should close browser successfully", async () => {
      mockPage.isClosed.mockReturnValue(false);

      const result = await browserPoolManager.closeBrowser({
        browserId,
      });

      expect(result).toMatchObject({
        success: true,
        browserId,
      });

      const status = browserPoolManager.getStatus();
      expect(status.activeSessions).toBe(0);
    });

    it("should throw error for non-existent browser", async () => {
      await expect(
        browserPoolManager.closeBrowser({
          browserId: "non-existent-id",
        }),
      ).rejects.toThrow("Browser session not found");
    });
  });

  describe("status", () => {
    it("should return correct status", async () => {
      await browserPoolManager.initialize();

      const status = browserPoolManager.getStatus();
      expect(status).toMatchObject({
        activeSessions: 0,
        maxBrowsers: 5,
        sessions: [],
      });
    });
  });
});
