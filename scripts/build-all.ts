#!/usr/bin/env bun

/**
 * Cross-platform build script for Brooklyn MCP
 * Builds binaries for all supported platforms and architectures
 */

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

interface BuildTarget {
  os: string;
  arch: string;
  platform: string;
  /** Bun cross-compile target (e.g. "bun-linux-x64") */
  target: string;
  binaryName: string;
}

const BUILD_TARGETS: BuildTarget[] = [
  {
    os: "linux",
    arch: "amd64",
    platform: "linux-x64",
    target: "bun-linux-x64",
    binaryName: "brooklyn-linux-amd64",
  },
  {
    os: "linux",
    arch: "arm64",
    platform: "linux-arm64",
    target: "bun-linux-arm64",
    binaryName: "brooklyn-linux-arm64",
  },
  {
    os: "darwin",
    arch: "arm64",
    platform: "darwin-arm64",
    target: "bun-darwin-arm64",
    binaryName: "brooklyn-darwin-arm64",
  },
  {
    os: "win32",
    arch: "amd64",
    platform: "win32-x64",
    target: "bun-windows-x64",
    binaryName: "brooklyn-windows-amd64.exe",
  },
  {
    os: "win32",
    arch: "arm64",
    platform: "win32-arm64",
    target: "bun-windows-arm64",
    binaryName: "brooklyn-windows-arm64.exe",
  },
];

interface BuildResult {
  target: BuildTarget;
  success: boolean;
  binaryPath?: string;
  size?: number;
  error?: string;
  duration?: number;
}

async function ensureDistDir(): Promise<void> {
  const distDir = path.join(rootDir, "dist");
  await fs.mkdir(distDir, { recursive: true });
}

async function runPreBuildSteps(): Promise<void> {
  console.log(chalk.blue("🔧 Running pre-build steps..."));

  // Extract help text
  console.log("📝 Extracting help text...");
  execSync("bun scripts/extract-help-text.ts", { cwd: rootDir, stdio: "inherit" });

  // Embed version
  console.log("🔢 Embedding version...");
  execSync("bun scripts/embed-version.ts", { cwd: rootDir, stdio: "inherit" });
}

async function buildForTarget(target: BuildTarget): Promise<BuildResult> {
  const startTime = Date.now();
  const binaryPath = path.join(rootDir, "dist", target.binaryName);

  try {
    console.log(chalk.blue(`🔨 Building ${target.platform}...`));

    // Build standalone executable via cross-compilation
    const buildCmd = [
      "bun build src/cli/brooklyn.ts",
      "--compile",
      `--target=${target.target}`,
      `--outfile dist/${target.binaryName}`,
      "--external playwright",
      "--external @playwright/test",
      "--external playwright-core",
      "--external electron",
      "--external svgo",
      "--external xml2js",
    ].join(" ");

    execSync(buildCmd, {
      cwd: rootDir,
      stdio: "inherit",
      env: {
        ...process.env,
        // Set platform-specific environment variables if needed
        TARGET_OS: target.os,
        TARGET_ARCH: target.arch,
      },
    });

    // Make binary executable (except Windows)
    if (target.os !== "win32") {
      execSync(`chmod +x ${binaryPath}`, { cwd: rootDir });
    }

    // Get binary size
    const stats = await fs.stat(binaryPath);
    const size = stats.size;

    const duration = Date.now() - startTime;

    console.log(
      chalk.green(
        `✅ ${target.platform} built successfully (${(size / 1024 / 1024).toFixed(2)}MB, ${duration}ms)`,
      ),
    );

    return {
      target,
      success: true,
      binaryPath,
      size,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.log(chalk.red(`❌ ${target.platform} build failed: ${errorMessage}`));

    return {
      target,
      success: false,
      error: errorMessage,
      duration,
    };
  }
}

async function verifyBuilds(results: BuildResult[]): Promise<void> {
  console.log(chalk.blue("\n🔍 Verifying builds..."));

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  if (failed.length > 0) {
    console.log(chalk.red(`❌ ${failed.length} builds failed:`));
    for (const result of failed) {
      console.log(chalk.red(`   - ${result.target.platform}: ${result.error}`));
    }
    throw new Error(`${failed.length} builds failed`);
  }

  // Check binary sizes (standalone compiled binaries are ~120MB)
  const oversized = successful.filter((r) => r.size && r.size > 150 * 1024 * 1024); // 150MB limit
  if (oversized.length > 0) {
    console.log(chalk.yellow(`⚠️  ${oversized.length} binaries exceed size limit (150MB):`));
    for (const result of oversized) {
      const sizeMB = ((result.size ?? 0) / 1024 / 1024).toFixed(2);
      console.log(chalk.yellow(`   - ${result.target.platform}: ${sizeMB}MB`));
    }
  }

  console.log(chalk.green(`✅ All ${successful.length} builds successful`));
}

async function generateBuildManifest(results: BuildResult[]): Promise<void> {
  console.log(chalk.blue("\n📄 Generating build manifest..."));

  const manifest = {
    version: process.env["npm_package_version"] || "0.0.0",
    buildTime: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    targets: results.map((result) => ({
      platform: result.target.platform,
      os: result.target.os,
      arch: result.target.arch,
      binaryName: result.target.binaryName,
      success: result.success,
      size: result.size,
      duration: result.duration,
      error: result.error,
    })),
  };

  const manifestPath = path.join(rootDir, "dist", "build-manifest.json");
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(chalk.green(`✅ Build manifest saved to ${path.relative(rootDir, manifestPath)}`));
}

async function generateChecksums(results: BuildResult[]): Promise<void> {
  console.log(chalk.blue("\n🔐 Generating checksums..."));

  const crypto = await import("node:crypto");
  const checksums: Record<string, string> = {};

  for (const result of results) {
    if (result.success && result.binaryPath) {
      const data = await fs.readFile(result.binaryPath);
      const hash = crypto.createHash("sha256").update(data).digest("hex");
      checksums[result.target.binaryName] = hash;
    }
  }

  const checksumsPath = path.join(rootDir, "dist", "SHA256SUMS.txt");
  const checksumsContent = `${Object.entries(checksums)
    .map(([filename, hash]) => `${hash}  ${filename}`)
    .join("\n")}\n`;

  await fs.writeFile(checksumsPath, checksumsContent);

  console.log(chalk.green(`✅ Checksums saved to ${path.relative(rootDir, checksumsPath)}`));
}

async function printSummary(results: BuildResult[]): Promise<void> {
  console.log(chalk.bold("\n📊 Build Summary"));
  console.log(chalk.gray("=".repeat(50)));

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const totalSize = successful.reduce((sum, r) => sum + (r.size || 0), 0);
  const avgSize = successful.length > 0 ? totalSize / successful.length : 0;

  console.log(chalk.white(`Total targets: ${results.length}`));
  console.log(chalk.green(`Successful: ${successful.length}`));
  if (failed.length > 0) {
    console.log(chalk.red(`Failed: ${failed.length}`));
  }
  console.log(chalk.white(`Total size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`));
  console.log(chalk.white(`Average size: ${(avgSize / 1024 / 1024).toFixed(2)}MB`));

  if (successful.length > 0) {
    console.log(chalk.green("\n✅ Build completed successfully!"));
    console.log(chalk.gray("Binaries are ready in dist/ directory"));
  } else {
    console.log(chalk.red("\n❌ All builds failed"));
  }
}

async function main(): Promise<void> {
  console.log(chalk.bold("\n🚀 Brooklyn MCP Cross-Platform Build\n"));

  try {
    // Pre-build steps
    await ensureDistDir();
    await runPreBuildSteps();

    // Build for all targets
    console.log(chalk.blue(`\n🔨 Building for ${BUILD_TARGETS.length} platforms...`));
    const results: BuildResult[] = [];

    for (const target of BUILD_TARGETS) {
      const result = await buildForTarget(target);
      results.push(result);
    }

    // Post-build verification
    await verifyBuilds(results);
    await generateBuildManifest(results);
    await generateChecksums(results);
    await printSummary(results);
  } catch (error) {
    console.error(chalk.red("❌ Build failed:"), error);
    process.exit(1);
  }
}

// Only run if this script is executed directly
if (import.meta.main) {
  main().catch((error) => {
    console.error(chalk.red("❌ Build failed:"), error);
    process.exit(1);
  });
}
