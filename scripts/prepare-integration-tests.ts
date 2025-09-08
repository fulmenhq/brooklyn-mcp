#!/usr/bin/env bun

/**
 * Integration Test Preparation Script
 *
 * Ensures the environment is ready for running integration tests by:
 * - Checking browser installations
 * - Verifying no conflicting processes
 * - Installing missing dependencies
 * - Reporting environment status
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import { chromium, firefox, webkit } from "playwright";
import { InstanceManager } from "../src/core/instance-manager.js";

interface EnvironmentStatus {
  browsersInstalled: boolean;
  browserDetails: {
    chromium: boolean;
    firefox: boolean;
    webkit: boolean;
  };
  processesRunning: boolean;
  runningProcesses: string[];
  portsAvailable: boolean;
  blockedPorts: number[];
  ready: boolean;
}

/**
 * Check if browsers are installed by attempting to get executable path
 */
async function checkBrowserInstallation(): Promise<{
  installed: boolean;
  details: { chromium: boolean; firefox: boolean; webkit: boolean };
}> {
  const results = {
    chromium: false,
    firefox: false,
    webkit: false,
  };

  try {
    // Check each browser by seeing if we can get its executable path
    try {
      const path = chromium.executablePath();
      results.chromium = !!path && existsSync(path);
    } catch {
      results.chromium = false;
    }

    try {
      const path = firefox.executablePath();
      results.firefox = !!path && existsSync(path);
    } catch {
      results.firefox = false;
    }

    try {
      const path = webkit.executablePath();
      results.webkit = !!path && existsSync(path);
    } catch {
      results.webkit = false;
    }
  } catch (error) {
    console.error("Error checking browser installation:", error);
  }

  const allInstalled = results.chromium && results.firefox && results.webkit;
  return { installed: allInstalled, details: results };
}

/**
 * Check for running Brooklyn processes
 */
async function checkRunningProcesses(): Promise<{
  running: boolean;
  processes: string[];
}> {
  try {
    const processes = await InstanceManager.findBrooklynProcesses();
    return {
      running: processes.length > 0,
      processes,
    };
  } catch {
    return { running: false, processes: [] };
  }
}

/**
 * Check if required ports are available
 */
async function checkPortAvailability(): Promise<{
  available: boolean;
  blockedPorts: number[];
}> {
  const portsToCheck = [3000]; // Add more ports as needed
  const blockedPorts: number[] = [];

  for (const port of portsToCheck) {
    try {
      // Try to check if port is in use using lsof
      execSync(`lsof -ti:${port}`, { stdio: "pipe" });
      blockedPorts.push(port);
    } catch {
      // Port is free (lsof returns error when port not in use)
    }
  }

  return {
    available: blockedPorts.length === 0,
    blockedPorts,
  };
}

/**
 * Install Playwright browsers
 */
async function installBrowsers(force = false): Promise<boolean> {
  if (!force) {
    console.log(chalk.yellow("\n🔍 Browsers not installed. Would you like to install them now?"));
    console.log(chalk.gray("This will download Chromium, Firefox, and WebKit (~150MB each)."));
    console.log(chalk.gray("Press 'y' to install, any other key to skip.\n"));

    // Simple confirmation without inquirer dependency
    const response = await new Promise<string>((resolve) => {
      process.stdin.once("data", (data) => {
        resolve(data.toString().trim().toLowerCase());
      });
      process.stdin.resume();
    });

    if (response !== "y") {
      console.log(chalk.yellow("⏭️  Skipping browser installation."));
      return false;
    }
  }

  console.log(chalk.blue("\n📦 Installing Playwright browsers..."));
  console.log(chalk.gray("This may take a few minutes...\n"));

  try {
    // Use local node_modules playwright to match MCP server version
    const playwrightBin = join(process.cwd(), "node_modules", ".bin", "playwright");
    execSync(`"${playwrightBin}" install`, { stdio: "inherit" });
    console.log(chalk.green("\n✅ Browsers installed successfully!"));
    return true;
  } catch (error) {
    console.error(chalk.red("\n❌ Failed to install browsers:"), error);
    return false;
  }
}

/**
 * Clean up running Brooklyn processes
 */
async function cleanupProcesses(): Promise<void> {
  console.log(chalk.blue("\n🧹 Cleaning up Brooklyn processes..."));

  try {
    const instanceManager = new InstanceManager();
    const cleaned = await instanceManager.cleanupAllProcesses();

    if (cleaned > 0) {
      console.log(chalk.green(`✅ Cleaned up ${cleaned} Brooklyn processes`));
    } else {
      console.log(chalk.gray("No processes to clean up"));
    }
  } catch (error) {
    console.error(chalk.red("Failed to cleanup processes:"), error);
  }
}

/**
 * Display environment status
 */
function displayStatus(status: EnvironmentStatus): void {
  console.log(chalk.bold("\n🔍 Environment Status\n"));

  // Browser status
  const browserIcon = status.browsersInstalled ? "✅" : "❌";
  console.log(
    `${browserIcon} Playwright browsers: ${status.browsersInstalled ? "Installed" : "Not installed"}`,
  );

  if (!status.browsersInstalled) {
    const missing = [];
    if (!status.browserDetails.chromium) missing.push("chromium");
    if (!status.browserDetails.firefox) missing.push("firefox");
    if (!status.browserDetails.webkit) missing.push("webkit");
    console.log(chalk.gray(`   Missing: ${missing.join(", ")}`));
  } else {
    console.log(chalk.gray("   All browsers installed (chromium, firefox, webkit)"));
  }

  // Process status
  const processIcon = !status.processesRunning ? "✅" : "⚠️";
  console.log(
    `${processIcon} Brooklyn processes: ${status.processesRunning ? "Running" : "None running"}`,
  );

  if (status.processesRunning) {
    console.log(chalk.yellow("   Found running processes:"));
    for (const proc of status.runningProcesses) {
      console.log(chalk.gray(`   - ${proc.trim()}`));
    }
  }

  // Port status
  const portIcon = status.portsAvailable ? "✅" : "⚠️";
  console.log(`${portIcon} Required ports: ${status.portsAvailable ? "Available" : "In use"}`);

  if (!status.portsAvailable) {
    console.log(chalk.yellow(`   Blocked ports: ${status.blockedPorts.join(", ")}`));
  }

  // Overall status
  console.log(
    `\n${chalk.bold(
      status.ready
        ? chalk.green("✅ Environment: Ready for integration tests")
        : chalk.red("❌ Environment: Not ready for integration tests"),
    )}`,
  );
}

/**
 * Main preparation function
 */
async function prepareEnvironment(): Promise<void> {
  console.log(chalk.bold.blue("\n🚀 Brooklyn Integration Test Preparation\n"));

  // Check current status
  const browserStatus = await checkBrowserInstallation();
  const processStatus = await checkRunningProcesses();
  const portStatus = await checkPortAvailability();

  const status: EnvironmentStatus = {
    browsersInstalled: browserStatus.installed,
    browserDetails: browserStatus.details,
    processesRunning: processStatus.running,
    runningProcesses: processStatus.processes,
    portsAvailable: portStatus.available,
    blockedPorts: portStatus.blockedPorts,
    ready: false,
  };

  // Display initial status
  displayStatus(status);

  // Fix issues if any
  let changesMade = false;

  // Install browsers if missing
  if (!status.browsersInstalled) {
    console.log(chalk.yellow("\n⚠️  Browsers are required for integration tests."));
    const installed = await installBrowsers();
    if (installed) {
      changesMade = true;
      const newBrowserStatus = await checkBrowserInstallation();
      status.browsersInstalled = newBrowserStatus.installed;
      status.browserDetails = newBrowserStatus.details;
    }
  }

  // Clean up processes if running
  if (status.processesRunning) {
    console.log(chalk.yellow("\n⚠️  Running Brooklyn processes detected."));
    console.log(chalk.gray("Integration tests require a clean environment."));
    await cleanupProcesses();
    changesMade = true;
    const newProcessStatus = await checkRunningProcesses();
    status.processesRunning = newProcessStatus.running;
    status.runningProcesses = newProcessStatus.processes;
  }

  // Check if environment is ready
  status.ready = status.browsersInstalled && !status.processesRunning && status.portsAvailable;

  // Display final status if changes were made
  if (changesMade) {
    console.log(chalk.bold("\n📊 Updated Environment Status\n"));
    displayStatus(status);
  }

  // Provide guidance if not ready
  if (!status.ready) {
    console.log(chalk.yellow("\n⚠️  Environment is not ready for integration tests."));

    if (!status.browsersInstalled) {
      console.log(chalk.red("\n❌ Browsers are required. Run this script again or:"));
      console.log(chalk.gray("   bun run setup:browsers"));
    }

    if (!status.portsAvailable) {
      console.log(chalk.red("\n❌ Required ports are in use. Check for other services on:"));
      for (const port of status.blockedPorts) {
        console.log(chalk.gray(`   - Port ${port}`));
      }
    }

    console.log(chalk.yellow("\n💡 You can still run unit tests without browsers:"));
    console.log(chalk.gray("   bun run test:unit"));

    process.exit(1);
  }

  console.log(chalk.green("\n🎉 Your environment is ready for integration tests!"));
  console.log(chalk.gray("\nYou can now run:"));
  console.log(chalk.gray("  bun run test:integration"));
  console.log(chalk.gray("  bun run test\n"));
}

/**
 * Check environment status without making changes
 */
async function checkEnvironment(): Promise<void> {
  console.log(chalk.bold.blue("\n🔍 Brooklyn Integration Test Environment Check\n"));

  // Check current status
  const browserStatus = await checkBrowserInstallation();
  const processStatus = await checkRunningProcesses();
  const portStatus = await checkPortAvailability();

  const status: EnvironmentStatus = {
    browsersInstalled: browserStatus.installed,
    browserDetails: browserStatus.details,
    processesRunning: processStatus.running,
    runningProcesses: processStatus.processes,
    portsAvailable: portStatus.available,
    blockedPorts: portStatus.blockedPorts,
    ready: browserStatus.installed && !processStatus.running && portStatus.available,
  };

  // Display status
  displayStatus(status);

  if (!status.ready) {
    console.log(chalk.yellow("\n💡 To prepare your environment, run:"));
    console.log(chalk.gray("   bun run test:integration:prep\n"));
    process.exit(1);
  }
}

// Run the preparation
if (import.meta.main) {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check-only");

  if (checkOnly) {
    checkEnvironment().catch((error) => {
      console.error(chalk.red("\n❌ Check failed:"), error);
      process.exit(1);
    });
  } else {
    prepareEnvironment().catch((error) => {
      console.error(chalk.red("\n❌ Preparation failed:"), error);
      process.exit(1);
    });
  }
}

export {
  checkBrowserInstallation,
  checkRunningProcesses,
  checkPortAvailability,
  prepareEnvironment,
};
