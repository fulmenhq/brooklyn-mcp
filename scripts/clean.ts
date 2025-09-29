#!/usr/bin/env bun

/**
 * Cross-platform clean script
 * Replaces Unix-only clean commands in package.json
 */

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Glob } from "bun";

const rootDir = path.resolve(import.meta.dirname, "..");

interface CleanOptions {
  build?: boolean;
  deps?: boolean;
  all?: boolean;
}

async function removeDirectory(dirPath: string) {
  if (existsSync(dirPath)) {
    console.log(`🗑️  Removing ${path.relative(rootDir, dirPath)}`);
    await fs.rm(dirPath, { recursive: true, force: true });
  }
}

async function removeFile(filePath: string) {
  if (existsSync(filePath)) {
    console.log(`🗑️  Removing ${path.relative(rootDir, filePath)}`);
    await fs.unlink(filePath);
  }
}

async function findAndRemoveFiles(pattern: string, baseDir: string = rootDir) {
  const glob = new Glob(pattern);

  for await (const file of glob.scan({ cwd: baseDir })) {
    const fullPath = path.join(baseDir, file);
    await removeFile(fullPath);
  }
}

async function cleanBuild() {
  console.log("🧹 Cleaning build artifacts...");

  // Remove directories
  await removeDirectory(path.join(rootDir, "dist"));
  await removeDirectory(path.join(rootDir, "coverage"));
  await removeDirectory(path.join(rootDir, ".nyc_output"));
  await removeDirectory(path.join(rootDir, ".vitest"));
  await removeDirectory(path.join(rootDir, ".cache"));

  // Remove specific files from src directory
  await findAndRemoveFiles("**/brooklyn", path.join(rootDir, "src"));
  await findAndRemoveFiles("**/brooklyn.exe", path.join(rootDir, "src"));
  await findAndRemoveFiles("**/*.map", path.join(rootDir, "src"));

  console.log("✅ Build artifacts cleaned");
}

async function cleanDeps() {
  console.log("🧹 Cleaning dependencies...");

  await removeDirectory(path.join(rootDir, "node_modules"));
  await removeFile(path.join(rootDir, "bun.lockb"));

  console.log("✅ Dependencies cleaned");
}

async function clean(options: CleanOptions = {}) {
  try {
    if (options.all || !(options.build || options.deps)) {
      // Default behavior - clean everything
      await cleanBuild();
      await cleanDeps();
    } else {
      if (options.build) {
        await cleanBuild();
      }
      if (options.deps) {
        await cleanDeps();
      }
    }

    console.log("🎉 Cleanup completed successfully!");
  } catch (error) {
    console.error("❌ Cleanup failed:", error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options: CleanOptions = {};

for (const arg of args) {
  switch (arg) {
    case "--build":
      options.build = true;
      break;
    case "--deps":
      options.deps = true;
      break;
    case "--all":
      options.all = true;
      break;
    default:
      console.error(`Unknown option: ${arg}`);
      console.error("Usage: bun scripts/clean.ts [--build] [--deps] [--all]");
      process.exit(1);
  }
}

clean(options).catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
