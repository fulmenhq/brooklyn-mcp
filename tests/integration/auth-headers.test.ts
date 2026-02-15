/**
 * Integration test: extraHttpHeaders reach actual HTTP traffic.
 *
 * Spins up a tiny HTTP server that echoes received headers back as JSON,
 * launches a browser with extraHttpHeaders, navigates to the echo endpoint,
 * and asserts the injected headers arrived.
 *
 * Each test gets its own pool+router to guarantee browser context isolation
 * (headers are set at BrowserContext creation and persist for the instance lifetime).
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MCPBrowserRouter } from "../../src/core/browser/mcp-browser-router.js";
import { MCPRequestContextFactory } from "../../src/core/browser/mcp-request-context.js";
import { BrowserPoolManager } from "../../src/core/browser-pool-manager.js";

let echoServer: Server;
let echoPort: number;
const originalEnv = process.env["BROOKLYN_HTTP_HEADERS"];

function makeContext(teamId = "test-auth") {
  return MCPRequestContextFactory.create({
    teamId,
    userId: "integration-test",
    metadata: { permissions: ["browser.launch", "browser.navigate"] },
  });
}

/** Launch a browser, navigate to echo server, return the received headers. */
async function launchAndCapture(
  router: MCPBrowserRouter,
  launchParams: Record<string, unknown>,
  teamId: string,
): Promise<{ receivedHeaders: Record<string, string>; browserId: string }> {
  const ctx = makeContext(teamId);

  const launch = await router.route({
    tool: "launch_browser",
    params: { browserType: "chromium", headless: true, ...launchParams },
    context: ctx,
  });

  expect(launch.success).toBe(true);
  const browserId = (launch.result as Record<string, unknown>)["browserId"] as string;

  const nav = await router.route({
    tool: "navigate_to_url",
    params: { browserId, url: `http://127.0.0.1:${echoPort}/test`, waitUntil: "networkidle" },
    context: ctx,
  });
  expect(nav.success).toBe(true);

  const content = await router.route({
    tool: "get_text_content",
    params: { browserId, selector: "body" },
    context: ctx,
  });
  expect(content.success).toBe(true);

  const bodyText = (content.result as Record<string, unknown>)["textContent"] as string;
  return { receivedHeaders: JSON.parse(bodyText).receivedHeaders, browserId };
}

beforeAll(async () => {
  echoServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ receivedHeaders: req.headers }));
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
  if (originalEnv !== undefined) {
    process.env["BROOKLYN_HTTP_HEADERS"] = originalEnv;
  } else {
    delete process.env["BROOKLYN_HTTP_HEADERS"];
  }
});

afterAll(async () => {
  await new Promise<void>((resolve) => echoServer.close(() => resolve()));
}, 10000);

describe("extraHttpHeaders integration", () => {
  it("should send MCP param headers to the target server", async () => {
    const pool = new BrowserPoolManager({ mcpMode: true });
    await pool.initialize();
    const rtr = new MCPBrowserRouter(pool);

    try {
      const { receivedHeaders } = await launchAndCapture(
        rtr,
        {
          extraHttpHeaders: {
            Authorization: "Bearer test-token-123",
            "X-Custom-Header": "custom-value",
          },
        },
        "team-param",
      );

      expect(receivedHeaders["authorization"]).toBe("Bearer test-token-123");
      expect(receivedHeaders["x-custom-header"]).toBe("custom-value");
    } finally {
      await pool.cleanup();
    }
  });

  it("should send BROOKLYN_HTTP_HEADERS env var headers when no param provided", async () => {
    process.env["BROOKLYN_HTTP_HEADERS"] = JSON.stringify({
      "X-Env-Token": "env-value-456",
    });

    const pool = new BrowserPoolManager({ mcpMode: true });
    await pool.initialize();
    const rtr = new MCPBrowserRouter(pool);

    try {
      const { receivedHeaders } = await launchAndCapture(rtr, {}, "team-env");

      expect(receivedHeaders["x-env-token"]).toBe("env-value-456");
    } finally {
      await pool.cleanup();
    }
  });

  it("should prefer MCP param headers over env var", async () => {
    process.env["BROOKLYN_HTTP_HEADERS"] = JSON.stringify({
      Authorization: "Bearer from-env",
    });

    const pool = new BrowserPoolManager({ mcpMode: true });
    await pool.initialize();
    const rtr = new MCPBrowserRouter(pool);

    try {
      const { receivedHeaders } = await launchAndCapture(
        rtr,
        { extraHttpHeaders: { Authorization: "Bearer from-param" } },
        "team-priority",
      );

      expect(receivedHeaders["authorization"]).toBe("Bearer from-param");
    } finally {
      await pool.cleanup();
    }
  });
});
