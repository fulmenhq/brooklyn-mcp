import { describe, expect, it } from "vitest";

import { looksLikeCliEntryFile, resolveCliSpawn } from "../../src/shared/cli-spawn.js";

describe("resolveCliSpawn", () => {
  it("does not prefix argv[1] for a compiled standalone binary", () => {
    const execPath = "/Users/me/.local/bin/brooklyn";
    const argv = [execPath, "web", "start", "--daemon"];
    expect(resolveCliSpawn(["web", "start", "--port", "3000"], argv, execPath)).toEqual({
      command: execPath,
      args: ["web", "start", "--port", "3000"],
    });
  });

  it("does not prefix when compiled bun sets argv[1] to the binary path", () => {
    const execPath = "/Users/me/.local/bin/brooklyn";
    const argv = [execPath, execPath, "web", "start"];
    expect(resolveCliSpawn(["web", "start", "--port", "3000"], argv, execPath)).toEqual({
      command: execPath,
      args: ["web", "start", "--port", "3000"],
    });
  });

  it("prefixes the TypeScript entry when running under bun", () => {
    const execPath = "/opt/homebrew/bin/bun";
    const entry = "/Users/me/dev/fulmenhq/brooklyn-mcp/src/cli/brooklyn.ts";
    const argv = [execPath, entry, "web", "start", "--daemon"];
    expect(resolveCliSpawn(["web", "start", "--port", "3000"], argv, execPath)).toEqual({
      command: execPath,
      args: [entry, "web", "start", "--port", "3000"],
    });
  });

  it("prefixes a node .js entry", () => {
    const execPath = "/usr/local/bin/node";
    const entry = "/opt/brooklyn/cli.js";
    expect(resolveCliSpawn(["mcp", "dev-http-daemon"], [execPath, entry], execPath)).toEqual({
      command: execPath,
      args: [entry, "mcp", "dev-http-daemon"],
    });
  });
});

describe("looksLikeCliEntryFile", () => {
  it("rejects the binary path itself", () => {
    expect(looksLikeCliEntryFile("/usr/bin/brooklyn", "/usr/bin/brooklyn")).toBe(false);
  });

  it("accepts a .ts CLI entry", () => {
    expect(looksLikeCliEntryFile("/repo/src/cli/brooklyn.ts", "/opt/homebrew/bin/bun")).toBe(true);
  });
});
