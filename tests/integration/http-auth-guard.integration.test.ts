import { createServer } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { HTTPConfig } from "../../src/core/transport.js";
import { TransportType } from "../../src/core/transport.js";
import { MCPHTTPTransport } from "../../src/transports/http-transport.js";

async function getAvailablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", (error) => {
      server.close();
      reject(error);
    });
    server.listen(0, () => {
      const address = server.address();
      if (address && typeof address === "object") {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        server.close();
        reject(new Error("Failed to allocate test port"));
      }
    });
  });
}

describe("HTTP transport auth integration", () => {
  let transport: MCPHTTPTransport;
  let baseUrl: string;

  beforeAll(async () => {
    const port = await getAvailablePort();
    const config: HTTPConfig = {
      type: TransportType.HTTP,
      options: {
        port,
        host: "127.0.0.1",
        cors: true,
        rateLimiting: false,
        authMode: "required",
      },
    };

    transport = new MCPHTTPTransport(config);
    transport.setToolListHandler(async () => ({ tools: [] }));
    transport.setToolCallHandler(async () => ({
      content: [{ type: "text", text: "ok" }],
    }));

    await transport.initialize();
    await transport.start();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (transport) {
      await transport.stop();
    }
  });

  it("rejects MCP requests without bearer token", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("allows MCP requests with valid bearer token", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer brooklyn-mcp-access-token",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "test_tool",
          arguments: {},
        },
      }),
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.jsonrpc).toBe("2.0");
    expect(payload.id).toBe(2);
  });
});
