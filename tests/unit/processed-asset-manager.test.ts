/**
 * ProcessedAssetManager Unit Tests
 *
 * Tests task-based asset management system for image processing results
 * without requiring external dependencies or network access.
 */

import { existsSync, rmSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AssetTaskMetadata,
  ProcessedAssetManager,
  type PurgeOptions,
  type SaveAssetOptions,
} from "../../src/core/image/processed-asset-manager.js";

// Mock the logger to prevent dependency issues
vi.mock("../../src/shared/pino-logger.js", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe("ProcessedAssetManager", () => {
  let assetManager: ProcessedAssetManager;
  let testBaseDir: string;
  let testBuffer: Buffer;

  beforeEach(() => {
    // Use temporary directory for tests
    testBaseDir = join(tmpdir(), `brooklyn-assets-test-${Date.now()}`);

    assetManager = new ProcessedAssetManager({
      baseDirectory: testBaseDir,
      maxFileSize: 5 * 1024 * 1024, // 5MB for tests
      maxTaskSize: 20 * 1024 * 1024, // 20MB for tests
      defaultRetentionDays: 7,
      quotas: {
        teamLimit: 100 * 1024 * 1024, // 100MB team limit
        taskLimit: 10 * 1024 * 1024, // 10MB task limit
      },
    });

    // Create test buffer (simulated processed asset)
    testBuffer = Buffer.from("processed-image-data-for-testing");
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testBaseDir)) {
      rmSync(testBaseDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  describe("generateTaskId", () => {
    it("should generate task ID from source filename", () => {
      const taskId = assetManager.generateTaskId("logo.svg");

      expect(taskId).toMatch(/^logo-\d{4}-\d{2}-\d{2}$/);
    });

    it("should sanitize user-provided task ID", () => {
      const taskId = assetManager.generateTaskId(undefined, "My Complex Task@#$%");

      expect(taskId).toBe("my-complex-task----");
    });

    it("should generate fallback task ID when no filename provided", () => {
      const taskId = assetManager.generateTaskId();

      expect(taskId).toMatch(/^task-\d+-[a-f0-9-]+$/);
    });

    it("should extract basename without extension", () => {
      const taskId = assetManager.generateTaskId("/path/to/complex-logo-design.svg");

      expect(taskId).toMatch(/^complex-logo-design-\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("saveAsset", () => {
    it("should save asset successfully with all metadata", async () => {
      const options: SaveAssetOptions = {
        teamId: "test-team",
        userId: "user-123",
        sessionId: "session-456",
        sourceFileName: "logo.svg",
        processingType: "compressed",
      };

      const result = await assetManager.saveAsset(testBuffer, "compressed.svg", options);

      expect(result.success).toBe(true);
      expect(result.taskId).toBeDefined();
      expect(result.assetPath).toContain("compressed.svg");

      // Verify file was created
      const fullPath = join(testBaseDir, result.assetPath);
      expect(existsSync(fullPath)).toBe(true);

      // Verify file content
      const savedContent = await readFile(fullPath);
      expect(savedContent.equals(testBuffer)).toBe(true);

      // Verify metadata was created
      const metadataPath = join(testBaseDir, "test-team", result.taskId, "metadata.json");
      expect(existsSync(metadataPath)).toBe(true);

      const metadataContent = await readFile(metadataPath, "utf-8");
      const metadata: AssetTaskMetadata = JSON.parse(metadataContent);

      expect(metadata).toMatchObject({
        taskId: result.taskId,
        teamId: "test-team",
        userId: "user-123",
        sessionId: "session-456",
        sourceFile: {
          name: "logo.svg",
          size: testBuffer.length,
        },
        assets: [
          {
            name: "compressed.svg",
            type: "svg",
            size: testBuffer.length,
            processingType: "compressed",
          },
        ],
        totalSize: testBuffer.length,
      });
    });

    it("should handle multiple assets in same task", async () => {
      const taskId = "multi-asset-test";
      const options: SaveAssetOptions = {
        taskId,
        teamId: "test-team",
        sourceFileName: "logo.svg",
        processingType: "source",
      };

      // Save first asset
      const result1 = await assetManager.saveAsset(testBuffer, "source.svg", options);
      expect(result1.success).toBe(true);

      // Save second asset to same task
      const compressedBuffer = Buffer.from("compressed-version");
      const result2 = await assetManager.saveAsset(compressedBuffer, "compressed.svg", {
        ...options,
        processingType: "compressed",
        overwrite: false,
      });
      expect(result2.success).toBe(true);
      expect(result2.taskId).toBe(taskId);

      // Verify metadata includes both assets
      const metadataPath = join(testBaseDir, "test-team", taskId, "metadata.json");
      const metadataContent = await readFile(metadataPath, "utf-8");
      const metadata: AssetTaskMetadata = JSON.parse(metadataContent);

      expect(metadata.assets).toHaveLength(2);
      expect(metadata.totalSize).toBe(testBuffer.length + compressedBuffer.length);
      expect(metadata.assets[0]?.name).toBe("source.svg");
      expect(metadata.assets[1]?.name).toBe("compressed.svg");
    });

    it("should update existing asset when overwrite is true", async () => {
      const taskId = "overwrite-test";
      const options: SaveAssetOptions = {
        taskId,
        teamId: "test-team",
        sourceFileName: "logo.svg",
        processingType: "compressed",
      };

      // Save initial asset
      await assetManager.saveAsset(testBuffer, "logo.svg", options);

      // Save updated version with overwrite
      const updatedBuffer = Buffer.from("updated-compressed-content");
      const result = await assetManager.saveAsset(updatedBuffer, "logo.svg", {
        ...options,
        overwrite: true,
      });

      expect(result.success).toBe(true);

      // Verify file was updated
      const fullPath = join(testBaseDir, result.assetPath);
      const savedContent = await readFile(fullPath);
      expect(savedContent.equals(updatedBuffer)).toBe(true);

      // Verify metadata was updated
      const metadataPath = join(testBaseDir, "test-team", taskId, "metadata.json");
      const metadataContent = await readFile(metadataPath, "utf-8");
      const metadata: AssetTaskMetadata = JSON.parse(metadataContent);

      expect(metadata.assets).toHaveLength(1);
      expect(metadata.assets[0]?.size).toBe(updatedBuffer.length);
      expect(metadata.totalSize).toBe(updatedBuffer.length);
    });

    it("should reject files exceeding size limit", async () => {
      const largeBuffer = Buffer.alloc(10 * 1024 * 1024); // 10MB > 5MB limit

      const result = await assetManager.saveAsset(largeBuffer, "large.png", {
        teamId: "test-team",
        sourceFileName: "large.png",
        processingType: "converted",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("exceeds limit");
    });

    it("should reject duplicate files when overwrite is false", async () => {
      const taskId = "duplicate-test";
      const options: SaveAssetOptions = {
        taskId,
        teamId: "test-team",
        sourceFileName: "logo.svg",
        processingType: "compressed",
      };

      // Save initial asset
      const result1 = await assetManager.saveAsset(testBuffer, "logo.svg", options);
      expect(result1.success).toBe(true);

      // Try to save same filename without overwrite
      const result2 = await assetManager.saveAsset(testBuffer, "logo.svg", {
        ...options,
        overwrite: false,
      });

      expect(result2.success).toBe(false);
      expect(result2.error).toContain("already exists");
    });

    it("should correctly determine asset types", async () => {
      const testCases = [
        { fileName: "test.svg", expectedType: "svg" },
        { fileName: "test.png", expectedType: "png" },
        { fileName: "test.jpg", expectedType: "jpeg" },
        { fileName: "test.jpeg", expectedType: "jpeg" },
        { fileName: "test.webp", expectedType: "webp" },
        { fileName: "test.unknown", expectedType: "png" }, // fallback
      ];

      for (const testCase of testCases) {
        const result = await assetManager.saveAsset(testBuffer, testCase.fileName, {
          taskId: `type-test-${testCase.expectedType}`,
          teamId: "test-team",
          sourceFileName: "source.svg",
          processingType: "converted",
        });

        expect(result.success).toBe(true);

        const metadataPath = join(testBaseDir, "test-team", result.taskId, "metadata.json");
        const metadataContent = await readFile(metadataPath, "utf-8");
        const metadata: AssetTaskMetadata = JSON.parse(metadataContent);

        expect(metadata.assets[0]?.type).toBe(testCase.expectedType);
      }
    });
  });

  describe("listAssets", () => {
    beforeEach(async () => {
      // Create test assets in different teams and tasks
      const testData = [
        {
          taskId: "task-1",
          teamId: "team-a",
          fileName: "image1.png",
          processingType: "converted" as const,
        },
        {
          taskId: "task-2",
          teamId: "team-a",
          fileName: "image2.svg",
          processingType: "compressed" as const,
        },
        {
          taskId: "task-3",
          teamId: "team-b",
          fileName: "image3.jpg",
          processingType: "source" as const,
        },
      ];

      for (const data of testData) {
        await assetManager.saveAsset(testBuffer, data.fileName, {
          taskId: data.taskId,
          teamId: data.teamId,
          sourceFileName: data.fileName,
          processingType: data.processingType,
        });
      }
    });

    it("should list all assets for a team", async () => {
      const result = await assetManager.listAssets({ teamId: "team-a" });

      expect(result.success).toBe(true);
      expect(result.tasks).toHaveLength(2);
      expect(result.totalTasks).toBe(2);

      const taskIds = result.tasks.map((t) => t.taskId);
      expect(taskIds).toContain("task-1");
      expect(taskIds).toContain("task-2");
    });

    it("should filter assets by specific task ID", async () => {
      const result = await assetManager.listAssets({
        teamId: "team-a",
        taskId: "task-1",
      });

      expect(result.success).toBe(true);
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0]?.taskId).toBe("task-1");
    });

    it("should filter assets by glob pattern", async () => {
      const result = await assetManager.listAssets({
        teamId: "team-a",
        pattern: "task-*",
      });

      expect(result.success).toBe(true);
      expect(result.tasks).toHaveLength(2);
    });

    it("should handle empty team directory", async () => {
      const result = await assetManager.listAssets({ teamId: "non-existent-team" });

      expect(result.success).toBe(true);
      expect(result.tasks).toHaveLength(0);
      expect(result.totalTasks).toBe(0);
    });

    it("should sort assets by creation date", async () => {
      const result = await assetManager.listAssets({
        teamId: "team-a",
        sortBy: "created",
        sortDirection: "asc",
      });

      expect(result.success).toBe(true);
      expect(result.tasks).toHaveLength(2);

      // Should be sorted by creation date (ascending)
      const dates = result.tasks.map((t) => new Date(t.createdAt).getTime());
      expect(dates[0]).toBeLessThanOrEqual(dates[1] || 0);
    });

    it("should sort assets by size descending", async () => {
      // Add different sized asset to create variation
      const largerBuffer = Buffer.from("larger-content-for-size-test");
      await assetManager.saveAsset(largerBuffer, "large.png", {
        taskId: "large-task",
        teamId: "team-a",
        sourceFileName: "large.png",
        processingType: "converted",
      });

      const result = await assetManager.listAssets({
        teamId: "team-a",
        sortBy: "size",
        sortDirection: "desc",
      });

      expect(result.success).toBe(true);
      expect(result.tasks).toHaveLength(3);

      // Should be sorted by size (descending)
      const sizes = result.tasks.map((t) => t.totalSize);
      expect(sizes[0]).toBeGreaterThanOrEqual(sizes[1] || 0);
    });

    it("should apply pagination correctly", async () => {
      const result = await assetManager.listAssets({
        teamId: "team-a",
        limit: 1,
        offset: 0,
      });

      expect(result.success).toBe(true);
      expect(result.tasks).toHaveLength(1);
      expect(result.totalTasks).toBe(2); // Total should still be 2

      const result2 = await assetManager.listAssets({
        teamId: "team-a",
        limit: 1,
        offset: 1,
      });

      expect(result2.success).toBe(true);
      expect(result2.tasks).toHaveLength(1);
      expect(result2.totalTasks).toBe(2);

      // Should be different tasks
      expect(result.tasks[0]?.taskId).not.toBe(result2.tasks[0]?.taskId);
    });

    it("should require team ID", async () => {
      const result = await assetManager.listAssets({});

      expect(result.success).toBe(false);
      expect(result.error).toContain("Team ID is required");
    });
  });

  describe("getAsset", () => {
    let taskId: string;
    const teamId = "test-team";

    beforeEach(async () => {
      const result = await assetManager.saveAsset(testBuffer, "test.png", {
        teamId,
        sourceFileName: "original.png",
        processingType: "converted",
      });
      taskId = result.taskId;
    });

    it("should retrieve asset buffer and metadata", async () => {
      const result = await assetManager.getAsset(teamId, taskId, "test.png");

      expect(result.success).toBe(true);
      expect(result.buffer?.equals(testBuffer)).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.taskId).toBe(taskId);
      expect(result.metadata?.assets[0]?.name).toBe("test.png");
    });

    it("should handle non-existent asset", async () => {
      const result = await assetManager.getAsset(teamId, taskId, "non-existent.png");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should handle non-existent task", async () => {
      const result = await assetManager.getAsset(teamId, "non-existent-task", "test.png");

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should handle corrupted metadata gracefully", async () => {
      // Corrupt the metadata file
      const metadataPath = join(testBaseDir, teamId, taskId, "metadata.json");
      await readFile(metadataPath); // Ensure it exists first

      // Write invalid JSON
      const fs = await import("node:fs/promises");
      await fs.writeFile(metadataPath, "{ invalid json ");

      const result = await assetManager.getAsset(teamId, taskId, "test.png");

      expect(result.success).toBe(true);
      expect(result.buffer?.equals(testBuffer)).toBe(true);
      expect(result.metadata).toBeUndefined(); // Metadata should be undefined due to parse error
    });
  });

  describe("purgeAssets", () => {
    beforeEach(async () => {
      // Create multiple tasks with different ages
      const now = Date.now();
      const tasksData = [
        { taskId: "old-task-1", age: now - 8 * 24 * 60 * 60 * 1000 }, // 8 days old
        { taskId: "old-task-2", age: now - 5 * 24 * 60 * 60 * 1000 }, // 5 days old
        { taskId: "new-task-1", age: now - 1 * 24 * 60 * 60 * 1000 }, // 1 day old
        { taskId: "new-task-2", age: now - 2 * 60 * 60 * 1000 }, // 2 hours old
      ];

      for (const data of tasksData) {
        await assetManager.saveAsset(testBuffer, "test.png", {
          taskId: data.taskId,
          teamId: "purge-test-team",
          sourceFileName: "test.png",
          processingType: "converted",
        });
      }
    });

    it("should perform dry run without deleting files", async () => {
      const options: PurgeOptions = {
        pattern: "*",
        strategy: "complete",
        teamId: "purge-test-team",
        dryRun: true,
      };

      const result = await assetManager.purgeAssets(options);

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.tasksAffected).toHaveLength(4);
      expect(result.filesDeleted).toBe(8); // 4 tasks × (1 asset + 1 metadata)
      expect(result.bytesFreed).toBeGreaterThan(0);

      // Verify files still exist
      const listResult = await assetManager.listAssets({ teamId: "purge-test-team" });
      expect(listResult.tasks).toHaveLength(4);
    });

    it("should purge all assets with complete strategy", async () => {
      const options: PurgeOptions = {
        pattern: "*",
        strategy: "complete",
        teamId: "purge-test-team",
        dryRun: false,
      };

      const result = await assetManager.purgeAssets(options);

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(false);
      expect(result.tasksAffected).toHaveLength(4);

      // Verify files were deleted
      const listResult = await assetManager.listAssets({ teamId: "purge-test-team" });
      expect(listResult.tasks).toHaveLength(0);
    });

    it("should purge assets older than specified duration", async () => {
      // Create additional task with old metadata timestamp to ensure age filtering works
      const fs = await import("node:fs/promises");
      const metadataPath = join(testBaseDir, "purge-test-team", "old-task-1", "metadata.json");
      const metadataContent = await fs.readFile(metadataPath, "utf-8");
      const metadata = JSON.parse(metadataContent);

      // Set lastModified to 5 days ago
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      metadata.lastModified = fiveDaysAgo.toISOString();
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

      const options: PurgeOptions = {
        pattern: "*",
        strategy: "age-based",
        teamId: "purge-test-team",
        olderThan: "3d", // 3 days
        dryRun: false,
      };

      const result = await assetManager.purgeAssets(options);

      expect(result.success).toBe(true);
      expect(result.tasksAffected.length).toBeGreaterThanOrEqual(1); // At least old-task-1 should be deleted
    });

    it("should keep specified number of newest tasks with partial strategy", async () => {
      const options: PurgeOptions = {
        pattern: "*",
        strategy: "partial",
        teamId: "purge-test-team",
        keepLast: 2,
        dryRun: false,
      };

      const result = await assetManager.purgeAssets(options);

      expect(result.success).toBe(true);
      expect(result.tasksAffected).toHaveLength(2); // Should delete 2 oldest tasks

      // Verify newest 2 tasks remain
      const listResult = await assetManager.listAssets({ teamId: "purge-test-team" });
      expect(listResult.tasks).toHaveLength(2);
    });

    it("should filter by pattern", async () => {
      const options: PurgeOptions = {
        pattern: "old-*",
        strategy: "complete",
        teamId: "purge-test-team",
        dryRun: false,
      };

      const result = await assetManager.purgeAssets(options);

      expect(result.success).toBe(true);
      expect(result.tasksAffected).toHaveLength(2); // Only old-task-1 and old-task-2

      // Verify new tasks remain
      const listResult = await assetManager.listAssets({ teamId: "purge-test-team" });
      expect(listResult.tasks).toHaveLength(2);

      const remainingTaskIds = listResult.tasks.map((t) => t.taskId);
      expect(remainingTaskIds).toContain("new-task-1");
      expect(remainingTaskIds).toContain("new-task-2");
    });

    it("should handle invalid duration format", async () => {
      const options: PurgeOptions = {
        pattern: "*",
        strategy: "age-based",
        teamId: "purge-test-team",
        olderThan: "invalid-duration",
        dryRun: true,
      };

      const result = await assetManager.purgeAssets(options);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.error).toContain("Invalid duration format");
    });

    it("should handle team with no tasks", async () => {
      const options: PurgeOptions = {
        pattern: "*",
        strategy: "complete",
        teamId: "empty-team",
        dryRun: false,
      };

      const result = await assetManager.purgeAssets(options);

      expect(result.success).toBe(true);
      expect(result.tasksAffected).toHaveLength(0);
      expect(result.filesDeleted).toBe(0);
      expect(result.bytesFreed).toBe(0);
    });
  });

  describe("getStorageStats", () => {
    beforeEach(async () => {
      // Create test assets with varying sizes
      const testData = [
        { taskId: "stats-task-1", buffer: Buffer.from("small"), fileName: "small.png" },
        { taskId: "stats-task-2", buffer: Buffer.from("medium-content"), fileName: "medium.svg" },
        {
          taskId: "stats-task-3",
          buffer: Buffer.from("larger-content-for-stats"),
          fileName: "large.jpg",
        },
      ];

      for (const data of testData) {
        await assetManager.saveAsset(data.buffer, data.fileName, {
          taskId: data.taskId,
          teamId: "stats-team",
          sourceFileName: data.fileName,
          processingType: "converted",
        });
      }
    });

    it("should calculate storage statistics correctly", async () => {
      const stats = await assetManager.getStorageStats("stats-team");

      expect(stats.totalTasks).toBe(3);
      expect(stats.totalFiles).toBe(3);
      expect(stats.totalBytes).toBeGreaterThan(0);
      expect(stats.oldestTask).toBeDefined();
      expect(stats.newestTask).toBeDefined();
    });

    it("should handle empty team", async () => {
      const stats = await assetManager.getStorageStats("empty-team");

      expect(stats.totalTasks).toBe(0);
      expect(stats.totalFiles).toBe(0);
      expect(stats.totalBytes).toBe(0);
      expect(stats.oldestTask).toBeNull();
      expect(stats.newestTask).toBeNull();
    });

    it("should identify oldest and newest tasks correctly", async () => {
      const stats = await assetManager.getStorageStats("stats-team");

      expect(stats.oldestTask).toBe("stats-task-1");
      expect(stats.newestTask).toBe("stats-task-3");
    });
  });

  describe("error handling and edge cases", () => {
    it("should handle file system errors gracefully", async () => {
      // Test with empty filename which should cause an error
      const result = await assetManager.saveAsset(testBuffer, "", {
        teamId: "test-team",
        sourceFileName: "test.png",
        processingType: "converted",
      });

      // Should handle the error gracefully
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should validate duration parsing", () => {
      const testCases = [
        { input: "7d", expected: 7 * 24 * 60 * 60 * 1000 },
        { input: "24h", expected: 24 * 60 * 60 * 1000 },
        { input: "30m", expected: 30 * 60 * 1000 },
      ];

      const manager = assetManager as any; // Access private method for testing

      for (const testCase of testCases) {
        const result = manager.parseDuration(testCase.input);
        expect(result).toBe(testCase.expected);
      }
    });

    it("should reject invalid duration formats", () => {
      const manager = assetManager as any; // Access private method for testing

      expect(() => manager.parseDuration("invalid")).toThrow("Invalid duration format");
      expect(() => manager.parseDuration("7x")).toThrow("Invalid duration format");
      expect(() => manager.parseDuration("")).toThrow("Invalid duration format");
    });

    it("should handle concurrent save operations", async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        assetManager.saveAsset(testBuffer, `concurrent-${i}.png`, {
          teamId: "concurrent-team",
          sourceFileName: `source-${i}.png`,
          processingType: "converted",
        }),
      );

      const results = await Promise.all(promises);

      // All should succeed
      expect(results.every((r) => r.success)).toBe(true);

      // All should have different task IDs
      const taskIds = results.map((r) => r.taskId);
      const uniqueTaskIds = new Set(taskIds);
      expect(uniqueTaskIds.size).toBe(taskIds.length);
    });

    it("should create base directory if it doesn't exist", () => {
      const newBaseDir = join(tmpdir(), `new-asset-dir-${Date.now()}`);

      const _newManager = new ProcessedAssetManager({
        baseDirectory: newBaseDir,
      });

      // Directory should be created during construction
      expect(existsSync(newBaseDir)).toBe(true);

      // Clean up
      rmSync(newBaseDir, { recursive: true, force: true });
    });
  });
});
