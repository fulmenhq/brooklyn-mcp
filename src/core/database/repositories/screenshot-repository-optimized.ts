/**
 * Optimized Screenshot Repository with caching and prepared statements
 * Phase 3: Performance & Caching implementation
 */

import { randomUUID } from "node:crypto";

import type { InValue } from "@libsql/client";

import { getLogger } from "../../../shared/pino-logger.js";
import { getDatabaseManager } from "../database-manager.js";
import { createCacheKey, QueryCache } from "../query-cache.js";
import type { ScreenshotListResult, ScreenshotQuery, ScreenshotRecord } from "../types.js";

// Lazy logger initialization with safe fallback
let logger: ReturnType<typeof getLogger> | null = null;
function ensureLogger() {
  if (!logger) {
    try {
      logger = getLogger("screenshot-repository-optimized");
    } catch {
      // Logger not ready yet - use console as fallback
      // This ensures database operations don't fail due to logger issues
      return {
        debug: (..._args: unknown[]) => {},
        info: (..._args: unknown[]) => {},
        warn: (..._args: unknown[]) => {},
        error: (..._args: unknown[]) => {},
      } as ReturnType<typeof getLogger>;
    }
  }
  return logger;
}

/**
 * Performance metrics for monitoring
 */
interface PerformanceMetrics {
  queryTime: number;
  cacheHit: boolean;
  recordCount: number;
}

/**
 * Optimized repository for screenshot database operations
 * Features:
 * - Query result caching with TTL
 * - Prepared statement optimization
 * - Connection pooling ready
 * - Performance monitoring
 */
export class ScreenshotRepositoryOptimized {
  // Query cache instances
  private static listCache = new QueryCache<ScreenshotListResult>({
    ttl: 60000, // 1 minute TTL for list queries
    maxSize: 50, // Keep 50 most recent queries
    cleanupIntervalMs: 30000, // Clean every 30 seconds
  });

  private static singleCache = new QueryCache<ScreenshotRecord>({
    ttl: 300000, // 5 minute TTL for single records
    maxSize: 100, // Keep 100 most accessed screenshots
    cleanupIntervalMs: 60000, // Clean every minute
  });

  private static statsCache = new QueryCache<{
    totalCount: number;
    totalSize: number;
    avgSize: number;
    formats: Record<string, number>;
  }>({
    ttl: 30000, // 30 second TTL for statistics
    maxSize: 10, // Keep 10 stat queries
    cleanupIntervalMs: 15000, // Clean every 15 seconds
  });

  // Prepared statement cache (simulated - libSQL doesn't expose prepared statements directly)
  private static queryTemplates = new Map<string, string>();

  /**
   * Initialize prepared statement templates
   */
  static {
    // Common query templates
    ScreenshotRepositoryOptimized.queryTemplates.set(
      "insert",
      `INSERT INTO screenshots (
        id, instance_id, file_path, filename, session_id, browser_id,
        team_id, user_id, tag, format, file_size, width, height,
        full_page, quality, hash, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    ScreenshotRepositoryOptimized.queryTemplates.set(
      "selectById",
      "SELECT * FROM screenshots WHERE id = ?",
    );

    ScreenshotRepositoryOptimized.queryTemplates.set(
      "deleteOld",
      "DELETE FROM screenshots WHERE created_at < datetime('now', '-' || ? || ' days') RETURNING id",
    );

    ScreenshotRepositoryOptimized.queryTemplates.set(
      "updateAccess",
      "UPDATE screenshots SET accessed_at = CURRENT_TIMESTAMP WHERE id IN (%PLACEHOLDERS%)",
    );
  }

  /**
   * Save screenshot metadata to database (with performance tracking)
   */
  static async save(screenshot: Omit<ScreenshotRecord, "id" | "createdAt">): Promise<string> {
    const startTime = Date.now();
    const db = await getDatabaseManager();
    const id = randomUUID();

    try {
      const query = ScreenshotRepositoryOptimized.queryTemplates.get("insert");
      if (!query) {
        throw new Error("Insert query template not found");
      }

      await db.execute(query, [
        id,
        screenshot.instanceId,
        screenshot.filePath,
        screenshot.filename,
        screenshot.sessionId,
        screenshot.browserId,
        screenshot.teamId || null,
        screenshot.userId || null,
        screenshot.tag || null,
        screenshot.format,
        screenshot.fileSize,
        screenshot.width || null,
        screenshot.height || null,
        screenshot.fullPage ? 1 : 0,
        screenshot.quality || null,
        screenshot.hash,
        screenshot.metadata ? JSON.stringify(screenshot.metadata) : null,
      ]);

      // Invalidate related caches
      ScreenshotRepositoryOptimized.invalidateCachesForInstance(screenshot.instanceId);
      if (screenshot.sessionId) {
        ScreenshotRepositoryOptimized.listCache.invalidatePattern(
          `.*sessionId:"${screenshot.sessionId}".*`,
        );
      }

      const elapsed = Date.now() - startTime;
      ensureLogger().debug("Screenshot saved", {
        id,
        filename: screenshot.filename,
        performanceMs: elapsed,
      });

      return id;
    } catch (error) {
      ensureLogger().error("Failed to save screenshot metadata", { error, screenshot });
      throw error;
    }
  }

  /**
   * List screenshots with filtering, pagination, and caching
   */
  static async list(query: ScreenshotQuery): Promise<ScreenshotListResult> {
    const startTime = Date.now();

    // Generate cache key - cast to Record for compatibility
    const cacheKey = createCacheKey("list", query as Record<string, unknown>);

    // Check cache first
    const cached = ScreenshotRepositoryOptimized.listCache.get(cacheKey);
    if (cached) {
      const metrics: PerformanceMetrics = {
        queryTime: Date.now() - startTime,
        cacheHit: true,
        recordCount: cached.items.length,
      };
      ScreenshotRepositoryOptimized.logPerformance("list", metrics);
      return cached;
    }

    // Execute query
    const result = await ScreenshotRepositoryOptimized.executeListQuery(query);

    // Cache the result
    ScreenshotRepositoryOptimized.listCache.set(cacheKey, result);

    const metrics: PerformanceMetrics = {
      queryTime: Date.now() - startTime,
      cacheHit: false,
      recordCount: result.items.length,
    };
    ScreenshotRepositoryOptimized.logPerformance("list", metrics);

    return result;
  }

  /**
   * Execute the actual list query (extracted for clarity)
   */
  private static async executeListQuery(query: ScreenshotQuery): Promise<ScreenshotListResult> {
    const db = await getDatabaseManager();
    const currentInstanceId = db.getInstanceId();

    // Build WHERE clause
    const conditions: string[] = [];
    const params: InValue[] = [];

    // Default to current instance if not specified
    if (query.instanceId !== undefined) {
      conditions.push("instance_id = ?");
      params.push(query.instanceId);
    } else if (currentInstanceId) {
      conditions.push("instance_id = ?");
      params.push(currentInstanceId);
    }

    if (query.sessionId) {
      conditions.push("session_id = ?");
      params.push(query.sessionId);
    }

    if (query.teamId) {
      conditions.push("team_id = ?");
      params.push(query.teamId);
    }

    if (query.userId) {
      conditions.push("user_id = ?");
      params.push(query.userId);
    }

    if (query.tag) {
      conditions.push("tag LIKE ?");
      params.push(`${query.tag}%`);
    }

    if (query.format) {
      conditions.push("format = ?");
      params.push(query.format);
    }

    // Time range filtering with index optimization
    if (query.startDate) {
      conditions.push("created_at >= ?");
      params.push(query.startDate.toISOString());
    }

    if (query.endDate) {
      conditions.push("created_at <= ?");
      params.push(query.endDate.toISOString());
    }

    // Max age optimization - use index-friendly comparison
    if (query.maxAge) {
      const cutoffDate = new Date(Date.now() - query.maxAge * 1000);
      conditions.push("created_at >= ?");
      params.push(cutoffDate.toISOString());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Execute count and data queries in parallel (if supported)
    const [countResult, dataResult] = await Promise.all([
      // Count query
      db.execute(`SELECT COUNT(*) as total FROM screenshots ${whereClause}`, params),

      // Data query with optimized pagination
      db.execute(
        `SELECT
          id, instance_id, file_path, filename, session_id, browser_id,
          team_id, user_id, tag, format, file_size, width, height,
          full_page, quality, hash, created_at, accessed_at, metadata
        FROM screenshots
        ${whereClause}
        ORDER BY ${query.orderBy || "created_at"} ${query.orderDirection || "DESC"}
        LIMIT ? OFFSET ?`,
        [...params, Math.min(query.limit || 10, 100), query.offset || 0],
      ),
    ]);

    const total = (countResult.rows[0]?.["total"] as number) || 0;

    // Transform results
    const items: ScreenshotRecord[] = dataResult.rows.map((row) => ({
      id: row["id"] as string,
      instanceId: row["instance_id"] as string,
      filePath: row["file_path"] as string,
      filename: row["filename"] as string,
      sessionId: row["session_id"] as string,
      browserId: row["browser_id"] as string,
      teamId: row["team_id"] as string | undefined,
      userId: row["user_id"] as string | undefined,
      tag: row["tag"] as string | undefined,
      format: row["format"] as "png" | "jpeg",
      fileSize: row["file_size"] as number,
      width: row["width"] as number | undefined,
      height: row["height"] as number | undefined,
      fullPage: Boolean(row["full_page"]),
      quality: row["quality"] as number | undefined,
      hash: row["hash"] as string,
      createdAt: new Date(row["created_at"] as string),
      accessedAt: row["accessed_at"] ? new Date(row["accessed_at"] as string) : undefined,
      metadata: row["metadata"] ? JSON.parse(row["metadata"] as string) : undefined,
    }));

    // Batch update access time (non-blocking)
    if (items.length > 0) {
      ScreenshotRepositoryOptimized.updateAccessTimeAsync(items.map((item) => item.id));
    }

    const limit = Math.min(query.limit || 10, 100);
    const offset = query.offset || 0;

    return {
      items,
      total,
      hasMore: offset + limit < total,
      nextOffset: offset + limit < total ? offset + limit : undefined,
    };
  }

  /**
   * Get screenshot by ID with caching
   */
  static async getById(id: string): Promise<ScreenshotRecord | null> {
    const startTime = Date.now();

    // Check cache first
    const cacheKey = `id:${id}`;
    const cached = ScreenshotRepositoryOptimized.singleCache.get(cacheKey);
    if (cached) {
      const metrics: PerformanceMetrics = {
        queryTime: Date.now() - startTime,
        cacheHit: true,
        recordCount: 1,
      };
      ScreenshotRepositoryOptimized.logPerformance("getById", metrics);
      return cached;
    }

    // Execute query
    const db = await getDatabaseManager();
    const query = ScreenshotRepositoryOptimized.queryTemplates.get("selectById");
    if (!query) {
      throw new Error("Select by ID query template not found");
    }

    const result = await db.execute(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    const record: ScreenshotRecord = {
      id: row["id"] as string,
      instanceId: row["instance_id"] as string,
      filePath: row["file_path"] as string,
      filename: row["filename"] as string,
      sessionId: row["session_id"] as string,
      browserId: row["browser_id"] as string,
      teamId: row["team_id"] as string | undefined,
      userId: row["user_id"] as string | undefined,
      tag: row["tag"] as string | undefined,
      format: row["format"] as "png" | "jpeg",
      fileSize: row["file_size"] as number,
      width: row["width"] as number | undefined,
      height: row["height"] as number | undefined,
      fullPage: Boolean(row["full_page"]),
      quality: row["quality"] as number | undefined,
      hash: row["hash"] as string,
      createdAt: new Date(row["created_at"] as string),
      accessedAt: row["accessed_at"] ? new Date(row["accessed_at"] as string) : undefined,
      metadata: row["metadata"] ? JSON.parse(row["metadata"] as string) : undefined,
    };

    // Cache the result
    ScreenshotRepositoryOptimized.singleCache.set(cacheKey, record);

    const metrics: PerformanceMetrics = {
      queryTime: Date.now() - startTime,
      cacheHit: false,
      recordCount: 1,
    };
    ScreenshotRepositoryOptimized.logPerformance("getById", metrics);

    return record;
  }

  /**
   * Delete screenshots older than specified days
   */
  static async deleteOlderThan(days: number): Promise<number> {
    const db = await getDatabaseManager();
    const query = ScreenshotRepositoryOptimized.queryTemplates.get("deleteOld");
    if (!query) {
      throw new Error("Delete old query template not found");
    }

    const result = await db.execute(query, [days]);

    const count = result.rows.length;
    if (count > 0) {
      // Invalidate all caches when deleting
      ScreenshotRepositoryOptimized.listCache.clear();
      ScreenshotRepositoryOptimized.singleCache.clear();
      ScreenshotRepositoryOptimized.statsCache.clear();
      ensureLogger().info("Deleted old screenshots", { count, days });
    }

    return count;
  }

  /**
   * Get storage statistics with caching
   */
  static async getStats(instanceId?: string): Promise<{
    totalCount: number;
    totalSize: number;
    avgSize: number;
    formats: Record<string, number>;
  }> {
    const startTime = Date.now();
    const cacheKey = createCacheKey("stats", { instanceId });

    // Check cache first
    const cached = ScreenshotRepositoryOptimized.statsCache.get(cacheKey);
    if (cached) {
      const metrics: PerformanceMetrics = {
        queryTime: Date.now() - startTime,
        cacheHit: true,
        recordCount: 0,
      };
      ScreenshotRepositoryOptimized.logPerformance("getStats", metrics);
      return cached;
    }

    // Execute query
    const db = await getDatabaseManager();
    const currentInstanceId = instanceId || db.getInstanceId();

    const whereClause = currentInstanceId ? "WHERE instance_id = ?" : "";
    const params = currentInstanceId ? [currentInstanceId] : [];

    const result = await db.execute(
      `
      SELECT
        COUNT(*) as total_count,
        SUM(file_size) as total_size,
        AVG(file_size) as avg_size,
        format,
        COUNT(*) as format_count
      FROM screenshots
      ${whereClause}
      GROUP BY format
    `,
      params,
    );

    let totalCount = 0;
    let totalSize = 0;
    const formats: Record<string, number> = {};

    for (const row of result.rows) {
      totalCount += row["format_count"] as number;
      totalSize += (row["total_size"] as number) || 0;
      formats[row["format"] as string] = row["format_count"] as number;
    }

    const stats = {
      totalCount,
      totalSize,
      avgSize: totalCount > 0 ? totalSize / totalCount : 0,
      formats,
    };

    // Cache the result
    ScreenshotRepositoryOptimized.statsCache.set(cacheKey, stats);

    const metrics: PerformanceMetrics = {
      queryTime: Date.now() - startTime,
      cacheHit: false,
      recordCount: totalCount,
    };
    ScreenshotRepositoryOptimized.logPerformance("getStats", metrics);

    return stats;
  }

  /**
   * Get cache statistics for monitoring
   */
  static getCacheStats(): {
    listCache: ReturnType<QueryCache["getStats"]>;
    singleCache: ReturnType<QueryCache["getStats"]>;
    statsCache: ReturnType<QueryCache["getStats"]>;
  } {
    return {
      listCache: ScreenshotRepositoryOptimized.listCache.getStats(),
      singleCache: ScreenshotRepositoryOptimized.singleCache.getStats(),
      statsCache: ScreenshotRepositoryOptimized.statsCache.getStats(),
    };
  }

  /**
   * Clear all caches (useful for testing or forced refresh)
   */
  static clearCaches(): void {
    ScreenshotRepositoryOptimized.listCache.clear();
    ScreenshotRepositoryOptimized.singleCache.clear();
    ScreenshotRepositoryOptimized.statsCache.clear();
    ensureLogger().info("All caches cleared");
  }

  /**
   * Update access time asynchronously (non-blocking)
   */
  private static async updateAccessTimeAsync(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    // Run in background, don't await
    setImmediate(async () => {
      try {
        const db = await getDatabaseManager();
        const placeholders = ids.map(() => "?").join(",");
        const query = ScreenshotRepositoryOptimized.queryTemplates
          .get("updateAccess")
          ?.replace("%PLACEHOLDERS%", placeholders);

        if (!query) {
          throw new Error("Update access query template not found");
        }

        await db.execute(query, ids);
      } catch (error) {
        ensureLogger().debug("Failed to update access time", { error, count: ids.length });
      }
    });
  }

  /**
   * Invalidate caches for a specific instance
   */
  private static invalidateCachesForInstance(instanceId: string): void {
    ScreenshotRepositoryOptimized.listCache.invalidatePattern(`.*instanceId:"${instanceId}".*`);
    ScreenshotRepositoryOptimized.statsCache.invalidatePattern(`.*instanceId:"${instanceId}".*`);
  }

  /**
   * Log performance metrics
   */
  private static logPerformance(operation: string, metrics: PerformanceMetrics): void {
    if (metrics.queryTime > 100) {
      ensureLogger().warn("Slow query detected", { operation, ...metrics });
    } else {
      ensureLogger().debug("Query performance", { operation, ...metrics });
    }
  }

  /**
   * Graceful shutdown - cleanup resources
   */
  static destroy(): void {
    ScreenshotRepositoryOptimized.listCache.destroy();
    ScreenshotRepositoryOptimized.singleCache.destroy();
    ScreenshotRepositoryOptimized.statsCache.destroy();
    ensureLogger().info("Repository resources cleaned up");
  }
}
