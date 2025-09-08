/**
 * Browser information command
 * Shows installed browsers, versions, and download status
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import chalk from "chalk";
import { BrowserInstallationManager } from "../../core/browser/browser-installation-manager.js";
import { SystemBrowserDetector } from "../../core/browser/system-browser-detector.js";

interface BrowserInfo {
  name: string;
  installed: boolean;
  version?: string;
  location?: string;
  size?: string;
  lastUpdated?: Date;
}

/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: CLI display function with necessary branches */
export async function browserInfoCommand(): Promise<void> {
  console.log(chalk.bold("\n🎭 Brooklyn Browser Information\n"));

  const _manager = new BrowserInstallationManager();
  const detector = new SystemBrowserDetector();
  const browsers: BrowserInfo[] = [];

  // Get the correct Playwright cache directory for this platform
  const cacheBase =
    process.platform === "darwin"
      ? join(homedir(), "Library", "Caches")
      : join(homedir(), ".cache");
  const playwrightCacheDir = join(cacheBase, "ms-playwright");

  // Check each browser type
  for (const browserType of ["chromium", "firefox", "webkit"] as const) {
    const info: BrowserInfo = {
      name: browserType,
      installed: false,
    };

    // Check if browser is installed by looking for directories (avoid launching browsers)
    let isInstalled = false;
    if (existsSync(playwrightCacheDir)) {
      try {
        const { readdir } = await import("node:fs/promises");
        const entries = await readdir(playwrightCacheDir);
        const browserDirs = entries.filter((entry) => entry.startsWith(`${browserType}-`));
        isInstalled = browserDirs.length > 0;
      } catch {
        isInstalled = false;
      }
    }

    if (isInstalled) {
      info.installed = true;
      info.location = "Playwright managed";

      // Get browser version from directory name (avoids launching browsers)
      try {
        if (existsSync(playwrightCacheDir)) {
          const { readdir } = await import("node:fs/promises");
          const entries = await readdir(playwrightCacheDir);
          const browserDirs = entries.filter((entry) => entry.startsWith(`${browserType}-`));

          if (browserDirs.length > 0) {
            // Use the most recent version (highest number)
            const latestDir = browserDirs.sort().pop();
            if (latestDir) {
              // Extract version number from directory name (e.g., "chromium-1181" -> "1181")
              const versionMatch = latestDir.match(/-(\d+)$/);
              info.version = versionMatch ? versionMatch[1] : "Unknown";
            }
          }
        }

        if (!info.version) {
          info.version = "Unknown";
        }
      } catch {
        info.version = "Unknown";
      }

      // Get size info from the correct platform-specific cache directory
      try {
        if (existsSync(playwrightCacheDir)) {
          // Find browser-specific directories with version suffixes
          const { readdir } = await import("node:fs/promises");
          const entries = await readdir(playwrightCacheDir);
          const browserDirs = entries.filter((entry) => entry.startsWith(`${browserType}-`));

          if (browserDirs.length > 0) {
            // Use the most recent version (highest number)
            const latestDir = browserDirs.sort().pop();
            if (latestDir) {
              const browserDir = join(playwrightCacheDir, latestDir);
              const stats = await stat(browserDir);
              info.lastUpdated = stats.mtime;

              // Calculate directory size
              const sizeOutput = execSync(`du -sh "${browserDir}" 2>/dev/null || echo "0"`, {
                encoding: "utf8",
              });
              info.size = sizeOutput.split("\t")[0]?.trim() || "Unknown";
            }
          }
        }
      } catch {
        info.size = "Unknown";
      }
    } else {
      // Check system browsers
      const systemBrowser = await detector.detectBrowser(browserType);
      if (systemBrowser) {
        info.installed = true;
        info.location = "System";
        info.version = systemBrowser.version || "Unknown";
      }
    }

    browsers.push(info);
  }

  // Display results
  console.log(chalk.blue("📊 Browser Status:\n"));

  for (const browser of browsers) {
    const status = browser.installed ? chalk.green("✓ Installed") : chalk.yellow("✗ Not installed");
    console.log(`${chalk.bold(browser.name.padEnd(10))} ${status}`);

    if (browser.installed) {
      console.log(chalk.gray(`  Location: ${browser.location}`));
      console.log(chalk.gray(`  Version:  ${browser.version}`));
      if (browser.size) {
        console.log(chalk.gray(`  Size:     ${browser.size}`));
      }
      if (browser.lastUpdated) {
        console.log(chalk.gray(`  Updated:  ${browser.lastUpdated.toLocaleDateString()}`));
      }
    } else {
      console.log(chalk.gray(`  Run 'brooklyn browser install ${browser.name}' to install`));
    }
    console.log();
  }

  // Show cache location (use the correct platform-specific path)
  console.log(chalk.blue("📁 Browser Cache Location:"));
  console.log(chalk.gray(`  ${playwrightCacheDir}\n`));

  // Show update instructions
  console.log(chalk.blue("🔄 Update Instructions:"));
  console.log(chalk.gray("  To update all browsers:"));
  console.log(chalk.white("    brooklyn browser update\n"));
  console.log(chalk.gray("  To update a specific browser:"));
  console.log(chalk.white("    brooklyn browser update chromium\n"));

  // Show disk usage summary
  try {
    const totalSize = execSync(`du -sh "${playwrightCacheDir}" 2>/dev/null || echo "0"`, {
      encoding: "utf8",
    });
    const size = totalSize.split("\t")[0]?.trim();
    if (size && size !== "0") {
      console.log(chalk.blue("💾 Total Disk Usage:"));
      console.log(chalk.gray(`  ${size} in ${playwrightCacheDir}\n`));
    }
  } catch {
    // Ignore errors
  }

  process.exit(0);
}

/**
 * Browser update command
 * Updates installed browsers to latest versions
 */
export async function browserUpdateCommand(browserType?: string): Promise<void> {
  console.log(chalk.bold("\n🔄 Brooklyn Browser Update\n"));

  const manager = new BrowserInstallationManager();

  if (browserType) {
    // Update specific browser
    console.log(chalk.blue(`Updating ${browserType}...`));

    try {
      // Force reinstall to get latest version
      await manager.installBrowser(browserType as "chromium" | "firefox" | "webkit", {
        interactive: true,
      });
      console.log(chalk.green(`✅ ${browserType} updated successfully!\n`));
    } catch (error) {
      console.error(
        chalk.red(
          `❌ Failed to update ${browserType}: ${error instanceof Error ? error.message : String(error)}\n`,
        ),
      );
      process.exit(1);
    }
  } else {
    // Update all installed browsers
    console.log(chalk.blue("Checking for browser updates...\n"));

    for (const browser of ["chromium", "firefox", "webkit"] as const) {
      const isInstalled = existsSync(manager.getBrowserPath(browser));

      if (isInstalled) {
        console.log(chalk.yellow(`Updating ${browser}...`));
        try {
          await manager.installBrowser(browser, { interactive: true });
          console.log(chalk.green(`✅ ${browser} updated successfully!`));
        } catch (error) {
          console.error(
            chalk.red(
              `❌ Failed to update ${browser}: ${error instanceof Error ? error.message : String(error)}`,
            ),
          );
        }
      } else {
        console.log(chalk.gray(`⏭️  ${browser} not installed, skipping...`));
      }
    }

    console.log(chalk.green("\n✅ Browser update complete!\n"));
  }

  // Show current versions after update
  console.log(chalk.blue("Current browser versions:"));
  await browserInfoCommand();
}

/**
 * Browser clean command
 * Removes old browser versions and cleans cache
 */
export async function browserCleanCommand(force = false): Promise<void> {
  console.log(chalk.bold("\n🧹 Brooklyn Browser Cleanup\n"));

  // Use correct platform-specific cache directory
  const cacheBase =
    process.platform === "darwin"
      ? join(homedir(), "Library", "Caches")
      : join(homedir(), ".cache");
  const cacheDir = join(cacheBase, "ms-playwright");

  if (!existsSync(cacheDir)) {
    console.log(chalk.yellow("No browser cache found.\n"));
    process.exit(0);
  }

  // Calculate current size
  let currentSize = "Unknown";
  try {
    const sizeOutput = execSync(`du -sh "${cacheDir}" 2>/dev/null`, { encoding: "utf8" });
    currentSize = sizeOutput.split("\t")[0]?.trim() || "Unknown";
  } catch {
    // Ignore
  }

  console.log(chalk.blue("Current browser cache:"));
  console.log(chalk.gray(`  Location: ${cacheDir}`));
  console.log(chalk.gray(`  Size: ${currentSize}\n`));

  if (!force) {
    console.log(chalk.yellow("⚠️  This will remove all downloaded browsers!"));
    console.log(chalk.gray("  Browsers will be re-downloaded on next use.\n"));
    console.log(chalk.white("  Use --force to confirm cleanup.\n"));
    process.exit(0);
  }

  console.log(chalk.yellow("Cleaning browser cache..."));

  try {
    // Remove browser directories
    const dirs = await readdir(cacheDir);
    for (const dir of dirs) {
      const fullPath = join(cacheDir, dir);
      if ((await stat(fullPath)).isDirectory()) {
        console.log(chalk.gray(`  Removing ${dir}...`));
        execSync(`rm -rf "${fullPath}"`);
      }
    }

    console.log(chalk.green("\n✅ Browser cache cleaned successfully!\n"));

    // Show space saved
    console.log(chalk.blue("Space recovered:"));
    console.log(chalk.green(`  ${currentSize} freed\n`));
  } catch (error) {
    console.error(
      chalk.red(
        `❌ Failed to clean cache: ${error instanceof Error ? error.message : String(error)}\n`,
      ),
    );
    process.exit(1);
  }

  process.exit(0);
}
