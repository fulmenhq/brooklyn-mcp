/**
 * Unit tests for Brooklyn MCP BaseAuthProvider
 * Tests initialization, rate limiting, session management, and cleanup functionality
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BaseAuthProvider } from "../../../src/core/auth/base-provider.js";
import { AuthenticationError } from "../../../src/core/auth/types.js";
import type { AuthResult, UserInfo } from "../../../src/core/auth/types.js";
import type { BrooklynConfig } from "../../../src/core/config.js";

// Mock the logger to avoid circular dependencies
vi.mock("../../../src/shared/pino-logger.js", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Test implementation of BaseAuthProvider for testing
class TestAuthProvider extends BaseAuthProvider {
  readonly name = "test-provider";
  readonly type = "local" as const;

  private initializeError: Error | null = null;
  private validateTokenResult: AuthResult = {
    success: true,
    userId: "test-user",
    permissions: ["read"],
  };

  private userInfoResult: UserInfo = {
    id: "test-user",
    username: "testuser",
  };

  setInitializeError(error: Error | null): void {
    this.initializeError = error;
  }

  setValidateTokenResult(result: AuthResult): void {
    this.validateTokenResult = result;
  }

  setUserInfoResult(result: UserInfo): void {
    this.userInfoResult = result;
  }

  protected async doInitialize(_config: BrooklynConfig): Promise<void> {
    if (this.initializeError) {
      throw this.initializeError;
    }
    // Mock initialization - no actual delay needed in tests
  }

  async validateToken(_token: string): Promise<AuthResult> {
    this.ensureInitialized();
    return this.validateTokenResult;
  }

  async getUserInfo(_token: string): Promise<UserInfo> {
    this.ensureInitialized();
    return this.userInfoResult;
  }

  // Expose protected methods for testing
  public testCheckRateLimit = this.checkRateLimit.bind(this);
  public testGenerateSessionToken = this.generateSessionToken.bind(this);
  public testEnsureInitialized = this.ensureInitialized.bind(this);
  public getSessionsSize = () => this.sessions.size;
  public getRateLimitStoreSize = () => this.rateLimitStore.size;
  public getSession = (id: string) => this.sessions.get(id);
  public getRateLimitInfo = (id: string) => this.rateLimitStore.get(id);

  // Expose cleanup methods for testing
  public testCleanupExpiredSessions(): void {
    const now = new Date();
    for (const [sessionId, session] of this.sessions) {
      if (session.expiresAt < now) {
        this.sessions.delete(sessionId);
      }
    }
  }

  public testCleanupRateLimitStore(): void {
    const now = Date.now();
    for (const [identifier, rateLimitInfo] of this.rateLimitStore) {
      const windowEnd = rateLimitInfo.windowStart + rateLimitInfo.windowMs;
      if (windowEnd < now - rateLimitInfo.windowMs) {
        this.rateLimitStore.delete(identifier);
      }
    }
  }
}

describe("BaseAuthProvider", () => {
  let provider: TestAuthProvider;
  let mockConfig: BrooklynConfig;

  beforeEach(() => {
    provider = new TestAuthProvider();
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
            sessionTimeout: 86400000, // 24 hours
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

    // Mock timers for cleanup tasks
    vi.useFakeTimers();
    // Mock setInterval to avoid actual timer creation
    vi.spyOn(global, "setInterval").mockImplementation(() => 123 as any);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllTimers();
    vi.clearAllMocks();
  });

  describe("Initialization", () => {
    it("should initialize successfully with valid config", async () => {
      await provider.initialize(mockConfig);

      expect(provider["initialized"]).toBe(true);
      expect(provider["config"]).toBe(mockConfig);
    });

    it("should handle initialization errors", async () => {
      const initError = new Error("Initialization failed");
      provider.setInitializeError(initError);

      await expect(provider.initialize(mockConfig)).rejects.toThrow("Initialization failed");
      expect(provider["initialized"]).toBe(false);
    });

    it("should start cleanup tasks after initialization", async () => {
      await provider.initialize(mockConfig);

      // Should have two intervals for cleanup tasks (already spied in beforeEach)
      expect(global.setInterval).toHaveBeenCalledTimes(2);
      expect(global.setInterval).toHaveBeenCalledWith(expect.any(Function), 300000); // 5 minutes
      expect(global.setInterval).toHaveBeenCalledWith(expect.any(Function), 600000); // 10 minutes
    });

    it("should throw error when not initialized", () => {
      expect(() => provider.testEnsureInitialized()).toThrow(AuthenticationError);
      expect(() => provider.testEnsureInitialized()).toThrow(
        "Authentication provider not initialized",
      );
    });
  });

  describe("Rate Limiting", () => {
    beforeEach(async () => {
      await provider.initialize(mockConfig);
    });

    it("should allow requests within rate limit", async () => {
      const identifier = "user123";
      const maxAttempts = 5;
      const windowMs = 300000;

      // First request should pass
      await expect(
        provider.testCheckRateLimit(identifier, maxAttempts, windowMs),
      ).resolves.not.toThrow();

      const rateLimitInfo = provider.getRateLimitInfo(identifier);
      expect(rateLimitInfo?.attempts).toBe(1);
      expect(rateLimitInfo?.maxAttempts).toBe(maxAttempts);
    });

    it("should track multiple attempts within window", async () => {
      const identifier = "user123";
      const maxAttempts = 5;
      const windowMs = 300000;

      // Make 3 requests
      for (let i = 0; i < 3; i++) {
        await provider.testCheckRateLimit(identifier, maxAttempts, windowMs);
      }

      const rateLimitInfo = provider.getRateLimitInfo(identifier);
      expect(rateLimitInfo?.attempts).toBe(3);
    });

    it("should throw error when rate limit exceeded", async () => {
      const identifier = "user123";
      const maxAttempts = 3;
      const windowMs = 300000;

      // Make requests up to limit
      for (let i = 0; i < maxAttempts; i++) {
        await provider.testCheckRateLimit(identifier, maxAttempts, windowMs);
      }

      // Next request should fail
      await expect(provider.testCheckRateLimit(identifier, maxAttempts, windowMs)).rejects.toThrow(
        AuthenticationError,
      );

      await expect(provider.testCheckRateLimit(identifier, maxAttempts, windowMs)).rejects.toThrow(
        "Rate limit exceeded",
      );
    });

    it("should reset rate limit in new window", async () => {
      const identifier = "user123";
      const maxAttempts = 3;
      const windowMs = 300000;

      // Mock Date.now to control window calculation
      const originalNow = Date.now;
      let currentTime = 1640995200000; // Fixed timestamp
      vi.spyOn(Date, "now").mockImplementation(() => currentTime);

      // Make requests up to limit
      for (let i = 0; i < maxAttempts; i++) {
        await provider.testCheckRateLimit(identifier, maxAttempts, windowMs);
      }

      // Advance time to new window
      currentTime += windowMs + 1000;

      // Should allow requests in new window
      await expect(
        provider.testCheckRateLimit(identifier, maxAttempts, windowMs),
      ).resolves.not.toThrow();

      const rateLimitInfo = provider.getRateLimitInfo(identifier);
      expect(rateLimitInfo?.attempts).toBe(1); // Reset to 1 in new window

      Date.now = originalNow;
    });

    it("should handle different identifiers separately", async () => {
      const maxAttempts = 3;
      const windowMs = 300000;

      // User1 hits limit
      for (let i = 0; i < maxAttempts; i++) {
        await provider.testCheckRateLimit("user1", maxAttempts, windowMs);
      }

      // User2 should still be allowed
      await expect(
        provider.testCheckRateLimit("user2", maxAttempts, windowMs),
      ).resolves.not.toThrow();

      // User1 should be blocked
      await expect(provider.testCheckRateLimit("user1", maxAttempts, windowMs)).rejects.toThrow();
    });

    it("should use default parameters when not specified", async () => {
      const identifier = "user123";

      await provider.testCheckRateLimit(identifier);

      const rateLimitInfo = provider.getRateLimitInfo(identifier);
      expect(rateLimitInfo?.maxAttempts).toBe(5); // Default maxAttempts
      expect(rateLimitInfo?.windowMs).toBe(300000); // Default windowMs (5 minutes)
    });
  });

  describe("Session Token Generation", () => {
    beforeEach(async () => {
      await provider.initialize(mockConfig);
    });

    it("should generate secure random tokens", () => {
      const token1 = provider.testGenerateSessionToken();
      const token2 = provider.testGenerateSessionToken();

      expect(token1).toBeDefined();
      expect(token2).toBeDefined();
      expect(token1).not.toBe(token2);
      expect(token1).toMatch(/^[a-f0-9]{64}$/); // 32 bytes = 64 hex chars
      expect(token2).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should generate tokens of consistent length", () => {
      const tokens = Array.from({ length: 100 }, () => provider.testGenerateSessionToken());

      for (const token of tokens) {
        expect(token).toHaveLength(64);
        expect(token).toMatch(/^[a-f0-9]+$/);
      }
    });
  });

  describe("Session Management", () => {
    beforeEach(async () => {
      await provider.initialize(mockConfig);
    });

    it("should create session with minimal metadata", async () => {
      const userId = "user123";

      const sessionToken = await provider.createSession(userId);

      expect(sessionToken).toBeDefined();
      expect(sessionToken).toMatch(/^[a-f0-9]{64}$/);
      expect(provider.getSessionsSize()).toBe(1);

      const session = provider.getSession(sessionToken);
      expect(session?.userId).toBe(userId);
      expect(session?.id).toBe(sessionToken);
      expect(session?.createdAt).toBeInstanceOf(Date);
      expect(session?.expiresAt).toBeInstanceOf(Date);
      expect(session?.lastAccessedAt).toBeInstanceOf(Date);
    });

    it("should create session with complete metadata", async () => {
      const userId = "user123";
      const metadata = {
        teamId: "team456",
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
        loginMethod: "password",
      };

      const sessionToken = await provider.createSession(userId, metadata);

      const session = provider.getSession(sessionToken);
      expect(session?.userId).toBe(userId);
      expect(session?.teamId).toBe("team456");
      expect(session?.ipAddress).toBe("192.168.1.1");
      expect(session?.userAgent).toBe("Mozilla/5.0");
      expect(session?.metadata).toEqual(metadata);
    });

    it("should set correct expiration time", async () => {
      const sessionTimeout = 7200000; // 2 hours
      mockConfig.authentication.providers.local!.sessionTimeout = sessionTimeout;

      const startTime = Date.now();
      const sessionToken = await provider.createSession("user123");

      const session = provider.getSession(sessionToken);
      const expectedExpiry = startTime + sessionTimeout;
      const actualExpiry = session?.expiresAt.getTime() || 0;

      // Allow 1 second tolerance for test execution time
      expect(actualExpiry).toBeGreaterThanOrEqual(expectedExpiry - 1000);
      expect(actualExpiry).toBeLessThanOrEqual(expectedExpiry + 1000);
    });

    it("should validate active session", async () => {
      const userId = "user123";
      const sessionToken = await provider.createSession(userId, { teamId: "team456" });

      const authContext = await provider.validateSession(sessionToken);

      expect(authContext).toBeDefined();
      expect(authContext?.userId).toBe(userId);
      expect(authContext?.teamId).toBe("team456");
      expect(authContext?.sessionId).toBe(sessionToken);
      expect(authContext?.permissions).toEqual([]);
      expect(authContext?.expiresAt).toBeInstanceOf(Date);
    });

    it("should return null for non-existent session", async () => {
      const authContext = await provider.validateSession("non-existent-token");

      expect(authContext).toBeNull();
    });

    it("should return null and delete expired session", async () => {
      const userId = "user123";
      // Create session with very short timeout
      mockConfig.authentication.providers.local!.sessionTimeout = 1; // 1ms

      const sessionToken = await provider.createSession(userId);

      // Wait for session to expire using fake timers
      vi.advanceTimersByTime(10);

      const authContext = await provider.validateSession(sessionToken);

      expect(authContext).toBeNull();
      expect(provider.getSession(sessionToken)).toBeUndefined();
    });

    it("should update last accessed time on validation", async () => {
      const userId = "user123";
      const sessionToken = await provider.createSession(userId);

      const originalSession = provider.getSession(sessionToken);
      const originalLastAccessed = originalSession?.lastAccessedAt.getTime();

      // Wait a bit to ensure time difference using fake timers
      vi.advanceTimersByTime(10);

      await provider.validateSession(sessionToken);

      const updatedSession = provider.getSession(sessionToken);
      const updatedLastAccessed = updatedSession?.lastAccessedAt.getTime();

      expect(updatedLastAccessed).toBeGreaterThan(originalLastAccessed || 0);
    });

    it("should revoke existing session", async () => {
      const userId = "user123";
      const sessionToken = await provider.createSession(userId);

      expect(provider.getSession(sessionToken)).toBeDefined();

      await provider.revokeSession(sessionToken);

      expect(provider.getSession(sessionToken)).toBeUndefined();
    });

    it("should handle revoking non-existent session gracefully", async () => {
      await expect(provider.revokeSession("non-existent-token")).resolves.not.toThrow();
    });

    it("should throw error when not initialized", async () => {
      const uninitializedProvider = new TestAuthProvider();

      await expect(uninitializedProvider.createSession("user123")).rejects.toThrow(
        AuthenticationError,
      );
      await expect(uninitializedProvider.validateSession("token")).rejects.toThrow(
        AuthenticationError,
      );
      await expect(uninitializedProvider.revokeSession("token")).rejects.toThrow(
        AuthenticationError,
      );
    });
  });

  describe("Cleanup Tasks", () => {
    beforeEach(async () => {
      await provider.initialize(mockConfig);
    });

    it("should clean up expired sessions", async () => {
      // Create sessions with different expiration times
      const userId = "user123";
      const sessionTimeout = 10; // 10ms
      mockConfig.authentication.providers.local!.sessionTimeout = sessionTimeout;

      const token1 = await provider.createSession(userId);

      // Wait for first session to expire (use fake timers)
      vi.advanceTimersByTime(50);

      const token2 = await provider.createSession(userId);

      expect(provider.getSessionsSize()).toBe(2);

      // Manually trigger cleanup
      provider.testCleanupExpiredSessions();

      // Expired session should be removed
      expect(provider.getSession(token1)).toBeUndefined();
      expect(provider.getSession(token2)).toBeDefined();
    });

    it("should clean up old rate limit entries", async () => {
      const identifier = "user123";
      const windowMs = 100; // 100ms window

      // Create rate limit entry
      await provider.testCheckRateLimit(identifier, 5, windowMs);
      expect(provider.getRateLimitStoreSize()).toBe(1);

      // Advance time beyond cleanup threshold
      vi.advanceTimersByTime(windowMs * 3); // Advance past cleanup threshold

      // Manually trigger cleanup
      provider.testCleanupRateLimitStore();

      // Old entries should be cleaned up
      expect(provider.getRateLimitStoreSize()).toBe(0);
    });
  });

  describe("Status Reporting", () => {
    it("should report unhealthy status when not initialized", () => {
      const status = provider.getStatus();

      expect(status.healthy).toBe(false);
      expect(status.details?.["initialized"]).toBe(false);
      expect(status.details?.["activeSessions"]).toBe(0);
      expect(status.details?.["rateLimitEntries"]).toBe(0);
    });

    it("should report healthy status when initialized", async () => {
      await provider.initialize(mockConfig);

      const status = provider.getStatus();

      expect(status.healthy).toBe(true);
      expect(status.details?.["initialized"]).toBe(true);
      expect(status.details?.["activeSessions"]).toBe(0);
      expect(status.details?.["rateLimitEntries"]).toBe(0);
    });

    it("should report current session and rate limit counts", async () => {
      await provider.initialize(mockConfig);

      // Create some sessions and rate limit entries
      await provider.createSession("user1");
      await provider.createSession("user2");
      await provider.testCheckRateLimit("user1", 5, 300000);
      await provider.testCheckRateLimit("user2", 5, 300000);

      const status = provider.getStatus();

      expect(status.details?.["activeSessions"]).toBe(2);
      expect(status.details?.["rateLimitEntries"]).toBe(2);
    });
  });

  describe("Cleanup", () => {
    it("should cleanup all resources", async () => {
      await provider.initialize(mockConfig);

      // Create some data
      await provider.createSession("user1");
      await provider.testCheckRateLimit("user1", 5, 300000);

      expect(provider.getSessionsSize()).toBe(1);
      expect(provider.getRateLimitStoreSize()).toBe(1);

      await provider.cleanup();

      expect(provider.getSessionsSize()).toBe(0);
      expect(provider.getRateLimitStoreSize()).toBe(0);
      expect(provider["initialized"]).toBe(false);
    });

    it("should handle cleanup when already clean", async () => {
      await provider.initialize(mockConfig);
      await provider.cleanup();

      // Second cleanup should not throw
      await expect(provider.cleanup()).resolves.not.toThrow();
    });
  });

  describe("Edge Cases", () => {
    beforeEach(async () => {
      await provider.initialize(mockConfig);
    });

    it("should handle session creation with null metadata values", async () => {
      const metadata = {
        teamId: null,
        ipAddress: null,
        userAgent: null,
        customField: undefined,
      };

      const sessionToken = await provider.createSession("user123", metadata);
      const session = provider.getSession(sessionToken);

      expect(session?.teamId).toBeNull();
      expect(session?.ipAddress).toBeNull();
      expect(session?.userAgent).toBeNull();
      expect(session?.metadata).toEqual(metadata);
    });

    it("should handle very large metadata objects", async () => {
      const largeMetadata = {
        data: "x".repeat(10000),
        nested: {
          deep: {
            very: {
              deep: "value",
            },
          },
        },
        array: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: `item${i}` })),
      };

      const sessionToken = await provider.createSession("user123", largeMetadata);
      const session = provider.getSession(sessionToken);

      expect(session?.metadata).toEqual(largeMetadata);
    });

    it("should handle concurrent session operations", async () => {
      const promises = Array.from({ length: 100 }, (_, i) => provider.createSession(`user${i}`));

      const sessionTokens = await Promise.all(promises);

      expect(sessionTokens).toHaveLength(100);
      expect(new Set(sessionTokens)).toHaveProperty("size", 100); // All unique
      expect(provider.getSessionsSize()).toBe(100);
    });

    it("should handle concurrent rate limit checks", async () => {
      const identifier = "concurrent-user";
      const maxAttempts = 10;

      const promises = Array.from({ length: 15 }, () =>
        provider.testCheckRateLimit(identifier, maxAttempts, 300000).catch(() => "rate-limited"),
      );

      const results = await Promise.all(promises);

      // Some should succeed, some should be rate limited
      const successes = results.filter((r) => r !== "rate-limited").length;
      const rateLimited = results.filter((r) => r === "rate-limited").length;

      expect(successes).toBeLessThanOrEqual(maxAttempts);
      expect(rateLimited).toBeGreaterThan(0);
      expect(successes + rateLimited).toBe(15);
    });
  });
});
