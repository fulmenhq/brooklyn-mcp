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
    let epochFormatCount = 0;

    for (const file of files) {
      if (!file.endsWith(".log")) continue;

      const filePath = join(logDir, file);
      const stats = await stat(filePath);

      // Identify old epoch-format log files: brooklyn-mcp-{pid}-{timestamp}.log
      const isEpochFormat = /^brooklyn-mcp-\d+-\d+\.log$/.test(file);
      if (isEpochFormat) {
        epochFormatCount++;
      }

      if (now - stats.mtime.getTime() > maxAge) {
        totalSize += stats.size;
        await unlink(filePath);
        deletedCount++;

        if (isEpochFormat) {
          console.log(`  📅 Removed old epoch-format log: ${file}`);
        }
      }
    }

    if (deletedCount > 0) {
      const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
      console.log(`✅ Deleted ${deletedCount} log files (${sizeMB} MB)`);
    } else {
      console.log("✅ No old logs to clean");
    }

    if (epochFormatCount > 0) {
      console.log(`📋 Found ${epochFormatCount} files using old epoch naming format`);
      console.log("   New format: brooklyn-mcp-<transport>-<yyyymmdd>-<hhmmss>-<ms>.log");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.log("✅ No log directory found");
    } else {
      console.error("⚠️  Error during log cleanup:", error);
    }
  }
}

export async function listLogs(): Promise<void> {
  console.log("📋 Brooklyn Log Files");

  const logDir = join(homedir(), ".brooklyn", "logs");

  try {
    const files = await readdir(logDir);
    const logFiles = files.filter((f) => f.endsWith(".log"));

    if (logFiles.length === 0) {
      console.log("✅ No log files found");
      return;
    }

    console.log(`\n📁 Directory: ${logDir}\n`);

    // Separate by format
    const newFormat: string[] = [];
    const oldFormat: string[] = [];

    for (const file of logFiles) {
      if (/^brooklyn-mcp-\d+-\d+\.log$/.test(file)) {
        oldFormat.push(file);
      } else {
        newFormat.push(file);
      }
    }

    if (newFormat.length > 0) {
      console.log("🆕 New Format (transport-yyyymmdd-hhmmss):");
      newFormat.sort().forEach((file) => {
        const transport = file.split("-")[2] || "unknown";
        console.log(`  📄 ${file} [${transport}]`);
      });
      console.log("");
    }

    if (oldFormat.length > 0) {
      console.log("📅 Old Format (pid-timestamp):");
      oldFormat.sort().forEach((file) => {
        console.log(`  📄 ${file}`);
      });
      console.log("");
      console.log("💡 Old format files will be cleaned up automatically");
    }

    console.log(
      `📊 Total: ${logFiles.length} files (${newFormat.length} new format, ${oldFormat.length} old format)`,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.log("✅ No log directory found");
    } else {
      console.error("⚠️  Error listing logs:", error);
    }
  }
}
