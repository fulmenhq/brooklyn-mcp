/**
 * Authentication manager for Brooklyn MCP
 * Coordinates multiple authentication providers and handles provider selection
 */

import { getLogger } from "../../shared/pino-logger.js";
import type { BrooklynConfig } from "../config.js";
import type { AuthManager, AuthProvider } from "./auth-provider.js";
import { GitHubAuthProvider } from "./github-provider.js";
import { LocalAuthProvider } from "./local-provider.js";
import { NoneAuthProvider } from "./none-provider.js";
import type { AuthContext, AuthResult } from "./types.js";
import { AuthenticationError } from "./types.js";

/**
 * Authentication manager implementation
 */
export class BrooklynAuthManager implements AuthManager {
  private config: BrooklynConfig | null = null;
  private currentProvider: AuthProvider | null = null;
  private initialized = false;

  // Lazy logger initialization
  private _logger: ReturnType<typeof getLogger> | null = null;
  private get logger() {
    if (!this._logger) {
      this._logger = getLogger("auth-manager");
    }
    return this._logger;
  }

  /**
   * Initialize authentication manager
   */
  async initialize(config: BrooklynConfig): Promise<void> {
    this.config = config;

    this.logger.info("Initializing authentication manager", {
      mode: config.authentication.mode,
      developmentOnly: config.authentication.developmentOnly,
    });

    // Create and initialize the appropriate provider
    this.currentProvider = this.createProvider(config.authentication.mode);
    await this.currentProvider.initialize(config);

    this.initialized = true;

    this.logger.info("Authentication manager initialized successfully", {
      provider: this.currentProvider.name,
      type: this.currentProvider.type,
    });
  }

  /**
   * Get current authentication provider
   */
  getCurrentProvider(): AuthProvider {
    if (!this.currentProvider) {
      throw new AuthenticationError(
        "Authentication manager not initialized",
        "MANAGER_NOT_INITIALIZED",
        500,
      );
    }
    return this.currentProvider;
  }

  /**
   * Validate request authentication
   */
  async validateRequest(
    token: string,
    context: {
      ipAddress?: string;
      userAgent?: string;
    } = {},
  ): Promise<AuthContext> {
    this.ensureInitialized();

    try {
      const authResult = await this.currentProvider?.validateToken(token);

      if (!authResult?.success) {
        throw new AuthenticationError("Authentication failed", "AUTHENTICATION_FAILED", 401);
      }

      // Create auth context with additional metadata
      const authContext: AuthContext = {
        userId: authResult.userId,
        teamId: authResult.teamId,
        sessionId: authResult.sessionToken,
        permissions: authResult.permissions,
        expiresAt: authResult.expiresAt,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      };

      this.logger.debug("Request authentication successful", {
        userId: authResult.userId,
        teamId: authResult.teamId,
        permissions: authResult.permissions.length,
        provider: this.currentProvider?.name,
      });

      return authContext;
    } catch (error) {
      this.logger.warn("Request authentication failed", {
        provider: this.currentProvider?.name,
        error: error instanceof Error ? error.message : String(error),
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      if (error instanceof AuthenticationError) {
        throw error;
      }

      throw new AuthenticationError("Authentication validation failed", "VALIDATION_ERROR", 500);
    }
  }

  /**
   * Start OAuth flow (for OAuth providers)
   */
  startOAuthFlow(state: string, codeChallenge?: string): string {
    this.ensureInitialized();

    if (!this.currentProvider?.getAuthorizationUrl) {
      throw new AuthenticationError(
        `Provider ${this.currentProvider?.name} does not support OAuth flow`,
        "OAUTH_NOT_SUPPORTED",
        400,
      );
    }

    const authUrl = this.currentProvider?.getAuthorizationUrl(state, codeChallenge);

    this.logger.info("OAuth flow started", {
      provider: this.currentProvider?.name,
      state,
      hasPKCE: !!codeChallenge,
    });

    return authUrl;
  }

  /**
   * Complete OAuth flow (for OAuth providers)
   */
  async completeOAuthFlow(code: string, state: string, codeVerifier?: string): Promise<AuthResult> {
    this.ensureInitialized();

    if (!this.currentProvider?.exchangeCodeForToken) {
      throw new AuthenticationError(
        `Provider ${this.currentProvider?.name} does not support OAuth flow`,
        "OAUTH_NOT_SUPPORTED",
        400,
      );
    }

    try {
      // Exchange code for token
      const tokenResult = await this.currentProvider?.exchangeCodeForToken(
        code,
        state,
        codeVerifier,
      );

      // Validate the token and get user info
      const authResult = await this.currentProvider?.validateToken(tokenResult.accessToken);

      this.logger.info("OAuth flow completed successfully", {
        provider: this.currentProvider?.name,
        userId: authResult.userId,
        teamId: authResult.teamId,
        tokenType: tokenResult.tokenType,
      });

      return {
        ...authResult,
        sessionToken: tokenResult.accessToken, // Use access token as session token for OAuth
      };
    } catch (error) {
      this.logger.error("OAuth flow completion failed", {
        provider: this.currentProvider?.name,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof AuthenticationError) {
        throw error;
      }

      throw new AuthenticationError("OAuth flow completion failed", "OAUTH_COMPLETION_FAILED", 500);
    }
  }

  /**
   * Authenticate with username/password (for local provider)
   */
  async authenticateCredentials(username: string, password: string): Promise<AuthResult> {
    this.ensureInitialized();

    if (!this.currentProvider?.authenticateCredentials) {
      throw new AuthenticationError(
        `Provider ${this.currentProvider?.name} does not support credential authentication`,
        "CREDENTIALS_NOT_SUPPORTED",
        400,
      );
    }

    try {
      const authResult = await this.currentProvider?.authenticateCredentials(username, password);

      if (authResult.success) {
        // Create a session for successful authentication
        const sessionToken = await this.currentProvider?.createSession(authResult.userId, {
          username,
          teamId: authResult.teamId,
        });

        this.logger.info("Credential authentication successful", {
          provider: this.currentProvider?.name,
          username,
          userId: authResult.userId,
          teamId: authResult.teamId,
        });

        return {
          ...authResult,
          sessionToken,
        };
      }

      throw new AuthenticationError("Invalid credentials", "INVALID_CREDENTIALS", 401);
    } catch (error) {
      this.logger.warn("Credential authentication failed", {
        provider: this.currentProvider?.name,
        username,
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof AuthenticationError) {
        throw error;
      }

      throw new AuthenticationError(
        "Credential authentication failed",
        "CREDENTIAL_AUTH_FAILED",
        500,
      );
    }
  }

  /**
   * Create new session
   */
  async createSession(userId: string, metadata: Record<string, unknown> = {}): Promise<string> {
    this.ensureInitialized();

    try {
      const sessionToken = await this.currentProvider?.createSession(userId, metadata);

      if (!sessionToken) {
        throw new AuthenticationError(
          "Session creation returned null",
          "SESSION_CREATION_NULL",
          500,
        );
      }

      this.logger.debug("Session created", {
        provider: this.currentProvider?.name,
        userId,
        sessionToken: `${sessionToken.slice(0, 8)}...`,
      });

      return sessionToken;
    } catch (error) {
      this.logger.error("Session creation failed", {
        provider: this.currentProvider?.name,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new AuthenticationError("Session creation failed", "SESSION_CREATION_FAILED", 500);
    }
  }

  /**
   * Revoke session
   */
  async revokeSession(sessionToken: string): Promise<void> {
    this.ensureInitialized();

    try {
      await this.currentProvider?.revokeSession(sessionToken);

      this.logger.info("Session revoked", {
        provider: this.currentProvider?.name,
        sessionToken: `${sessionToken.slice(0, 8)}...`,
      });
    } catch (error) {
      this.logger.error("Session revocation failed", {
        provider: this.currentProvider?.name,
        sessionToken: `${sessionToken.slice(0, 8)}...`,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new AuthenticationError("Session revocation failed", "SESSION_REVOCATION_FAILED", 500);
    }
  }

  /**
   * Check if development mode is allowed
   */
  isDevelopmentModeAllowed(): boolean {
    if (!this.config) {
      return false;
    }

    return (
      this.config.authentication.mode === "none" &&
      this.config.authentication.developmentOnly === true
    );
  }

  /**
   * Get authentication status
   */
  getStatus(): {
    mode: string;
    provider: string;
    healthy: boolean;
    developmentOnly?: boolean;
  } {
    if (!(this.initialized && this.currentProvider && this.config)) {
      return {
        mode: "unknown",
        provider: "none",
        healthy: false,
      };
    }

    const providerStatus = this.currentProvider.getStatus();

    return {
      mode: this.config.authentication.mode,
      provider: this.currentProvider.name,
      healthy: this.initialized && providerStatus.healthy,
      developmentOnly: this.config.authentication.developmentOnly,
    };
  }

  /**
   * Cleanup manager resources
   */
  async cleanup(): Promise<void> {
    this.logger.info("Cleaning up authentication manager");

    if (this.currentProvider) {
      await this.currentProvider.cleanup();
      this.currentProvider = null;
    }

    this.initialized = false;
    this.config = null;
  }

  /**
   * Create provider instance based on mode
   */
  private createProvider(mode: string): AuthProvider {
    switch (mode) {
      case "github":
        return new GitHubAuthProvider();
      case "local":
        return new LocalAuthProvider();
      case "none":
        return new NoneAuthProvider();
      default:
        throw new AuthenticationError(
          `Unknown authentication mode: ${mode}`,
          "UNKNOWN_AUTH_MODE",
          500,
        );
    }
  }

  /**
   * Ensure manager is initialized
   */
  private ensureInitialized(): void {
    if (!(this.initialized && this.currentProvider && this.config)) {
      throw new AuthenticationError(
        "Authentication manager not initialized",
        "MANAGER_NOT_INITIALIZED",
        500,
      );
    }
  }
}
