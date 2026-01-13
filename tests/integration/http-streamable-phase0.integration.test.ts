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
    server.listen(0, "127.0.0.1", () => {
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

function readJsonRpcCallToolTeamId(result: unknown): { teamId?: string; sessionId?: string } {
  const content = (result as any)?.content as unknown;
  if (!Array.isArray(content)) {
    return {};
  }
  const first = content[0] as any;
  const text = first?.type === "text" ? (first?.text as string | undefined) : undefined;
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as { teamId?: string; sessionId?: string };
  } catch {
    return {};
  }
}

function createSseCollector(response: Response): {
  waitFor: (predicate: (data: unknown) => boolean, timeoutMs: number) => Promise<unknown[]>;
} {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("SSE response has no body reader");
  }

  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  const seen: unknown[] = [];
  let done = false;

  const consumeBuffer = (raw: string): { payloads: string[]; rest: string } => {
    const payloads: string[] = [];
    let remaining = raw;

    while (true) {
      const splitIndex = remaining.indexOf("\n\n");
      if (splitIndex === -1) {
        break;
      }

      const rawEvent = remaining.slice(0, splitIndex);
      remaining = remaining.slice(splitIndex + 2);
      const lines = rawEvent.split("\n").map((line) => line.trim());

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const json = line.slice("data:".length).trim();
        if (json) {
          payloads.push(json);
        }
      }
    }

    return { payloads, rest: remaining };
  };

  void (async () => {
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) {
          done = true;
          return;
        }

        buffer += decoder.decode(result.value, { stream: true });
        const { payloads, rest } = consumeBuffer(buffer);
        buffer = rest;
        for (const json of payloads) {
          try {
            const parsed = JSON.parse(json) as unknown;
            seen.push(parsed);
          } catch {
            // ignore malformed event payloads
          }
        }
      }
    } catch {
      done = true;
    }
  })();

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const waitFor = async (
    predicate: (data: unknown) => boolean,
    timeoutMs: number,
  ): Promise<unknown[]> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (seen.some(predicate)) {
        return [...seen];
      }
      if (done) {
        break;
      }
      await sleep(25);
    }
    return [...seen];
  };

  return { waitFor };
}

describe("MCP HTTP Streamable Phase 0 (team routing + batch + SSE correlation)", () => {
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
        authMode: "disabled",
      },
    };

    transport = new MCPHTTPTransport(config);
    transport.setToolListHandler(async () => ({ tools: [] }));
    transport.setToolCallHandler(async (_request, metadata) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({ teamId: metadata?.teamId, sessionId: metadata?.sessionId }),
        },
      ],
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

  it("routes team via X-Team-Id, ?team=, and /team/<id> with header precedence", async () => {
    const makeCall = async (url: string, headers?: Record<string, string>) => {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(headers ?? {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "any_tool", arguments: {} },
        }),
      });
      expect(response.status).toBe(200);
      const payload = (await response.json()) as any;
      return readJsonRpcCallToolTeamId(payload.result);
    };

    await expect(makeCall(`${baseUrl}/mcp`, { "X-Team-Id": "header-team" })).resolves.toMatchObject(
      {
        teamId: "header-team",
      },
    );

    await expect(makeCall(`${baseUrl}/mcp?team=query-team`)).resolves.toMatchObject({
      teamId: "query-team",
    });

    await expect(makeCall(`${baseUrl}/team/path-team/mcp`)).resolves.toMatchObject({
      teamId: "path-team",
    });

    await expect(
      makeCall(`${baseUrl}/team/path-team/mcp?team=query-team`, { "X-Team-Id": "header-team" }),
    ).resolves.toMatchObject({
      teamId: "header-team",
    });
  });

  it("supports JSON-RPC batch requests (and ignores notifications)", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-06-18" },
        },
        {
          jsonrpc: "2.0",
          method: "notifications/initialized",
          params: {},
        },
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {},
        },
      ]),
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as unknown;
    expect(Array.isArray(payload)).toBe(true);
    expect((payload as any[]).map((e) => e.id)).toEqual([1, 2]);
  });

  it("correlates SSE notifications to Mcp-Session-Id (GET SSE + POST tools/call)", async () => {
    const abort1 = new AbortController();
    const abort2 = new AbortController();

    const sse1 = await fetch(`${baseUrl}/`, {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        "Mcp-Session-Id": "sess-1",
        "X-Team-Id": "team-sse-1",
      },
      signal: abort1.signal,
    });
    expect(sse1.status).toBe(200);
    expect(sse1.headers.get("content-type")).toContain("text/event-stream");
    expect(sse1.headers.get("mcp-session-id")).toBe("sess-1");
    const sse1Collector = createSseCollector(sse1);

    const sse2 = await fetch(`${baseUrl}/`, {
      method: "GET",
      headers: {
        Accept: "text/event-stream",
        "Mcp-Session-Id": "sess-2",
        "X-Team-Id": "team-sse-2",
      },
      signal: abort2.signal,
    });
    expect(sse2.status).toBe(200);
    expect(sse2.headers.get("content-type")).toContain("text/event-stream");
    expect(sse2.headers.get("mcp-session-id")).toBe("sess-2");
    const sse2Collector = createSseCollector(sse2);

    const sawReady1 = await sse1Collector.waitFor(
      (data) => (data as any)?.type === "connection" && (data as any)?.sessionId === "sess-1",
      1000,
    );
    expect(sawReady1.length).toBeGreaterThan(0);

    const sawReady2 = await sse2Collector.waitFor(
      (data) => (data as any)?.type === "connection" && (data as any)?.sessionId === "sess-2",
      1000,
    );
    expect(sawReady2.length).toBeGreaterThan(0);

    const callResponse = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Mcp-Session-Id": "sess-1",
        "X-Team-Id": "team-sse-1",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 10,
        method: "tools/call",
        params: {
          name: "any_tool",
          arguments: {},
          _meta: { progressToken: "p1" },
        },
      }),
    });
    expect(callResponse.status).toBe(200);

    const sse1Events = await sse1Collector.waitFor(
      (data) =>
        (data as any)?.method === "notifications/progress" &&
        (data as any)?.params?.progressToken === "p1",
      2000,
    );
    expect(
      sse1Events.some(
        (e) =>
          (e as any)?.method === "notifications/progress" &&
          (e as any)?.params?.progressToken === "p1",
      ),
    ).toBe(true);

    const sse2Events = await sse2Collector.waitFor(
      (data) =>
        (data as any)?.method === "notifications/progress" &&
        (data as any)?.params?.progressToken === "p1",
      500,
    );
    expect(
      sse2Events.some(
        (e) =>
          (e as any)?.method === "notifications/progress" &&
          (e as any)?.params?.progressToken === "p1",
      ),
    ).toBe(false);

    abort1.abort();
    abort2.abort();
  });

  it("supports POST returning SSE (one-shot) with progress notifications", async () => {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        "Mcp-Session-Id": "sess-post",
        "X-Team-Id": "team-post",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 20,
        method: "tools/call",
        params: {
          name: "any_tool",
          arguments: {},
          _meta: { progressToken: "p2" },
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("mcp-session-id")).toBe("sess-post");

    const collector = createSseCollector(response);
    const events = await collector.waitFor((data) => (data as any)?.id === 20, 1500);

    expect(
      events.some(
        (e) =>
          (e as any)?.method === "notifications/progress" &&
          (e as any)?.params?.progressToken === "p2",
      ),
    ).toBe(true);
    expect(events.some((e) => (e as any)?.id === 20 && (e as any)?.jsonrpc === "2.0")).toBe(true);
  });
});
