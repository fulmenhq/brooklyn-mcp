/**
 * Browser cleanup utilities
 *
 * Note: This is a CLI command module that outputs directly to the console.
 * Console usage is intentional for user feedback and is allowed by biome.json configuration.
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export async function cleanupBrowsers(force = false): Promise<void> {
  console.log("🧹 Cleaning up browser processes...");

  try {
    // Find Chromium/Chrome processes
    const chromiumProcesses = await findProcesses("chromium|chrome");

    // Find Firefox processes
    const firefoxProcesses = await findProcesses("firefox");

    // Find WebKit processes
    const webkitProcesses = await findProcesses("webkit|safari");

    const totalProcesses = chromiumProcesses + firefoxProcesses + webkitProcesses;

    if (totalProcesses === 0) {
      console.log("✅ No orphaned browser processes found");
      return;
    }

    console.log(`Found ${totalProcesses} browser processes:`);
    console.log(`  Chromium: ${chromiumProcesses}`);
    console.log(`  Firefox: ${firefoxProcesses}`);
    console.log(`  WebKit: ${webkitProcesses}`);

    if (force) {
      console.log("Force killing browser processes...");
      await killProcesses("chromium|chrome");
      await killProcesses("firefox");
      await killProcesses("webkit|safari");
      console.log("✅ Browser processes terminated");
    } else {
      console.log("Use --force to terminate these processes");
    }
  } catch (error) {
    console.error("⚠️  Error during browser cleanup:", error);
  }
}

async function findProcesses(pattern: string): Promise<number> {
  try {
    const { stdout } = await execAsync(`ps aux | grep -E "${pattern}" | grep -v grep | wc -l`);
    return Number.parseInt(stdout.trim(), 10);
  } catch {
    return 0;
  }
}

async function killProcesses(pattern: string): Promise<void> {
  try {
    await execAsync(
      `ps aux | grep -E "${pattern}" | grep -v grep | awk '{print $2}' | xargs -r kill -9 2>/dev/null || true`,
    );
  } catch {
    // Ignore errors - processes might have already terminated
  }
}
