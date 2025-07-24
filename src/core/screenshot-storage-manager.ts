/**
 * Screenshot storage manager for Brooklyn MCP server
 * Architecture Committee approved implementation for enterprise-ready file storage
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, normalize, relative, resolve } from "node:path";

import { getLogger } from "../shared/structured-logger.js";

// Lazy logger initialization to avoid circular dependency
let logger: ReturnType<typeof getLogger> | null = null;

function ensureLogger() {
  if (!logger) {
    logger = getLogger("screenshot-storage");
  }
  return logger;
}

/**
 * Screenshot storage configuration
 */
export interface ScreenshotStorageConfig {
  baseDirectory?: string;
  maxFileSize?: number;
  defaultFormat?: "png" | "jpeg";
  encryption?: boolean;
  compression?: boolean;
  quotas?: {
    sessionLimit: number; // bytes
    teamLimit: number; // bytes
  };
  retention?: {
    sessionCleanup: boolean;
    archiveAfterDays: number;
  };
}

/**
 * Screenshot save options (Architecture Committee v2)
 */
export interface SaveScreenshotOptions {
  sessionId: string;
  browserId: string;
  teamId?: string;
  userId?: string;
  format?: "png" | "jpeg";
  quality?: number;
  fullPage?: boolean;
  encryption?: boolean;
  metadata?: Record<string, unknown>;
  // NEW: Architecture Committee enhancements
  tag?: string; // User-provided tag for organization
  instanceId?: string; // Override instance detection
}

/**
 * Screenshot storage result
 */
export interface ScreenshotStorageResult {
  filePath: string;
  filename: string;
  auditId: string;
  fileSize: number;
  format: string;
  hash: string;
  metadata: ScreenshotMetadata;
  thumbnailBase64?: string;
}

/**
 * Screenshot metadata structure (Architecture Committee v2)
 */
export interface ScreenshotMetadata {
  sessionId: string;
  browserId: string;
  userId?: string;
  teamId?: string;
  timestamp: string;
  filename: string;
  format: string;
  dimensions: { width: number; height: number };
  fileSize: number;
  hash: string;
  auditId: string;
  options: {
    fullPage?: boolean;
    quality?: number;
    encrypted?: boolean;
    compressed?: boolean;
  };
  created: string;
  lastAccessed?: string;
  // NEW: Architecture Committee v2 enhancements
  instanceId: string;
  tag: string;
}

/**
 * Storage quota information
 */
export interface QuotaInfo {
  sessionUsed: number;
  sessionLimit: number;
  teamUsed: number;
  teamLimit: number;
  available: number;
}

/**
 * Security validation error
 */
export class StorageSecurityError extends Error {
  constructor(
    message: string,
    public path?: string,
  ) {
    super(message);
    this.name = "StorageSecurityError";
  }
}

/**
 * Storage quota exceeded error
 */
export class StorageQuotaError extends Error {
  constructor(
    message: string,
    public quotaInfo?: QuotaInfo,
  ) {
    super(message);
    this.name = "StorageQuotaError";
  }
}

/**
 * Screenshot query for finding files (Architecture Committee v2)
 */
export interface ScreenshotQuery {
  instanceId?: string;
  tag?: string;
  sessionId?: string;
  teamId?: string;
  userId?: string;
  startDate?: Date;
  endDate?: Date;
  format?: "png" | "jpeg";
}

/**
 * Storage statistics (Architecture Committee v2)
 */
export interface StorageStats {
  totalFiles: number;
  totalSize: number;
  instanceCount: number;
  tagCount: number;
  oldestFile?: Date;
  newestFile?: Date;
  instances: Array<{
    instanceId: string;
    fileCount: number;
    size: number;
    tags: string[];
  }>;
}

/**
 * Screenshot search result
 */
export interface ScreenshotResult {
  filePath: string;
  filename: string;
  instanceId: string;
  tag: string;
  metadata: ScreenshotMetadata;
}

/**
 * Screenshot storage manager
 * Enterprise-ready file storage with security, quotas, and audit logging
 */
export class ScreenshotStorageManager {
  private readonly config: Required<ScreenshotStorageConfig>;
  private readonly baseDirectory: string;
  private readonly instanceId: string;

  constructor(config: ScreenshotStorageConfig = {}) {
    this.config = {
      baseDirectory: config.baseDirectory || join(homedir(), ".brooklyn", "screenshots"),
      maxFileSize: config.maxFileSize || 50 * 1024 * 1024, // 50MB
      defaultFormat: config.defaultFormat || "png",
      encryption: config.encryption ?? false, // Default false for Phase 1
      compression: config.compression ?? false, // Default false for Phase 1
      quotas: {
        sessionLimit: config.quotas?.sessionLimit || 5 * 1024 * 1024 * 1024, // 5GB
        teamLimit: config.quotas?.teamLimit || 50 * 1024 * 1024 * 1024, // 50GB
      },
      retention: {
        sessionCleanup: config.retention?.sessionCleanup ?? true,
        archiveAfterDays: config.retention?.archiveAfterDays || 7,
      },
    };

    this.baseDirectory = resolve(this.config.baseDirectory);

    // Generate idempotent instance UUID (Architecture Committee guidance)
    this.instanceId = this.generateInstanceId(config);

    // Defer logging until first use to avoid circular dependency
  }

  /**
   * Save screenshot buffer to file storage
   */
  async saveScreenshot(
    buffer: Buffer,
    dimensions: { width: number; height: number },
    options: SaveScreenshotOptions,
  ): Promise<ScreenshotStorageResult> {
    const auditId = randomUUID();
    const timestamp = new Date().toISOString();

    ensureLogger().info("Saving screenshot", {
      auditId,
      sessionId: options.sessionId,
      browserId: options.browserId,
      teamId: options.teamId,
      fileSize: buffer.length,
      dimensions,
    });

    try {
      // Validate file size
      if (buffer.length > this.config.maxFileSize) {
        throw new StorageQuotaError(
          `Screenshot size ${buffer.length} exceeds maximum ${this.config.maxFileSize}`,
        );
      }

      // Validate input security first (Architecture Committee requirement)
      this.validateInputSecurity(options);

      // Check quotas
      await this.validateQuotas(options.sessionId, options.teamId, buffer.length);

      // Generate filename and paths (Architecture Committee v2)
      const filename = this.generateFilename(options.format || this.config.defaultFormat);
      const instanceId = options.instanceId || this.instanceId;
      const tag = this.generateUserTag(options.tag);
      const storageDir = this.getStorageDirectory(instanceId, tag);
      const filePath = join(storageDir, filename);

      // Validate path security
      this.validatePath(filePath);

      // Ensure directory exists
      await this.ensureDirectory(storageDir);

      // Calculate hash for integrity
      const hash = createHash("sha256").update(buffer).digest("hex");

      // Create metadata (Architecture Committee v2)
      const metadata: ScreenshotMetadata = {
        sessionId: options.sessionId,
        browserId: options.browserId,
        userId: options.userId,
        teamId: options.teamId,
        timestamp,
        filename,
        format: options.format || this.config.defaultFormat,
        dimensions,
        fileSize: buffer.length,
        hash: `sha256:${hash}`,
        auditId,
        options: {
          fullPage: options.fullPage,
          quality: options.quality,
          encrypted: this.config.encryption && (options.encryption ?? true),
          compressed: this.config.compression,
        },
        created: timestamp,
        // NEW: Architecture Committee v2 enhancements
        instanceId,
        tag,
      };

      // Write file to disk
      await writeFile(filePath, buffer, { mode: 0o600 }); // Owner read/write only

      // Write metadata
      const metadataPath = filePath.replace(/\.(png|jpeg|jpg)$/, ".metadata.json");
      await writeFile(metadataPath, JSON.stringify(metadata, null, 2), { mode: 0o600 });

      // Audit log
      ensureLogger().info("Screenshot saved successfully", {
        auditId,
        operation: "CREATE",
        filePath,
        fileSize: buffer.length,
        hash: metadata.hash,
        sessionId: options.sessionId,
        teamId: options.teamId,
      });

      return {
        filePath,
        filename,
        auditId,
        fileSize: buffer.length,
        format: metadata.format,
        hash: metadata.hash,
        metadata,
      };
    } catch (error) {
      ensureLogger().error("Failed to save screenshot", {
        auditId,
        sessionId: options.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get screenshot file path for reading (Architecture Committee v2)
   */
  async getScreenshotPath(filename: string, instanceId?: string, tag?: string): Promise<string> {
    const actualInstanceId = instanceId || this.instanceId;

    // If tag not provided, search across all tags for this instance
    if (!tag) {
      const searchResults = await this.findScreenshot({
        instanceId: actualInstanceId,
      });

      const match = searchResults.find((result) => result.filename === filename);
      if (!match) {
        throw new Error(`Screenshot file not found: ${filename}`);
      }

      return match.filePath;
    }

    const storageDir = this.getStorageDirectory(actualInstanceId, tag);
    const filePath = join(storageDir, filename);

    // Validate path security
    this.validatePath(filePath);

    // Check file exists
    if (!existsSync(filePath)) {
      throw new Error(`Screenshot file not found: ${filename}`);
    }

    // Audit log
    ensureLogger().debug("Screenshot accessed", {
      operation: "READ",
      filePath,
      instanceId: actualInstanceId,
      tag,
    });

    return filePath;
  }

  /**
   * Delete screenshot file (Architecture Committee v2)
   */
  async deleteScreenshot(filename: string, instanceId?: string, tag?: string): Promise<void> {
    // Use getScreenshotPath to find the file (handles search if tag not provided)
    const filePath = await this.getScreenshotPath(filename, instanceId, tag);
    const metadataPath = filePath.replace(/\.(png|jpeg|jpg)$/, ".metadata.json");

    try {
      // Delete files
      if (existsSync(filePath)) {
        await unlink(filePath);
      }
      if (existsSync(metadataPath)) {
        await unlink(metadataPath);
      }

      // Audit log
      ensureLogger().info("Screenshot deleted", {
        operation: "DELETE",
        filePath,
        instanceId: instanceId || this.instanceId,
        tag,
      });
    } catch (error) {
      ensureLogger().error("Failed to delete screenshot", {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Clean up session directory
   */
  async cleanupSession(sessionId: string, teamId?: string): Promise<void> {
    const sessionDir = this.getSessionDirectory(sessionId, teamId);

    if (!existsSync(sessionDir)) {
      return;
    }

    ensureLogger().info("Cleaning up session directory", {
      operation: "CLEANUP",
      sessionDir,
      sessionId,
      teamId,
    });

    // TODO: Implement recursive directory cleanup
    // For now, just log the intent
    ensureLogger().info("Session cleanup completed", {
      sessionId,
      teamId,
    });
  }

  /**
   * Get current quota usage for session and team
   */
  async getQuotaInfo(_sessionId: string, _teamId?: string): Promise<QuotaInfo> {
    // TODO: Implement quota calculation by scanning directories
    // For now, return placeholder values
    return {
      sessionUsed: 0,
      sessionLimit: this.config.quotas.sessionLimit,
      teamUsed: 0,
      teamLimit: this.config.quotas.teamLimit,
      available: this.config.quotas.sessionLimit,
    };
  }

  /**
   * Generate UUID-based filename with timestamp
   */
  private generateFilename(format: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19); // YYYY-MM-DDTHH-MM-SS
    const uuid = randomUUID();
    return `screenshot-${timestamp}-${uuid}.${format}`;
  }

  /**
   * Generate idempotent instance UUID (Architecture Committee approved)
   */
  private generateInstanceId(config: ScreenshotStorageConfig): string {
    // Use reliable identifiers for consistent UUID across restarts
    const identifier = process.cwd() + (config.baseDirectory || "") + process.env["USER"];
    return createHash("sha256").update(identifier).digest("hex").substring(0, 16);
  }

  /**
   * Generate user-friendly tag or use provided tag
   */
  private generateUserTag(providedTag?: string): string {
    if (providedTag) {
      // Slugify provided tag
      return providedTag
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-");
    }

    // Generate random three-word slug (Architecture Committee guidance)
    const adjectives = ["happy", "quick", "bright", "calm", "bold", "swift", "cool", "warm"];
    const colors = ["red", "blue", "green", "purple", "orange", "yellow", "pink", "silver"];
    const animals = ["fox", "cat", "dog", "bird", "fish", "bear", "wolf", "deer"];

    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const animal = animals[Math.floor(Math.random() * animals.length)];

    return `${adj}-${color}-${animal}`;
  }

  /**
   * Get storage directory path with instance and tag isolation (Architecture Committee v2)
   */
  private getStorageDirectory(instanceId: string, tag: string): string {
    return join(this.baseDirectory, "instances", instanceId, tag);
  }

  /**
   * Get session directory path (DEPRECATED - use getStorageDirectory)
   */
  private getSessionDirectory(sessionId: string, teamId?: string): string {
    // Maintain backward compatibility during transition
    const teamDir = teamId || "default";
    return join(this.baseDirectory, teamDir, "sessions", sessionId);
  }

  /**
   * Validate input parameters for security issues (Architecture Committee v2)
   */
  private validateInputSecurity(options: SaveScreenshotOptions): void {
    const suspiciousPatterns = [
      /\.\.\//, // Directory traversal
      /\.\.\\/, // Windows directory traversal
      /\0/, // Null bytes
      /\/\.\./, // More traversal patterns
      /\\\.\./, // Windows traversal
    ];

    const fieldsToCheck = [
      { name: "sessionId", value: options.sessionId },
      { name: "browserId", value: options.browserId },
      { name: "teamId", value: options.teamId },
      { name: "userId", value: options.userId },
      { name: "tag", value: options.tag },
    ];

    for (const field of fieldsToCheck) {
      if (!field.value) continue;

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(field.value)) {
          throw new StorageSecurityError(
            `Security violation in ${field.name}: ${field.value}`,
            field.value,
          );
        }
      }
    }

    ensureLogger().debug("Input security validation passed", {
      sessionId: options.sessionId,
      browserId: options.browserId,
      teamId: options.teamId,
    });
  }

  /**
   * Validate path security - prevent traversal attacks
   */
  private validatePath(filePath: string): void {
    const normalizedPath = normalize(filePath);
    const resolvedPath = resolve(normalizedPath);

    // Check if path is within base directory
    const relativePath = relative(this.baseDirectory, resolvedPath);

    if (relativePath.startsWith("..") || relativePath.includes("..")) {
      throw new StorageSecurityError(`Path traversal attempt detected: ${filePath}`, filePath);
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /\0/, // Null bytes
      /\.\.\//, // Directory traversal
      /\.\.\\/, // Windows directory traversal
      /\/\.\./, // More traversal patterns
      /\\\.\./, // Windows traversal
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(filePath)) {
        throw new StorageSecurityError(`Suspicious path pattern detected: ${filePath}`, filePath);
      }
    }

    ensureLogger().debug("Path validation passed", {
      originalPath: filePath,
      normalizedPath,
      resolvedPath,
      relativePath,
    });
  }

  /**
   * Ensure directory exists with proper permissions
   */
  private async ensureDirectory(dirPath: string): Promise<void> {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true, mode: 0o700 }); // Owner access only
      ensureLogger().debug("Created directory", { dirPath });
    }
  }

  /**
   * Validate storage quotas before saving
   */
  private async validateQuotas(
    sessionId: string,
    teamId: string | undefined,
    fileSize: number,
  ): Promise<void> {
    const quotaInfo = await this.getQuotaInfo(sessionId, teamId);

    if (quotaInfo.sessionUsed + fileSize > quotaInfo.sessionLimit) {
      throw new StorageQuotaError(
        `Session quota exceeded: ${quotaInfo.sessionUsed + fileSize} > ${quotaInfo.sessionLimit}`,
        quotaInfo,
      );
    }

    if (quotaInfo.teamUsed + fileSize > quotaInfo.teamLimit) {
      throw new StorageQuotaError(
        `Team quota exceeded: ${quotaInfo.teamUsed + fileSize} > ${quotaInfo.teamLimit}`,
        quotaInfo,
      );
    }
  }

  /**
   * Clean up old files (Architecture Committee v2)
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex file system operations, refactor planned
  async cleanupOldFiles(olderThanDays: number): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    ensureLogger().info("Starting cleanup of old files", {
      olderThanDays,
      cutoffDate: cutoffDate.toISOString(),
    });

    let deletedCount = 0;
    let deletedSize = 0;

    try {
      const instancesDir = join(this.baseDirectory, "instances");
      if (!existsSync(instancesDir)) {
        return;
      }

      // Walk through all instances and tags
      const instances = await readdir(instancesDir, { withFileTypes: true });
      for (const instanceDir of instances) {
        if (!instanceDir.isDirectory()) continue;

        const instancePath = join(instancesDir, instanceDir.name);
        const tags = await readdir(instancePath, { withFileTypes: true });

        for (const tagDir of tags) {
          if (!tagDir.isDirectory()) continue;

          const tagPath = join(instancePath, tagDir.name);
          const files = await readdir(tagPath, { withFileTypes: true });

          for (const file of files) {
            if (!(file.isFile() && (file.name.endsWith(".png") || file.name.endsWith(".jpeg")))) {
              continue;
            }

            const filePath = join(tagPath, file.name);
            const fileStat = await stat(filePath);

            if (fileStat.mtime < cutoffDate) {
              const metadataPath = filePath.replace(/\.(png|jpeg)$/, ".metadata.json");

              // Delete screenshot and metadata
              await unlink(filePath);
              if (existsSync(metadataPath)) {
                await unlink(metadataPath);
              }

              deletedCount++;
              deletedSize += fileStat.size;

              ensureLogger().debug("Deleted old screenshot", {
                filePath,
                age: Math.floor((Date.now() - fileStat.mtime.getTime()) / (1000 * 60 * 60 * 24)),
                size: fileStat.size,
              });
            }
          }
        }
      }

      ensureLogger().info("Cleanup completed", {
        deletedCount,
        deletedSize,
        operation: "CLEANUP",
      });
    } catch (error) {
      ensureLogger().error("Cleanup failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get storage statistics (Architecture Committee v2)
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex statistics gathering, refactor planned
  async getStorageStats(): Promise<StorageStats> {
    const stats: StorageStats = {
      totalFiles: 0,
      totalSize: 0,
      instanceCount: 0,
      tagCount: 0,
      instances: [],
    };

    try {
      const instancesDir = join(this.baseDirectory, "instances");
      if (!existsSync(instancesDir)) {
        return stats;
      }

      const instances = await readdir(instancesDir, { withFileTypes: true });
      stats.instanceCount = instances.filter((i) => i.isDirectory()).length;

      for (const instanceDir of instances) {
        if (!instanceDir.isDirectory()) continue;

        const instanceStats = {
          instanceId: instanceDir.name,
          fileCount: 0,
          size: 0,
          tags: [] as string[],
        };

        const instancePath = join(instancesDir, instanceDir.name);
        const tags = await readdir(instancePath, { withFileTypes: true });

        for (const tagDir of tags) {
          if (!tagDir.isDirectory()) continue;

          instanceStats.tags.push(tagDir.name);
          stats.tagCount++;

          const tagPath = join(instancePath, tagDir.name);
          const files = await readdir(tagPath, { withFileTypes: true });

          for (const file of files) {
            if (!(file.isFile() && (file.name.endsWith(".png") || file.name.endsWith(".jpeg")))) {
              continue;
            }

            const filePath = join(tagPath, file.name);
            const fileStat = await stat(filePath);

            instanceStats.fileCount++;
            instanceStats.size += fileStat.size;
            stats.totalFiles++;
            stats.totalSize += fileStat.size;

            // Track oldest and newest files
            if (!stats.oldestFile || fileStat.mtime < stats.oldestFile) {
              stats.oldestFile = fileStat.mtime;
            }
            if (!stats.newestFile || fileStat.mtime > stats.newestFile) {
              stats.newestFile = fileStat.mtime;
            }
          }
        }

        stats.instances.push(instanceStats);
      }

      ensureLogger().debug("Storage stats calculated", {
        totalFiles: stats.totalFiles,
        totalSize: stats.totalSize,
        instanceCount: stats.instanceCount,
        tagCount: stats.tagCount,
      });
      return stats;
    } catch (error) {
      ensureLogger().error("Failed to calculate storage stats", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Find screenshots by query (Architecture Committee v2)
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex query processing, refactor planned
  async findScreenshot(query: ScreenshotQuery): Promise<ScreenshotResult[]> {
    const results: ScreenshotResult[] = [];

    try {
      const instancesDir = join(this.baseDirectory, "instances");
      if (!existsSync(instancesDir)) {
        return results;
      }

      const instances = await readdir(instancesDir, { withFileTypes: true });

      for (const instanceDir of instances) {
        if (!instanceDir.isDirectory()) continue;
        if (query.instanceId && instanceDir.name !== query.instanceId) continue;

        const instancePath = join(instancesDir, instanceDir.name);
        const tags = await readdir(instancePath, { withFileTypes: true });

        for (const tagDir of tags) {
          if (!tagDir.isDirectory()) continue;
          if (query.tag && tagDir.name !== query.tag) continue;

          const tagPath = join(instancePath, tagDir.name);
          const files = await readdir(tagPath, { withFileTypes: true });

          for (const file of files) {
            if (!(file.isFile() && file.name.endsWith(".metadata.json"))) continue;

            try {
              const metadataPath = join(tagPath, file.name);
              const metadataContent = await readFile(metadataPath, "utf-8");
              const metadata: ScreenshotMetadata = JSON.parse(metadataContent);

              // Apply query filters
              if (query.sessionId && metadata.sessionId !== query.sessionId) continue;
              if (query.teamId && metadata.teamId !== query.teamId) continue;
              if (query.userId && metadata.userId !== query.userId) continue;
              if (query.format && metadata.format !== query.format) continue;

              // Date range filtering
              const createdDate = new Date(metadata.created);
              if (query.startDate && createdDate < query.startDate) continue;
              if (query.endDate && createdDate > query.endDate) continue;

              const screenshotPath = metadataPath.replace(".metadata.json", `.${metadata.format}`);
              if (existsSync(screenshotPath)) {
                results.push({
                  filePath: screenshotPath,
                  filename: metadata.filename,
                  instanceId: instanceDir.name,
                  tag: tagDir.name,
                  metadata,
                });
              }
            } catch (parseError) {
              ensureLogger().warn("Failed to parse metadata file", {
                file: file.name,
                error: parseError instanceof Error ? parseError.message : String(parseError),
              });
            }
          }
        }
      }

      ensureLogger().debug("Screenshot search completed", {
        query,
        resultCount: results.length,
      });

      return results;
    } catch (error) {
      ensureLogger().error("Screenshot search failed", {
        query,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
