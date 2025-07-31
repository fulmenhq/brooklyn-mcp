/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only run unit tests and mock-based integration tests for precommit
    include: ["tests/unit/**/*.test.ts", "tests/integration/team-onboarding-functional.test.ts"],
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    // Fast timeout for precommit hooks
    testTimeout: 5000,
    hookTimeout: 5000,
  },
});
