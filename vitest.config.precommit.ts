/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only run unit tests and mock-based integration tests for precommit
    include: ["tests/unit/**/*.test.ts", "tests/integration/team-onboarding-functional.test.ts"],
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    // Timeout for precommit hooks - Windows needs much longer due to browser operations
    testTimeout: process.platform === "win32" ? 240000 : 15000, // 4m Windows, 15s others
    hookTimeout: process.platform === "win32" ? 240000 : 10000, // 4m Windows, 10s others
  },
});
