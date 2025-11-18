/**
 * Security middleware tests
 *
 * Tests domain validation, rate limiting, and team isolation
 */

import type { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type SecurityConfig,
  SecurityError,
  SecurityMiddleware,
} from "../../src/core/security-middleware.js";

describe("Security Middleware", () => {
  let middleware: SecurityMiddleware;

  beforeEach(async () => {
    // Set up logging before creating middleware
    const { initializeLogging } = await import("../../src/shared/pino-logger.js");
    initializeLogging({
      serviceName: "brooklyn-test",
      version: "1.0.0",
      environment: "test",
      teamId: "test-team",
      logging: { level: "error", format: "json" },
    } as any);

    const config: Partial<SecurityConfig> = {
      allowedDomains: ["example.com", "*.test.com"],
      rateLimiting: { requests: 5, windowMs: 1000 },
      maxBrowsers: 3,
      teamIsolation: true,
    };

    middleware = new SecurityMiddleware(config);
  });

  afterEach(() => {
    if (middleware) {
      middleware.cleanup();
    }
  });

  describe("Domain Validation", () => {
    it("should allow navigation to permitted domains", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "navigate_to_url",
          arguments: { url: "https://example.com/page" },
        },
      };

      await expect(middleware.validateRequest(request)).resolves.not.toThrow();
    });

    it("should allow navigation to wildcard subdomains", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "navigate_to_url",
          arguments: { url: "https://app.test.com/dashboard" },
        },
      };

      await expect(middleware.validateRequest(request)).resolves.not.toThrow();
    });

    it("should allow data URLs for testing", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "navigate_to_url",
          arguments: { url: "data:text/html,<h1>Test</h1>" },
        },
      };

      await expect(middleware.validateRequest(request)).resolves.not.toThrow();
    });

    it("should reject navigation to non-permitted domains", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "navigate_to_url",
          arguments: { url: "https://malicious.com/hack" },
        },
      };

      await expect(middleware.validateRequest(request)).rejects.toThrow(SecurityError);
    });

    it("should reject malformed URLs", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "navigate_to_url",
          arguments: { url: "not-a-valid-url" },
        },
      };

      await expect(middleware.validateRequest(request)).rejects.toThrow(SecurityError);
    });
  });

  describe("Rate Limiting", () => {
    it("should allow requests within rate limit", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "take_screenshot",
          arguments: { browserId: "test-123" },
        },
      };

      const context = { teamId: "test-team" };

      // Should allow 5 requests
      for (let i = 0; i < 5; i++) {
        await expect(middleware.validateRequest(request, context)).resolves.not.toThrow();
      }
    });

    it("should reject requests exceeding rate limit", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "take_screenshot",
          arguments: { browserId: "test-123" },
        },
      };

      const context = { teamId: "test-team" };

      // Use up the rate limit
      for (let i = 0; i < 5; i++) {
        await middleware.validateRequest(request, context);
      }

      // 6th request should be rejected
      await expect(middleware.validateRequest(request, context)).rejects.toThrow(SecurityError);

      try {
        await middleware.validateRequest(request, context);
      } catch (error) {
        expect(error).toBeInstanceOf(SecurityError);
        expect((error as SecurityError).code).toBe("RATE_LIMIT_EXCEEDED");
        expect((error as SecurityError).statusCode).toBe(429);
      }
    });

    it("should have separate rate limits for different teams", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "take_screenshot",
          arguments: { browserId: "test-123" },
        },
      };

      const team1Context = { teamId: "team-1" };
      const team2Context = { teamId: "team-2" };

      // Team 1 uses up their rate limit
      for (let i = 0; i < 5; i++) {
        await middleware.validateRequest(request, team1Context);
      }

      // Team 2 should still have their full rate limit
      await expect(middleware.validateRequest(request, team2Context)).resolves.not.toThrow();
    });
  });

  describe("Team Isolation", () => {
    it("should require team ID for browser launch", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "launch_browser",
          arguments: { browserType: "chromium" },
        },
      };

      // Without team context
      await expect(middleware.validateRequest(request)).rejects.toThrow(SecurityError);

      try {
        await middleware.validateRequest(request);
      } catch (error) {
        expect(error).toBeInstanceOf(SecurityError);
        expect((error as SecurityError).code).toBe("TEAM_ID_REQUIRED");
      }
    });

    it("should allow browser launch with team ID", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "launch_browser",
          arguments: { browserType: "chromium", teamId: "test-team" },
        },
      };

      const context = { teamId: "test-team" };

      await expect(middleware.validateRequest(request, context)).resolves.not.toThrow();
    });

    it("should reject mismatched team IDs", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "launch_browser",
          arguments: { browserType: "chromium", teamId: "other-team" },
        },
      };

      const context = { teamId: "test-team" };

      await expect(middleware.validateRequest(request, context)).rejects.toThrow(SecurityError);

      try {
        await middleware.validateRequest(request, context);
      } catch (error) {
        expect(error).toBeInstanceOf(SecurityError);
        expect((error as SecurityError).code).toBe("TEAM_ID_MISMATCH");
      }
    });
  });

  describe("Configuration Management", () => {
    it("should return current status", () => {
      const status = middleware.getStatus();

      expect(status.config.allowedDomains).toContain("example.com");
      expect(status.config.rateLimiting.requests).toBe(5);
      expect(status.rateLimitEntries).toBe(0);
      expect(typeof status.uptime).toBe("number");
    });

    it("should allow configuration updates", () => {
      middleware.updateConfig({
        allowedDomains: ["newdomain.com"],
        rateLimiting: { requests: 10, windowMs: 2000 },
      });

      const status = middleware.getStatus();
      expect(status.config.allowedDomains).toEqual(["newdomain.com"]);
      expect(status.config.rateLimiting.requests).toBe(10);
    });
  });

  describe("Wildcard Domain Support", () => {
    beforeEach(() => {
      if (middleware) {
        middleware.cleanup();
      }

      const config: Partial<SecurityConfig> = {
        allowedDomains: ["*"],
        rateLimiting: { requests: 100, windowMs: 60000 },
      };

      middleware = new SecurityMiddleware(config);
    });

    it("should allow all domains when wildcard is configured", async () => {
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: "navigate_to_url",
          arguments: { url: "https://anydomain.com/page" },
        },
      };

      await expect(middleware.validateRequest(request)).resolves.not.toThrow();
    });
  });
});
