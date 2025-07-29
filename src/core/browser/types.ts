/**
 * Type definitions for Brooklyn Enterprise Browser Infrastructure
 * Architecture Committee approved design patterns
 */

export type BrowserType = "chromium" | "firefox" | "webkit";

export interface BrowserInstallationStatus {
  installed: boolean;
  version?: string;
  path?: string;
  lastChecked: Date;
}

export interface BrowserInstallationProgress {
  phase: "checking" | "downloading" | "extracting" | "verifying" | "complete" | "failed";
  progress: number; // 0-100
  message: string;
  bytesDownloaded?: number;
  totalBytes?: number;
  estimatedTimeRemaining?: number; // seconds
}

export interface SystemBrowserInfo {
  type: BrowserType;
  executablePath: string;
  version?: string;
  isUsable: boolean;
}

export interface BrowserInstallationOptions {
  browserType: BrowserType;
  interactive?: boolean;
  forceReinstall?: boolean;
  installPath?: string;
  onProgress?: (progress: BrowserInstallationProgress) => void;
  silent?: boolean;
  skipProgress?: boolean;
}

export interface BrowserAvailabilityResult {
  isAvailable: boolean;
  source: "installed" | "system" | "none";
  executablePath?: string;
  version?: string;
  requiresInstallation: boolean;
}

export interface InstallationStrategy {
  name: "local" | "system" | "download";
  priority: number;
  check(): Promise<boolean>;
  execute(): Promise<string>; // Returns executable path
}

export interface BrowserLaunchOptions {
  headless?: boolean;
  args?: string[];
  executablePath?: string;
  timeout?: number;
  devtools?: boolean;
  slowMo?: number;
  defaultViewport?: {
    width: number;
    height: number;
  };
  ignoreHTTPSErrors?: boolean;
  userDataDir?: string;
}

// Team-specific browser configuration (future use)
export interface TeamBrowserConfig {
  teamId: string;
  maxConcurrentBrowsers: number;
  idleTimeout: number;
  allowedDomains: string[];
  resourceQuota: {
    maxMemoryMB: number;
    maxCPUPercent: number;
  };
  failurePolicy: "circuit-break" | "degrade" | "queue";
}

// Browser instance metadata
export interface BrowserInstanceMetadata {
  id: string;
  type: BrowserType;
  teamId?: string;
  createdAt: Date;
  lastUsed: Date;
  isHealthy: boolean;
  memoryUsage?: number;
  cpuUsage?: number;
}

// Installation cache for tracking what's installed
export interface InstallationCache {
  [key: string]: BrowserInstallationStatus;
}

// Error types for better error handling
export class BrowserInstallationError extends Error {
  public readonly code: string;
  public readonly browserType: BrowserType;
  public override readonly cause?: Error;

  constructor(message: string, code: string, browserType: BrowserType, cause?: Error) {
    super(message);
    this.name = "BrowserInstallationError";
    this.code = code;
    this.browserType = browserType;
    this.cause = cause;
  }
}

export class BrowserNotFoundError extends Error {
  constructor(
    public readonly browserType: BrowserType,
    public readonly searchedPaths: string[],
  ) {
    super(`Browser ${browserType} not found in paths: ${searchedPaths.join(", ")}`);
    this.name = "BrowserNotFoundError";
  }
}

// Constants
export const BROWSER_INSTALL_TIMEOUT = 5 * 60 * 1000; // 5 minutes
export const BROWSER_HEALTH_CHECK_INTERVAL = 30 * 1000; // 30 seconds
export const BROWSER_IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes
export const MAX_INSTALLATION_RETRIES = 3;

// Platform-specific paths
export const PLATFORM_BROWSER_PATHS: Record<string, Record<BrowserType, string[]>> = {
  darwin: {
    chromium: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "~/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "~/Applications/Chromium.app/Contents/MacOS/Chromium",
    ],
    firefox: [
      "/Applications/Firefox.app/Contents/MacOS/firefox",
      "~/Applications/Firefox.app/Contents/MacOS/firefox",
    ],
    webkit: [
      "/Applications/Safari.app/Contents/MacOS/Safari",
      // Note: Safari can't be automated directly, Playwright provides its own WebKit
    ],
  },
  linux: {
    chromium: [
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/snap/bin/chromium",
    ],
    firefox: ["/usr/bin/firefox", "/snap/bin/firefox"],
    webkit: [
      // WebKit is typically provided by Playwright on Linux
    ],
  },
  win32: {
    chromium: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "%LOCALAPPDATA%\\Google\\Chrome\\Application\\chrome.exe",
    ],
    firefox: [
      "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
      "C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe",
    ],
    webkit: [
      // WebKit is provided by Playwright on Windows
    ],
  },
};
