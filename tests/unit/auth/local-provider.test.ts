/**
 * Unit tests for Local file-based authentication provider
 * Tests username/password authentication, user management, and file-based storage
 */

import { existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { LocalAuthProvider } from "../../../src/core/auth/local-provider.js";
import { AuthenticationError } from "../../../src/core/auth/types.js";
import type { BrooklynConfig } from "../../../src/core/config.js";

describe("LocalAuthProvider", () => {
  let provider: LocalAuthProvider;
  let mockConfig: BrooklynConfig;
  let testUserStorePath: string;

  beforeEach(() => {
    provider = new LocalAuthProvider();
    testUserStorePath = join(tmpdir(), `brooklyn-test-users-${Date.now()}.json`);

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
        mode: "local",
        developmentOnly: false,
        providers: {
          local: {
            userStore: testUserStorePath,
            sessionTimeout: 86400000, // 24 hours
            maxFailedAttempts: 5,
            lockoutDuration: 300000, // 5 minutes
          },
        },
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
  });

  afterEach(() => {
    // Clean up test user store file
    if (existsSync(testUserStorePath)) {
      rmSync(testUserStorePath);
    }
  });

  describe("initialization", () => {
    test("should initialize with valid local configuration", async () => {
      // Act
      await provider.initialize(mockConfig);

      // Assert
      expect(provider.name).toBe("local");
      expect(provider.type).toBe("local");
      const status = provider.getStatus();
      expect(status.healthy).toBe(true);
      expect(existsSync(testUserStorePath)).toBe(true);
    });

    test("should throw error when local configuration is missing", async () => {
      // Arrange
      mockConfig.authentication.providers.local = undefined;

      // Act & Assert
      await expect(provider.initialize(mockConfig)).rejects.toThrow(AuthenticationError);
      await expect(provider.initialize(mockConfig)).rejects.toThrow(
        "Local provider configuration missing",
      );
    });

    test("should create user store file if it doesn't exist", async () => {
      // Act
      await provider.initialize(mockConfig);

      // Assert
      expect(existsSync(testUserStorePath)).toBe(true);
    });

    test("should load existing user store file", async () => {
      // Arrange
      const existingStore = {
        users: {
          testuser: {
            id: "user_123",
            username: "testuser",
            passwordHash: "salt:hash",
            permissions: ["mcp:basic"],
            createdAt: "2025-08-17T00:00:00.000Z",
          },
        },
        version: "1.0",
        lastModified: "2025-08-17T00:00:00.000Z",
      };
      writeFileSync(testUserStorePath, JSON.stringify(existingStore));

      // Act
      await provider.initialize(mockConfig);

      // Assert
      const status = provider.getStatus();
      expect(status.healthy).toBe(true);
      const users = await provider.listUsers();
      expect(users).toHaveLength(1);
      expect(users[0]?.username).toBe("testuser");
    });

    test("should handle corrupted user store file", async () => {
      // Arrange
      writeFileSync(testUserStorePath, "invalid json");

      // Act & Assert
      await expect(provider.initialize(mockConfig)).rejects.toThrow(AuthenticationError);
      await expect(provider.initialize(mockConfig)).rejects.toThrow("Failed to load user store");
    });

    test("should use default configuration values", async () => {
      // Arrange
      mockConfig.authentication.providers.local = {
        userStore: testUserStorePath,
        sessionTimeout: 86400000, // Default 24 hours
      };

      // Act
      await provider.initialize(mockConfig);

      // Assert
      const status = provider.getStatus();
      expect(status.healthy).toBe(true);
    });
  });

  describe("user management", () => {
    beforeEach(async () => {
      await provider.initialize(mockConfig);
    });

    test("should create new user with default permissions", async () => {
      // Act
      const user = await provider.createUser("testuser", "password123");

      // Assert
      expect(user.username).toBe("testuser");
      expect(user.id).toMatch(/^user_\d+_[a-z0-9]+$/);
      expect(user.permissions).toEqual(["mcp:basic", "mcp:navigate", "mcp:screenshot"]);
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.passwordHash).toMatch(/^[a-f0-9]+:[a-f0-9]+$/);
    });

    test("should create user with custom options", async () => {
      // Act
      const user = await provider.createUser("admin", "admin123", {
        email: "admin@example.com",
        teamId: "admin-team",
        permissions: ["mcp:admin", "mcp:manage-users"],
        requirePasswordChange: true,
      });

      // Assert
      expect(user.username).toBe("admin");
      expect(user.email).toBe("admin@example.com");
      expect(user.teamId).toBe("admin-team");
      expect(user.permissions).toEqual(["mcp:admin", "mcp:manage-users"]);
      expect(user.requirePasswordChange).toBe(true);
    });

    test("should not create duplicate users", async () => {
      // Arrange
      await provider.createUser("testuser", "password123");

      // Act & Assert
      await expect(provider.createUser("testuser", "password456")).rejects.toThrow(
        AuthenticationError,
      );
      await expect(provider.createUser("testuser", "password456")).rejects.toThrow(
        "User already exists",
      );
    });

    test("should list all users", async () => {
      // Arrange
      await provider.createUser("user1", "password1");
      await provider.createUser("user2", "password2");

      // Act
      const users = await provider.listUsers();

      // Assert
      expect(users).toHaveLength(2);
      expect(users.map((u) => u.username)).toContain("user1");
      expect(users.map((u) => u.username)).toContain("user2");
    });

    test("should update user password", async () => {
      // Arrange
      await provider.createUser("testuser", "oldpassword", { requirePasswordChange: true });

      // Act
      await provider.updatePassword("testuser", "newpassword");

      // Assert
      const result = await provider.authenticateCredentials("testuser", "newpassword");
      expect(result.success).toBe(true);

      // Old password should not work
      await expect(provider.authenticateCredentials("testuser", "oldpassword")).rejects.toThrow(
        "Invalid username or password",
      );
    });

    test("should reset failed attempts when updating password", async () => {
      // Arrange
      await provider.createUser("testuser", "password");

      // Generate failed attempts
      for (let i = 0; i < 3; i++) {
        try {
          await provider.authenticateCredentials("testuser", "wrongpassword");
        } catch {
          // Expected
        }
      }

      // Act
      await provider.updatePassword("testuser", "newpassword");

      // Assert
      const result = await provider.authenticateCredentials("testuser", "newpassword");
      expect(result.success).toBe(true);
    });

    test("should delete user", async () => {
      // Arrange
      await provider.createUser("testuser", "password");

      // Act
      await provider.deleteUser("testuser");

      // Assert
      const users = await provider.listUsers();
      expect(users).toHaveLength(0);

      await expect(provider.authenticateCredentials("testuser", "password")).rejects.toThrow(
        "Invalid username or password",
      );
    });

    test("should throw error when updating non-existent user", async () => {
      // Act & Assert
      await expect(provider.updatePassword("nonexistent", "password")).rejects.toThrow(
        AuthenticationError,
      );
      await expect(provider.updatePassword("nonexistent", "password")).rejects.toThrow(
        "User not found",
      );
    });

    test("should throw error when deleting non-existent user", async () => {
      // Act & Assert
      await expect(provider.deleteUser("nonexistent")).rejects.toThrow(AuthenticationError);
      await expect(provider.deleteUser("nonexistent")).rejects.toThrow("User not found");
    });
  });

  describe("password authentication", () => {
    beforeEach(async () => {
      await provider.initialize(mockConfig);
      await provider.createUser("testuser", "password123", {
        teamId: "test-team",
        permissions: ["mcp:basic", "mcp:navigate"],
      });
    });

    test("should authenticate valid credentials", async () => {
      // Act
      const result = await provider.authenticateCredentials("testuser", "password123");

      // Assert
      expect(result.success).toBe(true);
      expect(result.userId).toMatch(/^user_\d+_[a-z0-9]+$/);
      expect(result.teamId).toBe("test-team");
      expect(result.permissions).toEqual(["mcp:basic", "mcp:navigate"]);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    });

    test("should reject invalid username", async () => {
      // Act & Assert
      await expect(provider.authenticateCredentials("nonexistent", "password123")).rejects.toThrow(
        AuthenticationError,
      );
      await expect(provider.authenticateCredentials("nonexistent", "password123")).rejects.toThrow(
        "Invalid username or password",
      );
    });

    test("should reject invalid password", async () => {
      // Act & Assert
      await expect(provider.authenticateCredentials("testuser", "wrongpassword")).rejects.toThrow(
        AuthenticationError,
      );
      await expect(provider.authenticateCredentials("testuser", "wrongpassword")).rejects.toThrow(
        "Invalid username or password",
      );
    });

    test("should update last login time on successful authentication", async () => {
      // Act
      await provider.authenticateCredentials("testuser", "password123");

      // Assert
      const users = await provider.listUsers();
      const user = users.find((u) => u.username === "testuser");
      expect(user?.lastLoginAt).toBeInstanceOf(Date);
      expect(user?.lastLoginAt?.getTime()).toBeGreaterThan(Date.now() - 5000); // Within last 5 seconds
    });
  });

  describe("account lockout and failed attempts", () => {
    beforeEach(async () => {
      await provider.initialize(mockConfig);
      await provider.createUser("testuser", "password123");
    });

    test("should track failed login attempts", async () => {
      // Act
      for (let i = 0; i < 3; i++) {
        try {
          await provider.authenticateCredentials("testuser", "wrongpassword");
        } catch {
          // Expected
        }
      }

      // Assert
      const users = await provider.listUsers();
      const user = users.find((u) => u.username === "testuser");
      expect(user?.failedAttempts).toBe(3);
    });

    test("should lock account after max failed attempts", async () => {
      // Arrange
      const maxAttempts = 5;

      // Override rate limiting for this test
      vi.spyOn(provider as any, "checkRateLimit").mockResolvedValue(undefined);

      // Act
      for (let i = 0; i < maxAttempts; i++) {
        try {
          await provider.authenticateCredentials("testuser", "wrongpassword");
        } catch {
          // Expected
        }
      }

      // Assert
      const users = await provider.listUsers();
      const user = users.find((u) => u.username === "testuser");
      expect(user?.lockedUntil).toBeInstanceOf(Date);
      expect(user?.lockedUntil?.getTime()).toBeGreaterThan(Date.now());

      // Should reject even with correct password
      await expect(provider.authenticateCredentials("testuser", "password123")).rejects.toThrow(
        AuthenticationError,
      );
      await expect(provider.authenticateCredentials("testuser", "password123")).rejects.toThrow(
        "Account locked until",
      );
    });

    test("should reset failed attempts on successful login", async () => {
      // Arrange
      for (let i = 0; i < 3; i++) {
        try {
          await provider.authenticateCredentials("testuser", "wrongpassword");
        } catch {
          // Expected
        }
      }

      // Act
      await provider.authenticateCredentials("testuser", "password123");

      // Assert
      const users = await provider.listUsers();
      const user = users.find((u) => u.username === "testuser");
      expect(user?.failedAttempts).toBe(0);
      expect(user?.lockedUntil).toBeUndefined();
    });

    test("should use custom lockout settings", async () => {
      // Arrange
      mockConfig.authentication.providers.local!.maxFailedAttempts = 2;
      mockConfig.authentication.providers.local!.lockoutDuration = 10000; // 10 seconds
      await provider.initialize(mockConfig);
      await provider.createUser("lockeduser", "password");

      // Override rate limiting for this test
      vi.spyOn(provider as any, "checkRateLimit").mockResolvedValue(undefined);

      // Act
      for (let i = 0; i < 2; i++) {
        try {
          await provider.authenticateCredentials("lockeduser", "wrongpassword");
        } catch {
          // Expected
        }
      }

      // Assert
      await expect(provider.authenticateCredentials("lockeduser", "password")).rejects.toThrow(
        "Account locked until",
      );
    });
  });

  describe("token validation", () => {
    beforeEach(async () => {
      await provider.initialize(mockConfig);
      await provider.createUser("testuser", "password123", {
        teamId: "test-team",
        permissions: ["mcp:basic", "mcp:navigate"],
      });
    });

    test("should validate valid session token", async () => {
      // Arrange
      const authResult = await provider.authenticateCredentials("testuser", "password123");
      const sessionToken = await provider.createSession(authResult.userId, {
        teamId: authResult.teamId,
      });

      // Act
      const result = await provider.validateToken(sessionToken);

      // Assert
      expect(result.success).toBe(true);
      expect(result.userId).toBe(authResult.userId);
      expect(result.sessionToken).toBe(sessionToken);
    });

    test("should reject invalid session token", async () => {
      // Act
      const result = await provider.validateToken("invalid-token");

      // Assert
      expect(result.success).toBe(false);
      expect(result.userId).toBe("");
      expect(result.permissions).toEqual([]);
    });

    test("should reject expired session token", async () => {
      // Arrange
      const authResult = await provider.authenticateCredentials("testuser", "password123");

      // Create a session manually with expired date using internal generateSessionToken
      const sessionToken = (provider as any).generateSessionToken();
      const expiredSession = {
        id: sessionToken,
        userId: authResult.userId,
        teamId: authResult.teamId || "",
        createdAt: new Date(Date.now() - 2000),
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        lastAccessedAt: new Date(Date.now() - 2000),
        metadata: {},
      };
      (provider as any).sessions.set(sessionToken, expiredSession);

      // Act
      const result = await provider.validateToken(sessionToken);

      // Assert
      expect(result.success).toBe(false);
    });

    test("should handle token for non-existent user", async () => {
      // Arrange
      const sessionToken = await provider.createSession("nonexistent-user", { teamId: "team" });

      // Act
      const result = await provider.validateToken(sessionToken);

      // Assert
      expect(result.success).toBe(false);
    });
  });

  describe("user information retrieval", () => {
    beforeEach(async () => {
      await provider.initialize(mockConfig);
      await provider.createUser("testuser", "password123", {
        email: "test@example.com",
        teamId: "test-team",
      });
    });

    test("should get user information with valid token", async () => {
      // Arrange
      const authResult = await provider.authenticateCredentials("testuser", "password123");
      const sessionToken = await provider.createSession(authResult.userId, {
        teamId: authResult.teamId,
      });

      // Act
      const userInfo = await provider.getUserInfo(sessionToken);

      // Assert
      expect(userInfo.id).toBe(authResult.userId);
      expect(userInfo.username).toBe("testuser");
      expect(userInfo.email).toBe("test@example.com");
      expect(userInfo.displayName).toBe("testuser");
    });

    test("should throw error for invalid token", async () => {
      // Act & Assert
      await expect(provider.getUserInfo("invalid-token")).rejects.toThrow(AuthenticationError);
      await expect(provider.getUserInfo("invalid-token")).rejects.toThrow("Invalid session token");
    });

    test("should throw error for token with non-existent user", async () => {
      // Arrange
      const sessionToken = await provider.createSession("nonexistent-user", { teamId: "team" });

      // Act & Assert
      await expect(provider.getUserInfo(sessionToken)).rejects.toThrow(AuthenticationError);
      await expect(provider.getUserInfo(sessionToken)).rejects.toThrow("User not found");
    });
  });

  describe("password hashing", () => {
    beforeEach(async () => {
      await provider.initialize(mockConfig);
    });

    test("should create different hashes for same password", async () => {
      // Act
      const user1 = await provider.createUser("user1", "password123");
      const user2 = await provider.createUser("user2", "password123");

      // Assert
      expect(user1.passwordHash).not.toBe(user2.passwordHash);
      expect(user1.passwordHash).toMatch(/^[a-f0-9]+:[a-f0-9]+$/);
      expect(user2.passwordHash).toMatch(/^[a-f0-9]+:[a-f0-9]+$/);
    });

    test("should verify passwords correctly", async () => {
      // Arrange
      await provider.createUser("testuser", "correct-password");

      // Act & Assert
      const validResult = await provider.authenticateCredentials("testuser", "correct-password");
      expect(validResult.success).toBe(true);

      await expect(provider.authenticateCredentials("testuser", "wrong-password")).rejects.toThrow(
        "Invalid username or password",
      );
    });

    test("should handle malformed password hashes", async () => {
      // Arrange
      const corruptedStore = {
        users: {
          testuser: {
            id: "user_123",
            username: "testuser",
            passwordHash: "invalid-hash-format",
            permissions: ["mcp:basic"],
            createdAt: new Date().toISOString(),
          },
        },
        version: "1.0",
        lastModified: new Date().toISOString(),
      };
      writeFileSync(testUserStorePath, JSON.stringify(corruptedStore));
      await provider.initialize(mockConfig);

      // Act & Assert
      await expect(provider.authenticateCredentials("testuser", "any-password")).rejects.toThrow(
        "Invalid username or password",
      );
    });
  });

  describe("error handling", () => {
    test("should throw error when calling methods on uninitialized provider", async () => {
      // Arrange
      const uninitializedProvider = new LocalAuthProvider();

      // Act & Assert
      await expect(uninitializedProvider.authenticateCredentials("user", "pass")).rejects.toThrow(
        "Authentication provider not initialized",
      );
      await expect(uninitializedProvider.validateToken("token")).rejects.toThrow(
        "Authentication provider not initialized",
      );
      await expect(uninitializedProvider.getUserInfo("token")).rejects.toThrow(
        "Authentication provider not initialized",
      );
      await expect(uninitializedProvider.createUser("user", "pass")).rejects.toThrow(
        "Authentication provider not initialized",
      );
      await expect(uninitializedProvider.listUsers()).rejects.toThrow(
        "Authentication provider not initialized",
      );
    });

    test.skip("should handle file system errors during save", async () => {
      // Arrange
      await provider.initialize(mockConfig);

      // Mock fs.writeFileSync to throw an error
      const _originalWriteFileSync = vi.mocked(writeFileSync);
      vi.doMock("node:fs", () => ({
        writeFileSync: vi.fn().mockImplementation(() => {
          throw new Error("Disk full");
        }),
        existsSync: vi.fn().mockReturnValue(true),
        readFileSync: vi.fn().mockReturnValue(
          JSON.stringify({
            users: {},
            version: "1.0",
            lastModified: new Date().toISOString(),
          }),
        ),
      }));

      // Act & Assert
      await expect(provider.createUser("testuser", "password")).rejects.toThrow(
        AuthenticationError,
      );
      await expect(provider.createUser("testuser", "password")).rejects.toThrow(
        "Failed to save user store",
      );
    });

    test("should handle rate limiting", async () => {
      // Arrange
      await provider.initialize(mockConfig);

      // Mock rate limiting to always fail
      vi.spyOn(provider as any, "checkRateLimit").mockRejectedValue(
        new AuthenticationError("Rate limit exceeded", "RATE_LIMIT_EXCEEDED", 429),
      );

      // Act & Assert
      await expect(provider.authenticateCredentials("user", "pass")).rejects.toThrow(
        "Rate limit exceeded",
      );
    });
  });

  describe("session timeout configuration", () => {
    test("should use custom session timeout", async () => {
      // Arrange
      const customTimeout = 3600000; // 1 hour
      mockConfig.authentication.providers.local!.sessionTimeout = customTimeout;
      await provider.initialize(mockConfig);
      await provider.createUser("testuser", "password");

      // Act
      const result = await provider.authenticateCredentials("testuser", "password");

      // Assert
      expect(result.expiresAt).toBeInstanceOf(Date);
      const expectedExpiry = Date.now() + customTimeout;
      const actualExpiry = result.expiresAt!.getTime();
      expect(Math.abs(actualExpiry - expectedExpiry)).toBeLessThan(1000); // Within 1 second
    });
  });
});
