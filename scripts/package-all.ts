#!/usr/bin/env bun

/**
 * Cross-platform packaging script for Brooklyn MCP
 * Creates distribution artifacts (zip, tar.gz) for all platforms
 */

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

interface PackageTarget {
  platform: string;
  binaryName: string;
  archiveName: string;
}

const PACKAGE_TARGETS: PackageTarget[] = [
  {
    platform: "linux-amd64",
    binaryName: "brooklyn-linux-amd64",
    archiveName: "brooklyn-linux-amd64",
  },
  {
    platform: "linux-arm64",
    binaryName: "brooklyn-linux-arm64",
    archiveName: "brooklyn-linux-arm64",
  },
  {
    platform: "darwin-amd64",
    binaryName: "brooklyn-darwin-amd64",
    archiveName: "brooklyn-darwin-amd64",
  },
  {
    platform: "darwin-arm64",
    binaryName: "brooklyn-darwin-arm64",
    archiveName: "brooklyn-darwin-arm64",
  },
  {
    platform: "windows-amd64",
    binaryName: "brooklyn-windows-amd64.exe",
    archiveName: "brooklyn-windows-amd64",
  },
  {
    platform: "windows-arm64",
    binaryName: "brooklyn-windows-arm64.exe",
    archiveName: "brooklyn-windows-arm64",
  },
];

interface PackageResult {
  target: PackageTarget;
  success: boolean;
  zipPath?: string;
  tarPath?: string;
  zipSize?: number;
  tarSize?: number;
  error?: string;
  duration?: number;
}

async function ensureReleaseDir(): Promise<void> {
  const releaseDir = path.join(rootDir, "dist", "release");
  await fs.mkdir(releaseDir, { recursive: true });
}

async function packageTarget(target: PackageTarget): Promise<PackageResult> {
  const startTime = Date.now();
  const binaryPath = path.join(rootDir, "dist", target.binaryName);
  const releaseDir = path.join(rootDir, "dist", "release");

  try {
    console.log(chalk.blue(`📦 Packaging ${target.platform}...`));

    // Check if binary exists
    try {
      await fs.access(binaryPath);
    } catch {
      throw new Error(`Binary not found: ${target.binaryName}`);
    }

    const zipPath = path.join(releaseDir, `${target.archiveName}.zip`);
    const tarPath = path.join(releaseDir, `${target.archiveName}.tar.gz`);

    // Create ZIP archive
    console.log(`   Creating ${path.basename(zipPath)}...`);
    execSync(`cd dist && zip -q release/${target.archiveName}.zip ${target.binaryName}`, {
      cwd: rootDir,
      stdio: "inherit",
    });

    // Create TAR.GZ archive
    console.log(`   Creating ${path.basename(tarPath)}...`);
    execSync(`cd dist && tar -czf release/${target.archiveName}.tar.gz ${target.binaryName}`, {
      cwd: rootDir,
      stdio: "inherit",
    });

    // Get archive sizes
    const zipStats = await fs.stat(zipPath);
    const tarStats = await fs.stat(tarPath);

    const duration = Date.now() - startTime;

    console.log(chalk.green(`✅ ${target.platform} packaged successfully (${duration}ms)`));
    console.log(chalk.gray(`   ZIP: ${(zipStats.size / 1024 / 1024).toFixed(2)}MB`));
    console.log(chalk.gray(`   TAR: ${(tarStats.size / 1024 / 1024).toFixed(2)}MB`));

    return {
      target,
      success: true,
      zipPath,
      tarPath,
      zipSize: zipStats.size,
      tarSize: tarStats.size,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.log(chalk.red(`❌ ${target.platform} packaging failed: ${errorMessage}`));

    return {
      target,
      success: false,
      error: errorMessage,
      duration,
    };
  }
}

async function generateChecksums(results: PackageResult[]): Promise<void> {
  console.log(chalk.blue("\n🔐 Generating checksums..."));

  const releaseDir = path.join(rootDir, "dist", "release");
  const checksumsPath = path.join(releaseDir, "SHA256SUMS.txt");

  const crypto = await import("node:crypto");
  const checksums: string[] = [];

  for (const result of results) {
    if (result.success) {
      // Add binary checksum
      if (result.zipPath) {
        const data = await fs.readFile(result.zipPath);
        const hash = crypto.createHash("sha256").update(data).digest("hex");
        checksums.push(`${hash}  ${path.basename(result.zipPath)}`);
      }

      if (result.tarPath) {
        const data = await fs.readFile(result.tarPath);
        const hash = crypto.createHash("sha256").update(data).digest("hex");
        checksums.push(`${hash}  ${path.basename(result.tarPath)}`);
      }
    }
  }

  await fs.writeFile(checksumsPath, `${checksums.join("\n")}\n`);

  console.log(chalk.green(`✅ Checksums saved to ${path.relative(rootDir, checksumsPath)}`));
}

async function copyLicenseFiles(): Promise<void> {
  console.log(chalk.blue("\n📄 Copying license files..."));

  const releaseDir = path.join(rootDir, "dist", "release");
  const licensesDir = path.join(rootDir, "dist", "licenses");

  try {
    // Copy THIRD_PARTY_NOTICES.md
    const noticesPath = path.join(licensesDir, "THIRD_PARTY_NOTICES.md");
    const noticesDest = path.join(releaseDir, "THIRD_PARTY_NOTICES.md");
    await fs.copyFile(noticesPath, noticesDest);
    console.log(chalk.green("✅ THIRD_PARTY_NOTICES.md copied"));
  } catch (_error) {
    console.log(chalk.yellow("⚠️  THIRD_PARTY_NOTICES.md not found - run license scan first"));
  }

  try {
    // Copy licenses.json
    const licensesPath = path.join(licensesDir, "licenses.json");
    const licensesDest = path.join(releaseDir, "licenses.json");
    await fs.copyFile(licensesPath, licensesDest);
    console.log(chalk.green("✅ licenses.json copied"));
  } catch (_error) {
    console.log(chalk.yellow("⚠️  licenses.json not found - run license scan first"));
  }
}

async function generateReleaseNotes(): Promise<void> {
  console.log(chalk.blue("\n📝 Generating release notes..."));

  const releaseDir = path.join(rootDir, "dist", "release");
  const changelogPath = path.join(rootDir, "CHANGELOG.md");
  const releaseNotesPath = path.join(releaseDir, "RELEASE_NOTES.md");

  try {
    const changelog = await fs.readFile(changelogPath, "utf-8");

    // Extract the latest version section
    const lines = changelog.split("\n");
    const versionStart = lines.findIndex(
      (line) => line.startsWith("## [") && line.includes("0.2.2"),
    );

    if (versionStart === -1) {
      console.log(chalk.yellow("⚠️  Version 0.2.2 not found in CHANGELOG.md"));
      return;
    }

    const versionEnd = lines.findIndex(
      (line, index) => index > versionStart && line.startsWith("## ["),
    );

    const versionLines =
      versionEnd === -1 ? lines.slice(versionStart) : lines.slice(versionStart, versionEnd);

    const releaseNotes = versionLines.join("\n");
    await fs.writeFile(releaseNotesPath, releaseNotes);

    console.log(
      chalk.green(`✅ Release notes saved to ${path.relative(rootDir, releaseNotesPath)}`),
    );
  } catch (_error) {
    console.log(chalk.yellow("⚠️  Could not generate release notes from CHANGELOG.md"));
  }
}

async function verifyPackages(results: PackageResult[]): Promise<void> {
  console.log(chalk.blue("\n🔍 Verifying packages..."));

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  if (failed.length > 0) {
    console.log(chalk.red(`❌ ${failed.length} packages failed:`));
    for (const result of failed) {
      console.log(chalk.red(`   - ${result.target.platform}: ${result.error}`));
    }
    throw new Error(`${failed.length} packages failed`);
  }

  // Check package sizes
  const oversized = successful.filter(
    (r) =>
      (r.zipSize && r.zipSize > 20 * 1024 * 1024) || // 20MB limit
      (r.tarSize && r.tarSize > 20 * 1024 * 1024),
  );

  if (oversized.length > 0) {
    console.log(chalk.yellow(`⚠️  ${oversized.length} packages exceed size limit (20MB):`));
    for (const result of oversized) {
      const zipMB = result.zipSize ? (result.zipSize / 1024 / 1024).toFixed(2) : "N/A";
      const tarMB = result.tarSize ? (result.tarSize / 1024 / 1024).toFixed(2) : "N/A";
      console.log(chalk.yellow(`   - ${result.target.platform}: ZIP ${zipMB}MB, TAR ${tarMB}MB`));
    }
  }

  console.log(chalk.green(`✅ All ${successful.length} packages verified`));
}

async function printSummary(results: PackageResult[]): Promise<void> {
  console.log(chalk.bold("\n📊 Packaging Summary"));
  console.log(chalk.gray("=".repeat(50)));

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const totalZipSize = successful.reduce((sum, r) => sum + (r.zipSize || 0), 0);
  const totalTarSize = successful.reduce((sum, r) => sum + (r.tarSize || 0), 0);

  console.log(chalk.white(`Total targets: ${results.length}`));
  console.log(chalk.green(`Successful: ${successful.length}`));
  if (failed.length > 0) {
    console.log(chalk.red(`Failed: ${failed.length}`));
  }
  console.log(chalk.white(`Total ZIP size: ${(totalZipSize / 1024 / 1024).toFixed(2)}MB`));
  console.log(chalk.white(`Total TAR size: ${(totalTarSize / 1024 / 1024).toFixed(2)}MB`));

  if (successful.length > 0) {
    console.log(chalk.green("\n✅ Packaging completed successfully!"));
    console.log(chalk.gray("Distribution artifacts are ready in dist/release/ directory"));
  } else {
    console.log(chalk.red("\n❌ All packages failed"));
  }
}

async function main(): Promise<void> {
  console.log(chalk.bold("\n📦 Brooklyn MCP Cross-Platform Packaging\n"));

  try {
    // Ensure release directory exists
    await ensureReleaseDir();

    // Package all targets
    console.log(chalk.blue(`\n📦 Packaging ${PACKAGE_TARGETS.length} platforms...`));
    const results: PackageResult[] = [];

    for (const target of PACKAGE_TARGETS) {
      const result = await packageTarget(target);
      results.push(result);
    }

    // Post-packaging steps
    await verifyPackages(results);
    await generateChecksums(results);
    await copyLicenseFiles();
    await generateReleaseNotes();
    await printSummary(results);
  } catch (error) {
    console.error(chalk.red("❌ Packaging failed:"), error);
    process.exit(1);
  }
}

// Only run if this script is executed directly
if (import.meta.main) {
  main().catch((error) => {
    console.error(chalk.red("❌ Packaging failed:"), error);
    process.exit(1);
  });
}
