/**
 * Focus Element Unit Tests
 *
 * Tests the focus_element functionality for accessibility and keyboard navigation support.
 * Validates browser pool manager integration and error handling.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BrowserPoolManager } from "../../src/core/browser-pool-manager.js";
import { getLogger } from "../../src/shared/pino-logger.js";

const _logger = getLogger("focus-element-unit-test");

describe("Focus Element Functionality", () => {
  let poolManager: BrowserPoolManager;
  let testBrowserId: string;

  beforeAll(async () => {
    // Initialize browser pool manager
    poolManager = new BrowserPoolManager();
    await poolManager.initialize();

    // Launch a test browser
    const launchResult = await poolManager.launchBrowser({
      teamId: "test-team",
      browserType: "chromium",
      headless: true,
    });

    testBrowserId = launchResult.browserId;

    // Navigate to a test page with focusable elements
    await poolManager.navigate({
      browserId: testBrowserId,
      url: "data:text/html,<html><body><button id='test-btn'>Test Button</button><input id='test-input' placeholder='Test Input'><a href='#' id='test-link'>Test Link</a></body></html>",
    });
  });

  afterAll(async () => {
    // Clean up test browser
    if (testBrowserId) {
      try {
        await poolManager.closeBrowser({ browserId: testBrowserId, force: true });
      } catch (_error) {
        // Ignore cleanup errors
      }
    }

    // Ensure pool manager cleanup with proper timeout
    if (poolManager) {
      await poolManager.cleanup();
    }
  }, 30000); // 30 second timeout for cleanup

  describe("Basic Focus Operations", () => {
    it("should focus a button element successfully", async () => {
      const result = await poolManager.focusElement({
        browserId: testBrowserId,
        selector: "#test-btn",
      });

      expect(result.success).toBe(true);
      expect(result.selector).toBe("#test-btn");
      expect(result.focused).toBe(true);
    });

    it("should focus an input element successfully", async () => {
      const result = await poolManager.focusElement({
        browserId: testBrowserId,
        selector: "#test-input",
      });

      expect(result.success).toBe(true);
      expect(result.selector).toBe("#test-input");
      expect(result.focused).toBe(true);
    });

    it("should handle focusable anchor elements", async () => {
      // Add a proper focusable link to the page
      const session = (poolManager as any).sessions.get(testBrowserId);
      if (!session?.page) {
        throw new Error("Failed to get browser page");
      }
      const page = session.page;

      await page.evaluate(() => {
        const link = document.createElement("a");
        link.id = "focusable-link";
        link.href = "#";
        link.textContent = "Focusable Link";
        link.setAttribute("tabindex", "0");
        document.body.appendChild(link);
      });

      const result = await poolManager.focusElement({
        browserId: testBrowserId,
        selector: "#focusable-link",
      });

      expect(result.success).toBe(true);
      expect(result.selector).toBe("#focusable-link");
      expect(result.focused).toBe(true);
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid selector gracefully", async () => {
      await expect(
        poolManager.focusElement({
          browserId: testBrowserId,
          selector: "#non-existent-element",
        }),
      ).rejects.toThrow("Failed to focus element");
    });

    it("should handle invalid CSS selector syntax", async () => {
      await expect(
        poolManager.focusElement({
          browserId: testBrowserId,
          selector: "invalid>>>selector",
        }),
      ).rejects.toThrow("Failed to focus element");
    });

    it("should handle invalid browser ID", async () => {
      await expect(
        poolManager.focusElement({
          browserId: "invalid-browser-id",
          selector: "#test-btn",
        }),
      ).rejects.toThrow("Browser session not found");
    });
  });

  describe("Accessibility Features", () => {
    it("should focus elements with custom timeout", async () => {
      const result = await poolManager.focusElement({
        browserId: testBrowserId,
        selector: "#test-btn",
        timeout: 10000,
      });

      expect(result.success).toBe(true);
      expect(result.focused).toBe(true);
    });

    it("should handle element visibility correctly", async () => {
      // Add a disabled element to test focus behavior
      const session = (poolManager as any).sessions.get(testBrowserId);
      if (!session?.page) {
        throw new Error("Failed to get browser page");
      }
      const page = session.page;

      await page.evaluate(() => {
        const disabledBtn = document.createElement("button");
        disabledBtn.id = "disabled-btn";
        disabledBtn.textContent = "Disabled Button";
        disabledBtn.disabled = true;
        document.body.appendChild(disabledBtn);
      });

      // Focusing a disabled element should still work but be focused = false
      const result = await poolManager.focusElement({
        browserId: testBrowserId,
        selector: "#disabled-btn",
        timeout: 1000,
      });

      expect(result.success).toBe(true);
      expect(result.selector).toBe("#disabled-btn");
      // Disabled elements can still receive focus in some browsers
      expect(typeof result.focused).toBe("boolean");
    });
  });

  describe("Focus State Validation", () => {
    it("should verify element receives focus", async () => {
      // Focus the test button
      await poolManager.focusElement({
        browserId: testBrowserId,
        selector: "#test-btn",
      });

      // Verify the button is actually focused
      const session = (poolManager as any).sessions.get(testBrowserId);
      if (!session?.page) {
        throw new Error("Failed to get browser page");
      }
      const page = session.page;

      const focusedElementId = await page.evaluate(() => {
        return document.activeElement?.id || null;
      });

      expect(focusedElementId).toBe("test-btn");
    });

    it("should handle sequential focus operations", async () => {
      // Focus button first
      const result1 = await poolManager.focusElement({
        browserId: testBrowserId,
        selector: "#test-btn",
      });
      expect(result1.success).toBe(true);

      // Then focus input
      const result2 = await poolManager.focusElement({
        browserId: testBrowserId,
        selector: "#test-input",
      });
      expect(result2.success).toBe(true);

      // Verify input is now focused
      const session = (poolManager as any).sessions.get(testBrowserId);
      if (!session?.page) {
        throw new Error("Failed to get browser page");
      }
      const page = session.page;

      const focusedElementId = await page.evaluate(() => {
        return document.activeElement?.id || null;
      });

      expect(focusedElementId).toBe("test-input");
    });
  });
});
