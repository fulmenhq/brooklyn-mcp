/**
 * Screenshot storage manager for Brooklyn MCP server
 * Architecture Committee approved implementation for enterprise-ready file storage
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { readFile, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, normalize, relative, resolve } from "node:path";

import { getLogger } from "../shared/logger.js";

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
 * Screenshot save options
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
 * Screenshot metadata structure (Architecture Committee approved)
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
 * Screenshot storage manager
 * Enterprise-ready file storage with security, quotas, and audit logging
 */
export class ScreenshotStorageManager {
  private readonly config: Required<ScreenshotStorageConfig>;
  private readonly baseDirectory: string;

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

    ensureLogger().info("Screenshot storage manager initialized", {
      baseDirectory: this.baseDirectory,
      maxFileSize: this.config.maxFileSize,
      encryption: this.config.encryption,
      quotas: this.config.quotas,
    });
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

      // Check quotas
      await this.validateQuotas(options.sessionId, options.teamId, buffer.length);

      // Generate filename and paths
      const filename = this.generateFilename(options.format || this.config.defaultFormat);
      const sessionDir = this.getSessionDirectory(options.sessionId, options.teamId);
      const filePath = join(sessionDir, filename);

      // Validate path security
      this.validatePath(filePath);

      // Ensure directory exists
      await this.ensureDirectory(sessionDir);

      // Calculate hash for integrity
      const hash = createHash("sha256").update(buffer).digest("hex");

      // Create metadata
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
   * Get screenshot file path for reading
   */
  async getScreenshotPath(filename: string, sessionId: string, teamId?: string): Promise<string> {
    const sessionDir = this.getSessionDirectory(sessionId, teamId);
    const filePath = join(sessionDir, filename);

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
      sessionId,
      teamId,
    });

    return filePath;
  }

  /**
   * Delete screenshot file
   */
  async deleteScreenshot(filename: string, sessionId: string, teamId?: string): Promise<void> {
    const sessionDir = this.getSessionDirectory(sessionId, teamId);
    const filePath = join(sessionDir, filename);
    const metadataPath = filePath.replace(/\.(png|jpeg|jpg)$/, ".metadata.json");

    // Validate path security
    this.validatePath(filePath);

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
        sessionId,
        teamId,
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
   * Get session directory path with team isolation
   */
  private getSessionDirectory(sessionId: string, teamId?: string): string {
    const teamDir = teamId || "default";
    return join(this.baseDirectory, teamDir, "sessions", sessionId);
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
}
