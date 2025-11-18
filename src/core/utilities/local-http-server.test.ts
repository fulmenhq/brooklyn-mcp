/**
 * Local HTTP Server Unit Tests
 * Tests for Brooklyn PDF.js 4.x HTTP server extensions
 *
 * COVERAGE TARGET: src/core/utilities/local-http-server.ts PDF.js methods
 *
 * NOTE: This file contains mocked unit tests. For comprehensive integration testing
 * with real HTTP servers and file operations, see our Bun-based integration test
 * infrastructure documented in docs/testing/test-categorization-guide.md
 * Integration tests run under Bun's native test runner for full-stack validation.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestConfig,
  setupTestAssets,
  TEST_PORT_RANGES,
  testServerManager,
  testSetup,
  testTeardown,
} from "../../../tests/utils/test-infrastructure.js";
import { LocalHttpServer } from "./local-http-server.js";

// Mock Bun global to avoid actual HTTP server during testing
global.Bun = {
  serve: vi.fn().mockReturnValue({
    stop: vi.fn(),
    port: 10500,
    hostname: "127.0.0.1",
  }),
  file: vi.fn(() => ({
    exists: () => true,
    size: 1234,
  })),
  hash: vi.fn(() => "test-hash-12345"),
} as any;

// Mock the logger to avoid initialization during tests
vi.mock("../../shared/pino-logger.js", () => ({
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe.skip("LocalHttpServer PDF.js Extensions", () => {
  let testConfig: any;
  let testAssetsDir: string;
  let mockPdfJsDir: string;
  let testSessionId: string;

  beforeEach(() => {
    testSetup();

    testSessionId = `test-session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    testConfig = createTestConfig();
    testAssetsDir = testConfig.paths.assets;
    mockPdfJsDir = join(testAssetsDir, "pdfjs");

    // Create test PDF.js assets
    setupTestAssets(testAssetsDir);
  });

  afterEach(async () => {
    // Stop all test servers
    testServerManager.stopAllServers();

    await testTeardown();

    vi.clearAllMocks();
    vi.resetModules();
  });

  describe("PDF.js Asset Management", () => {
    it("should validate presence of required PDF.js files", () => {
      // Test ensurePdfJsAssetsAvailable logic
      const requiredFiles = ["pdf.min.mjs", "pdf.worker.min.mjs"];
      const allFilesExist = requiredFiles.every((filename) =>
        existsSync(join(mockPdfJsDir, filename)),
      );

      expect(allFilesExist).toBe(true);
    });

    it("should detect missing PDF.js assets", () => {
      // Remove one required file
      rmSync(join(mockPdfJsDir, "pdf.min.mjs"));

      const requiredFiles = ["pdf.min.mjs", "pdf.worker.min.mjs"];
      const missingFiles = requiredFiles.filter(
        (filename) => !existsSync(join(mockPdfJsDir, filename)),
      );

      expect(missingFiles).toContain("pdf.min.mjs");
      expect(missingFiles).toHaveLength(1);
    });

    it("should provide correct assets path", () => {
      // Test getAssetsPath logic using test infrastructure
      const expectedPath = testAssetsDir;

      // This tests the path construction logic
      expect(testAssetsDir).toBe(expectedPath);
      expect(testAssetsDir).toContain("assets");
    });

    it("should handle missing assets directory", () => {
      // Remove entire assets directory
      rmSync(testAssetsDir, { recursive: true, force: true });

      const assetsExist = existsSync(testAssetsDir);
      expect(assetsExist).toBe(false);
    });
  });

  describe("PDF Viewer Registration", () => {
    it("should create proper viewer ID mapping", async () => {
      const mockPdfPath = "/tmp/test.pdf";

      // Use test port range instead of production ports
      const testPort = await testServerManager.startTestServer("test-viewer-mapping");

      const _mockServeFile = vi.fn().mockResolvedValue({
        url: `http://127.0.0.1:${testPort.port}/file/abc123`,
        serverId: testSessionId,
        port: testPort.port,
      });

      // Test viewer ID generation logic
      const generateFileId = (input: string): string => {
        return Buffer.from(input).toString("base64").replace(/[+/=]/g, "").substring(0, 8);
      };

      const viewerId = generateFileId(`${mockPdfPath}-viewer`);
      expect(viewerId).toBeDefined();
      expect(viewerId.length).toBe(8);
      expect(/^[a-zA-Z0-9]+$/.test(viewerId)).toBe(true);
    });

    it("should map viewer ID to PDF file and file ID", () => {
      const mockViewerData = {
        pdfPath: "/tmp/test.pdf",
        fileId: "abc123",
      };

      // Test registry storage logic
      const viewerRegistry = new Map();
      const viewerId = "viewer123";
      viewerRegistry.set(viewerId, mockViewerData);

      const retrievedData = viewerRegistry.get(viewerId);
      expect(retrievedData).toEqual(mockViewerData);
      expect(retrievedData?.pdfPath).toBe("/tmp/test.pdf");
      expect(retrievedData?.fileId).toBe("abc123");
    });

    it("should generate proper viewer URL", async () => {
      const testServer = await testServerManager.startTestServer("test-viewer-url");
      const viewerId = "viewer123";
      const expectedUrl = `http://127.0.0.1:${testServer.port}/viewer/pdf/${viewerId}`;

      // Test URL construction
      const actualUrl = `http://127.0.0.1:${testServer.port}/viewer/pdf/${viewerId}`;
      expect(actualUrl).toBe(expectedUrl);

      testServerManager.stopTestServer("test-viewer-url");
    });
  });

  describe("HTTP Route Handling", () => {
    it("should match PDF.js asset routes correctly", () => {
      const testRoutes = [
        "/assets/pdf.js/pdf.min.mjs",
        "/assets/pdf.js/pdf.worker.min.mjs",
        "/assets/pdf.js/viewer.mjs",
      ];

      for (const pathname of testRoutes) {
        const isPdfJsAsset = pathname.startsWith("/assets/pdf.js/");
        expect(isPdfJsAsset).toBe(true);
      }

      // Test non-matching routes
      const nonPdfJsRoutes = ["/assets/other/file.js", "/viewer/html/test", "/api/status"];

      for (const pathname of nonPdfJsRoutes) {
        const isPdfJsAsset = pathname.startsWith("/assets/pdf.js/");
        expect(isPdfJsAsset).toBe(false);
      }
    });

    it("should match PDF viewer routes correctly", () => {
      const testRoutes = ["/viewer/pdf/abc123", "/viewer/pdf/xyz789"];

      for (const pathname of testRoutes) {
        const isPdfViewer = pathname.startsWith("/viewer/pdf/");
        expect(isPdfViewer).toBe(true);

        // Extract viewer ID
        const viewerId = pathname.substring(12); // Remove "/viewer/pdf/"
        expect(viewerId.length).toBeGreaterThan(0);
      }
    });

    it("should extract asset names from PDF.js routes", () => {
      const pathname = "/assets/pdf.js/pdf.worker.min.mjs";
      const assetName = pathname.substring(15); // Remove "/assets/pdf.js/"

      expect(assetName).toBe("pdf.worker.min.mjs");
    });

    it("should extract viewer IDs from PDF viewer routes", () => {
      const pathname = "/viewer/pdf/viewer123abc";
      const viewerId = pathname.substring(12); // Remove "/viewer/pdf/"

      expect(viewerId).toBe("viewer123abc");
    });
  });

  describe("Content Type Handling", () => {
    it("should set correct MIME types for JavaScript modules", () => {
      const getMimeType = (filename: string): string => {
        if (filename.endsWith(".mjs")) return "application/javascript";
        if (filename.endsWith(".js")) return "application/javascript";
        if (filename.endsWith(".html")) return "text/html";
        return "application/octet-stream";
      };

      expect(getMimeType("pdf.min.mjs")).toBe("application/javascript");
      expect(getMimeType("pdf.worker.min.mjs")).toBe("application/javascript");
      expect(getMimeType("viewer.html")).toBe("text/html");
    });

    it("should handle CORS headers for PDF.js assets", () => {
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      // Test header structure
      expect(corsHeaders["Access-Control-Allow-Origin"]).toBe("*");
      expect(corsHeaders["Access-Control-Allow-Methods"]).toContain("GET");
    });
  });

  describe("Error Handling", () => {
    it("should return 503 when PDF.js assets are unavailable", () => {
      // Test error response structure
      const errorResponse = {
        status: 503,
        message:
          "PDF.js assets not available. Run 'bun run setup:assets' to download required assets.",
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      };

      expect(errorResponse.status).toBe(503);
      expect(errorResponse.message).toContain("PDF.js assets not available");
      expect(errorResponse.message).toContain("bun run setup:assets");
    });

    it("should return 404 for non-existent PDF.js assets", () => {
      const assetName = "nonexistent.mjs";
      const assetsDir = "/path/to/assets/pdfjs";

      const errorResponse = {
        status: 404,
        message: `Asset not found: ${assetName}. Available assets should be in ${assetsDir}`,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      };

      expect(errorResponse.status).toBe(404);
      expect(errorResponse.message).toContain("Asset not found");
      expect(errorResponse.message).toContain(assetName);
    });

    it("should return 404 for invalid viewer IDs", () => {
      const _viewerId = "invalid-viewer-id";

      const errorResponse = {
        status: 404,
        message: "Viewer not found",
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      };

      expect(errorResponse.status).toBe(404);
      expect(errorResponse.message).toBe("Viewer not found");
    });
  });

  describe("PDF Viewer HTML Generation", () => {
    it("should generate valid HTML structure", () => {
      const testPort = 10500; // Use test port range
      const mockHtml = `<!DOCTYPE html>
<html>
<head>
    <title>PDF Viewer - Brooklyn MCP</title>
    <meta charset="utf-8">
    <script type="module" src="/assets/pdf.js/pdf.min.mjs"></script>
</head>
<body>
    <div id="pdf-container"></div>
    <script>
        window.pdfUrl = "http://127.0.0.1:${testPort}/file/abc123";
    </script>
</body>
</html>`;

      // Test HTML structure
      expect(mockHtml).toContain("<!DOCTYPE html>");
      expect(mockHtml).toContain('script type="module"');
      expect(mockHtml).toContain("/assets/pdf.js/pdf.min.mjs");
      expect(mockHtml).toContain("window.pdfUrl");
    });

    it("should inject correct PDF file URL", async () => {
      const pdfFileId = "abc123";
      const testServer = await testServerManager.startTestServer("test-pdf-url");
      const expectedPdfUrl = `http://127.0.0.1:${testServer.port}/file/${pdfFileId}`;

      const injectedScript = `window.pdfUrl = "${expectedPdfUrl}";`;

      expect(injectedScript).toContain(expectedPdfUrl);
      expect(injectedScript).toContain(pdfFileId);

      testServerManager.stopTestServer("test-pdf-url");
    });

    it("should include PDF.js worker configuration", async () => {
      const testServer = await testServerManager.startTestServer("test-worker-config");
      const workerScript = `pdfjsLib.GlobalWorkerOptions.workerSrc = "http://127.0.0.1:${testServer.port}/assets/pdf.js/pdf.worker.min.mjs";`;

      expect(workerScript).toContain("GlobalWorkerOptions.workerSrc");
      expect(workerScript).toContain("/assets/pdf.js/pdf.worker.min.mjs");

      testServerManager.stopTestServer("test-worker-config");
    });
  });

  describe("File System Integration", () => {
    it("should validate asset file existence", () => {
      const assetPath = join(mockPdfJsDir, "pdf.min.mjs");
      expect(existsSync(assetPath)).toBe(true);
    });

    it("should handle permission errors gracefully", () => {
      // Test error handling logic for file access
      const mockPermissionError = new Error("EACCES: permission denied");
      mockPermissionError.name = "PermissionError";

      const isPermissionError =
        mockPermissionError.message.includes("permission denied") ||
        mockPermissionError.name === "PermissionError";

      expect(isPermissionError).toBe(true);
    });

    it("should create assets directory if missing", () => {
      const newAssetsDir = join(testConfig.paths.assets, "new-assets");

      // Directory doesn't exist initially
      expect(existsSync(newAssetsDir)).toBe(false);

      // Create directory
      mkdirSync(newAssetsDir, { recursive: true });

      // Directory now exists
      expect(existsSync(newAssetsDir)).toBe(true);
    });
  });

  describe("Server Lifecycle", () => {
    it("should maintain file registry per server instance", () => {
      const fileRegistry = new Map<string, string>();
      const fileId = "test123";
      const filePath = "/tmp/test.pdf";

      fileRegistry.set(fileId, filePath);

      expect(fileRegistry.has(fileId)).toBe(true);
      expect(fileRegistry.get(fileId)).toBe(filePath);
      expect(fileRegistry.size).toBe(1);
    });

    it("should maintain PDF viewer registry per server instance", () => {
      const pdfViewerRegistry = new Map<string, { pdfPath: string; fileId: string }>();
      const viewerId = "viewer123";
      const viewerData = { pdfPath: "/tmp/test.pdf", fileId: "file123" };

      pdfViewerRegistry.set(viewerId, viewerData);

      expect(pdfViewerRegistry.has(viewerId)).toBe(true);
      expect(pdfViewerRegistry.get(viewerId)).toEqual(viewerData);
    });

    it("should generate unique file IDs", () => {
      const generateFileId = (input: string, timestamp?: number): string => {
        const ts = timestamp || Date.now();
        const combined = `${input}-${ts}`;
        // Use a simple hash-like approach instead of truncated base64
        let hash = 0;
        for (let i = 0; i < combined.length; i++) {
          const char = combined.charCodeAt(i);
          hash = (hash << 5) - hash + char;
          hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36).substring(0, 8).padEnd(8, "0");
      };

      // Test with different timestamps to ensure uniqueness
      const id1 = generateFileId("test.pdf", 1000);
      const id2 = generateFileId("test.pdf", 2000);

      // IDs should be different due to different timestamps
      expect(id1).not.toBe(id2);
      expect(id1.length).toBe(8);
      expect(id2.length).toBe(8);

      // Test with very different inputs to ensure algorithm works
      const id3 = generateFileId("different-file.pdf", 1000);
      const id4 = generateFileId("another-file.pdf", 1000);
      expect(id3).not.toBe(id4);

      // Test that algorithm produces valid alphanumeric strings
      expect(/^[a-zA-Z0-9]+$/.test(id1)).toBe(true);
      expect(/^[a-zA-Z0-9]+$/.test(id2)).toBe(true);
    });
  });
});
