/**
 * Unit tests for Brooklyn MCP BrooklynAuthManager
 * Tests provider coordination, request validation, OAuth flows, and session management
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrooklynAuthManager } from "../../../src/core/auth/auth-manager.js";
import type { AuthProvider } from "../../../src/core/auth/auth-provider.js";
import type {} from "../../../src/core/auth/types.js";
import { AuthenticationError } from "../../../src/core/auth/types.js";
import type { BrooklynConfig } from "../../../src/core/config.js";

// Mock the logger
vi.mock("../../../src/shared/pino-logger.js", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock provider constructors
vi.mock("../../../src/core/auth/github-provider.js", () => ({
  GitHubAuthProvider: vi.fn(),
}));

vi.mock("../../../src/core/auth/local-provider.js", () => ({
  LocalAuthProvider: vi.fn(),
}));

vi.mock("../../../src/core/auth/none-provider.js", () => ({
  NoneAuthProvider: vi.fn(),
}));

// Helper to create mock providers
const createMockProvider = (
  name: string,
  type: "github" | "local" | "none",
  hasOAuth = false,
  hasCredentials = false,
): AuthProvider => {
  const mockProvider: Partial<AuthProvider> = {
    name,
    type,
    initialize: vi.fn().mockResolvedValue(undefined),
    validateToken: vi.fn().mockResolvedValue({
      success: true,
      userId: `${name}-user`,
      permissions: ["read"],
    }),
    getUserInfo: vi.fn().mockResolvedValue({
      id: `${name}-user`,
      username: `${name}user`,
    }),
    createSession: vi.fn().mockResolvedValue(`${name}-session-token`),
    validateSession: vi.fn().mockResolvedValue({
      userId: `${name}-user`,
      permissions: ["read"],
    }),
    revokeSession: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
    getStatus: vi.fn().mockReturnValue({ healthy: true }),
  };

  if (hasOAuth) {
    mockProvider.getAuthorizationUrl = vi
      .fn()
      .mockImplementation(
        (state: string, codeChallenge?: string) =>
          `https://github.com/login/oauth/authorize?state=${state}&code_challenge=${codeChallenge || ""}`,
      );
    mockProvider.exchangeCodeForToken = vi.fn().mockResolvedValue({
      accessToken: "access-token",
      tokenType: "Bearer",
    });
  }

  if (hasCredentials) {
    mockProvider.authenticateCredentials = vi.fn().mockResolvedValue({
      success: true,
      userId: `${name}-user`,
      permissions: ["read", "write"],
    });
  }

  return mockProvider as AuthProvider;
};

describe("BrooklynAuthManager", () => {
  let authManager: BrooklynAuthManager;
  let mockConfig: BrooklynConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    authManager = new BrooklynAuthManager();
    mockConfig = {
      serviceName: "brooklyn-mcp-server",
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
        maxInstances: 5,
        defaultType: "chromium",
        headless: true,
        timeout: 30000,
      },
      security: {
        allowedDomains: ["example.com"],
        rateLimit: {
          requests: 100,
          windowMs: 60000,
        },
      },
      authentication: {
        mode: "local",
        developmentOnly: false,
        providers: {
          local: {
            userStore: "/tmp/test-users.json",
            sessionTimeout: 86400000,
          },
        },
      },
      logging: {
        level: "info",
        format: "pretty",
      },
      plugins: {
        directory: "/tmp/test-plugins",
        autoLoad: true,
        allowUserPlugins: true,
      },
      paths: {
        config: "/tmp/test-config",
        logs: "/tmp/test-logs",
        plugins: "/tmp/test-plugins",
        browsers: "/tmp/test-browsers",
        pids: "/tmp/test-pids",
      },
    } as BrooklynConfig;
  });

  describe("Initialization", () => {
    it("should initialize with local provider", async () => {
      const mockProvider = createMockProvider("local", "local", false, true);
      const { LocalAuthProvider } = await import("../../../src/core/auth/local-provider.js");
      vi.mocked(LocalAuthProvider).mockImplementation(function MockLocalAuthProvider() {
        return mockProvider as any;
      });

      mockConfig.authentication.mode = "local";
      await authManager.initialize(mockConfig);

      const provider = authManager.getCurrentProvider();
      expect(provider.name).toBe("local");
      expect(provider.type).toBe("local");
      expect(provider.initialize).toHaveBeenCalledWith(mockConfig);
    });

    it("should initialize with github provider", async () => {
      const mockProvider = createMockProvider("github", "github", true, false);
      const { GitHubAuthProvider } = await import("../../../src/core/auth/github-provider.js");
      vi.mocked(GitHubAuthProvider).mockImplementation(function MockGitHubAuthProvider() {
        return mockProvider as any;
      });

      mockConfig.authentication.mode = "github";
      await authManager.initialize(mockConfig);

      const provider = authManager.getCurrentProvider();
      expect(provider.name).toBe("github");
      expect(provider.type).toBe("github");
    });

    it("should initialize with none provider", async () => {
      const mockProvider = createMockProvider("none", "none", false, false);
      const { NoneAuthProvider } = await import("../../../src/core/auth/none-provider.js");
      vi.mocked(NoneAuthProvider).mockImplementation(() => mockProvider as any);

      mockConfig.authentication.mode = "none";
      await authManager.initialize(mockConfig);

      const provider = authManager.getCurrentProvider();
      expect(provider.name).toBe("none");
      expect(provider.type).toBe("none");
    });

    it("should throw error for unknown authentication mode", async () => {
      mockConfig.authentication.mode = "unknown" as any;

      await expect(authManager.initialize(mockConfig)).rejects.toThrow(AuthenticationError);
      await expect(authManager.initialize(mockConfig)).rejects.toThrow(
        "Unknown authentication mode",
      );
    });

    it("should throw error when getting provider before initialization", () => {
      expect(() => authManager.getCurrentProvider()).toThrow(AuthenticationError);
      expect(() => authManager.getCurrentProvider()).toThrow(
        "Authentication manager not initialized",
      );
    });
  });

  describe("Request Validation", () => {
    let mockProvider: AuthProvider;

    beforeEach(async () => {
      mockProvider = createMockProvider("local", "local", false, true);
      const { LocalAuthProvider } = await import("../../../src/core/auth/local-provider.js");
      vi.mocked(LocalAuthProvider).mockImplementation(() => mockProvider as any);
      await authManager.initialize(mockConfig);
    });

    it("should validate successful authentication", async () => {
      const token = "valid-token";
      const context = {
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
      };

      const authContext = await authManager.validateRequest(token, context);

      expect(authContext).toBeDefined();
      expect(authContext.userId).toBe("local-user");
      expect(authContext.permissions).toEqual(["read"]);
      expect(authContext.ipAddress).toBe("192.168.1.1");
      expect(authContext.userAgent).toBe("Mozilla/5.0");
      expect(mockProvider.validateToken).toHaveBeenCalledWith(token);
    });

    it("should handle authentication failure", async () => {
      vi.mocked(mockProvider.validateToken).mockResolvedValue({
        success: false,
        userId: "",
        permissions: [],
      });

      await expect(authManager.validateRequest("invalid-token")).rejects.toThrow(
        AuthenticationError,
      );
      await expect(authManager.validateRequest("invalid-token")).rejects.toThrow(
        "Authentication failed",
      );
    });

    it("should handle provider validation errors", async () => {
      vi.mocked(mockProvider.validateToken).mockRejectedValue(new Error("Provider error"));

      await expect(authManager.validateRequest("token")).rejects.toThrow(AuthenticationError);
      await expect(authManager.validateRequest("token")).rejects.toThrow(
        "Authentication validation failed",
      );
    });

    it("should handle authentication errors from provider", async () => {
      vi.mocked(mockProvider.validateToken).mockRejectedValue(
        new AuthenticationError("Invalid token", "INVALID_TOKEN", 401),
      );

      await expect(authManager.validateRequest("token")).rejects.toThrow(AuthenticationError);
      await expect(authManager.validateRequest("token")).rejects.toThrow("Invalid token");
    });

    it("should validate request without context", async () => {
      const authContext = await authManager.validateRequest("valid-token");

      expect(authContext.userId).toBe("local-user");
      expect(authContext.ipAddress).toBeUndefined();
      expect(authContext.userAgent).toBeUndefined();
    });

    it("should create auth context with all fields", async () => {
      vi.mocked(mockProvider.validateToken).mockResolvedValue({
        success: true,
        userId: "user123",
        teamId: "team456",
        permissions: ["admin"],
        expiresAt: new Date(),
        sessionToken: "session789",
      });

      const authContext = await authManager.validateRequest("token", {
        ipAddress: "10.0.0.1",
        userAgent: "curl/7.68.0",
      });

      expect(authContext.userId).toBe("user123");
      expect(authContext.teamId).toBe("team456");
      expect(authContext.sessionId).toBe("session789");
      expect(authContext.permissions).toEqual(["admin"]);
      expect(authContext.expiresAt).toBeInstanceOf(Date);
      expect(authContext.ipAddress).toBe("10.0.0.1");
      expect(authContext.userAgent).toBe("curl/7.68.0");
    });

    it("should throw error when not initialized", async () => {
      const uninitializedManager = new BrooklynAuthManager();

      await expect(uninitializedManager.validateRequest("token")).rejects.toThrow(
        AuthenticationError,
      );
      await expect(uninitializedManager.validateRequest("token")).rejects.toThrow(
        "Authentication manager not initialized",
      );
    });
  });

  describe("OAuth Flow", () => {
    let mockProvider: AuthProvider;

    beforeEach(async () => {
      mockProvider = createMockProvider("github", "github", true, false);
      const { GitHubAuthProvider } = await import("../../../src/core/auth/github-provider.js");
      vi.mocked(GitHubAuthProvider).mockImplementation(function MockGitHubAuthProvider() {
        return mockProvider as any;
      });
      mockConfig.authentication.mode = "github";
      await authManager.initialize(mockConfig);
    });

    it("should start OAuth flow with state", () => {
      const state = "oauth-state-123";

      const authUrl = authManager.startOAuthFlow(state);

      expect(authUrl).toBe(
        "https://github.com/login/oauth/authorize?state=oauth-state-123&code_challenge=",
      );
      expect(mockProvider.getAuthorizationUrl).toHaveBeenCalledWith(state, undefined);
    });

    it("should start OAuth flow with PKCE", () => {
      const state = "oauth-state-123";
      const codeChallenge = "code-challenge-456";

      const authUrl = authManager.startOAuthFlow(state, codeChallenge);

      expect(authUrl).toBe(
        "https://github.com/login/oauth/authorize?state=oauth-state-123&code_challenge=code-challenge-456",
      );
      expect(mockProvider.getAuthorizationUrl).toHaveBeenCalledWith(state, codeChallenge);
    });

    it("should throw error for non-OAuth provider", async () => {
      const localProvider = createMockProvider("local", "local", false, true);
      const localManager = new BrooklynAuthManager();
      const { LocalAuthProvider } = await import("../../../src/core/auth/local-provider.js");
      vi.mocked(LocalAuthProvider).mockImplementation(() => localProvider as any);

      mockConfig.authentication.mode = "local";
      await localManager.initialize(mockConfig);

      expect(() => localManager.startOAuthFlow("state")).toThrow(AuthenticationError);
      expect(() => localManager.startOAuthFlow("state")).toThrow("does not support OAuth flow");
    });

    it("should complete OAuth flow successfully", async () => {
      const code = "oauth-code-123";
      const state = "oauth-state-456";
      const codeVerifier = "code-verifier-789";

      vi.mocked(mockProvider.exchangeCodeForToken!).mockResolvedValue({
        accessToken: "access-token-123",
        tokenType: "Bearer",
        expiresIn: 3600,
      });

      const authResult = await authManager.completeOAuthFlow(code, state, codeVerifier);

      expect(authResult.success).toBe(true);
      expect(authResult.userId).toBe("github-user");
      expect(authResult.sessionToken).toBe("access-token-123");
      expect(mockProvider.exchangeCodeForToken).toHaveBeenCalledWith(code, state, codeVerifier);
    });

    it("should handle OAuth completion errors", async () => {
      vi.mocked(mockProvider.exchangeCodeForToken!).mockRejectedValue(
        new Error("Token exchange failed"),
      );

      await expect(authManager.completeOAuthFlow("code", "state")).rejects.toThrow(
        AuthenticationError,
      );
      await expect(authManager.completeOAuthFlow("code", "state")).rejects.toThrow(
        "OAuth flow completion failed",
      );
    });

    it("should handle OAuth authentication errors", async () => {
      vi.mocked(mockProvider.exchangeCodeForToken!).mockRejectedValue(
        new AuthenticationError("Invalid code", "INVALID_CODE", 400),
      );

      await expect(authManager.completeOAuthFlow("code", "state")).rejects.toThrow(
        AuthenticationError,
      );
      await expect(authManager.completeOAuthFlow("code", "state")).rejects.toThrow("Invalid code");
    });
  });

  describe("Credential Authentication", () => {
    let mockProvider: AuthProvider;

    beforeEach(async () => {
      mockProvider = createMockProvider("local", "local", false, true);
      const { LocalAuthProvider } = await import("../../../src/core/auth/local-provider.js");
      vi.mocked(LocalAuthProvider).mockImplementation(() => mockProvider as any);
      await authManager.initialize(mockConfig);
    });

    it("should authenticate credentials successfully", async () => {
      const username = "testuser";
      const password = "testpass";

      const authResult = await authManager.authenticateCredentials(username, password);

      expect(authResult.success).toBe(true);
      expect(authResult.userId).toBe("local-user");
      expect(authResult.sessionToken).toBe("local-session-token");
      expect(mockProvider.authenticateCredentials).toHaveBeenCalledWith(username, password);
      expect(mockProvider.createSession).toHaveBeenCalledWith("local-user", {
        username,
        teamId: undefined,
      });
    });

    it("should handle authentication failure", async () => {
      vi.mocked(mockProvider.authenticateCredentials!).mockResolvedValue({
        success: false,
        userId: "",
        permissions: [],
      });

      await expect(authManager.authenticateCredentials("user", "pass")).rejects.toThrow(
        AuthenticationError,
      );
      await expect(authManager.authenticateCredentials("user", "pass")).rejects.toThrow(
        "Invalid credentials",
      );
    });

    it("should handle provider errors", async () => {
      vi.mocked(mockProvider.authenticateCredentials!).mockRejectedValue(
        new Error("Database error"),
      );

      await expect(authManager.authenticateCredentials("user", "pass")).rejects.toThrow(
        AuthenticationError,
      );
      await expect(authManager.authenticateCredentials("user", "pass")).rejects.toThrow(
        "Credential authentication failed",
      );
    });

    it("should throw error for non-credential provider", async () => {
      const githubProvider = createMockProvider("github", "github", true, false);
      const githubManager = new BrooklynAuthManager();
      const { GitHubAuthProvider } = await import("../../../src/core/auth/github-provider.js");
      vi.mocked(GitHubAuthProvider).mockImplementation(() => githubProvider as any);

      mockConfig.authentication.mode = "github";
      await githubManager.initialize(mockConfig);

      await expect(githubManager.authenticateCredentials("user", "pass")).rejects.toThrow(
        AuthenticationError,
      );
      await expect(githubManager.authenticateCredentials("user", "pass")).rejects.toThrow(
        "does not support credential authentication",
      );
    });
  });

  describe("Session Management", () => {
    let mockProvider: AuthProvider;

    beforeEach(async () => {
      mockProvider = createMockProvider("local", "local", false, true);
      const { LocalAuthProvider } = await import("../../../src/core/auth/local-provider.js");
      vi.mocked(LocalAuthProvider).mockImplementation(() => mockProvider as any);
      await authManager.initialize(mockConfig);
    });

    it("should create session successfully", async () => {
      const userId = "user123";
      const metadata = { teamId: "team456" };

      const sessionToken = await authManager.createSession(userId, metadata);

      expect(sessionToken).toBe("local-session-token");
      expect(mockProvider.createSession).toHaveBeenCalledWith(userId, metadata);
    });

    it("should handle session creation failure", async () => {
      vi.mocked(mockProvider.createSession).mockResolvedValue("");

      await expect(authManager.createSession("user123")).rejects.toThrow(AuthenticationError);
    });

    it("should handle provider errors during session creation", async () => {
      vi.mocked(mockProvider.createSession).mockRejectedValue(new Error("Session creation failed"));

      await expect(authManager.createSession("user123")).rejects.toThrow(AuthenticationError);
      await expect(authManager.createSession("user123")).rejects.toThrow("Session creation failed");
    });

    it("should revoke session successfully", async () => {
      const sessionToken = "session-to-revoke";

      await expect(authManager.revokeSession(sessionToken)).resolves.not.toThrow();
      expect(mockProvider.revokeSession).toHaveBeenCalledWith(sessionToken);
    });

    it("should handle session revocation errors", async () => {
      vi.mocked(mockProvider.revokeSession).mockRejectedValue(new Error("Revocation failed"));

      await expect(authManager.revokeSession("session")).rejects.toThrow(AuthenticationError);
      await expect(authManager.revokeSession("session")).rejects.toThrow(
        "Session revocation failed",
      );
    });
  });

  describe("Development Mode", () => {
    it("should allow development mode for none provider", async () => {
      const mockProvider = createMockProvider("none", "none", false, false);
      const { NoneAuthProvider } = await import("../../../src/core/auth/none-provider.js");
      vi.mocked(NoneAuthProvider).mockImplementation(() => mockProvider as any);

      mockConfig.authentication.mode = "none";
      mockConfig.authentication.developmentOnly = true;

      await authManager.initialize(mockConfig);

      expect(authManager.isDevelopmentModeAllowed()).toBe(true);
    });

    it("should not allow development mode for other providers", async () => {
      const mockProvider = createMockProvider("local", "local", false, true);
      const { LocalAuthProvider } = await import("../../../src/core/auth/local-provider.js");
      vi.mocked(LocalAuthProvider).mockImplementation(() => mockProvider as any);

      mockConfig.authentication.mode = "local";
      mockConfig.authentication.developmentOnly = true;

      await authManager.initialize(mockConfig);

      expect(authManager.isDevelopmentModeAllowed()).toBe(false);
    });

    it("should return false when not initialized", () => {
      expect(authManager.isDevelopmentModeAllowed()).toBe(false);
    });
  });

  describe("Status Reporting", () => {
    it("should report unhealthy status when not initialized", () => {
      const status = authManager.getStatus();

      expect(status.mode).toBe("unknown");
      expect(status.provider).toBe("none");
      expect(status.healthy).toBe(false);
      expect(status.developmentOnly).toBeUndefined();
    });

    it("should report healthy status when initialized", async () => {
      const mockProvider = createMockProvider("local", "local", false, true);
      const { LocalAuthProvider } = await import("../../../src/core/auth/local-provider.js");
      vi.mocked(LocalAuthProvider).mockImplementation(() => mockProvider as any);

      await authManager.initialize(mockConfig);

      const status = authManager.getStatus();

      expect(status.mode).toBe("local");
      expect(status.provider).toBe("local");
      expect(status.healthy).toBe(true);
      expect(status.developmentOnly).toBe(false);
    });

    it("should report unhealthy status when provider is unhealthy", async () => {
      const mockProvider = createMockProvider("local", "local", false, true);
      vi.mocked(mockProvider.getStatus).mockReturnValue({ healthy: false });
      const { LocalAuthProvider } = await import("../../../src/core/auth/local-provider.js");
      vi.mocked(LocalAuthProvider).mockImplementation(() => mockProvider as any);

      await authManager.initialize(mockConfig);

      const status = authManager.getStatus();

      expect(status.healthy).toBe(false);
    });
  });

  describe("Cleanup", () => {
    it("should cleanup successfully", async () => {
      const mockProvider = createMockProvider("local", "local", false, true);
      const { LocalAuthProvider } = await import("../../../src/core/auth/local-provider.js");
      vi.mocked(LocalAuthProvider).mockImplementation(() => mockProvider as any);

      await authManager.initialize(mockConfig);

      await authManager.cleanup();

      expect(mockProvider.cleanup).toHaveBeenCalled();
      expect(() => authManager.getCurrentProvider()).toThrow(AuthenticationError);
    });

    it("should handle cleanup when not initialized", async () => {
      await expect(authManager.cleanup()).resolves.not.toThrow();
    });

    it("should handle provider cleanup errors", async () => {
      const mockProvider = createMockProvider("local", "local", false, true);
      vi.mocked(mockProvider.cleanup).mockRejectedValue(new Error("Cleanup failed"));
      const { LocalAuthProvider } = await import("../../../src/core/auth/local-provider.js");
      vi.mocked(LocalAuthProvider).mockImplementation(() => mockProvider as any);

      await authManager.initialize(mockConfig);

      // Provider cleanup errors are propagated
      await expect(authManager.cleanup()).rejects.toThrow("Cleanup failed");
    });
  });

  describe("Edge Cases", () => {
    let mockProvider: AuthProvider;

    beforeEach(async () => {
      mockProvider = createMockProvider("local", "local", false, true);
      const { LocalAuthProvider } = await import("../../../src/core/auth/local-provider.js");
      vi.mocked(LocalAuthProvider).mockImplementation(() => mockProvider as any);
      await authManager.initialize(mockConfig);
    });

    it("should handle empty token validation", async () => {
      // Mock the provider to return failure for empty token
      vi.mocked(mockProvider.validateToken).mockResolvedValue({
        success: false,
        userId: "",
        permissions: [],
      });

      await expect(authManager.validateRequest("")).rejects.toThrow(AuthenticationError);
      await expect(authManager.validateRequest("")).rejects.toThrow("Authentication failed");
    });

    it("should handle null provider responses", async () => {
      vi.mocked(mockProvider.validateToken).mockResolvedValue(null as any);

      await expect(authManager.validateRequest("token")).rejects.toThrow(AuthenticationError);
    });

    it("should handle undefined sessionToken in createSession", async () => {
      vi.mocked(mockProvider.createSession).mockResolvedValue(undefined as any);

      await expect(authManager.createSession("user")).rejects.toThrow(AuthenticationError);
    });

    it("should handle concurrent operations", async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        authManager.validateRequest(`token${i}`),
      );

      const results = await Promise.allSettled(promises);

      // All should resolve successfully
      for (const result of results) {
        expect(result.status).toBe("fulfilled");
      }
    });
  });
});
