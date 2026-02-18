#!/usr/bin/env bun

/**
 * Release validation script for Brooklyn MCP
 * Validates all requirements for a successful release
 */

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

interface ValidationResult {
  name: string;
  success: boolean;
  message: string;
  duration?: number;
}

async function runValidation(
  name: string,
  command: string,
  args: string[] = [],
  envOverride?: NodeJS.ProcessEnv,
): Promise<ValidationResult> {
  const startTime = Date.now();

  try {
    console.log(chalk.blue(`🔍 ${name}...`));
    execSync(`${command} ${args.join(" ")}`.trim(), {
      cwd: rootDir,
      stdio: ["inherit", "inherit", "pipe"], // Capture stderr to avoid Windows warnings causing failures
      encoding: "utf-8",
      env: {
        ...process.env,
        ...envOverride,
      },
    });

    const duration = Date.now() - startTime;
    console.log(chalk.green(`✅ ${name} passed (${duration}ms)`));

    return {
      name,
      success: true,
      message: "Passed",
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    // Check if this is just a Windows stderr warning with successful exit code
    if (error && typeof error === "object" && "status" in error) {
      const execError = error as { status: number; stderr?: Buffer | string };
      if (execError.status === 0) {
        // Command succeeded but had stderr output (common on Windows)
        console.log(chalk.green(`✅ ${name} passed (${duration}ms)`));
        return {
          name,
          success: true,
          message: "Passed with warnings",
          duration,
        };
      }
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`❌ ${name} failed: ${errorMessage}`));

    return {
      name,
      success: false,
      message: errorMessage,
      duration,
    };
  }
}

async function validateCodeQuality(): Promise<ValidationResult[]> {
  console.log(chalk.bold("\n🔧 Code Quality Validation"));
  console.log(chalk.gray("=".repeat(40)));

  const results: ValidationResult[] = [];

  // Format check
  results.push(await runValidation("Code Formatting", "bun", ["run", "format:code"]));

  // Type check
  results.push(await runValidation("TypeScript Check", "bun", ["run", "typecheck"]));

  // Lint check
  results.push(await runValidation("Linting", "bun", ["run", "lint"]));

  // MCP schema compliance
  results.push(await runValidation("MCP Schema Compliance", "bun", ["run", "check:mcp-schema"]));

  return results;
}

async function validateTests(): Promise<ValidationResult[]> {
  console.log(chalk.bold("\n🧪 Test Validation"));
  console.log(chalk.gray("=".repeat(40)));

  const results: ValidationResult[] = [];

  const testEnv: NodeJS.ProcessEnv = {
    BROOKLYN_HEADLESS: "true",
    PLAYWRIGHT_HEADLESS: "true",
    NODE_OPTIONS: "--max-old-space-size=4096",
  };

  // Setup test infrastructure first
  results.push(
    await runValidation("Test Infrastructure Setup", "bun", ["run", "setup:test-infra"], testEnv),
  );

  // Unit tests
  results.push(await runValidation("Unit Tests", "bun", ["run", "test:unit"], testEnv));

  // Integration tests
  results.push(
    await runValidation("Integration Tests", "bun", ["run", "test:integration"], testEnv),
  );

  // E2E tests
  results.push(await runValidation("E2E Tests", "bun", ["run", "test:e2e"], testEnv));

  return results;
}

async function validateBuild(): Promise<ValidationResult[]> {
  console.log(chalk.bold("\n🔨 Build Validation"));
  console.log(chalk.gray("=".repeat(40)));

  const results: ValidationResult[] = [];

  // Single platform build
  results.push(await runValidation("Single Platform Build", "bun", ["run", "build"]));

  // Cross-platform builds
  results.push(await runValidation("Cross-Platform Builds", "bun", ["run", "build:all"]));

  // Distribution packaging
  results.push(await runValidation("Distribution Packaging", "bun", ["run", "package:all"]));

  return results;
}

async function validateLicenses(): Promise<ValidationResult[]> {
  console.log(chalk.bold("\n📄 License Validation"));
  console.log(chalk.gray("=".repeat(40)));

  const results: ValidationResult[] = [];

  // License scan
  results.push(await runValidation("License Scan", "bun", ["run", "license:scan"]));

  // Strict license policy
  results.push(await runValidation("Strict License Policy", "bun", ["run", "license:scan:strict"]));

  return results;
}

async function validateVersion(): Promise<ValidationResult[]> {
  console.log(chalk.bold("\n🔢 Version Validation"));
  console.log(chalk.gray("=".repeat(40)));

  const results: ValidationResult[] = [];

  try {
    // Check VERSION file exists
    const versionPath = path.join(rootDir, "VERSION");
    const versionContent = await fs.readFile(versionPath, "utf-8");
    const version = versionContent.trim();

    if (!version) {
      results.push({
        name: "Version File",
        success: false,
        message: "VERSION file is empty",
      });
    } else {
      results.push({
        name: "Version File",
        success: true,
        message: `Version: ${version}`,
      });
    }

    // Check package.json version matches
    const packageJsonPath = path.join(rootDir, "package.json");
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));

    if (packageJson.version !== version) {
      results.push({
        name: "Package Version",
        success: false,
        message: `Package.json version (${packageJson.version}) doesn't match VERSION file (${version})`,
      });
    } else {
      results.push({
        name: "Package Version",
        success: true,
        message: "Versions match",
      });
    }
  } catch (error) {
    results.push({
      name: "Version Validation",
      success: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return results;
}

async function validateBinaries(): Promise<ValidationResult[]> {
  console.log(chalk.bold("\n📦 Binary Validation"));
  console.log(chalk.gray("=".repeat(40)));

  const results: ValidationResult[] = [];

  try {
    const distDir = path.join(rootDir, "dist");
    const releaseDir = path.join(distDir, "release");

    // Binaries that can be cross-compiled from any host (Bun limitation).
    // darwin-x64 (Intel): dropped in v0.3.4
    // windows-arm64: built natively via .github/workflows/release-windows-arm64.yml
    const expectedBinaries = [
      "brooklyn-linux-amd64",
      "brooklyn-linux-arm64",
      "brooklyn-darwin-arm64",
      "brooklyn-windows-amd64.exe",
    ];

    let foundBinaries = 0;
    let totalSize = 0;

    for (const binary of expectedBinaries) {
      const binaryPath = path.join(distDir, binary);
      try {
        const stats = await fs.stat(binaryPath);
        foundBinaries++;
        totalSize += stats.size;

        // Standalone compiled binaries are ~60-120MB
        if (stats.size > 150 * 1024 * 1024) {
          results.push({
            name: `Binary Size (${binary})`,
            success: false,
            message: `Size ${(stats.size / 1024 / 1024).toFixed(2)}MB exceeds 150MB limit`,
          });
        }
      } catch {
        results.push({
          name: `Binary (${binary})`,
          success: false,
          message: "Binary not found",
        });
      }
    }

    if (foundBinaries === expectedBinaries.length) {
      results.push({
        name: "All Binaries Present",
        success: true,
        message: `${foundBinaries}/${expectedBinaries.length} binaries found`,
      });

      results.push({
        name: "Total Binary Size",
        success: true,
        message: `${(totalSize / 1024 / 1024).toFixed(2)}MB total`,
      });
    }

    // Check distribution artifacts
    try {
      await fs.access(releaseDir);
      const releaseFiles = await fs.readdir(releaseDir);
      const zipFiles = releaseFiles.filter((f) => f.endsWith(".zip"));
      const tarFiles = releaseFiles.filter((f) => f.endsWith(".tar.gz"));

      results.push({
        name: "Distribution Artifacts",
        success: zipFiles.length > 0 && tarFiles.length > 0,
        message: `${zipFiles.length} ZIP files, ${tarFiles.length} TAR files`,
      });
    } catch {
      results.push({
        name: "Distribution Artifacts",
        success: false,
        message: "Release directory not found",
      });
    }
  } catch (error) {
    results.push({
      name: "Binary Validation",
      success: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return results;
}

async function printSummary(allResults: ValidationResult[]): Promise<void> {
  console.log(chalk.bold("\n📊 Release Validation Summary"));
  console.log(chalk.gray("=".repeat(50)));

  const successful = allResults.filter((r) => r.success);
  const failed = allResults.filter((r) => !r.success);
  const totalDuration = allResults.reduce((sum, r) => sum + (r.duration || 0), 0);

  console.log(chalk.white(`Total validations: ${allResults.length}`));
  console.log(chalk.green(`Successful: ${successful.length}`));
  if (failed.length > 0) {
    console.log(chalk.red(`Failed: ${failed.length}`));
  }
  console.log(chalk.white(`Total duration: ${(totalDuration / 1000).toFixed(2)}s`));

  if (failed.length > 0) {
    console.log(chalk.red("\n❌ Release validation failed!"));
    console.log(chalk.red("Fix the following issues before releasing:"));
    for (const result of failed) {
      console.log(chalk.red(`   - ${result.name}: ${result.message}`));
    }
  } else {
    console.log(chalk.green("\n✅ All release validations passed!"));
    console.log(chalk.green("Ready for release!"));
  }
}

async function main(): Promise<void> {
  console.log(chalk.bold("\n🚀 Brooklyn MCP Release Validation\n"));

  try {
    const allResults: ValidationResult[] = [];

    // Run all validations
    allResults.push(...(await validateCodeQuality()));
    allResults.push(...(await validateTests()));
    allResults.push(...(await validateBuild()));
    allResults.push(...(await validateLicenses()));
    allResults.push(...(await validateVersion()));
    allResults.push(...(await validateBinaries()));

    // Print summary
    await printSummary(allResults);

    // Exit with error code if any validations failed
    const failed = allResults.filter((r) => !r.success);
    if (failed.length > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red("❌ Release validation failed:"), error);
    process.exit(1);
  }
}

// Only run if this script is executed directly
if (import.meta.main) {
  main().catch((error) => {
    console.error(chalk.red("❌ Release validation failed:"), error);
    process.exit(1);
  });
}
