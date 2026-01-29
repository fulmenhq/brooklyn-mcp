/**
 * Tests for BrowserPoolManager
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock child_process to prevent shell execution of browser paths during version checks
vi.mock("node:child_process", () => ({
  execSync: vi.fn(() => "Chromium 120.0.6099.129"),
  exec: vi.fn((_cmd, _opts, callback) => {
    if (callback) callback(null, { stdout: "Chromium 120.0.6099.129", stderr: "" });
    return { stdout: "Chromium 120.0.6099.129", stderr: "" };
  }),
  spawn: vi.fn(),
}));

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

// Mock fs
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

// Mock LocalHttpServer
vi.mock("./utilities/local-http-server.js", () => ({
  LocalHttpServer: {
    getInstance: vi.fn(),
    stopAll: vi.fn(),
  },
}));

// Mock Pino logger
vi.mock("../shared/pino-logger.js", () => ({
  getLogger: vi.fn(() => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  })),
}));

// Mock browser instance
vi.mock("./browser/browser-instance.js");

// Mock browser factory
vi.mock("./browser/browser-factory.js");

// Mock browser pool
vi.mock("./browser/browser-pool.js");

// Mock screenshot storage manager
vi.mock("./screenshot-storage-manager.js", () => ({
  // biome-ignore lint/complexity/useArrowFunction: vitest 4.x requires function syntax for constructor mocks
  ScreenshotStorageManager: vi.fn().mockImplementation(function () {
    return {
      saveScreenshot: vi.fn().mockResolvedValue({
        filePath: "/tmp/screenshot.png",
        filename: "screenshot.png",
        format: "png",
        fileSize: 1024,
        auditId: "audit-123",
      }),
    };
  }),
}));

describe("BrowserPoolManager", () => {
  let browserPoolManager: BrowserPoolManager;
  let mockBrowser: any;
  let mockContext: any;
  let mockPage: any;
  let mockInstance: any;

  beforeEach(async () => {
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
      setViewportSize: vi.fn(),
      setExtraHTTPHeaders: vi.fn(),
      on: vi.fn(), // Add console capture support
      waitForSelector: vi.fn(),
      goBack: vi.fn(),
      waitForFunction: vi.fn(),
      waitForTimeout: vi.fn(),
      click: vi.fn(),
      fill: vi.fn(),
      mouse: {
        move: vi.fn(),
        down: vi.fn(),
        up: vi.fn(),
      },
      locator: vi.fn(() => ({
        focus: vi.fn().mockResolvedValue(undefined),
        click: vi.fn().mockResolvedValue(undefined),
        fill: vi.fn().mockResolvedValue(undefined),
        first: vi.fn(),
        count: vi.fn(),
        waitFor: vi.fn().mockResolvedValue(undefined),
        boundingBox: vi.fn().mockResolvedValue({ x: 100, y: 200, width: 50, height: 30 }),
        hover: vi.fn().mockResolvedValue(undefined),
        selectOption: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue("test-value"),
      })),
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

    // Create browser pool manager
    browserPoolManager = new BrowserPoolManager();

    // Mock the browser factory createInstance method
    mockInstance = {
      id: "test-instance-id",
      browserType: "chromium",
      isActive: true,
      healthStatus: "healthy",
      createPage: vi.fn().mockResolvedValue(mockPage),
      getMainPage: vi.fn().mockResolvedValue(mockPage),
      close: vi.fn(),
      checkHealth: vi.fn().mockResolvedValue(true),
      touch: vi.fn(),
      getMetrics: vi.fn().mockReturnValue({ pageCount: 0 }),
      getSummary: vi.fn(),
      isIdle: vi.fn().mockReturnValue(false),
      lastUsed: new Date(),
      createdAt: new Date(),
    };

    // Inject mock factory
    (browserPoolManager as any).factory.createInstance = vi.fn().mockResolvedValue(mockInstance);

    // Mock pool allocate to return instance with page
    (browserPoolManager as any).pool.allocate = vi.fn().mockResolvedValue({
      instance: mockInstance,
      page: mockPage,
      allocationTime: 100,
    });

    // Mock pool release
    (browserPoolManager as any).pool.release = vi.fn().mockResolvedValue(undefined);

    // Mock pool remove
    (browserPoolManager as any).pool.remove = vi.fn().mockResolvedValue(undefined);

    // Mock pool getStatus
    (browserPoolManager as any).pool.getStatus = vi.fn().mockReturnValue({
      initialized: true,
      metrics: {
        totalInstances: 0,
        activeInstances: 0,
        idleInstances: 0,
      },
      instances: [],
    });

    // Mock pool initialize and shutdown
    (browserPoolManager as any).pool.initialize = vi.fn().mockResolvedValue(undefined);
    (browserPoolManager as any).pool.shutdown = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await browserPoolManager.cleanup();
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
      // Mock page evaluation for user agent
      const mockAllocatedInstance = {
        id: "chromium-instance",
        browserType: "chromium",
        isActive: true,
        healthStatus: "healthy",
      };

      (browserPoolManager as any).pool.allocate = vi.fn().mockResolvedValue({
        instance: mockAllocatedInstance,
        page: mockPage,
        allocationTime: 50,
      });
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
      // Mock page evaluation for user agent
      const mockAllocatedInstance = {
        id: "firefox-instance",
        browserType: "firefox",
        isActive: true,
        healthStatus: "healthy",
      };

      (browserPoolManager as any).pool.allocate = vi.fn().mockResolvedValue({
        instance: mockAllocatedInstance,
        page: mockPage,
        allocationTime: 50,
      });
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

      // Track how many times allocate has been called
      let allocateCount = 0;
      (browserPoolManager as any).pool.allocate = vi.fn().mockImplementation(async () => {
        allocateCount++;
        if (allocateCount > 5) {
          throw new Error("No available browser instances");
        }

        const mockInstance = {
          id: `test-instance-${allocateCount}`,
          browserType: "chromium",
          isActive: true,
          healthStatus: "healthy",
          createPage: vi.fn().mockResolvedValue(mockPage),
          getMainPage: vi.fn().mockResolvedValue(mockPage),
          close: vi.fn(),
          checkHealth: vi.fn().mockResolvedValue(true),
          touch: vi.fn(),
          getMetrics: vi.fn().mockReturnValue({ pageCount: 0 }),
          getSummary: vi.fn(),
          isIdle: vi.fn().mockReturnValue(false),
          lastUsed: new Date(),
          createdAt: new Date(),
        };

        return {
          instance: mockInstance,
          page: mockPage,
          allocationTime: 100,
        };
      });

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
      ).rejects.toThrow("No available browser instances");
    });
  });

  describe("navigation", () => {
    let browserId: string;

    beforeEach(async () => {
      await browserPoolManager.initialize();

      // Mock successful browser allocation
      const mockInstance = {
        id: "nav-test-instance",
        browserType: "chromium",
        isActive: true,
        touch: vi.fn(),
      };

      (browserPoolManager as any).pool.allocate = vi.fn().mockResolvedValue({
        instance: mockInstance,
        page: mockPage,
        allocationTime: 50,
      });

      mockPage.evaluate.mockResolvedValue("Mozilla/5.0 Test");

      const result = await browserPoolManager.launchBrowser({
        browserType: "chromium",
        headless: true,
      });
      browserId = result.browserId;

      // Store session for navigation tests
      (browserPoolManager as any).sessions.set(browserId, {
        instance: mockInstance,
        page: mockPage,
        teamId: undefined,
      });
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

      // Mock successful browser allocation
      const mockInstance = {
        id: "screenshot-test-instance",
        browserType: "chromium",
        isActive: true,
        touch: vi.fn(),
      };

      (browserPoolManager as any).pool.allocate = vi.fn().mockResolvedValue({
        instance: mockInstance,
        page: mockPage,
        allocationTime: 50,
      });

      mockPage.evaluate.mockResolvedValue("Mozilla/5.0 Test");

      const result = await browserPoolManager.launchBrowser({
        browserType: "chromium",
        headless: true,
      });
      browserId = result.browserId;

      // Store session for screenshot tests
      (browserPoolManager as any).sessions.set(browserId, {
        instance: mockInstance,
        page: mockPage,
        teamId: undefined,
      });
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

      // Mock successful browser allocation
      const mockInstance = {
        id: "close-test-instance",
        browserType: "chromium",
        isActive: true,
        touch: vi.fn(),
      };

      (browserPoolManager as any).pool.allocate = vi.fn().mockResolvedValue({
        instance: mockInstance,
        page: mockPage,
        allocationTime: 50,
      });

      mockPage.evaluate.mockResolvedValue("Mozilla/5.0 Test");

      const result = await browserPoolManager.launchBrowser({
        browserType: "chromium",
        headless: true,
      });
      browserId = result.browserId;

      // Store session for close tests
      (browserPoolManager as any).sessions.set(browserId, {
        instance: mockInstance,
        page: mockPage,
        teamId: undefined,
      });
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

  describe("element interactions", () => {
    let browserId: string;

    beforeEach(async () => {
      await browserPoolManager.initialize();

      // Mock successful browser allocation
      (browserPoolManager as any).pool.allocate = vi.fn().mockResolvedValue({
        instance: mockInstance,
        page: mockPage,
        allocationTime: 50,
      });

      mockPage.evaluate.mockResolvedValue("Mozilla/5.0 Test");

      const result = await browserPoolManager.launchBrowser({
        browserType: "chromium",
        headless: true,
      });
      browserId = result.browserId;

      // Store session
      (browserPoolManager as any).sessions.set(browserId, {
        instance: mockInstance,
        page: mockPage,
        teamId: undefined,
      });
    });

    afterEach(async () => {
      await browserPoolManager.cleanup();
    });

    it("should click element successfully", async () => {
      mockPage.locator.mockReturnValue({
        waitFor: vi.fn().mockResolvedValue(undefined),
        click: vi.fn().mockResolvedValue(undefined),
      });

      const result = await browserPoolManager.clickElement({
        browserId,
        selector: "#button",
      });

      expect(result).toMatchObject({
        success: true,
        message: "Element clicked successfully",
        selector: "#button",
      });
    });

    it("should fill text successfully", async () => {
      mockPage.locator.mockReturnValue({
        waitFor: vi.fn().mockResolvedValue(undefined),
        fill: vi.fn().mockResolvedValue(undefined),
      });

      const result = await browserPoolManager.fillText({
        browserId,
        selector: "#input",
        text: "test value",
      });

      expect(result).toMatchObject({
        success: true,
        message: "Text filled successfully",
        selector: "#input",
        textLength: 10,
      });
    });

    it("should hover element successfully", async () => {
      mockPage.locator.mockReturnValue({
        nth: vi.fn().mockReturnValue({
          boundingBox: vi.fn().mockResolvedValue({ x: 100, y: 200, width: 50, height: 30 }),
          hover: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const result = await browserPoolManager.hoverElement({
        browserId,
        selector: "#hover-target",
      });

      expect(result).toMatchObject({
        success: true,
        selector: "#hover-target",
      });
    });

    it("should focus element successfully", async () => {
      mockPage.locator.mockReturnValue({
        focus: vi.fn().mockResolvedValue(undefined),
      });

      const result = await browserPoolManager.focusElement({
        browserId,
        selector: "#input",
      });

      expect(result).toMatchObject({
        success: true,
        selector: "#input",
        focused: expect.anything(), // Can be boolean or string depending on implementation
      });
    });

    it("should select option successfully", async () => {
      mockPage.locator.mockReturnValue({
        waitFor: vi.fn().mockResolvedValue(undefined),
        selectOption: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue("option1"),
      });

      const result = await browserPoolManager.selectOption({
        browserId,
        selector: "#select",
        value: "option1",
      });

      expect(result).toMatchObject({
        success: true,
        selector: "#select",
        selectedValue: "option1",
      });
    });

    it("should clear element successfully", async () => {
      mockPage.locator.mockReturnValue({
        waitFor: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue("previous value"),
      });

      const result = await browserPoolManager.clearElement({
        browserId,
        selector: "#input",
      });

      expect(result).toMatchObject({
        success: true,
        selector: "#input",
        cleared: true,
      });
    });

    it("should perform drag and drop successfully", async () => {
      mockPage.locator.mockReturnValue({
        waitFor: vi.fn().mockResolvedValue(undefined),
        boundingBox: vi.fn().mockResolvedValue({ x: 100, y: 200, width: 50, height: 30 }),
      });

      const result = await browserPoolManager.dragAndDrop({
        browserId,
        sourceSelector: "#source",
        targetSelector: "#target",
      });

      expect(result).toMatchObject({
        success: true,
        sourceSelector: "#source",
        targetSelector: "#target",
        dragCompleted: true,
      });
    });
  });

  describe("JavaScript execution", () => {
    let browserId: string;

    beforeEach(async () => {
      await browserPoolManager.initialize();

      (browserPoolManager as any).pool.allocate = vi.fn().mockResolvedValue({
        instance: mockInstance,
        page: mockPage,
        allocationTime: 50,
      });

      mockPage.evaluate.mockResolvedValue("Mozilla/5.0 Test");

      const result = await browserPoolManager.launchBrowser({
        browserType: "chromium",
        headless: true,
      });
      browserId = result.browserId;

      (browserPoolManager as any).sessions.set(browserId, {
        instance: mockInstance,
        page: mockPage,
        teamId: undefined,
      });
    });

    afterEach(async () => {
      await browserPoolManager.cleanup();
    });

    it("should execute script successfully", async () => {
      // Mock the jsExecutor
      const mockResult = { success: true, result: "script executed" };
      (browserPoolManager as any).jsExecutor.executeScript = vi.fn().mockResolvedValue(mockResult);

      const result = await browserPoolManager.executeScript({
        browserId,
        script: "console.log('test');",
      });

      expect(result).toEqual(mockResult);
    });

    it("should evaluate expression successfully", async () => {
      const mockResult = { success: true, result: 42 };
      (browserPoolManager as any).jsExecutor.evaluateExpression = vi
        .fn()
        .mockResolvedValue(mockResult);

      const result = await browserPoolManager.evaluateExpression({
        browserId,
        expression: "2 + 2",
      });

      expect(result).toEqual(mockResult);
    });

    it("should get console messages successfully", async () => {
      const mockResult = { success: true, messages: [] };
      (browserPoolManager as any).jsExecutor.getConsoleMessages = vi
        .fn()
        .mockResolvedValue(mockResult);

      const result = await browserPoolManager.getConsoleMessages({
        browserId,
      });

      expect(result).toEqual(mockResult);
    });

    it("should add script tag successfully", async () => {
      const mockResult = { success: true };
      (browserPoolManager as any).jsExecutor.addScriptTag = vi.fn().mockResolvedValue(mockResult);

      const result = await browserPoolManager.addScriptTag({
        browserId,
        content: "console.log('injected');",
      });

      expect(result).toEqual(mockResult);
    });
  });

  describe("CSS analysis", () => {
    let browserId: string;

    beforeEach(async () => {
      await browserPoolManager.initialize();

      (browserPoolManager as any).pool.allocate = vi.fn().mockResolvedValue({
        instance: mockInstance,
        page: mockPage,
        allocationTime: 50,
      });

      mockPage.evaluate.mockResolvedValue("Mozilla/5.0 Test");

      const result = await browserPoolManager.launchBrowser({
        browserType: "chromium",
        headless: true,
      });
      browserId = result.browserId;

      (browserPoolManager as any).sessions.set(browserId, {
        instance: mockInstance,
        page: mockPage,
        teamId: undefined,
      });
    });

    afterEach(async () => {
      await browserPoolManager.cleanup();
    });

    it("should extract CSS successfully", async () => {
      const mockResult = { success: true, styles: { color: "red" } };
      (browserPoolManager as any).cssAnalyzer.extractCSS = vi.fn().mockResolvedValue(mockResult);

      const result = await browserPoolManager.extractCSS({
        browserId,
        selector: ".element",
      });

      expect(result).toEqual(mockResult);
    });

    it("should get computed styles successfully", async () => {
      const mockResult = { success: true, styles: { display: "block" } };
      (browserPoolManager as any).cssAnalyzer.getComputedStyles = vi
        .fn()
        .mockResolvedValue(mockResult);

      const result = await browserPoolManager.getComputedStyles({
        browserId,
        selector: ".element",
      });

      expect(result).toEqual(mockResult);
    });

    it("should diff CSS successfully", async () => {
      const mockResult = { success: true, changes: [] };
      (browserPoolManager as any).cssAnalyzer.diffCSS = vi.fn().mockResolvedValue(mockResult);

      const result = await browserPoolManager.diffCSS({
        browserId,
        selector: ".element",
        baseline: { color: "blue" },
      });

      expect(result).toEqual(mockResult);
    });

    it("should analyze specificity successfully", async () => {
      const mockResult = { success: true, specificity: { a: 0, b: 1, c: 0 } };
      (browserPoolManager as any).cssAnalyzer.analyzeSpecificity = vi
        .fn()
        .mockResolvedValue(mockResult);

      const result = await browserPoolManager.analyzeSpecificity({
        browserId,
        selector: ".element",
      });

      expect(result).toEqual(mockResult);
    });
  });

  describe("content extraction", () => {
    let browserId: string;

    beforeEach(async () => {
      await browserPoolManager.initialize();

      (browserPoolManager as any).pool.allocate = vi.fn().mockResolvedValue({
        instance: mockInstance,
        page: mockPage,
        allocationTime: 50,
      });

      mockPage.evaluate.mockResolvedValue("Mozilla/5.0 Test");

      const result = await browserPoolManager.launchBrowser({
        browserType: "chromium",
        headless: true,
      });
      browserId = result.browserId;

      (browserPoolManager as any).sessions.set(browserId, {
        instance: mockInstance,
        page: mockPage,
        teamId: undefined,
      });
    });

    afterEach(async () => {
      await browserPoolManager.cleanup();
    });

    it("should get HTML successfully", async () => {
      const mockResult = { success: true, html: "<div>test</div>" };
      (browserPoolManager as any).contentExtractor.getHtml = vi.fn().mockResolvedValue(mockResult);

      const result = await browserPoolManager.getHtml({
        browserId,
        selector: ".content",
      });

      expect(result).toEqual(mockResult);
    });

    it("should get attribute successfully", async () => {
      const mockResult = { success: true, value: "test-value" };
      (browserPoolManager as any).contentExtractor.getAttribute = vi
        .fn()
        .mockResolvedValue(mockResult);

      const result = await browserPoolManager.getAttribute({
        browserId,
        selector: "#element",
        attribute: "data-value",
      });

      expect(result).toEqual(mockResult);
    });

    it("should get bounding box successfully", async () => {
      const mockResult = { success: true, boundingBox: { x: 100, y: 200, width: 50, height: 30 } };
      (browserPoolManager as any).contentExtractor.getBoundingBox = vi
        .fn()
        .mockResolvedValue(mockResult);

      const result = await browserPoolManager.getBoundingBox({
        browserId,
        selector: "#element",
      });

      expect(result).toEqual(mockResult);
    });

    it("should check visibility successfully", async () => {
      const mockResult = { success: true, visible: true };
      (browserPoolManager as any).contentExtractor.isVisible = vi
        .fn()
        .mockResolvedValue(mockResult);

      const result = await browserPoolManager.isVisible({
        browserId,
        selector: "#element",
      });

      expect(result).toEqual(mockResult);
    });

    it("should check enabled status successfully", async () => {
      const mockResult = { success: true, enabled: true };
      (browserPoolManager as any).contentExtractor.isEnabled = vi
        .fn()
        .mockResolvedValue(mockResult);

      const result = await browserPoolManager.isEnabled({
        browserId,
        selector: "#element",
      });

      expect(result).toEqual(mockResult);
    });

    it("should describe HTML successfully", async () => {
      const mockResult = { success: true, description: "A div element" };
      (browserPoolManager as any).contentExtractor.describeHtml = vi
        .fn()
        .mockResolvedValue(mockResult);

      const result = await browserPoolManager.describeHtml({
        browserId,
      });

      expect(result).toEqual(mockResult);
    });
  });

  describe("advanced navigation", () => {
    let browserId: string;

    beforeEach(async () => {
      await browserPoolManager.initialize();

      (browserPoolManager as any).pool.allocate = vi.fn().mockResolvedValue({
        instance: mockInstance,
        page: mockPage,
        allocationTime: 50,
      });

      mockPage.evaluate.mockResolvedValue("Mozilla/5.0 Test");

      const result = await browserPoolManager.launchBrowser({
        browserType: "chromium",
        headless: true,
      });
      browserId = result.browserId;

      (browserPoolManager as any).sessions.set(browserId, {
        instance: mockInstance,
        page: mockPage,
        teamId: undefined,
      });
    });

    afterEach(async () => {
      await browserPoolManager.cleanup();
    });

    it("should navigate back successfully", async () => {
      mockPage.goBack.mockResolvedValue(undefined);
      mockPage.url.mockReturnValue("https://previous.com");

      const result = await browserPoolManager.goBack({
        browserId,
      });

      expect(result).toMatchObject({
        browserId,
        status: "navigated_back",
        url: "https://previous.com",
      });
    });

    it("should generate selector successfully", async () => {
      const mockResult = { success: true, selector: "#generated-selector" };
      (browserPoolManager as any).selectorGenerator.generateSelector = vi
        .fn()
        .mockResolvedValue(mockResult);

      const result = await browserPoolManager.generateSelector({
        browserId,
        description: "the red button",
      });

      expect(result).toEqual(mockResult);
    });
  });

  describe("PDF rendering", () => {
    let browserId: string;

    beforeEach(async () => {
      await browserPoolManager.initialize();

      (browserPoolManager as any).pool.allocate = vi.fn().mockResolvedValue({
        instance: mockInstance,
        page: mockPage,
        allocationTime: 50,
      });

      mockPage.evaluate.mockResolvedValue("Mozilla/5.0 Test");

      const result = await browserPoolManager.launchBrowser({
        browserType: "chromium",
        headless: true,
      });
      browserId = result.browserId;

      (browserPoolManager as any).sessions.set(browserId, {
        instance: mockInstance,
        page: mockPage,
        teamId: undefined,
      });
    });

    afterEach(async () => {
      await browserPoolManager.cleanup();
    });

    it("should handle PDF file not found", async () => {
      // Mock existsSync to return false
      const { existsSync } = await import("node:fs");
      (existsSync as any).mockReturnValue(false);

      await expect(
        browserPoolManager.renderPdf({
          browserId,
          pdfPath: "/nonexistent/file.pdf",
        }),
      ).rejects.toThrow("PDF file not found");
    });
  });

  it("should render PDF successfully", async () => {
    await browserPoolManager.initialize();

    const launchResult = await browserPoolManager.launchBrowser({
      browserType: "chromium",
      headless: true,
    });
    const browserId = launchResult.browserId;

    // Mock existsSync
    const { existsSync } = await import("node:fs");
    (existsSync as any).mockReturnValue(true);

    // Mock LocalHttpServer using the already mocked module
    const { LocalHttpServer } = await import("./utilities/local-http-server.js");
    const mockHttpServer = {
      servePdfWithViewer: vi.fn().mockResolvedValue({ url: "http://localhost:8080/pdf" }),
    };
    (LocalHttpServer.getInstance as any).mockResolvedValue(mockHttpServer);

    mockPage.goto.mockResolvedValue(undefined);
    mockPage.waitForFunction.mockResolvedValue(undefined);
    mockPage.evaluate.mockResolvedValue({
      pageCount: 5,
      currentPage: 1,
      hasTextLayer: true,
    });

    const result = await browserPoolManager.renderPdf({
      browserId,
      pdfPath: "/path/to/test.pdf",
    });

    expect(result).toMatchObject({
      success: true,
      message: expect.stringContaining("PDF rendered"),
      pageCount: 5,
      currentPage: 1,
    });

    // Verify the mock was called properly
    expect(mockHttpServer.servePdfWithViewer).toHaveBeenCalledWith("/path/to/test.pdf");
  });

  it("should handle PDF file not found", async () => {
    await browserPoolManager.initialize();

    const launchResult = await browserPoolManager.launchBrowser({
      browserType: "chromium",
      headless: true,
    });
    const browserId = launchResult.browserId;

    // Mock existsSync in the node:fs module to return false
    const { existsSync } = await import("node:fs");
    (existsSync as any).mockReturnValue(false);

    // Ensure LocalHttpServer mock doesn't interfere with the file check
    const { LocalHttpServer } = await import("./utilities/local-http-server.js");
    const mockHttpServer = {
      servePdfWithViewer: vi.fn().mockResolvedValue({ url: "http://localhost:8080/pdf" }),
    };
    (LocalHttpServer.getInstance as any).mockResolvedValue(mockHttpServer);

    await expect(
      browserPoolManager.renderPdf({
        browserId,
        pdfPath: "/nonexistent/file.pdf",
      }),
    ).rejects.toThrow("PDF file not found");
  });

  describe("error handling", () => {
    it("should handle browser launch with invalid browser type", async () => {
      await browserPoolManager.initialize();

      // The manager doesn't validate browser types - it passes them through
      const result = await browserPoolManager.launchBrowser({
        browserType: "invalid" as any,
        headless: true,
      });

      expect(result).toHaveProperty("browserId");
      expect(result.browserType).toBe("invalid");
    });

    it("should handle navigation with invalid URL", async () => {
      await browserPoolManager.initialize();

      (browserPoolManager as any).pool.allocate = vi.fn().mockResolvedValue({
        instance: mockInstance,
        page: mockPage,
        allocationTime: 50,
      });

      mockPage.evaluate.mockResolvedValue("Mozilla/5.0 Test");

      const result = await browserPoolManager.launchBrowser({
        browserType: "chromium",
        headless: true,
      });
      const browserId = result.browserId;

      (browserPoolManager as any).sessions.set(browserId, {
        instance: mockInstance,
        page: mockPage,
        teamId: undefined,
      });

      await expect(
        browserPoolManager.navigate({
          browserId,
          url: "invalid-url",
        }),
      ).rejects.toThrow("Invalid URL");
    });

    it("should handle screenshot with invalid browser", async () => {
      await browserPoolManager.initialize();

      await expect(
        browserPoolManager.screenshot({
          browserId: "non-existent",
          fullPage: true,
        }),
      ).rejects.toThrow("Browser session not found");
    });
  });
});
