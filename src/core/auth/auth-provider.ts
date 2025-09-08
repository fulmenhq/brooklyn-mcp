/**
 * Authentication provider interface for Brooklyn MCP
 * Supports multiple authentication backends with unified interface
 */

import type { BrooklynConfig } from "../config.js";
import type { AuthContext, AuthResult, TokenResult, UserInfo } from "./types.js";

/**
 * Base authentication provider interface
 * All authentication providers must implement this interface
 */
export interface AuthProvider {
  /**
   * Provider name for identification
   */
  readonly name: string;

  /**
   * Provider type for configuration
   */
  readonly type: "github" | "local" | "none";

  /**
   * Initialize the authentication provider
   */
  initialize(config: BrooklynConfig): Promise<void>;

  /**
   * Validate an authentication token or session
   */
  validateToken(token: string): Promise<AuthResult>;

  /**
   * Get authorization URL for OAuth flow (OAuth providers only)
   */
  getAuthorizationUrl?(state: string, codeChallenge?: string): string;

  /**
   * Exchange authorization code for access token (OAuth providers only)
   */
  exchangeCodeForToken?(code: string, state: string, codeVerifier?: string): Promise<TokenResult>;

  /**
   * Get user information from token
   */
  getUserInfo(token: string): Promise<UserInfo>;

  /**
   * Authenticate user with credentials (local provider only)
   */
  authenticateCredentials?(username: string, password: string): Promise<AuthResult>;

  /**
   * Create user session
   */
  createSession(userId: string, metadata?: Record<string, unknown>): Promise<string>;

  /**
   * Validate session token
   */
  validateSession(sessionToken: string): Promise<AuthContext | null>;

  /**
   * Revoke session
   */
  revokeSession(sessionToken: string): Promise<void>;

  /**
   * Cleanup provider resources
   */
  cleanup(): Promise<void>;

  /**
   * Get provider status for health checks
   */
  getStatus(): {
    healthy: boolean;
    details?: Record<string, unknown>;
  };
}

/**
 * Authentication manager that coordinates multiple providers
 */
export interface AuthManager {
  /**
   * Initialize authentication manager with configuration
   */
  initialize(config: BrooklynConfig): Promise<void>;

  /**
   * Get current authentication provider
   */
  getCurrentProvider(): AuthProvider;

  /**
   * Validate request authentication
   */
  validateRequest(
    token: string,
    context?: {
      ipAddress?: string;
      userAgent?: string;
    },
  ): Promise<AuthContext>;

  /**
   * Start OAuth flow (for OAuth providers)
   */
  startOAuthFlow(state: string, codeChallenge?: string): string;

  /**
   * Complete OAuth flow (for OAuth providers)
   */
  completeOAuthFlow(code: string, state: string, codeVerifier?: string): Promise<AuthResult>;

  /**
   * Authenticate with username/password (for local provider)
   */
  authenticateCredentials(username: string, password: string): Promise<AuthResult>;

  /**
   * Create new session
   */
  createSession(userId: string, metadata?: Record<string, unknown>): Promise<string>;

  /**
   * Revoke session
   */
  revokeSession(sessionToken: string): Promise<void>;

  /**
   * Check if development mode is allowed
   */
  isDevelopmentModeAllowed(): boolean;

  /**
   * Get authentication status
   */
  getStatus(): {
    mode: string;
    provider: string;
    healthy: boolean;
    developmentOnly?: boolean;
  };

  /**
   * Cleanup manager resources
   */
  cleanup(): Promise<void>;
}
