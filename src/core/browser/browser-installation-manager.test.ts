/**
 * Tests for BrowserInstallationManager
 * Verifies progressive installation and fallback strategies
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserInstallationManager } from "./browser-installation-manager.js";
import type { SystemBrowserInfo } from "./types.js";

// Mock the system detector first
let mockSystemDetector: any;

vi.mock("./system-browser-detector.js", () => ({
  SystemBrowserDetector: vi.fn(),
  getSystemBrowserDetector: vi.fn(() => mockSystemDetector),
}));

// Mock modules
vi.mock("playwright", () => ({
  chromium: {
    executablePath: vi.fn(),
    launch: vi.fn(),
  },
  firefox: {
    executablePath: vi.fn(),
    launch: vi.fn(),
  },
  webkit: {
    executablePath: vi.fn(),
    launch: vi.fn(),
  },
}));

// Mock file system
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  access: vi.fn(),
  constants: { X_OK: 1 },
  readFile: vi.fn(),
  writeFile: vi.fn(),
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

describe("BrowserInstallationManager", () => {
  let manager: BrowserInstallationManager;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock system detector
    mockSystemDetector = {
      detectBrowser: vi.fn(),
    };

    // Create manager instance
    manager = new BrowserInstallationManager("/tmp/test-browsers");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("ensureBrowserAvailable", () => {
    it("should return installed browser if already available", async () => {
      const mockPath = "/path/to/chromium";
      const { chromium } = await import("playwright");
      const { existsSync } = await import("node:fs");

      vi.mocked(chromium.executablePath).mockReturnValue(mockPath);
      vi.mocked(existsSync).mockReturnValue(true);

      const result = await manager.ensureBrowserAvailable("chromium");

      expect(result).toEqual({
        isAvailable: true,
        source: "installed",
        executablePath: mockPath,
        requiresInstallation: false,
      });
    });

    it("should use system browser as fallback", async () => {
      const mockSystemBrowser: SystemBrowserInfo = {
        type: "firefox",
        executablePath: "/usr/bin/firefox",
        version: "121.0",
        isUsable: true,
      };

      const { firefox } = await import("playwright");
      const { existsSync } = await import("node:fs");

      vi.mocked(firefox.executablePath).mockReturnValue("");
      vi.mocked(existsSync).mockReturnValue(false);
      mockSystemDetector.detectBrowser.mockResolvedValue(mockSystemBrowser);

      const result = await manager.ensureBrowserAvailable("firefox");

      expect(result).toEqual({
        isAvailable: true,
        source: "system",
        executablePath: "/usr/bin/firefox",
        version: "121.0",
        requiresInstallation: false,
      });
    });

    it("should indicate installation required in non-interactive mode", async () => {
      const { webkit } = await import("playwright");
      const { existsSync } = await import("node:fs");

      vi.mocked(webkit.executablePath).mockReturnValue("");
      vi.mocked(existsSync).mockReturnValue(false);
      mockSystemDetector.detectBrowser.mockResolvedValue(null);

      const result = await manager.ensureBrowserAvailable("webkit", {
        interactive: false,
      });

      expect(result).toEqual({
        isAvailable: false,
        source: "none",
        requiresInstallation: true,
      });
    });
  });

  describe("getBrowserStatus", () => {
    it("should return installed status for available browser", async () => {
      const mockPath = "/path/to/webkit";
      const { webkit } = await import("playwright");
      const { existsSync } = await import("node:fs");
      const { access } = await import("node:fs/promises");

      vi.mocked(webkit.executablePath).mockReturnValue(mockPath);
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(access).mockResolvedValue(undefined);

      const status = await manager.getBrowserStatus("webkit");

      expect(status.installed).toBe(true);
      expect(status.path).toBe(mockPath);
    });

    it("should return not installed status for unavailable browser", async () => {
      const { firefox } = await import("playwright");
      const { existsSync } = await import("node:fs");

      vi.mocked(firefox.executablePath).mockReturnValue("");
      vi.mocked(existsSync).mockReturnValue(false);

      const status = await manager.getBrowserStatus("firefox");

      expect(status.installed).toBe(false);
      expect(status.path).toBeUndefined();
    });
  });

  describe("getAllBrowserStatus", () => {
    it("should return status for all browser types", async () => {
      const { chromium, firefox, webkit } = await import("playwright");
      const { existsSync } = await import("node:fs");

      vi.mocked(chromium.executablePath).mockReturnValue("/path/to/chromium");
      vi.mocked(firefox.executablePath).mockReturnValue("");
      vi.mocked(webkit.executablePath).mockReturnValue("");

      vi.mocked(existsSync).mockImplementation((path) => {
        return path === "/path/to/chromium";
      });

      const statuses = await manager.getAllBrowserStatus();

      expect(statuses.chromium.installed).toBe(true);
      expect(statuses.firefox.installed).toBe(false);
      expect(statuses.webkit.installed).toBe(false);
    });
  });
});
