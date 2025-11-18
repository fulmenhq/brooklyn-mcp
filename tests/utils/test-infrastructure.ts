/**
 * Test Infrastructure for Brooklyn MCP
 * Provides proper port management, test caches, and server lifecycle
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrooklynConfig } from "../../src/core/config.js";

/**
 * Port range allocations to avoid conflicts:
 *
 * Production HTTP Transport: 3000 (or BROOKLYN_PORT)
 * Production Local HTTP Server: 8080-9000 (LocalHttpServer)
 * Test HTTP Servers: 10000-11000 (dedicated test range)
 * Integration Test Servers: 11000-12000 (for integration tests)
 */
export const TEST_PORT_RANGES = {
  /** Port range for unit test HTTP servers */
  UNIT_TEST_SERVERS: { start: 10000, end: 10999 },
  /** Port range for integration test HTTP servers */
  INTEGRATION_TEST_SERVERS: { start: 11000, end: 11999 },
  /** Port range for E2E test HTTP servers */
  E2E_TEST_SERVERS: { start: 12000, end: 12999 },
} as const;

/**
 * Test cache and directory locations
 */
export const TEST_LOCATIONS = {
  /** Temporary test cache root */
  TEST_CACHE_ROOT: join(tmpdir(), "brooklyn-test-cache"),
  /** Test assets directory */
  TEST_ASSETS: join(tmpdir(), "brooklyn-test-cache", "assets"),
  /** Test PDF fixtures */
  TEST_PDFS: join(tmpdir(), "brooklyn-test-cache", "pdfs"),
  /** Test browser data */
  TEST_BROWSERS: join(tmpdir(), "brooklyn-test-cache", "browsers"),
  /** Test screenshots */
  TEST_SCREENSHOTS: join(tmpdir(), "brooklyn-test-cache", "screenshots"),
} as const;

/**
 * Find available port in specified test range
 */
export async function findTestPort(range: keyof typeof TEST_PORT_RANGES): Promise<number> {
  const { start, end } = TEST_PORT_RANGES[range];

  for (let port = start; port <= end; port++) {
    try {
      // Test if port is available with Node.js net module in test environment
      const net = await import("node:net");
      return await new Promise<number>((resolve, reject) => {
        const server = net.createServer();
        server.once("error", () => {
          server.close();
          // Port is in use, continue to next
          reject(new Error("Port in use"));
        });
        server.once("listening", () => {
          server.close(() => resolve(port));
        });
        server.listen(port, "127.0.0.1");
      });
    } catch {}
  }

  throw new Error(`No available test ports in range ${start}-${end}`);
}

/**
 * Create test cache directories
 */
export function setupTestCache(): void {
  for (const dir of Object.values(TEST_LOCATIONS)) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Clean up test cache
 */
export function cleanupTestCache(): void {
  if (existsSync(TEST_LOCATIONS.TEST_CACHE_ROOT)) {
    rmSync(TEST_LOCATIONS.TEST_CACHE_ROOT, { recursive: true, force: true });
  }
}

/**
 * Create test-specific Brooklyn configuration
 */
export function createTestConfig(overrides?: Partial<BrooklynConfig>): BrooklynConfig {
  const testId = `test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const testCacheDir = join(TEST_LOCATIONS.TEST_CACHE_ROOT, testId);

  // Ensure test cache exists
  mkdirSync(testCacheDir, { recursive: true });

  return {
    serviceName: "brooklyn-test",
    version: "test",
    environment: "test",
    teamId: `test-team-${testId}`,
    devMode: true,

    transports: {
      mcp: { enabled: false },
      http: {
        enabled: false, // Disable HTTP transport in unit tests
        port: 50000, // Reserved test port from setup.ts
        host: "127.0.0.1",
        cors: true,
        rateLimiting: false,
      },
    },

    browsers: {
      maxInstances: 2, // Limited for testing
      defaultType: "chromium",
      headless: true,
      timeout: 10000, // Faster timeouts for tests
    },

    security: {
      allowedDomains: ["*"],
      rateLimit: {
        requests: 1000,
        windowMs: 60000,
      },
    },

    authentication: {
      mode: "none",
      developmentOnly: true,
      providers: {},
    },

    logging: {
      level: "error", // Minimal logging during tests
      format: "json",
      maxFiles: 1,
      maxSize: "10MB",
    },

    plugins: {
      directory: join(testCacheDir, "plugins"),
      autoLoad: false,
      allowUserPlugins: false,
    },

    paths: {
      config: testCacheDir,
      logs: join(testCacheDir, "logs"),
      plugins: join(testCacheDir, "plugins"),
      browsers: join(testCacheDir, "browsers"),
      assets: join(testCacheDir, "assets"),
      pids: join(testCacheDir, "pids"),
    },

    ...overrides,
  };
}

/**
 * Create mock PDF.js assets for testing
 */
export function setupTestAssets(assetsDir: string): void {
  const pdfJsDir = join(assetsDir, "pdfjs");
  mkdirSync(pdfJsDir, { recursive: true });

  // Create minimal mock PDF.js files
  writeFileSync(
    join(pdfJsDir, "pdf.min.mjs"),
    `
// Mock PDF.js for testing
export const pdfjsLib = {
  version: "4.8.69",
  GlobalWorkerOptions: { workerSrc: null },
  getDocument: () => ({ 
    promise: Promise.resolve({ 
      numPages: 3,
      getPage: (n) => Promise.resolve({
        pageNumber: n,
        getViewport: () => ({ width: 612, height: 792 }),
        getTextContent: () => Promise.resolve({
          items: [
            { str: "Test", transform: [12, 0, 0, 12, 72, 720] },
            { str: "Document", transform: [12, 0, 0, 12, 120, 720] }
          ]
        })
      })
    })
  })
};
export default pdfjsLib;
`,
    "utf8",
  );

  writeFileSync(
    join(pdfJsDir, "pdf.worker.min.mjs"),
    `
// Mock PDF.js Worker for testing
self.addEventListener("message", (e) => {
  if (e.data.type === "getDocument") {
    setTimeout(() => {
      self.postMessage({ 
        type: "documentLoaded", 
        data: { numPages: 3, fingerprint: "test-pdf" }
      });
    }, 10);
  }
});
self.postMessage({ type: "ready", data: { version: "4.8.69" } });
`,
    "utf8",
  );
}

/**
 * Test server lifecycle manager
 */
export class TestServerManager {
  private servers: Map<string, any> = new Map();
  private ports: Set<number> = new Set();

  /**
   * Start a test HTTP server
   */
  async startTestServer(
    id: string,
    range: keyof typeof TEST_PORT_RANGES = "UNIT_TEST_SERVERS",
  ): Promise<{ server: any; port: number; url: string }> {
    if (this.servers.has(id)) {
      throw new Error(`Test server ${id} already exists`);
    }

    const port = await findTestPort(range);
    this.ports.add(port);

    // Use Node.js HTTP server for test compatibility
    const http = await import("node:http");
    const server = http.createServer((req, res) => {
      // Basic test server - can be extended for specific test needs
      const url = new URL(req.url!, `http://127.0.0.1:${port}`);

      if (url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", server: id, port }));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Test Server");
    });

    // Start listening
    await new Promise<void>((resolve) => {
      server.listen(port, "127.0.0.1", resolve);
    });

    this.servers.set(id, server);

    return {
      server,
      port,
      url: `http://127.0.0.1:${port}`,
    };
  }

  /**
   * Stop specific test server
   */
  stopTestServer(id: string): void {
    const server = this.servers.get(id);
    if (server) {
      server.close();
      this.servers.delete(id);
    }
  }

  /**
   * Stop all test servers
   */
  stopAllServers(): void {
    for (const [_id, server] of this.servers) {
      server.close();
    }
    this.servers.clear();
    this.ports.clear();
  }

  /**
   * Get server info
   */
  getServer(id: string) {
    return this.servers.get(id);
  }

  /**
   * List active servers
   */
  listServers(): string[] {
    return Array.from(this.servers.keys());
  }
}

/**
 * Global test server manager instance
 */
export const testServerManager = new TestServerManager();

/**
 * Cleanup function for test teardown
 */
export async function testTeardown(): Promise<void> {
  // Stop all test servers
  testServerManager.stopAllServers();

  // Clean up test cache
  cleanupTestCache();

  // Small delay to ensure cleanup completes
  await new Promise((resolve) => setTimeout(resolve, 100));
}

/**
 * Setup function for test initialization
 */
export function testSetup(): void {
  // Setup test cache directories
  setupTestCache();
}
