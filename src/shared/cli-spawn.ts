/**
 * Spawn the current Brooklyn CLI as a child.
 *
 * Bun/Node script: `execPath` is the runtime and `argv[1]` is the entry file.
 * Compiled standalone binary: `execPath` is the CLI; `argv[1]` is a user
 * argument (or the binary path). Prefixing it produces
 * `brooklyn /path/to/brooklyn web start --port …` → `unknown option '--port'`.
 */

import { type ChildProcess, type SpawnOptions, spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { dirname, sep } from "node:path";

export interface CliSpawnInvocation {
  command: string;
  args: string[];
}

export function looksLikeCliEntryFile(entry: string | undefined, execPath: string): boolean {
  if (!entry || entry === execPath) return false;
  return (
    entry.endsWith(".ts") ||
    entry.endsWith(".js") ||
    entry.endsWith(".mjs") ||
    entry.endsWith(".cjs") ||
    entry.includes(`${sep}node_modules${sep}`)
  );
}

export function resolveCliSpawn(
  subcommandArgs: string[],
  argv: readonly string[] = process.argv,
  execPath: string = process.execPath,
): CliSpawnInvocation {
  const entry = argv[1];
  if (looksLikeCliEntryFile(entry, execPath) && entry) {
    return { command: execPath, args: [entry, ...subcommandArgs] };
  }
  return { command: execPath, args: subcommandArgs };
}

export interface DetachedCliSpawnOptions extends SpawnOptions {
  logPath?: string;
}

export function spawnDetachedCli(
  subcommandArgs: string[],
  options: DetachedCliSpawnOptions = {},
): ChildProcess {
  const { logPath, env, cwd, ...rest } = options;
  const { command, args } = resolveCliSpawn(subcommandArgs);

  let stdio: SpawnOptions["stdio"] = rest.stdio ?? ["ignore", "ignore", "ignore"];
  let logFd: number | undefined;
  if (logPath) {
    mkdirSync(dirname(logPath), { recursive: true });
    logFd = openSync(logPath, "a");
    stdio = ["ignore", logFd, logFd];
  }

  const child = spawn(command, args, {
    ...rest,
    cwd,
    env: env ?? process.env,
    detached: true,
    stdio,
  });

  if (logFd !== undefined) {
    closeSync(logFd);
  }

  return child;
}

export function probeLocalHealth(
  port: number,
  host = "127.0.0.1",
  timeoutMs = 2000,
): Promise<boolean> {
  return new Promise((resolve) => {
    const req = httpRequest(
      {
        hostname: host,
        port,
        path: "/health",
        method: "GET",
        timeout: timeoutMs,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

export async function waitForLocalHealth(
  port: number,
  timeoutMs = 5000,
  intervalMs = 200,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeLocalHealth(port, "127.0.0.1", Math.min(intervalMs, 1000))) {
      return true;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}
