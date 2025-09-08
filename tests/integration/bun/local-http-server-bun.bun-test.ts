/**
 * Strategic Bun Integration Tests for LocalHttpServer
 *
 * Tests Bun-specific runtime APIs that cannot be tested in Vitest:
 * - Bun.serve() HTTP server creation and management
 * - Bun.hash() secure file ID generation
 * - Bun.file() file serving operations
 * - Port allocation and management
 *
 * Run with: bun test tests/integration/bun/local-http-server-bun.bun-test.ts
 *
 * TECH DEBT: Skipped for v1.6.0 release due to port conflicts and test environment issues.
 * These tests require dedicated port management and may conflict in CI environments.
 * Core LocalHttpServer functionality is covered by unit and vitest-based integration tests.
 * TODO: Re-enable after implementing proper test port isolation and CI stability improvements.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalHttpServer } from "../../../src/core/utilities/local-http-server.js";

// Test configuration
const TEST_TIMEOUT = 10000; // 10s timeout for HTTP operations
const TEST_PORTS = [8085, 8086, 8087, 8088, 8089]; // Dedicated port range for Bun tests
const TEST_DIR = join(tmpdir(), "brooklyn-bun-integration-tests");

describe.skip("LocalHttpServer Bun Integration Tests", () => {
  let testServer: LocalHttpServer;
  let testFilePath: string;

  beforeAll(async () => {
    // Create test directory
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }

    // Create test file
    testFilePath = join(TEST_DIR, "test-file.txt");
    writeFileSync(testFilePath, "Hello Brooklyn MCP!");
  });

  beforeEach(async () => {
    // Clean up any existing instances
    await LocalHttpServer.stopAll();
    // Wait for cleanup to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    // Clean up after each test
    if (testServer) {
      await testServer.stop();
      testServer = undefined as any;
    }
    await LocalHttpServer.stopAll();
    // Wait for cleanup to complete
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("Bun.serve() HTTP Server Management", () => {
    test(
      "should create HTTP server with Bun.serve() on specified port",
      async () => {
        const testPort = TEST_PORTS[0];
        // Direct construction to control port configuration
        testServer = new (LocalHttpServer as any)(`bun-serve-test-${Date.now()}`);

        await testServer.start({ port: testPort });
        const status = testServer.getStatus();

        expect(status.running).toBe(true);
        expect(status.port).toBeDefined();
        // Port validation: server.start() guarantees port is set
        expect(status.port).not.toBeUndefined();
        expect(String(status.port)).toBe(String(testPort));

        // Verify server responds to health check (port is guaranteed to be set after start)
        const response = await fetch(`http://127.0.0.1:${status.port!}/health`);
        expect(response.ok).toBe(true);

        const health = await response.json();
        expect(health.status).toBe("ok");
        expect(health.port).toBe(testPort);
      },
      TEST_TIMEOUT,
    );

    test(
      "should auto-find available port when none specified",
      async () => {
        testServer = await LocalHttpServer.getInstance(`bun-auto-port-test-${Date.now()}`);

        await testServer.start(); // No port specified
        const status = testServer.getStatus();

        expect(status.running).toBe(true);
        expect(status.port).toBeTypeOf("number");
        expect(status.port).toBeGreaterThan(8000);

        // Verify server is accessible on the assigned port
        const response = await fetch(`http://127.0.0.1:${status.port}/health`);
        expect(response.ok).toBe(true);
      },
      TEST_TIMEOUT,
    );

    test(
      "should handle concurrent server instances with different ports",
      async () => {
        // Direct construction to control port configuration
        const now = Date.now();
        const server1 = new (LocalHttpServer as any)(`bun-concurrent-1-${now}`);
        const server2 = new (LocalHttpServer as any)(`bun-concurrent-2-${now}`);

        await server1.start({ port: TEST_PORTS[1] });
        await server2.start({ port: TEST_PORTS[2] });

        const status1 = server1.getStatus();
        const status2 = server2.getStatus();

        expect(status1.running).toBe(true);
        expect(status2.running).toBe(true);
        expect(status1.port).toBe(TEST_PORTS[1]);
        expect(status2.port).toBe(TEST_PORTS[2]);
        expect(status1.port).not.toBe(status2.port);

        // Verify both servers respond independently
        const response1 = await fetch(`http://127.0.0.1:${status1.port}/health`);
        const response2 = await fetch(`http://127.0.0.1:${status2.port}/health`);

        expect(response1.ok).toBe(true);
        expect(response2.ok).toBe(true);

        await server1.stop();
        await server2.stop();
      },
      TEST_TIMEOUT,
    );
  });

  describe("Bun.hash() File ID Generation", () => {
    test(
      "should generate consistent file IDs using Bun.hash()",
      async () => {
        testServer = await LocalHttpServer.getInstance(`bun-hash-test-${Date.now()}`);
        await testServer.start({ port: TEST_PORTS[3] });

        // Register same file multiple times
        const result1 = await testServer.serveFile(testFilePath);
        const result2 = await testServer.serveFile(testFilePath);

        // Should generate different IDs due to timestamp in hash
        expect(result1.url).toMatch(/\/serve\/[a-z0-9]{1,16}$/);
        expect(result2.url).toMatch(/\/serve\/[a-z0-9]{1,16}$/);
        expect(result1.url).not.toBe(result2.url); // Different due to timestamp
      },
      TEST_TIMEOUT,
    );

    test(
      "should generate secure file IDs with proper entropy",
      async () => {
        testServer = await LocalHttpServer.getInstance(`bun-entropy-test-${Date.now()}`);
        await testServer.start({ port: TEST_PORTS[4] });

        const fileIds = new Set<string>();
        const iterations = 50;

        // Generate multiple file IDs
        for (let i = 0; i < iterations; i++) {
          const result = await testServer.serveFile(testFilePath);
          const fileId = result.url.split("/").pop();
          expect(fileId).toMatch(/^[a-z0-9]{1,16}$/);
          fileIds.add(fileId as string);
        }

        // All file IDs should be unique (good entropy)
        expect(fileIds.size).toBe(iterations);
      },
      TEST_TIMEOUT,
    );
  });

  describe("Bun.file() File Serving Operations", () => {
    test(
      "should serve files using Bun.file() with proper headers",
      async () => {
        testServer = new (LocalHttpServer as any)(`bun-file-test-${Date.now()}`);
        await testServer.start({ port: TEST_PORTS[3] }); // Use a different port

        const result = await testServer.serveFile(testFilePath);

        // Fetch the served file
        const response = await fetch(result.url);
        expect(response.ok).toBe(true);
        expect(response.headers.get("content-type")).toContain("text/plain");
        expect(response.headers.get("cache-control")).toBe("no-cache");
        expect(response.headers.get("access-control-allow-origin")).toBe("*");

        const content = await response.text();
        expect(content).toBe("Hello Brooklyn MCP!");
      },
      TEST_TIMEOUT,
    );

    test(
      "should handle PDF files with proper content-type and disposition",
      async () => {
        // Create a mock PDF file
        const pdfPath = join(TEST_DIR, "test.pdf");
        writeFileSync(pdfPath, "%PDF-1.4\nHello PDF!");

        testServer = new (LocalHttpServer as any)(`bun-pdf-test-${Date.now()}`);
        await testServer.start({ port: TEST_PORTS[4] }); // Use a different port

        const result = await testServer.serveFile(pdfPath);
        const response = await fetch(result.url);

        expect(response.ok).toBe(true);
        expect(response.headers.get("content-type")).toBe("application/pdf");
        expect(response.headers.get("content-disposition")).toBe("inline");
      },
      TEST_TIMEOUT,
    );

    test(
      "should return 404 for non-existent files",
      async () => {
        testServer = await LocalHttpServer.getInstance(`bun-404-test-${Date.now()}`);
        await testServer.start({ port: TEST_PORTS[2] });

        const nonExistentPath = join(TEST_DIR, "does-not-exist.txt");

        await expect(testServer.serveFile(nonExistentPath)).rejects.toThrow(
          `File not found: ${nonExistentPath}`,
        );
      },
      TEST_TIMEOUT,
    );
  });

  describe("HTTP Transport Protocol Validation", () => {
    test(
      "should enforce localhost-only access with Bun.serve()",
      async () => {
        // Use a unique port to avoid conflicts
        const securityTestPort = 8090; // Outside TEST_PORTS range
        testServer = new (LocalHttpServer as any)(`bun-security-test-${Date.now()}`);
        await testServer.start({ port: securityTestPort });

        const result = await testServer.serveFile(testFilePath);

        // Valid localhost request should work
        const validResponse = await fetch(result.url, {
          headers: { host: `127.0.0.1:${securityTestPort}` },
        });
        expect(validResponse.ok).toBe(true);

        // Invalid host header should be rejected
        const invalidResponse = await fetch(result.url, {
          headers: { host: "example.com:8080" },
        });
        expect(invalidResponse.status).toBe(403);
        expect(await invalidResponse.text()).toBe("Forbidden");
      },
      TEST_TIMEOUT,
    );

    test(
      "should handle CORS preflight requests properly",
      async () => {
        testServer = new (LocalHttpServer as any)(`bun-cors-test-${Date.now()}`);
        await testServer.start({ port: TEST_PORTS[4] });

        // OPTIONS preflight request
        const optionsResponse = await fetch(`http://127.0.0.1:${TEST_PORTS[4]}/health`, {
          method: "OPTIONS",
        });

        expect(optionsResponse.status).toBe(204);
        expect(optionsResponse.headers.get("access-control-allow-origin")).toBe("*");
        expect(optionsResponse.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
      },
      TEST_TIMEOUT,
    );
  });

  describe("Performance and Resource Management", () => {
    test(
      "should handle rapid server start/stop cycles efficiently",
      async () => {
        const cycles = 10;
        const startTime = Date.now();

        for (let i = 0; i < cycles; i++) {
          const server = new (LocalHttpServer as any)(`bun-cycle-${i}-${Date.now()}`);
          await server.start({ port: TEST_PORTS[0]! + (i % 2) }); // Alternate between two ports
          await server.stop();
        }

        const elapsed = Date.now() - startTime;
        expect(elapsed).toBeLessThan(5000); // Should complete within 5 seconds

        // Verify all instances are cleaned up
        const instances = (LocalHttpServer as any).instances;
        expect(instances.size).toBe(0);
      },
      TEST_TIMEOUT,
    );

    test(
      "should benchmark Bun.hash() performance",
      async () => {
        const iterations = 1000;
        const testString = "test-file-path-for-hashing";
        const startTime = Date.now();

        for (let i = 0; i < iterations; i++) {
          const hash = Bun.hash(`${testString}-${i}`);
          expect(hash).toBeTypeOf("bigint"); // Bun.hash() returns bigint, not number
        }

        const elapsed = Date.now() - startTime;
        const opsPerSecond = iterations / (elapsed / 1000);

        // Should achieve > 10,000 ops/sec (Bun is fast!)
        expect(opsPerSecond).toBeGreaterThan(10000);
      },
      TEST_TIMEOUT,
    );
  });

  describe("Error Handling and Recovery", () => {
    test(
      "should handle port conflicts gracefully",
      async () => {
        const conflictPort = TEST_PORTS[0];

        // Start first server
        const server1 = new (LocalHttpServer as any)(`bun-conflict-1-${Date.now()}`);
        await server1.start({ port: conflictPort });

        // Attempt to start second server on same port
        const server2 = new (LocalHttpServer as any)(`bun-conflict-2-${Date.now()}`);

        await expect(server2.start({ port: conflictPort })).rejects.toThrow();

        await server1.stop();
      },
      TEST_TIMEOUT,
    );

    test(
      "should recover from server errors and restart cleanly",
      async () => {
        testServer = new (LocalHttpServer as any)(`bun-recovery-test-${Date.now()}`);
        await testServer.start({ port: TEST_PORTS[1] });

        // Force stop the underlying server (simulate crash)
        const serverField = (testServer as any).server;
        if (serverField) {
          serverField.stop();
        }

        // Should be able to restart
        await testServer.start({ port: TEST_PORTS[1] });
        const status = testServer.getStatus();
        expect(status.running).toBe(true);

        // Should respond to health checks
        const response = await fetch(`http://127.0.0.1:${TEST_PORTS[1]}/health`);
        expect(response.ok).toBe(true);
      },
      TEST_TIMEOUT,
    );
  });
});
