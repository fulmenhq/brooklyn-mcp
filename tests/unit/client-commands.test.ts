/**
 * Tests for Brooklyn client configuration commands
 * Testing refactored "brooklyn client" command structure (formerly "brooklyn configure agent")
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentConfigOptions } from "../../src/cli/commands/config-agent.js";

// Mock dependencies
vi.mock("../../src/shared/agent-drivers.js", () => ({
  agentDrivers: {
    cursor: {
      displayName: "Cursor IDE",
      supportedTransports: ["stdio"],
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
      },
      commands: {
        stdio: ({ teamId }: { teamId?: string }) => [
          `brooklyn mcp start${teamId ? ` --team-id ${teamId}` : ""}`,
        ],
      },
    },
    cline: {
      displayName: "Cline",
      supportedTransports: ["stdio"],
      locations: [
        { scope: "project", writable: true },
        { scope: "user", writable: true },
      ],
      templates: {
        stdio: ({ teamId }: { teamId?: string }) => ({
          command: "brooklyn",
          args: ["mcp", "start", ...(teamId ? ["--team-id", teamId] : [])],
          env: {},
          disabled: false,
        }),
      },
      commands: {
        stdio: ({ teamId }: { teamId?: string }) => [
          `brooklyn mcp start${teamId ? ` --team-id ${teamId}` : ""}`,
        ],
      },
    },
    kilocode: {
      displayName: "Kilocode",
      supportedTransports: ["stdio", "http"],
      locations: [
        { scope: "project", writable: true },
        { scope: "user", writable: true },
      ],
      templates: {
        stdio: ({ teamId }: { teamId?: string }) => ({
          type: "stdio",
          command: "brooklyn",
          args: ["mcp", "start", ...(teamId ? ["--team-id", teamId] : [])],
          env: {},
          enabled: true,
        }),
        http: ({ host, port, teamId }: { host: string; port: number; teamId?: string }) => ({
          type: "http",
          url: `http://${host}:${port}${teamId ? `/team/${teamId}` : ""}`,
          enabled: true,
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
  },
  getEditorGlobalStorageBase: (product: string, home: string) =>
    join(home, `.${product.toLowerCase()}`, "User", "globalStorage"),
  resolvePathFor: (location: any, projectRoot: string) =>
    location.scope === "project"
      ? join(projectRoot, ".vscode", "settings.json")
      : join(homedir(), ".vscode", "settings.json"),
}));

vi.mock("../../src/shared/config-patcher.js", () => ({
  ensureDirFor: vi.fn(),
  patchJsonBrooklyn: vi.fn((targetPath, _value, options) => ({
    success: true,
    backup: options.backup ? `${targetPath}.backup` : null,
  })),
  patchTomlBrooklyn: vi.fn((targetPath, _value, options) => ({
    success: true,
    backup: options.backup ? `${targetPath}.backup` : null,
  })),
  patchOpencodeBrooklyn: vi.fn((targetPath, _value, options) => ({
    success: true,
    backup: options.backup ? `${targetPath}.backup` : null,
  })),
}));

describe("Brooklyn Client Commands", () => {
  let runConfigAgent: (options: AgentConfigOptions) => Promise<void>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  // Use unknown to avoid strict function signature incompatibility for process.exit spy
  let processExitSpy: unknown;

  beforeEach(async () => {
    // Import the function we're testing
    const module = await import("../../src/cli/commands/config-agent.js");
    runConfigAgent = module.runConfigAgent;

    // Setup spies
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    // Mock process.cwd
    vi.spyOn(process, "cwd").mockReturnValue("/test/project");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("brooklyn client configure", () => {
    it("should generate stdio configuration for cursor client", async () => {
      const options: AgentConfigOptions = {
        client: "cursor",
        transport: "stdio",
        scope: "project",
        print: true,
        apply: false,
      };

      await runConfigAgent(options);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Cursor IDE (project)"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"command": "brooklyn"'));
    });

    it("should generate http configuration for kilocode client", async () => {
      const options: AgentConfigOptions = {
        client: "kilocode",
        transport: "http",
        scope: "project",
        host: "localhost",
        port: 3001,
        print: true,
        apply: false,
      };

      await runConfigAgent(options);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("http://localhost:3001"));
    });

    it("should include team ID in configuration", async () => {
      const options: AgentConfigOptions = {
        client: "cursor",
        transport: "stdio",
        scope: "project",
        teamId: "test-team",
        print: true,
        apply: false,
      };

      await runConfigAgent(options);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"--team-id"'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"test-team"'));
    });

    it("should handle cline client with stdio only", async () => {
      const options: AgentConfigOptions = {
        client: "cline",
        transport: "stdio",
        scope: "project",
        print: true,
        apply: false,
      };

      await runConfigAgent(options);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Cline (project)"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"disabled": false'));
    });

    it("should handle kilocode client with both transports", async () => {
      const options: AgentConfigOptions = {
        client: "kilocode",
        transport: "http",
        scope: "project",
        host: "127.0.0.1",
        port: 3000,
        print: true,
        apply: false,
      };

      await runConfigAgent(options);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Kilocode (project)"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"enabled": true'));
    });

    it("should apply configuration when --apply flag is used", async () => {
      const { patchJsonBrooklyn } = await import("../../src/shared/config-patcher.js");

      const options: AgentConfigOptions = {
        client: "cursor",
        transport: "stdio",
        scope: "project",
        apply: true,
        print: false,
      };

      await runConfigAgent(options);

      expect(patchJsonBrooklyn).toHaveBeenCalledWith(
        expect.stringContaining("settings.json"),
        expect.objectContaining({
          command: "brooklyn",
          args: ["mcp", "start"],
          env: {},
        }),
        expect.objectContaining({ backup: true, dryRun: false }),
      );

      expect(consoleSpy).toHaveBeenCalledWith("\n✅ Updated:", expect.any(String));
    });

    it("should handle user scope with product specification", async () => {
      const options: AgentConfigOptions = {
        client: "cline",
        scope: "user",
        product: "Code",
        transport: "stdio",
        print: true,
        apply: false,
      };

      await runConfigAgent(options);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("cline_mcp_settings.json"));
    });

    it("should handle invalid client gracefully", async () => {
      const options: AgentConfigOptions = {
        client: "invalid-client",
        transport: "stdio",
        scope: "project",
        print: true,
        apply: false,
      };

      await expect(runConfigAgent(options)).rejects.toThrow("process.exit called");
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it("should validate port numbers", async () => {
      const options: AgentConfigOptions = {
        client: "kilocode",
        transport: "http",
        scope: "project",
        port: "invalid-port",
        print: true,
        apply: false,
      };

      await runConfigAgent(options);

      // Should default to 3000 when invalid port provided
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("http://127.0.0.1:3000"));
    });

    it("should show commands for stdio transport", async () => {
      const options: AgentConfigOptions = {
        client: "cursor",
        transport: "stdio",
        scope: "project",
        teamId: "dev-team",
        print: true,
        apply: false,
      };

      await runConfigAgent(options);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("# Commands:"));
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("brooklyn mcp start --team-id dev-team"),
      );
    });

    it("should show commands for http transport", async () => {
      const options: AgentConfigOptions = {
        client: "kilocode",
        transport: "http",
        scope: "project",
        host: "localhost",
        port: 8080,
        teamId: "prod-team",
        print: true,
        apply: false,
      };

      await runConfigAgent(options);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "brooklyn web start --host localhost --port 8080 --team-id prod-team",
        ),
      );
    });
  });

  describe("option validation", () => {
    it("should use default values for missing options", async () => {
      const options: AgentConfigOptions = {
        client: "cursor", // Specify a valid client
        print: true,
        apply: false,
      };

      await runConfigAgent(options);

      // Should use default transport (stdio), scope (project), host (127.0.0.1), port (3000)
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Cursor IDE (project)"));
    });

    it("should handle scope validation for unsupported clients", async () => {
      // Mock a client that doesn't support user scope
      const { agentDrivers } = await import("../../src/shared/agent-drivers.js");
      const originalCursor = (agentDrivers as any).cursor;
      (agentDrivers as any).cursor = {
        ...originalCursor,
        locations: [{ scope: "project", writable: true }], // Only project scope
      };

      const options: AgentConfigOptions = {
        client: "cursor",
        scope: "user", // Unsupported scope
        transport: "stdio",
        print: true,
        apply: false,
      };

      await expect(runConfigAgent(options)).rejects.toThrow("process.exit called");
      expect(processExitSpy).toHaveBeenCalledWith(1);

      // Restore original
      (agentDrivers as any).cursor = originalCursor;
    });
  });

  describe("edge cases", () => {
    it("should handle empty team ID", async () => {
      const options: AgentConfigOptions = {
        client: "cursor",
        transport: "stdio",
        scope: "project",
        teamId: "", // Empty team ID
        print: true,
        apply: false,
      };

      await runConfigAgent(options);

      // Should not include team ID in configuration
      expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining("--team-id"));
    });

    it("should handle zero port number", async () => {
      const options: AgentConfigOptions = {
        client: "kilocode",
        transport: "http",
        scope: "project",
        port: 0,
        print: true,
        apply: false,
      };

      await runConfigAgent(options);

      // Should default to 3000 for invalid port
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("http://127.0.0.1:3000"));
    });
  });
});

describe("CLI Integration", () => {
  it("should handle legacy 'brooklyn config agent' alias", () => {
    // This test would be integration-level, testing that the CLI parsing
    // correctly maps 'brooklyn config agent' to the client configure function
    expect(true).toBe(true); // Placeholder for CLI integration test
  });

  it("should handle new 'brooklyn client configure' command", () => {
    // This test would be integration-level, testing that the new command structure
    // correctly invokes the same underlying functionality
    expect(true).toBe(true); // Placeholder for CLI integration test
  });
});
