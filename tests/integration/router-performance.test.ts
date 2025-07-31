/**
 * Router Performance Benchmark Tests
 *
 * Measures the performance impact of the router infrastructure
 * and validates that we meet our latency requirements.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BrowserPoolManager } from "../../src/core/browser-pool-manager.js";
import { MCPBrowserRouter } from "../../src/core/browser/mcp-browser-router.js";
import { MCPRequestContextFactory } from "../../src/core/browser/mcp-request-context.js";

interface PerformanceMetrics {
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
}

function calculateMetrics(measurements: number[]): PerformanceMetrics {
  const sorted = [...measurements].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, val) => acc + val, 0);

  return {
    min: sorted[0] || 0,
    max: sorted[sorted.length - 1] || 0,
    mean: sum / sorted.length || 0,
    median: sorted[Math.floor(sorted.length / 2)] || 0,
    p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
    p99: sorted[Math.floor(sorted.length * 0.99)] || 0,
  };
}

describe("Router Performance Benchmarks", () => {
  let poolManager: BrowserPoolManager;
  let router: MCPBrowserRouter;
  let directPool: BrowserPoolManager;
  let testBrowserId: string;
  let directBrowserId: string;

  beforeAll(async () => {
    // Create two pool managers - one for router, one for direct comparison
    poolManager = new BrowserPoolManager();
    directPool = new BrowserPoolManager();
    router = new MCPBrowserRouter(poolManager);

    // Pre-launch browsers for testing
    const context = MCPRequestContextFactory.create({
      teamId: "perf-test",
      userId: "test-user",
    });

    const routerLaunch = await router.route({
      tool: "launch_browser",
      params: { browserType: "chromium", headless: true },
      context,
    });
    testBrowserId = (routerLaunch.result as any).browserId;

    const directLaunch = await directPool.launchBrowser({
      teamId: "perf-test",
      browserType: "chromium",
      headless: true,
    });
    directBrowserId = directLaunch.browserId;
  });

  afterAll(async () => {
    // Clean up
    if (testBrowserId) {
      await poolManager.closeBrowser({ browserId: testBrowserId, force: true });
    }
    if (directBrowserId) {
      await directPool.closeBrowser({ browserId: directBrowserId, force: true });
    }
    await poolManager.cleanup();
    await directPool.cleanup();
  });

  describe("Router Overhead Measurement", () => {
    it("should have minimal overhead compared to direct pool access", async () => {
      const iterations = 100;
      const routerTimes: number[] = [];
      const directTimes: number[] = [];

      const context = MCPRequestContextFactory.create({
        teamId: "perf-test",
        userId: "test-user",
      });

      // Warm up
      for (let i = 0; i < 10; i++) {
        await router.route({
          tool: "navigate_to_url",
          params: {
            browserId: testBrowserId,
            url: `data:text/html,<h1>Warmup ${i}</h1>`,
          },
          context,
        });
      }

      // Measure router performance
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        await router.route({
          tool: "navigate_to_url",
          params: {
            browserId: testBrowserId,
            url: `data:text/html,<h1>Test ${i}</h1>`,
          },
          context,
        });

        const end = performance.now();
        routerTimes.push(end - start);
      }

      // Measure direct pool performance
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        await directPool.navigate({
          browserId: directBrowserId,
          url: `data:text/html,<h1>Test ${i}</h1>`,
        });

        const end = performance.now();
        directTimes.push(end - start);
      }

      const routerMetrics = calculateMetrics(routerTimes);
      const directMetrics = calculateMetrics(directTimes);

      // Calculate overhead
      const overheadMs = routerMetrics.mean - directMetrics.mean;
      const overheadPercent = (overheadMs / directMetrics.mean) * 100;

      // Assert overhead is acceptable (< 5ms or 10%)
      expect(overheadMs).toBeLessThan(5);
      expect(overheadPercent).toBeLessThan(10);
    });
  });

  describe("MCP Request Latency", () => {
    it("should meet 95th percentile latency requirement (<100ms)", async () => {
      const iterations = 50;
      const measurements: Record<string, number[]> = {
        navigate_to_url: [],
        take_screenshot: [],
        fill_text: [],
        click_element: [],
        get_text_content: [],
      };

      const context = MCPRequestContextFactory.create({
        teamId: "latency-test",
        userId: "test-user",
      });

      // Test navigation latency
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();

        await router.route({
          tool: "navigate_to_url",
          params: {
            browserId: testBrowserId,
            url: `data:text/html,<input id="test-${i}" value="test"/><button id="btn-${i}">Click</button>`,
          },
          context,
        });

        measurements["navigate_to_url"]?.push(performance.now() - start);
      }

      // Test other operations
      for (let i = 0; i < iterations; i++) {
        // Fill text
        let start = performance.now();
        await router.route({
          tool: "fill_text",
          params: {
            browserId: testBrowserId,
            selector: `#test-${i}`,
            text: `value-${i}`,
          },
          context,
        });
        measurements["fill_text"]?.push(performance.now() - start);

        // Click element
        start = performance.now();
        await router.route({
          tool: "click_element",
          params: {
            browserId: testBrowserId,
            selector: `#btn-${i}`,
          },
          context,
        });
        measurements["click_element"]?.push(performance.now() - start);

        // Get text content
        start = performance.now();
        await router.route({
          tool: "get_text_content",
          params: {
            browserId: testBrowserId,
            selector: `#test-${i}`,
          },
          context,
        });
        measurements["get_text_content"]?.push(performance.now() - start);

        // Take screenshot (every 10th iteration)
        if (i % 10 === 0) {
          start = performance.now();
          await router.route({
            tool: "take_screenshot",
            params: {
              browserId: testBrowserId,
              fullPage: false,
            },
            context,
          });
          measurements["take_screenshot"]?.push(performance.now() - start);
        }
      }

      // Calculate and verify metrics
      for (const [_operation, times] of Object.entries(measurements)) {
        if (times.length > 0) {
          const metrics = calculateMetrics(times);

          // Verify 95th percentile is under 100ms
          expect(metrics.p95).toBeLessThan(100);
        }
      }
    });
  });

  describe("Concurrent Load Testing", () => {
    it("should handle concurrent requests from multiple teams", async () => {
      const teams = ["alpha", "beta", "gamma", "delta"];
      const requestsPerTeam = 25;
      const allMeasurements: number[] = [];

      // Launch browsers for each team
      const browsers: Record<string, string> = {};
      for (const teamId of teams) {
        const context = MCPRequestContextFactory.create({
          teamId,
          userId: `user-${teamId}`,
        });

        const response = await router.route({
          tool: "launch_browser",
          params: { browserType: "chromium", headless: true },
          context,
        });

        browsers[teamId] = (response.result as any).browserId;
      }

      // Simulate concurrent load
      const promises: Promise<void>[] = [];

      for (const teamId of teams) {
        const context = MCPRequestContextFactory.create({
          teamId,
          userId: `user-${teamId}`,
        });

        for (let i = 0; i < requestsPerTeam; i++) {
          promises.push(
            (async () => {
              const start = performance.now();

              await router.route({
                tool: "navigate_to_url",
                params: {
                  browserId: browsers[teamId],
                  url: `data:text/html,<h1>Team ${teamId} - Request ${i}</h1>`,
                },
                context,
              });

              const latency = performance.now() - start;
              allMeasurements.push(latency);
            })(),
          );
        }
      }

      // Wait for all requests
      await Promise.all(promises);

      // Calculate overall metrics
      const metrics = calculateMetrics(allMeasurements);

      // Verify performance under load
      expect(metrics.p95).toBeLessThan(200); // Allow higher latency under load
      expect(metrics.p99).toBeLessThan(500); // But still reasonable

      // Clean up browsers
      for (const teamId of teams) {
        const context = MCPRequestContextFactory.create({
          teamId,
          userId: `user-${teamId}`,
        });

        await router.route({
          tool: "close_browser",
          params: { browserId: browsers[teamId] },
          context,
        });
      }
    });
  });

  describe("Resource Efficiency", () => {
    it("should track and report resource usage metrics", async () => {
      const stats = router.getStatistics();

      expect(stats).toBeDefined();
      expect(stats.activeSessions).toBeGreaterThanOrEqual(0);
      expect(stats.sessionsByTeam).toBeDefined();

      // Verify team sessions are tracked
      const totalSessions = Object.values(stats.sessionsByTeam).reduce(
        (sum, count) => sum + count,
        0,
      );
      expect(totalSessions).toBe(stats.activeSessions);
    });
  });
});
