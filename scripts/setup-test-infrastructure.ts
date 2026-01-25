#!/usr/bin/env bun
/**
 * Setup Test Infrastructure
 *
 * Ensures all required directories and files exist for testing in CI/CD environments
 * Includes browser preflight checks to prevent mid-test worker crashes
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
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

/**
 * Verify Playwright browsers are installed and accessible
 * Prevents mid-test "worker exited unexpectedly" errors
 *
 * Note: Uses stderr for all output per Unix convention (stdout = data, stderr = diagnostics)
 */
async function verifyBrowsersInstalled(): Promise<void> {
  // Always use stderr for diagnostic output (Unix convention)
  const log = console.error;

  log("🌐 Verifying browser installations...");

  // Check if we're skipping browser checks (for unit tests only)
  if (process.env["SKIP_BROWSER_CHECK"] === "true") {
    log("⏭️  Skipping browser check (SKIP_BROWSER_CHECK=true)");
    return;
  }

  try {
    // Get Playwright cache directory
    const cacheBase =
      process.platform === "darwin"
        ? join(homedir(), "Library", "Caches")
        : process.platform === "win32"
          ? join(homedir(), "AppData", "Local")
          : join(homedir(), ".cache");

    const playwrightCacheDir = join(cacheBase, "ms-playwright");

    // Check if Playwright cache exists
    if (!existsSync(playwrightCacheDir)) {
      log("❌ Playwright browsers not found");
      log(`   Expected at: ${playwrightCacheDir}`);
      log("");
      log("   Run one of the following commands to install:");
      log("   • bun run setup:browsers");
      log("   • bunx playwright install chromium");
      log("");
      process.exit(1);
    }

    // Check for Chromium installation (required for most tests)
    const entries = readdirSync(playwrightCacheDir);
    const chromiumDirs = entries.filter((entry) => entry.startsWith("chromium-"));

    if (chromiumDirs.length === 0) {
      log("❌ Chromium browser not installed");
      log(`   Playwright cache: ${playwrightCacheDir}`);
      log("");
      log("   Run: bun run setup:browsers");
      log("");
      process.exit(1);
    }

    // Verify browser executable exists and is accessible
    // Safety: chromiumDirs.length > 0 is guaranteed by check above
    const chromiumDir = join(playwrightCacheDir, chromiumDirs[0] as string);
    let browserExecutable: string;

    if (process.platform === "darwin") {
      // Check for arm64 (Apple Silicon) first, then fall back to Intel
      const chromeMacDir = existsSync(join(chromiumDir, "chrome-mac-arm64"))
        ? "chrome-mac-arm64"
        : "chrome-mac";

      // Playwright 1.40+ uses "Google Chrome for Testing.app", older versions use "Chromium.app"
      const newStyleApp = join(
        chromiumDir,
        chromeMacDir,
        "Google Chrome for Testing.app",
        "Contents",
        "MacOS",
        "Google Chrome for Testing",
      );
      const oldStyleApp = join(
        chromiumDir,
        chromeMacDir,
        "Chromium.app",
        "Contents",
        "MacOS",
        "Chromium",
      );
      browserExecutable = existsSync(newStyleApp) ? newStyleApp : oldStyleApp;
    } else if (process.platform === "win32") {
      browserExecutable = join(chromiumDir, "chrome-win", "chrome.exe");
    } else {
      // Linux: Playwright 1.40+ may use different structures
      // Check multiple possible paths
      const possibleLinuxPaths = [
        join(chromiumDir, "chrome-linux", "chrome"),
        join(chromiumDir, "chrome", "linux-x64", "chrome"),
        join(chromiumDir, "chrome", "chrome"),
        join(chromiumDir, "chrome"),
      ];
      const foundPath = possibleLinuxPaths.find((p) => existsSync(p));
      browserExecutable = foundPath || possibleLinuxPaths[0];
    }

    if (!existsSync(browserExecutable)) {
      log("❌ Chromium executable not found");
      log(`   Expected at: ${browserExecutable}`);
      log("");
      log("   Browser directory may be corrupted. Force reinstall with:");
      log("   • bun run setup:browsers:force");
      log("");
      process.exit(1);
    }

    // Verify executable can be called (basic version check)
    try {
      execSync(`"${browserExecutable}" --version`, {
        stdio: "pipe",
        timeout: 5000,
      });
      log(`✅ Chromium verified: ${chromiumDirs[0]}`);
    } catch (execError) {
      log("❌ Chromium executable exists but cannot be executed");
      log(`   Path: ${browserExecutable}`);
      log("");
      log("   Error:", execError instanceof Error ? execError.message : String(execError));
      log("");
      log("   Try force reinstalling browsers:");
      log("   • bun run setup:browsers:force");
      log("");
      process.exit(1);
    }
  } catch (catchError) {
    log("❌ Browser verification failed");
    log("   Error:", catchError instanceof Error ? catchError.message : String(catchError));
    log("");
    log("   If you're running unit tests only, set:");
    log("   SKIP_BROWSER_CHECK=true bun run test");
    log("");
    process.exit(1);
  }
}

export async function setupTestInfrastructure(): Promise<void> {
  // Always use stderr for diagnostic output (Unix convention: stdout = data, stderr = diagnostics)
  const log = console.error;

  log("🔧 Setting up test infrastructure...");

  // Create required directories in project
  for (const dir of requiredDirectories) {
    const dirPath = join(process.cwd(), dir);
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
      log(`✅ Created directory: ${dir}`);
    }
  }

  // Create required temp directories
  const requiredTempDirs = getRequiredTempDirs();
  for (const dir of requiredTempDirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      log(`✅ Created temp directory: ${dir}`);
    }
  }

  // Verify browsers are installed (preflight check)
  await verifyBrowsersInstalled();

  log("✅ Test infrastructure setup complete!");
}

// Run if called directly
if (import.meta.main) {
  await setupTestInfrastructure();
}
