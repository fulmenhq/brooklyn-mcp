/**
 * Screenshot Repository for database operations
 */

import { randomUUID } from "node:crypto";

import { getLogger } from "../../../shared/pino-logger.js";
import { getDatabaseManager } from "../database-manager.js";
import type {
  ScreenshotListResult,
  ScreenshotQuery,
  ScreenshotRecord,
} from "../types.js";

const logger = getLogger("screenshot-repository");

/**
 * Repository for screenshot database operations
 */
export class ScreenshotRepository {
  /**
   * Save screenshot metadata to database
   */
  static async save(screenshot: Omit<ScreenshotRecord, "id" | "createdAt">): Promise<string> {
    const db = await getDatabaseManager();
    const id = randomUUID();
    
    try {
      await db.execute(`
        INSERT INTO screenshots (
          id, instance_id, file_path, filename, session_id, browser_id,
          team_id, user_id, tag, format, file_size, width, height,
          full_page, quality, hash, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
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
      
      logger.debug("Screenshot metadata saved", { id, filename: screenshot.filename });
      return id;
    } catch (error) {
      logger.error("Failed to save screenshot metadata", { error, screenshot });
      throw error;
    }
  }

  /**
   * List screenshots with filtering and pagination
   */
  static async list(query: ScreenshotQuery): Promise<ScreenshotListResult> {
    const db = await getDatabaseManager();
    const currentInstanceId = db.getInstanceId();
    
    // Build WHERE clause
    const conditions: string[] = [];
    const params: any[] = [];
    
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
    
    // Time range filtering
    if (query.startDate) {
      conditions.push("created_at >= ?");
      params.push(query.startDate.toISOString());
    }
    
    if (query.endDate) {
      conditions.push("created_at <= ?");
      params.push(query.endDate.toISOString());
    }
    
    // Max age optimization
    if (query.maxAge) {
      conditions.push("created_at >= datetime('now', '-' || ? || ' seconds')");
      params.push(query.maxAge);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    
    // Get total count
    const countResult = await db.execute(
      `SELECT COUNT(*) as total FROM screenshots ${whereClause}`,
      params,
    );
    const total = (countResult.rows[0]?.["total"] as number) || 0;
    
    // Build main query with pagination
    const orderBy = query.orderBy || "created_at";
    const orderDirection = query.orderDirection || "DESC";
    const limit = Math.min(query.limit || 10, 100); // Cap at 100
    const offset = query.offset || 0;
    
    const dataQuery = `
      SELECT 
        id, instance_id, file_path, filename, session_id, browser_id,
        team_id, user_id, tag, format, file_size, width, height,
        full_page, quality, hash, created_at, accessed_at, metadata
      FROM screenshots 
      ${whereClause}
      ORDER BY ${orderBy} ${orderDirection}
      LIMIT ? OFFSET ?
    `;
    
    const dataResult = await db.execute(dataQuery, [...params, limit, offset]);
    
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
    
    // Update access time for returned screenshots
    if (items.length > 0) {
      const ids = items.map((item) => item.id);
      const placeholders = ids.map(() => "?").join(",");
      await db.execute(
        `UPDATE screenshots SET accessed_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`,
        ids,
      ).catch((error) => {
        logger.debug("Failed to update access time", { error });
      });
    }
    
    return {
      items,
      total,
      hasMore: offset + limit < total,
      nextOffset: offset + limit < total ? offset + limit : undefined,
    };
  }

  /**
   * Get screenshot by ID
   */
  static async getById(id: string): Promise<ScreenshotRecord | null> {
    const db = await getDatabaseManager();
    
    const result = await db.execute(
      `SELECT * FROM screenshots WHERE id = ?`,
      [id],
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
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
  }

  /**
   * Delete screenshots older than specified days
   */
  static async deleteOlderThan(days: number): Promise<number> {
    const db = await getDatabaseManager();
    
    const result = await db.execute(
      `DELETE FROM screenshots 
       WHERE created_at < datetime('now', '-' || ? || ' days')
       RETURNING id`,
      [days],
    );
    
    const count = result.rows.length;
    if (count > 0) {
      logger.info("Deleted old screenshots", { count, days });
    }
    
    return count;
  }

  /**
   * Get storage statistics
   */
  static async getStats(instanceId?: string): Promise<{
    totalCount: number;
    totalSize: number;
    avgSize: number;
    formats: Record<string, number>;
  }> {
    const db = await getDatabaseManager();
    const currentInstanceId = instanceId || db.getInstanceId();
    
    const whereClause = currentInstanceId ? "WHERE instance_id = ?" : "";
    const params = currentInstanceId ? [currentInstanceId] : [];
    
    const result = await db.execute(`
      SELECT 
        COUNT(*) as total_count,
        SUM(file_size) as total_size,
        AVG(file_size) as avg_size,
        format,
        COUNT(*) as format_count
      FROM screenshots
      ${whereClause}
      GROUP BY format
    `, params);
    
    let totalCount = 0;
    let totalSize = 0;
    const formats: Record<string, number> = {};
    
    for (const row of result.rows) {
      totalCount += row["format_count"] as number;
      totalSize += (row["total_size"] as number) || 0;
      formats[row["format"] as string] = row["format_count"] as number;
    }
    
    return {
      totalCount,
      totalSize,
      avgSize: totalCount > 0 ? totalSize / totalCount : 0,
      formats,
    };
  }
}