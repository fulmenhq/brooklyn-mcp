import { cpus } from "node:os";
import path from "node:path";
/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["scripts/**", "tests/**", "**/*.d.ts", "node_modules/**", "dist/**"],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
    include: [
      "src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
      "tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}",
    ],
    isolate: true,
    pool: "forks",
    poolOptions: {
      forks: {
        // Auto-detect workers based on CPU cores, with constraints for Windows CI
        // BUT force single fork for integration tests to prevent resource conflicts
        maxForks:
          process.env["VITEST_FILE_PARALLELISM"] === "false" ||
          process.argv.some((arg) => arg.includes("tests/integration"))
            ? 1
            : process.env["CI"]
              ? process.platform === "win32"
                ? 2
                : 4
              : // Windows CI: 2, others: 4
                Math.max(1, Math.ceil(cpus().length / 2)), // Local: half CPU cores
        minForks: 1,
        // Force single fork for integration tests to prevent process/port conflicts
        singleFork:
          process.env["VITEST_FILE_PARALLELISM"] === "false" ||
          process.argv.some((arg) => arg.includes("tests/integration")),
      },
    },
    // Increase timeouts for Windows process management
    hookTimeout: process.platform === "win32" ? 45000 : 30000, // 45s Windows, 30s others
    testTimeout: process.platform === "win32" ? 45000 : 30000, // 45s Windows, 30s others
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
});
