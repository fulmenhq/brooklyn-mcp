/**
 * Unit tests for ScreenshotStorageManager
 * Architecture Committee approved file storage implementation
 */

import { existsSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDatabaseManager } from "../../src/core/database/database-manager.js";
import { ScreenshotRepositoryOptimized as ScreenshotRepository } from "../../src/core/database/repositories/screenshot-repository-optimized.js";
import {
  type ScreenshotMetadata,
  ScreenshotStorageManager,
  StorageQuotaError,
  StorageSecurityError,
} from "../../src/core/screenshot-storage-manager.js";

describe("ScreenshotStorageManager", () => {
  let storageManager: ScreenshotStorageManager;
  let testBaseDir: string;
  let testBuffer: Buffer;

  beforeEach(() => {
    // Use temporary directory for tests
    testBaseDir = join(tmpdir(), `brooklyn-test-${Date.now()}`);

    storageManager = new ScreenshotStorageManager({
      baseDirectory: testBaseDir,
      maxFileSize: 10 * 1024 * 1024, // 10MB for tests
      encryption: false, // Wave 1: No encryption
      quotas: {
        sessionLimit: 50 * 1024 * 1024, // 50MB session limit
        teamLimit: 100 * 1024 * 1024, // 100MB team limit
      },
    });

    // Create test buffer (simulated PNG screenshot)
    testBuffer = Buffer.from("fake-png-data-for-testing");
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testBaseDir)) {
      rmSync(testBaseDir, { recursive: true, force: true });
    }
    vi.clearAllMocks();
  });

  describe("saveScreenshot", () => {
    it("should save screenshot with basic options", async () => {
      const result = await storageManager.saveScreenshot(
        testBuffer,
        { width: 1920, height: 1080 },
        {
          sessionId: "test-session-1",
          browserId: "browser-123",
          teamId: "test-team",
        },
      );

      // Verify result structure (Architecture Committee v2)
      expect(result).toMatchObject({
        filePath: expect.stringContaining("instances/"),
        filename: expect.stringMatching(/^screenshot-.*\.png$/),
        auditId: expect.any(String),
        fileSize: testBuffer.length,
        format: "png",
        hash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      });

      // Verify new structure: instances/{instanceId}/{tag}/
      expect(result.filePath).toMatch(/instances\/[a-z0-9-]+\/[a-z0-9-]+\/screenshot-.*\.png$/);
      expect(result.metadata.instanceId).toBeDefined();
      expect(result.metadata.tag).toBeDefined();

      // Verify file was created
      expect(existsSync(result.filePath)).toBe(true);

      // Verify file content
      const savedContent = await readFile(result.filePath);
      expect(savedContent.equals(testBuffer)).toBe(true);

      // Verify metadata file was created
      const metadataPath = result.filePath.replace(/\.png$/, ".metadata.json");
      expect(existsSync(metadataPath)).toBe(true);

      const metadataContent = await readFile(metadataPath, "utf-8");
      const metadata: ScreenshotMetadata = JSON.parse(metadataContent);

      expect(metadata).toMatchObject({
        sessionId: "test-session-1",
        browserId: "browser-123",
        teamId: "test-team",
        format: "png",
        fileSize: testBuffer.length,
        auditId: result.auditId,
        instanceId: expect.any(String),
        tag: expect.any(String),
        options: {
          encrypted: false, // Wave 1: No encryption
        },
      });
    });

    it("should save JPEG screenshot with quality setting", async () => {
      const result = await storageManager.saveScreenshot(
        testBuffer,
        { width: 1280, height: 720 },
        {
          sessionId: "jpeg-session",
          browserId: "browser-456",
          format: "jpeg",
          quality: 95,
          fullPage: true,
        },
      );

      expect(result.format).toBe("jpeg");
      expect(result.filename).toMatch(/\.jpeg$/);
      expect(result.metadata.options.quality).toBe(95);
      expect(result.metadata.options.fullPage).toBe(true);
      expect(result.metadata.instanceId).toBeDefined();
      expect(result.metadata.tag).toBeDefined();
    });

    it("should generate unique filenames for concurrent saves", async () => {
      const savePromises = Array.from({ length: 5 }, (_, i) =>
        storageManager.saveScreenshot(
          testBuffer,
          { width: 800, height: 600 },
          {
            sessionId: "concurrent-session",
            browserId: `browser-${i}`,
          },
        ),
      );

      const results = await Promise.all(savePromises);
      const filenames = results.map((r) => r.filename);

      // All filenames should be unique
      const uniqueFilenames = new Set(filenames);
      expect(uniqueFilenames.size).toBe(filenames.length);

      // All should follow the pattern
      for (const filename of filenames) {
        expect(filename).toMatch(
          /^screenshot-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-[a-f0-9-]+\.png$/,
        );
      }
    });

    it("should create instance and tag isolation directories", async () => {
      const result1 = await storageManager.saveScreenshot(
        testBuffer,
        { width: 1920, height: 1080 },
        {
          sessionId: "isolation-session",
          browserId: "browser-789",
          teamId: "team-test",
          tag: "integration-test",
        },
      );

      const result2 = await storageManager.saveScreenshot(
        testBuffer,
        { width: 1920, height: 1080 },
        {
          sessionId: "isolation-session",
          browserId: "browser-789",
          teamId: "team-beta",
          tag: "beta-test",
        },
      );

      // Verify separate instance and tag directories exist
      expect(result1.filePath).toContain("instances/");
      expect(result1.filePath).toContain("integration-test");
      expect(result2.filePath).toContain("instances/");
      expect(result2.filePath).toContain("beta-test");

      expect(existsSync(result1.filePath)).toBe(true);
      expect(existsSync(result2.filePath)).toBe(true);
    });

    it("should auto-generate tag when no tag provided", async () => {
      const result = await storageManager.saveScreenshot(
        testBuffer,
        { width: 1920, height: 1080 },
        {
          sessionId: "default-session",
          browserId: "browser-default",
        },
      );

      // Should use instance-based directory with auto-generated tag
      expect(result.filePath).toContain("instances/");
      expect(result.metadata.tag).toMatch(/^[a-z]+-[a-z]+-[a-z]+$/); // Three-word slug pattern
      expect(result.metadata.instanceId).toBeDefined();
    });

    it("should reject files exceeding size limit", async () => {
      const largeBuffer = Buffer.alloc(20 * 1024 * 1024); // 20MB > 10MB limit

      await expect(
        storageManager.saveScreenshot(
          largeBuffer,
          { width: 1920, height: 1080 },
          {
            sessionId: "size-test",
            browserId: "browser-size",
          },
        ),
      ).rejects.toThrow(StorageQuotaError);
    });
  });

  describe("security path validation", () => {
    it("should prevent path traversal attacks in sessionId", async () => {
      // Security validation now happens on input parameters (Architecture Committee v2)
      await expect(
        storageManager.saveScreenshot(
          testBuffer,
          { width: 1920, height: 1080 },
          {
            sessionId: "../../../malicious-session",
            browserId: "malicious-browser",
          },
        ),
      ).rejects.toThrow(StorageSecurityError);
    });

    it("should reject paths with null bytes in sessionId", async () => {
      await expect(
        storageManager.saveScreenshot(
          testBuffer,
          { width: 1920, height: 1080 },
          {
            sessionId: "session\0malicious",
            browserId: "null-browser",
          },
        ),
      ).rejects.toThrow(StorageSecurityError);
    });

    it("should reject Windows-style traversal in teamId", async () => {
      await expect(
        storageManager.saveScreenshot(
          testBuffer,
          { width: 1920, height: 1080 },
          {
            sessionId: "windows-session",
            browserId: "windows-browser",
            teamId: "..\\..\\windows\\malicious",
          },
        ),
      ).rejects.toThrow(StorageSecurityError);
    });

    it("should allow valid input parameters", async () => {
      // This should not throw any security errors
      const result = await storageManager.saveScreenshot(
        testBuffer,
        { width: 1920, height: 1080 },
        {
          sessionId: "valid-session",
          browserId: "valid-browser",
          teamId: "valid-team",
          tag: "valid-tag-123",
        },
      );

      // Verify the file was created successfully
      expect(existsSync(result.filePath)).toBe(true);
      expect(result.metadata.sessionId).toBe("valid-session");
      expect(result.metadata.tag).toBe("valid-tag-123");
    });
  });

  describe("file operations", () => {
    it("should delete screenshot and metadata files", async () => {
      const result = await storageManager.saveScreenshot(
        testBuffer,
        { width: 1920, height: 1080 },
        {
          sessionId: "delete-session",
          browserId: "delete-browser",
          teamId: "delete-team",
        },
      );

      // Verify files exist
      const metadataPath = result.filePath.replace(/\.png$/, ".metadata.json");
      expect(existsSync(result.filePath)).toBe(true);
      expect(existsSync(metadataPath)).toBe(true);

      // Delete screenshot using new API (Architecture Committee v2)
      await storageManager.deleteScreenshot(
        result.filename,
        result.metadata.instanceId,
        result.metadata.tag,
      );

      // Verify files are deleted
      expect(existsSync(result.filePath)).toBe(false);
      expect(existsSync(metadataPath)).toBe(false);
    });

    it("should handle deletion of non-existent files gracefully", async () => {
      // Should throw error for non-existent files (Architecture Committee v2)
      await expect(storageManager.deleteScreenshot("non-existent.png")).rejects.toThrow(
        "Screenshot file not found",
      );
    });

    it("should return correct file path for existing screenshots", async () => {
      const result = await storageManager.saveScreenshot(
        testBuffer,
        { width: 1920, height: 1080 },
        {
          sessionId: "path-session",
          browserId: "path-browser",
          teamId: "path-team",
        },
      );

      const retrievedPath = await storageManager.getScreenshotPath(
        result.filename,
        result.metadata.instanceId,
        result.metadata.tag,
      );

      expect(retrievedPath).toBe(result.filePath);
    });

    it("should throw error for non-existent screenshot files", async () => {
      await expect(storageManager.getScreenshotPath("non-existent-screenshot.png")).rejects.toThrow(
        "Screenshot file not found",
      );
    });
  });

  describe("quota management", () => {
    it("should return quota information", async () => {
      const quotaInfo = await storageManager.getQuotaInfo("test-session", "test-team");

      expect(quotaInfo).toMatchObject({
        sessionUsed: expect.any(Number),
        sessionLimit: 50 * 1024 * 1024, // 50MB as configured
        teamUsed: expect.any(Number),
        teamLimit: 100 * 1024 * 1024, // 100MB as configured
        available: expect.any(Number),
      });
    });
  });

  describe("session cleanup", () => {
    it("should clean up session directory", async () => {
      // Create some screenshots
      await storageManager.saveScreenshot(
        testBuffer,
        { width: 1920, height: 1080 },
        {
          sessionId: "cleanup-session",
          browserId: "cleanup-browser",
          teamId: "cleanup-team",
        },
      );

      // Cleanup should not throw (implementation is placeholder for Wave 1)
      await expect(
        storageManager.cleanupSession("cleanup-session", "cleanup-team"),
      ).resolves.not.toThrow();
    });
  });

  describe("error handling", () => {
    it("should provide meaningful error messages", async () => {
      const largeBuffer = Buffer.alloc(20 * 1024 * 1024); // Too large

      try {
        await storageManager.saveScreenshot(
          largeBuffer,
          { width: 1920, height: 1080 },
          {
            sessionId: "error-session",
            browserId: "error-browser",
          },
        );
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(StorageQuotaError);
        expect((error as StorageQuotaError).message).toContain("exceeds maximum");
      }
    });

    it("should include context in security errors", async () => {
      try {
        await storageManager.saveScreenshot(
          testBuffer,
          { width: 1920, height: 1080 },
          {
            sessionId: "security-session",
            browserId: "security-browser",
            teamId: "../../../malicious-team",
          },
        );
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(StorageSecurityError);
        expect((error as StorageSecurityError).message).toContain("Security violation in teamId");
        expect((error as StorageSecurityError).path).toBeDefined();
      }
    });
  });

  describe("metadata generation", () => {
    it("should include all required metadata fields", async () => {
      const result = await storageManager.saveScreenshot(
        testBuffer,
        { width: 1920, height: 1080 },
        {
          sessionId: "metadata-session",
          browserId: "metadata-browser",
          teamId: "metadata-team",
          userId: "user-123",
          format: "jpeg",
          quality: 85,
          fullPage: true,
        },
      );

      const metadata = result.metadata;

      expect(metadata).toMatchObject({
        sessionId: "metadata-session",
        browserId: "metadata-browser",
        teamId: "metadata-team",
        userId: "user-123",
        timestamp: expect.any(String),
        filename: expect.stringMatching(/\.jpeg$/),
        format: "jpeg",
        dimensions: { width: 1920, height: 1080 },
        fileSize: testBuffer.length,
        hash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        auditId: expect.any(String),
        instanceId: expect.any(String),
        tag: expect.any(String),
        options: {
          fullPage: true,
          quality: 85,
          encrypted: false, // Wave 1: No encryption
          compressed: false, // Wave 1: No compression
        },
        created: expect.any(String),
      });

      // Verify timestamp format
      expect(() => new Date(metadata.timestamp)).not.toThrow();
      expect(() => new Date(metadata.created)).not.toThrow();
    });

    it("should generate consistent hash for same content", async () => {
      const result1 = await storageManager.saveScreenshot(
        testBuffer,
        { width: 1920, height: 1080 },
        {
          sessionId: "hash-session-1",
          browserId: "hash-browser-1",
        },
      );

      const result2 = await storageManager.saveScreenshot(
        testBuffer, // Same buffer
        { width: 1920, height: 1080 },
        {
          sessionId: "hash-session-2",
          browserId: "hash-browser-2",
        },
      );

      // Hashes should be identical for same content
      expect(result1.hash).toBe(result2.hash);

      // But filenames and audit IDs should be different
      expect(result1.filename).not.toBe(result2.filename);
      expect(result1.auditId).not.toBe(result2.auditId);
    });
  });

  describe("database integration", () => {
    beforeEach(async () => {
      // Mock the database manager to avoid actual database operations
      vi.mock("../../src/core/database/database-manager.js", () => ({
        getDatabaseManager: vi.fn().mockResolvedValue({
          getInstanceId: vi.fn().mockReturnValue("test-instance-123"),
        }),
      }));

      // Mock the screenshot repository
      vi.mock("../../src/core/database/repositories/screenshot-repository.js", () => ({
        ScreenshotRepository: {
          save: vi.fn().mockResolvedValue("db-record-id"),
          list: vi.fn(),
        },
      }));
    });

    it("should save screenshot metadata to database on successful save", async () => {
      const saveSpy = vi.spyOn(ScreenshotRepository, "save");

      const result = await storageManager.saveScreenshot(
        testBuffer,
        { width: 1920, height: 1080 },
        {
          sessionId: "db-test-session",
          browserId: "db-test-browser",
          teamId: "db-test-team",
          tag: "database-test",
        },
      );

      // File should be saved successfully
      expect(result.filePath).toBeDefined();
      expect(existsSync(result.filePath)).toBe(true);

      // Database save should have been called with correct parameters
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "db-test-session",
          browserId: "db-test-browser",
          teamId: "db-test-team",
          tag: "database-test",
          format: "png",
          fileSize: testBuffer.length,
          width: 1920,
          height: 1080,
        }),
      );
    });

    it("should not fail screenshot save if database save fails", async () => {
      // Make database save fail
      vi.spyOn(ScreenshotRepository, "save").mockRejectedValue(
        new Error("Database connection failed"),
      );

      // Should still save screenshot successfully
      const result = await storageManager.saveScreenshot(
        testBuffer,
        { width: 1920, height: 1080 },
        {
          sessionId: "db-fail-session",
          browserId: "db-fail-browser",
        },
      );

      // File should be saved despite database failure
      expect(result.filePath).toBeDefined();
      expect(existsSync(result.filePath)).toBe(true);
    });
  });

  describe("listScreenshots", () => {
    it("should query screenshots from database", async () => {
      const mockResults = {
        items: [
          {
            id: "screenshot-1",
            instanceId: "test-instance-123",
            filename: "screenshot-2025-01-26T10-00-00-abc.png",
            filePath: "/path/to/screenshot1.png",
            sessionId: "session-1",
            browserId: "browser-1",
            format: "png" as const,
            fileSize: 100000,
            width: 1920,
            height: 1080,
            fullPage: false,
            hash: "sha256:abcdef1234567890",
            createdAt: new Date("2025-01-26T10:00:00Z"),
          },
          {
            id: "screenshot-2",
            instanceId: "test-instance-123",
            filename: "screenshot-2025-01-26T10-01-00-def.png",
            filePath: "/path/to/screenshot2.png",
            sessionId: "session-1",
            browserId: "browser-1",
            format: "png" as const,
            fileSize: 150000,
            width: 1920,
            height: 1080,
            fullPage: false,
            hash: "sha256:fedcba0987654321",
            createdAt: new Date("2025-01-26T10:01:00Z"),
          },
        ],
        total: 2,
        hasMore: false,
      };

      vi.spyOn(ScreenshotRepository, "list").mockResolvedValue(mockResults);

      const results = await storageManager.listScreenshots({
        sessionId: "session-1",
        limit: 10,
      });

      expect(results).toEqual(mockResults);
      expect(ScreenshotRepository.list).toHaveBeenCalledWith({
        sessionId: "session-1",
        limit: 10,
      });
    });

    it("should fallback to filesystem scan if database query fails", async () => {
      // Make database query fail
      vi.spyOn(ScreenshotRepository, "list").mockRejectedValue(new Error("Database unavailable"));

      // Save a screenshot first
      await storageManager.saveScreenshot(
        testBuffer,
        { width: 1920, height: 1080 },
        {
          sessionId: "fallback-session",
          browserId: "fallback-browser",
        },
      );

      // Now try to list - should fallback to filesystem
      const results = await storageManager.listScreenshots({
        sessionId: "fallback-session",
      });

      // Should return results from filesystem scan
      expect(results.items).toBeDefined();
      expect(results.total).toBeGreaterThanOrEqual(0);
    });

    it("should support filtering by various parameters", async () => {
      const listSpy = vi.spyOn(ScreenshotRepository, "list");
      listSpy.mockResolvedValue({
        items: [],
        total: 0,
        hasMore: false,
      });

      const testDate = new Date("2025-01-26T10:00:00Z");

      await storageManager.listScreenshots({
        teamId: "test-team",
        tag: "test-tag",
        format: "png",
        maxAge: 3600,
        startDate: testDate,
        endDate: testDate,
        orderBy: "file_size",
        orderDirection: "DESC",
        limit: 50,
        offset: 10,
      });

      expect(listSpy).toHaveBeenCalledWith({
        teamId: "test-team",
        tag: "test-tag",
        format: "png",
        maxAge: 3600,
        startDate: testDate,
        endDate: testDate,
        orderBy: "file_size",
        orderDirection: "DESC",
        limit: 50,
        offset: 10,
      });
    });
  });
});
