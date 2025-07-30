/**
 * MCP Request Context - Manages context for browser tool requests
 * Provides team isolation and request tracking
 */

import { randomUUID } from "node:crypto";

export interface MCPRequestContext {
  /**
   * Unique request ID for tracking
   */
  requestId: string;

  /**
   * Team ID for isolation (optional)
   */
  teamId?: string;

  /**
   * User ID making the request (optional)
   */
  userId?: string;

  /**
   * Request timestamp
   */
  timestamp: Date;

  /**
   * Source of the request (e.g., "claude-code", "api", "cli")
   */
  source?: string;

  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Factory for creating MCP request contexts
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Architectural pattern - Factory with grouped context operations
export class MCPRequestContextFactory {
  /**
   * Create a new request context
   */
  static create(
    options: {
      teamId?: string;
      userId?: string;
      source?: string;
      metadata?: Record<string, unknown>;
    } = {},
  ): MCPRequestContext {
    return {
      requestId: randomUUID(),
      timestamp: new Date(),
      teamId: options.teamId,
      userId: options.userId,
      source: options.source || "unknown",
      metadata: options.metadata,
    };
  }

  /**
   * Create context from MCP protocol headers
   */
  static fromMCPHeaders(headers: Record<string, string | string[]>): MCPRequestContext {
    // Extract team and user information from headers
    const teamId = MCPRequestContextFactory.extractHeader(headers, "x-team-id");
    const userId = MCPRequestContextFactory.extractHeader(headers, "x-user-id");
    const source = MCPRequestContextFactory.extractHeader(headers, "x-source") || "mcp";
    const requestId =
      MCPRequestContextFactory.extractHeader(headers, "x-request-id") || randomUUID();

    return {
      requestId,
      teamId,
      userId,
      source,
      timestamp: new Date(),
      metadata: {
        headers,
      },
    };
  }

  /**
   * Extract a header value
   */
  private static extractHeader(
    headers: Record<string, string | string[]>,
    key: string,
  ): string | undefined {
    const value = headers[key] || headers[key.toLowerCase()];
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }

  /**
   * Validate context has required permissions
   */
  static validatePermissions(
    context: MCPRequestContext,
    requirements: {
      requireTeam?: boolean;
      requireUser?: boolean;
      allowedTeams?: string[];
      allowedSources?: string[];
    },
  ): { valid: boolean; error?: string } {
    // Check team requirement
    if (requirements.requireTeam && !context.teamId) {
      return {
        valid: false,
        error: "Team ID is required for this operation",
      };
    }

    // Check user requirement
    if (requirements.requireUser && !context.userId) {
      return {
        valid: false,
        error: "User ID is required for this operation",
      };
    }

    // Check allowed teams
    if (requirements.allowedTeams && context.teamId) {
      if (!requirements.allowedTeams.includes(context.teamId)) {
        return {
          valid: false,
          error: `Team ${context.teamId} is not allowed to perform this operation`,
        };
      }
    }

    // Check allowed sources
    if (requirements.allowedSources && context.source) {
      if (!requirements.allowedSources.includes(context.source)) {
        return {
          valid: false,
          error: `Source ${context.source} is not allowed to perform this operation`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Create a child context for sub-operations
   */
  static createChild(
    parent: MCPRequestContext,
    overrides: Partial<MCPRequestContext> = {},
  ): MCPRequestContext {
    return {
      ...parent,
      ...overrides,
      requestId: overrides.requestId || `${parent.requestId}-${randomUUID().split("-")[0]}`,
      timestamp: new Date(),
      metadata: {
        ...parent.metadata,
        ...overrides.metadata,
        parentRequestId: parent.requestId,
      },
    };
  }

  /**
   * Serialize context for logging
   */
  static toLogContext(context: MCPRequestContext): Record<string, unknown> {
    return {
      requestId: context.requestId,
      teamId: context.teamId,
      userId: context.userId,
      source: context.source,
      timestamp: context.timestamp.toISOString(),
    };
  }
}

/**
 * Context-aware error class
 */
export class MCPContextError extends Error {
  constructor(
    message: string,
    public context: MCPRequestContext,
    public code?: string,
  ) {
    super(message);
    this.name = "MCPContextError";
  }
}
