/**
 * Authentication types and interfaces for Brooklyn MCP
 * Enterprise-ready authentication with multiple provider support
 */

/**
 * Authentication result from any provider
 */
export interface AuthResult {
  success: boolean;
  userId: string;
  teamId?: string;
  permissions: string[];
  expiresAt?: Date;
  sessionToken?: string;
  metadata?: Record<string, unknown>;
}

/**
 * User information from authentication provider
 */
export interface UserInfo {
  id: string;
  username: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  organizations?: OrganizationInfo[];
  teams?: TeamInfo[];
}

/**
 * Organization information from provider
 */
export interface OrganizationInfo {
  id: string;
  name: string;
  role?: string;
}

/**
 * Team information from provider
 */
export interface TeamInfo {
  id: string;
  name: string;
  organizationId: string;
  role?: string;
}

/**
 * Token exchange result
 */
export interface TokenResult {
  accessToken: string;
  tokenType: string;
  expiresIn?: number;
  refreshToken?: string;
  scope?: string;
}

/**
 * Authentication context for requests
 */
export interface AuthContext {
  userId: string;
  teamId?: string;
  sessionId?: string;
  permissions: string[];
  expiresAt?: Date;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Authentication error types
 */
export class AuthenticationError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode = 401,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AuthenticationError";
  }
}

/**
 * Authorization error types
 */
export class AuthorizationError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode = 403,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

/**
 * Session management interface
 */
export interface Session {
  id: string;
  userId: string;
  teamId?: string;
  createdAt: Date;
  expiresAt: Date;
  lastAccessedAt: Date;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * User account interface (for local provider)
 */
export interface UserAccount {
  id: string;
  username: string;
  email?: string;
  passwordHash: string;
  teamId?: string;
  permissions: string[];
  createdAt: Date;
  lastLoginAt?: Date;
  failedAttempts?: number;
  lockedUntil?: Date;
  requirePasswordChange?: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Rate limiting information
 */
export interface RateLimitInfo {
  attempts: number;
  windowStart: number;
  windowMs: number;
  maxAttempts: number;
  resetTime: Date;
}
