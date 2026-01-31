/**
 * Vitest 4.x Workspace Configuration
 *
 * Separates test suites into dedicated projects with appropriate isolation:
 *
 * 1. "unit" - Unit tests and mock-based integration tests (parallel, fast)
 * 2. "process-spawn" - Tests that spawn child processes (sequential, isolated)
 *
 * This prevents state pollution between process-spawning tests (like stdout-purity)
 * and the rest of the suite. Process-spawning tests do aggressive cleanup that
 * can interfere with parallel test execution.
 *
 * @see .plans/active/v0.3.2/03-vitest-stdout-purity-stabilization.md
 */

import path from "node:path";
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    // Unit tests and mock-based integration tests - can run in parallel
    test: {
      name: "unit",
      globals: true,
      environment: "node",
      setupFiles: ["./tests/setup.ts"],
      include: [
        "src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
        "tests/unit/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
        // Include non-process-spawning integration tests
        "tests/integration/team-onboarding-functional.test.ts",
      ],
      // Exclude process-spawning tests from unit project
      exclude: [
        "tests/integration/stdout-purity.test.ts",
        "tests/integration/version-command.test.ts",
        "**/node_modules/**",
        "**/dist/**",
      ],
      pool: "forks",
      // Allow parallelism for unit tests
      maxWorkers: process.env["CI"] ? (process.platform === "win32" ? 1 : 4) : undefined, // Local: use vitest default (half CPU cores)
      testTimeout: process.platform === "win32" ? 240000 : 30000,
      hookTimeout: process.platform === "win32" ? 240000 : 30000,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@core": path.resolve(__dirname, "./src/core"),
        "@adapters": path.resolve(__dirname, "./src/adapters"),
        "@ports": path.resolve(__dirname, "./src/ports"),
        "@shared": path.resolve(__dirname, "./src/shared"),
        "@tests": path.resolve(__dirname, "./tests"),
      },
    },
  },
  {
    // Process-spawning tests - must run sequentially and isolated
    test: {
      name: "process-spawn",
      globals: true,
      environment: "node",
      setupFiles: ["./tests/setup.ts"],
      include: [
        "tests/integration/stdout-purity.test.ts",
        "tests/integration/version-command.test.ts",
      ],
      pool: "forks",
      // CRITICAL: Single worker to prevent process conflicts
      maxWorkers: 1,
      // Longer timeouts for process spawning and cleanup
      testTimeout: 120000, // 2 minutes
      hookTimeout: 60000, // 1 minute for beforeAll/afterAll cleanup
      // Run sequentially within the project
      sequence: {
        shuffle: false,
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@core": path.resolve(__dirname, "./src/core"),
        "@adapters": path.resolve(__dirname, "./src/adapters"),
        "@ports": path.resolve(__dirname, "./src/ports"),
        "@shared": path.resolve(__dirname, "./src/shared"),
        "@tests": path.resolve(__dirname, "./tests"),
      },
    },
  },
]);
