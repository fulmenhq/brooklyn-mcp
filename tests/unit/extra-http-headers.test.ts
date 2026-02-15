/**
 * Tests for extraHttpHeaders feature on launch_browser
 * Covers: env var resolution, validation, header redaction, tool schema
 */

import { afterEach, describe, expect, it } from "vitest";
import { redactHeaders, resolveExtraHttpHeaders } from "../../src/core/config.js";
import { getAllTools } from "../../src/core/tool-definitions.js";

describe("resolveExtraHttpHeaders", () => {
  const originalEnv = process.env["BROOKLYN_HTTP_HEADERS"];

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env["BROOKLYN_HTTP_HEADERS"] = originalEnv;
    } else {
      delete process.env["BROOKLYN_HTTP_HEADERS"];
    }
  });

  it("should return param headers when provided (highest priority)", () => {
    process.env["BROOKLYN_HTTP_HEADERS"] = '{"X-Env": "from-env"}';
    const paramHeaders = { Authorization: "Bearer param-token" };

    const result = resolveExtraHttpHeaders(paramHeaders);

    expect(result).toEqual({ Authorization: "Bearer param-token" });
  });

  it("should fall back to BROOKLYN_HTTP_HEADERS env var", () => {
    process.env["BROOKLYN_HTTP_HEADERS"] = '{"Authorization": "Bearer env-token"}';

    const result = resolveExtraHttpHeaders();

    expect(result).toEqual({ Authorization: "Bearer env-token" });
  });

  it("should return undefined when neither param nor env var is set", () => {
    delete process.env["BROOKLYN_HTTP_HEADERS"];

    const result = resolveExtraHttpHeaders();

    expect(result).toBeUndefined();
  });

  it("should throw on invalid JSON in env var", () => {
    process.env["BROOKLYN_HTTP_HEADERS"] = "not-valid-json";

    expect(() => resolveExtraHttpHeaders()).toThrow("invalid JSON");
  });

  it("should throw when env var is a JSON array", () => {
    process.env["BROOKLYN_HTTP_HEADERS"] = '["not", "an", "object"]';

    expect(() => resolveExtraHttpHeaders()).toThrow("JSON object");
  });

  it("should throw when env var has non-string values", () => {
    process.env["BROOKLYN_HTTP_HEADERS"] = '{"count": 42}';

    expect(() => resolveExtraHttpHeaders()).toThrow("string value");
  });

  it("should throw when param headers have non-string values", () => {
    const badHeaders = { Authorization: 123 } as unknown as Record<string, string>;

    expect(() => resolveExtraHttpHeaders(badHeaders)).toThrow("string value");
  });

  it("should handle empty param headers object", () => {
    const result = resolveExtraHttpHeaders({});

    expect(result).toEqual({});
  });

  it("should handle env var with multiple headers", () => {
    process.env["BROOKLYN_HTTP_HEADERS"] = JSON.stringify({
      Authorization: "Bearer token",
      "X-Custom": "value",
      Cookie: "session=abc123",
    });

    const result = resolveExtraHttpHeaders();

    expect(result).toEqual({
      Authorization: "Bearer token",
      "X-Custom": "value",
      Cookie: "session=abc123",
    });
  });
});

describe("redactHeaders", () => {
  it("should redact Authorization header", () => {
    const headers = { Authorization: "Bearer secret-token" };

    const result = redactHeaders(headers);

    expect(result).toEqual({ Authorization: "[REDACTED]" });
  });

  it("should redact Cookie header", () => {
    const headers = { Cookie: "session=abc123; token=xyz" };

    const result = redactHeaders(headers);

    expect(result).toEqual({ Cookie: "[REDACTED]" });
  });

  it("should redact case-insensitively", () => {
    const headers = {
      authorization: "Bearer token",
      COOKIE: "session=abc",
      "Set-Cookie": "new=val",
      "Proxy-Authorization": "Basic xyz",
      "X-API-Key": "key123",
      "X-Auth-Token": "token456",
    };

    const result = redactHeaders(headers);

    expect(result["authorization"]).toBe("[REDACTED]");
    expect(result["COOKIE"]).toBe("[REDACTED]");
    expect(result["Set-Cookie"]).toBe("[REDACTED]");
    expect(result["Proxy-Authorization"]).toBe("[REDACTED]");
    expect(result["X-API-Key"]).toBe("[REDACTED]");
    expect(result["X-Auth-Token"]).toBe("[REDACTED]");
  });

  it("should NOT redact non-sensitive headers", () => {
    const headers = {
      "Content-Type": "application/json",
      Accept: "text/html",
      "User-Agent": "Brooklyn/1.0",
    };

    const result = redactHeaders(headers);

    expect(result).toEqual(headers);
  });

  it("should handle mixed sensitive and non-sensitive headers", () => {
    const headers = {
      Authorization: "Bearer secret",
      "Content-Type": "application/json",
      Cookie: "session=xyz",
      "X-Request-Id": "req-123",
    };

    const result = redactHeaders(headers);

    expect(result).toEqual({
      Authorization: "[REDACTED]",
      "Content-Type": "application/json",
      Cookie: "[REDACTED]",
      "X-Request-Id": "req-123",
    });
  });

  it("should handle empty headers object", () => {
    expect(redactHeaders({})).toEqual({});
  });
});

describe("launch_browser tool schema", () => {
  it("should include extraHttpHeaders in launch_browser inputSchema", () => {
    const tools = getAllTools();
    const launchBrowser = tools.find((t) => t.name === "launch_browser");

    expect(launchBrowser).toBeDefined();

    const props = launchBrowser!.inputSchema.properties as Record<string, unknown>;
    expect(props["extraHttpHeaders"]).toBeDefined();

    const headerSchema = props["extraHttpHeaders"] as Record<string, unknown>;
    expect(headerSchema["type"]).toBe("object");
    expect(headerSchema["additionalProperties"]).toEqual({ type: "string" });
  });

  it("should have an example with extraHttpHeaders", () => {
    const tools = getAllTools();
    const launchBrowser = tools.find((t) => t.name === "launch_browser");
    const authExample = launchBrowser!.examples?.find((e) =>
      e.description.includes("auth headers"),
    );

    expect(authExample).toBeDefined();
    expect((authExample!.input as Record<string, unknown>)["extraHttpHeaders"]).toBeDefined();
  });
});
