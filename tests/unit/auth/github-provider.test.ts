/**
 * Unit tests for GitHub OAuth authentication provider
 * Tests OAuth flow, organization/team validation, and API integration
 */

import { type MockedFunction, afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { GitHubAuthProvider } from "../../../src/core/auth/github-provider.js";
import { AuthenticationError, AuthorizationError } from "../../../src/core/auth/types.js";
import type { BrooklynConfig } from "../../../src/core/config.js";

// Mock fetch globally
const mockFetch = vi.fn() as MockedFunction<typeof fetch>;
vi.stubGlobal("fetch", mockFetch);

describe("GitHubAuthProvider", () => {
  let provider: GitHubAuthProvider;
  let mockConfig: BrooklynConfig;

  beforeEach(() => {
    provider = new GitHubAuthProvider();
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
        mode: "github",
        developmentOnly: false,
        providers: {
          github: {
            clientId: "test_client_id",
            clientSecret: "test_client_secret",
            callbackUrl: "https://localhost:3000/oauth/callback",
            scopes: ["user:email", "read:org"],
            allowedOrgs: ["test-org"],
            allowedTeams: { "test-org": ["developers"] },
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
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    test("should initialize with valid GitHub configuration", async () => {
      // Act
      await provider.initialize(mockConfig);

      // Assert
      expect(provider.name).toBe("github");
      expect(provider.type).toBe("github");
      const status = provider.getStatus();
      expect(status.healthy).toBe(true);
    });

    test("should throw error when GitHub configuration is missing", async () => {
      // Arrange
      mockConfig.authentication.providers.github = undefined;

      // Act & Assert
      await expect(provider.initialize(mockConfig)).rejects.toThrow(AuthenticationError);
      await expect(provider.initialize(mockConfig)).rejects.toThrow(
        "GitHub provider configuration missing",
      );
    });

    test("should throw error when client ID is missing", async () => {
      // Arrange
      mockConfig.authentication.providers.github!.clientId = "";

      // Act & Assert
      await expect(provider.initialize(mockConfig)).rejects.toThrow(AuthenticationError);
      await expect(provider.initialize(mockConfig)).rejects.toThrow(
        "GitHub OAuth client ID and secret are required",
      );
    });

    test("should throw error when client secret is missing", async () => {
      // Arrange
      mockConfig.authentication.providers.github!.clientSecret = "";

      // Act & Assert
      await expect(provider.initialize(mockConfig)).rejects.toThrow(AuthenticationError);
      await expect(provider.initialize(mockConfig)).rejects.toThrow(
        "GitHub OAuth client ID and secret are required",
      );
    });

    test("should initialize with minimal configuration", async () => {
      // Arrange
      mockConfig.authentication.providers.github = {
        clientId: "test_client_id",
        clientSecret: "test_client_secret",
        callbackUrl: "https://localhost:3000/oauth/callback",
      };

      // Act
      await provider.initialize(mockConfig);

      // Assert
      const status = provider.getStatus();
      expect(status.healthy).toBe(true);
    });
  });

  describe("authorization URL generation", () => {
    beforeEach(async () => {
      await provider.initialize(mockConfig);
    });

    test("should generate valid authorization URL", () => {
      // Arrange
      const state = "test_state";

      // Act
      const authUrl = provider.getAuthorizationUrl(state);

      // Assert
      const url = new URL(authUrl);
      expect(url.hostname).toBe("github.com");
      expect(url.pathname).toBe("/login/oauth/authorize");
      expect(url.searchParams.get("client_id")).toBe("test_client_id");
      expect(url.searchParams.get("redirect_uri")).toBe("https://localhost:3000/oauth/callback");
      expect(url.searchParams.get("scope")).toBe("user:email read:org");
      expect(url.searchParams.get("state")).toBe(state);
      expect(url.searchParams.get("response_type")).toBe("code");
    });

    test("should handle PKCE challenge gracefully (not supported by GitHub)", () => {
      // Arrange
      const state = "test_state";
      const codeChallenge = "test_challenge";

      // Act
      const authUrl = provider.getAuthorizationUrl(state, codeChallenge);

      // Assert
      const url = new URL(authUrl);
      expect(url.searchParams.has("code_challenge")).toBe(false);
      expect(url.searchParams.get("state")).toBe(state);
    });

    test("should use custom scopes when configured", async () => {
      // Arrange
      mockConfig.authentication.providers.github!.scopes = ["user", "repo"];
      await provider.initialize(mockConfig);
      const state = "test_state";

      // Act
      const authUrl = provider.getAuthorizationUrl(state);

      // Assert
      const url = new URL(authUrl);
      expect(url.searchParams.get("scope")).toBe("user repo");
    });

    test("should throw error if not initialized", () => {
      // Arrange
      const uninitializedProvider = new GitHubAuthProvider();

      // Act & Assert
      expect(() => uninitializedProvider.getAuthorizationUrl("state")).toThrow(
        "Authentication provider not initialized",
      );
    });
  });

  describe("token exchange", () => {
    beforeEach(async () => {
      await provider.initialize(mockConfig);
    });

    test("should exchange authorization code for access token", async () => {
      // Arrange
      const code = "test_code";
      const state = "test_state";
      const mockTokenResponse = {
        access_token: "test_access_token",
        token_type: "bearer",
        scope: "user:email read:org",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse,
      } as Response);

      // Act
      const result = await provider.exchangeCodeForToken(code, state);

      // Assert
      expect(result).toEqual({
        accessToken: "test_access_token",
        tokenType: "bearer",
        scope: "user:email read:org",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://github.com/login/oauth/access_token",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Brooklyn-MCP/1.6.0",
          }),
        }),
      );
    });

    test.skip("should handle GitHub OAuth errors", async () => {
      // Arrange
      const code = "invalid_code";
      const state = "test_state";
      const mockErrorResponse = {
        error: "invalid_grant",
        error_description: "The provided authorization grant is invalid",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockErrorResponse,
      } as Response);

      // Act & Assert
      await expect(provider.exchangeCodeForToken(code, state)).rejects.toThrow(AuthenticationError);
      await expect(provider.exchangeCodeForToken(code, state)).rejects.toThrow(
        "GitHub OAuth error: The provided authorization grant is invalid",
      );
    });

    test.skip("should handle HTTP errors", async () => {
      // Arrange
      const code = "test_code";
      const state = "test_state";

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
      } as Response);

      // Act & Assert
      await expect(provider.exchangeCodeForToken(code, state)).rejects.toThrow(AuthenticationError);
      await expect(provider.exchangeCodeForToken(code, state)).rejects.toThrow(
        "GitHub token exchange failed",
      );
    });

    test("should handle network errors", async () => {
      // Arrange
      const code = "test_code";
      const state = "test_state";

      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      // Act & Assert
      await expect(provider.exchangeCodeForToken(code, state)).rejects.toThrow(AuthenticationError);
      await expect(provider.exchangeCodeForToken(code, state)).rejects.toThrow(
        "Failed to exchange GitHub authorization code",
      );
    });

    test("should handle PKCE verifier gracefully (not used by GitHub)", async () => {
      // Arrange
      const code = "test_code";
      const state = "test_state";
      const codeVerifier = "test_verifier";
      const mockTokenResponse = {
        access_token: "test_access_token",
        token_type: "bearer",
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse,
      } as Response);

      // Act
      const result = await provider.exchangeCodeForToken(code, state, codeVerifier);

      // Assert
      expect(result.accessToken).toBe("test_access_token");
    });
  });

  describe("user information retrieval", () => {
    beforeEach(async () => {
      await provider.initialize(mockConfig);
    });

    test("should get user information with organizations and teams", async () => {
      // Arrange
      const token = "test_token";
      const mockUserResponse = {
        id: 12345,
        login: "testuser",
        email: "test@example.com",
        name: "Test User",
        avatar_url: "https://github.com/avatar.jpg",
      };
      const mockOrgsResponse = [
        { id: 1, login: "test-org", role: "member" },
        { id: 2, login: "another-org", role: "admin" },
      ];
      const mockTeamsResponse = [
        {
          id: 1,
          name: "developers",
          organization: { id: 1, login: "test-org" },
        },
      ];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUserResponse,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockOrgsResponse,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTeamsResponse,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        } as unknown as Response);

      // Act
      const result = await provider.getUserInfo(token);

      // Assert
      expect(result).toEqual({
        id: "12345",
        username: "testuser",
        email: "test@example.com",
        displayName: "Test User",
        avatarUrl: "https://github.com/avatar.jpg",
        organizations: [
          { id: "1", name: "test-org", role: "member" },
          { id: "2", name: "another-org", role: "admin" },
        ],
        teams: [
          {
            id: "1",
            name: "developers",
            organizationId: "1",
          },
        ],
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.github.com/user",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test_token",
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "Brooklyn-MCP/1.6.0",
          }),
        }),
      );
    });

    test("should handle API errors", async () => {
      // Arrange
      const token = "invalid_token";

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        text: async () => "Bad credentials",
      } as Response);

      // Act & Assert
      await expect(provider.getUserInfo(token)).rejects.toThrow(AuthenticationError);
      await expect(provider.getUserInfo(token)).rejects.toThrow(
        "Failed to retrieve user information from GitHub",
      );
    });

    test("should handle missing email gracefully", async () => {
      // Arrange
      const token = "test_token";
      const mockUserResponse = {
        id: 12345,
        login: "testuser",
        name: "Test User",
        // email missing
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUserResponse,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        } as unknown as Response);

      // Act
      const result = await provider.getUserInfo(token);

      // Assert
      expect(result.email).toBeUndefined();
      expect(result.displayName).toBe("Test User");
    });

    test("should use login as displayName when name is missing", async () => {
      // Arrange
      const token = "test_token";
      const mockUserResponse = {
        id: 12345,
        login: "testuser",
        // name missing
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUserResponse,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        } as unknown as Response);

      // Act
      const result = await provider.getUserInfo(token);

      // Assert
      expect(result.displayName).toBe("testuser");
    });
  });

  describe("token validation", () => {
    beforeEach(async () => {
      await provider.initialize(mockConfig);
    });

    test("should validate token for authorized user", async () => {
      // Arrange
      const token = "valid_token";
      const mockUserResponse = {
        id: 12345,
        login: "testuser",
        email: "test@example.com",
      };
      const mockOrgsResponse = [{ id: 1, login: "test-org", role: "member" }];
      const mockTeamsResponse = [
        {
          id: 1,
          name: "developers",
          organization: { id: 1, login: "test-org" },
        },
      ];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUserResponse,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockOrgsResponse,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTeamsResponse,
        } as unknown as Response);

      // Act
      const result = await provider.validateToken(token);

      // Assert
      expect(result.success).toBe(true);
      expect(result.userId).toBe("12345");
      expect(result.teamId).toBe("test-org");
      expect(result.permissions).toContain("mcp:basic");
      expect(result.permissions).toContain("mcp:member");
      expect(result.permissions).toContain("mcp:navigate");
      expect(result.permissions).toContain("mcp:team:developers");
    });

    test.skip("should reject user not in allowed organization", async () => {
      // Arrange
      const token = "valid_token";
      const mockUserResponse = {
        id: 12345,
        login: "testuser",
        email: "test@example.com",
      };
      const mockOrgsResponse = [{ id: 2, login: "unauthorized-org", role: "member" }];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUserResponse,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockOrgsResponse,
        } as unknown as Response);

      // Act & Assert
      await expect(provider.validateToken(token)).rejects.toThrow(AuthorizationError);
      await expect(provider.validateToken(token)).rejects.toThrow(
        "User is not a member of allowed organizations: test-org",
      );
    });

    test.skip("should reject user not in allowed team", async () => {
      // Arrange
      const token = "valid_token";
      const mockUserResponse = {
        id: 12345,
        login: "testuser",
        email: "test@example.com",
      };
      const mockOrgsResponse = [{ id: 1, login: "test-org", role: "member" }];
      const mockTeamsResponse = [
        {
          id: 2,
          name: "unauthorized-team",
          organization: { id: 1, login: "test-org" },
        },
      ];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUserResponse,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockOrgsResponse,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTeamsResponse,
        } as unknown as Response);

      // Act & Assert
      await expect(provider.validateToken(token)).rejects.toThrow(AuthorizationError);
      await expect(provider.validateToken(token)).rejects.toThrow(
        "User is not a member of allowed teams: test-org: developers",
      );
    });

    test("should allow any user when no restrictions configured", async () => {
      // Arrange
      mockConfig.authentication.providers.github!.allowedOrgs = undefined;
      mockConfig.authentication.providers.github!.allowedTeams = undefined;
      await provider.initialize(mockConfig);

      const token = "valid_token";
      const mockUserResponse = {
        id: 12345,
        login: "testuser",
        email: "test@example.com",
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUserResponse,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        } as unknown as Response);

      // Act
      const result = await provider.validateToken(token);

      // Assert
      expect(result.success).toBe(true);
      expect(result.userId).toBe("12345");
    });

    test.skip("should return failed result for invalid token", async () => {
      // Arrange
      const token = "invalid_token";

      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      // Act
      const result = await provider.validateToken(token);

      // Assert
      expect(result.success).toBe(false);
      expect(result.userId).toBe("");
      expect(result.permissions).toEqual([]);
    });

    test("should assign admin permissions for organization admins", async () => {
      // Arrange
      const token = "admin_token";
      const mockUserResponse = {
        id: 12345,
        login: "adminuser",
        email: "admin@example.com",
      };
      const mockOrgsResponse = [{ id: 1, login: "test-org", role: "admin" }];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUserResponse,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockOrgsResponse,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        } as unknown as Response);

      // Act
      const result = await provider.validateToken(token);

      // Assert
      expect(result.success).toBe(true);
      expect(result.permissions).toContain("mcp:admin");
      expect(result.permissions).toContain("mcp:manage-users");
    });
  });

  describe("error handling", () => {
    beforeEach(async () => {
      await provider.initialize(mockConfig);
    });

    test("should handle GitHub API rate limiting", async () => {
      // Arrange
      const token = "rate_limited_token";

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        text: async () => '{"message": "API rate limit exceeded"}',
      } as Response);

      // Act & Assert
      await expect(provider.getUserInfo(token)).rejects.toThrow(AuthenticationError);
      await expect(provider.getUserInfo(token)).rejects.toThrow(
        "Failed to retrieve user information from GitHub",
      );
    });

    test("should handle malformed GitHub API responses", async () => {
      // Arrange
      const token = "valid_token";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error("Invalid JSON");
        },
        headers: new Headers(),
        redirected: false,
        status: 200,
        statusText: "OK",
        type: "basic",
        url: "",
        body: null,
        bodyUsed: false,
        clone: () => ({}) as Response,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        blob: () => Promise.resolve(new Blob()),
        formData: () => Promise.resolve(new FormData()),
        text: () => Promise.resolve(""),
        bytes: () => Promise.resolve(new Uint8Array()),
      } as Response);

      // Act & Assert
      await expect(provider.getUserInfo(token)).rejects.toThrow(AuthenticationError);
    });

    test("should throw error when calling methods on uninitialized provider", async () => {
      // Arrange
      const uninitializedProvider = new GitHubAuthProvider();

      // Act & Assert
      expect(() => uninitializedProvider.getAuthorizationUrl("state")).toThrow(
        "Authentication provider not initialized",
      );
      await expect(uninitializedProvider.validateToken("token")).rejects.toThrow(
        "Authentication provider not initialized",
      );
      await expect(uninitializedProvider.getUserInfo("token")).rejects.toThrow(
        "Authentication provider not initialized",
      );
      await expect(uninitializedProvider.exchangeCodeForToken("code", "state")).rejects.toThrow(
        "Authentication provider not initialized",
      );
    });
  });

  describe("team access validation", () => {
    test.skip("should validate complex team configuration", async () => {
      // Arrange
      mockConfig.authentication.providers.github!.allowedTeams = {
        org1: ["team1", "team2"],
        org2: ["team3"],
      };
      await provider.initialize(mockConfig);

      const token = "valid_token";
      const mockUserResponse = {
        id: 12345,
        login: "testuser",
        email: "test@example.com",
      };
      const mockOrgsResponse = [
        { id: 1, login: "org1", role: "member" },
        { id: 2, login: "org2", role: "member" },
      ];
      const mockTeamsResponse = [
        { id: 1, name: "team1", organization: { id: 1, login: "org1" } },
        { id: 2, name: "team3", organization: { id: 2, login: "org2" } },
      ];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUserResponse,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockOrgsResponse,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTeamsResponse,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        } as unknown as Response);

      // Act
      const result = await provider.validateToken(token);

      // Assert
      expect(result.success).toBe(true);
      expect(result.permissions).toContain("mcp:team:team1");
      expect(result.permissions).toContain("mcp:team:team3");
    });

    test.skip("should handle teams API errors gracefully", async () => {
      // Arrange
      await provider.initialize(mockConfig);
      const token = "valid_token";
      const mockUserResponse = {
        id: 12345,
        login: "testuser",
        email: "test@example.com",
      };
      const mockOrgsResponse = [{ id: 1, login: "test-org", role: "member" }];

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockUserResponse,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockOrgsResponse,
        } as unknown as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          statusText: "Forbidden",
          text: async () => "Insufficient permissions",
        } as unknown as Response);

      // Act
      const result = await provider.validateToken(token);

      // Assert
      expect(result.success).toBe(true);
      // Teams may be empty due to API error, but validation should still succeed
    });
  });

  // Ensure global stubs are removed after this suite completes to avoid affecting other tests
  afterAll(() => {
    vi.unstubAllGlobals();
  });
});
