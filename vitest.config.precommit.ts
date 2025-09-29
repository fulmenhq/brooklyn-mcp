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
    // Timeout for precommit hooks - increased for Windows compatibility
    testTimeout: 15000, // 15 seconds to handle slower Windows tests
    hookTimeout: 10000,
  },
});
