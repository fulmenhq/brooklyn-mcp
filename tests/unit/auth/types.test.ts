/**
 * Unit tests for Brooklyn MCP authentication types and error classes
 * Tests error class behavior, inheritance, and type validation
 */

import { describe, expect, it } from "vitest";
import { AuthenticationError, AuthorizationError } from "../../../src/core/auth/types.js";
import type {
  AuthContext,
  AuthResult,
  OrganizationInfo,
  RateLimitInfo,
  Session,
  TeamInfo,
  TokenResult,
  UserAccount,
  UserInfo,
} from "../../../src/core/auth/types.js";

describe("AuthenticationError", () => {
  it("should create error with all parameters", () => {
    const details = { reason: "invalid_token", timestamp: new Date().toISOString() };
    const error = new AuthenticationError("Invalid token", "INVALID_TOKEN", 401, details);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AuthenticationError);
    expect(error.name).toBe("AuthenticationError");
    expect(error.message).toBe("Invalid token");
    expect(error.code).toBe("INVALID_TOKEN");
    expect(error.statusCode).toBe(401);
    expect(error.details).toEqual(details);
  });

  it("should use default statusCode when not provided", () => {
    const error = new AuthenticationError("Default status", "DEFAULT_CODE");

    expect(error.statusCode).toBe(401);
    expect(error.details).toBeUndefined();
  });

  it("should handle undefined details", () => {
    const error = new AuthenticationError("No details", "NO_DETAILS", 401);

    expect(error.details).toBeUndefined();
  });

  it("should have proper error inheritance", () => {
    const error = new AuthenticationError("Test", "TEST");

    expect(error instanceof Error).toBe(true);
    expect(error instanceof AuthenticationError).toBe(true);
    expect(error.constructor.name).toBe("AuthenticationError");
  });

  it("should preserve stack trace", () => {
    const error = new AuthenticationError("Stack test", "STACK_TEST");

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain("AuthenticationError");
  });

  it("should handle complex details object", () => {
    const complexDetails = {
      nested: {
        data: "value",
        array: [1, 2, 3],
      },
      null_value: null,
      undefined_value: undefined,
      number: 42,
      boolean: true,
    };

    const error = new AuthenticationError("Complex", "COMPLEX", 401, complexDetails);

    expect(error.details).toEqual(complexDetails);
  });
});

describe("AuthorizationError", () => {
  it("should create error with all parameters", () => {
    const details = { required_permission: "admin", user_permission: "user" };
    const error = new AuthorizationError(
      "Insufficient permissions",
      "INSUFFICIENT_PERMS",
      403,
      details,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AuthorizationError);
    expect(error.name).toBe("AuthorizationError");
    expect(error.message).toBe("Insufficient permissions");
    expect(error.code).toBe("INSUFFICIENT_PERMS");
    expect(error.statusCode).toBe(403);
    expect(error.details).toEqual(details);
  });

  it("should use default statusCode when not provided", () => {
    const error = new AuthorizationError("Default status", "DEFAULT_CODE");

    expect(error.statusCode).toBe(403);
    expect(error.details).toBeUndefined();
  });

  it("should handle undefined details", () => {
    const error = new AuthorizationError("No details", "NO_DETAILS", 403);

    expect(error.details).toBeUndefined();
  });

  it("should have proper error inheritance", () => {
    const error = new AuthorizationError("Test", "TEST");

    expect(error instanceof Error).toBe(true);
    expect(error instanceof AuthorizationError).toBe(true);
    expect(error.constructor.name).toBe("AuthorizationError");
  });

  it("should preserve stack trace", () => {
    const error = new AuthorizationError("Stack test", "STACK_TEST");

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain("AuthorizationError");
  });

  it("should be distinct from AuthenticationError", () => {
    const authNError = new AuthenticationError("Auth failed", "AUTH_FAILED");
    const authZError = new AuthorizationError("Access denied", "ACCESS_DENIED");

    expect(authNError instanceof AuthenticationError).toBe(true);
    expect(authNError instanceof AuthorizationError).toBe(false);

    expect(authZError instanceof AuthorizationError).toBe(true);
    expect(authZError instanceof AuthenticationError).toBe(false);

    expect(authNError.name).toBe("AuthenticationError");
    expect(authZError.name).toBe("AuthorizationError");
  });
});

describe("Type Interfaces Validation", () => {
  describe("AuthResult", () => {
    it("should validate minimal AuthResult structure", () => {
      const authResult: AuthResult = {
        success: true,
        userId: "user123",
        permissions: ["read", "write"],
      };

      expect(authResult.success).toBe(true);
      expect(authResult.userId).toBe("user123");
      expect(authResult.permissions).toEqual(["read", "write"]);
      expect(authResult.teamId).toBeUndefined();
      expect(authResult.expiresAt).toBeUndefined();
    });

    it("should validate complete AuthResult structure", () => {
      const expiresAt = new Date();
      const metadata = { provider: "github", scopes: ["repo"] };

      const authResult: AuthResult = {
        success: false,
        userId: "user456",
        teamId: "team789",
        permissions: ["admin"],
        expiresAt,
        sessionToken: "session_abc123",
        metadata,
      };

      expect(authResult.success).toBe(false);
      expect(authResult.userId).toBe("user456");
      expect(authResult.teamId).toBe("team789");
      expect(authResult.permissions).toEqual(["admin"]);
      expect(authResult.expiresAt).toBe(expiresAt);
      expect(authResult.sessionToken).toBe("session_abc123");
      expect(authResult.metadata).toEqual(metadata);
    });
  });

  describe("UserInfo", () => {
    it("should validate minimal UserInfo structure", () => {
      const userInfo: UserInfo = {
        id: "user123",
        username: "testuser",
      };

      expect(userInfo.id).toBe("user123");
      expect(userInfo.username).toBe("testuser");
      expect(userInfo.email).toBeUndefined();
    });

    it("should validate complete UserInfo structure", () => {
      const organizations: OrganizationInfo[] = [{ id: "org1", name: "Org One", role: "admin" }];
      const teams: TeamInfo[] = [
        { id: "team1", name: "Team One", organizationId: "org1", role: "member" },
      ];

      const userInfo: UserInfo = {
        id: "user123",
        username: "testuser",
        email: "test@example.com",
        displayName: "Test User",
        avatarUrl: "https://example.com/avatar.png",
        organizations,
        teams,
      };

      expect(userInfo.organizations).toEqual(organizations);
      expect(userInfo.teams).toEqual(teams);
    });
  });

  describe("TokenResult", () => {
    it("should validate minimal TokenResult structure", () => {
      const tokenResult: TokenResult = {
        accessToken: "access_token_123",
        tokenType: "Bearer",
      };

      expect(tokenResult.accessToken).toBe("access_token_123");
      expect(tokenResult.tokenType).toBe("Bearer");
      expect(tokenResult.expiresIn).toBeUndefined();
    });

    it("should validate complete TokenResult structure", () => {
      const tokenResult: TokenResult = {
        accessToken: "access_token_123",
        tokenType: "Bearer",
        expiresIn: 3600,
        refreshToken: "refresh_token_456",
        scope: "read write admin",
      };

      expect(tokenResult.expiresIn).toBe(3600);
      expect(tokenResult.refreshToken).toBe("refresh_token_456");
      expect(tokenResult.scope).toBe("read write admin");
    });
  });

  describe("AuthContext", () => {
    it("should validate minimal AuthContext structure", () => {
      const authContext: AuthContext = {
        userId: "user123",
        permissions: ["read"],
      };

      expect(authContext.userId).toBe("user123");
      expect(authContext.permissions).toEqual(["read"]);
      expect(authContext.teamId).toBeUndefined();
    });

    it("should validate complete AuthContext structure", () => {
      const expiresAt = new Date();

      const authContext: AuthContext = {
        userId: "user123",
        teamId: "team456",
        sessionId: "session789",
        permissions: ["read", "write", "admin"],
        expiresAt,
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
      };

      expect(authContext.teamId).toBe("team456");
      expect(authContext.sessionId).toBe("session789");
      expect(authContext.expiresAt).toBe(expiresAt);
      expect(authContext.ipAddress).toBe("192.168.1.1");
      expect(authContext.userAgent).toBe("Mozilla/5.0");
    });
  });

  describe("Session", () => {
    it("should validate complete Session structure", () => {
      const createdAt = new Date();
      const expiresAt = new Date(Date.now() + 86400000);
      const lastAccessedAt = new Date();
      const metadata = { loginMethod: "password" };

      const session: Session = {
        id: "session123",
        userId: "user456",
        teamId: "team789",
        createdAt,
        expiresAt,
        lastAccessedAt,
        ipAddress: "10.0.0.1",
        userAgent: "curl/7.68.0",
        metadata,
      };

      expect(session.id).toBe("session123");
      expect(session.userId).toBe("user456");
      expect(session.teamId).toBe("team789");
      expect(session.createdAt).toBe(createdAt);
      expect(session.expiresAt).toBe(expiresAt);
      expect(session.lastAccessedAt).toBe(lastAccessedAt);
      expect(session.ipAddress).toBe("10.0.0.1");
      expect(session.userAgent).toBe("curl/7.68.0");
      expect(session.metadata).toEqual(metadata);
    });
  });

  describe("UserAccount", () => {
    it("should validate complete UserAccount structure", () => {
      const createdAt = new Date();
      const lastLoginAt = new Date();
      const lockedUntil = new Date(Date.now() + 3600000);
      const metadata = { source: "registration" };

      const userAccount: UserAccount = {
        id: "account123",
        username: "testuser",
        email: "test@example.com",
        passwordHash: "$2b$12$hash...",
        teamId: "team456",
        permissions: ["read", "write"],
        createdAt,
        lastLoginAt,
        failedAttempts: 2,
        lockedUntil,
        requirePasswordChange: true,
        metadata,
      };

      expect(userAccount.id).toBe("account123");
      expect(userAccount.username).toBe("testuser");
      expect(userAccount.email).toBe("test@example.com");
      expect(userAccount.passwordHash).toBe("$2b$12$hash...");
      expect(userAccount.teamId).toBe("team456");
      expect(userAccount.permissions).toEqual(["read", "write"]);
      expect(userAccount.createdAt).toBe(createdAt);
      expect(userAccount.lastLoginAt).toBe(lastLoginAt);
      expect(userAccount.failedAttempts).toBe(2);
      expect(userAccount.lockedUntil).toBe(lockedUntil);
      expect(userAccount.requirePasswordChange).toBe(true);
      expect(userAccount.metadata).toEqual(metadata);
    });
  });

  describe("RateLimitInfo", () => {
    it("should validate complete RateLimitInfo structure", () => {
      const resetTime = new Date();

      const rateLimitInfo: RateLimitInfo = {
        attempts: 3,
        windowStart: 1640995200000,
        windowMs: 300000,
        maxAttempts: 5,
        resetTime,
      };

      expect(rateLimitInfo.attempts).toBe(3);
      expect(rateLimitInfo.windowStart).toBe(1640995200000);
      expect(rateLimitInfo.windowMs).toBe(300000);
      expect(rateLimitInfo.maxAttempts).toBe(5);
      expect(rateLimitInfo.resetTime).toBe(resetTime);
    });
  });
});

describe("Error Class Edge Cases", () => {
  it("should handle empty string message", () => {
    const error = new AuthenticationError("", "EMPTY_MESSAGE");
    expect(error.message).toBe("");
    expect(error.code).toBe("EMPTY_MESSAGE");
  });

  it("should handle empty string code", () => {
    const error = new AuthorizationError("Some message", "");
    expect(error.message).toBe("Some message");
    expect(error.code).toBe("");
  });

  it("should handle zero statusCode", () => {
    const error = new AuthenticationError("Test", "TEST", 0);
    expect(error.statusCode).toBe(0);
  });

  it("should handle negative statusCode", () => {
    const error = new AuthorizationError("Test", "TEST", -1);
    expect(error.statusCode).toBe(-1);
  });

  it("should handle very large statusCode", () => {
    const error = new AuthenticationError("Test", "TEST", 999999);
    expect(error.statusCode).toBe(999999);
  });

  it("should handle null in details", () => {
    const error = new AuthenticationError("Test", "TEST", 401, { value: null });
    expect(error.details).toEqual({ value: null });
  });

  it("should handle circular reference in details", () => {
    const circular: any = { name: "circular" };
    circular.self = circular;

    // Should not throw when creating the error
    expect(() => {
      new AuthenticationError("Test", "TEST", 401, circular);
    }).not.toThrow();
  });
});
