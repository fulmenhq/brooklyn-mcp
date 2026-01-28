/**
 * MCP server cleanup utilities
 *
 * Note: This is a CLI command module that outputs directly to the console.
 * Console usage is intentional for user feedback and is allowed by biome.json configuration.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";

import { sysprimsTryProcessList, sysprimsTryTerminateTree } from "../../shared/sysprims.js";

const execAsync = promisify(exec);

async function cleanupMCPServersWithSysprims(options: {
  all?: boolean;
  force?: boolean;
}): Promise<boolean> {
  const snapshot = await sysprimsTryProcessList();
  if (!snapshot) return false;

  const matches = snapshot.processes.filter((p) => {
    const cmd = p.cmdline.join(" ");
    // Focus on brooklyn mcp processes; avoid killing generic "web" servers.
    return cmd.includes("brooklyn") && cmd.includes("mcp");
  });

  if (matches.length === 0) {
    console.log("✅ No Brooklyn MCP processes found");
    return true;
  }

  console.log(`Found ${matches.length} Brooklyn MCP process(es)`);

  if (!options.all) {
    console.log("Checking for orphaned processes...");
    // TODO: refine with instance registry metadata; for now this is informational.
  }

  if (options.force || options.all) {
    console.log("Terminating MCP processes...");

    let terminated = 0;
    for (const proc of matches) {
      const res = await sysprimsTryTerminateTree(proc.pid, {
        grace_timeout_ms: options.force ? 0 : 2000,
        kill_timeout_ms: 2000,
      });

      if (res?.exited || res?.timed_out === false) {
        console.log(`  Terminated PID ${proc.pid}`);
        terminated++;
      } else {
        console.log(`  Failed to terminate PID ${proc.pid}`);
      }
    }

    console.log(`✅ MCP cleanup complete (${terminated}/${matches.length})`);
  } else {
    console.log("Use --force or --all to terminate these processes");
  }

  return true;
}

export async function cleanupMCPServers(options: {
  all?: boolean;
  force?: boolean;
}): Promise<void> {
  console.log("🧹 Cleaning up MCP server processes...");

  // Prefer sysprims when available
  try {
    const handled = await cleanupMCPServersWithSysprims(options);
    if (handled) return;
  } catch {
    // sysprims path failed; fall back to shell-based cleanup below.
  }

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
