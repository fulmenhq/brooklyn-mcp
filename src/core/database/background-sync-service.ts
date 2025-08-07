/**
 * Background Sync Service for screenshot database
 * Phase 3: Performance & Caching - Background synchronization
 */

import { createHash } from "node:crypto";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";

import { getLogger } from "../../shared/pino-logger.js";
import { getDatabaseManager } from "./database-manager.js";
import { ScreenshotRepository } from "./repositories/screenshot-repository.js";
import type { ScreenshotRecord } from "./types.js";

// Lazy logger initialization
let logger: ReturnType<typeof getLogger> | null = null;
function ensureLogger() {
  if (!logger) {
    logger = getLogger("background-sync-service");
  }
  return logger;
}

interface SyncOptions {
  batchSize?: number;
  intervalMs?: number;
  maxAge?: number; // Days to keep screenshots
  dryRun?: boolean;
}

interface SyncStats {
  filesScanned: number;
  filesAdded: number;
  filesSkipped: number;
  orphansRemoved: number;
  errors: number;
  duration: number;
}

/**
 * Background service for syncing screenshots between filesystem and database
 */
export class BackgroundSyncService {
  private isRunning = false;
  private syncInterval: NodeJS.Timeout | null = null;
  private lastSyncTime: Date | null = null;
  private stats: SyncStats = {
    filesScanned: 0,
    filesAdded: 0,
    filesSkipped: 0,
    orphansRemoved: 0,
    errors: 0,
    duration: 0,
  };

  private readonly batchSize: number;
  private readonly intervalMs: number;
  private readonly maxAge: number;
  private readonly dryRun: boolean;

  constructor(private options: SyncOptions = {}) {
    this.batchSize = options.batchSize || 50;
    this.intervalMs = options.intervalMs || 300000; // 5 minutes default
    this.maxAge = options.maxAge || 30; // 30 days default
    this.dryRun = options.dryRun ?? false;
  }

  /**
   * Start background sync service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      ensureLogger().warn("Background sync service already running");
      return;
    }

    this.isRunning = true;
    ensureLogger().info("Starting background sync service", {
      batchSize: this.batchSize,
      intervalMs: this.intervalMs,
      maxAge: this.maxAge,
      dryRun: this.dryRun,
    });

    // Run initial sync
    await this.sync();

    // Schedule periodic sync
    this.syncInterval = setInterval(async () => {
      await this.sync();
    }, this.intervalMs);
  }

  /**
   * Stop background sync service
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    this.isRunning = false;
    ensureLogger().info("Background sync service stopped");
  }

  /**
   * Run a single sync cycle
   */
  async sync(): Promise<SyncStats> {
    const startTime = Date.now();
    ensureLogger().info("Starting sync cycle");

    // Reset stats
    this.stats = {
      filesScanned: 0,
      filesAdded: 0,
      filesSkipped: 0,
      orphansRemoved: 0,
      errors: 0,
      duration: 0,
    };

    try {
      // Step 1: Sync filesystem to database
      await this.syncFilesystemToDatabase();

      // Step 2: Clean orphaned database records
      await this.cleanOrphanedRecords();

      // Step 3: Clean old screenshots
      await this.cleanOldScreenshots();

      // Step 4: Update statistics
      await this.updateStatistics();

      this.stats.duration = Date.now() - startTime;
      this.lastSyncTime = new Date();

      ensureLogger().info("Sync cycle completed", this.stats);
      return this.stats;
    } catch (error) {
      this.stats.errors++;
      this.stats.duration = Date.now() - startTime;
      ensureLogger().error("Sync cycle failed", { error, stats: this.stats });
      throw error;
    }
  }

  /**
   * Sync filesystem screenshots to database
   */
  private async syncFilesystemToDatabase(): Promise<void> {
    const screenshotDir = join(homedir(), ".brooklyn", "screenshots");

    try {
      const sessions = await readdir(screenshotDir).catch(() => []);

      for (const sessionDir of sessions) {
        const sessionPath = join(screenshotDir, sessionDir);
        const sessionStat = await stat(sessionPath).catch(() => null);

        if (!sessionStat?.isDirectory()) continue;

        const files = await readdir(sessionPath).catch(() => []);

        // Process files in batches
        for (let i = 0; i < files.length; i += this.batchSize) {
          const batch = files.slice(i, i + this.batchSize);
          await this.processBatch(sessionPath, sessionDir, batch);
        }
      }
    } catch (error) {
      ensureLogger().error("Failed to scan screenshot directory", { error });
      this.stats.errors++;
    }
  }

  /**
   * Process a batch of screenshot files
   */
  private async processBatch(
    sessionPath: string,
    sessionId: string,
    files: string[],
  ): Promise<void> {
    const db = await getDatabaseManager();
    const instanceId = db.getInstanceId();

    if (!instanceId) {
      ensureLogger().warn("No instance ID available, skipping sync");
      return;
    }

    for (const file of files) {
      if (!(file.endsWith(".png") || file.endsWith(".jpeg") || file.endsWith(".jpg"))) {
        continue;
      }

      this.stats.filesScanned++;

      const filePath = join(sessionPath, file);

      try {
        // Check if file already exists in database
        const existing = await this.checkFileExists(filePath);
        if (existing) {
          this.stats.filesSkipped++;
          continue;
        }

        // Get file stats
        const fileStat = await stat(filePath);

        // Generate hash for deduplication
        const hash = await this.generateFileHash(filePath);

        // Extract metadata from filename (if follows pattern)
        const metadata = this.extractMetadataFromFilename(file);

        if (!this.dryRun) {
          // Add to database
          await ScreenshotRepository.save({
            instanceId,
            filePath,
            filename: file,
            sessionId,
            browserId: metadata.browserId || "unknown",
            teamId: metadata.teamId,
            userId: metadata.userId,
            tag: metadata.tag,
            format: file.endsWith(".png") ? "png" : "jpeg",
            fileSize: fileStat.size,
            width: metadata.width,
            height: metadata.height,
            fullPage: Boolean(metadata.fullPage),
            quality: metadata.quality,
            hash,
            metadata: metadata.extra,
          });
        }

        this.stats.filesAdded++;
        ensureLogger().debug("Added file to database", { file, sessionId });
      } catch (error) {
        this.stats.errors++;
        ensureLogger().error("Failed to process file", { file, error });
      }
    }
  }

  /**
   * Check if file already exists in database
   */
  private async checkFileExists(filePath: string): Promise<boolean> {
    const db = await getDatabaseManager();
    const result = await db.execute(
      "SELECT COUNT(*) as count FROM screenshots WHERE file_path = ?",
      [filePath],
    );
    return (result.rows[0]?.["count"] as number) > 0;
  }

  /**
   * Generate hash for file (for deduplication)
   */
  private async generateFileHash(filePath: string): Promise<string> {
    // For performance, we'll use file size and modification time instead of full content hash
    const fileStat = await stat(filePath);
    const hashInput = `${filePath}:${fileStat.size}:${fileStat.mtimeMs}`;
    return createHash("sha256").update(hashInput).digest("hex").substring(0, 16);
  }

  /**
   * Extract metadata from filename
   */
  private extractMetadataFromFilename(filename: string): {
    browserId?: string;
    teamId?: string;
    userId?: string;
    tag?: string;
    width?: number;
    height?: number;
    fullPage?: boolean;
    quality?: number;
    extra?: Record<string, unknown>;
  } {
    const metadata: Record<string, unknown> = {};

    // Example patterns:
    // screenshot-1234567890.png
    // screenshot-fullpage-1234567890.png
    // screenshot-team-abc-1234567890.png
    // screenshot-1920x1080-1234567890.png

    const parts = basename(filename, ".png").replace(basename(filename, ".jpeg"), "").split("-");

    for (const part of parts) {
      if (part === "fullpage") {
        metadata["fullPage"] = true;
      } else if (part.includes("x") && /^\d+x\d+$/.test(part)) {
        const [width, height] = part.split("x").map(Number);
        metadata["width"] = width;
        metadata["height"] = height;
      } else if (part.startsWith("team")) {
        metadata["teamId"] = part.substring(4);
      } else if (part.startsWith("user")) {
        metadata["userId"] = part.substring(4);
      } else if (part.startsWith("tag")) {
        metadata["tag"] = part.substring(3);
      }
    }

    return metadata;
  }

  /**
   * Clean orphaned database records (files no longer on disk)
   */
  private async cleanOrphanedRecords(): Promise<void> {
    const db = await getDatabaseManager();
    const instanceId = db.getInstanceId();

    if (!instanceId) {
      return;
    }

    const result = await db.execute("SELECT id, file_path FROM screenshots WHERE instance_id = ?", [
      instanceId,
    ]);

    const batch: string[] = [];

    for (const row of result.rows) {
      const filePath = row["file_path"] as string;

      try {
        await stat(filePath);
      } catch {
        // File doesn't exist
        batch.push(row["id"] as string);

        if (batch.length >= this.batchSize) {
          await this.deleteOrphans(batch);
          batch.length = 0;
        }
      }
    }

    // Process remaining batch
    if (batch.length > 0) {
      await this.deleteOrphans(batch);
    }
  }

  /**
   * Delete orphaned records in batch
   */
  private async deleteOrphans(ids: string[]): Promise<void> {
    if (this.dryRun) {
      this.stats.orphansRemoved += ids.length;
      ensureLogger().info("Would delete orphaned records (dry run)", { count: ids.length });
      return;
    }

    const db = await getDatabaseManager();
    const placeholders = ids.map(() => "?").join(",");

    await db.execute(`DELETE FROM screenshots WHERE id IN (${placeholders})`, ids);

    this.stats.orphansRemoved += ids.length;
    ensureLogger().info("Deleted orphaned records", { count: ids.length });
  }

  /**
   * Clean old screenshots based on maxAge
   */
  private async cleanOldScreenshots(): Promise<void> {
    if (!this.maxAge || this.dryRun) {
      return;
    }

    const count = await ScreenshotRepository.deleteOlderThan(this.maxAge);
    ensureLogger().info("Cleaned old screenshots", { count, maxAgeDays: this.maxAge });
  }

  /**
   * Update database statistics
   */
  private async updateStatistics(): Promise<void> {
    const db = await getDatabaseManager();
    const instanceId = db.getInstanceId();

    if (!instanceId) {
      return;
    }

    // Update instance statistics
    const stats = await ScreenshotRepository.getStats(instanceId);

    await db.execute(
      `UPDATE instances 
       SET config = json_set(
         COALESCE(config, '{}'),
         '$.screenshot_stats',
         json(?)
       )
       WHERE id = ?`,
      [JSON.stringify(stats), instanceId],
    );

    ensureLogger().debug("Updated statistics", stats);
  }

  /**
   * Get sync service status
   */
  getStatus(): {
    isRunning: boolean;
    lastSyncTime: Date | null;
    stats: SyncStats;
    options: SyncOptions;
  } {
    return {
      isRunning: this.isRunning,
      lastSyncTime: this.lastSyncTime,
      stats: this.stats,
      options: {
        batchSize: this.batchSize,
        intervalMs: this.intervalMs,
        maxAge: this.maxAge,
        dryRun: this.dryRun,
      },
    };
  }

  /**
   * Run sync once without starting the service
   */
  static async runOnce(options?: SyncOptions): Promise<SyncStats> {
    const service = new BackgroundSyncService(options);
    return service.sync();
  }
}
