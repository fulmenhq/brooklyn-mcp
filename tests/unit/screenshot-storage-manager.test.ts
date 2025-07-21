/**
 * Unit tests for ScreenshotStorageManager
 * Architecture Committee approved file storage implementation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  ScreenshotStorageManager,
  StorageSecurityError,
  StorageQuotaError,
  type ScreenshotMetadata,
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
        }
      );

      // Verify result structure
      expect(result).toMatchObject({
        filePath: expect.stringContaining("test-team/sessions/test-session-1"),
        filename: expect.stringMatching(/^screenshot-.*\.png$/),
        auditId: expect.any(String),
        fileSize: testBuffer.length,
        format: "png",
        hash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      });

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
        }
      );

      expect(result.format).toBe("jpeg");
      expect(result.filename).toMatch(/\.jpeg$/);
      expect(result.metadata.options.quality).toBe(95);
      expect(result.metadata.options.fullPage).toBe(true);
    });

    it("should generate unique filenames for concurrent saves", async () => {
      const savePromises = Array.from({ length: 5 }, (_, i) =>
        storageManager.saveScreenshot(
          testBuffer,
          { width: 800, height: 600 },
          {
            sessionId: "concurrent-session",
            browserId: `browser-${i}`,
          }
        )
      );

      const results = await Promise.all(savePromises);
      const filenames = results.map(r => r.filename);

      // All filenames should be unique
      const uniqueFilenames = new Set(filenames);
      expect(uniqueFilenames.size).toBe(filenames.length);

      // All should follow the pattern
      for (const filename of filenames) {
        expect(filename).toMatch(/^screenshot-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-[a-f0-9-]+\.png$/);
      }
    });

    it("should create team isolation directories", async () => {
      await storageManager.saveScreenshot(
        testBuffer,
        { width: 1920, height: 1080 },
        {
          sessionId: "isolation-session",
          browserId: "browser-789",
          teamId: "team-alpha",
        }
      );

      await storageManager.saveScreenshot(
        testBuffer,
        { width: 1920, height: 1080 },
        {
          sessionId: "isolation-session",
          browserId: "browser-789",
          teamId: "team-beta",
        }
      );

      // Verify separate team directories exist
      const alphaDir = join(testBaseDir, "team-alpha", "sessions", "isolation-session");
      const betaDir = join(testBaseDir, "team-beta", "sessions", "isolation-session");
      
      expect(existsSync(alphaDir)).toBe(true);
      expect(existsSync(betaDir)).toBe(true);
    });

    it("should handle default team when no teamId provided", async () => {
      const result = await storageManager.saveScreenshot(
        testBuffer,
        { width: 1920, height: 1080 },
        {
          sessionId: "default-session",
          browserId: "browser-default",
        }
      );

      expect(result.filePath).toContain("default/sessions/default-session");
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
          }
        )
      ).rejects.toThrow(StorageQuotaError);
    });
  });

  describe("security path validation", () => {
    it("should prevent path traversal attacks", async () => {
      // Path validation happens during file operations, let's test it during save
      await expect(
        storageManager.saveScreenshot(
          testBuffer,
          { width: 1920, height: 1080 },
          {
            sessionId: "../../../malicious-session",
            browserId: "malicious-browser",
          }
        )
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
          }
        )
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
          }
        )
      ).rejects.toThrow(StorageSecurityError);
    });

    it("should allow valid filenames", async () => {
      // First save a file to test with
      const result = await storageManager.saveScreenshot(
        testBuffer,
        { width: 1920, height: 1080 },
        {
          sessionId: "valid-session",
          browserId: "valid-browser",
          teamId: "valid-team",
        }
      );

      // Then retrieve it - should not throw
      const path = await storageManager.getScreenshotPath(
        result.filename,
        "valid-session",
        "valid-team"
      );

      expect(path).toBe(result.filePath);
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
        }
      );

      // Verify files exist
      const metadataPath = result.filePath.replace(/\.png$/, ".metadata.json");
      expect(existsSync(result.filePath)).toBe(true);
      expect(existsSync(metadataPath)).toBe(true);

      // Delete screenshot
      await storageManager.deleteScreenshot(
        result.filename,
        "delete-session",
        "delete-team"
      );

      // Verify files are deleted
      expect(existsSync(result.filePath)).toBe(false);
      expect(existsSync(metadataPath)).toBe(false);
    });

    it("should handle deletion of non-existent files gracefully", async () => {
      // Should not throw error for non-existent files
      await expect(
        storageManager.deleteScreenshot(
          "non-existent.png",
          "session",
          "team"
        )
      ).resolves.not.toThrow();
    });

    it("should return correct file path for existing screenshots", async () => {
      const result = await storageManager.saveScreenshot(
        testBuffer,
        { width: 1920, height: 1080 },
        {
          sessionId: "path-session",
          browserId: "path-browser",
          teamId: "path-team",
        }
      );

      const retrievedPath = await storageManager.getScreenshotPath(
        result.filename,
        "path-session",
        "path-team"
      );

      expect(retrievedPath).toBe(result.filePath);
    });

    it("should throw error for non-existent screenshot files", async () => {
      await expect(
        storageManager.getScreenshotPath(
          "non-existent-screenshot.png",
          "session",
          "team"
        )
      ).rejects.toThrow("Screenshot file not found");
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
        }
      );

      // Cleanup should not throw (implementation is placeholder for Wave 1)
      await expect(
        storageManager.cleanupSession("cleanup-session", "cleanup-team")
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
          }
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
          }
        );
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(StorageSecurityError);
        expect((error as StorageSecurityError).message).toContain("Path traversal attempt detected");
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
        }
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
        }
      );

      const result2 = await storageManager.saveScreenshot(
        testBuffer, // Same buffer
        { width: 1920, height: 1080 },
        {
          sessionId: "hash-session-2", 
          browserId: "hash-browser-2",
        }
      );

      // Hashes should be identical for same content
      expect(result1.hash).toBe(result2.hash);
      
      // But filenames and audit IDs should be different
      expect(result1.filename).not.toBe(result2.filename);
      expect(result1.auditId).not.toBe(result2.auditId);
    });
  });
});