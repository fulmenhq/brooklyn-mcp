#!/usr/bin/env bun

/**
 * Version consistency checker for Brooklyn MCP server
 *
 * Verifies that all version references in the project are consistent
 * with the Single Source of Truth (VERSION file).
 *
 * Usage:
 *   bun scripts/check-versions.ts [--fix]
 *
 * Options:
 *   --fix: Apply fixes for inconsistent versions
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const versionFilePath = path.join(rootDir, "VERSION");
const packageJsonPath = path.join(rootDir, "package.json");

interface VersionLocation {
  path: string;
  description: string;
  getCurrentVersion: () => Promise<string>;
  updateVersion?: (newVersion: string) => Promise<void>;
}

// Define all locations where version info is stored
const versionLocations: VersionLocation[] = [
  {
    path: versionFilePath,
    description: "VERSION file (Source of Truth)",
    getCurrentVersion: async () => {
      const content = await fs.readFile(versionFilePath, "utf-8");
      return content.trim();
    },
  },
  {
    path: packageJsonPath,
    description: "package.json",
    getCurrentVersion: async () => {
      const content = await fs.readFile(packageJsonPath, "utf-8");
      const json = JSON.parse(content);
      return json.version;
    },
    updateVersion: async (newVersion: string) => {
      const content = await fs.readFile(packageJsonPath, "utf-8");
      const json = JSON.parse(content);
      json.version = newVersion;
      await fs.writeFile(packageJsonPath, `${JSON.stringify(json, null, 2)}\n`);
    },
  },
];

async function getSingleSourceOfTruth(): Promise<string> {
  try {
    const content = await fs.readFile(versionFilePath, "utf-8");
    return content.trim();
  } catch (error) {
    console.error("Error reading VERSION file:", error);
    process.exit(1);
  }
}

export async function checkVersionConsistency(): Promise<{
  consistent: boolean;
  sourceVersion: string;
  issues: string[];
}> {
  const sourceVersion = await getSingleSourceOfTruth();
  const issues: string[] = [];
  let consistent = true;

  for (const location of versionLocations) {
    try {
      const version = await location.getCurrentVersion();
      if (version !== sourceVersion) {
        consistent = false;
        issues.push(`${location.description}: ${version} (expected ${sourceVersion})`);
      }
    } catch (error) {
      consistent = false;
      issues.push(`${location.description}: Error reading version - ${error}`);
    }
  }

  return { consistent, sourceVersion, issues };
}

async function main() {
  const shouldFix = process.argv.includes("--fix");
  const sourceVersion = await getSingleSourceOfTruth();

  console.info(`\n🔍 Checking version consistency (Source of Truth: ${sourceVersion})\n`);

  let hasInconsistencies = false;

  // Check each location
  for (const location of versionLocations) {
    try {
      const version = await location.getCurrentVersion();

      if (version === sourceVersion) {
        console.info(`✅ ${location.description}: ${version} (consistent)`);
      } else {
        hasInconsistencies = true;
        console.info(`❌ ${location.description}: ${version} (inconsistent with ${sourceVersion})`);

        // Apply fix if requested and update method exists
        if (shouldFix && location.updateVersion) {
          await location.updateVersion(sourceVersion);
          console.info(`   ↳ Fixed: Updated to ${sourceVersion}`);
        }
      }
    } catch (error) {
      console.error(`❌ Error checking ${location.description}:`, error);
      hasInconsistencies = true;
    }
  }

  // Summary
  console.info("\n📋 Summary:");
  if (hasInconsistencies && !shouldFix) {
    console.error("❌ Version inconsistencies found! Run with --fix to update all versions.");
    process.exit(1);
  } else if (hasInconsistencies && shouldFix) {
    console.info(`✅ All versions have been synchronized to ${sourceVersion}`);
  } else {
    console.info(`✅ All versions are consistent with ${sourceVersion}`);
  }
}

// Only run main if called directly
if (import.meta.main) {
  main().catch((error) => {
    console.error("Error checking versions:", error);
    process.exit(1);
  });
}
