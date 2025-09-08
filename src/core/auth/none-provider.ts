/**
 * None (development-only) authentication provider for Brooklyn MCP
 * Provides no authentication - only for development use with explicit flag
 */

import type { BrooklynConfig } from "../config.js";
import { BaseAuthProvider } from "./base-provider.js";
import type { AuthResult, UserInfo } from "./types.js";
import { AuthenticationError } from "./types.js";

/**
 * Development-only authentication provider (no authentication)
 */
export class NoneAuthProvider extends BaseAuthProvider {
  readonly name = "none";
  readonly type = "none" as const;

  protected async doInitialize(config: BrooklynConfig): Promise<void> {
    // Validate that development-only flag is set
    if (!config.authentication.developmentOnly) {
      throw new AuthenticationError(
        "Authentication mode 'none' requires developmentOnly: true",
        "DEVELOPMENT_ONLY_REQUIRED",
        500,
      );
    }

    // Check if we're in a production-like environment
    const isProduction = this.isProductionEnvironment();
    if (isProduction) {
      throw new AuthenticationError(
        "Cannot use 'none' authentication in production environment",
        "PRODUCTION_ENVIRONMENT_DETECTED",
        500,
      );
    }

    // Log prominent security warning
    this.logger.error("🚨 SECURITY WARNING: Authentication disabled!", {
      mode: "none",
      security: "DISABLED",
      developmentOnly: true,
      recommendation: "Use GitHub or local auth for production",
    });

    // Additional startup delay to ensure visibility of warning
    await new Promise((resolve) => setTimeout(resolve, 2000));

    this.logger.warn("None authentication provider initialized - DEVELOPMENT ONLY", {
      developmentOnly: config.authentication.developmentOnly,
    });
  }

  /**
   * Validate token (always succeeds in development mode)
   */
  async validateToken(_token: string): Promise<AuthResult> {
    this.ensureInitialized();

    // Accept any token in development mode
    return {
      success: true,
      userId: "dev-user",
      teamId: "development",
      permissions: [
        "mcp:admin",
        "mcp:basic",
        "mcp:navigate",
        "mcp:screenshot",
        "mcp:browser",
        "mcp:debug",
      ],
    };
  }

  /**
   * Get user information (returns development user)
   */
  async getUserInfo(_token: string): Promise<UserInfo> {
    this.ensureInitialized();

    return {
      id: "dev-user",
      username: "developer",
      email: "developer@localhost",
      displayName: "Development User",
    };
  }

  /**
   * Create session (always succeeds)
   */
  override async createSession(
    userId: string,
    metadata: Record<string, unknown> = {},
  ): Promise<string> {
    this.ensureInitialized();

    // Generate a development session token
    const sessionToken = `dev-session-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    this.logger.debug("Development session created", {
      userId,
      sessionToken: `${sessionToken.slice(0, 16)}...`,
      metadata,
    });

    return sessionToken;
  }

  /**
   * Check if we're in a production environment
   */
  private isProductionEnvironment(): boolean {
    // Check common production environment indicators
    const env = process.env;

    // Explicit production environment
    if (env["NODE_ENV"] === "production" || env["BROOKLYN_ENV"] === "production") {
      return true;
    }

    // Production-like indicators
    if (env["KUBERNETES_SERVICE_HOST"]) {
      return true; // Running in Kubernetes
    }

    if (env["DOCKER_CONTAINER_ID"] || env["HOSTNAME"]?.includes("docker")) {
      return true; // Running in Docker (likely production)
    }

    if (env["AWS_EXECUTION_ENV"] || env["LAMBDA_TASK_ROOT"]) {
      return true; // Running in AWS Lambda
    }

    if (env["HEROKU_DYNO_ID"] || env["DYNO"]) {
      return true; // Running on Heroku
    }

    if (env["VERCEL"] || env["NETLIFY"]) {
      return true; // Running on Vercel or Netlify
    }

    // Check for production-like hostnames
    const hostname = env["HOSTNAME"] || "";
    if (hostname.includes("prod") || hostname.includes("production")) {
      return true;
    }

    // Check for production-like ports (common production ports)
    const port = process.env["PORT"] || process.env["BROOKLYN_PORT"];
    if (port && (port === "80" || port === "443" || port === "8080")) {
      return true;
    }

    return false;
  }

  /**
   * Override getStatus to include security warnings
   */
  override getStatus(): { healthy: boolean; details?: Record<string, unknown> } {
    const baseStatus = super.getStatus();

    return {
      ...baseStatus,
      details: {
        ...baseStatus.details,
        securityWarning: "AUTHENTICATION DISABLED",
        developmentOnly: true,
        productionSafe: false,
      },
    };
  }
}
