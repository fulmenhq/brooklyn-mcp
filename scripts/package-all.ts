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
  const sha256Path = path.join(releaseDir, "SHA256SUMS");
  const sha512Path = path.join(releaseDir, "SHA512SUMS");

  const crypto = await import("node:crypto");
  const sha256Checksums: string[] = [];
  const sha512Checksums: string[] = [];

  for (const result of results) {
    if (result.success) {
      // Add checksums for ZIP
      if (result.zipPath) {
        const data = await fs.readFile(result.zipPath);
        const filename = path.basename(result.zipPath);
        sha256Checksums.push(
          `${crypto.createHash("sha256").update(data).digest("hex")}  ${filename}`,
        );
        sha512Checksums.push(
          `${crypto.createHash("sha512").update(data).digest("hex")}  ${filename}`,
        );
      }

      // Add checksums for TAR.GZ
      if (result.tarPath) {
        const data = await fs.readFile(result.tarPath);
        const filename = path.basename(result.tarPath);
        sha256Checksums.push(
          `${crypto.createHash("sha256").update(data).digest("hex")}  ${filename}`,
        );
        sha512Checksums.push(
          `${crypto.createHash("sha512").update(data).digest("hex")}  ${filename}`,
        );
      }
    }
  }

  // Sort checksums alphabetically by filename for consistent output
  sha256Checksums.sort((a, b) => {
    const filenameA = a.split("  ")[1] ?? "";
    const filenameB = b.split("  ")[1] ?? "";
    return filenameA.localeCompare(filenameB);
  });
  sha512Checksums.sort((a, b) => {
    const filenameA = a.split("  ")[1] ?? "";
    const filenameB = b.split("  ")[1] ?? "";
    return filenameA.localeCompare(filenameB);
  });

  await fs.writeFile(sha256Path, `${sha256Checksums.join("\n")}\n`);
  await fs.writeFile(sha512Path, `${sha512Checksums.join("\n")}\n`);

  console.log(chalk.green(`✅ SHA256SUMS saved to ${path.relative(rootDir, sha256Path)}`));
  console.log(chalk.green(`✅ SHA512SUMS saved to ${path.relative(rootDir, sha512Path)}`));
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

async function copyReleaseNotes(): Promise<void> {
  console.log(chalk.blue("\n📝 Copying release notes..."));

  const releaseDir = path.join(rootDir, "dist", "release");

  try {
    // Read VERSION file to determine which release notes to copy
    const versionPath = path.join(rootDir, "VERSION");
    const version = (await fs.readFile(versionPath, "utf-8")).trim();

    // Try docs/releases/v<version>.md first (preferred location)
    // Handle both with and without 'v' prefix in filename
    const releaseDocsDir = path.join(rootDir, "docs", "releases");
    const candidates = [
      path.join(releaseDocsDir, `v${version}.md`),
      path.join(releaseDocsDir, `${version}.md`),
      // Strip any pre-release suffix for docs lookup (e.g., 0.3.0-rc.1 -> 0.3.0)
      path.join(releaseDocsDir, `v${version.split("-")[0]}.md`),
    ];

    let sourceFile: string | undefined;
    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        sourceFile = candidate;
        break;
      } catch {
        // Try next candidate
      }
    }

    if (!sourceFile) {
      // Fallback: try RELEASE_NOTES.md in root if docs/releases doesn't have it
      const rootReleaseNotes = path.join(rootDir, "RELEASE_NOTES.md");
      try {
        await fs.access(rootReleaseNotes);
        sourceFile = rootReleaseNotes;
      } catch {
        console.log(chalk.yellow(`⚠️  No release notes found for ${version}`));
        console.log(
          chalk.gray(`   Checked: ${candidates.map((c) => path.relative(rootDir, c)).join(", ")}`),
        );
        return;
      }
    }

    // Copy to dist/release/RELEASE.md (matches goneat pattern)
    const destPath = path.join(releaseDir, `RELEASE.md`);
    await fs.copyFile(sourceFile, destPath);

    console.log(chalk.green(`✅ Release notes copied from ${path.relative(rootDir, sourceFile)}`));
    console.log(chalk.green(`   → ${path.relative(rootDir, destPath)}`));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(chalk.yellow(`⚠️  Could not copy release notes: ${errorMessage}`));
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

  // Check package sizes (compressed standalone binaries are ~40-50MB)
  const oversized = successful.filter(
    (r) =>
      (r.zipSize && r.zipSize > 100 * 1024 * 1024) || // 100MB limit
      (r.tarSize && r.tarSize > 100 * 1024 * 1024),
  );

  if (oversized.length > 0) {
    console.log(chalk.yellow(`⚠️  ${oversized.length} packages exceed size limit (100MB):`));
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
    await copyReleaseNotes();
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
