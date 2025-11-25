import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import {
  HttpAuthError,
  HttpAuthGuard,
  isEventStreamRequest,
} from "../../src/transports/http-auth-guard.js";

function createRequest(
  options: {
    url?: string;
    method?: string;
    headers?: Record<string, string | string[]>;
    remoteAddress?: string;
    accept?: string;
  } = {},
): IncomingMessage {
  const headers: Record<string, string | string[]> = { ...(options.headers ?? {}) };
  if (options.accept) {
    headers["accept"] = options.accept;
  }

  return {
    url: options.url ?? "/mcp",
    method: options.method ?? "GET",
    headers,
    socket: { remoteAddress: options.remoteAddress ?? "127.0.0.1" },
  } as IncomingMessage;
}

describe("HttpAuthGuard", () => {
  describe("isProtectedEndpoint", () => {
    const guard = new HttpAuthGuard({ mode: "required" });

    it("allows OAuth endpoints", () => {
      expect(guard.isProtectedEndpoint(createRequest({ url: "/oauth/token" }))).toBe(false);
      expect(
        guard.isProtectedEndpoint(
          createRequest({ url: "/.well-known/oauth-authorization-server" }),
        ),
      ).toBe(false);
    });

    it("allows root and health endpoints", () => {
      expect(guard.isProtectedEndpoint(createRequest({ url: "/", method: "GET" }))).toBe(false);
      expect(guard.isProtectedEndpoint(createRequest({ url: "/health" }))).toBe(false);
    });

    it("protects tool endpoints", () => {
      expect(guard.isProtectedEndpoint(createRequest({ url: "/mcp", method: "POST" }))).toBe(true);
    });
  });

  describe("enforce", () => {
    it("returns disabled context when mode is disabled", async () => {
      const guard = new HttpAuthGuard({ mode: "disabled" });
      const context = await guard.enforce(createRequest());
      expect(context).toMatchObject({ source: "disabled", mode: "disabled" });
    });

    it("allows localhost bypass in localhost mode", async () => {
      const guard = new HttpAuthGuard({ mode: "localhost" });
      const context = await guard.enforce(createRequest({ remoteAddress: "127.0.0.1" }));
      expect(context).toMatchObject({ source: "localhost", mode: "localhost" });
    });

    it("requires tokens for non-localhost clients", async () => {
      const guard = new HttpAuthGuard({ mode: "localhost" });
      await expect(guard.enforce(createRequest({ remoteAddress: "10.0.0.2" }))).rejects.toThrow(
        HttpAuthError,
      );
    });

    it("throws when bearer token missing in required mode", async () => {
      const guard = new HttpAuthGuard({ mode: "required" });
      await expect(guard.enforce(createRequest())).rejects.toThrow(HttpAuthError);
    });

    it("accepts default token in required mode", async () => {
      const guard = new HttpAuthGuard({ mode: "required" });
      const context = await guard.enforce(
        createRequest({
          headers: { Authorization: "Bearer brooklyn-mcp-access-token" },
        }),
      );

      expect(context).toMatchObject({ source: "token", userId: "oauth-bearer" });
    });

    it("honors trusted proxies when extracting client ip", async () => {
      const guard = new HttpAuthGuard({ mode: "required", trustedProxies: ["10.0.0.1"] });
      const context = await guard.enforce(
        createRequest({
          remoteAddress: "10.0.0.1",
          headers: {
            Authorization: "Bearer brooklyn-mcp-access-token",
            "x-forwarded-for": "192.168.10.5",
          },
        }),
      );

      expect(context).toMatchObject({ source: "token", userId: "oauth-bearer" });
    });
  });

  describe("isEventStreamRequest", () => {
    it("detects SSE accept headers", () => {
      const req = createRequest({ accept: "text/event-stream" });
      expect(isEventStreamRequest(req)).toBe(true);
    });

    it("returns false for regular requests", () => {
      const req = createRequest({ accept: "application/json" });
      expect(isEventStreamRequest(req)).toBe(false);
    });
  });
});
