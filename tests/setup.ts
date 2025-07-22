/**
 * Test setup file for Brooklyn MCP server
 *
 * This file runs before all tests to set up the testing environment.
 * CRITICAL: Initializes structured logger to prevent "Logger registry not initialized" errors.
 */

import { vi } from "vitest";
import { initializeLogging } from "../src/shared/structured-logger.js";

// Mock environment variables for testing
vi.stubEnv("BROOKLYN_MCP_PORT", "50000");
vi.stubEnv("BROOKLYN_ENVIRONMENT", "test");
vi.stubEnv("BROOKLYN_LOG_LEVEL", "error");
vi.stubEnv("BROOKLYN_HEADLESS", "true");
vi.stubEnv("BROOKLYN_MAX_BROWSERS", "2");

// Initialize structured logger for all tests (winston eliminated)
const testConfig = {
  serviceName: "brooklyn-test",
  version: "test",
  environment: "test",
  teamId: "test-team",
  logging: {
    level: "error", // Minimal logging during tests
    format: "json" as const,
    maxFiles: 1,
    maxSize: "10MB",
  },
  transports: {
    mcp: { enabled: false }, // No MCP transport in tests
    web: { enabled: false },
  },
  browsers: {
    maxInstances: 2,
    defaultType: "chromium" as const,
    headless: true,
    timeout: 5000,
  },
  security: {
    allowedDomains: ["*"],
    rateLimit: {
      requests: 1000,
      windowMs: 60000,
    },
  },
  plugins: {
    directory: "",
    autoLoad: false,
    allowUserPlugins: false,
  },
  paths: {
    config: "",
    logs: "",
    data: "",
  },
};

// Initialize logging before any tests run
initializeLogging(testConfig as any);

// Global test timeout
vi.setConfig({ testTimeout: 10000 });
