#!/usr/bin/env bun

/**
 * Clean Working Tree Validator - Ensures repo is clean before critical operations
 *
 * This script prevents pushes when the working tree is dirty, which can happen when:
 * - Version embedding modifies files without committing them
 * - Build artifacts are left uncommitted
 * - Manual edits are staged but not committed
 *
 * Used by prepush hooks to enforce release checklist compliance.
 */

import { execSync } from "node:child_process";
import process from "node:process";

interface ValidationResult {
  isClean: boolean;
  issues: string[];
  fixSuggestions: string[];
}

function safeExec(command: string): string {
  try {
    return execSync(command, { encoding: "utf-8", cwd: process.cwd() }).toString().trim();
  } catch (error) {
    return "";
  }
}

function getGitStatus(): ValidationResult {
  const statusOutput = safeExec("git status --porcelain");

  if (!statusOutput) {
    return {
      isClean: true,
      issues: [],
      fixSuggestions: [],
    };
  }

  const lines = statusOutput.split("\n").filter((l) => l.trim());
  const issues: string[] = [];
  const fixSuggestions: string[] = [];

  // Categorize changes
  const modifiedFiles: string[] = [];
  const stagedFiles: string[] = [];
  const untrackedFiles: string[] = [];

  for (const line of lines) {
    const status = line.substring(0, 2);
    const file = line.substring(3);

    if (status[0] !== " " && status[0] !== "?") {
      stagedFiles.push(file);
    }
    if (status[1] !== " " && status[1] !== "?") {
      modifiedFiles.push(file);
    }
    if (status.startsWith("??")) {
      untrackedFiles.push(file);
    }
  }

  // Check for version embedding artifacts
  const versionFiles = [
    "src/cli/brooklyn.ts",
    "src/core/config.ts",
    "src/shared/build-config.ts",
    "src/generated/build-signature.ts",
  ];

  const dirtyVersionFiles = modifiedFiles.filter((file) => versionFiles.some((vf) => file === vf));

  const stagedVersionFiles = stagedFiles.filter((file) => versionFiles.some((vf) => file === vf));

  // Generate issues and suggestions
  if (dirtyVersionFiles.length > 0) {
    issues.push(`🔧 Version embedding artifacts not committed: ${dirtyVersionFiles.join(", ")}`);
    fixSuggestions.push('Run: git add -A && git commit -m "chore: embed version for release"');
  }

  if (stagedVersionFiles.length > 0 && modifiedFiles.length === 0 && untrackedFiles.length === 0) {
    issues.push(`📦 Version files staged but not committed: ${stagedVersionFiles.join(", ")}`);
    fixSuggestions.push('Run: git commit -m "chore: embed version for release"');
  }

  if (modifiedFiles.filter((f) => !versionFiles.includes(f)).length > 0) {
    const nonVersionFiles = modifiedFiles.filter((f) => !versionFiles.includes(f));
    issues.push(`📝 Modified files not committed: ${nonVersionFiles.join(", ")}`);
    fixSuggestions.push('Run: git add <files> && git commit -m "<appropriate-message>"');
  }

  if (stagedFiles.filter((f) => !versionFiles.includes(f)).length > 0) {
    const nonVersionStagedFiles = stagedFiles.filter((f) => !versionFiles.includes(f));
    issues.push(`📋 Staged files not committed: ${nonVersionStagedFiles.join(", ")}`);
    fixSuggestions.push('Run: git commit -m "<appropriate-message>"');
  }

  if (untrackedFiles.length > 0) {
    // Filter out common build/temp files that are OK to leave untracked
    const importantUntracked = untrackedFiles.filter(
      (file) =>
        !file.match(/^(dist\/|coverage\/|\.cache\/|\.vitest\/|node_modules\/|.*\.log|.*\.tmp)/),
    );

    if (importantUntracked.length > 0) {
      issues.push(`❓ Untracked files (may need attention): ${importantUntracked.join(", ")}`);
      fixSuggestions.push("Review untracked files: git add <files> or add to .gitignore");
    }
  }

  return {
    isClean: issues.length === 0,
    issues,
    fixSuggestions,
  };
}

function checkBranch(): { isMainBranch: boolean; branch: string } {
  const branch = safeExec("git branch --show-current");
  return {
    isMainBranch: branch === "main",
    branch,
  };
}

function validateCleanWorkingTree(
  options: { strict?: boolean; allowVersionArtifacts?: boolean } = {},
): boolean {
  const { strict = false, allowVersionArtifacts = false } = options;

  console.log("🔍 Validating working tree cleanliness...");

  const branchInfo = checkBranch();
  const validation = getGitStatus();

  // Show branch info
  console.log(`📍 Current branch: ${branchInfo.branch}${branchInfo.isMainBranch ? " (main)" : ""}`);

  if (validation.isClean) {
    console.log("✅ Working tree is clean - ready for push!");
    return true;
  }

  // Filter version artifacts if allowed
  if (
    allowVersionArtifacts &&
    validation.issues.length === 1 &&
    validation.issues[0]?.includes("Version embedding artifacts")
  ) {
    console.log("⚠️  Version embedding artifacts detected but allowed in this context");
    console.log("🔧 Consider running the version commit helper: bun run version:commit");
    return true;
  }

  console.log("");
  console.log("❌ Working tree is not clean!");
  console.log("");

  for (const issue of validation.issues) {
    console.log(`   ${issue}`);
  }

  console.log("");
  console.log("🔧 Fix suggestions:");
  for (const suggestion of validation.fixSuggestions) {
    console.log(`   ${suggestion}`);
  }

  console.log("");
  console.log("📋 Release Checklist Requirement:");
  console.log("   All changes must be committed before push operations");
  console.log("");

  if (strict) {
    console.log("🚨 Strict mode: This validation cannot be bypassed");
    console.log("   Fix all issues above before proceeding");
  } else {
    console.log("💡 To bypass this check (not recommended):");
    console.log("   export BROOKLYN_ALLOW_DIRTY_PUSH=1");
  }

  return false;
}

// Handle command line usage
if (import.meta.main) {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const allowVersionArtifacts = args.includes("--allow-version-artifacts");
  const help = args.includes("--help") || args.includes("-h");

  if (help) {
    console.log("Clean Working Tree Validator");
    console.log("");
    console.log("Usage: bun scripts/validate-clean-working-tree.ts [options]");
    console.log("");
    console.log("Options:");
    console.log("  --strict                  Strict mode - cannot be bypassed");
    console.log("  --allow-version-artifacts Allow version embedding artifacts");
    console.log("  --help, -h               Show this help");
    console.log("");
    console.log("Environment Variables:");
    console.log("  BROOKLYN_ALLOW_DIRTY_PUSH=1  Bypass validation (not recommended)");
    console.log("");
    console.log("Examples:");
    console.log("  bun scripts/validate-clean-working-tree.ts");
    console.log("  bun scripts/validate-clean-working-tree.ts --strict");
    console.log("  bun scripts/validate-clean-working-tree.ts --allow-version-artifacts");
    process.exit(0);
  }

  // Check for bypass
  if (!strict && process.env["BROOKLYN_ALLOW_DIRTY_PUSH"] === "1") {
    console.log("⚠️  BROOKLYN_ALLOW_DIRTY_PUSH=1 detected - bypassing validation");
    console.log("🚨 This should only be used for emergency fixes!");
    process.exit(0);
  }

  const isClean = validateCleanWorkingTree({ strict, allowVersionArtifacts });
  process.exit(isClean ? 0 : 1);
}

export { validateCleanWorkingTree };
