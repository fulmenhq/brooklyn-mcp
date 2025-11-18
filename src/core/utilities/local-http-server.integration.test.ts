/**
 * Integration Tests for LocalHttpServer
 * Tests actual implementation with real HTTP server instances
 *
 * COVERAGE TARGET: src/core/utilities/local-http-server.ts actual methods
 *
 * NOTE: These integration tests require available ports and may conflict in CI.
 * For additional integration testing with real HTTP servers and file operations,
 * see our Bun-based integration test infrastructure documented in
 * docs/testing/test-categorization-guide.md
 */

import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestConfig,
  findTestPort,
  setupTestAssets,
  testServerManager,
  testSetup,
  testTeardown,
} from "../../../tests/utils/test-infrastructure.js";
import { LocalHttpServer } from "./local-http-server.js";

describe.skip("LocalHttpServer Integration Tests", () => {
  let testConfig: any;
  let testSessionId: string;
  let testPdfPath: string;

  beforeEach(async () => {
    testSetup();

    testSessionId = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    testConfig = createTestConfig();

    // Create test assets
    setupTestAssets(testConfig.paths.assets);

    // Create a test PDF file
    testPdfPath = join(testConfig.paths.assets, "test.pdf");
    writeFileSync(testPdfPath, "dummy PDF content for testing");
  });

  afterEach(async () => {
    // Clean up any server instances
    testServerManager.stopAllServers();

    await testTeardown();
  });

  describe("Server Instance Management", () => {
    it("should create and start server instance", async () => {
      // Use test port range to avoid conflicts
      const testPort = await findTestPort("UNIT_TEST_SERVERS");
      const server = await LocalHttpServer.getInstance(testSessionId);
      await server.start({ port: testPort });

      expect(server).toBeDefined();
      expect(typeof server.serveFile).toBe("function");
      expect(typeof server.stop).toBe("function");
    });

    it("should reuse existing server instance for same session", async () => {
      const server1 = await LocalHttpServer.getInstance(testSessionId);
      const server2 = await LocalHttpServer.getInstance(testSessionId);

      expect(server1).toBe(server2);
    });

    it("should create separate instances for different sessions", async () => {
      const server1 = await LocalHttpServer.getInstance("session-1");
      const server2 = await LocalHttpServer.getInstance("session-2");

      expect(server1).not.toBe(server2);
    });
  });

  describe("File Serving Functionality", () => {
    it("should serve existing files and return valid URLs", async () => {
      const server = await LocalHttpServer.getInstance(testSessionId);

      const result = await server.serveFile(testPdfPath);

      expect(result).toHaveProperty("url");
      expect(result).toHaveProperty("serverId", testSessionId);
      expect(result).toHaveProperty("port");
      expect(typeof result.port).toBe("number");
      expect(result.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/serve\/\w+$/);
    });

    it("should throw error for non-existent files", async () => {
      const server = await LocalHttpServer.getInstance(testSessionId);
      const nonExistentPath = "/path/to/nonexistent.pdf";

      await expect(server.serveFile(nonExistentPath)).rejects.toThrow("File not found");
    });

    it("should generate unique file IDs for different files", async () => {
      const server = await LocalHttpServer.getInstance(testSessionId);

      // Create second test file
      const secondPdfPath = join(testConfig.paths.assets, "test2.pdf");
      writeFileSync(secondPdfPath, "second dummy PDF content");

      const result1 = await server.serveFile(testPdfPath);
      const result2 = await server.serveFile(secondPdfPath);

      const fileId1 = result1.url.split("/").pop();
      const fileId2 = result2.url.split("/").pop();

      expect(fileId1).not.toBe(fileId2);
      expect(fileId1).toBeDefined();
      expect(fileId2).toBeDefined();
    });
  });

  describe("PDF.js Asset Management", () => {
    it("should detect PDF.js assets availability", async () => {
      const server = await LocalHttpServer.getInstance(testSessionId);

      // PDF.js assets were set up in setupTestAssets
      // This should not throw an error
      await expect(server.servePdfWithViewer(testPdfPath)).resolves.toBeDefined();
    });

    it("should generate PDF viewer URLs correctly", async () => {
      const server = await LocalHttpServer.getInstance(testSessionId);

      const result = await server.servePdfWithViewer(testPdfPath);

      expect(result).toHaveProperty("url");
      expect(result).toHaveProperty("serverId", testSessionId);
      expect(result).toHaveProperty("port");
      expect(result.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/viewer\/pdf\/\w+$/);
    });

    it("should handle missing PDF.js assets gracefully", async () => {
      // Remove PDF.js assets
      const pdfJsDir = join(testConfig.paths.assets, "pdfjs");
      rmSync(pdfJsDir, { recursive: true, force: true });

      const server = await LocalHttpServer.getInstance(`${testSessionId}-no-assets`);

      await expect(server.servePdfWithViewer(testPdfPath)).rejects.toThrow(
        "PDF.js assets not found",
      );
    });
  });

  describe("HTTP Request Handling", () => {
    it("should serve registered files via HTTP", async () => {
      const server = await LocalHttpServer.getInstance(testSessionId);
      const result = await server.serveFile(testPdfPath);

      // Make actual HTTP request to the server
      const response = await fetch(result.url);

      expect(response.status).toBe(200);
      const content = await response.text();
      expect(content).toBe("dummy PDF content for testing");
    });

    it("should return 404 for unregistered file IDs", async () => {
      const server = await LocalHttpServer.getInstance(testSessionId);

      // Get server port but don't register any files
      await server.serveFile(testPdfPath); // This starts the server
      const port = (await server.serveFile(testPdfPath)).port;

      const invalidUrl = `http://127.0.0.1:${port}/serve/invalid-file-id`;
      const response = await fetch(invalidUrl);

      expect(response.status).toBe(404);
    });

    it("should handle CORS preflight requests", async () => {
      const server = await LocalHttpServer.getInstance(testSessionId);
      const result = await server.serveFile(testPdfPath);

      const response = await fetch(result.url, { method: "OPTIONS" });

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain("GET");
    });

    it("should serve PDF.js assets", async () => {
      const server = await LocalHttpServer.getInstance(testSessionId);

      // Start server by serving a file first
      await server.serveFile(testPdfPath);
      const port = (await server.serveFile(testPdfPath)).port;

      // Request PDF.js asset
      const pdfJsUrl = `http://127.0.0.1:${port}/assets/pdf.js/pdf.min.mjs`;
      const response = await fetch(pdfJsUrl);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/javascript");
      const content = await response.text();
      expect(content).toContain("Mock PDF.js for testing");
    });

    it("should serve PDF viewer HTML", async () => {
      const server = await LocalHttpServer.getInstance(testSessionId);
      const result = await server.servePdfWithViewer(testPdfPath);

      const response = await fetch(result.url);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/html");
      const content = await response.text();
      expect(content).toContain("<!DOCTYPE html>");
      expect(content).toContain("pdf-container");
      expect(content).toContain("/assets/pdf.js/pdf.min.mjs");
    });
  });

  describe("Server Lifecycle", () => {
    it("should stop server cleanly", async () => {
      const server = await LocalHttpServer.getInstance(testSessionId);
      await server.serveFile(testPdfPath);

      // Server should be running
      const result = await server.serveFile(testPdfPath);
      let response = await fetch(result.url);
      expect(response.status).toBe(200);

      // Stop server
      await server.stop();

      // Server should no longer respond
      try {
        response = await fetch(result.url);
        expect(response.status).not.toBe(200);
      } catch (error) {
        // Connection refused is expected after stopping
        expect(error).toBeDefined();
      }
    });

    it("should handle port conflicts gracefully", async () => {
      // Create server with specific port in test range
      const _testPort = await findTestPort("UNIT_TEST_SERVERS");

      const server1 = await LocalHttpServer.getInstance(`${testSessionId}-1`);
      const server2 = await LocalHttpServer.getInstance(`${testSessionId}-2`);

      // Both servers should start successfully (on different ports)
      const result1 = await server1.serveFile(testPdfPath);
      const result2 = await server2.serveFile(testPdfPath);

      expect(result1.port).not.toBe(result2.port);
      expect(result1.url).not.toBe(result2.url);
    });
  });

  describe("Security Validation", () => {
    it("should only accept localhost connections", async () => {
      const server = await LocalHttpServer.getInstance(testSessionId);
      const result = await server.serveFile(testPdfPath);

      // Create request with non-localhost host header
      const response = await fetch(result.url, {
        headers: { Host: "evil.com" },
      });

      expect(response.status).toBe(403);
      const content = await response.text();
      expect(content).toBe("Forbidden");
    });

    it("should validate file paths for directory traversal", async () => {
      const server = await LocalHttpServer.getInstance(testSessionId);

      // This should fail before even getting to path traversal
      await expect(server.serveFile("../../../etc/passwd")).rejects.toThrow("File not found");
    });
  });
});
