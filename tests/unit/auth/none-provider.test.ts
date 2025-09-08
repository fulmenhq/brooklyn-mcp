/**
 * Unit tests for None (development-only) authentication provider
 * Tests development-only mode validation, production safeguards, and security warnings
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NoneAuthProvider } from "../../../src/core/auth/none-provider.js";
import { AuthenticationError } from "../../../src/core/auth/types.js";
import type { BrooklynConfig } from "../../../src/core/config.js";

describe("NoneAuthProvider", () => {
  let provider: NoneAuthProvider;
  let mockConfig: BrooklynConfig;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    provider = new NoneAuthProvider();

    // Save original environment
    originalEnv = { ...process.env };

    // Clear production environment indicators
    delete process.env["NODE_ENV"];
    delete process.env["BROOKLYN_ENV"];
    delete process.env["KUBERNETES_SERVICE_HOST"];
    delete process.env["DOCKER_CONTAINER_ID"];
    delete process.env["HOSTNAME"];
    delete process.env["AWS_EXECUTION_ENV"];
    delete process.env["LAMBDA_TASK_ROOT"];
    delete process.env["HEROKU_DYNO_ID"];
    delete process.env["DYNO"];
    delete process.env["VERCEL"];
    delete process.env["NETLIFY"];
    delete process.env["PORT"];
    delete process.env["BROOKLYN_PORT"];

    mockConfig = {
      serviceName: "brooklyn-test",
      version: "1.6.0",
      environment: "test",
      teamId: "test-team",
      transports: {
        mcp: { enabled: true },
        http: {
          enabled: true,
          port: 3000,
          host: "localhost",
          cors: true,
          rateLimiting: true,
        },
      },
      browsers: {
        maxInstances: 10,
        defaultType: "chromium",
        headless: true,
        timeout: 30000,
      },
      security: {
        allowedDomains: [],
        rateLimit: { requests: 100, windowMs: 60000 },
      },
      authentication: {
        mode: "none",
        developmentOnly: true,
        providers: {},
      },
      logging: {
        level: "info",
        format: "json",
      },
      plugins: {
        directory: "./plugins",
        autoLoad: false,
        allowUserPlugins: false,
      },
      paths: {
        config: "./config",
        logs: "./logs",
        plugins: "./plugins",
        browsers: "./browsers",
        assets: "./assets",
        pids: "./pids",
      },
    };

    // Mock setTimeout to avoid delays in tests
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    vi.useRealTimers();
  });

  describe("initialization", () => {
    test("should initialize successfully in development mode", async () => {
      // Act
      const initPromise = provider.initialize(mockConfig);

      // Fast-forward through the security warning delay
      vi.advanceTimersByTime(2000);

      await initPromise;

      // Assert
      expect(provider.name).toBe("none");
      expect(provider.type).toBe("none");
      const status = provider.getStatus();
      expect(status.healthy).toBe(true);
    });

    test("should throw error when developmentOnly flag is false", async () => {
      // Arrange
      mockConfig.authentication.developmentOnly = false;

      // Act & Assert
      await expect(provider.initialize(mockConfig)).rejects.toThrow(AuthenticationError);
      await expect(provider.initialize(mockConfig)).rejects.toThrow(
        "Authentication mode 'none' requires developmentOnly: true",
      );
    });

    test("should throw error when developmentOnly flag is missing", async () => {
      // Arrange
      delete mockConfig.authentication.developmentOnly;

      // Act & Assert
      await expect(provider.initialize(mockConfig)).rejects.toThrow(AuthenticationError);
      await expect(provider.initialize(mockConfig)).rejects.toThrow(
        "Authentication mode 'none' requires developmentOnly: true",
      );
    });
  });

  describe("production environment detection", () => {
    test("should reject NODE_ENV=production", async () => {
      // Arrange
      process.env["NODE_ENV"] = "production";

      // Act & Assert
      await expect(provider.initialize(mockConfig)).rejects.toThrow(AuthenticationError);
      await expect(provider.initialize(mockConfig)).rejects.toThrow(
        "Cannot use 'none' authentication in production environment",
      );
    });

    test("should reject BROOKLYN_ENV=production", async () => {
      // Arrange
      process.env["BROOKLYN_ENV"] = "production";

      // Act & Assert
      await expect(provider.initialize(mockConfig)).rejects.toThrow(AuthenticationError);
      await expect(provider.initialize(mockConfig)).rejects.toThrow(
        "Cannot use 'none' authentication in production environment",
      );
    });

    test("should reject Kubernetes environment", async () => {
      // Arrange
      process.env["KUBERNETES_SERVICE_HOST"] = "10.0.0.1";

      // Act & Assert
      await expect(provider.initialize(mockConfig)).rejects.toThrow(AuthenticationError);
      await expect(provider.initialize(mockConfig)).rejects.toThrow(
        "Cannot use 'none' authentication in production environment",
      );
    });

    test("should reject Docker environment with DOCKER_CONTAINER_ID", async () => {
      // Arrange
      process.env["DOCKER_CONTAINER_ID"] = "abc123";

      // Act & Assert
      await expect(provider.initialize(mockConfig)).rejects.toThrow(AuthenticationError);
      await expect(provider.initialize(mockConfig)).rejects.toThrow(
        "Cannot use 'none' authentication in production environment",
      );
    });

    test("should reject Docker environment with docker hostname", async () => {
      // Arrange
      process.env["HOSTNAME"] = "docker-container-123";

      // Act & Assert
      await expect(provider.initialize(mockConfig)).rejects.toThrow(AuthenticationError);
      await expect(provider.initialize(mockConfig)).rejects.toThrow(
        "Cannot use 'none' authentication in production environment",
      );
    });

    test("should reject AWS Lambda environment", async () => {
      // Arrange
      process.env["AWS_EXECUTION_ENV"] = "AWS_Lambda_nodejs18.x";

      // Act & Assert
      await expect(provider.initialize(mockConfig)).rejects.toThrow(AuthenticationError);
      await expect(provider.initialize(mockConfig)).rejects.toThrow(
        "Cannot use 'none' authentication in production environment",
      );
    });

    test("should reject AWS Lambda with LAMBDA_TASK_ROOT", async () => {
      // Arrange
      process.env["LAMBDA_TASK_ROOT"] = "/var/task";

      // Act & Assert
      await expect(provider.initialize(mockConfig)).rejects.toThrow(AuthenticationError);
      await expect(provider.initialize(mockConfig)).rejects.toThrow(
        "Cannot use 'none' authentication in production environment",
      );
    });

    test("should reject Heroku environment with HEROKU_DYNO_ID", async () => {
      // Arrange
      process.env["HEROKU_DYNO_ID"] = "12345678-1234-1234-1234-123456789012";

      // Act & Assert
      await expect(provider.initialize(mockConfig)).rejects.toThrow(AuthenticationError);
      await expect(provider.initialize(mockConfig)).rejects.toThrow(
        "Cannot use 'none' authentication in production environment",
      );
    });

    test("should reject Heroku environment with DYNO", async () => {
      // Arrange
      process.env["DYNO"] = "web.1";

      // Act & Assert
      await expect(provider.initialize(mockConfig)).rejects.toThrow(AuthenticationError);
      await expect(provider.initialize(mockConfig)).rejects.toThrow(
        "Cannot use 'none' authentication in production environment",
      );
    });

    test("should reject Vercel environment", async () => {
      // Arrange
      process.env["VERCEL"] = "1";

      // Act & Assert
      await expect(provider.initialize(mockConfig)).rejects.toThrow(AuthenticationError);
      await expect(provider.initialize(mockConfig)).rejects.toThrow(
        "Cannot use 'none' authentication in production environment",
      );
    });

    test("should reject Netlify environment", async () => {
      // Arrange
      process.env["NETLIFY"] = "true";

      // Act & Assert
      await expect(provider.initialize(mockConfig)).rejects.toThrow(AuthenticationError);
      await expect(provider.initialize(mockConfig)).rejects.toThrow(
        "Cannot use 'none' authentication in production environment",
      );
    });

    test("should reject production hostname patterns", async () => {
      // Arrange
      const productionHostnames = ["prod-server-01", "production-web", "app-prod-123"];

      for (const hostname of productionHostnames) {
        process.env["HOSTNAME"] = hostname;

        // Act & Assert
        await expect(provider.initialize(mockConfig)).rejects.toThrow(AuthenticationError);
        await expect(provider.initialize(mockConfig)).rejects.toThrow(
          "Cannot use 'none' authentication in production environment",
        );
      }
    });

    test("should reject production ports", async () => {
      // Arrange
      const productionPorts = ["80", "443", "8080"];

      for (const port of productionPorts) {
        process.env["PORT"] = port;

        // Act & Assert
        await expect(provider.initialize(mockConfig)).rejects.toThrow(AuthenticationError);
        await expect(provider.initialize(mockConfig)).rejects.toThrow(
          "Cannot use 'none' authentication in production environment",
        );
      }
    });

    test("should reject BROOKLYN_PORT production values", async () => {
      // Arrange
      process.env["BROOKLYN_PORT"] = "443";

      // Act & Assert
      await expect(provider.initialize(mockConfig)).rejects.toThrow(AuthenticationError);
      await expect(provider.initialize(mockConfig)).rejects.toThrow(
        "Cannot use 'none' authentication in production environment",
      );
    });

    test("should allow development environments", async () => {
      // Arrange
      process.env["NODE_ENV"] = "development";
      process.env["HOSTNAME"] = "localhost";
      process.env["PORT"] = "3000";

      // Act
      const initPromise = provider.initialize(mockConfig);
      vi.advanceTimersByTime(2000);
      await initPromise;

      // Assert
      const status = provider.getStatus();
      expect(status.healthy).toBe(true);
    });
  });

  describe("authentication behavior", () => {
    beforeEach(async () => {
      const initPromise = provider.initialize(mockConfig);
      vi.advanceTimersByTime(2000);
      await initPromise;
    });

    test("should validate any token successfully", async () => {
      // Act
      const result = await provider.validateToken("any-token");

      // Assert
      expect(result.success).toBe(true);
      expect(result.userId).toBe("dev-user");
      expect(result.teamId).toBe("development");
      expect(result.permissions).toEqual([
        "mcp:admin",
        "mcp:basic",
        "mcp:navigate",
        "mcp:screenshot",
        "mcp:browser",
        "mcp:debug",
      ]);
    });

    test("should return same result for different tokens", async () => {
      // Act
      const result1 = await provider.validateToken("token-1");
      const result2 = await provider.validateToken("token-2");
      const result3 = await provider.validateToken("completely-different-token");

      // Assert
      expect(result1).toEqual(result2);
      expect(result2).toEqual(result3);
      expect(result1.success).toBe(true);
    });

    test("should handle empty token", async () => {
      // Act
      const result = await provider.validateToken("");

      // Assert
      expect(result.success).toBe(true);
      expect(result.userId).toBe("dev-user");
    });

    test("should handle very long token", async () => {
      // Arrange
      const longToken = "a".repeat(10000);

      // Act
      const result = await provider.validateToken(longToken);

      // Assert
      expect(result.success).toBe(true);
      expect(result.userId).toBe("dev-user");
    });
  });

  describe("user information", () => {
    beforeEach(async () => {
      const initPromise = provider.initialize(mockConfig);
      vi.advanceTimersByTime(2000);
      await initPromise;
    });

    test("should return development user info", async () => {
      // Act
      const userInfo = await provider.getUserInfo("any-token");

      // Assert
      expect(userInfo).toEqual({
        id: "dev-user",
        username: "developer",
        email: "developer@localhost",
        displayName: "Development User",
      });
    });

    test("should return same user info for different tokens", async () => {
      // Act
      const userInfo1 = await provider.getUserInfo("token-1");
      const userInfo2 = await provider.getUserInfo("token-2");

      // Assert
      expect(userInfo1).toEqual(userInfo2);
    });
  });

  describe("session management", () => {
    beforeEach(async () => {
      const initPromise = provider.initialize(mockConfig);
      vi.advanceTimersByTime(2000);
      await initPromise;
    });

    test("should create development session tokens", async () => {
      // Act
      const sessionToken = await provider.createSession("dev-user");

      // Assert
      expect(sessionToken).toMatch(/^dev-session-\d+-[a-z0-9]+$/);
    });

    test("should create unique session tokens", async () => {
      // Act
      const token1 = await provider.createSession("dev-user");
      const token2 = await provider.createSession("dev-user");

      // Assert
      expect(token1).not.toBe(token2);
      expect(token1).toMatch(/^dev-session-\d+-[a-z0-9]+$/);
      expect(token2).toMatch(/^dev-session-\d+-[a-z0-9]+$/);
    });

    test("should handle metadata in session creation", async () => {
      // Act
      const sessionToken = await provider.createSession("dev-user", {
        clientIp: "127.0.0.1",
        userAgent: "Brooklyn-Test",
      });

      // Assert
      expect(sessionToken).toMatch(/^dev-session-\d+-[a-z0-9]+$/);
    });
  });

  describe("status reporting", () => {
    beforeEach(async () => {
      const initPromise = provider.initialize(mockConfig);
      vi.advanceTimersByTime(2000);
      await initPromise;
    });

    test("should include security warnings in status", () => {
      // Act
      const status = provider.getStatus();

      // Assert
      expect(status.healthy).toBe(true);
      expect(status.details?.["securityWarning"]).toBe("AUTHENTICATION DISABLED");
      expect(status.details?.["developmentOnly"]).toBe(true);
      expect(status.details?.["productionSafe"]).toBe(false);
    });

    test("should indicate development-only mode", () => {
      // Act
      const status = provider.getStatus();

      // Assert
      expect(status.details?.["developmentOnly"]).toBe(true);
      expect(status.details?.["productionSafe"]).toBe(false);
    });
  });

  describe("error handling", () => {
    test("should throw error when calling methods on uninitialized provider", async () => {
      // Arrange
      const uninitializedProvider = new NoneAuthProvider();

      // Act & Assert
      await expect(uninitializedProvider.validateToken("token")).rejects.toThrow(
        "Authentication provider not initialized",
      );
      await expect(uninitializedProvider.getUserInfo("token")).rejects.toThrow(
        "Authentication provider not initialized",
      );
      await expect(uninitializedProvider.createSession("user")).rejects.toThrow(
        "Authentication provider not initialized",
      );
    });

    test("should handle multiple initialization attempts", async () => {
      // Act
      const init1 = provider.initialize(mockConfig);
      vi.advanceTimersByTime(2000);
      await init1;

      const init2 = provider.initialize(mockConfig);
      vi.advanceTimersByTime(2000);
      await init2;

      // Assert
      const status = provider.getStatus();
      expect(status.healthy).toBe(true);
    });
  });

  describe("security warning behavior", () => {
    test("should log security warnings during initialization", async () => {
      // Arrange
      const mockLogger = {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
      };

      // Mock the logger getter
      vi.spyOn(provider as any, "logger", "get").mockReturnValue(mockLogger);

      // Act
      const initPromise = provider.initialize(mockConfig);
      vi.advanceTimersByTime(2000);
      await initPromise;

      // Assert
      expect(mockLogger.error).toHaveBeenCalledWith(
        "🚨 SECURITY WARNING: Authentication disabled!",
        expect.objectContaining({
          mode: "none",
          security: "DISABLED",
          developmentOnly: true,
          recommendation: "Use GitHub or local auth for production",
        }),
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        "None authentication provider initialized - DEVELOPMENT ONLY",
        expect.objectContaining({
          developmentOnly: true,
        }),
      );
    });

    test("should include startup delay for security warning visibility", async () => {
      // Arrange
      const startTime = Date.now();

      // Act
      const initPromise = provider.initialize(mockConfig);

      // Don't advance timers yet
      const beforeDelay = Date.now();
      expect(beforeDelay - startTime).toBeLessThan(100); // Should be fast without timer advancement

      // Now advance the timer
      vi.advanceTimersByTime(2000);
      await initPromise;

      // Assert - timer was used for delay
      const status = provider.getStatus();
      expect(status.healthy).toBe(true);
    });
  });

  describe("comprehensive production detection", () => {
    test("should handle complex production environment combinations", async () => {
      // Arrange
      const productionScenarios = [
        {
          name: "AWS ECS",
          env: { AWS_EXECUTION_ENV: "AWS_ECS_EC2", HOSTNAME: "prod-ecs-123" },
        },
        {
          name: "Kubernetes + Production",
          env: { KUBERNETES_SERVICE_HOST: "10.0.0.1", NODE_ENV: "production" },
        },
        {
          name: "Docker + Production Port",
          env: { DOCKER_CONTAINER_ID: "abc123", PORT: "80" },
        },
        {
          name: "Heroku Production",
          env: { DYNO: "web.1", NODE_ENV: "production" },
        },
      ];

      for (const scenario of productionScenarios) {
        // Clean environment
        for (const key of Object.keys(process.env)) {
          if (
            key.startsWith("AWS_") ||
            key.startsWith("KUBERNETES_") ||
            key.startsWith("DOCKER_") ||
            key.startsWith("HEROKU_") ||
            ["NODE_ENV", "HOSTNAME", "PORT", "DYNO"].includes(key)
          ) {
            delete process.env[key];
          }
        }

        // Set scenario environment
        for (const [key, value] of Object.entries(scenario.env)) {
          process.env[key] = value;
        }

        // Act & Assert
        await expect(provider.initialize(mockConfig)).rejects.toThrow(AuthenticationError);
        await expect(provider.initialize(mockConfig)).rejects.toThrow(
          "Cannot use 'none' authentication in production environment",
        );
      }
    });

    test("should allow safe development environments", async () => {
      // Arrange
      const devScenarios = [
        {
          name: "Local development",
          env: { NODE_ENV: "development", HOSTNAME: "localhost" },
        },
        {
          name: "Test environment",
          env: { NODE_ENV: "test", PORT: "3000" },
        },
        {
          name: "Clean environment",
          env: {},
        },
        {
          name: "Development hostname",
          env: { HOSTNAME: "dev-machine", PORT: "4000" },
        },
      ];

      for (const scenario of devScenarios) {
        // Create a new provider for each scenario
        const testProvider = new NoneAuthProvider();

        // Clean environment
        for (const key of Object.keys(process.env)) {
          if (!(key.startsWith("_") || ["PATH", "HOME", "USER"].includes(key))) {
            delete process.env[key];
          }
        }

        // Set scenario environment
        for (const [key, value] of Object.entries(scenario.env)) {
          process.env[key] = value;
        }

        // Act
        const initPromise = testProvider.initialize(mockConfig);
        vi.advanceTimersByTime(2000);
        await initPromise;

        // Assert
        const status = testProvider.getStatus();
        expect(status.healthy).toBe(true);
      }
    });
  });
});
