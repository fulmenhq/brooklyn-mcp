/**
 * Configuration management for Fulmen MCP Brooklyn
 * Centralized configuration with template variable support
 */

import type { Config } from "../ports/config";
// Template variables for service identity
const templateVars = {
  SERVICE_NAME: "fulmen-brooklyn",
  DISPLAY_NAME: "Fulmen MCP Brooklyn",
};

function getEnvVar(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue === undefined) {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    return defaultValue;
  }
  return value;
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid number`);
  }
  return parsed;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === "true";
}

export const config: Config = {
  // Service identity
  serviceName: templateVars.SERVICE_NAME,
  displayName: templateVars.DISPLAY_NAME,
  version: getEnvVar("WEBPILOT_VERSION", "1.0.0"),

  // Environment
  environment: getEnvVar("WEBPILOT_ENV", "development"),
  port: getEnvNumber("WEBPILOT_PORT", 3000),

  // Browser configuration
  maxBrowsers: getEnvNumber("WEBPILOT_MAX_BROWSERS", 10),
  browserTimeout: getEnvNumber("WEBPILOT_BROWSER_TIMEOUT", 30000),
  headless: getEnvBoolean("WEBPILOT_HEADLESS", true),

  // Security
  rateLimitRequests: getEnvNumber("WEBPILOT_RATE_LIMIT_REQUESTS", 100),
  rateLimitWindow: getEnvNumber("WEBPILOT_RATE_LIMIT_WINDOW", 60000),
  allowedDomains: getEnvVar("WEBPILOT_ALLOWED_DOMAINS", "").split(",").filter(Boolean),

  // Paths
  configPath: getEnvVar("WEBPILOT_CONFIG_PATH", "./configs"),

  // Logging
  logLevel: getEnvVar("WEBPILOT_LOG_LEVEL", "info"),
};
