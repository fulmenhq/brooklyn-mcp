import { type ChildProcess, spawn } from "node:child_process";
import { createWriteStream, type WriteStream } from "node:fs";
import { parseArgs } from "node:util";

interface LogStreams {
  stdin: WriteStream;
  stdout: WriteStream;
  stderr: WriteStream;
  combined: WriteStream;
}

export async function handleDebugCommand(args: string[]): Promise<void> {
  const [type, ...rest] = args;
  switch (type) {
    case "stdio":
      await handleStdioDebug(rest);
      break;
    default:
      process.stderr.write("Unknown debug type. Available: stdio\n");
      process.exit(1);
  }
}

async function handleStdioDebug(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      "log-base": { type: "string", short: "b", default: "debug" },
    },
    allowPositionals: true,
  });

  const command = positionals.join(" ");
  const logBase = values["log-base"] as string;

  if (!command) {
    process.stderr.write("Command required for stdio debug\n");
    process.exit(1);
  }

  const wrapper = new StdioDebugger(command, logBase);
  await wrapper.run();
}

class StdioDebugger {
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

  private logData(
    data: Buffer,
    direction: "STDIN" | "STDOUT" | "STDERR",
    targetStream?: WriteStream,
  ): void {
    const timestamp = new Date().toISOString();
    const elapsed = Date.now() - this.startTime;
    const dataStr = data.toString();

    targetStream?.write(data);

    this.logStreams?.combined.write(`[${timestamp}] [+${elapsed}ms] ${direction}: ${dataStr}`);

    const prefix = direction === "STDERR" ? "🔴" : direction === "STDIN" ? "📥" : "📤";
    process.stdout.write(`${prefix} [+${elapsed}ms] ${direction}: ${dataStr.trim()}\n`);
  }

  private setupSTDIOForwarding(): void {
    if (!(this.childProcess && this.logStreams)) return;

    process.stdin.on("data", (data: Buffer) => {
      this.logData(data, "STDIN", this.logStreams?.stdin);
      this.childProcess?.stdin?.write(data);
    });

    this.childProcess.stdout?.on("data", (data: Buffer) => {
      this.logData(data, "STDOUT", this.logStreams?.stdout);
      process.stdout.write(data);
    });

    this.childProcess.stderr?.on("data", (data: Buffer) => {
      this.logData(data, "STDERR", this.logStreams?.stderr);
      process.stderr.write(data);
    });

    process.stdin.on("end", () => {
      this.childProcess?.stdin?.end();
    });
  }

  private setupSignalForwarding(): void {
    const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGQUIT"];

    for (const signal of signals) {
      process.on(signal, () => {
        process.stdout.write(`\n🛑 Received ${signal}, forwarding to child process...\n`);

        if (this.childProcess && !this.childProcess.killed) {
          this.childProcess.kill(signal);
        }

        setTimeout(() => {
          this.cleanup();
          process.exit(0);
        }, 1000);
      });
    }
  }

  private cleanup(): void {
    process.stdout.write("\n🧹 Cleaning up log streams...\n");

    if (this.logStreams) {
      for (const stream of Object.values(this.logStreams)) {
        stream.end();
      }
    }

    if (this.childProcess && !this.childProcess.killed) {
      this.childProcess.kill("SIGTERM");
    }
  }

  private parseCommand(commandStr: string): { command: string; args: string[] } {
    const parts = commandStr.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    const command = parts[0] || "";
    const args = parts.slice(1).map((arg) => arg.replace(/^"(.*)"$/, "$1"));

    return { command, args };
  }

  async run(): Promise<void> {
    process.stdout.write("🚀 Starting STDIO Debugger\n");
    process.stdout.write(`📋 Command: ${this.command}\n`);
    process.stdout.write(`📁 Log base: ${this.logBase}\n`);
    process.stdout.write(`⏰ Start time: ${new Date().toISOString()}\n\n`);

    this.logStreams = this.initializeLogStreams();

    const { command, args } = this.parseCommand(this.command);

    this.childProcess = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
    });

    this.setupSTDIOForwarding();
    this.setupSignalForwarding();

    this.childProcess.on("error", (error) => {
      process.stderr.write(`❌ Failed to start command: ${error.message}\n`);
      this.cleanup();
      process.exit(1);
    });

    return new Promise((resolve) => {
      this.childProcess?.on("close", (code, signal) => {
        const elapsed = Date.now() - this.startTime;

        if (signal) {
          process.stdout.write(
            `\n🛑 Process terminated by signal: ${signal} (after ${elapsed}ms)\n`,
          );
        } else {
          process.stdout.write(`\n✅ Process completed with code: ${code} (after ${elapsed}ms)\n`);
        }

        this.cleanup();
        resolve();
      });
    });
  }
}
