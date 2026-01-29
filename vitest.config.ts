import { cpus } from "node:os";
import path from "node:path";
/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

/**
 * Detect if integration tests are included in this test run.
 *
 * Integration tests (especially stdout-purity tests) spawn child processes
 * and perform aggressive cleanup that can interfere with parallel tests.
 * We force single-worker execution when:
 * 1. VITEST_FILE_PARALLELISM=false is set (explicit request)
 * 2. Running specific integration tests via argv
 * 3. Running full suite (no specific path filter = includes integration tests)
 *
 * Detection logic: If argv has no test path filter after vitest commands,
 * we're running the full suite which includes integration tests via include patterns.
 */
function shouldUseSingleWorker(): boolean {
  // Explicit environment override
  if (process.env["VITEST_FILE_PARALLELISM"] === "false") return true;

  // Explicit integration test path in argv
  if (process.argv.some((arg) => arg.includes("tests/integration"))) return true;

  // Running unit tests only is safe for parallel execution
  if (process.argv.some((arg) => arg.includes("tests/unit"))) return false;
  if (process.argv.some((arg) => arg.includes("src/") && arg.includes(".test."))) return false;

  // Check for "run" command with no specific test path filter
  // When running `bun run test` (full suite), vitest gets "run" without a path
  // Full suite includes integration tests via include patterns, so use single worker
  const runIndex = process.argv.indexOf("run");
  if (runIndex !== -1) {
    // Check if there's a path argument after "run"
    const argsAfterRun = process.argv.slice(runIndex + 1);
    // Filter out vitest flags (start with -)
    const pathArgs = argsAfterRun.filter((arg) => !(arg.startsWith("-") || arg.startsWith("--")));
    // If no path args, we're running the full suite (includes integration tests)
    if (pathArgs.length === 0) return true;
  }

  // Windows CI always uses single worker due to browser process issues
  if (process.env["CI"] === "true" && process.platform === "win32") return true;

  return false;
}

const useSingleWorker = shouldUseSingleWorker();

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
    // VITEST 4.x: isolate controls per-test isolation, not parallelism
    isolate: true,
    pool: "forks",
    // VITEST 4.x MIGRATION: poolOptions removed, options are now top-level
    // singleFork is removed - use maxWorkers: 1 instead
    // Integration tests (stdout-purity etc.) spawn child processes and do aggressive cleanup
    // that conflicts with parallel test execution - force single worker for these
    maxWorkers: useSingleWorker
      ? 1
      : process.env["CI"]
        ? process.platform === "win32"
          ? 1 // Force single worker on Windows CI to prevent browser hangs
          : 4
        : // Windows CI: 1, others: 4
          Math.max(1, Math.ceil(cpus().length / 2)), // Local: half CPU cores
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
