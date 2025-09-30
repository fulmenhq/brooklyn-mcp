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
        // Windows CI uses single fork due to browser process hanging issues
        maxForks:
          process.env["VITEST_FILE_PARALLELISM"] === "false" ||
          process.argv.some((arg) => arg.includes("tests/integration"))
            ? 1
            : process.env["CI"]
              ? process.platform === "win32"
                ? 1 // Force single fork on Windows CI to prevent browser hangs
                : 4
              : // Windows CI: 1, others: 4
                Math.max(1, Math.ceil(cpus().length / 2)), // Local: half CPU cores
        minForks: 1,
        // Force single fork for integration tests to prevent process/port conflicts
        // Also force single fork on Windows CI to prevent browser process deadlocks
        singleFork:
          process.env["VITEST_FILE_PARALLELISM"] === "false" ||
          process.argv.some((arg) => arg.includes("tests/integration")) ||
          (process.env["CI"] === "true" && process.platform === "win32"),
      },
    },
    // Increase timeouts for Windows process management and CI
    hookTimeout: process.platform === "win32" ? 240000 : 30000, // 4m Windows, 30s others
    testTimeout: process.platform === "win32" ? 240000 : 30000, // 4m Windows, 30s others
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
