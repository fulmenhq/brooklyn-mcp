/**
 * Team Isolation Validation Tests
 *
 * Phase 4: Testing & Validation - Critical Security Testing
 * Lead: Paris Brooklyn
 *
 * Tests that team boundaries are enforced for screenshot inventory access
 * This is a production security requirement - teams must not access each other's data
 */

import { unlinkSync } from "node:fs";
import { join } from "node:path";
import type { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { BrooklynContext } from "../../src/core/brooklyn-engine.js";
import { BrooklynEngine } from "../../src/core/brooklyn-engine.js";
import {
  getDatabaseManager,
  resetDatabaseManager,
} from "../../src/core/database/database-manager.js";
import { ScreenshotRepositoryOptimized as ScreenshotRepository } from "../../src/core/database/repositories/screenshot-repository-optimized.js";

// Test isolation
const TEST_INSTANCE_ID = "test-team-isolation";
const TEST_DB_PATH = join(process.cwd(), "tests", "test-databases", "team-isolation.test.db");
const TEST_DB_URL = `file:${TEST_DB_PATH}`;

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

describe("Team Isolation Security Validation", () => {
  let engine: BrooklynEngine;
  let teamAContext: BrooklynContext;
  let teamBContext: BrooklynContext;

  beforeAll(async () => {
    // Clean up any existing test database files first
    try {
      unlinkSync(TEST_DB_PATH);
      unlinkSync(`${TEST_DB_PATH}-shm`);
      unlinkSync(`${TEST_DB_PATH}-wal`);
    } catch {
      // Files may not exist, that's fine
    }

    // Reset database singleton to ensure clean state
    // This must be done AFTER cleaning files and BEFORE initializing new database
    await resetDatabaseManager();

    // Initialize logging
    const { initializeLogging } = await import("../../src/shared/pino-logger.js");
    const testConfig = {
      serviceName: "brooklyn-test-isolation",
      version: "test",
      environment: "test" as const,
      teamId: "default-team", // Base config team
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
        config: "/tmp/brooklyn-test-isolation/config",
        logs: "/tmp/brooklyn-test-isolation/logs",
        plugins: "/tmp/brooklyn-test-isolation/plugins",
        browsers: "/tmp/brooklyn-test-isolation/browsers",
        assets: "/tmp/brooklyn-test-isolation/assets",
        pids: "/tmp/brooklyn-test-isolation/pids",
        screenshots: "/tmp/brooklyn-test-isolation/screenshots",
      },
      devMode: true,
    };

    await initializeLogging(testConfig);

    // IMPORTANT: Initialize database BEFORE creating BrooklynEngine
    // This ensures the singleton is set up with our test database
    const dbManager = await getDatabaseManager({
      url: TEST_DB_URL,
    });

    // Wait for database to be fully initialized
    const healthy = await dbManager.isHealthy();
    if (!healthy) {
      throw new Error("Database failed health check");
    }

    // Now create Brooklyn engine - it will use the already-initialized singleton
    engine = new BrooklynEngine({
      config: testConfig,
      mcpMode: true,
    });

    await engine.initialize();

    // Create contexts for different teams
    teamAContext = {
      transport: "test-transport",
      correlationId: "test-correlation-a",
      teamId: "team-alpha",
      userId: "user-alice",
      permissions: ["read", "write"],
    };

    teamBContext = {
      transport: "test-transport",
      correlationId: "test-correlation-b",
      teamId: "team-beta",
      userId: "user-bob",
      permissions: ["read", "write"],
    };
  });

  afterAll(async () => {
    try {
      if (engine) {
        await engine.cleanup();
      }

      // Reset database manager to close connections
      await resetDatabaseManager();
    } finally {
      // Clean up test database files regardless of errors above
      try {
        unlinkSync(TEST_DB_PATH);
        unlinkSync(`${TEST_DB_PATH}-shm`);
        unlinkSync(`${TEST_DB_PATH}-wal`);
      } catch {
        // Files may not exist, that's fine
      }
    }
  });

  beforeEach(async () => {
    // Clear existing test data to ensure test isolation
    const dbManager = await getDatabaseManager();

    // Clear any existing screenshots for this test instance
    await dbManager.execute("DELETE FROM screenshots WHERE instance_id = ?", [TEST_INSTANCE_ID]);

    // Register test instance (use INSERT OR REPLACE to handle if it already exists)
    await dbManager.execute(
      `INSERT OR REPLACE INTO instances (
        id, display_name, type, scope, install_path, project_path,
        pid, config, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        TEST_INSTANCE_ID,
        "test-isolation-instance",
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

  describe("Screenshot Access Control", () => {
    it("should isolate screenshots by team - Team A cannot see Team B screenshots", async () => {
      // Arrange - Create screenshots for both teams
      await ScreenshotRepository.save({
        instanceId: TEST_INSTANCE_ID,
        filePath: "/test/team-a-screenshot.png",
        filename: "team-a-screenshot.png",
        sessionId: "session-team-a",
        browserId: "browser-team-a",
        teamId: "team-alpha",
        userId: "user-alice",
        tag: "team-alpha-tag",
        format: "png",
        fileSize: 100000,
        width: 1920,
        height: 1080,
        fullPage: false,
        hash: "sha256:team-a-hash",
      });

      await ScreenshotRepository.save({
        instanceId: TEST_INSTANCE_ID,
        filePath: "/test/team-b-screenshot.png",
        filename: "team-b-screenshot.png",
        sessionId: "session-team-b",
        browserId: "browser-team-b",
        teamId: "team-beta",
        userId: "user-bob",
        tag: "team-beta-tag",
        format: "png",
        fileSize: 80000,
        width: 1280,
        height: 720,
        fullPage: false,
        hash: "sha256:team-b-hash",
      });

      // Act - Team A queries for screenshots
      const teamARequest: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "list_screenshots",
          arguments: {
            instanceId: TEST_INSTANCE_ID,
          },
        },
      };

      const teamAResult = await engine.executeToolCall(teamARequest, teamAContext);
      const teamAData = parseMCPResponse(teamAResult);

      // Act - Team B queries for screenshots
      const teamBRequest: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "list_screenshots",
          arguments: {
            instanceId: TEST_INSTANCE_ID,
          },
        },
      };

      const teamBResult = await engine.executeToolCall(teamBRequest, teamBContext);
      const teamBData = parseMCPResponse(teamBResult);

      // Assert - Each team sees only their own screenshots
      expect(teamAData.items).toHaveLength(1);
      expect(teamAData.items[0]["teamId"]).toBe("team-alpha");
      expect(teamAData.items[0]["filename"]).toBe("team-a-screenshot.png");

      expect(teamBData.items).toHaveLength(1);
      expect(teamBData.items[0]["teamId"]).toBe("team-beta");
      expect(teamBData.items[0]["filename"]).toBe("team-b-screenshot.png");
    });

    it("should enforce team isolation with explicit team ID filter", async () => {
      // Arrange - Create screenshot for team-alpha
      await ScreenshotRepository.save({
        instanceId: TEST_INSTANCE_ID,
        filePath: "/test/secure-screenshot.png",
        filename: "secure-screenshot.png",
        sessionId: "secure-session",
        browserId: "secure-browser",
        teamId: "team-alpha",
        userId: "user-alice",
        tag: "confidential",
        format: "png",
        fileSize: 500000,
        width: 1920,
        height: 1080,
        fullPage: true,
        hash: "sha256:secure-hash",
      });

      // Act - Team B tries to query with team-alpha filter (attempt to bypass isolation)
      const maliciousRequest: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "list_screenshots",
          arguments: {
            instanceId: TEST_INSTANCE_ID,
            teamId: "team-alpha", // Team B trying to access Team A data
            tag: "confidential",
          },
        },
      };

      const result = await engine.executeToolCall(maliciousRequest, teamBContext);
      const data = parseMCPResponse(result);

      // Assert - Team B gets no results (team isolation enforced)
      expect(data.items).toHaveLength(0);
      expect(data.total).toBe(0);
    });

    it("should isolate by userId within the same team", async () => {
      // Arrange - Create screenshots for different users in same team
      await ScreenshotRepository.save({
        instanceId: TEST_INSTANCE_ID,
        filePath: "/test/user-alice-screenshot.png",
        filename: "user-alice-screenshot.png",
        sessionId: "session-alice",
        browserId: "browser-alice",
        teamId: "team-alpha",
        userId: "user-alice",
        tag: "alice-work",
        format: "png",
        fileSize: 100000,
        width: 1920,
        height: 1080,
        fullPage: false,
        hash: "sha256:alice-hash",
      });

      await ScreenshotRepository.save({
        instanceId: TEST_INSTANCE_ID,
        filePath: "/test/user-charlie-screenshot.png",
        filename: "user-charlie-screenshot.png",
        sessionId: "session-charlie",
        browserId: "browser-charlie",
        teamId: "team-alpha",
        userId: "user-charlie",
        tag: "charlie-work",
        format: "png",
        fileSize: 120000,
        width: 1920,
        height: 1080,
        fullPage: false,
        hash: "sha256:charlie-hash",
      });

      // Create context for another user in team-alpha
      const charlieContext: BrooklynContext = {
        transport: "test-transport",
        correlationId: "test-correlation-charlie",
        teamId: "team-alpha",
        userId: "user-charlie",
        permissions: ["read", "write"],
      };

      // Act - Alice queries for her screenshots
      const aliceRequest: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "list_screenshots",
          arguments: {
            instanceId: TEST_INSTANCE_ID,
            userId: "user-alice",
          },
        },
      };

      const aliceResult = await engine.executeToolCall(aliceRequest, teamAContext);
      const aliceData = parseMCPResponse(aliceResult);

      // Act - Charlie queries for his screenshots
      const charlieRequest: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "list_screenshots",
          arguments: {
            instanceId: TEST_INSTANCE_ID,
            userId: "user-charlie",
          },
        },
      };

      const charlieResult = await engine.executeToolCall(charlieRequest, charlieContext);
      const charlieData = parseMCPResponse(charlieResult);

      // Assert - Each user sees only their own screenshots
      expect(aliceData.items).toHaveLength(1);
      expect(aliceData.items[0]["userId"]).toBe("user-alice");
      expect(aliceData.items[0]["filename"]).toBe("user-alice-screenshot.png");

      expect(charlieData.items).toHaveLength(1);
      expect(charlieData.items[0]["userId"]).toBe("user-charlie");
      expect(charlieData.items[0]["filename"]).toBe("user-charlie-screenshot.png");
    });

    it("should prevent cross-team session access", async () => {
      // Arrange - Create screenshot for team-alpha session
      await ScreenshotRepository.save({
        instanceId: TEST_INSTANCE_ID,
        filePath: "/test/session-screenshot.png",
        filename: "session-screenshot.png",
        sessionId: "team-alpha-session-123",
        browserId: "team-alpha-browser",
        teamId: "team-alpha",
        userId: "user-alice",
        tag: "session-work",
        format: "png",
        fileSize: 150000,
        width: 1920,
        height: 1080,
        fullPage: false,
        hash: "sha256:session-hash",
      });

      // Act - Team B tries to access Team A's session
      const crossTeamRequest: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "list_screenshots",
          arguments: {
            instanceId: TEST_INSTANCE_ID,
            sessionId: "team-alpha-session-123", // Team B trying to access Team A session
          },
        },
      };

      const result = await engine.executeToolCall(crossTeamRequest, teamBContext);
      const data = parseMCPResponse(result);

      // Assert - Team B cannot access Team A session data
      expect(data.items).toHaveLength(0);
      expect(data.total).toBe(0);
    });
  });

  describe("Security Boundary Testing", () => {
    it("should enforce team context over explicit parameters", async () => {
      // Arrange - Create screenshots for multiple teams
      await ScreenshotRepository.save({
        instanceId: TEST_INSTANCE_ID,
        filePath: "/test/protected-screenshot.png",
        filename: "protected-screenshot.png",
        sessionId: "protected-session",
        browserId: "protected-browser",
        teamId: "team-alpha",
        userId: "user-alice",
        tag: "protected-data",
        format: "png",
        fileSize: 200000,
        width: 1920,
        height: 1080,
        fullPage: true,
        hash: "sha256:protected-hash",
      });

      // Act - Team B queries without explicit team filter
      const teamBRequest: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "list_screenshots",
          arguments: {
            instanceId: TEST_INSTANCE_ID,
            // No team filter - should default to requester's team context
          },
        },
      };

      const result = await engine.executeToolCall(teamBRequest, teamBContext);
      const data = parseMCPResponse(result);

      // Assert - Team B sees no results because they're isolated from Team A data
      expect(data.items).toHaveLength(0);
      expect(data.total).toBe(0);
    });

    it("should handle malicious parameter injection attempts", async () => {
      // Arrange - Create test data
      await ScreenshotRepository.save({
        instanceId: TEST_INSTANCE_ID,
        filePath: "/test/injection-test.png",
        filename: "injection-test.png",
        sessionId: "secure-session",
        browserId: "secure-browser",
        teamId: "team-alpha",
        userId: "user-alice",
        tag: "secure-tag",
        format: "png",
        fileSize: 100000,
        width: 1920,
        height: 1080,
        fullPage: false,
        hash: "sha256:secure-hash",
      });

      // Act - Attempt SQL injection-like attacks
      const maliciousRequests = [
        {
          name: "SQL injection attempt in teamId",
          arguments: {
            instanceId: TEST_INSTANCE_ID,
            teamId: "team-beta' OR '1'='1",
          },
        },
        {
          name: "SQL injection attempt in tag",
          arguments: {
            instanceId: TEST_INSTANCE_ID,
            tag: "secure-tag'; DROP TABLE screenshots; --",
          },
        },
        {
          name: "XSS attempt in sessionId",
          arguments: {
            instanceId: TEST_INSTANCE_ID,
            sessionId: "<script>alert('xss')</script>",
          },
        },
      ];

      for (const testCase of maliciousRequests) {
        const request: CallToolRequest = {
          method: "tools/call",
          params: {
            name: "list_screenshots",
            arguments: testCase.arguments,
          },
        };

        const result = await engine.executeToolCall(request, teamBContext);
        const data = parseMCPResponse(result);

        // Assert - Malicious queries return no data (team isolation + input sanitization)
        expect(data.items).toHaveLength(0);
        expect(data.total).toBe(0);
      }
    });
  });
});
