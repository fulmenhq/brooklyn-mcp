/**
 * Version command tests for Brooklyn MCP CLI
 *
 * Tests the version command functionality including basic version output,
 * extended information with build signatures, and JSON output format.
 */

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const rootDir = path.resolve(import.meta.dirname, "../..");
const binaryPath = path.join(rootDir, `dist/brooklyn${process.platform === "win32" ? ".exe" : ""}`);

// Ensure binary exists before running tests
beforeAll(async () => {
  try {
    await fs.access(binaryPath);
  } catch {
    throw new Error(`Binary not found at ${binaryPath}. Run 'bun run build' first.`);
  }
});

describe("Version Command", () => {
  it("should output basic version with --version flag", () => {
    const result = execSync(`${binaryPath} --version`, { encoding: "utf-8" });
    expect(result.trim()).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  });

  it("should output basic version with version subcommand", () => {
    const result = execSync(`${binaryPath} version`, { encoding: "utf-8" });
    expect(result.trim()).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  });

  it("should output extended version information with --extended flag", () => {
    const result = execSync(`${binaryPath} version --extended`, { encoding: "utf-8" });
    const lines = result.trim().split("\n");

    // Check expected output structure
    expect(lines[0]).toMatch(/^Brooklyn MCP Server v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    expect(lines.some((line) => line.startsWith("Git commit:"))).toBe(true);
    expect(lines.some((line) => line.startsWith("Git branch:"))).toBe(true);
    expect(lines.some((line) => line.startsWith("Build time:"))).toBe(true);
    expect(lines.some((line) => line.startsWith("Platform:"))).toBe(true);
    expect(lines.some((line) => line.startsWith("Runtime:"))).toBe(true);
    expect(lines.some((line) => line.startsWith("Environment:"))).toBe(true);
  });

  it("should output valid JSON with --json flag", () => {
    const result = execSync(`${binaryPath} version --json`, { encoding: "utf-8" });

    // Should be valid JSON
    const parsed = JSON.parse(result);

    // Check structure
    expect(parsed).toHaveProperty("version");
    expect(parsed.version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    expect(parsed).toHaveProperty("buildSignature");

    if (parsed.buildSignature) {
      expect(parsed.buildSignature).toHaveProperty("gitCommit");
      expect(parsed.buildSignature).toHaveProperty("gitBranch");
      expect(parsed.buildSignature).toHaveProperty("gitStatus");
      expect(parsed.buildSignature).toHaveProperty("buildTime");
      expect(parsed.buildSignature).toHaveProperty("platform");
      expect(parsed.buildSignature).toHaveProperty("arch");
      expect(parsed.buildSignature).toHaveProperty("nodeVersion");
      expect(parsed.buildSignature).toHaveProperty("bunVersion");
      expect(parsed.buildSignature).toHaveProperty("buildEnv");
    }
  });

  it("should include git status information in build signature", () => {
    const result = execSync(`${binaryPath} version --json`, { encoding: "utf-8" });
    const parsed = JSON.parse(result);

    if (parsed.buildSignature) {
      expect(parsed.buildSignature.gitStatus).toHaveProperty("clean");
      expect(parsed.buildSignature.gitStatus).toHaveProperty("ahead");
      expect(parsed.buildSignature.gitStatus).toHaveProperty("behind");
      expect(parsed.buildSignature.gitStatus).toHaveProperty("staged");
      expect(parsed.buildSignature.gitStatus).toHaveProperty("unstaged");
      expect(parsed.buildSignature.gitStatus).toHaveProperty("untracked");

      // All should be numbers
      expect(typeof parsed.buildSignature.gitStatus.ahead).toBe("number");
      expect(typeof parsed.buildSignature.gitStatus.behind).toBe("number");
      expect(typeof parsed.buildSignature.gitStatus.staged).toBe("number");
      expect(typeof parsed.buildSignature.gitStatus.unstaged).toBe("number");
      expect(typeof parsed.buildSignature.gitStatus.untracked).toBe("number");

      // Clean should be boolean
      expect(typeof parsed.buildSignature.gitStatus.clean).toBe("boolean");
    }
  });

  it("should show git commit with dirty flag when working tree is not clean", () => {
    const result = execSync(`${binaryPath} version --extended`, { encoding: "utf-8" });
    const gitCommitLine = result.split("\n").find((line) => line.startsWith("Git commit:"));

    expect(gitCommitLine).toBeDefined();

    // Should contain either a clean commit hash or dirty flag
    if (gitCommitLine) {
      expect(gitCommitLine).toMatch(/Git commit: [a-f0-9]{8}(?:-dirty\([+~?\d,]*\))?/);
    }
  });

  it("should include binary hash in extended output when manifest exists", () => {
    const result = execSync(`${binaryPath} version --extended`, { encoding: "utf-8" });

    // Binary hash line should exist if manifest is available
    const binaryLine = result.split("\n").find((line) => line.startsWith("Binary:"));
    if (binaryLine) {
      expect(binaryLine).toMatch(/Binary: \d+\.\d+MB, SHA256: [a-f0-9]{16}\.\.\./);
    }
  });

  it("should handle --extended and --json flags correctly but not with global --version", () => {
    // Global --version should ignore additional flags
    const globalResult = execSync(`${binaryPath} --version --extended`, { encoding: "utf-8" });
    expect(globalResult.trim()).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);

    // Subcommand should handle flags
    const subcommandResult = execSync(`${binaryPath} version --extended`, { encoding: "utf-8" });
    expect(subcommandResult).toContain("Brooklyn MCP Server");
  });

  it("should have consistent version across all output formats", () => {
    const basicResult = execSync(`${binaryPath} version`, { encoding: "utf-8" });
    const globalResult = execSync(`${binaryPath} --version`, { encoding: "utf-8" });
    const extendedResult = execSync(`${binaryPath} version --extended`, { encoding: "utf-8" });
    const jsonResult = execSync(`${binaryPath} version --json`, { encoding: "utf-8" });

    const basicVersion = basicResult.trim();
    const globalVersion = globalResult.trim();
    const extendedVersion = extendedResult.match(
      /Brooklyn MCP Server v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/,
    )?.[1];
    const jsonVersion = JSON.parse(jsonResult).version;

    // All should be the same version
    expect(basicVersion).toBe(globalVersion);
    expect(basicVersion).toBe(extendedVersion);
    expect(basicVersion).toBe(jsonVersion);
  });
});
