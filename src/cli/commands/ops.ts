/**
 * Operations (ops) command for Brooklyn MCP
 * Manages database, cleanup, and other operational tasks
 *
 * Note: This is a CLI command module that outputs directly to the console.
 * Console usage is intentional for user feedback and is allowed by biome.json configuration.
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Command } from "commander";

import { BackgroundSyncService } from "../../core/database/background-sync-service.js";
import { getDatabaseManager } from "../../core/database/database-manager.js";
import { PerformanceBenchmark } from "../../core/database/performance-benchmark.js";
import { ScreenshotRepositoryOptimized } from "../../core/database/repositories/screenshot-repository-optimized.js";
import { ScreenshotRepository } from "../../core/database/repositories/screenshot-repository.js";

// For ops commands, use console.log directly to avoid logger initialization issues
// The CLI ops commands are meant to be simple and direct
const logger = {
  info: (message: string, data?: unknown) => {
    if (data) {
      console.log(message, data);
    } else {
      console.log(message);
    }
  },
  error: (message: string, data?: unknown) => {
    if (data) {
      console.error(message, data);
    } else {
      console.error(message);
    }
  },
};

/**
 * Output rows as CSV format
 */
function outputCsv(rows: Array<Record<string, unknown>>): void {
  if (rows.length === 0) return;

  const firstRow = rows[0];
  if (!firstRow) return;

  const headers = Object.keys(firstRow);
  console.log(headers.join(","));

  for (const row of rows) {
    const values = headers.map((h) => {
      const value = row[h];
      // Quote strings with commas or newlines
      if (typeof value === "string") {
        const hasComma = value.includes(",");
        const hasNewline = value.includes("\n");
        if (hasComma || hasNewline) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }
      return value ?? "";
    });
    console.log(values.join(","));
  }
}

/**
 * Register the ops command and its subcommands
 */
export function registerOpsCommand(program: Command): void {
  const ops = program
    .command("ops")
    .description("Operational commands for database, cleanup, and maintenance");

  // Database subcommands
  const db = ops.command("db").description("Database management commands");

  db.command("init")
    .description("Initialize the database")
    .action(async () => {
      let dbManager: Awaited<ReturnType<typeof getDatabaseManager>> | undefined;
      try {
        logger.info("🚀 Initializing Brooklyn database...");
        dbManager = await getDatabaseManager();
        const healthy = await dbManager.isHealthy();
        if (healthy) {
          logger.info("✅ Database initialized successfully");
          const instanceId = dbManager.getInstanceId();
          const context = dbManager.getInstanceContext();
          logger.info("📊 Instance details", {
            instanceId,
            type: context?.type,
            scope: context?.scope,
          });

          // Close database before exit
          await dbManager.close();

          // Explicitly exit to return control to console
          process.exit(0);
        } else {
          logger.error("❌ Database initialization failed");
          if (dbManager) await dbManager.close();
          process.exit(1);
        }
      } catch (error) {
        console.error("❌ Failed to initialize database:", error);
        if (dbManager) {
          try {
            await dbManager.close();
          } catch {
            // Ignore cleanup errors
          }
        }
        process.exit(1);
      }
    });

  db.command("status")
    .description("Check database status and health")
    .action(async () => {
      try {
        const dbPath = join(homedir(), ".brooklyn", "brooklyn.db");
        const exists = existsSync(dbPath);

        logger.info("📊 Brooklyn Database Status");
        logger.info("Database path", { path: dbPath, exists });

        if (exists) {
          const dbManager = await getDatabaseManager();
          const healthy = await dbManager.isHealthy();
          logger.info("Database health", { healthy });

          if (healthy) {
            // Get instance info
            const result = await dbManager.execute(
              "SELECT COUNT(*) as count, COUNT(DISTINCT type) as types FROM instances WHERE active = 1",
            );
            const activeInstances = result.rows[0]?.["count"] || 0;
            const instanceTypes = result.rows[0]?.["types"] || 0;

            // Get screenshot stats
            const stats = await ScreenshotRepository.getStats();

            logger.info("🖥️  System statistics", {
              activeInstances,
              instanceTypes,
              screenshots: stats.totalCount,
              totalSizeMB: (stats.totalSize / 1024 / 1024).toFixed(2),
            });
          }

          await dbManager.close();
        }

        // Explicitly exit to return control to console
        process.exit(0);
      } catch (error) {
        logger.error("❌ Failed to check database status", { error });
        process.exit(1);
      }
    });

  db.command("migrate")
    .description("Run database migrations")
    .action(async () => {
      try {
        logger.info("🔄 Running database migrations...");
        const dbManager = await getDatabaseManager();

        // Migrations run automatically on init, but we can check status
        const result = await dbManager.execute(
          "SELECT version, name, applied_at FROM migrations ORDER BY version DESC LIMIT 5",
        );

        logger.info("✅ Migrations complete");
        const migrations = result.rows.map((row) => ({
          version: row["version"],
          name: row["name"],
          appliedAt: row["applied_at"],
        }));
        logger.info("Applied migrations", { migrations });

        await dbManager.close();

        // Explicitly exit to return control to console
        process.exit(0);
      } catch (error) {
        logger.error("❌ Migration failed", { error });
        process.exit(1);
      }
    });

  db.command("clean")
    .description("Clean stale instances and old data")
    .option("-d, --days <days>", "Delete screenshots older than N days", "30")
    .action(async (options) => {
      try {
        logger.info("🧹 Cleaning database...");
        const dbManager = await getDatabaseManager();

        // Clean stale instances
        const staleResult = await dbManager.execute(`
          UPDATE instances 
          SET active = 0 
          WHERE last_heartbeat < datetime('now', '-5 minutes') 
          AND active = 1
          RETURNING id, display_name
        `);

        if (staleResult.rows.length > 0) {
          logger.info("✅ Deactivated stale instances", { count: staleResult.rows.length });
        }

        // Clean old screenshots
        const days = Number.parseInt(options.days, 10);
        const deletedCount = await ScreenshotRepository.deleteOlderThan(days);
        if (deletedCount > 0) {
          logger.info("✅ Deleted old screenshots", { count: deletedCount, days });
        }

        // Vacuum database
        await dbManager.execute("VACUUM");
        logger.info("✅ Database optimized");

        await dbManager.close();

        // Explicitly exit to return control to console
        process.exit(0);
      } catch (error) {
        logger.error("❌ Cleanup failed", { error });
        process.exit(1);
      }
    });

  db.command("reset")
    .description("Reset database (WARNING: deletes all data)")
    .option("-f, --force", "Skip confirmation")
    .action(async (options) => {
      if (!options.force) {
        console.log("⚠️  WARNING: This will delete all database data!");
        console.log("Use --force to confirm");
        process.exit(1);
      }

      try {
        console.log("Resetting database...");
        const dbManager = await getDatabaseManager();

        // Drop all tables
        await dbManager.execute("DROP TABLE IF EXISTS screenshots");
        await dbManager.execute("DROP TABLE IF EXISTS audit_logs");
        await dbManager.execute("DROP TABLE IF EXISTS instances");
        await dbManager.execute("DROP TABLE IF EXISTS migrations");

        console.log("✅ Database reset complete");
        console.log("Run 'brooklyn ops db init' to reinitialize");

        await dbManager.close();
      } catch (error) {
        console.error("❌ Reset failed:", error);
        process.exit(1);
      }
    });

  db.command("query")
    .description("Execute a read-only SQL query (for debugging)")
    .argument("<sql>", "SQL query to execute")
    .option("-j, --json", "Output as JSON")
    .option("-t, --table", "Output as formatted table (default)")
    .option("-c, --csv", "Output as CSV")
    .action(async (sql, options) => {
      let dbManager: Awaited<ReturnType<typeof getDatabaseManager>> | undefined;
      try {
        // Safety check - only allow SELECT queries by default
        const normalizedSql = sql.trim().toUpperCase();
        if (!(normalizedSql.startsWith("SELECT") || normalizedSql.startsWith("PRAGMA"))) {
          logger.error("❌ Only SELECT and PRAGMA queries are allowed for safety");
          logger.info("💡 Use 'brooklyn ops db exec' for write operations (if needed)");
          process.exit(1);
        }

        dbManager = await getDatabaseManager();
        const result = await dbManager.execute(sql);

        // Format output based on options
        if (options.json) {
          console.log(JSON.stringify(result.rows, null, 2));
        } else if (options.csv) {
          outputCsv(result.rows);
        } else {
          // Table format (default)
          if (result.rows.length === 0) {
            console.log("📊 Query returned no results");
          } else {
            console.log(`📊 Query returned ${result.rows.length} row(s):\n`);
            console.table(result.rows);
          }
        }

        await dbManager.close();
        process.exit(0);
      } catch (error) {
        logger.error("❌ Query failed", { error });
        if (dbManager) {
          try {
            await dbManager.close();
          } catch {
            // Ignore cleanup errors
          }
        }
        process.exit(1);
      }
    });

  db.command("inventory")
    .description("Show screenshot inventory")
    .option("-s, --session <sessionId>", "Filter by session ID")
    .option("-t, --tag <tag>", "Filter by tag prefix")
    .option("-l, --limit <limit>", "Limit results (default: 10)", "10")
    .action(async (options) => {
      let dbManager: Awaited<ReturnType<typeof getDatabaseManager>> | undefined;
      try {
        logger.info("📸 Screenshot Inventory");

        dbManager = await getDatabaseManager();
        const instanceId = dbManager.getInstanceId();

        // Build query
        const conditions: string[] = [];
        const params: Array<string | number> = [];

        if (instanceId) {
          conditions.push("instance_id = ?");
          params.push(instanceId);
        }

        if (options.session) {
          conditions.push("session_id = ?");
          params.push(options.session);
        }

        if (options.tag) {
          conditions.push("tag LIKE ?");
          params.push(`${options.tag}%`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const limit = Number.parseInt(options.limit, 10);

        const sql = `
          SELECT 
            id,
            filename,
            session_id,
            browser_id,
            tag,
            format,
            file_size,
            width,
            height,
            created_at
          FROM screenshots
          ${whereClause}
          ORDER BY created_at DESC
          LIMIT ?
        `;

        params.push(limit);

        const result = await dbManager.execute(sql, params);

        if (result.rows.length === 0) {
          logger.info("No screenshots found matching criteria");
        } else {
          logger.info(`Found ${result.rows.length} screenshot(s):\n`);

          // Format for display
          const formatted = result.rows.map((row) => ({
            id: `${(row["id"] as string).substring(0, 8)}...`,
            filename: row["filename"],
            session: row["session_id"],
            tag: row["tag"] || "-",
            size: `${((row["file_size"] as number) / 1024).toFixed(1)}KB`,
            dimensions: `${row["width"]}x${row["height"]}`,
            created: new Date(row["created_at"] as string).toLocaleString(),
          }));

          console.table(formatted);
        }

        await dbManager.close();
        process.exit(0);
      } catch (error) {
        logger.error("❌ Failed to get inventory", { error });
        if (dbManager) {
          try {
            await dbManager.close();
          } catch {
            // Ignore cleanup errors
          }
        }
        process.exit(1);
      }
    });

  // Cleanup subcommands (move existing cleanup here)
  const cleanup = ops.command("cleanup").description("Clean up Brooklyn resources");

  cleanup
    .command("browsers")
    .description("Clean up orphaned browser processes")
    .option("--force", "Force kill all browser processes")
    .action(async (options) => {
      // Import existing cleanup logic
      const { cleanupBrowsers } = await import("../cleanup/browsers.js");
      await cleanupBrowsers(options.force);
    });

  cleanup
    .command("mcp")
    .description("Clean up MCP server processes")
    .option("--all", "Clean all Brooklyn MCP processes")
    .option("--force", "Force termination")
    .action(async (options) => {
      // Import existing cleanup logic
      const { cleanupMCPServers } = await import("../cleanup/mcp-servers.js");
      await cleanupMCPServers({ all: options.all, force: options.force });
    });

  cleanup
    .command("logs")
    .description("Clean up old log files")
    .option("-d, --days <days>", "Delete logs older than N days", "7")
    .action(async (options) => {
      const { cleanupLogs } = await import("../cleanup/logs.js");
      await cleanupLogs(Number.parseInt(options.days, 10));
    });

  cleanup
    .command("all")
    .description("Clean up all Brooklyn resources")
    .option("--force", "Force cleanup")
    .action(async (options) => {
      console.log("Cleaning up all Brooklyn resources...");

      // Clean browsers
      const { cleanupBrowsers } = await import("../cleanup/browsers.js");
      await cleanupBrowsers(options.force);

      // Clean MCP servers
      const { cleanupMCPServers } = await import("../cleanup/mcp-servers.js");
      await cleanupMCPServers({ all: true, force: options.force });

      // Clean logs
      const { cleanupLogs } = await import("../cleanup/logs.js");
      await cleanupLogs(7);

      // Clean database
      try {
        const dbManager = await getDatabaseManager();
        await dbManager.execute(`
          UPDATE instances SET active = 0 
          WHERE last_heartbeat < datetime('now', '-5 minutes')
        `);
        await dbManager.close();
      } catch {
        // Database might not be initialized
      }

      console.log("✅ Cleanup complete");
    });

  // System info command
  ops
    .command("info")
    .description("Show system and configuration information")
    .action(async () => {
      console.log("Brooklyn System Information");
      console.log("=".repeat(40));

      // Basic info
      console.log(`Version: ${process.env["BROOKLYN_VERSION"] || "unknown"}`);
      console.log(`Platform: ${process.platform}`);
      console.log(`Home: ${homedir()}`);
      console.log(`Node: ${process.version}`);
      console.log(`Bun: ${process.versions.bun || "N/A"}`);

      // Brooklyn directories
      const brooklynHome = join(homedir(), ".brooklyn");
      console.log("\nBrooklyn Directories:");
      console.log(`  Config: ${brooklynHome}`);
      console.log(`  Database: ${join(brooklynHome, "brooklyn.db")}`);
      console.log(`  Screenshots: ${join(brooklynHome, "screenshots")}`);
      console.log(`  Logs: ${join(brooklynHome, "logs")}`);

      // Check database
      try {
        const dbManager = await getDatabaseManager();
        const instanceId = dbManager.getInstanceId();
        const context = dbManager.getInstanceContext();

        console.log("\nCurrent Instance:");
        console.log(`  ID: ${instanceId}`);
        console.log(`  Type: ${context?.type}`);
        console.log(`  Scope: ${context?.scope}`);
        console.log(`  Path: ${context?.installPath}`);

        await dbManager.close();
        console.log("Database connection closed successfully");
      } catch (error) {
        console.log("\nDatabase not initialized");
        console.log("Error details:", error);
      }

      // Explicitly exit to return control to console
      process.exit(0);
    });

  // Performance benchmarking commands
  const benchmark = ops.command("benchmark").description("Performance benchmarking tools");

  benchmark
    .command("quick")
    .description("Run quick performance benchmark (1k records)")
    .action(async () => {
      console.log("🚀 Running quick performance benchmark...");
      console.log("This will take approximately 1-2 minutes\n");

      try {
        const results = await PerformanceBenchmark.runQuick();
        console.log("\n✅ Benchmark complete!");
        console.log(`Duration: ${(results.totalDuration / 1000).toFixed(2)} seconds`);
        console.log(`Peak Memory: ${results.peakMemoryMB.toFixed(2)} MB`);

        // Check cache stats
        const cacheStats = ScreenshotRepositoryOptimized.getCacheStats();
        console.log("\n📊 Cache Performance:");
        console.log(`  List Cache Hit Rate: ${(cacheStats.listCache.hitRate * 100).toFixed(2)}%`);
        console.log(
          `  Single Cache Hit Rate: ${(cacheStats.singleCache.hitRate * 100).toFixed(2)}%`,
        );
        console.log(`  Stats Cache Hit Rate: ${(cacheStats.statsCache.hitRate * 100).toFixed(2)}%`);
      } catch (error) {
        console.error("❌ Benchmark failed:", error);
        process.exit(1);
      }
    });

  benchmark
    .command("full")
    .description("Run full performance benchmark (10k records)")
    .option("--no-cleanup", "Don't clean up test data after benchmark")
    .action(async (options) => {
      console.log("🚀 Running full performance benchmark...");
      console.log("This will take approximately 5-10 minutes\n");

      try {
        const results = await PerformanceBenchmark.runFull();
        console.log("\n✅ Benchmark complete!");
        console.log(`Duration: ${(results.totalDuration / 1000).toFixed(2)} seconds`);
        console.log(`Peak Memory: ${results.peakMemoryMB.toFixed(2)} MB`);

        // Show detailed results
        console.log("\n📈 Key Performance Metrics:");
        const metricsToShow = ["list-simple", "list-filtered", "getById", "getById-cached"];
        for (const metric of metricsToShow) {
          const result = results.results.find((r) => r.operation === metric);
          if (result) {
            console.log(`  ${metric}:`);
            console.log(`    Average: ${result.averageMs.toFixed(2)}ms`);
            console.log(`    P95: ${result.p95Ms.toFixed(2)}ms`);
            console.log(`    Throughput: ${result.throughput.toFixed(2)} ops/sec`);
          }
        }

        if (options.cleanup !== false) {
          console.log("\n🧹 Cleaning up test data...");
          // Clean up test data
          const dbManager = await getDatabaseManager();
          await dbManager.execute("DELETE FROM screenshots WHERE session_id LIKE 'session-%'");
          await dbManager.close();
        }
      } catch (error) {
        console.error("❌ Benchmark failed:", error);
        process.exit(1);
      }
    });

  benchmark
    .command("cache")
    .description("Show cache statistics")
    .action(async () => {
      try {
        // Use lazy logger initialization for emoji display
        const { getLogger } = await import("../../shared/pino-logger.js");
        let cacheLogger: ReturnType<typeof getLogger> | null = null;

        function ensureCacheLogger() {
          if (!cacheLogger) {
            cacheLogger = getLogger("brooklyn-benchmark-cache");
          }
          return cacheLogger;
        }

        const cacheStats = ScreenshotRepositoryOptimized.getCacheStats();

        ensureCacheLogger().info("📊 Cache Statistics\n");

        ensureCacheLogger().info("List Cache:");
        ensureCacheLogger().info(`  Hits: ${cacheStats.listCache.hits}`);
        ensureCacheLogger().info(`  Misses: ${cacheStats.listCache.misses}`);
        ensureCacheLogger().info(`  Hit Rate: ${(cacheStats.listCache.hitRate * 100).toFixed(2)}%`);
        ensureCacheLogger().info(`  Size: ${cacheStats.listCache.size}`);
        ensureCacheLogger().info(`  Evictions: ${cacheStats.listCache.evictions}`);

        ensureCacheLogger().info("\nSingle Cache:");
        ensureCacheLogger().info(`  Hits: ${cacheStats.singleCache.hits}`);
        ensureCacheLogger().info(`  Misses: ${cacheStats.singleCache.misses}`);
        ensureCacheLogger().info(
          `  Hit Rate: ${(cacheStats.singleCache.hitRate * 100).toFixed(2)}%`,
        );
        ensureCacheLogger().info(`  Size: ${cacheStats.singleCache.size}`);
        ensureCacheLogger().info(`  Evictions: ${cacheStats.singleCache.evictions}`);

        ensureCacheLogger().info("\nStats Cache:");
        ensureCacheLogger().info(`  Hits: ${cacheStats.statsCache.hits}`);
        ensureCacheLogger().info(`  Misses: ${cacheStats.statsCache.misses}`);
        ensureCacheLogger().info(
          `  Hit Rate: ${(cacheStats.statsCache.hitRate * 100).toFixed(2)}%`,
        );
        ensureCacheLogger().info(`  Size: ${cacheStats.statsCache.size}`);
        ensureCacheLogger().info(`  Evictions: ${cacheStats.statsCache.evictions}`);

        // Explicitly exit to return control to console
        process.exit(0);
      } catch (error) {
        console.error("❌ Failed to show cache statistics:", error);
        process.exit(1);
      }
    });

  benchmark
    .command("clear-cache")
    .description("Clear all query caches")
    .action(async () => {
      try {
        ScreenshotRepositoryOptimized.clearCaches();

        // Use lazy logger initialization for emoji display
        const { getLogger } = await import("../../shared/pino-logger.js");
        let clearLogger: ReturnType<typeof getLogger> | null = null;

        function ensureClearLogger() {
          if (!clearLogger) {
            clearLogger = getLogger("brooklyn-clear-cache");
          }
          return clearLogger;
        }

        ensureClearLogger().info("✅ All caches cleared");

        // Explicitly exit to return control to console
        process.exit(0);
      } catch (error) {
        console.error("❌ Failed to clear caches:", error);
        process.exit(1);
      }
    });

  // Background sync commands
  const sync = ops.command("sync").description("Background synchronization service");

  sync
    .command("run")
    .description("Run a one-time sync of filesystem to database")
    .option("--dry-run", "Show what would be synced without making changes")
    .option("--batch-size <size>", "Number of files to process in each batch", "50")
    .action(async (options) => {
      console.log("🔄 Running filesystem to database sync...");

      try {
        const stats = await BackgroundSyncService.runOnce({
          dryRun: options.dryRun,
          batchSize: Number.parseInt(options.batchSize, 10),
        });

        console.log("\n[OK] Sync complete!");
        console.log(`  Files scanned: ${stats.filesScanned}`);
        console.log(`  Files added: ${stats.filesAdded}`);
        console.log(`  Files skipped: ${stats.filesSkipped}`);
        console.log(`  Orphans removed: ${stats.orphansRemoved}`);
        console.log(`  Errors: ${stats.errors}`);
        console.log(`  Duration: ${(stats.duration / 1000).toFixed(2)} seconds`);

        if (options.dryRun) {
          console.log("\n[WARN] This was a dry run - no changes were made");
        }

        // Explicitly exit to return control to console
        process.exit(0);
      } catch (error) {
        console.error("❌ Sync failed:", error);
        process.exit(1);
      }
    });

  sync
    .command("start")
    .description("Start background sync service")
    .option("--interval <ms>", "Sync interval in milliseconds", "300000")
    .option("--max-age <days>", "Delete screenshots older than N days", "30")
    .action(async (options) => {
      console.log("🚀 Starting background sync service...");

      const service = new BackgroundSyncService({
        intervalMs: Number.parseInt(options.interval, 10),
        maxAge: Number.parseInt(options.maxAge, 10),
      });

      await service.start();
      console.log(`✅ Sync service started (interval: ${options.interval}ms)`);
      console.log("Press Ctrl+C to stop");

      // Keep process alive
      process.on("SIGINT", () => {
        console.log("\n⏹️  Stopping sync service...");
        service.stop();
        process.exit(0);
      });
    });

  sync
    .command("stats")
    .description("Show sync statistics from last run")
    .action(async () => {
      try {
        await showSyncStatistics();

        // Explicitly exit to return control to console
        process.exit(0);
      } catch (error) {
        console.error("❌ Failed to show sync statistics:", error);
        process.exit(1);
      }
    });
}

interface ScreenshotStats {
  totalCount: number;
  totalSize: number;
  avgSize: number;
  formats?: Record<string, number>;
}

/**
 * Helper function to fetch screenshot statistics from database
 */
async function fetchScreenshotStats(): Promise<{
  instanceId: string;
  stats: ScreenshotStats | null;
} | null> {
  const dbManager = await getDatabaseManager();
  const instanceId = dbManager.getInstanceId();

  if (!instanceId) {
    return null;
  }

  try {
    const result = await dbManager.execute("SELECT config FROM instances WHERE id = ?", [
      instanceId,
    ]);

    if (result.rows.length === 0) {
      return { instanceId, stats: null };
    }

    const config = result.rows[0]?.["config"];
    if (!config) {
      return { instanceId, stats: null };
    }

    const parsed = JSON.parse(config as string);
    return { instanceId, stats: parsed.screenshot_stats || null };
  } finally {
    await dbManager.close();
  }
}

/**
 * Helper function to format and display screenshot statistics
 */
function displayScreenshotStats(stats: ScreenshotStats): void {
  console.log("📊 Screenshot Statistics:");
  console.log(`  Total Count: ${stats.totalCount}`);
  console.log(`  Total Size: ${formatBytes(stats.totalSize, "MB")}`);
  console.log(`  Average Size: ${formatBytes(stats.avgSize, "KB")}`);

  if (stats.formats) {
    displayFormatStats(stats.formats);
  }
}

/**
 * Helper function to display format statistics
 */
function displayFormatStats(formats: Record<string, number>): void {
  console.log("  Formats:");
  for (const [format, count] of Object.entries(formats)) {
    console.log(`    ${format}: ${count}`);
  }
}

/**
 * Helper function to format bytes to specified unit
 */
function formatBytes(bytes: number, unit: "KB" | "MB"): string {
  if (unit === "MB") {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }
  return `${(bytes / 1024).toFixed(2)} KB`;
}

/**
 * Main function to show sync statistics
 */
async function showSyncStatistics(): Promise<void> {
  try {
    const result = await fetchScreenshotStats();

    if (!result) {
      console.log("⚠️  No instance ID available");
      return;
    }

    if (!result.stats) {
      console.log("ℹ️  No screenshot statistics available yet");
      console.log("Run 'brooklyn ops sync run' to generate statistics");
      return;
    }

    displayScreenshotStats(result.stats);
  } catch (error) {
    console.error("Failed to get statistics:", error);
  }
}
