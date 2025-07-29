/**
 * Configuration interfaces for Fulmen MCP Brooklyn
 */

export interface Config {
  // Service identity
  serviceName: string;
  displayName: string;
  version: string;

  // Environment
  environment: string;
  port: number;

  // Browser configuration
  maxBrowsers: number;
  browserTimeout: number;
  headless: boolean;
  allocationStrategy?: "round-robin" | "least-used" | "team-isolated";

  // Security
  rateLimitRequests: number;
  rateLimitWindow: number;
  allowedDomains: string[];

  // Paths
  configPath: string;

  // Logging
  logLevel: string;
}

export interface TeamConfig {
  id: string;
  name: string;
  allowedDomains?: string[];
  browserPreferences?: BrowserConfig;
  customTools?: string[];
  rateLimit?: RateLimitConfig;
  maxBrowsers?: number;
}

export interface BrowserConfig {
  headless?: boolean;
  timeout?: number;
  viewport?: {
    width: number;
    height: number;
  };
  userAgent?: string;
}

export interface RateLimitConfig {
  requests: number;
  window: number;
  enabled: boolean;
}
