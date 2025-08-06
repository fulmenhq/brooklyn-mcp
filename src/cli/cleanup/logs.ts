/**
 * Log cleanup utilities
 *
 * Note: This is a CLI command module that outputs directly to the console.
 * Console usage is intentional for user feedback and is allowed by biome.json configuration.
 */

import { readdir, stat, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export async function cleanupLogs(days: number): Promise<void> {
  console.log(`🧹 Cleaning up logs older than ${days} days...`);

  const logDir = join(homedir(), ".brooklyn", "logs");

  try {
    const files = await readdir(logDir);
    const now = Date.now();
    const maxAge = days * 24 * 60 * 60 * 1000;

    let deletedCount = 0;
    let totalSize = 0;

    for (const file of files) {
      if (!file.endsWith(".log")) continue;

      const filePath = join(logDir, file);
      const stats = await stat(filePath);

      if (now - stats.mtime.getTime() > maxAge) {
        totalSize += stats.size;
        await unlink(filePath);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
      console.log(`✅ Deleted ${deletedCount} log files (${sizeMB} MB)`);
    } else {
      console.log("✅ No old logs to clean");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.log("✅ No log directory found");
    } else {
      console.error("⚠️  Error during log cleanup:", error);
    }
  }
}
