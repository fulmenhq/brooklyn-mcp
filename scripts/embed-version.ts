#!/usr/bin/env bun

/**
 * Embed version script - replaces version placeholders at build time
 * This ensures the built binary has the correct version embedded in ALL locations
 * Also generates build signatures for deterministic binary identification
 */

import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BuildSignature, GitStatus } from "../src/shared/build-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const versionFilePath = path.join(rootDir, "VERSION");

function safeExec(command: string, defaultValue = "unknown"): string {
  try {
    return execSync(command, { encoding: "utf-8", cwd: rootDir }).toString().trim();
  } catch {
    return defaultValue;
  }
}

function getGitStatus(): GitStatus {
  // Check if working tree is clean
  const statusOutput = safeExec("git status --porcelain", "");

  // Count different types of changes from porcelain output
  const lines = statusOutput.split("\n").filter((l) => l);
  const staged = lines.filter((l) => l[0] !== " " && l[0] !== "?").length;
  const unstaged = lines.filter((l) => l[1] !== " " && l[1] !== "?").length;
  const untracked = lines.filter((l) => l.startsWith("??")).length;

  // Check if branch is ahead/behind remote
  const aheadBehind = safeExec(
    "git rev-list --count --left-right @{upstream}...HEAD 2>/dev/null",
    "0\t0",
  );
  const parts = aheadBehind.split("\t");
  const behind = Number.parseInt(parts[0] || "0");
  const ahead = Number.parseInt(parts[1] || "0");

  return {
    clean: statusOutput.length === 0,
    ahead,
    behind,
    staged,
    unstaged,
    untracked,
  };
}

async function generateBuildSignature(version: string): Promise<BuildSignature> {
  const gitCommit = safeExec("git rev-parse HEAD");
  const gitBranch = safeExec("git branch --show-current", "main");
  const gitStatus = getGitStatus();
  const nodeVersion = process.version;
  const bunVersion = safeExec("bun --version");

  return {
    version,
    gitCommit,
    gitBranch,
    gitStatus,
    buildTime: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    nodeVersion,
    bunVersion,
    buildEnv: process.env.NODE_ENV === "production" ? "production" : "development",
  };
}

// All files that need version embedding
const filesToUpdate = [
  {
    path: path.join(rootDir, "src/cli/brooklyn.ts"),
    pattern: /const VERSION = "(?:{{VERSION}}|[\d\.]+(?:-[0-9A-Za-z.-]+)?)";/,
    replacement: (version: string) => `const VERSION = "${version}";`,
    description: "CLI version constant",
    type: "version" as const,
  },
  {
    path: path.join(rootDir, "src/core/config.ts"),
    pattern:
      /version: "[\d\.]+(?:-[0-9A-Za-z.-]+)?", \/\/ (?:Will be replaced at build time|Embedded at build time)/,
    replacement: (version: string) => `version: "${version}", // Embedded at build time`,
    description: "Core config version",
    type: "version" as const,
  },
  {
    path: path.join(rootDir, "src/shared/build-config.ts"),
    pattern:
      /version: "[\d\.]+(?:-[0-9A-Za-z.-]+)?", \/\/ (?:This will be synced from package\.json|Synced from VERSION file)/,
    replacement: (version: string) => `version: "${version}", // Synced from VERSION file`,
    description: "Build config version",
    type: "version" as const,
  },
  // MCP transport now reads version from build-config dynamically - no need to embed
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
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const currentVersionRegex = new RegExp(`version: "${esc(version)}", \\/\\/`);
    const currentConstRegex = new RegExp(`const VERSION = "${esc(version)}";`);

    if (currentVersionRegex.test(content) || currentConstRegex.test(content)) {
      console.info(
        `🔄 Version ${version} already current in ${fileConfig.description} (${path.basename(fileConfig.path)})`,
      );
      return true; // Consider this success - no change needed
    }

    // All files are version-type now, replace with version only
    content = content.replace(fileConfig.pattern, fileConfig.replacement(version));

    if (content !== originalContent) {
      await fs.writeFile(fileConfig.path, content);
      console.info(
        `✅ Version ${version} embedded in ${fileConfig.description} (${path.basename(fileConfig.path)})`,
      );
      return true;
    }

    console.warn(
      `⚠️  Pattern not found in ${fileConfig.description} (${path.basename(fileConfig.path)})`,
    );
    return false;
  } catch (error) {
    console.error(`❌ Error updating ${fileConfig.description}:`, error);
    return false;
  }
}

async function generateBuildSignatureFile(buildSignature: BuildSignature): Promise<void> {
  const buildSignatureFilePath = path.join(rootDir, "src/generated/build-signature.ts");

  // Generate TypeScript-compatible object literal instead of JSON
  const formatValue = (value: unknown, indent = 0): string => {
    const spaces = "  ".repeat(indent);
    const nextSpaces = "  ".repeat(indent + 1);

    if (value === null) return "null";
    if (typeof value === "string") return `"${value}"`;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return `[${value.map((v) => formatValue(v, indent)).join(", ")}]`;
    if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      const formatted = entries
        .map(([key, val]) => `${nextSpaces}${key}: ${formatValue(val, indent + 1)}`)
        .join(",\n");
      return `{\n${formatted},\n${spaces}}`;
    }
    return String(value);
  };

  const content = `/**
 * Dynamic build signature - Generated at build time
 * This file is automatically generated by scripts/embed-version.ts
 * DO NOT EDIT MANUALLY - Changes will be overwritten
 */

import type { BuildSignature } from "../shared/build-config.js";

// Build signature with current build metadata
export const buildSignature: BuildSignature = ${formatValue(buildSignature)};
`;

  try {
    await fs.writeFile(buildSignatureFilePath, content);
    console.info("✅ Generated build signature file (build-signature.ts)");
  } catch (error) {
    console.error("❌ Error generating build signature file:", error);
    throw error;
  }
}

async function embedVersion(): Promise<void> {
  const version = await getCurrentVersion();
  console.info(`🚀 Embedding version ${version} in all source files...`);

  // Generate build signature
  const buildSignature = await generateBuildSignature(version);
  console.info(
    `🔧 Generated build signature: ${buildSignature.gitCommit.slice(0, 8)} (${buildSignature.gitBranch})`,
  );

  // Generate build signature file
  await generateBuildSignatureFile(buildSignature);

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
