#!/usr/bin/env bun
/**
 * Safe Brooklyn test cleanup helper
 *
 * Replaces chained shell commands for MCP cleanup with explicit,
 * sequential invocations that respect Brooklyn safety protocols.
 */

import { spawnSync } from "node:child_process";

interface CleanupCommand {
  description: string;
  args: string[];
}

const COMMANDS: CleanupCommand[] = [
  {
    description: "Cleanup MCP resources",
    args: ["cleanup", "--mcp"],
  },
  {
    description: "Force cleanup of all MCP resources",
    args: ["cleanup", "--mcp-all", "--force"],
  },
];

function runCleanupCommand(command: CleanupCommand): void {
  console.log(`🔧 ${command.description}...`);

  const result = spawnSync("brooklyn", command.args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      BROOKLYN_HEADLESS: "true",
      PLAYWRIGHT_HEADLESS: "true",
    },
  });

  if (result.error) {
    console.warn(`⚠️  ${command.description} failed: ${result.error.message}`);
    return;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    console.warn(`⚠️  ${command.description} exited with code ${result.status}`);
    return;
  }

  console.log(`✅ ${command.description} completed`);
}

function main(): void {
  console.log("🌉 Brooklyn Test Cleanup");

  for (const command of COMMANDS) {
    try {
      runCleanupCommand(command);
    } catch (error) {
      console.warn(
        `⚠️  Unexpected error during '${command.description}': ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  console.log("✅ Test cleanup complete (non-fatal warnings may have occurred)");
}

if (import.meta.main) {
  main();
}
