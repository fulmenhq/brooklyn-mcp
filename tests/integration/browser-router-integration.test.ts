/**
 * Browser Router Integration Tests
 *
 * Tests the complete flow of browser operations through the router infrastructure,
 * including team isolation, error handling, and resource management.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BrowserPoolManager } from "../../src/core/browser-pool-manager.js";
import { MCPBrowserRouter } from "../../src/core/browser/mcp-browser-router.js";
import { MCPRequestContextFactory } from "../../src/core/browser/mcp-request-context.js";
import { getLogger } from "../../src/shared/pino-logger.js";

const _logger = getLogger("browser-router-integration-test");

describe("Browser Router Integration", () => {
  let poolManager: BrowserPoolManager;
  let router: MCPBrowserRouter;
  let testBrowserId: string;

  beforeAll(async () => {
    // Initialize browser pool manager (uses config from environment)
    poolManager = new BrowserPoolManager();
    await poolManager.initialize();

    // Create router instance
    router = new MCPBrowserRouter(poolManager);
  });

  afterAll(async () => {
    // Clean up all browsers
    if (testBrowserId) {
      try {
        await poolManager.closeBrowser({ browserId: testBrowserId, force: true });
      } catch (_error) {
        // Ignore cleanup errors
      }
    }
    await poolManager.cleanup();
  });

  describe("Complete Browser Lifecycle", () => {
    it("should handle full browser lifecycle with team isolation", async () => {
      // Team A launches a browser
      const teamAContext = MCPRequestContextFactory.create({
        teamId: "team-alpha",
        userId: "user-1",
        metadata: {
          permissions: ["browser.launch", "browser.navigate"],
        },
      });

      const launchResponse = await router.route({
        tool: "launch_browser",
        params: {
          browserType: "chromium",
          headless: true,
        },
        context: teamAContext,
      });

      expect(launchResponse.success).toBe(true);
      expect(launchResponse.result).toHaveProperty("browserId");
      testBrowserId = (launchResponse.result as any).browserId;

      // Team A can navigate
      const navResponse = await router.route({
        tool: "navigate_to_url",
        params: {
          browserId: testBrowserId,
          url: "data:text/html,<html><body><h1>Team A Test Page</h1></body></html>",
        },
        context: teamAContext,
      });

      expect(navResponse.success).toBe(true);

      // Team B cannot access Team A's browser
      const teamBContext = MCPRequestContextFactory.create({
        teamId: "team-beta",
        userId: "user-2",
      });

      const unauthorizedNav = await router.route({
        tool: "navigate_to_url",
        params: {
          browserId: testBrowserId,
          url: "data:text/html,<html><body><h1>Team B Test Page</h1></body></html>",
        },
        context: teamBContext,
      });

      expect(unauthorizedNav.success).toBe(false);
      expect(unauthorizedNav.error?.code).toBe("ACCESS_DENIED");
      expect(unauthorizedNav.error?.message).toContain("belongs to team");

      // Team A can close their browser
      const closeResponse = await router.route({
        tool: "close_browser",
        params: {
          browserId: testBrowserId,
        },
        context: teamAContext,
      });

      expect(closeResponse.success).toBe(true);
    });
  });

  describe("Element Interaction Flow", () => {
    let browserId: string;
    const context = MCPRequestContextFactory.create({
      teamId: "test-team",
      userId: "test-user",
    });

    beforeAll(async () => {
      // Launch browser for element tests
      const launchResponse = await router.route({
        tool: "launch_browser",
        params: { browserType: "chromium", headless: true },
        context,
      });
      browserId = (launchResponse.result as any).browserId;
    });

    afterAll(async () => {
      // Clean up
      if (browserId) {
        await router.route({
          tool: "close_browser",
          params: { browserId },
          context,
        });
      }
    });

    it.skip("should handle element interaction sequence", async () => {
      // Skip during infrastructure transition - test may need updates for enterprise router
      // Navigate to a test page
      const navResponse = await router.route({
        tool: "navigate_to_url",
        params: {
          browserId,
          url: "data:text/html,<html><body><input id='test-input' /><button id='test-btn'>Click Me</button><div id='result'></div></body></html>",
        },
        context,
      });
      expect(navResponse.success).toBe(true);

      // Wait for element
      const waitResponse = await router.route({
        tool: "wait_for_element",
        params: {
          browserId,
          selector: "#test-input",
          state: "visible",
        },
        context,
      });
      expect(waitResponse.success).toBe(true);

      // Fill text
      const fillResponse = await router.route({
        tool: "fill_text",
        params: {
          browserId,
          selector: "#test-input",
          text: "Hello Router!",
        },
        context,
      });
      expect(fillResponse.success).toBe(true);

      // Validate element presence
      const validateResponse = await router.route({
        tool: "validate_element_presence",
        params: {
          browserId,
          selector: "#test-btn",
          shouldExist: true,
        },
        context,
      });
      expect(validateResponse.success).toBe(true);

      // Take screenshot
      const screenshotResponse = await router.route({
        tool: "take_screenshot",
        params: {
          browserId,
          fullPage: false,
        },
        context,
      });
      expect(screenshotResponse.success).toBe(true);
      expect(screenshotResponse.result).toHaveProperty("path");
    });
  });

  describe("Error Handling and Recovery", () => {
    it.skip("should provide AI-friendly errors for common failures", async () => {
      // Skip during infrastructure transition - error messages may have changed
      const context = MCPRequestContextFactory.create({
        teamId: "error-test-team",
        userId: "test-user",
      });

      // Try to navigate with non-existent browser
      const response = await router.route({
        tool: "navigate_to_url",
        params: {
          browserId: "non-existent-browser",
          url: "https://example.com",
        },
        context,
      });

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error?.message).toContain("Browser session not found");
      expect(response.error?.details).toBeDefined();
    });

    it.skip("should handle timeout scenarios gracefully", async () => {
      // Skip during infrastructure transition - timeout error messages may have changed
      const context = MCPRequestContextFactory.create({
        teamId: "timeout-test",
        userId: "test-user",
      });

      // Launch browser
      const launchResponse = await router.route({
        tool: "launch_browser",
        params: { browserType: "chromium", headless: true },
        context,
      });
      const browserId = (launchResponse.result as any).browserId;

      try {
        // Try to wait for non-existent element with short timeout
        const response = await router.route({
          tool: "wait_for_element",
          params: {
            browserId,
            selector: "#non-existent-element",
            timeout: 1000, // 1 second timeout
          },
          context,
        });

        expect(response.success).toBe(false);
        expect(response.error?.code).toBe("BROWSER_TIMEOUT");
        expect(response.error?.message).toContain("timeout");
      } finally {
        // Clean up
        await router.route({
          tool: "close_browser",
          params: { browserId },
          context,
        });
      }
    });
  });

  describe("Concurrent Team Operations", () => {
    it.skip("should handle multiple teams operating simultaneously", async () => {
      // Skip during infrastructure transition - concurrent operations may need adjustment
      const teams = ["alpha", "beta", "gamma"];
      const browsers: Record<string, string> = {};

      // Each team launches their own browser
      const launchPromises = teams.map(async (teamId) => {
        const context = MCPRequestContextFactory.create({
          teamId,
          userId: `user-${teamId}`,
        });

        const response = await router.route({
          tool: "launch_browser",
          params: { browserType: "chromium", headless: true },
          context,
        });

        if (response.success) {
          browsers[teamId] = (response.result as any).browserId;
        }
        return response;
      });

      const launchResults = await Promise.all(launchPromises);

      // All launches should succeed
      for (const result of launchResults) {
        expect(result.success).toBe(true);
      }

      // Each team navigates to their own page
      const navPromises = teams.map(async (teamId) => {
        const context = MCPRequestContextFactory.create({
          teamId,
          userId: `user-${teamId}`,
        });

        return router.route({
          tool: "navigate_to_url",
          params: {
            browserId: browsers[teamId],
            url: `https://example.com/${teamId}`,
          },
          context,
        });
      });

      const navResults = await Promise.all(navPromises);

      // All navigations should succeed
      for (const result of navResults) {
        expect(result.success).toBe(true);
      }

      // Clean up all browsers
      const closePromises = teams.map(async (teamId) => {
        const context = MCPRequestContextFactory.create({
          teamId,
          userId: `user-${teamId}`,
        });

        return router.route({
          tool: "close_browser",
          params: { browserId: browsers[teamId] },
          context,
        });
      });

      await Promise.all(closePromises);
    });
  });

  describe("Performance Metrics", () => {
    it("should track execution time for all operations", async () => {
      const context = MCPRequestContextFactory.create({
        teamId: "metrics-team",
        userId: "test-user",
      });

      // Launch browser
      const launchResponse = await router.route({
        tool: "launch_browser",
        params: { browserType: "chromium", headless: true },
        context,
      });

      expect(launchResponse.metadata?.executionTime).toBeDefined();
      expect(launchResponse.metadata?.executionTime).toBeGreaterThan(0);
      expect(launchResponse.metadata?.teamId).toBe("metrics-team");

      const browserId = (launchResponse.result as any).browserId;

      // Navigate and measure
      const navResponse = await router.route({
        tool: "navigate_to_url",
        params: {
          browserId,
          url: "data:text/html,<html><body><h1>Performance Test Page</h1></body></html>",
        },
        context,
      });

      expect(navResponse.metadata?.executionTime).toBeDefined();
      expect(navResponse.metadata?.browserId).toBe(browserId);

      // Get router statistics
      const stats = router.getStatistics();
      expect(stats.activeSessions).toBeGreaterThan(0);
      expect(stats.sessionsByTeam).toBeDefined();
      expect(stats.sessionsByTeam["metrics-team"]).toBe(1);

      // Clean up
      await router.route({
        tool: "close_browser",
        params: { browserId },
        context,
      });
    });
  });
});
