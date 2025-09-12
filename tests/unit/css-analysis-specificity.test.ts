/**
 * CSS Specificity Analysis Tests
 *
 * Tests the enhanced analyze_specificity functionality with token optimization,
 * conflict detection, and AI-friendly responses.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BrowserPoolManager } from "../../src/core/browser-pool-manager.js";
import { getLogger } from "../../src/shared/pino-logger.js";

const _logger = getLogger("css-specificity-test");

describe("CSS Specificity Analysis", () => {
  let poolManager: BrowserPoolManager;
  let testBrowserId: string;

  beforeAll(
    async () => {
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

      // Navigate to a test page with complex CSS rules for specificity testing
      const testHtml = `
      <html>
        <head>
          <style>
            /* Low specificity */
            button { 
              color: blue; 
              font-size: 14px; 
            }
            
            /* Medium specificity */
            .btn { 
              color: red; 
              background: white; 
            }
            
            /* High specificity */
            #primary-btn { 
              color: green; 
              font-weight: bold; 
            }
            
            /* Very high specificity */
            body #primary-btn.btn { 
              color: purple; 
              border: 1px solid black; 
            }
            
            /* Important rule */
            .important { 
              color: orange !important; 
              margin: 10px; 
            }
            
            /* Multiple rules for same element */
            .test-element { color: yellow; padding: 5px; }
            div.test-element { color: pink; margin: 5px; }
            #container .test-element { color: cyan; border: 2px solid red; }
          </style>
        </head>
        <body>
          <div id="container">
            <button id="primary-btn" class="btn important">Primary Button</button>
            <div class="test-element">Test Element</div>
          </div>
        </body>
      </html>
    `;

      await poolManager.navigate({
        browserId: testBrowserId,
        url: `data:text/html,${encodeURIComponent(testHtml)}`,
      });
    },
    process.platform === "win32" ? 120000 : 60000,
  ); // 2min Windows, 1min others

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

  describe("Enhanced Specificity Analysis Features", () => {
    it("should provide summary-focused response by default", async () => {
      const result = await poolManager.analyzeSpecificity({
        browserId: testBrowserId,
        selector: "#primary-btn",
      });

      expect(result.success).toBe(true);
      expect(result.summary).toBeDefined();
      expect(result.summary.totalRules).toBeGreaterThan(0);
      expect(result.summary.highestSpecificity).toBeDefined();
      expect(result.summary.appliedRule).toBeDefined();
      expect(result.executionTime).toBeGreaterThan(0);

      // Should be summary-focused by default
      expect(result.rules).toBeUndefined();
    });

    it("should detect CSS conflicts and provide conflict information", async () => {
      const result = await poolManager.analyzeSpecificity({
        browserId: testBrowserId,
        selector: "#primary-btn",
        conflictsOnly: true,
      });

      expect(result.success).toBe(true);
      expect(result.summary.conflicts).toBeGreaterThan(0);

      if (result.conflicts && result.conflicts.length > 0) {
        const conflict = result.conflicts[0];
        if (conflict) {
          expect(conflict.property).toBeDefined();
          expect(conflict.winningRule).toBeDefined();
          expect(conflict.winningRule.selector).toBeDefined();
          expect(conflict.winningRule.specificity).toHaveLength(4);
          expect(conflict.reason).toMatch(/Higher specificity|!important|Source order/);
        }
      }
    });

    it("should provide AI-actionable recommendations", async () => {
      const result = await poolManager.analyzeSpecificity({
        browserId: testBrowserId,
        selector: "#primary-btn",
      });

      expect(result.success).toBe(true);

      // Should provide recommendations for complex specificity
      if (result.recommendations) {
        expect(Array.isArray(result.recommendations)).toBe(true);
        expect(result.recommendations.length).toBeGreaterThan(0);
      }
    });

    it("should respect maxRules limit for detailed analysis", async () => {
      const maxRules = 3;
      const result = await poolManager.analyzeSpecificity({
        browserId: testBrowserId,
        selector: "#primary-btn",
        maxRules,
        summarize: false,
        conflictsOnly: false,
      });

      expect(result.success).toBe(true);

      if (result.rules) {
        expect(result.rules.length).toBeLessThanOrEqual(maxRules);
      }
    });

    it("should filter by specific CSS properties", async () => {
      const result = await poolManager.analyzeSpecificity({
        browserId: testBrowserId,
        selector: "#primary-btn",
        properties: ["color"],
        summarize: false,
        conflictsOnly: false,
      });

      expect(result.success).toBe(true);

      if (result.rules) {
        // All rules should only contain the color property
        for (const rule of result.rules) {
          const propertyNames = Object.keys(rule.properties);
          expect(
            propertyNames.every((prop) => prop === "color" || propertyNames.length === 0),
          ).toBe(true);
        }
      }
    });

    it("should handle elements with many conflicting rules efficiently", async () => {
      const startTime = Date.now();

      const result = await poolManager.analyzeSpecificity({
        browserId: testBrowserId,
        selector: ".test-element",
        maxRules: 5,
      });

      const executionTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.summary.totalRules).toBeGreaterThan(1); // Multiple rules apply
      expect(result.summary.conflicts).toBeGreaterThan(0); // Should have conflicts
    });
  });

  describe("Response Size Optimization", () => {
    it("should provide compact responses to prevent token overuse", async () => {
      const result = await poolManager.analyzeSpecificity({
        browserId: testBrowserId,
        selector: "#primary-btn",
        summarize: true,
        maxRules: 5,
      });

      expect(result.success).toBe(true);

      // Check that response is reasonably sized
      const responseString = JSON.stringify(result);
      expect(responseString.length).toBeLessThan(5000); // Should be under 5KB

      // Should have essential information
      expect(result.summary).toBeDefined();
      expect(result.summary.totalRules).toBeGreaterThan(0);
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it("should limit conflicts to prevent response bloat", async () => {
      const result = await poolManager.analyzeSpecificity({
        browserId: testBrowserId,
        selector: ".test-element",
      });

      expect(result.success).toBe(true);

      if (result.conflicts) {
        // Should limit conflicts to reasonable number
        expect(result.conflicts.length).toBeLessThanOrEqual(10);
      }
    });
  });

  describe("Error Handling and Edge Cases", () => {
    it("should handle invalid selectors gracefully", async () => {
      const result = await poolManager.analyzeSpecificity({
        browserId: testBrowserId,
        selector: "#non-existent-element",
      });

      expect(result.success).toBe(false);
      expect(result.selector).toBe("#non-existent-element");
      expect(result.summary.totalRules).toBe(0);
    });

    it("should handle malformed CSS selectors", async () => {
      const result = await poolManager.analyzeSpecificity({
        browserId: testBrowserId,
        selector: "invalid>>>selector",
      });

      expect(result.success).toBe(false);
      expect(result.selector).toBe("invalid>>>selector");
    });

    it("should respect timeout parameter", async () => {
      const result = await poolManager.analyzeSpecificity({
        browserId: testBrowserId,
        selector: "#primary-btn",
        timeout: 1000,
      });

      expect(result.success).toBe(true);
      expect(result.executionTime).toBeLessThan(1500); // Should respect timeout
    });
  });

  describe("Conflict Detection Accuracy", () => {
    it("should correctly identify !important conflicts", async () => {
      const result = await poolManager.analyzeSpecificity({
        browserId: testBrowserId,
        selector: "#primary-btn",
        properties: ["color"],
      });

      expect(result.success).toBe(true);

      if (result.conflicts) {
        const importantConflict = result.conflicts.find((c) => c.reason === "!important");
        if (importantConflict) {
          expect(importantConflict.winningRule.value).toContain("!important");
        }
      }
    });

    it("should correctly identify higher specificity conflicts", async () => {
      const result = await poolManager.analyzeSpecificity({
        browserId: testBrowserId,
        selector: ".test-element",
        properties: ["color"],
      });

      expect(result.success).toBe(true);

      if (result.conflicts) {
        const specificityConflict = result.conflicts.find((c) => c.reason === "Higher specificity");
        if (specificityConflict) {
          expect(specificityConflict.winningRule.specificity).toBeDefined();
          expect(specificityConflict.overriddenRules.length).toBeGreaterThan(0);
        }
      }
    });

    it("should provide clear conflict explanations", async () => {
      const result = await poolManager.analyzeSpecificity({
        browserId: testBrowserId,
        selector: ".test-element",
      });

      expect(result.success).toBe(true);

      if (result.conflicts) {
        for (const conflict of result.conflicts) {
          expect(conflict.reason).toMatch(/Higher specificity|!important|Source order/);
          expect(conflict.property).toBeDefined();
          expect(conflict.winningRule.selector).toBeDefined();
        }
      }
    });
  });
});
