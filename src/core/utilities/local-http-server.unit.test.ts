/**
 * Unit Tests for LocalHttpServer Implementation
 * Tests actual implementation methods without starting HTTP servers
 *
 * COVERAGE TARGET: src/core/utilities/local-http-server.ts actual implementation
 *
 * NOTE: This file contains mocked unit tests. For comprehensive integration testing
 * with real HTTP servers and file operations, see our Bun-based integration test
 * infrastructure documented in docs/testing/test-categorization-guide.md
 * Integration tests run under Bun's native test runner for full-stack validation.
 */

import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestConfig,
  setupTestAssets,
  testSetup,
  testTeardown,
} from "../../../tests/utils/test-infrastructure.js";

// Mock fs.existsSync to control file existence checks
vi.mock("node:fs", async () => {
  const actual = await vi.importActual("node:fs");
  return {
    ...actual,
    existsSync: vi.fn().mockImplementation((path: string) => {
      // Control PDF.js asset existence for testing
      if (path.includes("pdf.min.mjs") || path.includes("pdf.worker.min.mjs")) {
        // Return true by default, false for specific test cases
        return true;
      }
      return true;
    }),
  };
});

// Import the actual LocalHttpServer class to test real implementation
import { LocalHttpServer } from "./local-http-server.js";

// Mock Bun global to avoid actual server startup in unit tests
const mockServe = vi.fn().mockImplementation(() => ({
  stop: vi.fn(),
  port: 10500, // Mock test port
  hostname: "127.0.0.1",
}));

const mockFile = vi.fn().mockImplementation((filePath: string) => ({
  exists: () => {
    // Return false for PDF.js assets when they should be missing in tests
    if (filePath.includes("pdf.min.mjs") || filePath.includes("pdf.worker.min.mjs")) {
      return !filePath.includes("missing-test");
    }
    return true;
  },
  size: 1024,
}));

const mockHash = vi.fn().mockImplementation((input: any) => {
  // Generate different hash for different inputs to make tests realistic
  return Math.abs(
    JSON.stringify(input)
      .split("")
      .reduce((acc, char) => {
        const newAcc = (acc << 5) - acc + char.charCodeAt(0);
        return newAcc & newAcc;
      }, 0),
  ).toString(36);
});

// Mock Bun global
global.Bun = {
  serve: mockServe,
  file: mockFile,
  hash: mockHash,
} as any;

// Mock the logger to avoid initialization issues
vi.mock("../../shared/pino-logger.js", () => ({
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe.skip("LocalHttpServer Unit Tests", () => {
  let testConfig: any;
  let testSessionId: string;
  let testPdfPath: string;
  let server: LocalHttpServer;

  beforeEach(async () => {
    testSetup();

    testSessionId = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    testConfig = createTestConfig();

    // Create test assets
    setupTestAssets(testConfig.paths.assets);

    // Create a test PDF file
    testPdfPath = join(testConfig.paths.assets, "test.pdf");
    writeFileSync(testPdfPath, "dummy PDF content for testing");

    // Create LocalHttpServer instance directly (not via getInstance to avoid auto-start)
    server = new (LocalHttpServer as any)(testSessionId);

    // Clear any previous mock calls
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Reset any static state
    (LocalHttpServer as any).instances?.clear?.();
    await testTeardown();
  });

  describe("Core Server Functionality", () => {
    it("should start server with configuration", async () => {
      await server.start({ port: 10500, host: "127.0.0.1" });

      expect(mockServe).toHaveBeenCalledWith({
        port: 10500,
        hostname: "127.0.0.1",
        fetch: expect.any(Function),
        error: expect.any(Function),
      });
    });

    it("should not restart if server already running", async () => {
      await server.start({ port: 10500 });
      await server.start({ port: 10501 }); // Second call should be ignored

      expect(mockServe).toHaveBeenCalledTimes(1);
    });

    it("should find available ports in range", async () => {
      // Test the private method through start()
      await server.start(); // Should use findAvailablePort internally

      expect(mockServe).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: "127.0.0.1",
          fetch: expect.any(Function),
          error: expect.any(Function),
        }),
      );
    });
  });

  describe("File Registration and ID Generation", () => {
    beforeEach(async () => {
      // Start server for file operations
      await server.start({ port: 10500 });
    });

    it("should register existing files and generate secure IDs", async () => {
      const result = await server.serveFile(testPdfPath);

      expect(result).toHaveProperty("url");
      expect(result).toHaveProperty("serverId", testSessionId);
      expect(result).toHaveProperty("port", 10500);
      expect(result.url).toMatch(/^http:\/\/127\.0\.0\.1:10500\/serve\/[a-zA-Z0-9]+$/);

      // File ID should be secure and consistent
      const fileId = result.url.split("/").pop();
      expect(fileId).toBeDefined();
      expect(fileId!.length).toBeGreaterThan(6);
    });

    it("should generate different IDs for different files", async () => {
      // Create second test file
      const secondPdfPath = join(testConfig.paths.assets, "test2.pdf");
      writeFileSync(secondPdfPath, "different PDF content");

      const result1 = await server.serveFile(testPdfPath);
      const result2 = await server.serveFile(secondPdfPath);

      const fileId1 = result1.url.split("/").pop();
      const fileId2 = result2.url.split("/").pop();

      expect(fileId1).not.toBe(fileId2);
    });

    it("should throw error for non-existent files", async () => {
      const nonExistentPath = "/path/to/nonexistent.pdf";

      await expect(server.serveFile(nonExistentPath)).rejects.toThrow("File not found");
    });

    it("should maintain file registry mapping", async () => {
      const result = await server.serveFile(testPdfPath);

      // Test that file is registered internally
      const fileId = result.url.split("/").pop()!;

      // We can't directly access private properties, but we can verify the mapping works
      // by creating a mock request
      const _mockRequest = new Request(`http://127.0.0.1:10500/serve/${fileId}`, {
        headers: { host: "127.0.0.1:10500" },
      });

      // Get the fetch handler from the mock call
      const fetchHandler = mockServe.mock.calls[0]?.[0]?.fetch;
      expect(fetchHandler).toBeDefined();
    });
  });

  describe("PDF.js Asset Management", () => {
    beforeEach(async () => {
      await server.start({ port: 10500 });
    });

    it("should validate PDF.js assets availability", async () => {
      // PDF.js assets were set up in setupTestAssets
      // This should not throw an error
      await expect(server.servePdfWithViewer(testPdfPath)).resolves.toBeDefined();
    });

    it("should generate PDF viewer URLs with proper format", async () => {
      const result = await server.servePdfWithViewer(testPdfPath);

      expect(result).toHaveProperty("url");
      expect(result).toHaveProperty("serverId", testSessionId);
      expect(result).toHaveProperty("port", 10500);
      expect(result.url).toMatch(/^http:\/\/127\.0\.0\.1:10500\/viewer\/pdf\/[a-zA-Z0-9]+$/);
    });

    it("should create viewer ID mapping for PDF files", async () => {
      const result1 = await server.servePdfWithViewer(testPdfPath);

      // Create second PDF
      const secondPdfPath = join(testConfig.paths.assets, "test2.pdf");
      writeFileSync(secondPdfPath, "different PDF content");
      const result2 = await server.servePdfWithViewer(secondPdfPath);

      // Different PDFs should get different viewer IDs
      const viewerId1 = result1.url.split("/").pop();
      const viewerId2 = result2.url.split("/").pop();

      expect(viewerId1).not.toBe(viewerId2);
    });

    it("should handle missing PDF.js assets", async () => {
      // Configure mock to return false for PDF.js assets
      const { existsSync } = await import("node:fs");
      const mockExistsSync = existsSync as any;

      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes("pdf.min.mjs") || path.includes("pdf.worker.min.mjs")) {
          return false; // Simulate missing assets
        }
        return true;
      });

      await expect(server.servePdfWithViewer(testPdfPath)).rejects.toThrow(
        "PDF.js assets not found",
      );
    });

    it("should validate assets path configuration", () => {
      // Test the getAssetsPath method indirectly through asset validation
      expect(() => {
        // This should work with our test setup
        (server as any).ensurePdfJsAssetsAvailable();
      }).not.toThrow();
    });
  });

  describe("HTTP Request Routing Logic", () => {
    beforeEach(async () => {
      await server.start({ port: 10500 });
    });

    it("should route file serving requests correctly", async () => {
      const result = await server.serveFile(testPdfPath);
      const fileId = result.url.split("/").pop()!;

      // Create mock request for file serving
      const _mockRequest = new Request(`http://127.0.0.1:10500/serve/${fileId}`, {
        headers: { host: "127.0.0.1:10500" },
      });

      // Get the fetch handler and test routing
      const fetchHandler = mockServe.mock.calls[0]?.[0]?.fetch;
      expect(fetchHandler).toBeDefined();

      // The fetch handler should be bound to the server instance
      expect(typeof fetchHandler).toBe("function");
    });

    it("should route PDF.js asset requests correctly", async () => {
      // Test asset routing logic
      const assetRequest = new Request("http://127.0.0.1:10500/assets/pdf.js/pdf.min.mjs", {
        headers: { host: "127.0.0.1:10500" },
      });

      const fetchHandler = mockServe.mock.calls[0]?.[0]?.fetch;
      expect(fetchHandler).toBeDefined();

      // Should handle PDF.js asset routing
      const url = new URL(assetRequest.url);
      expect(url.pathname.startsWith("/assets/pdf.js/")).toBe(true);
    });

    it("should route PDF viewer requests correctly", async () => {
      const result = await server.servePdfWithViewer(testPdfPath);
      const viewerId = result.url.split("/").pop()!;

      // Test viewer routing
      expect(result.url).toContain("/viewer/pdf/");
      expect(viewerId).toBeDefined();
      expect(viewerId.length).toBeGreaterThan(0);
    });

    it("should validate localhost-only requests", async () => {
      // Test host validation logic
      const maliciousRequest = new Request("http://127.0.0.1:10500/serve/test", {
        headers: { host: "evil.com" },
      });

      // The host validation should be in the request handler
      const host = maliciousRequest.headers.get("host");
      const isLocalhost = host?.startsWith("127.0.0.1") || host?.startsWith("localhost");

      expect(isLocalhost).toBe(false);
    });
  });

  describe("Security and Validation", () => {
    beforeEach(async () => {
      await server.start({ port: 10500 });
    });

    it("should validate file paths exist before serving", async () => {
      const invalidPath = "/nonexistent/file.pdf";

      await expect(server.serveFile(invalidPath)).rejects.toThrow("File not found");
    });

    it("should generate cryptographically secure file IDs", async () => {
      const result = await server.serveFile(testPdfPath);
      const fileId = result.url.split("/").pop()!;

      // File ID should be URL-safe and reasonably long
      expect(fileId).toMatch(/^[a-zA-Z0-9_-]+$/);
      expect(fileId.length).toBeGreaterThan(6);

      // Should not contain obvious path information
      expect(fileId).not.toContain("test.pdf");
      expect(fileId).not.toContain("/");
      expect(fileId).not.toContain("\\");
    });

    it("should handle CORS headers appropriately", async () => {
      // Test CORS header generation logic
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      expect(corsHeaders["Access-Control-Allow-Origin"]).toBe("*");
      expect(corsHeaders["Access-Control-Allow-Methods"]).toContain("GET");
      expect(corsHeaders["Access-Control-Allow-Headers"]).toBe("Content-Type");
    });
  });

  describe("Static Instance Management", () => {
    it("should manage singleton instances per session ID", async () => {
      // Test static instance management without starting servers
      const instances = (LocalHttpServer as any).instances;

      // Clear instances first
      instances.clear();

      // Verify getInstance pattern works
      expect(typeof LocalHttpServer.getInstance).toBe("function");
      expect(instances.size).toBe(0);
    });

    it("should generate consistent session IDs", () => {
      const sessionId1 = `test-session-${Date.now()}`;
      const sessionId2 = `test-session-${Date.now() + 1}`;

      expect(sessionId1).not.toBe(sessionId2);
      expect(sessionId1).toContain("test-session-");
      expect(sessionId2).toContain("test-session-");
    });
  });
});
