#!/usr/bin/env bun

/**
 * Version management script for Brooklyn MCP server
 *
 * This script allows updating the version in both the VERSION file and package.json.
 * The VERSION file is treated as the Single Source of Truth.
 *
 * Usage:
 *   bun scripts/version.ts [command]
 *
 * Commands:
 *   get              - Display the current version
 *   set <version>    - Set a specific version (e.g., 1.2.3)
 *   bump [type]      - Bump version (major, minor, patch - defaults to patch)
 *   sync             - Sync package.json with VERSION file
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const versionFilePath = path.join(rootDir, "VERSION");
const packageJsonPath = path.join(rootDir, "package.json");

async function getCurrentVersion(): Promise<string> {
  try {
    const version = await fs.readFile(versionFilePath, "utf-8");
    return version.trim();
  } catch (error) {
    console.error("Error reading VERSION file:", error);
    process.exit(1);
  }
}

async function updateVersion(newVersion: string): Promise<void> {
  try {
    await fs.writeFile(versionFilePath, newVersion);
    console.info(`VERSION file updated to ${newVersion}`);

    // Update package.json
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
    packageJson.version = newVersion;
    await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
    console.info(`package.json updated to version ${newVersion}`);
  } catch (error) {
    console.error("Error updating version:", error);
    process.exit(1);
  }
}

async function bumpVersion(type: "major" | "minor" | "patch" = "patch"): Promise<string> {
  const currentVersion = await getCurrentVersion();
  const versionParts = currentVersion.split(".").map(Number);
  const major = versionParts[0] || 0;
  const minor = versionParts[1] || 0;
  const patch = versionParts[2] || 0;

  let newVersion: string;

  switch (type) {
    case "major":
      newVersion = `${major + 1}.0.0`;
      break;
    case "minor":
      newVersion = `${major}.${minor + 1}.0`;
      break;
    default:
      newVersion = `${major}.${minor}.${patch + 1}`;
      break;
  }

  return newVersion;
}

async function syncVersions(): Promise<void> {
  const version = await getCurrentVersion();
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));

  if (packageJson.version !== version) {
    packageJson.version = version;
    await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
    console.info(`package.json synchronized to version ${version}`);
  } else {
    console.info(`Versions already in sync (${version})`);
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] || "get";

  switch (command) {
    case "get":
      console.info(await getCurrentVersion());
      break;

    case "set": {
      const newVersion = process.argv[3];
      if (!(newVersion && /^\d+\.\d+\.\d+$/.test(newVersion))) {
        console.error("Please provide a valid version number (e.g., 1.2.3)");
        process.exit(1);
      }
      await updateVersion(newVersion);
      break;
    }

    case "bump": {
      const type = process.argv[3] as "major" | "minor" | "patch" | undefined;
      if (type && !["major", "minor", "patch"].includes(type)) {
        console.error("Bump type must be one of: major, minor, patch");
        process.exit(1);
      }
      const bumpedVersion = await bumpVersion(type);
      await updateVersion(bumpedVersion);
      break;
    }

    case "sync":
      await syncVersions();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      console.error("Usage: bun scripts/version.ts [get|set|bump|sync]");
      process.exit(1);
  }
}

main().catch(console.error);
