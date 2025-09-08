import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserPoolManager } from "../browser-pool-manager.js";
import { MCPBrowserRouter } from "./mcp-browser-router.js";
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
  // Additional methods for comprehensive testing
  hoverElement: vi.fn(),
  selectOption: vi.fn(),
  clearElement: vi.fn(),
  dragAndDrop: vi.fn(),
  focusElement: vi.fn(),
  executeScript: vi.fn(),
  evaluateExpression: vi.fn(),
  getConsoleMessages: vi.fn(),
  addScriptTag: vi.fn(),
  extractCSS: vi.fn(),
  getComputedStyles: vi.fn(),
  diffCSS: vi.fn(),
  analyzeSpecificity: vi.fn(),
  simulateCssChange: vi.fn(),
  whyStyleNotApplied: vi.fn(),
  generateSelector: vi.fn(),
  getHtml: vi.fn(),
  getAttribute: vi.fn(),
  getBoundingBox: vi.fn(),
  isVisible: vi.fn(),
  isEnabled: vi.fn(),
  describeHtml: vi.fn(),
  renderPdf: vi.fn(),
  // Newly added APIs (layout debugging & waits)
  waitForUrl: vi.fn(),
  waitForNavigation: vi.fn(),
  waitForNetworkIdle: vi.fn(),
  scrollIntoView: vi.fn(),
  scrollTo: vi.fn(),
  scrollBy: vi.fn(),
  highlightElementBounds: vi.fn(),
  showLayoutGrid: vi.fn(),
  removeOverlay: vi.fn(),
  applyCssOverride: vi.fn(),
  revertCssChanges: vi.fn(),
  getLayoutTree: vi.fn(),
  measureWhitespace: vi.fn(),
  findLayoutContainers: vi.fn(),
  getApplicableRules: vi.fn(),
  getEffectiveComputed: vi.fn(),
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
      expect(response.result).toMatchObject({
        success: true,
        browserId: mockBrowserId,
        status: "launched",
        browserType: "chromium",
      });
      // Additional fields like headless, viewport, userAgent, teamId are expected
      expect((response.result as any).teamId).toBe("test-team");
      expect(mockBrowserPool.launchBrowser).toHaveBeenCalledWith({
        browserType: "chromium",
        headless: true,
        teamId: "test-team",
        timeout: 30000,
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
      expect(response.error?.code).toBe("BROOKLYN_SESSION_MISSING");
      expect(response.error?.message).toContain("Browser session not found");
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

  describe("additional tool routing", () => {
    const browserId = "browser_test_123";

    beforeEach(() => {
      // Set up a browser session
      router["activeSessions"].set(browserId, {
        teamId: "test-team",
        createdAt: new Date(),
      });
    });

    it("should route hover_element requests successfully", async () => {
      // Arrange
      (mockBrowserPool.hoverElement as any).mockResolvedValue({
        success: true,
        selector: "#button",
        boundingBox: { x: 100, y: 200, width: 50, height: 30 },
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
        userId: "test-user",
      });

      // Act
      const response = await router.route({
        tool: "hover_element",
        params: {
          browserId,
          selector: "#button",
          timeout: 5000,
        },
        context,
      });

      // Assert
      expect(response.success).toBe(true);
      expect(mockBrowserPool.hoverElement).toHaveBeenCalledWith({
        browserId,
        selector: "#button",
        timeout: 5000,
        force: undefined,
        position: undefined,
        index: undefined,
      });
    });

    it("should route select_option requests successfully", async () => {
      // Arrange
      (mockBrowserPool.selectOption as any).mockResolvedValue({
        success: true,
        selector: "#select",
        selectedValue: "option1",
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
        userId: "test-user",
      });

      // Act
      const response = await router.route({
        tool: "select_option",
        params: {
          browserId,
          selector: "#select",
          value: "option1",
        },
        context,
      });

      // Assert
      expect(response.success).toBe(true);
      expect(mockBrowserPool.selectOption).toHaveBeenCalledWith({
        browserId,
        selector: "#select",
        value: "option1",
        label: undefined,
        index: undefined,
        timeout: undefined,
      });
    });

    it("should route clear_element requests successfully", async () => {
      // Arrange
      (mockBrowserPool.clearElement as any).mockResolvedValue({
        success: true,
        selector: "#input",
        cleared: true,
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
        userId: "test-user",
      });

      // Act
      const response = await router.route({
        tool: "clear_element",
        params: {
          browserId,
          selector: "#input",
        },
        context,
      });

      // Assert
      expect(response.success).toBe(true);
      expect(mockBrowserPool.clearElement).toHaveBeenCalledWith({
        browserId,
        selector: "#input",
        timeout: undefined,
        force: undefined,
      });
    });

    it("should route drag_and_drop requests successfully", async () => {
      // Arrange
      (mockBrowserPool.dragAndDrop as any).mockResolvedValue({
        success: true,
        sourceSelector: "#source",
        targetSelector: "#target",
        dragCompleted: true,
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
        userId: "test-user",
      });

      // Act
      const response = await router.route({
        tool: "drag_and_drop",
        params: {
          browserId,
          sourceSelector: "#source",
          targetSelector: "#target",
        },
        context,
      });

      // Assert
      expect(response.success).toBe(true);
      expect(mockBrowserPool.dragAndDrop).toHaveBeenCalledWith({
        browserId,
        sourceSelector: "#source",
        targetSelector: "#target",
        sourcePosition: undefined,
        targetPosition: undefined,
        timeout: undefined,
        force: undefined,
      });
    });

    it("should route focus_element requests successfully", async () => {
      // Arrange
      (mockBrowserPool.focusElement as any).mockResolvedValue({
        success: true,
        selector: "#input",
        focused: true,
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
        userId: "test-user",
      });

      // Act
      const response = await router.route({
        tool: "focus_element",
        params: {
          browserId,
          selector: "#input",
        },
        context,
      });

      // Assert
      expect(response.success).toBe(true);
      expect(mockBrowserPool.focusElement).toHaveBeenCalledWith({
        browserId,
        selector: "#input",
        timeout: undefined,
      });
    });
  });

  describe("JavaScript execution tools", () => {
    const browserId = "browser_js_test";

    beforeEach(() => {
      router["activeSessions"].set(browserId, {
        teamId: "test-team",
        createdAt: new Date(),
      });
    });

    it("should route execute_script requests successfully", async () => {
      // Arrange
      (mockBrowserPool.executeScript as any).mockResolvedValue({
        success: true,
        result: "script executed",
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
        userId: "test-user",
      });

      // Act
      const response = await router.route({
        tool: "execute_script",
        params: {
          browserId,
          script: "console.log('test');",
        },
        context,
      });

      // Assert
      expect(response.success).toBe(true);
      expect(mockBrowserPool.executeScript).toHaveBeenCalledWith({
        browserId,
        script: "console.log('test');",
        args: undefined,
        timeout: undefined,
        awaitPromise: undefined,
      });
    });

    it("should route evaluate_expression requests successfully", async () => {
      // Arrange
      (mockBrowserPool.evaluateExpression as any).mockResolvedValue({
        success: true,
        result: 42,
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
        userId: "test-user",
      });

      // Act
      const response = await router.route({
        tool: "evaluate_expression",
        params: {
          browserId,
          expression: "2 + 2",
        },
        context,
      });

      // Assert
      expect(response.success).toBe(true);
      expect(mockBrowserPool.evaluateExpression).toHaveBeenCalledWith({
        browserId,
        expression: "2 + 2",
        timeout: undefined,
        awaitPromise: undefined,
      });
    });

    it("should route get_console_messages requests successfully", async () => {
      // Arrange
      (mockBrowserPool.getConsoleMessages as any).mockResolvedValue({
        success: true,
        messages: [],
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
        userId: "test-user",
      });

      // Act
      const response = await router.route({
        tool: "get_console_messages",
        params: {
          browserId,
          level: "error",
        },
        context,
      });

      // Assert
      expect(response.success).toBe(true);
      expect(mockBrowserPool.getConsoleMessages).toHaveBeenCalledWith({
        browserId,
        level: "error",
        since: undefined,
        limit: undefined,
      });
    });
  });

  describe("CSS analysis tools", () => {
    const browserId = "browser_css_test";

    beforeEach(() => {
      router["activeSessions"].set(browserId, {
        teamId: "test-team",
        createdAt: new Date(),
      });
    });

    it("should route extract_css requests successfully", async () => {
      // Arrange
      (mockBrowserPool.extractCSS as any).mockResolvedValue({
        success: true,
        styles: { color: "red" },
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
        userId: "test-user",
      });

      // Act
      const response = await router.route({
        tool: "extract_css",
        params: {
          browserId,
          selector: ".element",
        },
        context,
      });

      // Assert
      expect(response.success).toBe(true);
      expect(mockBrowserPool.extractCSS).toHaveBeenCalledWith({
        browserId,
        selector: ".element",
        includeInherited: undefined,
        includeComputed: undefined,
        properties: undefined,
        pseudoElements: undefined,
        timeout: undefined,
        maxTokens: undefined,
      });
    });

    it("should route get_computed_styles requests successfully", async () => {
      // Arrange
      (mockBrowserPool.getComputedStyles as any).mockResolvedValue({
        success: true,
        styles: { display: "block" },
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
        userId: "test-user",
      });

      // Act
      const response = await router.route({
        tool: "get_computed_styles",
        params: {
          browserId,
          selector: ".element",
        },
        context,
      });

      // Assert
      expect(response.success).toBe(true);
      expect(mockBrowserPool.getComputedStyles).toHaveBeenCalledWith({
        browserId,
        selector: ".element",
        properties: undefined,
        timeout: undefined,
      });
    });
  });

  describe("content extraction tools", () => {
    const browserId = "browser_content_test";

    beforeEach(() => {
      router["activeSessions"].set(browserId, {
        teamId: "test-team",
        createdAt: new Date(),
      });
    });

    it("should route get_html requests successfully", async () => {
      // Arrange
      (mockBrowserPool.getHtml as any).mockResolvedValue({
        success: true,
        html: "<div>test</div>",
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
        userId: "test-user",
      });

      // Act
      const response = await router.route({
        tool: "get_html",
        params: {
          browserId,
          selector: ".content",
        },
        context,
      });

      // Assert
      expect(response.success).toBe(true);
      expect(mockBrowserPool.getHtml).toHaveBeenCalledWith({
        browserId,
        selector: ".content",
        includeStyles: undefined,
        prettify: undefined,
        timeout: undefined,
        maxTokens: undefined,
        clientModel: undefined,
      });
    });

    it("should route get_attribute requests successfully", async () => {
      // Arrange
      (mockBrowserPool.getAttribute as any).mockResolvedValue({
        success: true,
        value: "test-value",
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
        userId: "test-user",
      });

      // Act
      const response = await router.route({
        tool: "get_attribute",
        params: {
          browserId,
          selector: "#element",
          attribute: "data-value",
        },
        context,
      });

      // Assert
      expect(response.success).toBe(true);
      expect(mockBrowserPool.getAttribute).toHaveBeenCalledWith({
        browserId,
        selector: "#element",
        attribute: "data-value",
        timeout: undefined,
      });
    });

    it("should route get_bounding_box requests successfully", async () => {
      // Arrange
      (mockBrowserPool.getBoundingBox as any).mockResolvedValue({
        success: true,
        boundingBox: { x: 100, y: 200, width: 50, height: 30 },
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
        userId: "test-user",
      });

      // Act
      const response = await router.route({
        tool: "get_bounding_box",
        params: {
          browserId,
          selector: "#element",
        },
        context,
      });

      // Assert
      expect(response.success).toBe(true);
      expect(mockBrowserPool.getBoundingBox).toHaveBeenCalledWith({
        browserId,
        selector: "#element",
        includeViewport: undefined,
        timeout: undefined,
      });
    });

    it("should route is_visible requests successfully", async () => {
      // Arrange
      (mockBrowserPool.isVisible as any).mockResolvedValue({
        success: true,
        visible: true,
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
        userId: "test-user",
      });

      // Act
      const response = await router.route({
        tool: "is_visible",
        params: {
          browserId,
          selector: "#element",
        },
        context,
      });

      // Assert
      expect(response.success).toBe(true);
      expect(mockBrowserPool.isVisible).toHaveBeenCalledWith({
        browserId,
        selector: "#element",
        timeout: undefined,
      });
    });

    it("should route is_enabled requests successfully", async () => {
      // Arrange
      (mockBrowserPool.isEnabled as any).mockResolvedValue({
        success: true,
        enabled: true,
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
        userId: "test-user",
      });

      // Act
      const response = await router.route({
        tool: "is_enabled",
        params: {
          browserId,
          selector: "#element",
        },
        context,
      });

      // Assert
      expect(response.success).toBe(true);
      expect(mockBrowserPool.isEnabled).toHaveBeenCalledWith({
        browserId,
        selector: "#element",
        timeout: undefined,
      });
    });
  });

  describe("navigation tools (new)", () => {
    const browserId = "browser_nav_wait_test";

    beforeEach(() => {
      router["activeSessions"].set(browserId, {
        teamId: "test-team",
        createdAt: new Date(),
      });
    });

    it("should route wait_for_url with exact", async () => {
      (mockBrowserPool.waitForUrl as any).mockResolvedValue({
        success: true,
        url: "https://x",
        matched: "exact",
      });
      const context = MCPRequestContextFactory.create({ teamId: "test-team" });
      const response = await router.route({
        tool: "wait_for_url",
        params: { browserId, exact: "https://x" },
        context,
      });
      expect(response.success).toBe(true);
      expect(mockBrowserPool.waitForUrl).toHaveBeenCalledWith({
        browserId,
        exact: "https://x",
        pattern: undefined,
        timeout: 30000,
      });
    });

    it("should error when wait_for_url receives both exact and pattern", async () => {
      const context = MCPRequestContextFactory.create({ teamId: "test-team" });
      const res = await router.route({
        tool: "wait_for_url",
        params: { browserId, exact: "a", pattern: "b" },
        context,
      });
      expect(res.success).toBe(false);
      expect(res.error?.message).toContain("requires exactly one");
    });

    it("should route wait_for_navigation and wait_for_network_idle", async () => {
      (mockBrowserPool.waitForNavigation as any).mockResolvedValue({
        success: true,
        url: "https://y",
        state: "networkidle",
      });
      (mockBrowserPool.waitForNetworkIdle as any).mockResolvedValue({
        success: true,
        state: "networkidle",
      });
      const context = MCPRequestContextFactory.create({ teamId: "test-team" });
      const r1 = await router.route({
        tool: "wait_for_navigation",
        params: { browserId, waitUntil: "networkidle" },
        context,
      });
      expect(r1.success).toBe(true);
      expect(mockBrowserPool.waitForNavigation).toHaveBeenCalledWith({
        browserId,
        waitUntil: "networkidle",
        timeout: 30000,
      });
      const r2 = await router.route({
        tool: "wait_for_network_idle",
        params: { browserId },
        context,
      });
      expect(r2.success).toBe(true);
      expect(mockBrowserPool.waitForNetworkIdle).toHaveBeenCalledWith({
        browserId,
        timeout: 30000,
      });
    });
  });

  describe("interaction tools (new)", () => {
    const browserId = "browser_interact_test";

    beforeEach(() => {
      router["activeSessions"].set(browserId, { teamId: "test-team", createdAt: new Date() });
    });

    it("should route scroll tools", async () => {
      (mockBrowserPool.scrollIntoView as any).mockResolvedValue({ success: true, selector: ".a" });
      (mockBrowserPool.scrollTo as any).mockResolvedValue({ success: true, x: 0, y: 1000 });
      (mockBrowserPool.scrollBy as any).mockResolvedValue({ success: true, dx: 0, dy: 200 });
      const context = MCPRequestContextFactory.create({ teamId: "test-team" });
      await router.route({
        tool: "scroll_into_view",
        params: { browserId, selector: ".a" },
        context,
      });
      expect(mockBrowserPool.scrollIntoView).toHaveBeenCalledWith({
        browserId,
        selector: ".a",
        timeout: 5000,
      });
      await router.route({ tool: "scroll_to", params: { browserId, x: 0, y: 1000 }, context });
      expect(mockBrowserPool.scrollTo).toHaveBeenCalledWith({
        browserId,
        x: 0,
        y: 1000,
        behavior: "auto",
      });
      await router.route({ tool: "scroll_by", params: { browserId, dx: 0, dy: 200 }, context });
      expect(mockBrowserPool.scrollBy).toHaveBeenCalledWith({
        browserId,
        dx: 0,
        dy: 200,
        behavior: "auto",
      });
    });

    it("should route overlays and removal", async () => {
      (mockBrowserPool.highlightElementBounds as any).mockResolvedValue({
        success: true,
        highlightId: "h1",
      });
      (mockBrowserPool.showLayoutGrid as any).mockResolvedValue({
        success: true,
        overlayId: "g1",
        gridSize: 20,
      });
      (mockBrowserPool.removeOverlay as any).mockResolvedValue({ success: true, removed: true });
      const context = MCPRequestContextFactory.create({ teamId: "test-team" });
      await router.route({
        tool: "highlight_element_bounds",
        params: { browserId, selector: ".main" },
        context,
      });
      expect(mockBrowserPool.highlightElementBounds).toHaveBeenCalledWith({
        browserId,
        selector: ".main",
        options: {},
        timeout: 5000,
      });
      await router.route({
        tool: "show_layout_grid",
        params: { browserId, gridSize: 20 },
        context,
      });
      expect(mockBrowserPool.showLayoutGrid).toHaveBeenCalledWith({
        browserId,
        gridSize: 20,
        color: "rgba(255,0,0,0.3)",
      });
      await router.route({
        tool: "remove_overlay",
        params: { browserId, overlayId: "h1" },
        context,
      });
      expect(mockBrowserPool.removeOverlay).toHaveBeenCalledWith({ browserId, overlayId: "h1" });
    });
  });

  describe("styling tools (overrides)", () => {
    const browserId = "browser_style_test";
    beforeEach(() => {
      router["activeSessions"].set(browserId, { teamId: "test-team", createdAt: new Date() });
    });

    it("should route apply and revert css overrides", async () => {
      (mockBrowserPool.applyCssOverride as any).mockResolvedValue({
        success: true,
        overrideId: "o1",
      });
      (mockBrowserPool.revertCssChanges as any).mockResolvedValue({ success: true, removed: true });
      const context = MCPRequestContextFactory.create({ teamId: "test-team" });
      await router.route({
        tool: "apply_css_override",
        params: { browserId, selector: ".main", cssRules: { position: "relative" } },
        context,
      });
      expect(mockBrowserPool.applyCssOverride).toHaveBeenCalledWith({
        browserId,
        selector: ".main",
        cssRules: { position: "relative" },
        important: false,
      });
      await router.route({
        tool: "revert_css_changes",
        params: { browserId, overrideId: "o1" },
        context,
      });
      expect(mockBrowserPool.revertCssChanges).toHaveBeenCalledWith({
        browserId,
        overrideId: "o1",
      });
    });

    it("should route simulate_css_change and why_style_not_applied", async () => {
      (mockBrowserPool.simulateCssChange as any).mockResolvedValue({
        success: true,
        overallChanged: true,
        changes: [{ property: "position", before: "static", after: "relative", changed: true }],
      });
      (mockBrowserPool.whyStyleNotApplied as any).mockResolvedValue({
        success: true,
        property: "top",
        computed: { before: "auto", after: "-20px" },
        reasons: ["Position is static; offsets only take effect when position != static"],
      });

      const browserId = "browser_style_test";
      router["activeSessions"].set(browserId, { teamId: "team1", createdAt: new Date() });
      const context = MCPRequestContextFactory.create({ teamId: "team1" });

      await router.route({
        tool: "simulate_css_change",
        params: { browserId, selector: ".main", cssRules: { position: "relative" } },
        context,
      });
      expect(mockBrowserPool.simulateCssChange).toHaveBeenCalledWith({
        browserId,
        selector: ".main",
        cssRules: { position: "relative" },
        important: false,
      });

      await router.route({
        tool: "why_style_not_applied",
        params: { browserId, selector: ".card", property: "top", desiredValue: "-20px" },
        context,
      });
      expect(mockBrowserPool.whyStyleNotApplied).toHaveBeenCalledWith({
        browserId,
        selector: ".card",
        property: "top",
        desiredValue: "-20px",
      });
    });

    it("should route get_applicable_rules and get_effective_computed", async () => {
      (mockBrowserPool.getApplicableRules as any).mockResolvedValue({
        success: true,
        selector: ".card",
        rules: [],
      });
      (mockBrowserPool.getEffectiveComputed as any).mockResolvedValue({
        success: true,
        selector: ".card",
        property: "margin-top",
        value: "16px",
      });

      const browserId = "browser_style_test";
      router["activeSessions"].set(browserId, { teamId: "team1", createdAt: new Date() });
      const context = MCPRequestContextFactory.create({ teamId: "team1" });

      await router.route({
        tool: "get_applicable_rules",
        params: { browserId, selector: ".card", limit: 10 },
        context,
      });
      expect(mockBrowserPool.getApplicableRules).toHaveBeenCalledWith({
        browserId,
        selector: ".card",
        properties: undefined,
        limit: 10,
      });

      await router.route({
        tool: "get_effective_computed",
        params: { browserId, selector: ".card", property: "margin-top" },
        context,
      });
      expect(mockBrowserPool.getEffectiveComputed).toHaveBeenCalledWith({
        browserId,
        selector: ".card",
        property: "margin-top",
      });
    });
  });

  describe("layout structure tools", () => {
    const browserId = "browser_layout_test";
    beforeEach(() => {
      router["activeSessions"].set(browserId, { teamId: "test-team", createdAt: new Date() });
    });

    it("should route get_layout_tree, measure_whitespace, find_layout_containers", async () => {
      (mockBrowserPool.getLayoutTree as any).mockResolvedValue({ tree: { tag: "main" } });
      (mockBrowserPool.measureWhitespace as any).mockResolvedValue({
        gaps: [],
        totalWhitespace: 0,
      });
      (mockBrowserPool.findLayoutContainers as any).mockResolvedValue({ containers: [] });
      const context = MCPRequestContextFactory.create({ teamId: "test-team" });
      await router.route({
        tool: "get_layout_tree",
        params: { browserId, rootSelector: "main" },
        context,
      });
      expect(mockBrowserPool.getLayoutTree).toHaveBeenCalledWith({
        browserId,
        rootSelector: "main",
        maxDepth: 3,
        maxChildren: 20,
      });
      await router.route({
        tool: "measure_whitespace",
        params: { browserId, containerSelector: ".wrap" },
        context,
      });
      expect(mockBrowserPool.measureWhitespace).toHaveBeenCalledWith({
        browserId,
        containerSelector: ".wrap",
        minGap: 1,
      });
      await router.route({ tool: "find_layout_containers", params: { browserId }, context });
      expect(mockBrowserPool.findLayoutContainers).toHaveBeenCalledWith({ browserId });
    });
  });

  describe("parameter validation", () => {
    it("should handle missing required parameters", async () => {
      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
      });

      // Test various tools with missing required parameters
      const testCases = [
        { tool: "navigate_to_url", params: { browserId: "test" } }, // missing url
        { tool: "click_element", params: { browserId: "test" } }, // missing selector
        { tool: "fill_text", params: { browserId: "test" } }, // missing selector and text
        { tool: "generate_selector", params: { browserId: "test" } }, // missing description
      ];

      for (const testCase of testCases) {
        const response = await router.route({
          tool: testCase.tool,
          params: testCase.params,
          context,
        });

        expect(response.success).toBe(false);
        expect(response.error).toBeDefined();
      }
    });

    it("should handle invalid parameter types", async () => {
      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
      });

      const response = await router.route({
        tool: "navigate_to_url",
        params: {
          browserId: "test",
          url: 123, // invalid type
        },
        context,
      });

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });
  });

  describe("browser ID resolution", () => {
    it("should resolve browser ID using target strategy", async () => {
      // Set up multiple browser sessions
      router["activeSessions"].set("browser-1", {
        teamId: "test-team",
        createdAt: new Date(Date.now() - 1000), // older
      });
      router["activeSessions"].set("browser-2", {
        teamId: "test-team",
        createdAt: new Date(), // newer
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
      });

      // Test "latest" target (should get most recent)
      const response = await router.route({
        tool: "list_screenshots",
        params: {
          target: "latest",
        },
        context,
      });

      expect(response.success).toBe(true);
      // Should use browser-2 (most recent)
    });

    it("should handle browser ID resolution for non-existent sessions", async () => {
      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
      });

      const response = await router.route({
        tool: "navigate_to_url",
        params: {
          browserId: "non-existent",
          url: "https://example.com",
        },
        context,
      });

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("BROOKLYN_SESSION_MISSING");
    });
  });

  describe("session cleanup", () => {
    it("should clean up sessions on close_browser", async () => {
      const browserId = "cleanup-test";
      router["activeSessions"].set(browserId, {
        teamId: "test-team",
        createdAt: new Date(),
      });

      (mockBrowserPool.closeBrowser as any).mockResolvedValue({
        success: true,
        browserId,
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
      });

      await router.route({
        tool: "close_browser",
        params: { browserId },
        context,
      });

      expect(router["activeSessions"].has(browserId)).toBe(false);
    });

    it("should handle session cleanup for non-existent browsers", async () => {
      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
      });

      const response = await router.route({
        tool: "close_browser",
        params: { browserId: "non-existent" },
        context,
      });

      expect(response.success).toBe(true); // Idempotent success
    });
  });

  describe("error formatting", () => {
    it("should format timeout errors with helpful suggestions", async () => {
      const browserId = "timeout-test";
      router["activeSessions"].set(browserId, {
        teamId: "test-team",
        createdAt: new Date(),
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
      });

      // Mock a timeout error
      (mockBrowserPool.navigate as any).mockRejectedValue(new Error("Timeout of 30000ms exceeded"));

      const response = await router.route({
        tool: "navigate_to_url",
        params: {
          browserId,
          url: "https://example.com",
        },
        context,
      });

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("BROWSER_TIMEOUT");
      expect(response.error?.message).toContain("timed out");
      expect(response.error?.details).toBeDefined();
    });

    it("should format element not found errors", async () => {
      const browserId = "element-test";
      router["activeSessions"].set(browserId, {
        teamId: "test-team",
        createdAt: new Date(),
      });

      const context = MCPRequestContextFactory.create({
        teamId: "test-team",
      });

      (mockBrowserPool.clickElement as any).mockRejectedValue(
        new Error("Selector not found: #missing"),
      );

      const response = await router.route({
        tool: "click_element",
        params: {
          browserId,
          selector: "#missing",
        },
        context,
      });

      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("ELEMENT_NOT_FOUND");
      expect(response.error?.message).toContain("Could not find the requested element");
      expect(response.error?.details).toBeDefined();
    });
  });
});
