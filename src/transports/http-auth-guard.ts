import type { IncomingMessage } from "node:http";

import type { HTTPAuthMode, HTTPTokenResolver } from "../core/transport.js";

const DEFAULT_BEARER_TOKEN = "brooklyn-mcp-access-token";

export interface HttpAuthContext {
  mode: HTTPAuthMode;
  source: "token" | "localhost" | "disabled";
  token?: string;
  userId?: string;
  teamId?: string;
}

export interface HttpAuthGuardOptions {
  mode: HTTPAuthMode;
  trustedProxies?: string[];
  tokenResolver?: HTTPTokenResolver;
}

export class HttpAuthError extends Error {
  constructor(
    public code: "AUTH_REQUIRED" | "INVALID_TOKEN" | "FORBIDDEN",
    message: string,
    public statusCode = 401,
  ) {
    super(message);
    this.name = "HttpAuthError";
  }
}

export function isEventStreamRequest(req: IncomingMessage): boolean {
  const acceptHeader = req.headers.accept;
  if (!acceptHeader) {
    return false;
  }

  return acceptHeader
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .some((value) => value === "text/event-stream");
}

export class HttpAuthGuard {
  private readonly mode: HTTPAuthMode;
  private readonly trustedProxySet: Set<string>;
  private readonly tokenResolver: HTTPTokenResolver;

  private readonly fallbackTokenResolver: HTTPTokenResolver = async (token) => {
    if (token === DEFAULT_BEARER_TOKEN) {
      return { userId: "oauth-bearer" };
    }
    return null;
  };

  constructor(options: HttpAuthGuardOptions) {
    this.mode = options.mode;
    this.trustedProxySet = new Set(
      (options.trustedProxies ?? [])
        .map((value) => normalizeAddress(value))
        .filter((value): value is string => Boolean(value)),
    );
    this.tokenResolver = options.tokenResolver ?? this.fallbackTokenResolver;
  }

  isProtectedEndpoint(req: IncomingMessage): boolean {
    const path = this.normalizePath(req.url);

    if (path.startsWith("/oauth")) {
      return false;
    }
    if (path.includes("/.well-known")) {
      return false;
    }
    if (path === "/health") {
      return false;
    }
    if (req.method === "OPTIONS") {
      return false;
    }
    if (path === "/" && req.method === "GET" && !isEventStreamRequest(req)) {
      return false;
    }

    return true;
  }

  async enforce(req: IncomingMessage): Promise<HttpAuthContext> {
    if (this.mode === "disabled") {
      return {
        mode: this.mode,
        source: "disabled",
      };
    }

    const clientIp = this.getClientIp(req);

    if (this.mode === "localhost" && this.isLoopback(clientIp)) {
      return {
        mode: this.mode,
        source: "localhost",
      };
    }

    const token = this.extractBearerToken(req);
    if (!token) {
      throw new HttpAuthError("AUTH_REQUIRED", "Authentication required");
    }

    const tokenContext = await this.tokenResolver(token);
    if (!tokenContext) {
      throw new HttpAuthError("INVALID_TOKEN", "Invalid or expired bearer token");
    }

    return {
      mode: this.mode,
      source: "token",
      token,
      userId: tokenContext.userId,
      teamId: tokenContext.teamId,
    };
  }

  private normalizePath(url?: string | null): string {
    if (!url) {
      return "/";
    }
    return url.split("?")[0] || "/";
  }

  private extractBearerToken(req: IncomingMessage): string | undefined {
    const header = req.headers["authorization"] || req.headers["Authorization"];
    if (!header) {
      return undefined;
    }

    const rawValue = Array.isArray(header) ? header[0] : header;
    if (!rawValue) {
      return undefined;
    }
    const [scheme, value] = rawValue.trim().split(/\s+/);
    if (!scheme || scheme.toLowerCase() !== "bearer") {
      return undefined;
    }
    return value;
  }

  private getClientIp(req: IncomingMessage): string | undefined {
    const remoteAddress = normalizeAddress(req.socket?.remoteAddress);
    if (!remoteAddress) {
      return undefined;
    }

    if (this.isTrustedProxy(remoteAddress)) {
      const forwardedHeader = req.headers["x-forwarded-for"];
      const forwarded = this.extractForwardedAddress(forwardedHeader);
      if (forwarded) {
        return forwarded;
      }
    }

    return remoteAddress;
  }

  private extractForwardedAddress(header: string | string[] | undefined): string | undefined {
    if (!header) {
      return undefined;
    }

    const raw = Array.isArray(header) ? header[0] : header;
    if (!raw) {
      return undefined;
    }

    const first = raw.split(",")[0]?.trim();
    return normalizeAddress(first);
  }

  private isLoopback(address?: string): boolean {
    if (!address) {
      return false;
    }

    const normalized = address.toLowerCase();
    if (normalized.startsWith("127.")) {
      return true;
    }
    if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") {
      return true;
    }

    return false;
  }

  private isTrustedProxy(address: string): boolean {
    return this.trustedProxySet.has(address);
  }
}

function normalizeAddress(address?: string | null): string | undefined {
  if (!address) {
    return undefined;
  }

  const trimmed = address.split("%")[0]?.trim();
  if (!trimmed) {
    return undefined;
  }

  let normalized = trimmed;
  if (normalized.startsWith("::ffff:")) {
    normalized = normalized.slice(7);
  }

  return normalized.toLowerCase();
}
