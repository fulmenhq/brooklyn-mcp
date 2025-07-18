/**
 * Test setup file for Brooklyn MCP server
 *
 * This file runs before all tests to set up the testing environment.
 */

import { vi } from "vitest";

// Mock environment variables for testing
vi.stubEnv("BROOKLYN_MCP_PORT", "50000");
vi.stubEnv("BROOKLYN_ENVIRONMENT", "test");
vi.stubEnv("BROOKLYN_LOG_LEVEL", "error");
vi.stubEnv("BROOKLYN_HEADLESS", "true");
vi.stubEnv("BROOKLYN_MAX_BROWSERS", "2");

// Global test timeout
vi.setConfig({ testTimeout: 10000 });
