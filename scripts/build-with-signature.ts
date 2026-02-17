#!/usr/bin/env bun

/**
 * Enhanced build script with complete signature generation
 * This script orchestrates the full build process including binary hash calculation
 */

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

interface BuildManifest {
  version: string;
  buildSignature: unknown;
  binaryHash: {
    sha256: string;
    size: number;
    buildTime: string;
  };
}

async function runBuildSteps(): Promise<void> {
  console.log("🚀 Starting enhanced Brooklyn MCP build...");

  // Step 1: Extract help text
  console.log("📝 Extracting help text...");
  execSync("bun scripts/extract-help-text.ts", { cwd: rootDir, stdio: "inherit" });

  // Step 2: Ensure dist directory exists
  console.log("📁 Ensuring dist directory exists...");
  await fs.mkdir(path.join(rootDir, "dist"), { recursive: true });

  // Step 3: Embed version and build signature
  console.log("🔧 Embedding version and build signature...");
  execSync("bun scripts/embed-version.ts", { cwd: rootDir, stdio: "inherit" });

  // Step 4: Build the binary with correct platform extension
  const isWindows = process.platform === "win32";
  const binaryName = isWindows ? "brooklyn.exe" : "brooklyn";
  const binaryPath = path.join(rootDir, "dist", binaryName);

  console.log(`📦 Building standalone binary for ${process.platform}: ${binaryName}`);

  // Use --compile to create a true standalone executable
  // External modules (playwright, etc.) are expected to be installed at runtime
  const buildArgs = [
    "bun build src/cli/brooklyn.ts",
    "--compile",
    `--outfile ${binaryPath}`,
    "--external playwright",
    "--external @playwright/test",
    "--external playwright-core",
    "--external electron",
    "--external svgo",
    "--external xml2js",
  ];

  // Note: Windows metadata flags (--windows-title, --windows-description) are available
  // but can fail with "FailedToCommit" on some systems. Omitting for reliability.

  const buildCmd = buildArgs.join(" ");
  execSync(buildCmd, { cwd: rootDir, stdio: "inherit" });

  // Step 5: Make binary executable (Unix-like systems only)
  if (!isWindows) {
    execSync(`chmod +x ${binaryPath}`, { cwd: rootDir });
  }

  // Step 6: Calculate binary hash and create manifest
  console.log("🔐 Calculating binary signature...");
  const crypto = await import("node:crypto");
  const binaryData = await fs.readFile(binaryPath);
  const binaryHash = crypto.createHash("sha256").update(binaryData).digest("hex");
  const binaryStats = await fs.stat(binaryPath);

  // Step 7: Read static config and dynamic build signature
  const { buildConfig } = await import("../src/shared/build-config.js");
  let buildSignature = null;
  try {
    const { buildSignature: dynamicSignature } = await import(
      "../src/generated/build-signature.js"
    );
    buildSignature = dynamicSignature;
  } catch (_error) {
    console.warn("⚠️ Build signature not available - this is normal for clean builds");
  }

  // Step 8: Create build manifest
  const buildManifest: BuildManifest = {
    version: buildConfig.version,
    buildSignature,
    binaryHash: {
      sha256: binaryHash,
      size: binaryStats.size,
      buildTime: new Date().toISOString(),
    },
  };

  // Step 9: Write build manifest alongside binary
  const manifestPath = path.join(rootDir, "dist/brooklyn.manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(buildManifest, null, 2));

  console.log("✅ Build completed successfully!");
  console.log(`📊 Binary size: ${(binaryStats.size / 1024 / 1024).toFixed(2)}MB`);
  console.log(`🔑 SHA256: ${binaryHash}`);
  console.log(`📄 Manifest: ${path.basename(manifestPath)}`);
}

// Only run if this script is executed directly
if (import.meta.main) {
  runBuildSteps().catch((error) => {
    console.error("❌ Build failed:", error);
    process.exit(1);
  });
}
