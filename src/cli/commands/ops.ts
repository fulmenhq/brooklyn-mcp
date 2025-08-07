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
      try {
        logger.info("🚀 Initializing Brooklyn database...");
        const dbManager = await getDatabaseManager();
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
        } else {
          logger.error("❌ Database initialization failed");
          process.exit(1);
        }
      } catch (error) {
        console.error("❌ Failed to initialize database:", error);
        process.exit(1);
      } finally {
        const dbManager = await getDatabaseManager();
        await dbManager.close();
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
      console.log("🌉 Brooklyn System Information");
      console.log("─".repeat(40));

      // Basic info
      console.log(`📦 Version: ${process.env["BROOKLYN_VERSION"] || "unknown"}`);
      console.log(`🖥️  Platform: ${process.platform}`);
      console.log(`📁 Home: ${homedir()}`);
      console.log(`🔧 Node: ${process.version}`);
      console.log(`🐰 Bun: ${process.versions.bun || "N/A"}`);

      // Brooklyn directories
      const brooklynHome = join(homedir(), ".brooklyn");
      console.log("\n📂 Brooklyn Directories:");
      console.log(`  Config: ${brooklynHome}`);
      console.log(`  Database: ${join(brooklynHome, "brooklyn.db")}`);
      console.log(`  Screenshots: ${join(brooklynHome, "screenshots")}`);
      console.log(`  Logs: ${join(brooklynHome, "logs")}`);

      // Check database
      try {
        const dbManager = await getDatabaseManager();
        const instanceId = dbManager.getInstanceId();
        const context = dbManager.getInstanceContext();

        console.log("\n🔑 Current Instance:");
        console.log(`  ID: ${instanceId}`);
        console.log(`  Type: ${context?.type}`);
        console.log(`  Scope: ${context?.scope}`);
        console.log(`  Path: ${context?.installPath}`);

        await dbManager.close();
      } catch {
        console.log("\n⚠️  Database not initialized");
      }
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
      const cacheStats = ScreenshotRepositoryOptimized.getCacheStats();

      console.log("📊 Cache Statistics\n");

      console.log("List Cache:");
      console.log(`  Hits: ${cacheStats.listCache.hits}`);
      console.log(`  Misses: ${cacheStats.listCache.misses}`);
      console.log(`  Hit Rate: ${(cacheStats.listCache.hitRate * 100).toFixed(2)}%`);
      console.log(`  Size: ${cacheStats.listCache.size}`);
      console.log(`  Evictions: ${cacheStats.listCache.evictions}`);

      console.log("\nSingle Cache:");
      console.log(`  Hits: ${cacheStats.singleCache.hits}`);
      console.log(`  Misses: ${cacheStats.singleCache.misses}`);
      console.log(`  Hit Rate: ${(cacheStats.singleCache.hitRate * 100).toFixed(2)}%`);
      console.log(`  Size: ${cacheStats.singleCache.size}`);
      console.log(`  Evictions: ${cacheStats.singleCache.evictions}`);

      console.log("\nStats Cache:");
      console.log(`  Hits: ${cacheStats.statsCache.hits}`);
      console.log(`  Misses: ${cacheStats.statsCache.misses}`);
      console.log(`  Hit Rate: ${(cacheStats.statsCache.hitRate * 100).toFixed(2)}%`);
      console.log(`  Size: ${cacheStats.statsCache.size}`);
      console.log(`  Evictions: ${cacheStats.statsCache.evictions}`);
    });

  benchmark
    .command("clear-cache")
    .description("Clear all query caches")
    .action(async () => {
      ScreenshotRepositoryOptimized.clearCaches();
      console.log("✅ All caches cleared");
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

        console.log("\n✅ Sync complete!");
        console.log(`  Files scanned: ${stats.filesScanned}`);
        console.log(`  Files added: ${stats.filesAdded}`);
        console.log(`  Files skipped: ${stats.filesSkipped}`);
        console.log(`  Orphans removed: ${stats.orphansRemoved}`);
        console.log(`  Errors: ${stats.errors}`);
        console.log(`  Duration: ${(stats.duration / 1000).toFixed(2)} seconds`);

        if (options.dryRun) {
          console.log("\n⚠️  This was a dry run - no changes were made");
        }
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
      // Get stats from database
      try {
        const dbManager = await getDatabaseManager();
        const instanceId = dbManager.getInstanceId();

        if (!instanceId) {
          console.log("⚠️  No instance ID available");
          return;
        }

        const result = await dbManager.execute("SELECT config FROM instances WHERE id = ?", [
          instanceId,
        ]);

        if (result.rows.length > 0) {
          const config = result.rows[0]?.["config"];
          if (config) {
            const parsed = JSON.parse(config as string);
            if (parsed.screenshot_stats) {
              console.log("📊 Screenshot Statistics:");
              console.log(`  Total Count: ${parsed.screenshot_stats.totalCount}`);
              console.log(
                `  Total Size: ${(parsed.screenshot_stats.totalSize / 1024 / 1024).toFixed(2)} MB`,
              );
              console.log(
                `  Average Size: ${(parsed.screenshot_stats.avgSize / 1024).toFixed(2)} KB`,
              );
              if (parsed.screenshot_stats.formats) {
                console.log("  Formats:");
                for (const [format, count] of Object.entries(parsed.screenshot_stats.formats)) {
                  console.log(`    ${format}: ${count}`);
                }
              }
            }
          }
        }

        await dbManager.close();
      } catch (error) {
        console.error("Failed to get statistics:", error);
      }
    });
}
