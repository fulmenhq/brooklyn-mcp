/**
 * Base authentication provider implementation
 * Provides common functionality for all authentication providers
 */

import { getLogger } from "../../shared/pino-logger.js";
import type { BrooklynConfig } from "../config.js";
import type { AuthProvider } from "./auth-provider.js";
import type { AuthContext, AuthResult, RateLimitInfo, Session, UserInfo } from "./types.js";
import { AuthenticationError } from "./types.js";

/**
 * Base authentication provider with common functionality
 */
export abstract class BaseAuthProvider implements AuthProvider {
  protected config: BrooklynConfig | null = null;
  protected initialized = false;

  // Lazy logger initialization to avoid circular dependencies
  private _logger: ReturnType<typeof getLogger> | null = null;
  protected get logger() {
    if (!this._logger) {
      this._logger = getLogger(`auth-provider-${this.name}`);
    }
    return this._logger;
  }

  // In-memory stores for development (production should use external stores)
  protected sessions = new Map<string, Session>();
  protected rateLimitStore = new Map<string, RateLimitInfo>();

  abstract readonly name: string;
  abstract readonly type: "github" | "local" | "none";

  async initialize(config: BrooklynConfig): Promise<void> {
    this.config = config;
    this.logger.info(`Initializing ${this.name} authentication provider`, {
      mode: config.authentication.mode,
      developmentOnly: config.authentication.developmentOnly,
    });

    await this.doInitialize(config);
    this.initialized = true;

    // Set up cleanup timers
    this.startCleanupTasks();

    this.logger.info(`${this.name} authentication provider initialized successfully`);
  }

  /**
   * Provider-specific initialization logic
   */
  protected abstract doInitialize(config: BrooklynConfig): Promise<void>;

  /**
   * Validate that provider is initialized
   */
  protected ensureInitialized(): void {
    if (!(this.initialized && this.config)) {
      throw new AuthenticationError(
        "Authentication provider not initialized",
        "PROVIDER_NOT_INITIALIZED",
        500,
      );
    }
  }

  /**
   * Rate limiting for authentication attempts
   */
  protected async checkRateLimit(
    identifier: string,
    maxAttempts = 5,
    windowMs = 300000, // 5 minutes
  ): Promise<void> {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;

    let rateLimitInfo = this.rateLimitStore.get(identifier);

    if (!rateLimitInfo || rateLimitInfo.windowStart < windowStart) {
      rateLimitInfo = {
        attempts: 0,
        windowStart,
        windowMs,
        maxAttempts,
        resetTime: new Date(windowStart + windowMs),
      };
      this.rateLimitStore.set(identifier, rateLimitInfo);
    }

    rateLimitInfo.attempts++;

    if (rateLimitInfo.attempts > maxAttempts) {
      this.logger.warn("Rate limit exceeded", {
        identifier,
        attempts: rateLimitInfo.attempts,
        maxAttempts,
        resetTime: rateLimitInfo.resetTime,
      });

      throw new AuthenticationError(
        `Rate limit exceeded. Try again after ${rateLimitInfo.resetTime.toISOString()}`,
        "RATE_LIMIT_EXCEEDED",
        429,
        {
          resetTime: rateLimitInfo.resetTime,
          attemptsRemaining: 0,
        },
      );
    }

    this.logger.debug("Rate limit check passed", {
      identifier,
      attempts: rateLimitInfo.attempts,
      maxAttempts,
    });
  }

  /**
   * Generate secure session token
   */
  protected generateSessionToken(): string {
    // Generate cryptographically secure random token
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Create user session (common implementation)
   */
  async createSession(userId: string, metadata: Record<string, unknown> = {}): Promise<string> {
    this.ensureInitialized();

    const sessionId = this.generateSessionToken();
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + (this.config?.authentication.providers.local?.sessionTimeout || 86400000),
    );

    const session: Session = {
      id: sessionId,
      userId,
      teamId: metadata["teamId"] as string,
      createdAt: now,
      expiresAt,
      lastAccessedAt: now,
      ipAddress: metadata["ipAddress"] as string,
      userAgent: metadata["userAgent"] as string,
      metadata,
    };

    this.sessions.set(sessionId, session);

    this.logger.info("Session created", {
      userId,
      sessionId: `${sessionId.slice(0, 8)}...`, // Log partial ID for security
      expiresAt,
    });

    return sessionId;
  }

  /**
   * Validate session token (common implementation)
   */
  async validateSession(sessionToken: string): Promise<AuthContext | null> {
    this.ensureInitialized();

    const session = this.sessions.get(sessionToken);
    if (!session) {
      return null;
    }

    const now = new Date();
    if (session.expiresAt < now) {
      this.sessions.delete(sessionToken);
      this.logger.debug("Session expired", {
        sessionId: `${sessionToken.slice(0, 8)}...`,
        expiresAt: session.expiresAt,
      });
      return null;
    }

    // Update last accessed time
    session.lastAccessedAt = now;

    return {
      userId: session.userId,
      teamId: session.teamId,
      sessionId: session.id,
      permissions: [], // Will be populated by specific providers
      expiresAt: session.expiresAt,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
    };
  }

  /**
   * Revoke session (common implementation)
   */
  async revokeSession(sessionToken: string): Promise<void> {
    this.ensureInitialized();

    const session = this.sessions.get(sessionToken);
    if (session) {
      this.sessions.delete(sessionToken);
      this.logger.info("Session revoked", {
        userId: session.userId,
        sessionId: `${sessionToken.slice(0, 8)}...`,
      });
    }
  }

  /**
   * Start cleanup tasks for expired sessions and rate limits
   */
  private startCleanupTasks(): void {
    // Clean up expired sessions every 5 minutes
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 300000);

    // Clean up old rate limit entries every 10 minutes
    setInterval(() => {
      this.cleanupRateLimitStore();
    }, 600000);
  }

  /**
   * Clean up expired sessions
   */
  private cleanupExpiredSessions(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions) {
      if (session.expiresAt < now) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug("Cleaned up expired sessions", {
        sessionsRemoved: cleaned,
        remainingSessions: this.sessions.size,
      });
    }
  }

  /**
   * Clean up old rate limit entries
   */
  private cleanupRateLimitStore(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [identifier, rateLimitInfo] of this.rateLimitStore) {
      const windowEnd = rateLimitInfo.windowStart + rateLimitInfo.windowMs;
      if (windowEnd < now - rateLimitInfo.windowMs) {
        // Keep entries for an extra window for safety
        this.rateLimitStore.delete(identifier);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug("Cleaned up rate limit store", {
        entriesRemoved: cleaned,
        remainingEntries: this.rateLimitStore.size,
      });
    }
  }

  /**
   * Get provider status (common implementation)
   */
  getStatus(): { healthy: boolean; details?: Record<string, unknown> } {
    return {
      healthy: this.initialized,
      details: {
        initialized: this.initialized,
        activeSessions: this.sessions.size,
        rateLimitEntries: this.rateLimitStore.size,
      },
    };
  }

  /**
   * Cleanup provider resources (common implementation)
   */
  async cleanup(): Promise<void> {
    this.logger.info(`Cleaning up ${this.name} authentication provider`);
    this.sessions.clear();
    this.rateLimitStore.clear();
    this.initialized = false;
  }

  /**
   * Abstract methods that must be implemented by specific providers
   */
  abstract validateToken(token: string): Promise<AuthResult>;
  abstract getUserInfo(token: string): Promise<UserInfo>;
}
