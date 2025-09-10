#!/usr/bin/env bun
/**
 * Setup Test Infrastructure
 *
 * Ensures all required directories and files exist for testing in CI/CD environments
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const requiredDirectories = [
  "tests/test-databases",
  "tests/fixtures/temp",
  "tests/fixtures/screenshots",
  "tests/fixtures/assets",
  "tests/fixtures/logs",
  "tmp/brooklyn-test",
  "tmp/brooklyn-test-isolation",
];

const requiredTempDirs = [
  "/tmp/brooklyn-test-isolation/config",
  "/tmp/brooklyn-test-isolation/logs",
  "/tmp/brooklyn-test-isolation/plugins",
  "/tmp/brooklyn-test-isolation/browsers",
  "/tmp/brooklyn-test-isolation/assets",
  "/tmp/brooklyn-test-isolation/pids",
  "/tmp/brooklyn-test-isolation/screenshots",
];

export function setupTestInfrastructure(): void {
  console.log("🔧 Setting up test infrastructure...");

  // Create required directories in project
  for (const dir of requiredDirectories) {
    const dirPath = join(process.cwd(), dir);
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
      console.log(`✅ Created directory: ${dir}`);
    }
  }

  // Create required temp directories
  for (const dir of requiredTempDirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(`✅ Created temp directory: ${dir}`);
    }
  }

  console.log("✅ Test infrastructure setup complete!");
}

// Run if called directly
if (import.meta.main) {
  setupTestInfrastructure();
}
