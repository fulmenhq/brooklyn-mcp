/**
 * Process Manager Tests
 * Testing Brooklyn process detection and management functionality
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type BrooklynProcess, BrooklynProcessManager } from "../../src/shared/process-manager.js";

// Mock Node.js modules
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

vi.mock("node:path", () => ({
  join: vi.fn(),
}));

// Mock process.kill for PID checking
const originalKill = process.kill;

describe("BrooklynProcessManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["BROOKLYN_DISABLE_SYSPRIMS"] = "1";
  });

  afterEach(() => {
    process.kill = originalKill;
    delete process.env["BROOKLYN_DISABLE_SYSPRIMS"];
  });

  describe("Process Detection", () => {
    it("should identify different Brooklyn process types", () => {
      const testCases = [
        {
          command: "bun src/cli/brooklyn.ts mcp start",
          expected: { type: "mcp-stdio", port: undefined },
        },
        {
          command: "dist/brooklyn mcp start --team-id alpha",
          expected: { type: "mcp-stdio", port: undefined, teamId: "alpha" },
        },
        {
          command: "brooklyn mcp dev-http --port 8080",
          expected: { type: "http-server", port: 8080 },
        },
        {
          command: "brooklyn web start --port 3000",
          expected: { type: "http-server", port: 3000 },
        },
        {
          command: "brooklyn dev-repl",
          expected: { type: "repl-session", port: undefined },
        },
        {
          command: "brooklyn dev-start",
          expected: { type: "dev-mode", port: undefined },
        },
      ];

      for (const { command, expected } of testCases) {
        const mockLine = `user      12345   0.0  0.1  123456  7890 pts/0    S+   10:00   0:00 ${command}`;

        // Use private method via bracket notation for testing
        const parsed = (BrooklynProcessManager as any).parseProcessLine(mockLine);

        expect(parsed).not.toBeNull();
        expect(parsed?.type).toBe(expected.type);
        expect(parsed?.port).toBe(expected.port);
        if (expected.teamId) {
          expect(parsed?.teamId).toBe(expected.teamId);
        }
      }
    });

    it("should reject false positive processes", () => {
      const falsePositives = [
        "user      12345   0.0  0.1  123456  7890 ?        S    10:00   0:00 biome lsp-proxy",
        "user      12346   0.0  0.1  123456  7890 pts/0    S+   10:00   0:00 brooklyn status",
        "user      12347   0.0  0.1  123456  7890 pts/0    S+   10:00   0:00 /usr/bin/biome",
      ];

      for (const line of falsePositives) {
        const parsed = (BrooklynProcessManager as any).parseProcessLine(line);
        expect(parsed).toBeNull();
      }
    });

    it("should handle malformed process lines gracefully", () => {
      const malformedLines = [
        "",
        "incomplete line",
        "user", // Not enough parts
        "user      abc   0.0  0.1  123456  7890 pts/0    S+   10:00   0:00 normal-command", // Non-numeric PID
      ];

      for (const line of malformedLines) {
        const parsed = (BrooklynProcessManager as any).parseProcessLine(line);
        expect(parsed).toBeNull();
      }
    });
  });

  describe("PID Management", () => {
    it("should check if process is running using kill signal", async () => {
      const testPid = 12345;

      // Mock successful process check
      process.kill = vi.fn(() => {}) as any;
      const isRunning = await BrooklynProcessManager.isProcessRunning(testPid);
      expect(isRunning).toBe(true);
      expect(process.kill).toHaveBeenCalledWith(testPid, 0);
    });

    it("should detect stopped processes", async () => {
      const testPid = 99999;

      // Mock process not found
      process.kill = vi.fn(() => {
        throw new Error("No such process");
      });

      const isRunning = await BrooklynProcessManager.isProcessRunning(testPid);
      expect(isRunning).toBe(false);
    });

    it("should stop process with SIGTERM by default", async () => {
      const testPid = 12345;

      // Mock successful kill and process stop
      process.kill = vi.fn(() => {}) as any;

      // Mock isProcessRunning to return false after kill
      vi.spyOn(BrooklynProcessManager, "isProcessRunning").mockResolvedValue(false);

      const stopped = await BrooklynProcessManager.stopProcess(testPid);

      expect(stopped).toBe(true);
      expect(process.kill).toHaveBeenCalledWith(testPid, "SIGTERM");
    });

    it("should handle ESRCH error as successful stop", async () => {
      const testPid = 12345;

      // Mock ESRCH error (process already dead)
      process.kill = vi.fn(() => {
        const error = new Error("No such process");
        error.message = "kill ESRCH";
        throw error;
      });

      const stopped = await BrooklynProcessManager.stopProcess(testPid);
      expect(stopped).toBe(true);
    });
  });

  describe("PID File Management", () => {
    it("should read PID files and validate processes", async () => {
      const mockPid = "12345";
      const mockPidFile = ".brooklyn-http-8080.pid";
      const mockPidPath = "/test/path/.brooklyn-http-8080.pid";

      // Mock file system operations
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(mockPid);
      vi.mocked(join).mockReturnValue(mockPidPath);

      // Mock process running and command check
      vi.spyOn(BrooklynProcessManager, "isProcessRunning").mockResolvedValue(true);
      vi.spyOn(BrooklynProcessManager, "getProcessCommand").mockResolvedValue(
        "brooklyn dev-http --port 8080",
      );

      const process = await (BrooklynProcessManager as any).processPidFile(
        mockPidFile,
        "/test/path",
      );

      expect(process).not.toBeNull();
      expect(process?.pid).toBe(12345);
      expect(process?.type).toBe("http-server");
      expect(process?.port).toBe(8080);
    });

    it("should read .brooklyn-web- PID files and validate processes", async () => {
      const mockPid = "12345";
      const mockPidFile = ".brooklyn-web-8080.pid";
      const mockPidPath = "/test/path/.brooklyn-web-8080.pid";

      // Mock file system operations
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(mockPid);
      vi.mocked(join).mockReturnValue(mockPidPath);

      // Mock process running and command check
      vi.spyOn(BrooklynProcessManager, "isProcessRunning").mockResolvedValue(true);
      vi.spyOn(BrooklynProcessManager, "getProcessCommand").mockResolvedValue(
        "brooklyn dev-http --port 8080",
      );

      const process = await (BrooklynProcessManager as any).processPidFile(
        mockPidFile,
        "/test/path",
      );

      expect(process).not.toBeNull();
      expect(process?.pid).toBe(12345);
      expect(process?.type).toBe("http-server");
      expect(process?.port).toBe(8080);
    });

    it("should cleanup stale PID files", async () => {
      const mockPidFile = ".brooklyn-http-8080.pid";
      const mockPidPath = "/test/path/.brooklyn-http-8080.pid";

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue("12345");
      vi.mocked(join).mockReturnValue(mockPidPath);

      // Mock process not running
      vi.spyOn(BrooklynProcessManager, "isProcessRunning").mockResolvedValue(false);

      const process = await (BrooklynProcessManager as any).processPidFile(
        mockPidFile,
        "/test/path",
      );

      expect(process).toBeNull();
    });

    it("should handle invalid PID file content", async () => {
      const mockPidFile = ".brooklyn-http-8080.pid";

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue("invalid-pid");

      const process = await (BrooklynProcessManager as any).processPidFile(
        mockPidFile,
        "/test/path",
      );

      expect(process).toBeNull();
    });
  });

  describe("Process Deduplication", () => {
    it("should remove duplicate processes by PID", () => {
      const processes: BrooklynProcess[] = [
        {
          pid: 12345,
          type: "mcp-stdio",
          command: "brooklyn mcp start",
          status: "running",
        },
        {
          pid: 12346,
          type: "http-server",
          port: 8080,
          command: "brooklyn dev-http",
          status: "running",
        },
        {
          pid: 12345, // Duplicate PID
          type: "mcp-stdio",
          command: "brooklyn mcp start",
          status: "running",
        },
      ];

      const deduplicated = (BrooklynProcessManager as any).deduplicateProcesses(processes);

      expect(deduplicated).toHaveLength(2);
      expect(deduplicated.map((p: BrooklynProcess) => p.pid)).toEqual([12345, 12346]);
    });
  });

  describe("Process Summary", () => {
    it("should generate process summary statistics", async () => {
      const mockProcesses: BrooklynProcess[] = [
        {
          pid: 12345,
          type: "mcp-stdio",
          command: "brooklyn mcp start",
          status: "running",
        },
        {
          pid: 12346,
          type: "http-server",
          port: 8080,
          teamId: "team-alpha",
          command: "brooklyn dev-http",
          status: "running",
        },
        {
          pid: 12347,
          type: "http-server",
          port: 3000,
          teamId: "team-beta",
          command: "brooklyn web start",
          status: "running",
        },
      ];

      vi.spyOn(BrooklynProcessManager, "findAllProcesses").mockResolvedValue(mockProcesses);

      const summary = await BrooklynProcessManager.getProcessSummary();

      expect(summary.total).toBe(3);
      expect(summary.byType["mcp-stdio"]).toBe(1);
      expect(summary.byType["http-server"]).toBe(2);
      expect(summary.httpServers).toHaveLength(2);
      expect(summary.httpServers[0]).toEqual({
        port: 8080,
        teamId: "team-alpha",
        pid: 12346,
      });
    });
  });

  describe("HTTP Server Management", () => {
    it("should stop HTTP server by port", async () => {
      const mockProcesses: BrooklynProcess[] = [
        {
          pid: 12346,
          type: "http-server",
          port: 8080,
          command: "brooklyn dev-http",
          status: "running",
        },
      ];

      vi.spyOn(BrooklynProcessManager, "findAllProcesses").mockResolvedValue(mockProcesses);
      vi.spyOn(BrooklynProcessManager, "stopProcess").mockResolvedValue(true);

      const stopped = await BrooklynProcessManager.stopHttpServerByPort(8080);

      expect(stopped).toBe(true);
      expect(BrooklynProcessManager.stopProcess).toHaveBeenCalledWith(12346);
    });

    it("should return false for non-existent HTTP server port", async () => {
      vi.spyOn(BrooklynProcessManager, "findAllProcesses").mockResolvedValue([]);

      const stopped = await BrooklynProcessManager.stopHttpServerByPort(9999);

      expect(stopped).toBe(false);
    });
  });

  describe("Command Execution", () => {
    it("should extract command information from PID", async () => {
      // Clear any existing spies on getProcessCommand
      vi.restoreAllMocks();

      const { exec } = await import("node:child_process");
      const mockExec = vi.mocked(exec);

      // Mock successful command execution
      mockExec.mockImplementation((_command: string, callback?: any) => {
        if (callback) {
          callback(null, { stdout: "brooklyn mcp start --team-id alpha", stderr: "" });
        }
        return {} as any;
      });

      const command = await BrooklynProcessManager.getProcessCommand(12345);

      expect(command).toBe("brooklyn mcp start --team-id alpha");
    });

    it("should handle command execution timeout", async () => {
      // Clear any existing spies on getProcessCommand
      vi.restoreAllMocks();

      const { exec } = await import("node:child_process");
      const mockExec = vi.mocked(exec);

      // Mock timeout by never calling callback
      mockExec.mockImplementation(() => {
        return {} as any;
      });

      const command = await BrooklynProcessManager.getProcessCommand(12345);

      expect(command).toBeNull();
    });
  });

  describe("Error Handling", () => {
    it("should handle file system errors gracefully", async () => {
      vi.mocked(existsSync).mockImplementation(() => {
        throw new Error("File system error");
      });

      const processes = await BrooklynProcessManager.findProcessesFromPidFiles();

      expect(processes).toEqual([]);
    });

    it("should handle process execution errors gracefully", async () => {
      const { exec } = await import("node:child_process");
      const mockExec = vi.mocked(exec);

      mockExec.mockImplementation((_command: string, callback?: any) => {
        if (callback) {
          callback(new Error("Command failed"), { stdout: "", stderr: "Error" });
        }
        return {} as any;
      });

      const processes = await BrooklynProcessManager.findAllProcesses();

      expect(processes).toEqual([]);
    });
  });

  describe("Team ID Extraction", () => {
    it("should extract team ID from command line", () => {
      const testCommand = "bun src/cli/brooklyn.ts mcp start --team-id production-team";
      const mockLine = `user      12345   0.0  0.1  123456  7890 pts/0    S+   10:00   0:00 ${testCommand}`;

      const parsed = (BrooklynProcessManager as any).parseProcessLine(mockLine);

      expect(parsed?.teamId).toBe("production-team");
    });

    it("should handle missing team ID gracefully", () => {
      const testCommand = "bun src/cli/brooklyn.ts mcp start";
      const mockLine = `user      12345   0.0  0.1  123456  7890 pts/0    S+   10:00   0:00 ${testCommand}`;

      const parsed = (BrooklynProcessManager as any).parseProcessLine(mockLine);

      expect(parsed?.teamId).toBeUndefined();
    });
  });
});
