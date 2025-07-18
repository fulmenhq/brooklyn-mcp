/**
 * Browser management interfaces for Fulmen MCP Brooklyn
 */

export interface BrowserInstance {
  id: string;
  type: BrowserType;
  teamId: string;
  createdAt: Date;
  lastUsed: Date;
  browser: unknown; // Playwright browser instance
  context?: unknown; // Browser context
}

export interface BrowserPool {
  acquire(teamId: string, type: BrowserType): Promise<BrowserInstance>;
  release(teamId: string, browserId: string): Promise<void>;
  cleanup(): Promise<void>;
  getUsage(teamId?: string): Promise<UsageMetrics>;
  getAvailableBrowsers(): Promise<number>;
}

export interface UsageMetrics {
  count: number;
  totalMemory: number;
  averageLifetime: number;
  errorRate: number;
}

export type BrowserType = "chromium" | "firefox" | "webkit";

export interface NavigateOptions {
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
  timeout?: number;
}

export interface ScreenshotOptions {
  fullPage?: boolean;
  quality?: number;
  format?: "png" | "jpeg";
  clip?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
