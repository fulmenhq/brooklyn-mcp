/**
 * Security middleware for Brooklyn MCP server
 * Enterprise-ready domain validation, rate limiting, and access control
 */

import type { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";
import { getLogger } from "../shared/structured-logger.js";

// Logger will be created lazily after logging is initialized
let logger: ReturnType<typeof getLogger> | null = null;

function ensureLogger() {
  if (!logger) {
    logger = getLogger("security-middleware");
  }
  return logger;
}

/**
 * Security configuration interface
 */
export interface SecurityConfig {
  allowedDomains: string[];
  rateLimiting: {
    requests: number;
    windowMs: number;
  };
  maxBrowsers: number;
  teamIsolation: boolean;
}

/**
 * Rate limiting store
 */
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

/**
 * Security validation error types
 */
export class SecurityError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode = 403,
  ) {
    super(message);
    this.name = "SecurityError";
  }
}

/**
 * Security middleware for Brooklyn MCP server
 * Handles domain validation, rate limiting, and team isolation
 */
export class SecurityMiddleware {
  private readonly config: SecurityConfig;
  private readonly rateLimitStore = new Map<string, RateLimitEntry>();
  private readonly cleanupInterval: NodeJS.Timer;

  constructor(config?: Partial<SecurityConfig>) {
    this.config = {
      allowedDomains: config?.allowedDomains || ["*"],
      rateLimiting: config?.rateLimiting || { requests: 100, windowMs: 60000 },
      maxBrowsers: config?.maxBrowsers || 10,
      teamIsolation: config?.teamIsolation ?? true,
    };

    // Set up periodic cleanup of rate limit store
    this.cleanupInterval = setInterval(() => {
      this.cleanupRateLimitStore();
    }, this.config.rateLimiting.windowMs);

    // Defer logging until first use to avoid circular dependency
  }

  /**
   * Validate incoming MCP tool request
   */
  async validateRequest(
    request: CallToolRequest,
    context?: { teamId?: string; userId?: string },
  ): Promise<void> {
    const { name, arguments: args } = request.params;
    const clientId = context?.teamId || context?.userId || "anonymous";

    ensureLogger().debug("Validating request", {
      tool: name,
      clientId,
      args,
    });

    try {
      // Rate limiting validation
      await this.validateRateLimit(clientId);

      // Domain validation for navigation tools
      await this.validateDomainAccess(name, args);

      // Team isolation validation
      await this.validateTeamAccess(name, args, context?.teamId);

      // Browser resource limits
      await this.validateResourceLimits(name, args, clientId);

      ensureLogger().debug("Request validation passed", {
        tool: name,
        clientId,
      });
    } catch (error) {
      ensureLogger().warn("Request validation failed", {
        tool: name,
        clientId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Validate rate limits for client
   */
  private async validateRateLimit(clientId: string): Promise<void> {
    const now = Date.now();
    const windowStart =
      Math.floor(now / this.config.rateLimiting.windowMs) * this.config.rateLimiting.windowMs;

    let entry = this.rateLimitStore.get(clientId);

    if (!entry || entry.windowStart < windowStart) {
      entry = { count: 0, windowStart };
      this.rateLimitStore.set(clientId, entry);
    }

    entry.count++;

    if (entry.count > this.config.rateLimiting.requests) {
      throw new SecurityError(
        `Rate limit exceeded: ${entry.count}/${this.config.rateLimiting.requests} requests per ${this.config.rateLimiting.windowMs}ms`,
        "RATE_LIMIT_EXCEEDED",
        429,
      );
    }

    ensureLogger().debug("Rate limit check passed", {
      clientId,
      count: entry.count,
      limit: this.config.rateLimiting.requests,
    });
  }

  /**
   * Validate domain access for navigation tools
   */
  private async validateDomainAccess(toolName: string, args: unknown): Promise<void> {
    if (toolName === "navigate_to_url" && args && typeof args === "object" && "url" in args) {
      const url = String((args as { url: unknown }).url);

      // Skip validation for data URLs (used for testing)
      if (url.startsWith("data:")) {
        return;
      }

      try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.toLowerCase();

        // Check if domain is in allowlist
        const isAllowed =
          this.config.allowedDomains.includes("*") ||
          this.config.allowedDomains.some((allowed) => {
            // Support wildcard domains like *.example.com
            if (allowed.startsWith("*.")) {
              const baseDomain = allowed.slice(2);
              return domain === baseDomain || domain.endsWith(`.${baseDomain}`);
            }
            return domain === allowed;
          });

        if (!isAllowed) {
          throw new SecurityError(
            `Domain '${domain}' is not in allowed domains list: ${this.config.allowedDomains.join(", ")}`,
            "DOMAIN_NOT_ALLOWED",
          );
        }

        ensureLogger().debug("Domain access validated", {
          url,
          domain,
          allowed: true,
        });
      } catch (error) {
        if (error instanceof SecurityError) {
          throw error;
        }
        throw new SecurityError(`Invalid URL format: ${url}`, "INVALID_URL_FORMAT");
      }
    }
  }

  /**
   * Validate team access and isolation
   */
  private async validateTeamAccess(
    toolName: string,
    args: unknown,
    teamId?: string,
  ): Promise<void> {
    if (!this.config.teamIsolation) {
      return;
    }

    // Tools that require team ID
    const teamRestrictedTools = ["launch_browser"];

    if (teamRestrictedTools.includes(toolName)) {
      if (!teamId) {
        throw new SecurityError(
          `Tool '${toolName}' requires team identification`,
          "TEAM_ID_REQUIRED",
        );
      }

      // Ensure team ID is consistent in args
      if (
        args &&
        typeof args === "object" &&
        "teamId" in args &&
        (args as { teamId: unknown }).teamId !== teamId
      ) {
        throw new SecurityError(
          `Team ID mismatch: request teamId '${(args as { teamId: unknown }).teamId}' does not match authenticated team '${teamId}'`,
          "TEAM_ID_MISMATCH",
        );
      }
    }

    // Tools that operate on existing browsers should validate ownership
    const browserOperationTools = [
      "navigate_to_url",
      "take_screenshot",
      "go_back",
      "close_browser",
    ];

    if (
      browserOperationTools.includes(toolName) &&
      args &&
      typeof args === "object" &&
      "browserId" in args
    ) {
      // TODO: Implement browser ownership validation
      // This would check that the browserId belongs to the requesting team
      ensureLogger().debug("Browser ownership validation", {
        tool: toolName,
        browserId: (args as { browserId: unknown }).browserId,
        teamId,
      });
    }
  }

  /**
   * Validate resource limits
   */
  private async validateResourceLimits(
    toolName: string,
    _args: unknown,
    clientId: string,
  ): Promise<void> {
    if (toolName === "launch_browser") {
      // TODO: Implement browser count tracking per team/client
      // This would prevent exceeding maxBrowsers per team

      ensureLogger().debug("Resource limit validation", {
        tool: toolName,
        clientId,
        maxBrowsers: this.config.maxBrowsers,
      });
    }
  }

  /**
   * Update security configuration
   */
  updateConfig(newConfig: Partial<SecurityConfig>): void {
    Object.assign(this.config, newConfig);

    ensureLogger().info("Security configuration updated", {
      allowedDomains: this.config.allowedDomains,
      rateLimit: this.config.rateLimiting,
    });
  }

  /**
   * Get current security status
   */
  getStatus(): {
    config: SecurityConfig;
    rateLimitEntries: number;
    uptime: number;
  } {
    return {
      config: this.config,
      rateLimitEntries: this.rateLimitStore.size,
      uptime: process.uptime(),
    };
  }

  /**
   * Clean up rate limit store
   */
  private cleanupRateLimitStore(): void {
    const now = Date.now();
    const cutoffTime = now - this.config.rateLimiting.windowMs * 2; // Keep two windows for safety

    let cleaned = 0;
    for (const [clientId, entry] of this.rateLimitStore) {
      if (entry.windowStart < cutoffTime) {
        this.rateLimitStore.delete(clientId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      ensureLogger().debug("Rate limit store cleaned", {
        entriesRemoved: cleaned,
        remainingEntries: this.rateLimitStore.size,
      });
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.rateLimitStore.clear();

    ensureLogger().info("Security middleware cleaned up");
  }
}
