import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Command } from "commander";

// Register "brooklyn cleanup" operational command
export function registerCleanupCommand(program: Command) {
  const cleanup = new (require("commander").Command)("cleanup")
    .description("Cleanup running Brooklyn processes and resources")
    .option("--all", "Cleanup all Brooklyn processes and resources")
    .option("--http", "Cleanup HTTP mode servers")
    .option("--port <port>", "Target HTTP port to kill listeners on (IPv4/IPv6)")
    .option("--mcp", "Cleanup MCP mode servers (managed + unmanaged in current project)")
    .option("--mcp-all", "Cleanup MCP stdio servers across all projects/scopes")
    .option("--browsers", "Cleanup stray headless dev-time browser processes (safe heuristics)")
    .option("--force", "Force kill lingering processes if graceful stop fails")
    .action(
      async (opts: {
        all?: boolean;
        http?: boolean;
        port?: string;
        mcp?: boolean;
        mcpAll?: boolean;
        browsers?: boolean;
        force?: boolean;
      }) => {
        const { BrooklynProcessManager } = await import("../../shared/process-manager.js");
        const pm = BrooklynProcessManager;

        const doHttp = Boolean(opts.all || opts.http || opts.port);
        const doMcp = Boolean(opts.all || opts.mcp);
        const doBrowsers = Boolean(opts.all || opts.browsers);

        if (doHttp) {
          // If a specific port is provided, kill listeners on that port (IPv4/IPv6)
          if (opts.port) {
            const portNum = Number.parseInt(opts.port, 10);
            if (Number.isFinite(portNum)) {
              await cleanupHttpPort(portNum, Boolean(opts.force));
            } else {
              // eslint-disable-next-line no-console
              console.log(`Invalid port: ${opts.port}`);
            }
          }
          // Also run process-manager based HTTP cleanup (covers dev-http, managed servers)
          await cleanupHttp(pm);
        }
        if (doMcp) {
          await cleanupMcpAll(pm, { allProjects: Boolean(opts.all || opts.mcpAll) });
        }
        if (doBrowsers) {
          await cleanupBrowsersSafe();
        }
        if (opts.force) {
          await forceKillAll(pm);
        }
        await bestEffortScriptCleanup();

        console.log("Cleanup completed");

        // Explicitly exit to return control to console
        process.exit(0);
      },
    );

  // Attach explicitly so Commander registers the subcommand instance correctly
  program.addCommand(cleanup);
}

/**
 * Stop all HTTP servers discovered by the process manager
 */
type PM = typeof import("../../shared/process-manager.js")["BrooklynProcessManager"];

async function cleanupHttp(pm: PM): Promise<void> {
  const summary = await pm.getProcessSummary();
  for (const s of summary.httpServers) {
    const stopped = await pm.stopProcess(s.pid);
    // eslint-disable-next-line no-console
    console.log(
      `HTTP server port=${s.port} pid=${s.pid}${s.teamId ? ` team=${s.teamId}` : ""} stopped=${stopped}`,
    );
  }
}

/**
 * Kill all listeners (IPv4 and IPv6) bound to a specific HTTP port (best-effort).
 * Uses lsof to find PIDs, sends SIGTERM then optional SIGKILL (--force).
 */
async function cleanupHttpPort(port: number, force: boolean): Promise<void> {
  try {
    const pids = await listListenerPids(port);
    if (pids.length === 0) {
      // eslint-disable-next-line no-console
      console.log(`No listeners found on port ${port}`);
      return;
    }

    // eslint-disable-next-line no-console
    console.log(`Found ${pids.length} listener(s) on port ${port}: ${pids.join(", ")}`);

    for (const pid of pids) {
      await terminateListenerPid(pid, force, port);
    }

    // eslint-disable-next-line no-console
    console.log(`HTTP port ${port} cleanup completed`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Failed to cleanup HTTP port ${port}:`, error);
  }
}

/**
 * List unique listener PIDs on the given TCP port (IPv4/IPv6).
 */
async function listListenerPids(port: number): Promise<number[]> {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);
  const { stdout } = await execAsync(
    `lsof -iTCP:${port} -sTCP:LISTEN -n -P | awk 'NR>1 {print $2}' | sort -u`,
  );
  return stdout
    .trim()
    .split("\n")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

/**
 * Terminate a single PID with SIGTERM and optional SIGKILL.
 */
async function terminateListenerPid(pid: number, force: boolean, port: number): Promise<void> {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // ignore TERM failures
  }

  // wait briefly for graceful stop
  await new Promise((r) => setTimeout(r, 1000));

  let stillRunning = true;
  try {
    process.kill(pid, 0);
  } catch {
    stillRunning = false;
  }

  if (stillRunning && force) {
    // eslint-disable-next-line no-console
    console.log(`Forcing kill for PID ${pid} on port ${port}...`);
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // ignore KILL failures
    }
  }
}
/**
 * Stop MCP-like processes best-effort
 */
async function cleanupMcpAll(pm: PM, opts: { allProjects: boolean }): Promise<void> {
  // 1) Stop managed stdio by pid files (current project unless allProjects)
  const managedStopped = await cleanupManagedStdio(opts);
  for (const res of managedStopped) {
    // eslint-disable-next-line no-console
    console.log(
      `Stopped managed mcp-stdio scope=${res.scope} project=${res.projectKey} pid=${res.pid} stopped=${res.stopped}`,
    );
  }

  // 2) Stop unmanaged stdio by process scan (BROOKLYN_MCP_STDIO env marker or cmd pattern)
  const processes = await pm.findAllProcesses();
  const cwd = process.cwd();
  const projectKey = sha1(cwd);

  // Narrow to mcp-stdio processes
  const candidates = processes.filter((p) => p.type === "mcp-stdio");

  // Helper to decide if a process belongs to current project when metadata exists
  const belongsToCurrentProject = (p: {
    cwd?: string;
    projectKey?: string;
  }): boolean => {
    const pcwd = p.cwd;
    if (pcwd && pcwd === cwd) return true;
    const pkey = p.projectKey;
    if (pkey && pkey === projectKey) return true;
    return false;
  };

  // If not cleaning all projects, further narrow by cwd or projectKey when available
  const filtered = opts.allProjects
    ? candidates
    : candidates.filter((p) => {
        const meta = p as unknown as { cwd?: string; projectKey?: string };
        // If metadata missing, still attempt to stop (defensive cleanup)
        // Simplified per biome suggestion to reduce logical complexity
        if (!(meta.cwd || meta.projectKey)) return true;
        return belongsToCurrentProject(meta);
      });

  for (const proc of filtered) {
    const stopped = await pm.stopProcess(proc.pid);
    // eslint-disable-next-line no-console
    console.log(
      `Stopped unmanaged mcp-stdio pid=${proc.pid}${
        proc.teamId ? ` team=${proc.teamId}` : ""
      } stopped=${stopped}`,
    );
  }
}

function sha1(s: string): string {
  return createHash("sha1").update(s).digest("hex");
}

type ManagedStopResult = { scope: string; projectKey: string; pid: number; stopped: boolean };

/**
 * Cleanup managed stdio entries from pid registry
 * Registry layout: ~/.brooklyn/mcp/stdio/{scope}/{projectKey}.pid
 */
/**
 * Cleanup managed stdio entries from pid registry
 * Registry layout: ~/.brooklyn/mcp/stdio/{scope}/{projectKey}.pid
 *
 * NOTE: keep structure flat and extract small helpers to reduce cognitive complexity.
 */
async function cleanupManagedStdio(opts: { allProjects: boolean }): Promise<ManagedStopResult[]> {
  const base = join(homedir(), ".brooklyn", "mcp", "stdio");
  const scopes = ["local", "user"];
  const currentKey = sha1(process.cwd());
  const results: ManagedStopResult[] = [];

  const listPidFiles = (dir: string): string[] => {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((f) => f.endsWith(".pid"));
  };

  const readPidFromFile = (pidPath: string): number | undefined => {
    try {
      const txt = readFileSync(pidPath, "utf8");
      const meta = JSON.parse(txt) as { pid?: number };
      const n = Number(meta?.pid);
      return Number.isFinite(n) ? n : undefined;
    } catch {
      return undefined;
    }
  };

  const stopPidBestEffort = (pid?: number): boolean => {
    if (!Number.isFinite(pid as number)) return false;
    try {
      process.kill(pid as number, "SIGTERM");
      return true;
    } catch {
      try {
        process.kill(pid as number, "SIGKILL");
        return true;
      } catch {
        return false;
      }
    }
  };

  const removePidArtifacts = (pidPath: string): void => {
    try {
      unlinkSync(pidPath);
    } catch {
      // ignore
    }
    // meta is embedded in the pid file content; nothing else to remove
  };

  for (const scope of scopes) {
    const scopeDir = join(base, scope);
    const files = listPidFiles(scopeDir);
    for (const f of files) {
      const projectKey = f.replace(/\.pid$/, "");
      if (!opts.allProjects && projectKey !== currentKey) continue;

      const pidPath = join(scopeDir, f);
      const pid = readPidFromFile(pidPath);
      const stopped = stopPidBestEffort(pid);
      results.push({ scope, projectKey, pid: (pid as number) || -1, stopped });
      removePidArtifacts(pidPath);
    }
  }

  return results;
}

/**
 * Force kill any lingering processes when requested
 */
async function forceKillAll(pm: PM): Promise<void> {
  const procs = await pm.findAllProcesses();
  for (const p of procs as Array<{ pid: number }>) {
    try {
      process.kill(p.pid, "SIGKILL");
      // eslint-disable-next-line no-console
      console.log(`Force killed pid=${p.pid}`);
    } catch {
      // ignore
    }
  }
}

/**
 * Best-effort cleanup via scripts/server-management.js if present
 */
async function bestEffortScriptCleanup(): Promise<void> {
  try {
    const mod = await import("../../../scripts/server-management.js");
    const maybeDefault = (mod as unknown as { default?: { cleanup?: () => Promise<void> } })
      .default;
    const maybeNamed = mod as unknown as { cleanup?: () => Promise<void> };
    if (maybeDefault?.cleanup) {
      await maybeDefault.cleanup();
    } else if (maybeNamed.cleanup) {
      await maybeNamed.cleanup();
    }
  } catch {
    // ignore best-effort
  }
}

/**
 * Best-effort cleanup for stray dev-time headless Chromium processes spawned by local tools
 * Heuristics:
 *  - Process command contains '--headless'
 *  - AND one of:
 *      * path includes 'puppeteer/.chromium-browser-snapshots'
 *      * or user-data-dir in a tmp-like path: 'puppeteer_dev_chrome_profile-'
 */
async function cleanupBrowsersSafe(): Promise<void> {
  try {
    const psOutput = await getPsOutput();
    const candidates = detectDevBrowserPids(psOutput);
    await killPids(candidates);
  } catch {
    // eslint-disable-next-line no-console
    console.log("Browser cleanup skipped (ps/kill not available)");
  }
}

/**
 * Execute ps aux and return output
 */
async function getPsOutput(): Promise<string> {
  const { execSync } = await import("node:child_process");
  return execSync("ps aux", { encoding: "utf8" });
}

/**
 * Parse ps aux output and return candidate PIDs matching safe heuristics
 */
function detectDevBrowserPids(psOutput: string): Array<{ pid: number; cmd: string }> {
  const lines = psOutput.split("\n");
  const candidates: Array<{ pid: number; cmd: string }> = [];

  const snapshotPattern = /saoudrizwan\.claude-dev\/puppeteer\/\.chromium-browser-snapshots/;
  const anySnapshotPattern = /puppeteer\/\.chromium-browser-snapshots/;
  const headlessFlag = /--headless/;
  const puppeteerProfile = /puppeteer_dev_chrome_profile-/;
  const chromiumRenderer = /Chromium Helper \(Renderer\)/;
  const chromiumBin = /Chromium\.app\/Contents\/MacOS\/Chromium/;

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 11) continue;

    const pidStr = parts[1];
    if (!pidStr) continue;
    const pid = Number.parseInt(pidStr, 10);
    if (Number.isNaN(pid)) continue;

    const cmdJoined = parts.slice(10).join(" ");
    const cmd = typeof cmdJoined === "string" ? cmdJoined : "";
    if (cmd.length === 0) continue;

    const inSnapshotPath =
      snapshotPattern.test(cmd) || anySnapshotPattern.test(cmd) || puppeteerProfile.test(cmd);

    // (A) Headless Chromium main process with dev-time profile/snapshot path
    const isHeadlessDev = headlessFlag.test(cmd) && inSnapshotPath;

    // (B) Renderer/utility children spawned under puppeteer snapshot path (may not include --headless)
    const isRendererChild = chromiumRenderer.test(cmd) && inSnapshotPath;

    // (C) Chromium bin under snapshot path even without explicit --headless (fallback)
    const isChromiumUnderSnapshot = chromiumBin.test(cmd) && inSnapshotPath;

    if (isHeadlessDev || isRendererChild || isChromiumUnderSnapshot) {
      candidates.push({ pid, cmd });
    }
  }

  return candidates;
}

/**
 * Kill PIDs (deduped) with TERM then KILL fallback
 */
async function killPids(candidates: Array<{ pid: number; cmd: string }>): Promise<void> {
  if (candidates.length === 0) {
    // eslint-disable-next-line no-console
    console.log("No stray headless dev-time browser processes detected");
    return;
  }

  const seen = new Set<number>();
  for (const c of candidates) {
    if (seen.has(c.pid)) continue;
    seen.add(c.pid);

    try {
      process.kill(c.pid, "SIGTERM" as NodeJS.Signals);
      // eslint-disable-next-line no-console
      console.log(`Terminated headless dev browser pid=${c.pid}`);
    } catch {
      try {
        process.kill(c.pid, "SIGKILL" as NodeJS.Signals);
        // eslint-disable-next-line no-console
        console.log(`Force killed headless dev browser pid=${c.pid}`);
      } catch {
        // eslint-disable-next-line no-console
        console.log(`Failed to kill headless dev browser pid=${c.pid}`);
      }
    }
  }
}
