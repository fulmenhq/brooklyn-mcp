#!/usr/bin/env bun
/**
 * Setup Test Infrastructure
 *
 * Ensures all required directories and files exist for testing in CI/CD environments
 */

import { existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
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

// Create cross-platform temp directory paths
function getRequiredTempDirs(): string[] {
  const tempBase = join(tmpdir(), "brooklyn-test-isolation");
  return [
    join(tempBase, "config"),
    join(tempBase, "logs"),
    join(tempBase, "plugins"),
    join(tempBase, "browsers"),
    join(tempBase, "assets"),
    join(tempBase, "pids"),
    join(tempBase, "screenshots"),
  ];
}

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
  const requiredTempDirs = getRequiredTempDirs();
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
