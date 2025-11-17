#!/usr/bin/env bun

/**
 * Single Source of Truth (SSOT) Check-All Script
 *
 * This script replaces the package.json check-all command to provide:
 * - Individual step timeouts with fail-fast behavior
 * - Detailed logging and progress tracking
 * - Proper exit codes for CI/CD environments
 * - Windows compatibility for all operations
 * - Performance monitoring for each step
 */

import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";

interface CheckStep {
  name: string;
  command: string;
  args: string[];
  timeoutMs: number;
  description: string;
  required: boolean;
}

// Define all quality check steps with individual timeouts
const CHECK_STEPS: CheckStep[] = [
  {
    name: "format",
    command: "bun",
    args: ["run", "format"],
    timeoutMs: 60000, // 1 minute
    description: "Format code and documentation",
    required: true,
  },
  {
    name: "typecheck",
    command: "bun",
    args: ["run", "typecheck"],
    timeoutMs: 120000, // 2 minutes
    description: "TypeScript compilation check",
    required: true,
  },
  {
    name: "version:embed",
    command: "bun",
    args: ["run", "version:embed"],
    timeoutMs: 30000, // 30 seconds
    description: "Embed version information",
    required: true,
  },
  {
    name: "lint",
    command: "bun",
    args: ["run", "lint"],
    timeoutMs: 90000, // 1.5 minutes
    description: "Code linting validation",
    required: true,
  },
  {
    name: "check:mcp-schema",
    command: "bun",
    args: ["run", "check:mcp-schema"],
    timeoutMs: 30000, // 30 seconds
    description: "MCP protocol compliance check",
    required: true,
  },
  {
    name: "build:local",
    command: "bun",
    args: ["run", "build:local"],
    timeoutMs: 120000, // 2 minutes
    description: "Build binary for test dependencies",
    required: true,
  },
  {
    name: "test:unit",
    command: "bun",
    args: ["run", "test:precommit"],
    timeoutMs: 300000, // 5 minutes (Windows process tests can be slow)
    description: "Unit test execution with Windows-compatible timeouts (240s per test on Windows)",
    required: true,
  },
  {
    name: "test:integration",
    command: "bun",
    args: ["run", "test:integration"],
    timeoutMs: 480000, // 8 minutes (integration tests with browsers)
    description: "Integration test execution",
    required: true,
  },
  {
    name: "test:e2e",
    command: "bun",
    args: ["run", "test:e2e"],
    timeoutMs: 600000, // 10 minutes (E2E tests are comprehensive)
    description: "End-to-end test execution",
    required: true,
  },
];

interface StepResult {
  name: string;
  success: boolean;
  duration: number;
  output?: string;
  error?: string;
  timedOut: boolean;
}

class QualityGateRunner {
  private results: StepResult[] = [];
  private startTime: number;

  constructor() {
    this.startTime = performance.now();
  }

  private async runCommand(step: CheckStep): Promise<StepResult> {
    console.log(`🔍 Running ${step.name}: ${step.description}`);
    console.log(`⏱️  Timeout: ${step.timeoutMs / 1000}s`);

    const startTime = performance.now();

    return new Promise<StepResult>((resolve) => {
      const child = spawn(step.command, step.args, {
        stdio: ["inherit", "pipe", "pipe"],
        shell: process.platform === "win32",
        env: {
          ...process.env,
          // Ensure headless browsers on Windows
          BROOKLYN_HEADLESS: "true",
          PLAYWRIGHT_HEADLESS: "true",
          // Performance optimization
          NODE_OPTIONS: "--max-old-space-size=4096",
        },
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      // Capture output
      child.stdout?.on("data", (data) => {
        const chunk = data.toString();
        stdout += chunk;
        // Stream important output immediately
        if (
          chunk.includes("FAIL") ||
          chunk.includes("ERROR") ||
          chunk.includes("✅") ||
          chunk.includes("❌")
        ) {
          process.stdout.write(chunk);
        }
      });

      child.stderr?.on("data", (data) => {
        const chunk = data.toString();
        stderr += chunk;
        // Stream errors immediately
        process.stderr.write(chunk);
      });

      // Set timeout
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");

        // Force kill after 5 seconds if SIGTERM doesn't work (Windows compatibility)
        setTimeout(() => {
          if (!child.killed) {
            child.kill("SIGKILL");
          }
        }, 5000);
      }, step.timeoutMs);

      child.on("close", (code) => {
        clearTimeout(timeout);
        const duration = performance.now() - startTime;

        const result: StepResult = {
          name: step.name,
          success: code === 0 && !timedOut,
          duration,
          output: stdout,
          error: stderr,
          timedOut,
        };

        if (timedOut) {
          console.error(`❌ ${step.name} timed out after ${step.timeoutMs / 1000}s`);
        } else if (code === 0) {
          console.log(`✅ ${step.name} completed in ${(duration / 1000).toFixed(1)}s`);
        } else {
          console.error(
            `❌ ${step.name} failed with exit code ${code} in ${(duration / 1000).toFixed(1)}s`,
          );
        }

        resolve(result);
      });

      child.on("error", (error) => {
        clearTimeout(timeout);
        const duration = performance.now() - startTime;

        resolve({
          name: step.name,
          success: false,
          duration,
          error: error.message,
          timedOut: false,
        });
      });
    });
  }

  async runAllChecks(): Promise<void> {
    console.log("🚀 Starting comprehensive quality gate checks...");
    console.log(`📋 ${CHECK_STEPS.length} steps to execute\n`);

    for (const [index, step] of CHECK_STEPS.entries()) {
      console.log(
        `\n[${index + 1}/${CHECK_STEPS.length}] ==========================================`,
      );

      const result = await this.runCommand(step);
      this.results.push(result);

      // Fail fast on required steps
      if (!result.success && step.required) {
        console.error(`\n💥 CRITICAL FAILURE: ${step.name} failed and is required`);
        await this.printSummary();
        process.exit(1);
      }

      // Log step completion
      if (result.success) {
        console.log(`✅ Step ${index + 1}/${CHECK_STEPS.length} completed successfully\n`);
      } else {
        console.error(`❌ Step ${index + 1}/${CHECK_STEPS.length} failed but continuing\n`);
      }
    }

    await this.printSummary();

    // Exit with error if any required steps failed
    const hasFailures = this.results.some(
      (r) => !r.success && CHECK_STEPS.find((s) => s.name === r.name)?.required,
    );

    if (hasFailures) {
      console.error("\n💥 Quality gates failed - exiting with error code 1");
      process.exit(1);
    }

    console.log("\n🎉 All quality gates passed successfully!");
    process.exit(0);
  }

  private async printSummary(): Promise<void> {
    const totalDuration = performance.now() - this.startTime;
    const successful = this.results.filter((r) => r.success).length;
    const failed = this.results.filter((r) => !r.success).length;
    const timedOut = this.results.filter((r) => r.timedOut).length;

    console.log(`\n${"=".repeat(60)}`);
    console.log("📊 QUALITY GATE SUMMARY");
    console.log("=".repeat(60));
    console.log(`⏱️  Total Duration: ${(totalDuration / 1000).toFixed(1)}s`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏰ Timed Out: ${timedOut}`);
    console.log();

    // Detailed step results
    console.log("📋 Step Details:");
    console.log("-".repeat(60));

    for (const result of this.results) {
      const status = result.success ? "✅" : result.timedOut ? "⏰" : "❌";
      const duration = (result.duration / 1000).toFixed(1);
      console.log(`${status} ${result.name.padEnd(20)} ${duration}s`);

      if (result.error && !result.success) {
        console.log(`   Error: ${result.error.split("\n")[0]}`);
      }
    }

    console.log("-".repeat(60));

    // Performance warnings
    const slowSteps = this.results.filter((r) => r.duration > 120000); // > 2 minutes
    if (slowSteps.length > 0) {
      console.log("\n⚠️  Performance Warnings (>2min):");
      for (const step of slowSteps) {
        console.log(`   ${step.name}: ${(step.duration / 1000).toFixed(1)}s`);
      }
    }

    // Failure analysis
    if (failed > 0) {
      console.log("\n🔍 Failure Analysis:");
      for (const result of this.results.filter((r) => !r.success)) {
        console.log(`   ${result.name}: ${result.timedOut ? "TIMEOUT" : "FAILED"}`);
        if (result.error) {
          console.log(`     ${result.error.split("\n").slice(0, 3).join("\n     ")}`);
        }
      }
    }
  }
}

// Handle process signals gracefully
process.on("SIGINT", () => {
  console.error("\n🛑 Interrupted by user - exiting");
  process.exit(130);
});

process.on("SIGTERM", () => {
  console.error("\n🛑 Terminated - exiting");
  process.exit(143);
});

// Main execution
async function main() {
  try {
    const runner = new QualityGateRunner();
    await runner.runAllChecks();
  } catch (error) {
    console.error("\n💥 Fatal error during quality gate execution:");
    console.error(error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
