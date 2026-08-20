/**
 * Compiled-binary stdio regression tests
 *
 * The other stdio tests spawn the SOURCE entrypoint (`bun src/cli/brooklyn.ts
 * mcp start`), where node_modules is fully resolvable. That path masked a
 * production bug: the Bun single-file executable (`brooklyn mcp start`) crashed
 * on the first tool call that logged, because MCP file logging used
 * `pino.transport()`, which runs its target in a `thread-stream` worker whose
 * dependencies (e.g. `real-require`) cannot be resolved inside the compiled
 * binary.
 *
 * These tests spawn the actual COMPILED binary and assert that:
 *   1. no worker/thread-stream resolution error is emitted, and
 *   2. stdout stays pure JSON-RPC, and
 *   3. the server answers a tool call without crashing.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

interface MCPMessage {
  jsonrpc?: string;
  id?: number | string;
  result?: unknown;
  error?: unknown;
  method?: string;
  params?: unknown;
}

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..");
const BINARY_PATH = resolve(PROJECT_ROOT, "dist", "brooklyn");

// Signatures of the original crash (pino thread-stream worker under Bun).
const WORKER_ERROR_PATTERN = /real-require|thread-stream|worker (?:thread )?(?:exited|has exited)/i;

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

/**
 * Spawn the compiled binary in stdio MCP mode, send the given JSON-RPC lines
 * once the server signals readiness, and collect stdout/stderr.
 */
function runCompiledStdio(lines: MCPMessage[]): Promise<RunResult> {
  return new Promise((resolvePromise, reject) => {
    let stdout = "";
    let stderr = "";
    let ready = false;

    const child = spawn(BINARY_PATH, ["mcp", "start"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        // Emits the `mcp-stdio-ready` signal on stderr; logs still go to file.
        BROOKLYN_TEST_MODE: "true",
        BROOKLYN_LOG_LEVEL: "info",
      },
    });

    const payload = `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`;

    const sendAndClose = () => {
      child.stdin?.write(payload);
      // Give the server a brief window to process and respond before EOF.
      setTimeout(() => child.stdin?.end(), 500);
    };

    child.stdout?.on("data", (d: Buffer) => {
      stdout += d.toString();
    });

    child.stderr?.on("data", (d: Buffer) => {
      const chunk = d.toString();
      stderr += chunk;
      if (!ready && chunk.includes('"msg":"mcp-stdio-ready"')) {
        ready = true;
        sendAndClose();
      }
    });

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("compiled stdio test timed out"));
    }, 25000);

    child.on("close", (code) => {
      clearTimeout(timeout);
      resolvePromise({ stdout, stderr, exitCode: code });
    });
    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

describe("Compiled binary stdio transport", () => {
  beforeAll(() => {
    // Build the standalone binary if it is not already present.
    if (!existsSync(BINARY_PATH)) {
      const result = spawnSync("bun", ["run", "build:local"], {
        cwd: PROJECT_ROOT,
        stdio: "ignore",
      });
      if (result.status !== 0) {
        throw new Error("failed to build compiled binary for stdio test");
      }
    }
  }, 180000);

  it("does not crash on a tool call and keeps stdout pure (no thread-stream worker)", async () => {
    const { stdout, stderr, exitCode } = await runCompiledStdio([
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "compiled-stdio-test", version: "1.0.0" },
        },
      },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "brooklyn_status", arguments: {} },
      },
    ]);

    // 1. The original crash signature must be absent.
    expect(stderr).not.toMatch(WORKER_ERROR_PATTERN);

    // 2. stdout must be pure JSON-RPC: every non-empty line parses as JSON.
    const stdoutLines = stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    expect(stdoutLines.length).toBeGreaterThan(0);
    const parsed: MCPMessage[] = [];
    for (const line of stdoutLines) {
      expect(() => parsed.push(JSON.parse(line) as MCPMessage)).not.toThrow();
    }

    // 3. The server answered the tool call without crashing.
    const toolResponse = parsed.find((m) => m.id === 2);
    expect(toolResponse, "expected a response for the brooklyn_status call").toBeDefined();
    expect(toolResponse?.error).toBeUndefined();

    // Clean shutdown once stdin closes.
    expect(exitCode).toBe(0);
  }, 60000);

  afterAll(() => {
    // No shared state to clean up; each run spawns an isolated child.
  });
});
