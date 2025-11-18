#!/usr/bin/env bun

/**
 * Flow Wrapper STDIO - Capture and log STDIO communication for debugging
 *
 * Usage:
 *   bun scripts/flow-wrapper-stdio.ts "claude mcp list" --pipe-log-base debug-session
 *   bun scripts/flow-wrapper-stdio.ts "brooklyn mcp start" --pipe-log-base brooklyn-test
 *
 * Creates files:
 *   - {base}-stdin.log   - Data sent TO the command
 *   - {base}-stdout.log  - Data received FROM the command
 *   - {base}-stderr.log  - Error output from the command
 *   - {base}-combined.log - All communication with timestamps and direction
 */

import { type ChildProcess, spawn } from "node:child_process";
import { createWriteStream, type WriteStream } from "node:fs";
import { parseArgs } from "node:util";

interface LogStreams {
  stdin: WriteStream;
  stdout: WriteStream;
  stderr: WriteStream;
  combined: WriteStream;
}

class FlowWrapperSTDIO {
  private command: string;
  private logBase: string;
  private childProcess?: ChildProcess;
  private logStreams?: LogStreams;
  private startTime: number;

  constructor(command: string, logBase: string) {
    this.command = command;
    this.logBase = logBase;
    this.startTime = Date.now();
  }

  /**
   * Initialize log files
   */
  private initializeLogStreams(): LogStreams {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const baseWithTimestamp = `${this.logBase}-${timestamp}`;

    return {
      stdin: createWriteStream(`${baseWithTimestamp}-stdin.log`, { flags: "a" }),
      stdout: createWriteStream(`${baseWithTimestamp}-stdout.log`, { flags: "a" }),
      stderr: createWriteStream(`${baseWithTimestamp}-stderr.log`, { flags: "a" }),
      combined: createWriteStream(`${baseWithTimestamp}-combined.log`, { flags: "a" }),
    };
  }

  /**
   * Log data with timestamp and direction
   */
  private logData(
    data: Buffer,
    direction: "STDIN" | "STDOUT" | "STDERR",
    targetStream?: WriteStream,
  ): void {
    const timestamp = new Date().toISOString();
    const elapsed = Date.now() - this.startTime;
    const dataStr = data.toString();

    // Log to specific stream if available
    targetStream?.write(data);

    // Log to combined stream with metadata
    this.logStreams?.combined.write(`[${timestamp}] [+${elapsed}ms] ${direction}: ${dataStr}`);

    // Also log to console for real-time monitoring
    const prefix = direction === "STDERR" ? "🔴" : direction === "STDIN" ? "📥" : "📤";
    console.log(`${prefix} [+${elapsed}ms] ${direction}: ${dataStr.trim()}`);
  }

  /**
   * Set up bidirectional STDIO forwarding with logging
   */
  private setupSTDIOForwarding(): void {
    if (!(this.childProcess && this.logStreams)) return;

    // Forward stdin from parent to child (Claude -> Brooklyn)
    process.stdin.on("data", (data: Buffer) => {
      this.logData(data, "STDIN", this.logStreams?.stdin);
      this.childProcess?.stdin?.write(data);
    });

    // Forward stdout from child to parent (Brooklyn -> Claude)
    this.childProcess.stdout?.on("data", (data: Buffer) => {
      this.logData(data, "STDOUT", this.logStreams?.stdout);
      process.stdout.write(data);
    });

    // Forward stderr from child to parent (Brooklyn errors)
    this.childProcess.stderr?.on("data", (data: Buffer) => {
      this.logData(data, "STDERR", this.logStreams?.stderr);
      process.stderr.write(data);
    });

    // Handle stdin end
    process.stdin.on("end", () => {
      this.childProcess?.stdin?.end();
    });
  }

  /**
   * Set up signal forwarding (Ctrl-C, etc.)
   */
  private setupSignalForwarding(): void {
    const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGQUIT"];

    for (const signal of signals) {
      process.on(signal, () => {
        console.log(`\n🛑 Received ${signal}, forwarding to child process...`);

        if (this.childProcess && !this.childProcess.killed) {
          this.childProcess.kill(signal);
        }

        // Give child process time to clean up, then exit
        setTimeout(() => {
          this.cleanup();
          process.exit(0);
        }, 1000);
      });
    }
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    console.log("\n🧹 Cleaning up log streams...");

    if (this.logStreams) {
      for (const stream of Object.values(this.logStreams)) {
        stream.end();
      }
    }

    if (this.childProcess && !this.childProcess.killed) {
      this.childProcess.kill("SIGTERM");
    }
  }

  /**
   * Parse command string into command and args
   */
  private parseCommand(commandStr: string): { command: string; args: string[] } {
    // Simple parsing - split on spaces but respect quotes
    const parts = commandStr.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    const command = parts[0] || "";
    const args = parts.slice(1).map((arg) => arg.replace(/^"(.*)"$/, "$1"));

    return { command, args };
  }

  /**
   * Run the wrapped command
   */
  async run(): Promise<number> {
    console.log("🚀 Starting Flow Wrapper STDIO");
    console.log(`📋 Command: ${this.command}`);
    console.log(`📁 Log base: ${this.logBase}`);
    console.log(`⏰ Start time: ${new Date().toISOString()}\n`);

    // Initialize logging
    this.logStreams = this.initializeLogStreams();

    // Parse command
    const { command, args } = this.parseCommand(this.command);

    // Spawn child process
    this.childProcess = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });

    // Set up forwarding and signal handling
    this.setupSTDIOForwarding();
    this.setupSignalForwarding();

    // Handle child process events
    this.childProcess.on("error", (error) => {
      console.error(`❌ Failed to start command: ${error.message}`);
      this.cleanup();
      return 1;
    });

    // Wait for child process to complete
    return new Promise((resolve) => {
      this.childProcess?.on("close", (code, signal) => {
        const elapsed = Date.now() - this.startTime;

        if (signal) {
          console.log(`\n🛑 Process terminated by signal: ${signal} (after ${elapsed}ms)`);
        } else {
          console.log(`\n✅ Process completed with code: ${code} (after ${elapsed}ms)`);
        }

        this.cleanup();
        resolve(code || 0);
      });
    });
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  try {
    const { values, positionals } = parseArgs({
      args: process.argv.slice(2),
      options: {
        "pipe-log-base": {
          type: "string",
          short: "b",
        },
        help: {
          type: "boolean",
          short: "h",
        },
      },
      allowPositionals: true,
    });

    if (values.help) {
      console.log(`
Flow Wrapper STDIO - Capture and log STDIO communication

Usage:
  bun scripts/flow-wrapper-stdio.ts "<command>" --pipe-log-base <base-name>

Examples:
  bun scripts/flow-wrapper-stdio.ts "claude mcp list" --pipe-log-base debug-claude
  bun scripts/flow-wrapper-stdio.ts "brooklyn mcp start" --pipe-log-base test-brooklyn

Options:
  -b, --pipe-log-base <name>  Base name for log files (required)
  -h, --help                  Show this help message

Output files:
  <base>-<timestamp>-stdin.log    - Data sent TO the command
  <base>-<timestamp>-stdout.log   - Data received FROM the command
  <base>-<timestamp>-stderr.log   - Error output from the command
  <base>-<timestamp>-combined.log - All communication with timestamps
      `);
      process.exit(0);
    }

    const command = positionals[0];
    const logBase = values["pipe-log-base"] as string;

    if (!command) {
      console.error("❌ Error: Command is required");
      console.error(
        'Usage: bun scripts/flow-wrapper-stdio.ts "<command>" --pipe-log-base <base-name>',
      );
      process.exit(1);
    }

    if (!logBase) {
      console.error("❌ Error: --pipe-log-base is required");
      console.error(
        'Usage: bun scripts/flow-wrapper-stdio.ts "<command>" --pipe-log-base <base-name>',
      );
      process.exit(1);
    }

    const wrapper = new FlowWrapperSTDIO(command, logBase);
    const exitCode = await wrapper.run();
    process.exit(exitCode);
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
