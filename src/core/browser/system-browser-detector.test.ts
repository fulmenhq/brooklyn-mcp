/**
 * Tests for SystemBrowserDetector
 * Verifies system browser detection across platforms
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock child_process to prevent shell execution of browser paths during version checks
// The exec mock must work with util.promisify - callback signature: (cmd, opts?, callback?)
vi.mock("node:child_process", () => ({
  execSync: vi.fn(() => "Chromium 120.0.6099.129"),
  exec: vi.fn((...args: unknown[]) => {
    // util.promisify passes callback as last argument
    const callback = args[args.length - 1];
    if (typeof callback === "function") {
      setImmediate(() => callback(null, "Chromium 120.0.6099.129", ""));
    }
  }),
  spawn: vi.fn(),
}));

import { SystemBrowserDetector } from "./system-browser-detector.js";

// Mock modules
vi.mock("node:fs/promises", () => ({
  access: vi.fn(),
  constants: { X_OK: 1 },
}));

vi.mock("node:os", () => ({
  platform: vi.fn(),
  homedir: vi.fn(),
}));

// Mock logger
vi.mock("../../shared/pino-logger.js", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe("SystemBrowserDetector", () => {
  let detector: SystemBrowserDetector;
  let mockAccess: any;
  let mockPlatform: any;
  let mockHomedir: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get mocked functions
    const { access } = await import("node:fs/promises");
    const { platform, homedir } = await import("node:os");

    mockAccess = vi.mocked(access);
    mockPlatform = vi.mocked(platform);
    mockHomedir = vi.mocked(homedir);

    // Default platform setup
    mockPlatform.mockReturnValue("darwin");
    mockHomedir.mockReturnValue("/Users/test");

    detector = new SystemBrowserDetector();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("detectBrowser", () => {
    it("should detect Chrome on macOS", async () => {
      const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

      mockAccess.mockImplementation((path: string) => {
        if (path === chromePath) {
          return Promise.resolve();
        }
        return Promise.reject(new Error("Not found"));
      });

      const result = await detector.detectBrowser("chromium");

      expect(result).toBeTruthy();
      expect(result?.type).toBe("chromium");
      expect(result?.executablePath).toBe(chromePath);
      expect(result?.isUsable).toBe(true);
    });

    it("should detect Firefox on Linux", async () => {
      mockPlatform.mockReturnValue("linux");
      detector = new SystemBrowserDetector(); // Recreate with Linux platform

      const firefoxPath = "/usr/bin/firefox";

      mockAccess.mockImplementation((path: string) => {
        if (path === firefoxPath) {
          return Promise.resolve();
        }
        return Promise.reject(new Error("Not found"));
      });

      const result = await detector.detectBrowser("firefox");

      expect(result).toBeTruthy();
      expect(result?.type).toBe("firefox");
      expect(result?.executablePath).toBe(firefoxPath);
      expect(result?.isUsable).toBe(true);
    });

    it("should return null if browser not found", async () => {
      mockAccess.mockRejectedValue(new Error("Not found"));

      const result = await detector.detectBrowser("webkit");

      expect(result).toBeNull();
    });

    it("should expand home directory in paths", async () => {
      const expandedPath =
        "/Users/test/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

      mockAccess.mockImplementation((path: string) => {
        if (path === expandedPath) {
          return Promise.resolve();
        }
        return Promise.reject(new Error("Not found"));
      });

      const result = await detector.detectBrowser("chromium");

      expect(result?.executablePath).toBe(expandedPath);
    });

    it("should cache detection results", async () => {
      const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

      mockAccess.mockImplementation((path: string) => {
        if (path === chromePath) {
          return Promise.resolve();
        }
        return Promise.reject(new Error("Not found"));
      });

      // First call
      await detector.detectBrowser("chromium");

      // Clear mocks to verify cache is used
      mockAccess.mockClear();

      // Second call should use cache
      const result = await detector.detectBrowser("chromium");

      expect(result).toBeTruthy();
      expect(mockAccess).not.toHaveBeenCalled();
    });
  });

  describe("detectAllBrowsers", () => {
    it("should detect all available browsers", async () => {
      const browsers = {
        chromium: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        firefox: "/Applications/Firefox.app/Contents/MacOS/firefox",
      };

      mockAccess.mockImplementation((path: string) => {
        if (Object.values(browsers).includes(path)) {
          return Promise.resolve();
        }
        return Promise.reject(new Error("Not found"));
      });

      const results = await detector.detectAllBrowsers();

      expect(results.size).toBe(2);
      expect(results.has("chromium")).toBe(true);
      expect(results.has("firefox")).toBe(true);
      expect(results.has("webkit")).toBe(false);
    });
  });

  describe("clearCache", () => {
    it("should clear cached results", async () => {
      const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

      mockAccess.mockImplementation((path: string) => {
        if (path === chromePath) {
          return Promise.resolve();
        }
        return Promise.reject(new Error("Not found"));
      });

      // First call to populate cache
      await detector.detectBrowser("chromium");

      // Clear cache
      detector.clearCache();

      // Clear mocks
      mockAccess.mockClear();

      // Next call should not use cache
      await detector.detectBrowser("chromium");

      expect(mockAccess).toHaveBeenCalled();
    });
  });

  describe("platform-specific behavior", () => {
    it("should handle Windows paths correctly", async () => {
      mockPlatform.mockReturnValue("win32");
      process.env["LOCALAPPDATA"] = "C:\\Users\\test\\AppData\\Local";
      detector = new SystemBrowserDetector();

      const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

      mockAccess.mockImplementation((path: string) => {
        if (path === chromePath) {
          return Promise.resolve();
        }
        return Promise.reject(new Error("Not found"));
      });

      const result = await detector.detectBrowser("chromium");

      expect(result?.executablePath).toBe(chromePath);
    });

    it("should return null for unsupported platform", async () => {
      mockPlatform.mockReturnValue("freebsd");
      detector = new SystemBrowserDetector();

      mockAccess.mockRejectedValue(new Error("Not found"));

      const result = await detector.detectBrowser("chromium");

      expect(result).toBeNull();
    });
  });
});
