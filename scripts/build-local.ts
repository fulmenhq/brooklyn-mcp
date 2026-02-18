#!/usr/bin/env bun

/**
 * Local Build Script - Cross-platform compatible
 *
 * Creates the correct binary name for each platform:
 * - Windows: dist/brooklyn.exe
 * - Unix/macOS: dist/brooklyn
 *
 * This ensures version-command tests work on all platforms.
 * Used for local development and test dependencies.
 */

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "..");
const isWindows = process.platform === "win32";
const binaryName = isWindows ? "brooklyn.exe" : "brooklyn";
const binaryPath = path.join(rootDir, "dist", binaryName);

async function buildLocal() {
  console.log("🚀 Building local binary for current platform...");
  console.log(`📍 Platform: ${process.platform}`);
  console.log(`📦 Output: ${binaryPath}`);

  try {
    // Step 1: Extract help text
    console.log("📝 Extracting help text...");
    execSync("bun scripts/extract-help-text.ts", {
      cwd: rootDir,
      stdio: "inherit",
    });

    // Step 2: Create dist directory
    console.log("📁 Creating dist directory...");
    await fs.mkdir(path.join(rootDir, "dist"), { recursive: true });

    // Step 3: Embed version
    console.log("🔢 Embedding version...");
    execSync("bun run version:embed", {
      cwd: rootDir,
      stdio: "inherit",
    });

    // Step 4: Build standalone binary with correct name
    console.log(`🔨 Building standalone binary: ${binaryName}`);
    const buildCommand = [
      "bun build src/cli/brooklyn.ts",
      "--compile",
      `--outfile ${binaryPath}`,
      "--external playwright",
      "--external @playwright/test",
      "--external playwright-core",
      "--external electron",
      "--external svgo",
      "--external xml2js",
    ].join(" ");

    execSync(buildCommand, {
      cwd: rootDir,
      stdio: "inherit",
    });

    // Step 5: Make executable (Unix-like systems)
    if (!isWindows) {
      console.log("🔐 Setting executable permissions...");
      execSync(`chmod +x ${binaryPath}`, {
        cwd: rootDir,
        stdio: "inherit",
      });
    }

    console.log(`✅ Local binary built successfully: ${binaryPath}`);

    // Verify the binary exists
    try {
      await fs.access(binaryPath);
      console.log("✅ Binary verification successful");
    } catch (error) {
      console.error("❌ Binary verification failed:", error);
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Local build failed:", error);
    process.exit(1);
  }
}

buildLocal().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
