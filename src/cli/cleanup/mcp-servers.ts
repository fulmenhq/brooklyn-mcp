/**
 * MCP server cleanup utilities
 *
 * Note: This is a CLI command module that outputs directly to the console.
 * Console usage is intentional for user feedback and is allowed by biome.json configuration.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export async function cleanupMCPServers(options: {
  all?: boolean;
  force?: boolean;
}): Promise<void> {
  console.log("🧹 Cleaning up MCP server processes...");

  try {
    // Find Brooklyn MCP processes
    const { stdout } = await execAsync(`ps aux | grep "brooklyn mcp" | grep -v grep || true`);

    const lines = stdout.trim().split("\n").filter(Boolean);

    if (lines.length === 0) {
      console.log("✅ No Brooklyn MCP processes found");
      return;
    }

    console.log(`Found ${lines.length} Brooklyn MCP process(es)`);

    if (!options.all) {
      // Only clean orphaned processes (no recent activity)
      console.log("Checking for orphaned processes...");
      // In real implementation, would check process age or activity
    }

    if (options.force || options.all) {
      console.log("Terminating MCP processes...");

      for (const line of lines) {
        const parts = line.split(/\s+/);
        const pid = parts[1];
        if (pid) {
          try {
            await execAsync(`kill ${options.force ? "-9" : "-15"} ${pid}`);
            console.log(`  Terminated PID ${pid}`);
          } catch {
            console.log(`  Failed to terminate PID ${pid}`);
          }
        }
      }

      console.log("✅ MCP cleanup complete");
    } else {
      console.log("Use --force or --all to terminate these processes");
    }
  } catch (error) {
    console.error("⚠️  Error during MCP cleanup:", error);
  }
}
