/**
 * Integration tests for authentication provider coordination
 * Tests manager coordination, provider switching, and cross-provider scenarios
 */

import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type MockedFunction,
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { BrooklynAuthManager } from "../../../src/core/auth/auth-manager.js";
import { GitHubAuthProvider } from "../../../src/core/auth/github-provider.js";
import { LocalAuthProvider } from "../../../src/core/auth/local-provider.js";
import { NoneAuthProvider } from "../../../src/core/auth/none-provider.js";
import { AuthenticationError } from "../../../src/core/auth/types.js";
import type { BrooklynConfig } from "../../../src/core/config.js";

// Mock fetch globally for GitHub provider tests
const mockFetch = vi.fn() as MockedFunction<typeof fetch>;
vi.stubGlobal("fetch", mockFetch);

// Helper function to create complete BrooklynConfig objects
function createTestConfig(authConfig: BrooklynConfig["authentication"]): BrooklynConfig {
  return {
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
    authentication: authConfig,
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
}

describe("Provider Integration Tests", () => {
  let authManager: BrooklynAuthManager;
  let testUserStorePath: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    authManager = new BrooklynAuthManager();
    testUserStorePath = join(tmpdir(), `brooklyn-integration-test-${Date.now()}.json`);

    // Save and clean environment
    originalEnv = { ...process.env };
    delete process.env["NODE_ENV"];
    delete process.env["BROOKLYN_ENV"];
    delete process.env["KUBERNETES_SERVICE_HOST"];

    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Clean up test files
    if (existsSync(testUserStorePath)) {
      rmSync(testUserStorePath);
    }

    // Restore environment
    process.env = originalEnv;
    vi.useRealTimers();
  });

  // Remove any global stubs (like fetch) set in this file to prevent cross-test contamination
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  describe("GitHub provider integration", () => {
    let githubConfig: BrooklynConfig;

    beforeEach(() => {
      githubConfig = createTestConfig({
        mode: "github",
        developmentOnly: false,
        providers: {
          github: {
            clientId: "test_client_id",
            clientSecret: "test_client_secret",
            callbackUrl: "https://localhost:3000/oauth/callback",
            allowedOrgs: ["test-org"],
          },
        },
      });
    });

    test("should initialize GitHub provider through manager", async () => {
      // Act
      await authManager.initialize(githubConfig);

      // Assert
      const status = authManager.getStatus();
      expect(status.healthy).toBe(true);
      expect(authManager.getCurrentProvider()).toBeInstanceOf(GitHubAuthProvider);
      expect(status.provider).toBe("github");
    });

    test.skip("should handle GitHub OAuth flow through manager", async () => {
      // Arrange
      await authManager.initialize(githubConfig);

      const mockUserResponse = {
        id: 12345,
        login: "testuser",
        email: "test@example.com",
      };
      const mockOrgsResponse = [{ id: 1, login: "test-org", role: "member" }];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: "test_token", token_type: "bearer" }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUserResponse,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockOrgsResponse,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        } as Response);

      // Act
      const authResult = await authManager.completeOAuthFlow("test_code", "test_state");
      const authContext = await authManager.validateRequest(
        authResult.sessionToken || "test_token",
      );

      // Assert
      expect(authResult.success).toBe(true);
      expect(authResult.userId).toBe("12345");
      expect(authContext.userId).toBe("12345");
    });

    test("should get authorization URL through manager", async () => {
      // Arrange
      await authManager.initialize(githubConfig);

      // Act
      const authUrl = authManager.startOAuthFlow("test_state");

      // Assert
      expect(authUrl).toContain("github.com/login/oauth/authorize");
      expect(authUrl).toContain("client_id=test_client_id");
      expect(authUrl).toContain("state=test_state");
    });

    test("should handle GitHub API errors through manager", async () => {
      // Arrange
      await authManager.initialize(githubConfig);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Bad credentials",
      } as Response);

      // Act & Assert
      await expect(authManager.completeOAuthFlow("invalid_code", "state")).rejects.toThrow(
        AuthenticationError,
      );
    });
  });

  describe("Local provider integration", () => {
    let localConfig: BrooklynConfig;

    beforeEach(() => {
      localConfig = createTestConfig({
        mode: "local",
        developmentOnly: false,
        providers: {
          local: {
            userStore: testUserStorePath,
            sessionTimeout: 86400000,
          },
        },
      });
    });

    test("should initialize local provider through manager", async () => {
      // Act
      await authManager.initialize(localConfig);

      // Assert
      const status = authManager.getStatus();
      expect(status.healthy).toBe(true);
      expect(authManager.getCurrentProvider()).toBeInstanceOf(LocalAuthProvider);
      expect(status.provider).toBe("local");
    });

    test("should handle local authentication through manager", async () => {
      // Arrange
      await authManager.initialize(localConfig);
      const localProvider = authManager.getCurrentProvider() as LocalAuthProvider;
      await localProvider.createUser("testuser", "password123", {
        teamId: "test-team",
        permissions: ["mcp:basic", "mcp:navigate"],
      });

      // Act
      const authResult = await authManager.authenticateCredentials("testuser", "password123");
      const authContext = await authManager.validateRequest(authResult.sessionToken || "");

      // Assert
      expect(authResult.success).toBe(true);
      expect(authContext.userId).toBe(authResult.userId);
      expect(authContext.teamId).toBe("test-team");
    });

    test("should handle local user management through provider", async () => {
      // Arrange
      await authManager.initialize(localConfig);
      const localProvider = authManager.getCurrentProvider() as LocalAuthProvider;

      // Act
      const user = await localProvider.createUser("admin", "admin123", {
        email: "admin@example.com",
        teamId: "admin-team",
        permissions: ["mcp:admin"],
      });

      const users = await localProvider.listUsers();
      const userInfo = await localProvider.getUserInfo(await authManager.createSession(user.id));

      // Assert
      expect(users).toHaveLength(1);
      expect(users[0]?.username).toBe("admin");
      expect(userInfo.username).toBe("admin");
      expect(userInfo.email).toBe("admin@example.com");
    });
  });

  describe("None provider integration", () => {
    let noneConfig: BrooklynConfig;

    beforeEach(() => {
      noneConfig = createTestConfig({
        mode: "none",
        developmentOnly: true,
        providers: {},
      });
    });

    test("should initialize none provider through manager", async () => {
      // Act
      const initPromise = authManager.initialize(noneConfig);
      vi.advanceTimersByTime(2000); // Security warning delay
      await initPromise;

      // Assert
      const status = authManager.getStatus();
      expect(status.healthy).toBe(true);
      expect(authManager.getCurrentProvider()).toBeInstanceOf(NoneAuthProvider);
      expect(status.provider).toBe("none");
    });

    test("should handle development authentication through manager", async () => {
      // Arrange
      const initPromise = authManager.initialize(noneConfig);
      vi.advanceTimersByTime(2000);
      await initPromise;

      // Act
      const sessionToken = await authManager.createSession("dev-user", { teamId: "development" });
      const authContext = await authManager.validateRequest(sessionToken);
      const provider = authManager.getCurrentProvider();
      const userInfo = await provider.getUserInfo(sessionToken);

      // Assert
      expect(authContext.userId).toBe("dev-user");
      expect(userInfo.username).toBe("developer");
    });

    test("should reject none provider in production environment", async () => {
      // Arrange
      process.env["NODE_ENV"] = "production";

      // Act & Assert
      await expect(authManager.initialize(noneConfig)).rejects.toThrow(AuthenticationError);
      await expect(authManager.initialize(noneConfig)).rejects.toThrow(
        "Cannot use 'none' authentication in production environment",
      );
    });
  });

  describe("Provider switching and configuration validation", () => {
    test("should switch between different provider configurations", async () => {
      // Arrange - Start with none provider
      const noneConfig = createTestConfig({
        mode: "none" as const,
        developmentOnly: true,
        providers: {},
      });

      const localConfig = {
        ...noneConfig,
        authentication: {
          mode: "local" as const,
          developmentOnly: false,
          providers: {
            local: {
              userStore: testUserStorePath,
              sessionTimeout: 86400000,
            },
          },
        },
      };

      // Act - Initialize with none provider
      const initPromise1 = authManager.initialize(noneConfig);
      vi.advanceTimersByTime(2000);
      await initPromise1;

      const status1 = authManager.getStatus();
      expect(status1.provider).toBe("none");

      // Switch to local provider
      const authManager2 = new BrooklynAuthManager();
      await authManager2.initialize(localConfig);

      // Assert
      const status2 = authManager2.getStatus();
      expect(status2.provider).toBe("local");
      expect(authManager2.getCurrentProvider()).toBeInstanceOf(LocalAuthProvider);
    });

    test("should validate configuration for each provider type", async () => {
      // Test missing GitHub configuration
      const invalidGithubConfig = createTestConfig({
        mode: "github" as const,
        developmentOnly: false,
        providers: {}, // Missing GitHub config
      });

      await expect(authManager.initialize(invalidGithubConfig)).rejects.toThrow(
        "GitHub provider configuration missing",
      );

      // Test missing local configuration
      const invalidLocalConfig = {
        ...invalidGithubConfig,
        authentication: {
          mode: "local" as const,
          developmentOnly: false,
          providers: {}, // Missing local config
        },
      };

      const authManager2 = new BrooklynAuthManager();
      await expect(authManager2.initialize(invalidLocalConfig)).rejects.toThrow(
        "Local provider configuration missing",
      );
    });

    test("should reject invalid authentication modes", async () => {
      // Arrange
      const invalidConfig = createTestConfig({
        mode: "invalid-mode" as any,
        developmentOnly: false,
        providers: {},
      });

      // Act & Assert
      await expect(authManager.initialize(invalidConfig)).rejects.toThrow(
        "Unknown authentication mode",
      );
    });
  });

  describe("Manager coordination features", () => {
    test("should provide unified interface for all providers", async () => {
      // Test with Local provider
      const localConfig = createTestConfig({
        mode: "local" as const,
        developmentOnly: false,
        providers: {
          local: {
            userStore: testUserStorePath,
            sessionTimeout: 86400000,
          },
        },
      });

      await authManager.initialize(localConfig);

      // Test unified interface methods
      const status = authManager.getStatus();
      expect(status.healthy).toBe(true);
      expect(status.provider).toBe("local");
      expect(authManager.getCurrentProvider()).toBeInstanceOf(LocalAuthProvider);

      // Status already checked above
    });

    test("should handle provider-specific method availability", async () => {
      // Arrange - Test None provider limitations
      const noneConfig = createTestConfig({
        mode: "none" as const,
        developmentOnly: true,
        providers: {},
      });

      const initPromise = authManager.initialize(noneConfig);
      vi.advanceTimersByTime(2000);
      await initPromise;

      // Act & Assert - None provider doesn't support these methods
      expect(() => authManager.startOAuthFlow("state")).toThrow("does not support OAuth flow");

      // But should support basic authentication methods
      const authContext = await authManager.validateRequest("any-token");
      expect(authContext.userId).toBe("dev-user");
    });

    test("should provide consistent error handling across providers", async () => {
      // Test with multiple providers
      const configs = [
        {
          mode: "github" as const,
          providers: {
            github: {
              clientId: "test_id",
              clientSecret: "test_secret",
              callbackUrl: "https://localhost/callback",
            },
          },
        },
        {
          mode: "local" as const,
          providers: {
            local: {
              userStore: testUserStorePath,
              sessionTimeout: 86400000,
            },
          },
        },
      ];

      for (const authConfig of configs) {
        const manager = new BrooklynAuthManager();
        const config = createTestConfig({
          ...authConfig,
          developmentOnly: false,
        });

        await manager.initialize(config);

        // All providers should handle uninitialized state consistently
        const uninitializedManager = new BrooklynAuthManager();
        await expect(uninitializedManager.validateRequest("token")).rejects.toThrow(
          "Authentication manager not initialized",
        );
      }
    });
  });

  describe("Cross-provider session compatibility", () => {
    test("should handle session tokens appropriately per provider", async () => {
      // Test Local provider sessions
      const localConfig = createTestConfig({
        mode: "local" as const,
        developmentOnly: false,
        providers: {
          local: {
            userStore: testUserStorePath,
            sessionTimeout: 3600000, // 1 hour
          },
        },
      });

      await authManager.initialize(localConfig);
      const localProvider = authManager.getCurrentProvider() as LocalAuthProvider;
      await localProvider.createUser("testuser", "password123");

      const authResult = await localProvider.authenticateCredentials("testuser", "password123");
      const sessionToken = await authManager.createSession(authResult.userId);

      // Session should be valid
      const authContext = await authManager.validateRequest(sessionToken);
      expect(authContext.userId).toBe(authResult.userId);
      expect(authContext.sessionId).toBeDefined();

      // Test None provider sessions
      const noneManager = new BrooklynAuthManager();
      const noneConfig = createTestConfig({
        mode: "none" as const,
        developmentOnly: true,
        providers: {},
      });

      const initPromise = noneManager.initialize(noneConfig);
      vi.advanceTimersByTime(2000);
      await initPromise;

      const devSessionToken = await noneManager.createSession("dev-user");
      expect(devSessionToken).toMatch(/^dev-session-\d+-[a-z0-9]+$/);

      const devAuthContext = await noneManager.validateRequest(devSessionToken);
      expect(devAuthContext.userId).toBe("dev-user");
    });
  });

  describe("Provider status and health checks", () => {
    test("should provide health status for all provider types", async () => {
      const providerConfigs = [
        {
          name: "GitHub",
          config: {
            mode: "github" as const,
            developmentOnly: false,
            providers: {
              github: {
                clientId: "test_id",
                clientSecret: "test_secret",
                callbackUrl: "https://localhost/callback",
              },
            },
          },
          expectedType: GitHubAuthProvider,
        },
        {
          name: "Local",
          config: {
            mode: "local" as const,
            developmentOnly: false,
            providers: {
              local: {
                userStore: testUserStorePath,
                sessionTimeout: 86400000,
              },
            },
          },
          expectedType: LocalAuthProvider,
        },
        {
          name: "None",
          config: {
            mode: "none" as const,
            developmentOnly: true,
            providers: {},
          },
          expectedType: NoneAuthProvider,
        },
      ];

      for (const { name, config, expectedType } of providerConfigs) {
        const manager = new BrooklynAuthManager();
        const fullConfig = createTestConfig(config);

        if (name === "None") {
          const initPromise = manager.initialize(fullConfig);
          vi.advanceTimersByTime(2000);
          await initPromise;
        } else {
          await manager.initialize(fullConfig);
        }

        const status = manager.getStatus();
        expect(status.healthy).toBe(true);
        expect(status.provider).toBe(config.mode);
        expect(manager.getCurrentProvider()).toBeInstanceOf(expectedType);
      }
    });
  });
});
