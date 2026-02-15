/**
 * Integration test: inspect_network captures real HTTP traffic.
 *
 * Spins up an HTTP server, navigates a browser to it, then uses
 * inspect_network to verify the request/response pairs are buffered
 * and properly redacted.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MCPBrowserRouter } from "../../src/core/browser/mcp-browser-router.js";
import { MCPRequestContextFactory } from "../../src/core/browser/mcp-request-context.js";
import { BrowserPoolManager } from "../../src/core/browser-pool-manager.js";

let echoServer: Server;
let echoPort: number;
const originalFullHeader = process.env["BROOKLYN_FULL_HEADER_SUPPORT"];

function makeContext(teamId = "test-network") {
  return MCPRequestContextFactory.create({
    teamId,
    userId: "integration-test",
    metadata: { permissions: ["browser.launch", "browser.navigate"] },
  });
}

beforeAll(async () => {
  echoServer = createServer((_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, {
      "Content-Type": "text/html",
      "X-Custom-Response": "resp-value",
    });
    res.end("<html><body>OK</body></html>");
  });

  await new Promise<void>((resolve) => {
    echoServer.listen(0, "127.0.0.1", () => {
      const addr = echoServer.address();
      echoPort = typeof addr === "object" && addr ? addr.port : 0;
      resolve();
    });
  });
});

afterEach(() => {
  if (originalFullHeader !== undefined) {
    process.env["BROOKLYN_FULL_HEADER_SUPPORT"] = originalFullHeader;
  } else {
    delete process.env["BROOKLYN_FULL_HEADER_SUPPORT"];
  }
});

afterAll(async () => {
  await new Promise<void>((resolve) => echoServer.close(() => resolve()));
}, 10000);

describe("inspect_network integration", () => {
  it("should capture network events after navigation", async () => {
    const pool = new BrowserPoolManager({ mcpMode: true });
    await pool.initialize();
    const router = new MCPBrowserRouter(pool);
    const ctx = makeContext("team-capture");

    try {
      const launch = await router.route({
        tool: "launch_browser",
        params: {
          browserType: "chromium",
          headless: true,
          extraHttpHeaders: { Authorization: "Bearer secret-token" },
        },
        context: ctx,
      });
      expect(launch.success).toBe(true);
      const browserId = (launch.result as Record<string, unknown>)["browserId"] as string;

      await router.route({
        tool: "navigate_to_url",
        params: {
          browserId,
          url: `http://127.0.0.1:${echoPort}/page`,
          waitUntil: "networkidle",
        },
        context: ctx,
      });

      const result = await router.route({
        tool: "inspect_network",
        params: { browserId },
        context: ctx,
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data["redacted"]).toBe(true);
      expect(data["count"]).toBeGreaterThanOrEqual(1);

      const requests = data["requests"] as Record<string, unknown>[];
      const pageReq = requests.find((r) => (r["url"] as string).includes("/page"));
      expect(pageReq).toBeDefined();
      expect(pageReq!["method"]).toBe("GET");
      expect(pageReq!["status"]).toBe(200);

      // Authorization should be redacted by default
      const reqHeaders = pageReq!["requestHeaders"] as Record<string, string>;
      expect(reqHeaders["authorization"]).toBe("[REDACTED]");
    } finally {
      await pool.cleanup();
    }
  });

  it("should enforce baseline redaction even when redact is empty", async () => {
    const pool = new BrowserPoolManager({ mcpMode: true });
    await pool.initialize();
    const router = new MCPBrowserRouter(pool);
    const ctx = makeContext("team-bypass");

    try {
      const launch = await router.route({
        tool: "launch_browser",
        params: {
          browserType: "chromium",
          headless: true,
          extraHttpHeaders: { Authorization: "Bearer should-be-redacted" },
        },
        context: ctx,
      });
      const browserId = (launch.result as Record<string, unknown>)["browserId"] as string;

      await router.route({
        tool: "navigate_to_url",
        params: {
          browserId,
          url: `http://127.0.0.1:${echoPort}/bypass-test`,
          waitUntil: "networkidle",
        },
        context: ctx,
      });

      // Attempt bypass with empty redact list
      const result = await router.route({
        tool: "inspect_network",
        params: { browserId, redact: [] },
        context: ctx,
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data["redacted"]).toBe(true);

      const requests = data["requests"] as Record<string, unknown>[];
      const bypassReq = requests.find((r) => (r["url"] as string).includes("/bypass-test"));
      expect(bypassReq).toBeDefined();

      // Authorization must still be redacted — empty redact list cannot bypass baseline
      const reqHeaders = bypassReq!["requestHeaders"] as Record<string, string>;
      expect(reqHeaders["authorization"]).toBe("[REDACTED]");
    } finally {
      await pool.cleanup();
    }
  });

  it("should filter by URL pattern", async () => {
    const pool = new BrowserPoolManager({ mcpMode: true });
    await pool.initialize();
    const router = new MCPBrowserRouter(pool);
    const ctx = makeContext("team-filter");

    try {
      const launch = await router.route({
        tool: "launch_browser",
        params: { browserType: "chromium", headless: true },
        context: ctx,
      });
      const browserId = (launch.result as Record<string, unknown>)["browserId"] as string;

      await router.route({
        tool: "navigate_to_url",
        params: {
          browserId,
          url: `http://127.0.0.1:${echoPort}/api/data`,
          waitUntil: "networkidle",
        },
        context: ctx,
      });

      // Filter for /api/ pattern
      const result = await router.route({
        tool: "inspect_network",
        params: { browserId, filter: { urlPattern: "/api/" } },
        context: ctx,
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      const requests = data["requests"] as Record<string, unknown>[];
      expect(requests.length).toBeGreaterThanOrEqual(1);
      for (const req of requests) {
        expect(req["url"] as string).toContain("/api/");
      }

      // Filter for nonexistent pattern
      const noResult = await router.route({
        tool: "inspect_network",
        params: { browserId, filter: { urlPattern: "/nonexistent/" } },
        context: ctx,
      });
      expect((noResult.result as Record<string, unknown>)["count"]).toBe(0);
    } finally {
      await pool.cleanup();
    }
  });

  it("should reject includeRaw when BROOKLYN_FULL_HEADER_SUPPORT is not set", async () => {
    delete process.env["BROOKLYN_FULL_HEADER_SUPPORT"];

    const pool = new BrowserPoolManager({ mcpMode: true });
    await pool.initialize();
    const router = new MCPBrowserRouter(pool);
    const ctx = makeContext("team-raw-denied");

    try {
      const launch = await router.route({
        tool: "launch_browser",
        params: { browserType: "chromium", headless: true },
        context: ctx,
      });
      const browserId = (launch.result as Record<string, unknown>)["browserId"] as string;

      await router.route({
        tool: "navigate_to_url",
        params: {
          browserId,
          url: `http://127.0.0.1:${echoPort}/test`,
          waitUntil: "networkidle",
        },
        context: ctx,
      });

      const result = await router.route({
        tool: "inspect_network",
        params: { browserId, includeRaw: true },
        context: ctx,
      });

      // Should fail — the router wraps errors into success: false
      expect(result.success).toBe(false);
    } finally {
      await pool.cleanup();
    }
  });

  it("should allow includeRaw when BROOKLYN_FULL_HEADER_SUPPORT=true", async () => {
    process.env["BROOKLYN_FULL_HEADER_SUPPORT"] = "true";

    const pool = new BrowserPoolManager({ mcpMode: true });
    await pool.initialize();
    const router = new MCPBrowserRouter(pool);
    const ctx = makeContext("team-raw-allowed");

    try {
      const launch = await router.route({
        tool: "launch_browser",
        params: {
          browserType: "chromium",
          headless: true,
          extraHttpHeaders: { Authorization: "Bearer raw-test-token" },
        },
        context: ctx,
      });
      const browserId = (launch.result as Record<string, unknown>)["browserId"] as string;

      await router.route({
        tool: "navigate_to_url",
        params: {
          browserId,
          url: `http://127.0.0.1:${echoPort}/raw`,
          waitUntil: "networkidle",
        },
        context: ctx,
      });

      const result = await router.route({
        tool: "inspect_network",
        params: { browserId, includeRaw: true },
        context: ctx,
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data["redacted"]).toBe(false);

      const requests = data["requests"] as Record<string, unknown>[];
      const rawReq = requests.find((r) => (r["url"] as string).includes("/raw"));
      expect(rawReq).toBeDefined();

      // With includeRaw, Authorization should NOT be redacted
      const reqHeaders = rawReq!["requestHeaders"] as Record<string, string>;
      expect(reqHeaders["authorization"]).toBe("Bearer raw-test-token");
    } finally {
      await pool.cleanup();
    }
  });
});
