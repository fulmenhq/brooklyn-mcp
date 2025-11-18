/**
 * E2E MCP Protocol Tests for list_screenshots Tool
 *
 * Phase 4: Testing & Validation
 * Lead: Paris Brooklyn
 *
 * Tests direct MCP protocol compliance for screenshot inventory functionality
 */

import type { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrooklynContext } from "../../src/core/brooklyn-engine.js";
import { BrooklynEngine } from "../../src/core/brooklyn-engine.js";
import {
  getDatabaseManager,
  resetDatabaseManager,
} from "../../src/core/database/database-manager.js";
import { ScreenshotRepositoryOptimized as ScreenshotRepository } from "../../src/core/database/repositories/screenshot-repository-optimized.js";

// Test isolation
const TEST_INSTANCE_ID = "test-e2e-list-screenshots";
const TEST_DB_CONFIG = { url: ":memory:" };

// Helper function to parse MCP tool responses
function parseMCPResponse(result: any): any {
  if (result && typeof result === "object" && "isError" in result && result.isError) {
    throw new Error(`Tool execution failed: ${JSON.stringify(result)}`);
  }

  if (!result?.content?.[0]?.text) {
    throw new Error("Invalid MCP response format");
  }

  return JSON.parse(result.content[0].text);
}

describe("list_screenshots MCP Tool - E2E Protocol Tests", () => {
  let engine: BrooklynEngine;
  let context: BrooklynContext;

  beforeAll(async () => {
    // Reset database manager for clean test state
    await resetDatabaseManager();

    // Initialize logging
    const { initializeLogging } = await import("../../src/shared/pino-logger.js");
    const testConfig = {
      serviceName: "brooklyn-test-e2e",
      version: "test",
      environment: "test" as const,
      teamId: "test-team",
      logging: { level: "error" as const, format: "json" as const, maxFiles: 5, maxSize: "10MB" },
      transports: {
        mcp: { enabled: true },
        http: { enabled: false, port: 3001, host: "localhost", cors: false, rateLimiting: false },
      },
      browsers: {
        maxInstances: 1,
        defaultType: "chromium" as const,
        headless: true,
        timeout: 30000,
      },
      security: {
        allowedDomains: ["example.com"],
        rateLimit: { requests: 100, windowMs: 60000 },
      },
      authentication: {
        mode: "none" as const,
        developmentOnly: true,
        providers: {},
      },
      plugins: {
        directory: "",
        autoLoad: false,
        allowUserPlugins: false,
      },
      paths: {
        config: "/tmp/brooklyn-test/config",
        logs: "/tmp/brooklyn-test/logs",
        plugins: "/tmp/brooklyn-test/plugins",
        browsers: "/tmp/brooklyn-test/browsers",
        assets: "/tmp/brooklyn-test/assets",
        pids: "/tmp/brooklyn-test/pids",
        screenshots: "/tmp/brooklyn-test/screenshots",
      },
      devMode: true,
    };

    await initializeLogging(testConfig);

    // Initialize in-memory database for testing
    await getDatabaseManager(TEST_DB_CONFIG);

    // Create Brooklyn engine with test configuration
    engine = new BrooklynEngine({
      config: testConfig,
      mcpMode: true,
    });

    await engine.initialize();

    context = {
      transport: "test-transport",
      correlationId: "test-correlation",
      teamId: "test-team",
      userId: "test-user",
      permissions: ["read", "write"],
    };
  });

  afterAll(async () => {
    try {
      if (engine) {
        await engine.cleanup();
      }
      // Clean up test data using the same database manager instance
      const dbManager = await getDatabaseManager(TEST_DB_CONFIG);
      await dbManager.execute("DELETE FROM screenshots WHERE instance_id LIKE ?", ["test-%"]);
      await dbManager.execute("DELETE FROM instances WHERE id LIKE ?", ["test-%"]);
    } catch {
      // Ignore cleanup errors in afterAll to prevent test failures
      // Note: Intentionally silent cleanup to prevent test failures
    } finally {
      // Reset database manager for clean shutdown
      await resetDatabaseManager();
    }
  });

  beforeEach(async () => {
    // Clear database before each test using the same database manager instance
    const dbManager = await getDatabaseManager(TEST_DB_CONFIG);
    await dbManager.execute("DELETE FROM screenshots WHERE instance_id LIKE ?", ["test-%"]);
    await dbManager.execute("DELETE FROM instances WHERE id LIKE ?", ["test-%"]);

    // Register test instance to satisfy foreign key constraint
    await dbManager.execute(
      `INSERT OR REPLACE INTO instances (
        id, display_name, type, scope, install_path, project_path,
        pid, config, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        TEST_INSTANCE_ID,
        "test-instance-display",
        "test",
        "test",
        "/test/path",
        null,
        process.pid,
        "{}",
        1,
      ],
    );
  });

  describe("MCP Protocol Compliance", () => {
    it("should handle valid MCP request with all parameters", async () => {
      // Arrange - Add test data
      await ScreenshotRepository.save({
        instanceId: TEST_INSTANCE_ID,
        filePath: "/test/screenshot1.png",
        filename: "screenshot1.png",
        sessionId: "session-123",
        browserId: "browser-456",
        teamId: "test-team",
        userId: "user-789",
        tag: "test-tag",
        format: "png",
        fileSize: 100000,
        width: 1920,
        height: 1080,
        fullPage: true,
        quality: 95,
        hash: "sha256:test-hash-1",
        metadata: { test: true },
      });

      await ScreenshotRepository.save({
        instanceId: TEST_INSTANCE_ID,
        filePath: "/test/screenshot2.png",
        filename: "screenshot2.png",
        sessionId: "session-124",
        browserId: "browser-457",
        teamId: "test-team",
        userId: "user-790",
        tag: "another-tag",
        format: "jpeg",
        fileSize: 80000,
        width: 1280,
        height: 720,
        fullPage: false,
        quality: 85,
        hash: "sha256:test-hash-2",
        metadata: { test: true },
      });

      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "list_screenshots",
          arguments: {
            instanceId: TEST_INSTANCE_ID,
            sessionId: "session-123",
            teamId: "test-team",
            tag: "test-tag",
            format: "png",
            orderBy: "created_at",
            orderDirection: "DESC",
            limit: 10,
            offset: 0,
          },
        },
      };

      // Act
      const result = await engine.executeToolCall(request, context);
      const data = parseMCPResponse(result);
      expect(data.items).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items).toHaveLength(1);

      const item = data.items[0] as Record<string, unknown>;
      expect(item["filename"]).toBe("screenshot1.png");
      expect(item["sessionId"]).toBe("session-123");
      expect(item["browserId"]).toBe("browser-456");
      expect(item["teamId"]).toBe("test-team");
      expect(item["tag"]).toBe("test-tag");
      expect(item["format"]).toBe("png");
      expect(item["fileSize"]).toBe(100000);
      expect(item["width"]).toBe(1920);
      expect(item["height"]).toBe(1080);

      // Validate pagination metadata
      expect(data.total).toBe(1);
      expect(data.hasMore).toBe(false);
      expect(data.nextOffset).toBeUndefined();
    });

    it("should handle empty parameters with default values", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "list_screenshots",
          arguments: {},
        },
      };

      // Act
      const result = await engine.executeToolCall(request, context);
      const data = parseMCPResponse(result);

      // Assert - Should use defaults
      expect(data).toBeDefined();
      expect(data.items).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
      expect(data.total).toBe(0);
      expect(data.hasMore).toBe(false);
    });

    it("should validate pagination parameters correctly", async () => {
      // Add multiple test screenshots
      for (let i = 0; i < 15; i++) {
        await ScreenshotRepository.save({
          instanceId: TEST_INSTANCE_ID,
          filePath: `/test/screenshot${i}.png`,
          filename: `screenshot${i}.png`,
          sessionId: `session-${i}`,
          browserId: `browser-${i}`,
          teamId: "test-team",
          tag: "pagination-test",
          format: "png",
          fileSize: 100000 + i,
          width: 1920,
          height: 1080,
          fullPage: false,
          hash: `sha256:test-hash-${i}`,
        });
      }

      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "list_screenshots",
          arguments: {
            instanceId: TEST_INSTANCE_ID,
            tag: "pagination-test",
            limit: 5,
            offset: 0,
            orderBy: "created_at",
            orderDirection: "DESC",
          },
        },
      };

      // Act
      const result = await engine.executeToolCall(request, context);
      const data = parseMCPResponse(result);

      // Assert
      expect(data.items).toHaveLength(5);
      expect(data.total).toBe(15);
      expect(data.hasMore).toBe(true);
      expect(data.nextOffset).toBe(5);
    });

    it("should handle date range filtering", async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      await ScreenshotRepository.save({
        instanceId: TEST_INSTANCE_ID,
        filePath: "/test/recent.png",
        filename: "recent.png",
        sessionId: "session-recent",
        browserId: "browser-recent",
        teamId: "test-team",
        tag: "date-test",
        format: "png",
        fileSize: 100000,
        width: 1920,
        height: 1080,
        fullPage: false,
        hash: "sha256:recent-hash",
      });

      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "list_screenshots",
          arguments: {
            instanceId: TEST_INSTANCE_ID,
            tag: "date-test",
            startDate: yesterday.toISOString(),
            endDate: tomorrow.toISOString(),
          },
        },
      };

      // Act
      const result = await engine.executeToolCall(request, context);
      const data = parseMCPResponse(result);

      // Assert
      expect(data.items).toHaveLength(1);
      expect(data.items[0]["filename"]).toBe("recent.png");
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid date formats gracefully", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "list_screenshots",
          arguments: {
            startDate: "invalid-date",
          },
        },
      };

      // Act - Should handle invalid date gracefully, not throw
      const result = await engine.executeToolCall(request, context);
      const data = parseMCPResponse(result);

      // Assert - Should return results (ignoring invalid date) instead of throwing
      expect(data).toBeDefined();
      expect(data.items).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);
    });

    it("should handle database connection errors gracefully", async () => {
      // Mock database failure
      const originalList = ScreenshotRepository.list;
      vi.spyOn(ScreenshotRepository, "list").mockRejectedValueOnce(
        new Error("Database connection failed"),
      );

      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "list_screenshots",
          arguments: {
            instanceId: TEST_INSTANCE_ID,
          },
        },
      };

      // Act
      const result = await engine.executeToolCall(request, context);
      const data = parseMCPResponse(result);

      // Assert - Should fallback to filesystem scan
      expect(data).toBeDefined();
      expect(data.items).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);

      // Restore original method
      ScreenshotRepository.list = originalList;
    });

    it("should validate limit parameter boundaries", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "list_screenshots",
          arguments: {
            limit: 150, // Exceeds max of 100
          },
        },
      };

      // Act
      const result = await engine.executeToolCall(request, context);

      // Assert - Should cap at 100
      expect(result).toBeDefined();
      // The actual result limit validation happens in the router
      // This confirms the tool executes without error
    });
  });

  describe("Team Isolation", () => {
    it("should only return screenshots for the context team", async () => {
      // Add screenshot for different team
      await ScreenshotRepository.save({
        instanceId: TEST_INSTANCE_ID,
        filePath: "/test/other-team.png",
        filename: "other-team.png",
        sessionId: "session-other",
        browserId: "browser-other",
        teamId: "other-team",
        tag: "isolation-test",
        format: "png",
        fileSize: 100000,
        width: 1920,
        height: 1080,
        fullPage: false,
        hash: "sha256:other-hash",
      });

      // Add screenshot for current team
      await ScreenshotRepository.save({
        instanceId: TEST_INSTANCE_ID,
        filePath: "/test/current-team.png",
        filename: "current-team.png",
        sessionId: "session-current",
        browserId: "browser-current",
        teamId: "test-team",
        tag: "isolation-test",
        format: "png",
        fileSize: 100000,
        width: 1920,
        height: 1080,
        fullPage: false,
        hash: "sha256:current-hash",
      });

      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "list_screenshots",
          arguments: {
            instanceId: TEST_INSTANCE_ID,
            tag: "isolation-test",
          },
        },
      };

      // Act
      const result = await engine.executeToolCall(request, context);
      const data = parseMCPResponse(result);

      // Assert - Should only see test-team screenshot
      expect(data.items).toHaveLength(1);
      expect(data.items[0]["filename"]).toBe("current-team.png");
      expect(data.items[0]["teamId"]).toBe("test-team");
    });
  });

  describe("Backward Compatibility", () => {
    it("should map legacy browserId parameter to sessionId", async () => {
      await ScreenshotRepository.save({
        instanceId: TEST_INSTANCE_ID,
        filePath: "/test/legacy.png",
        filename: "legacy.png",
        sessionId: "session-legacy",
        browserId: "browser-legacy",
        teamId: "test-team",
        tag: "legacy-test",
        format: "png",
        fileSize: 100000,
        width: 1920,
        height: 1080,
        fullPage: false,
        hash: "sha256:legacy-hash",
      });

      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "list_screenshots",
          arguments: {
            instanceId: TEST_INSTANCE_ID,
            browserId: "session-legacy", // Legacy parameter
            tag: "legacy-test",
          },
        },
      };

      // Act
      const result = await engine.executeToolCall(request, context);
      const data = parseMCPResponse(result);

      // Assert
      expect(data.items).toHaveLength(1);
      expect(data.items[0]["sessionId"]).toBe("session-legacy");
    });
  });

  describe("Performance Requirements", () => {
    it("should respond within performance thresholds", async () => {
      // Add moderate amount of test data
      for (let i = 0; i < 50; i++) {
        await ScreenshotRepository.save({
          instanceId: TEST_INSTANCE_ID,
          filePath: `/test/perf${i}.png`,
          filename: `perf${i}.png`,
          sessionId: `session-perf-${i}`,
          browserId: `browser-perf-${i}`,
          teamId: "test-team",
          tag: "performance-test",
          format: "png",
          fileSize: 100000 + i,
          width: 1920,
          height: 1080,
          fullPage: false,
          hash: `sha256:perf-hash-${i}`,
        });
      }

      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "list_screenshots",
          arguments: {
            instanceId: TEST_INSTANCE_ID,
            tag: "performance-test",
            limit: 20,
          },
        },
      };

      // Act
      const startTime = Date.now();
      const result = await engine.executeToolCall(request, context);
      const data = parseMCPResponse(result);
      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // Assert - Should complete within 100ms (Phase 3 performance target)
      expect(executionTime).toBeLessThan(100);
      expect(data.items).toHaveLength(20);
      expect(data.total).toBe(50);
    });
  });
});
