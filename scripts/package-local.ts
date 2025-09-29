#!/usr/bin/env bun

/**
 * Cross-platform local packaging script
 * Replaces Unix-only package:local script in package.json
 *
 * Creates platform-specific release packages:
 * - Windows: brooklyn-windows-amd64.zip/tar.gz
 * - macOS: brooklyn-darwin-amd64.zip/tar.gz
 * - Linux: brooklyn-linux-amd64.zip/tar.gz
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { getBinaryName, isWindows } from "../src/shared/binary-utils.js";

const rootDir = path.resolve(import.meta.dirname, "..");

interface PlatformInfo {
  os: string;
  arch: string;
  binaryName: string;
}

function getPlatformInfo(): PlatformInfo {
  let os: string;
  let arch: string;

  // Determine OS
  switch (process.platform) {
    case "win32":
      os = "windows";
      break;
    case "darwin":
      os = "darwin";
      break;
    case "linux":
      os = "linux";
      break;
    default:
      os = process.platform;
  }

  // Determine architecture
  switch (process.arch) {
    case "x64":
      arch = "amd64";
      break;
    case "arm64":
      arch = "arm64";
      break;
    case "arm":
      arch = "arm";
      break;
    default:
      arch = process.arch;
  }

  const binaryName = getBinaryName();

  return { os, arch, binaryName };
}

async function createDirectories() {
  const releaseDir = path.join(rootDir, "dist", "release");
  if (!existsSync(releaseDir)) {
    await fs.mkdir(releaseDir, { recursive: true });
  }
}

async function copyBinary(platform: PlatformInfo): Promise<string> {
  const sourcePath = path.join(rootDir, "dist", platform.binaryName);
  const targetName = `brooklyn-${platform.os}-${platform.arch}${isWindows() ? ".exe" : ""}`;
  const targetPath = path.join(rootDir, "dist", targetName);

  if (!existsSync(sourcePath)) {
    throw new Error(`Binary not found: ${sourcePath}. Run 'bun run build:local' first.`);
  }

  await fs.copyFile(sourcePath, targetPath);

  // Make executable on Unix systems
  if (!isWindows()) {
    await fs.chmod(targetPath, 0o755);
  }

  return targetName;
}

async function createZipArchive(binaryName: string, platform: PlatformInfo): Promise<string> {
  const zipName = `brooklyn-${platform.os}-${platform.arch}.zip`;
  const distDir = path.join(rootDir, "dist");

  // Use relative paths for zip command
  const zipCommand = `zip -q "release/${zipName}" "${binaryName}"`;

  try {
    execSync(zipCommand, {
      cwd: distDir,
      stdio: "inherit",
    });
  } catch (error) {
    console.error("Zip creation failed. Ensure zip is installed.");
    throw error;
  }

  return zipName;
}

async function createTarArchive(binaryName: string, platform: PlatformInfo): Promise<string> {
  const tarName = `brooklyn-${platform.os}-${platform.arch}.tar.gz`;
  const distDir = path.join(rootDir, "dist");

  // Use Unix-style paths for tar command on Windows
  const tarCommand = isWindows()
    ? `tar -czf "release/${tarName}" "${binaryName}"`
    : `tar -czf "release/${tarName}" "${binaryName}"`;

  try {
    execSync(tarCommand, {
      cwd: distDir,
      stdio: "inherit",
    });
  } catch (error) {
    console.error("Tar creation failed. Ensure tar is installed.");
    throw error;
  }

  return tarName;
}

async function generateChecksums(archives: string[], platform: PlatformInfo): Promise<string> {
  const checksumFile = `SHA256SUMS_${platform.os}_${platform.arch}.txt`;
  const checksumPath = path.join(rootDir, "dist", "release", checksumFile);

  const checksums: string[] = [];

  for (const archiveName of archives) {
    const archivePath = path.join(rootDir, "dist", "release", archiveName);
    const buffer = await fs.readFile(archivePath);
    const hash = createHash("sha256").update(buffer).digest("hex");
    checksums.push(`${hash}  ${archiveName}`);
  }

  await fs.writeFile(checksumPath, `${checksums.join("\n")}\n`);
  return checksumFile;
}

async function packageLocal() {
  console.log("🚀 Creating local release package...");

  const platform = getPlatformInfo();
  console.log(`📍 Platform: ${platform.os}-${platform.arch}`);
  console.log(`📦 Binary: ${platform.binaryName}`);

  try {
    // Step 1: Create release directory
    console.log("📁 Creating release directory...");
    await createDirectories();

    // Step 2: Copy and rename binary
    console.log("📋 Copying binary...");
    const targetBinary = await copyBinary(platform);

    // Step 3: Create archives
    console.log("📦 Creating ZIP archive...");
    const zipName = await createZipArchive(targetBinary, platform);

    console.log("📦 Creating TAR.GZ archive...");
    const tarName = await createTarArchive(targetBinary, platform);

    // Step 4: Generate checksums
    console.log("🔐 Generating checksums...");
    const checksumFile = await generateChecksums([zipName, tarName], platform);

    // Step 5: Cleanup temporary binary
    const tempBinaryPath = path.join(rootDir, "dist", targetBinary);
    await fs.unlink(tempBinaryPath);

    console.log("✅ Local packaging completed successfully!");
    console.log("📦 Created files:");
    console.log(`   - dist/release/${zipName}`);
    console.log(`   - dist/release/${tarName}`);
    console.log(`   - dist/release/${checksumFile}`);
  } catch (error) {
    console.error("❌ Packaging failed:", error);
    process.exit(1);
  }
}

packageLocal().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
