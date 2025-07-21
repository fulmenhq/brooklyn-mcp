#!/usr/bin/env bun

/**
 * Unified file check script for Brooklyn MCP server
 *
 * Runs type checking, linting, and formatting for a single file in sequence.
 * Uses temporary TypeScript configuration to validate files in isolation
 * while preserving project-wide settings and path aliases.
 *
 * Adapted from fulmen ecosystem patterns for Brooklyn's specific needs:
 * - Bun runtime optimized
 * - MCP protocol file handling
 * - Browser automation TypeScript patterns
 * - JSX support for React components
 *
 * Usage:
 *   bun scripts/check-file.ts <file-path> [--fix]
 *
 * Example:
 *   bun scripts/check-file.ts src/core/server.ts --fix
 *   bun scripts/check-file.ts src/components/Dashboard.tsx --fix
 *
 * The temporary config approach ensures:
 * - File-level validation without full project compilation
 * - Proper path alias resolution from main tsconfig.json
 * - JSX handling for React components (.tsx files)
 * - Preservation of project-specific compiler options
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import chalk from "chalk";

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(chalk.red("Error: No file path provided"));
  console.error("Usage: bun scripts/check-file.ts <file-path> [--fix]");
  process.exit(1);
}

const shouldFix = args.includes("--fix");
const fileArg = shouldFix ? args.filter((arg) => arg !== "--fix")[0] : args[0];
if (!fileArg) {
  console.error(chalk.red("Error: No file path provided after --fix"));
  console.error("Usage: bun scripts/check-file.ts <file-path> [--fix]");
  process.exit(1);
}
const filePath = path.resolve(fileArg);

// Verify file exists
if (!existsSync(filePath)) {
  console.error(chalk.red(`Error: File not found: ${filePath}`));
  process.exit(1);
}

// Determine file type and JSX requirements
const isTypeScript = filePath.endsWith(".ts") || filePath.endsWith(".tsx");
const isJavaScript = filePath.endsWith(".js") || filePath.endsWith(".jsx");
const isCodeFile = isTypeScript || isJavaScript;
const isReactComponent = filePath.endsWith(".tsx") || filePath.endsWith(".jsx");

/**
 * Execute a command and return the result
 */
async function runCommand(command: string): Promise<[number, string, string]> {
  console.log(chalk.dim(`Running: ${command}`));

  const parts = command.split(" ");
  const cmd = parts[0];
  const cmdArgs = parts.slice(1);

  if (!cmd) {
    throw new Error("No command provided");
  }

  const childProcess = spawn(cmd, cmdArgs, { shell: true });

  let stdout = "";
  let stderr = "";

  childProcess.stdout?.on("data", (data: Buffer) => {
    stdout += data.toString();
  });

  childProcess.stderr?.on("data", (data: Buffer) => {
    stderr += data.toString();
  });

  const exitCode = await new Promise<number>((resolve) => {
    childProcess.on("close", (code) => {
      resolve(code ?? 1);
    });
  });

  return [exitCode, stdout, stderr];
}

/**
 * Run TypeScript type checking
 */
async function runTypeCheck(): Promise<boolean> {
  if (!(isTypeScript || isJavaScript)) {
    return true;
  }

  console.log(chalk.blue("\n🔍 Checking TypeScript types..."));

  const tempConfigPath = path.resolve(process.cwd(), "tsconfig.temp-check.json");
  const projectRoot = process.cwd();
  const relativeFilePath = path.relative(projectRoot, filePath);
  const normalizedRelativeFilePath = relativeFilePath.split(path.sep).join(path.posix.sep);

  // Create temporary TypeScript configuration for file-level checking
  // Inherits all settings from main tsconfig.json while targeting specific file
  const tempConfigContent = {
    extends: "./tsconfig.json",
    include: [normalizedRelativeFilePath],
    // Don't override compilerOptions - inherit from main config for consistency
  };

  let tsExitCode = 0;
  let tsStdout = "";
  let tsStderr = "";

  try {
    writeFileSync(tempConfigPath, JSON.stringify(tempConfigContent, null, 2));
    
    // Add JSX flag for React components to ensure proper compilation
    const jsxFlag = isReactComponent ? "--jsx react-jsx" : "";
    const command = `bunx tsc -p ${tempConfigPath} ${jsxFlag}`.trim().replace(/\s\s+/g, " ");
    
    [tsExitCode, tsStdout, tsStderr] = await runCommand(command);

    if (tsExitCode !== 0) {
      console.error(chalk.red("❌ Type checking failed:"));
      console.error(tsStdout || tsStderr); // Show actual TypeScript errors
      return false;
    }

    console.log(chalk.green("✅ Type checking passed"));
    return true;
  } catch (error) {
    console.error(chalk.red("❌ Error during type check:"), error);
    return false;
  } finally {
    if (existsSync(tempConfigPath)) {
      unlinkSync(tempConfigPath);
    }
  }
}

/**
 * Run linting
 */
async function runLinting(): Promise<boolean> {
  console.log(chalk.blue("\n🧹 Linting..."));

  // Use explicit package name for better robustness
  const lintCommand = shouldFix
    ? `bunx @biomejs/biome check --write "${filePath}"`
    : `bunx @biomejs/biome check "${filePath}"`;

  const [lintExitCode, lintStdout, lintStderr] = await runCommand(lintCommand);

  if (lintExitCode !== 0) {
    console.error(chalk.red("❌ Linting failed:"));
    console.error(lintStdout || lintStderr);
    return false;
  }

  console.log(chalk.green("✅ Linting passed"));
  return true;
}

/**
 * Run formatting
 */
async function runFormatting(): Promise<boolean> {
  console.log(chalk.blue("\n💅 Formatting..."));

  // Use explicit package name for better robustness
  const formatCommand = shouldFix
    ? `bunx @biomejs/biome format --write "${filePath}"`
    : `bunx @biomejs/biome format "${filePath}"`;

  const [fmtExitCode, fmtStdout, fmtStderr] = await runCommand(formatCommand);

  if (fmtExitCode !== 0) {
    console.error(chalk.red("❌ Formatting failed:"));
    console.error(fmtStdout || fmtStderr);
    return false;
  }

  if (shouldFix) {
    console.log(chalk.green("✅ Formatting applied"));
  } else {
    console.log(chalk.green("✅ Formatting is correct"));
  }
  return true;
}

/**
 * Display final summary
 */
function displaySummary(hasIssues: boolean): void {
  console.log(chalk.bold("\n📋 Summary:"));
  if (hasIssues) {
    console.error(chalk.red("❌ Check failed! Please fix the issues above."));
    if (!shouldFix) {
      console.log(chalk.yellow("💡 Tip: Run with --fix to automatically fix some issues"));
    }
    process.exit(1);
  } else {
    console.log(chalk.green("✅ All checks passed!"));
    if (shouldFix) {
      console.log(chalk.blue("ℹ️  Automatic fixes were applied where possible"));
    }
  }
}

async function main() {
  console.log(chalk.bold(`\n📝 Checking file: ${path.relative(process.cwd(), filePath)}`));

  if (!isCodeFile) {
    console.log(chalk.yellow(`⚠️  File type not supported for validation: ${filePath}`));
    console.log(chalk.blue("ℹ️  Supported types: .ts, .tsx, .js, .jsx"));
    return;
  }

  // Run all checks
  const typeCheckPassed = await runTypeCheck();
  const lintingPassed = await runLinting();
  const formattingPassed = await runFormatting();

  const hasIssues = !(typeCheckPassed && lintingPassed && formattingPassed);
  displaySummary(hasIssues);
}

main().catch((error) => {
  console.error(chalk.red("Error running checks:"), error);
  process.exit(1);
});
