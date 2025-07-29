#!/usr/bin/env bun
/**
 * Distribution optimization script
 * Ensures browser binaries are not included in the build
 * Target: 96% size reduction (from ~300MB to ~12MB)
 */

import { execSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import chalk from "chalk";

const DIST_DIR = join(process.cwd(), "dist");
const BUILD_FILE = join(DIST_DIR, "brooklyn");
const MAX_SIZE_MB = 15; // Target is 12MB, allow some buffer

async function checkDistributionSize(): Promise<void> {
  console.log(chalk.blue("🔍 Checking distribution size..."));

  if (!existsSync(BUILD_FILE)) {
    console.log(chalk.yellow("⚠️  Build file not found. Run 'bun run build' first."));
    process.exit(1);
  }

  const stats = statSync(BUILD_FILE);
  const sizeMB = stats.size / (1024 * 1024);

  console.log(chalk.gray(`Build file: ${BUILD_FILE}`));
  console.log(chalk.gray(`Size: ${sizeMB.toFixed(2)} MB`));

  if (sizeMB > MAX_SIZE_MB) {
    console.log(
      chalk.red(
        `❌ Distribution size (${sizeMB.toFixed(2)} MB) exceeds target (${MAX_SIZE_MB} MB)`,
      ),
    );
    console.log(chalk.red("   This suggests browser binaries may be included!"));
    await analyzeBuildContents();
    process.exit(1);
  }

  console.log(chalk.green(`✅ Distribution size OK: ${sizeMB.toFixed(2)} MB`));
  console.log(chalk.gray("   Target achieved: 96% reduction from ~300MB"));
}

async function analyzeBuildContents(): Promise<void> {
  console.log(chalk.blue("\n📊 Analyzing build contents..."));

  try {
    // Use 'du' to analyze directory sizes
    const output = execSync(`du -sh ${DIST_DIR}/*`, { encoding: "utf8" });
    console.log(chalk.gray(output));
  } catch (_error) {
    console.log(chalk.yellow("Could not analyze build contents"));
  }

  // Check if playwright is accidentally bundled
  const buildContent = execSync(`strings ${BUILD_FILE} | grep -i playwright || true`, {
    encoding: "utf8",
  });

  if (
    buildContent.includes("chromium") ||
    buildContent.includes("firefox") ||
    buildContent.includes("webkit")
  ) {
    console.log(chalk.yellow("\n⚠️  Found browser references in build:"));
    console.log(chalk.gray(`${buildContent.slice(0, 500)}...`));
  }
}

async function verifyExternals(): Promise<void> {
  console.log(chalk.blue("\n🔧 Verifying build externals..."));

  const packageJson = await Bun.file(join(process.cwd(), "package.json")).json();
  const buildScript = packageJson.scripts?.build;

  if (!buildScript) {
    console.log(chalk.red("❌ No build script found in package.json"));
    return;
  }

  const requiredExternals = ["playwright", "@playwright/test", "electron"];
  const missingExternals: string[] = [];

  for (const external of requiredExternals) {
    if (!buildScript.includes(`--external ${external}`)) {
      missingExternals.push(external);
    }
  }

  if (missingExternals.length > 0) {
    console.log(chalk.red("❌ Missing external flags in build script:"));
    for (const ext of missingExternals) {
      console.log(chalk.red(`   - --external ${ext}`));
    }
    console.log(chalk.yellow("\nAdd these to the build script to exclude browser binaries"));
  } else {
    console.log(chalk.green("✅ All required externals are configured"));
  }
}

async function checkPlaywrightInstall(): Promise<void> {
  console.log(chalk.blue("\n🎭 Checking Playwright installation..."));

  const nodeModulesPlaywright = join(process.cwd(), "node_modules", "playwright");

  if (!existsSync(nodeModulesPlaywright)) {
    console.log(chalk.gray("Playwright not installed in node_modules"));
    return;
  }

  // Check for browser binaries in node_modules
  const playwrightBrowsersPath = join(
    process.cwd(),
    "node_modules",
    "playwright-core",
    ".local-browsers",
  );

  if (existsSync(playwrightBrowsersPath)) {
    const stats = statSync(playwrightBrowsersPath);
    const sizeMB = stats.size / (1024 * 1024);
    console.log(
      chalk.yellow(`⚠️  Found Playwright browsers in node_modules: ${sizeMB.toFixed(2)} MB`),
    );
    console.log(chalk.gray("   These should not be included in the distribution"));
  } else {
    console.log(chalk.green("✅ No browser binaries found in node_modules"));
  }
}

async function generateReport(): Promise<void> {
  console.log(chalk.blue("\n📋 Distribution Optimization Report"));
  console.log(chalk.gray("=".repeat(50)));

  const stats = existsSync(BUILD_FILE) ? statSync(BUILD_FILE) : null;
  const currentSize = stats ? stats.size / (1024 * 1024) : 0;
  const originalSize = 300; // Approximate size with browsers
  const reduction = ((originalSize - currentSize) / originalSize) * 100;

  console.log(chalk.white(`Original size (with browsers): ~${originalSize} MB`));
  console.log(chalk.white(`Current size: ${currentSize.toFixed(2)} MB`));
  console.log(chalk.white(`Size reduction: ${reduction.toFixed(1)}%`));
  console.log(chalk.white("Target: 96% reduction (~12 MB)"));

  if (reduction >= 95) {
    console.log(chalk.green("\n✅ Distribution optimization successful!"));
  } else {
    console.log(chalk.yellow("\n⚠️  Further optimization needed"));
  }
}

// Main execution
async function main() {
  console.log(chalk.bold("\n🚀 Brooklyn Distribution Optimization Check\n"));

  await verifyExternals();
  await checkDistributionSize();
  await checkPlaywrightInstall();
  await generateReport();

  console.log(chalk.gray("\nTip: Run this after 'bun run build' to verify distribution size"));
}

main().catch((error) => {
  console.error(chalk.red("Error:"), error);
  process.exit(1);
});
