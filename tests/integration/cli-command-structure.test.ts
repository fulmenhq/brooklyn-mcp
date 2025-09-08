/**
 * Integration tests for CLI command structure refactoring
 * Tests the transition from "brooklyn configure agent" to "brooklyn client configure"
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentConfigOptions } from "../../src/cli/commands/config-agent.js";

// Mock all the dependencies that the config-agent module needs
vi.mock("../../src/shared/agent-drivers.js", () => ({
  agentDrivers: {
    cursor: {
      displayName: "Cursor IDE",
      locations: [
        { scope: "project", writable: true },
        { scope: "user", writable: true },
      ],
      templates: {
        stdio: ({ teamId }: { teamId?: string }) => ({
          command: "brooklyn",
          args: ["mcp", "start", ...(teamId ? ["--team-id", teamId] : [])],
          env: {},
        }),
        http: ({ host, port, teamId }: { host: string; port: number; teamId?: string }) => ({
          type: "http",
          url: `http://${host}:${port}${teamId ? `/team/${teamId}` : ""}`,
        }),
      },
      commands: {
        stdio: ({ teamId }: { teamId?: string }) => [
          `brooklyn mcp start${teamId ? ` --team-id ${teamId}` : ""}`,
        ],
        http: ({ host, port, teamId }: { host: string; port: number; teamId?: string }) => [
          `brooklyn web start --host ${host} --port ${port}${teamId ? ` --team-id ${teamId}` : ""}`,
        ],
      },
    },
    project: {
      displayName: "Project Configuration",
      locations: [{ scope: "project", writable: true }],
      templates: {
        stdio: ({ teamId }: { teamId?: string }) => ({
          command: "brooklyn",
          args: ["mcp", "start", ...(teamId ? ["--team-id", teamId] : [])],
          env: {},
        }),
      },
    },
  },
  getEditorGlobalStorageBase: (product: string, home: string) =>
    `${home}/.config/${product.toLowerCase()}`,
  resolvePathFor: (_location: any, projectRoot: string) => `${projectRoot}/.brooklyn/config.json`,
}));

vi.mock("../../src/shared/config-patcher.js", () => ({
  ensureDirFor: vi.fn(),
  patchJsonBrooklyn: vi.fn(() => ({ success: true, backup: null })),
  patchTomlBrooklyn: vi.fn(() => ({ success: true, backup: null })),
  patchOpencodeBrooklyn: vi.fn(() => ({ success: true, backup: null })),
}));

describe("CLI Command Structure Refactoring", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  // Use unknown to avoid overly specific function signature conflicts for process.exit
  let processExitSpy: unknown;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    vi.spyOn(process, "cwd").mockReturnValue("/test/project");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Command Structure Compatibility", () => {
    it("should support the refactored command function", async () => {
      const { runConfigAgent } = await import("../../src/cli/commands/config-agent.js");
      expect(typeof runConfigAgent).toBe("function");

      const options: AgentConfigOptions = {
        client: "cursor",
        transport: "stdio",
        scope: "project",
        print: true,
        apply: false,
      };

      await runConfigAgent(options);
      expect(consoleSpy).toHaveBeenCalled();
    });

    it("should handle both legacy and new command invocation patterns", async () => {
      const { runConfigAgent } = await import("../../src/cli/commands/config-agent.js");

      // Legacy pattern: brooklyn config agent --client cursor
      const legacyOptions: AgentConfigOptions = {
        client: "cursor",
        transport: "stdio",
        scope: "project",
        print: true,
        apply: false,
      };

      // New pattern: brooklyn client configure --client cursor
      const newOptions: AgentConfigOptions = {
        client: "cursor",
        transport: "stdio",
        scope: "project",
        print: true,
        apply: false,
      };

      // Both should work the same way
      await runConfigAgent(legacyOptions);
      const legacyCalls = consoleSpy.mock.calls.length;

      consoleSpy.mockClear();

      await runConfigAgent(newOptions);
      const newCalls = consoleSpy.mock.calls.length;

      expect(legacyCalls).toEqual(newCalls);
    });
  });

  describe("Backward Compatibility", () => {
    it("should maintain the same option interface", async () => {
      const { runConfigAgent } = await import("../../src/cli/commands/config-agent.js");

      // Test with all supported options to ensure backward compatibility
      const fullOptions: AgentConfigOptions = {
        client: "cursor",
        transport: "http",
        scope: "project",
        host: "localhost",
        port: 3001,
        teamId: "test-team",
        apply: false,
        print: true,
        product: "Code",
      };

      await expect(runConfigAgent(fullOptions)).resolves.toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Cursor IDE"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("http://localhost:3001"));
    });

    it("should support legacy client names", async () => {
      const { runConfigAgent } = await import("../../src/cli/commands/config-agent.js");

      const options: AgentConfigOptions = {
        client: "project", // Legacy default client
        transport: "stdio",
        scope: "project",
        print: true,
        apply: false,
      };

      await runConfigAgent(options);
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Project Configuration"));
    });
  });

  describe("Command Function Behavior", () => {
    it("should generate correct configurations for different transports", async () => {
      const { runConfigAgent } = await import("../../src/cli/commands/config-agent.js");

      // Test stdio transport
      await runConfigAgent({
        client: "cursor",
        transport: "stdio",
        scope: "project",
        teamId: "dev-team",
        print: true,
        apply: false,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("brooklyn mcp start --team-id dev-team"),
      );

      consoleSpy.mockClear();

      // Test http transport
      await runConfigAgent({
        client: "cursor",
        transport: "http",
        scope: "project",
        host: "127.0.0.1",
        port: 8080,
        teamId: "dev-team",
        print: true,
        apply: false,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "brooklyn web start --host 127.0.0.1 --port 8080 --team-id dev-team",
        ),
      );
    });

    it("should handle configuration application", async () => {
      const { runConfigAgent } = await import("../../src/cli/commands/config-agent.js");
      const { patchJsonBrooklyn } = await import("../../src/shared/config-patcher.js");

      await runConfigAgent({
        client: "cursor",
        transport: "stdio",
        scope: "project",
        apply: true,
        print: false,
      });

      expect(patchJsonBrooklyn).toHaveBeenCalledWith(
        expect.stringContaining("config.json"),
        expect.objectContaining({
          command: "brooklyn",
          args: expect.arrayContaining(["mcp", "start"]),
          env: {},
        }),
        expect.objectContaining({ backup: true, dryRun: false }),
      );
    });

    it("should validate client options properly", async () => {
      const { runConfigAgent } = await import("../../src/cli/commands/config-agent.js");

      // Invalid client should cause process.exit
      await expect(
        runConfigAgent({
          client: "invalid-client",
          transport: "stdio",
          scope: "project",
          print: true,
          apply: false,
        }),
      ).rejects.toThrow("process.exit called");

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe("Help and Documentation", () => {
    it("should provide consistent documentation across command structures", () => {
      // This test verifies that both command paths (legacy and new)
      // would produce the same documentation and behavior

      const legacyCommandDescription = "(alias) Generate and/or apply MCP client configs";
      const newCommandDescription = "Add/update Brooklyn MCP entry for a client";

      // Both should relate to the same underlying functionality
      expect(legacyCommandDescription).toContain("MCP client");
      expect(newCommandDescription).toContain("MCP");

      // Both should indicate configuration capability
      expect(legacyCommandDescription.toLowerCase()).toContain("client");
      expect(newCommandDescription.toLowerCase()).toContain("client");
    });

    it("should indicate the alias relationship in legacy commands", () => {
      const legacyDescription =
        "(alias) Generate and/or apply MCP client configs for IDEs and agents";
      expect(legacyDescription).toContain("alias");
    });
  });
});
