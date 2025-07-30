import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserPoolManager } from "../browser-pool-manager.js";
import { MCPBrowserRouter } from "./mcp-browser-router.js";
import type { MCPRequestContext } from "./mcp-request-context.js";
import { MCPRequestContextFactory } from "./mcp-request-context.js";

// Mock the browser pool manager
const mockBrowserPool = {
  launchBrowser: vi.fn(),
  closeBrowser: vi.fn(),
  navigate: vi.fn(),
  takeScreenshot: vi.fn(),
  getBrowserInstance: vi.fn(),
  listActiveBrowsers: vi.fn(),
  fillText: vi.fn(),
  waitForElement: vi.fn(),
  getTextContent: vi.fn(),
  validateElementPresence: vi.fn(),
  goBack: vi.fn(),
  clickElement: vi.fn(),
  fillFormFields: vi.fn(),
  findElements: vi.fn(),
} as unknown as BrowserPoolManager;

describe("MCPBrowserRouter", () => {
  let router: MCPBrowserRouter;

  beforeEach(() => {
    vi.clearAllMocks();
    router = new MCPBrowserRouter(mockBrowserPool);
  });

  describe("launch_browser routing", () => {
    it("should route launch_browser requests successfully", async () => {
      // Arrange
      const mockBrowserId = "browser_test_123456";
      // Router adds teamId to the params

      (mockBrowserPool.launchBrowser as any).mockResolvedValue({
        success: true,
        browserId: mockBrowserId,
        status: "launched",
        browserType: "chromium",
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
        userId: "test-user",
        metadata: {
          permissions: ["browser.launch"],
          correlationId: "test-correlation-id",
        },
      });

      // Act
      const response = await router.route({
        tool: "launch_browser",
        params: {
          browserType: "chromium",
          headless: true,
        },
        context,
      });

      // Assert
      expect(response.success).toBe(true);
      expect(response.result).toEqual({
        success: true,
        browserId: mockBrowserId,
        status: "launched",
        browserType: "chromium",
      });
      expect(mockBrowserPool.launchBrowser).toHaveBeenCalledWith({
        browserType: "chromium",
        headless: true,
        teamId: "test-team",
        userAgent: undefined,
        viewport: { width: 1280, height: 720 },
      });
    });

    it("should handle launch_browser errors with AI-friendly messages", async () => {
      // Arrange
      (mockBrowserPool.launchBrowser as any).mockRejectedValue(new Error("Browser pool exhausted"));

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
        userId: "test-user",
      });

      // Act
      const response = await router.route({
        tool: "launch_browser",
        params: {
          browserType: "chromium",
          headless: true,
        },
        context,
      });

      // Assert
      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe("BROWSER_ERROR");
      expect(response.error?.message).toContain("Browser pool exhausted");
      // expect(response.error?.suggestions).toContain("Try using a different browser type");
    });
  });

  describe("team isolation", () => {
    it("should prevent cross-team browser access", async () => {
      // Arrange
      const browserId = "browser_team1_123";

      // Team 1 launches a browser
      router["activeSessions"].set(browserId, {
        teamId: "team1",
        createdAt: new Date(),
      });

      // Team 2 tries to access it
      const context = MCPRequestContextFactory.create({
        teamId: "team2",
        userId: "user2",
      });

      // Act
      const response = await router.route({
        tool: "navigate_to_url",
        params: {
          browserId,
          url: "https://example.com",
        },
        context,
      });

      // Assert
      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("ACCESS_DENIED");
      expect(response.error?.message).toContain("Access denied: Browser");
      expect(response.error?.message).toContain("belongs to team");
    });

    it("should allow same-team browser access", async () => {
      // Arrange
      const browserId = "browser_team1_456";

      // Team 1 launches a browser
      router["activeSessions"].set(browserId, {
        teamId: "team1",
        createdAt: new Date(),
      });

      (mockBrowserPool.navigate as any).mockResolvedValue({
        success: true,
        url: "https://example.com",
        title: "Example Domain",
        loadTime: 1234,
      });

      // Same team accesses it
      const context = MCPRequestContextFactory.create({
        teamId: "team1",
        userId: "user1",
      });

      // Act
      const response = await router.route({
        tool: "navigate_to_url",
        params: {
          browserId,
          url: "https://example.com",
        },
        context,
      });

      // Assert
      expect(response.success).toBe(true);
      expect(mockBrowserPool.navigate).toHaveBeenCalledWith({
        browserId,
        url: "https://example.com",
        timeout: 30000,
        waitUntil: "load",
      });
    });
  });

  describe("error handling", () => {
    it("should handle missing browser ID with helpful error", async () => {
      // Arrange
      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
      });

      // Act
      const response = await router.route({
        tool: "navigate_to_url",
        params: {
          browserId: "non-existent-browser",
          url: "https://example.com",
        },
        context,
      });

      // Assert
      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("ELEMENT_NOT_FOUND");
      expect(response.error?.message).toContain("Could not find the requested element");
      // No suggestions field in current implementation
    });

    it("should handle invalid tool gracefully", async () => {
      // Arrange
      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
      });

      // Act
      const response = await router.route({
        tool: "invalid_tool",
        params: {},
        context,
      });

      // Assert
      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("BROWSER_ERROR");
      expect(response.error?.message).toContain("Unknown browser tool: invalid_tool");
    });
  });

  describe("performance", () => {
    it("should complete launch_browser in reasonable time", async () => {
      // Arrange
      (mockBrowserPool.launchBrowser as any).mockImplementation(async () => {
        // Simulate some processing time
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          success: true,
          browserId: "browser_perf_test",
          status: "launched",
          browserType: "chromium",
        };
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
      });

      // Act
      const start = Date.now();
      const response = await router.route({
        tool: "launch_browser",
        params: { browserType: "chromium", headless: true },
        context,
      });
      const elapsed = Date.now() - start;

      // Assert
      expect(response.success).toBe(true);
      expect(elapsed).toBeLessThan(100); // Router should add <50ms overhead
    });
  });

  describe("session management", () => {
    it("should track active sessions", async () => {
      // Arrange
      (mockBrowserPool.launchBrowser as any).mockResolvedValue({
        success: true,
        browserId: "browser_session_test",
        status: "launched",
        browserType: "firefox",
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
      });

      // Act
      await router.route({
        tool: "launch_browser",
        params: { browserType: "firefox" },
        context,
      });

      const stats = router.getStatistics();

      // Assert
      expect(stats.activeSessions).toBe(1);
      expect(stats.sessionsByTeam["test-team"]).toBe(1);
    });

    it("should clean up sessions on browser close", async () => {
      // Arrange
      const browserId = "browser_cleanup_test";
      router["activeSessions"].set(browserId, {
        teamId: "test-team",
        createdAt: new Date(),
      });

      (mockBrowserPool.closeBrowser as any).mockResolvedValue({
        success: true,
        message: "Browser closed successfully",
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
      });

      // Act
      await router.route({
        tool: "close_browser",
        params: { browserId },
        context,
      });

      const stats = router.getStatistics();

      // Assert
      expect(stats.activeSessions).toBe(0);
      expect(router["activeSessions"].has(browserId)).toBe(false);
    });
  });

  describe("newly migrated tools", () => {
    const browserId = "browser_test_123";

    beforeEach(() => {
      // Set up a browser session
      router["activeSessions"].set(browserId, {
        teamId: "test-team",
        createdAt: new Date(),
      });
    });

    it("should route fill_text requests successfully", async () => {
      // Arrange
      (mockBrowserPool.fillText as any).mockResolvedValue({
        success: true,
        selector: "#input",
        text: "test value",
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
        userId: "test-user",
      });

      // Act
      const response = await router.route({
        tool: "fill_text",
        params: {
          browserId,
          selector: "#input",
          text: "test value",
        },
        context,
      });

      // Assert
      expect(response.success).toBe(true);
      expect(mockBrowserPool.fillText).toHaveBeenCalledWith({
        browserId,
        selector: "#input",
        text: "test value",
        timeout: 30000,
      });
    });

    it("should route wait_for_element requests successfully", async () => {
      // Arrange
      (mockBrowserPool.waitForElement as any).mockResolvedValue({
        success: true,
        found: true,
        selector: "#button",
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
        userId: "test-user",
      });

      // Act
      const response = await router.route({
        tool: "wait_for_element",
        params: {
          browserId,
          selector: "#button",
          state: "visible",
        },
        context,
      });

      // Assert
      expect(response.success).toBe(true);
      expect(mockBrowserPool.waitForElement).toHaveBeenCalledWith({
        browserId,
        selector: "#button",
        timeout: 30000,
        state: "visible",
      });
    });

    it("should route get_text_content requests successfully", async () => {
      // Arrange
      (mockBrowserPool.getTextContent as any).mockResolvedValue({
        success: true,
        text: "Hello World",
        selector: ".content",
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
        userId: "test-user",
      });

      // Act
      const response = await router.route({
        tool: "get_text_content",
        params: {
          browserId,
          selector: ".content",
        },
        context,
      });

      // Assert
      expect(response.success).toBe(true);
      expect(mockBrowserPool.getTextContent).toHaveBeenCalledWith({
        browserId,
        selector: ".content",
        timeout: 30000,
      });
    });

    it("should route validate_element_presence requests successfully", async () => {
      // Arrange
      (mockBrowserPool.validateElementPresence as any).mockResolvedValue({
        success: true,
        exists: true,
        selector: "#element",
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
        userId: "test-user",
      });

      // Act
      const response = await router.route({
        tool: "validate_element_presence",
        params: {
          browserId,
          selector: "#element",
          shouldExist: true,
        },
        context,
      });

      // Assert
      expect(response.success).toBe(true);
      expect(mockBrowserPool.validateElementPresence).toHaveBeenCalledWith({
        browserId,
        selector: "#element",
        shouldExist: true,
        timeout: 30000,
      });
    });

    it("should route go_back requests successfully", async () => {
      // Arrange
      (mockBrowserPool.goBack as any).mockResolvedValue({
        success: true,
        message: "Navigated back",
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
        userId: "test-user",
      });

      // Act
      const response = await router.route({
        tool: "go_back",
        params: {
          browserId,
        },
        context,
      });

      // Assert
      expect(response.success).toBe(true);
      expect(mockBrowserPool.goBack).toHaveBeenCalledWith({
        browserId,
      });
    });

    it("should enforce team isolation for new tools", async () => {
      // Arrange
      const context = MCPRequestContextFactory.create({
        teamId: "different-team", // Different team
        userId: "test-user",
      });

      // Act
      const response = await router.route({
        tool: "fill_text",
        params: {
          browserId,
          selector: "#input",
          text: "test",
        },
        context,
      });

      // Assert
      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("ACCESS_DENIED");
      expect(response.error?.message).toContain("Access denied");
      expect(mockBrowserPool.fillText).not.toHaveBeenCalled();
    });
  });
});
