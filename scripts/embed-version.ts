#!/usr/bin/env bun

/**
 * Embed version script - replaces version placeholders at build time
 * This ensures the built binary has the correct version embedded in ALL locations
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const versionFilePath = path.join(rootDir, "VERSION");

// All files that need version embedding
const filesToUpdate = [
  {
    path: path.join(rootDir, "src/cli/brooklyn.ts"),
    pattern: /const VERSION = "(?:{{VERSION}}|[\d\.]+)";/,
    replacement: (version: string) => `const VERSION = "${version}";`,
    description: "CLI version constant",
  },
  {
    path: path.join(rootDir, "src/core/config.ts"),
    pattern: /version: "[\d\.]+", \/\/ (?:Will be replaced at build time|Embedded at build time)/,
    replacement: (version: string) => `version: "${version}", // Embedded at build time`,
    description: "Core config version",
  },
  {
    path: path.join(rootDir, "src/shared/build-config.ts"),
    pattern:
      /version: "[\d\.]+", \/\/ (?:This will be synced from package\.json|Synced from VERSION file)/,
    replacement: (version: string) => `version: "${version}", // Synced from VERSION file`,
    description: "Build config version",
  },
  {
    path: path.join(rootDir, "src/transports/mcp-stdio-transport.ts"),
    pattern: /version: "[\d\.]+", \/\/ (?:Default, will be overridden|Embedded at build time)/,
    replacement: (version: string) => `version: "${version}", // Embedded at build time`,
    description: "MCP transport version",
  },
];

async function getCurrentVersion(): Promise<string> {
  try {
    const version = await fs.readFile(versionFilePath, "utf-8");
    return version.trim();
  } catch (error) {
    console.error("Error reading VERSION file:", error);
    process.exit(1);
  }
}

async function updateFile(
  fileConfig: (typeof filesToUpdate)[0],
  version: string,
): Promise<boolean> {
  try {
    let content = await fs.readFile(fileConfig.path, "utf-8");
    const originalContent = content;

    // Check if version is already current (idempotent behavior)
    const currentVersionRegex = new RegExp(`version: "${version.replace(/\./g, "\\.")}", \\/\\/`);
    const currentConstRegex = new RegExp(`const VERSION = "${version.replace(/\./g, "\\.")}";`);

    if (currentVersionRegex.test(content) || currentConstRegex.test(content)) {
      console.info(
        `🔄 Version ${version} already current in ${fileConfig.description} (${path.basename(fileConfig.path)})`,
      );
      return true; // Consider this success - no change needed
    }

    content = content.replace(fileConfig.pattern, fileConfig.replacement(version));

    if (content !== originalContent) {
      await fs.writeFile(fileConfig.path, content);
      console.info(
        `✅ Version ${version} embedded in ${fileConfig.description} (${path.basename(fileConfig.path)})`,
      );
      return true;
    } else {
      console.warn(
        `⚠️  Pattern not found in ${fileConfig.description} (${path.basename(fileConfig.path)})`,
      );
      return false;
    }
  } catch (error) {
    console.error(`❌ Error updating ${fileConfig.description}:`, error);
    return false;
  }
}

async function embedVersion(): Promise<void> {
  const version = await getCurrentVersion();
  console.info(`🚀 Embedding version ${version} in all source files...`);

  let successCount = 0;
  const totalFiles = filesToUpdate.length;

  for (const fileConfig of filesToUpdate) {
    const success = await updateFile(fileConfig, version);
    if (success) {
      successCount++;
    }
  }

  if (successCount === totalFiles) {
    console.info(
      `🎉 Successfully embedded version ${version} in ${successCount}/${totalFiles} files`,
    );
  } else {
    console.error(`⚠️  Only embedded version in ${successCount}/${totalFiles} files`);
    process.exit(1);
  }
}

embedVersion().catch(console.error);
