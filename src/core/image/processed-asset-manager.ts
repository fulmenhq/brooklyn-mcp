/**
 * Processed Asset Manager for Brooklyn MCP Server
 * Task-based asset management system for image processing results
 * Follows Architecture Committee approved patterns from screenshot storage
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { readdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { basename, extname, join, normalize, relative, resolve } from "node:path";
import { minimatch } from "minimatch";
import { getLogger } from "../../shared/pino-logger.js";

// Direct logger initialization following screenshot pattern
const logger = getLogger("processed-assets");

/**
 * Asset metadata stored with each task
 */
export interface AssetTaskMetadata {
  taskId: string;
  teamId: string;
  userId?: string;
  sessionId?: string;
  createdAt: string;
  sourceFile: {
    name: string;
    size: number;
    originalPath?: string;
  };
  assets: Array<{
    name: string;
    type: "svg" | "png" | "jpeg" | "webp";
    size: number;
    dimensions?: {
      width: number;
      height: number;
    };
    processingType: "compressed" | "converted" | "source";
    createdAt: string;
  }>;
  totalSize: number;
  lastModified: string;
}

/**
 * Asset storage configuration
 */
export interface ProcessedAssetConfig {
  baseDirectory?: string;
  maxFileSize?: number;
  maxTaskSize?: number;
  defaultRetentionDays?: number;
  quotas?: {
    teamLimit: number; // bytes per team
    taskLimit: number; // bytes per task
  };
}

/**
 * Save asset options
 */
export interface SaveAssetOptions {
  taskId?: string;
  teamId: string;
  userId?: string;
  sessionId?: string;
  sourceFileName: string;
  processingType: "compressed" | "converted" | "source";
  overwrite?: boolean;
}

/**
 * Asset query options
 */
export interface AssetQuery {
  taskId?: string;
  pattern?: string; // glob pattern for task matching
  teamId?: string;
  limit?: number;
  offset?: number;
  sortBy?: "created" | "modified" | "size";
  sortDirection?: "asc" | "desc";
}

/**
 * Purge options for asset cleanup
 */
export interface PurgeOptions {
  pattern: string; // glob pattern for tasks
  strategy: "complete" | "partial" | "age-based";
  teamId: string;
  keepLast?: number; // for partial strategy
  olderThan?: string; // for age-based: "7d", "30d", "1h"
  dryRun?: boolean;
  confirm?: boolean;
}

/**
 * Purge result information
 */
export interface PurgeResult {
  success: boolean;
  dryRun: boolean;
  tasksAffected: string[];
  filesDeleted: number;
  bytesFreed: number;
  errors: Array<{
    taskId: string;
    error: string;
  }>;
}

export class ProcessedAssetManager {
  private config: ProcessedAssetConfig;
  private baseDir: string;

  constructor(config: ProcessedAssetConfig = {}) {
    this.config = {
      baseDirectory: join(process.cwd(), "assets", "processed"),
      maxFileSize: 50 * 1024 * 1024, // 50MB per file
      maxTaskSize: 200 * 1024 * 1024, // 200MB per task
      defaultRetentionDays: 30,
      quotas: {
        teamLimit: 1024 * 1024 * 1024, // 1GB per team
        taskLimit: 200 * 1024 * 1024, // 200MB per task
      },
      ...config,
    };

    this.baseDir = resolve(this.config.baseDirectory || join(process.cwd(), "assets", "processed"));
    this.ensureDirectoryExists(this.baseDir);
  }

  /**
   * Generate or validate task ID
   */
  generateTaskId(sourceFileName?: string, userTaskId?: string): string {
    if (userTaskId) {
      // Sanitize user-provided task ID
      return userTaskId.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase();
    }

    if (sourceFileName) {
      const baseName = basename(sourceFileName, extname(sourceFileName));
      const timestamp = new Date().toISOString().slice(0, 10);
      return `${baseName}-${timestamp}`;
    }

    return `task-${Date.now()}-${randomUUID().slice(0, 8)}`;
  }

  /**
   * Get task directory path
   */
  private getTaskDirectory(teamId: string, taskId: string): string {
    return join(this.baseDir, teamId, taskId);
  }

  /**
   * Ensure directory exists
   */
  private ensureDirectoryExists(path: string): void {
    if (!existsSync(path)) {
      mkdirSync(path, { recursive: true });
    }
  }

  /**
   * Save processed asset to task directory
   */
  async saveAsset(
    buffer: Buffer,
    fileName: string,
    options: SaveAssetOptions,
  ): Promise<{
    success: boolean;
    taskId: string;
    assetPath: string;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      // Generate task ID if not provided
      const taskId = options.taskId || this.generateTaskId(options.sourceFileName);
      const taskDir = this.getTaskDirectory(options.teamId, taskId);

      // Ensure task directory exists
      this.ensureDirectoryExists(taskDir);

      // Check file size limits
      const maxFileSize = this.config.maxFileSize || 50 * 1024 * 1024; // 50MB default
      if (buffer.length > maxFileSize) {
        throw new Error(`File size ${buffer.length} exceeds limit ${maxFileSize}`);
      }

      // Build asset path
      const assetPath = join(taskDir, fileName);

      // Check if file exists and handle overwrite
      if (existsSync(assetPath) && !options.overwrite) {
        throw new Error(`Asset ${fileName} already exists in task ${taskId}`);
      }

      // Write asset file
      await writeFile(assetPath, buffer);

      // Update or create metadata
      await this.updateTaskMetadata(options.teamId, taskId, {
        fileName,
        size: buffer.length,
        processingType: options.processingType,
        sourceFileName: options.sourceFileName,
        userId: options.userId,
        sessionId: options.sessionId,
      });

      const processingTime = Date.now() - startTime;

      logger.info("Asset saved successfully", {
        taskId,
        fileName,
        size: buffer.length,
        teamId: options.teamId,
        processingTime,
      });

      return {
        success: true,
        taskId,
        assetPath: relative(this.baseDir, assetPath),
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error("Asset save failed", {
        fileName,
        teamId: options.teamId,
        error: errorMessage,
        processingTime,
      });

      return {
        success: false,
        taskId: options.taskId || "",
        assetPath: "",
        error: errorMessage,
      };
    }
  }

  /**
   * Update task metadata
   */
  private async updateTaskMetadata(
    teamId: string,
    taskId: string,
    assetInfo: {
      fileName: string;
      size: number;
      processingType: "compressed" | "converted" | "source";
      sourceFileName: string;
      userId?: string;
      sessionId?: string;
    },
  ): Promise<void> {
    const taskDir = this.getTaskDirectory(teamId, taskId);
    const metadataPath = join(taskDir, "metadata.json");

    let metadata: AssetTaskMetadata;

    try {
      // Try to read existing metadata
      const existingData = await readFile(metadataPath, "utf-8");
      metadata = JSON.parse(existingData);

      // Update existing metadata
      metadata.lastModified = new Date().toISOString();

      // Add or update asset info
      const existingAssetIndex = metadata.assets.findIndex((a) => a.name === assetInfo.fileName);
      const assetEntry = {
        name: assetInfo.fileName,
        type: this.getAssetType(assetInfo.fileName),
        size: assetInfo.size,
        processingType: assetInfo.processingType,
        createdAt: new Date().toISOString(),
      };

      if (existingAssetIndex >= 0) {
        metadata.assets[existingAssetIndex] = assetEntry;
      } else {
        metadata.assets.push(assetEntry);
      }

      // Recalculate total size
      metadata.totalSize = metadata.assets.reduce((sum, asset) => sum + asset.size, 0);
    } catch (_error) {
      // Create new metadata
      metadata = {
        taskId,
        teamId,
        userId: assetInfo.userId,
        sessionId: assetInfo.sessionId,
        createdAt: new Date().toISOString(),
        sourceFile: {
          name: assetInfo.sourceFileName,
          size: assetInfo.size,
        },
        assets: [
          {
            name: assetInfo.fileName,
            type: this.getAssetType(assetInfo.fileName),
            size: assetInfo.size,
            processingType: assetInfo.processingType,
            createdAt: new Date().toISOString(),
          },
        ],
        totalSize: assetInfo.size,
        lastModified: new Date().toISOString(),
      };
    }

    await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Determine asset type from filename
   */
  private getAssetType(fileName: string): "svg" | "png" | "jpeg" | "webp" {
    const ext = extname(fileName).toLowerCase();
    switch (ext) {
      case ".svg":
        return "svg";
      case ".png":
        return "png";
      case ".jpg":
      case ".jpeg":
        return "jpeg";
      case ".webp":
        return "webp";
      default:
        return "png"; // default fallback
    }
  }

  /**
   * List processed assets with filtering
   */
  async listAssets(query: AssetQuery = {}): Promise<{
    success: boolean;
    tasks: AssetTaskMetadata[];
    totalTasks: number;
    error?: string;
  }> {
    try {
      const teamId = query.teamId;
      if (!teamId) {
        throw new Error("Team ID is required for listing assets");
      }

      const teamDir = join(this.baseDir, teamId);
      if (!existsSync(teamDir)) {
        return {
          success: true,
          tasks: [],
          totalTasks: 0,
        };
      }

      // Get all task directories
      const taskDirs = await readdir(teamDir, { withFileTypes: true });
      let taskIds = taskDirs.filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name);

      // Apply pattern filtering
      if (query.pattern) {
        const pattern = query.pattern;
        taskIds = taskIds.filter((taskId) => minimatch(taskId, pattern));
      }

      // Filter by specific taskId
      if (query.taskId) {
        taskIds = taskIds.filter((taskId) => taskId === query.taskId);
      }

      // Load metadata for each task
      const tasks: AssetTaskMetadata[] = [];
      for (const taskId of taskIds) {
        const metadataPath = join(teamDir, taskId, "metadata.json");
        try {
          const metadataContent = await readFile(metadataPath, "utf-8");
          const metadata = JSON.parse(metadataContent) as AssetTaskMetadata;
          tasks.push(metadata);
        } catch (error) {
          logger.warn("Failed to read task metadata", { taskId, error });
        }
      }

      // Apply sorting
      if (query.sortBy) {
        tasks.sort((a, b) => {
          let aVal: string | number;
          let bVal: string | number;

          switch (query.sortBy) {
            case "created":
              aVal = new Date(a.createdAt).getTime();
              bVal = new Date(b.createdAt).getTime();
              break;
            case "modified":
              aVal = new Date(a.lastModified).getTime();
              bVal = new Date(b.lastModified).getTime();
              break;
            case "size":
              aVal = a.totalSize;
              bVal = b.totalSize;
              break;
            default:
              return 0;
          }

          const result = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          return query.sortDirection === "desc" ? -result : result;
        });
      }

      // Apply pagination
      const totalTasks = tasks.length;
      let paginatedTasks = tasks;
      if (query.limit) {
        const offset = query.offset || 0;
        paginatedTasks = tasks.slice(offset, offset + query.limit);
      }

      return {
        success: true,
        tasks: paginatedTasks,
        totalTasks,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Failed to list assets", { query, error: errorMessage });

      return {
        success: false,
        tasks: [],
        totalTasks: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Get specific asset from task
   */
  async getAsset(
    teamId: string,
    taskId: string,
    assetName: string,
  ): Promise<{
    success: boolean;
    buffer?: Buffer;
    metadata?: AssetTaskMetadata;
    error?: string;
  }> {
    try {
      const taskDir = this.getTaskDirectory(teamId, taskId);
      const assetPath = join(taskDir, assetName);

      if (!existsSync(assetPath)) {
        throw new Error(`Asset ${assetName} not found in task ${taskId}`);
      }

      // Read asset buffer
      const buffer = await readFile(assetPath);

      // Read task metadata
      const metadataPath = join(taskDir, "metadata.json");
      let metadata: AssetTaskMetadata | undefined;
      try {
        const metadataContent = await readFile(metadataPath, "utf-8");
        metadata = JSON.parse(metadataContent);
      } catch (error) {
        logger.warn("Failed to read task metadata", { taskId, error });
      }

      return {
        success: true,
        buffer,
        metadata,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Failed to get asset", { teamId, taskId, assetName, error: errorMessage });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Parse duration string to milliseconds
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([dhm])$/);
    if (!(match?.[1] && match[2])) {
      throw new Error(`Invalid duration format: ${duration}. Use format like "7d", "24h", "30m"`);
    }

    const value = Number.parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case "m":
        return value * 60 * 1000;
      case "h":
        return value * 60 * 60 * 1000;
      case "d":
        return value * 24 * 60 * 60 * 1000;
      default:
        throw new Error(`Unknown duration unit: ${unit}`);
    }
  }

  /**
   * Purge assets based on flexible criteria
   */
  async purgeAssets(options: PurgeOptions): Promise<PurgeResult> {
    const result: PurgeResult = {
      success: false,
      dryRun: options.dryRun ?? false,
      tasksAffected: [],
      filesDeleted: 0,
      bytesFreed: 0,
      errors: [],
    };

    try {
      // Get tasks matching pattern
      const listResult = await this.listAssets({
        teamId: options.teamId,
        pattern: options.pattern,
      });

      if (!listResult.success) {
        throw new Error(listResult.error || "Failed to list tasks");
      }

      let tasksToProcess = listResult.tasks;

      // Apply strategy-specific filtering
      if (options.strategy === "age-based" && options.olderThan) {
        const cutoffTime = Date.now() - this.parseDuration(options.olderThan);
        tasksToProcess = tasksToProcess.filter(
          (task) => new Date(task.lastModified).getTime() < cutoffTime,
        );
      } else if (options.strategy === "partial" && options.keepLast) {
        // Sort by creation date and keep only the oldest ones (excluding keepLast newest)
        tasksToProcess = tasksToProcess
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(options.keepLast);
      }

      // Process each task
      for (const task of tasksToProcess) {
        try {
          result.tasksAffected.push(task.taskId);
          result.bytesFreed += task.totalSize;
          result.filesDeleted += task.assets.length + 1; // +1 for metadata.json

          if (!result.dryRun) {
            const taskDir = this.getTaskDirectory(options.teamId, task.taskId);
            await rm(taskDir, { recursive: true, force: true });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          result.errors.push({
            taskId: task.taskId,
            error: errorMessage,
          });
        }
      }

      result.success = result.errors.length === 0;

      logger.info("Asset purge completed", {
        pattern: options.pattern,
        strategy: options.strategy,
        dryRun: result.dryRun,
        tasksAffected: result.tasksAffected.length,
        filesDeleted: result.filesDeleted,
        bytesFreed: result.bytesFreed,
        errors: result.errors.length,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Asset purge failed", { options, error: errorMessage });

      return {
        ...result,
        success: false,
        errors: [{ taskId: "system", error: errorMessage }],
      };
    }
  }

  /**
   * Get storage statistics for a team
   */
  async getStorageStats(teamId: string): Promise<{
    totalTasks: number;
    totalFiles: number;
    totalBytes: number;
    oldestTask: string | null;
    newestTask: string | null;
  }> {
    const listResult = await this.listAssets({ teamId });

    if (!listResult.success || listResult.tasks.length === 0) {
      return {
        totalTasks: 0,
        totalFiles: 0,
        totalBytes: 0,
        oldestTask: null,
        newestTask: null,
      };
    }

    const tasks = listResult.tasks;
    const totalBytes = tasks.reduce((sum, task) => sum + task.totalSize, 0);
    const totalFiles = tasks.reduce((sum, task) => sum + task.assets.length, 0);

    // Sort by creation date to find oldest/newest
    const sortedTasks = tasks.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

    return {
      totalTasks: tasks.length,
      totalFiles,
      totalBytes,
      oldestTask: sortedTasks[0]?.taskId || null,
      newestTask: sortedTasks[sortedTasks.length - 1]?.taskId || null,
    };
  }
}
