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
        const doAll = Boolean(opts.all);

        // Phase 1: Comprehensive port cleanup (all known Brooklyn ports)
        if (doAll || doHttp) {
          await cleanupAllBrooklynPorts(Boolean(opts.force));
        }

        // Phase 2: Specific port cleanup if requested
        if (opts.port) {
          const portNum = Number.parseInt(opts.port, 10);
          if (Number.isFinite(portNum)) {
            await cleanupHttpPort(portNum, Boolean(opts.force));
          } else {
            // eslint-disable-next-line no-console
            console.log(`Invalid port: ${opts.port}`);
          }
        }

        // Phase 3: Process-manager based cleanup
        if (doHttp) {
          await cleanupHttp(pm);
        }
        if (doMcp) {
          await cleanupMcpAll(pm, { allProjects: Boolean(opts.all || opts.mcpAll) });
        }

        // Phase 4: Development mode cleanup
        if (doAll) {
          await cleanupDevMode();
          await cleanupReplSessions();
          await cleanupWatchModeProcesses();
        }

        // Phase 5: Browser cleanup
        if (doBrowsers || doAll) {
          await cleanupBrowsersSafe();
        }

        // Phase 6: PID file cleanup
        if (doAll) {
          await cleanupAllPidFiles();
        }

        // Phase 7: Force cleanup if requested
        if (opts.force) {
          await forceKillAll(pm);
        }

        // Phase 8: Script-based cleanup
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

  // Puppeteer patterns
  const snapshotPattern = /saoudrizwan\.claude-dev\/puppeteer\/\.chromium-browser-snapshots/;
  const anySnapshotPattern = /puppeteer\/\.chromium-browser-snapshots/;
  const puppeteerProfile = /puppeteer_dev_chrome_profile-/;

  // Playwright patterns (Brooklyn uses Playwright!)
  const playwrightPattern = /ms-playwright/;
  const playwrightProfile = /playwright_chromiumdev_profile-/;
  const headlessShellPattern = /headless_shell/; // Playwright's headless chromium

  // Common patterns
  const headlessFlag = /--headless/;
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

    // Check for Puppeteer dev-time browsers
    const inPuppeteerPath =
      snapshotPattern.test(cmd) || anySnapshotPattern.test(cmd) || puppeteerProfile.test(cmd);

    // Check for Playwright dev-time browsers
    const inPlaywrightPath =
      playwrightPattern.test(cmd) || playwrightProfile.test(cmd) || headlessShellPattern.test(cmd);

    // (A) Headless Chromium main process with dev-time profile/snapshot path
    const isHeadlessDev = headlessFlag.test(cmd) && (inPuppeteerPath || inPlaywrightPath);

    // (B) Renderer/utility children spawned under puppeteer/playwright snapshot path (may not include --headless)
    const isRendererChild = chromiumRenderer.test(cmd) && (inPuppeteerPath || inPlaywrightPath);

    // (C) Chromium bin under snapshot path even without explicit --headless (fallback)
    const isChromiumUnderSnapshot = chromiumBin.test(cmd) && (inPuppeteerPath || inPlaywrightPath);

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

/**
 * Comprehensive cleanup of all known Brooklyn ports
 * Handles common development and testing ports
 */
async function cleanupAllBrooklynPorts(force: boolean): Promise<void> {
  const commonPorts = [
    3000, // Default dev server
    8080, // HTTP mode default
    8081, // Alternative HTTP port
    3001, // Alternative dev port
    3002, // Test server port
    5173, // Vite dev server
    4173, // Vite preview
  ];

  // eslint-disable-next-line no-console
  console.log(`Cleaning up Brooklyn services on common ports: ${commonPorts.join(", ")}`);

  for (const port of commonPorts) {
    await cleanupHttpPort(port, force);
  }

  // Also scan for any other Brooklyn HTTP processes
  await cleanupBrooklynProcessesByPattern("brooklyn.*dev-http", force);
  await cleanupBrooklynProcessesByPattern("bun.*run.*dev", force);
}

/**
 * Cleanup Brooklyn processes matching a specific pattern
 */
async function cleanupBrooklynProcessesByPattern(pattern: string, force: boolean): Promise<void> {
  try {
    const { exec } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execAsync = promisify(exec);

    const { stdout } = await execAsync(`ps aux | grep "${pattern}" | grep -v grep`);
    const lines = stdout
      .trim()
      .split("\n")
      .filter((line) => line.trim());

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) continue;

      const pidStr = parts[1];
      if (!pidStr) continue;

      const pid = Number.parseInt(pidStr, 10);
      if (!Number.isFinite(pid)) continue;

      await terminateProcessGracefully(pid, force);
    }
  } catch {
    // No processes found or error occurred - continue silently
  }
}

/**
 * Cleanup development mode processes
 */
async function cleanupDevMode(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("Cleaning up development mode processes...");

  await cleanupBrooklynProcessesByPattern("brooklyn.*dev-start", false);
  await cleanupBrooklynProcessesByPattern("brooklyn.*dev-mode", false);
  await cleanupBrooklynProcessesByPattern("bun.*scripts/dev-brooklyn", false);
}

/**
 * Cleanup REPL sessions
 */
async function cleanupReplSessions(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("Cleaning up REPL sessions...");

  await cleanupBrooklynProcessesByPattern("brooklyn.*repl", false);
  await cleanupBrooklynProcessesByPattern("brooklyn.*dev-repl", false);
}

/**
 * Cleanup watch mode processes (bun run dev, etc.)
 */
async function cleanupWatchModeProcesses(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("Cleaning up watch mode processes...");

  await cleanupBrooklynProcessesByPattern("bun.*--watch", false);
  await cleanupBrooklynProcessesByPattern("bun.*run.*dev", false);
}

/**
 * Comprehensive PID file cleanup
 */
async function cleanupAllPidFiles(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("Cleaning up all Brooklyn PID files...");

  // Project-level PID files
  await cleanupProjectPidFiles();

  // User-level PID files
  await cleanupUserPidFiles();

  // Server management PID files
  await cleanupServerManagementPidFiles();
}

/**
 * Cleanup project-level PID files
 */
async function cleanupProjectPidFiles(): Promise<void> {
  try {
    const { readdirSync, unlinkSync } = await import("node:fs");
    const { join } = await import("node:path");

    const cwd = process.cwd();
    const files = readdirSync(cwd);

    const pidFiles = files.filter((file) => file.startsWith(".brooklyn-") && file.endsWith(".pid"));

    for (const pidFile of pidFiles) {
      try {
        const pidPath = join(cwd, pidFile);
        unlinkSync(pidPath);
        // eslint-disable-next-line no-console
        console.log(`Removed PID file: ${pidFile}`);
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch {
    // Directory read error - continue
  }
}

/**
 * Cleanup user-level PID files
 */
async function cleanupUserPidFiles(): Promise<void> {
  try {
    const { homedir } = await import("node:os");
    const { join } = await import("node:path");
    const { existsSync } = await import("node:fs");

    const brooklynDir = join(homedir(), ".brooklyn");
    if (!existsSync(brooklynDir)) return;

    // Recursively find and remove .pid files
    await cleanupPidFilesRecursive(brooklynDir);
  } catch {
    // Error accessing user directory - continue
  }
}

/**
 * Recursively cleanup PID files in a directory
 */
async function cleanupPidFilesRecursive(dir: string): Promise<void> {
  try {
    const { readdirSync, statSync, unlinkSync } = await import("node:fs");
    const { join } = await import("node:path");

    const items = readdirSync(dir);

    for (const item of items) {
      const itemPath = join(dir, item);
      const stat = statSync(itemPath);

      if (stat.isDirectory()) {
        await cleanupPidFilesRecursive(itemPath);
      } else if (item.endsWith(".pid")) {
        try {
          unlinkSync(itemPath);
          // eslint-disable-next-line no-console
          console.log(`Removed PID file: ${itemPath}`);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  } catch {
    // Error reading directory - continue
  }
}

/**
 * Cleanup server management PID files
 */
async function cleanupServerManagementPidFiles(): Promise<void> {
  try {
    const { homedir } = await import("node:os");
    const { join } = await import("node:path");
    const { existsSync, unlinkSync } = await import("node:fs");

    const serverPidFile = join(homedir(), ".local", "share", "fulmen-brooklyn", "server.pid");

    if (existsSync(serverPidFile)) {
      unlinkSync(serverPidFile);
      // eslint-disable-next-line no-console
      console.log("Removed server management PID file");
    }
  } catch {
    // Error cleaning up server PID file - continue
  }
}

/**
 * Terminate a process gracefully with optional force
 */
async function terminateProcessGracefully(pid: number, force: boolean): Promise<void> {
  try {
    // Send SIGTERM first
    process.kill(pid, "SIGTERM");
    // eslint-disable-next-line no-console
    console.log(`Terminated process pid=${pid}`);

    // Wait for graceful shutdown
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Check if process is still running
    let stillRunning = true;
    try {
      process.kill(pid, 0);
    } catch {
      stillRunning = false;
    }

    // Force kill if requested and still running
    if (stillRunning && force) {
      try {
        process.kill(pid, "SIGKILL");
        // eslint-disable-next-line no-console
        console.log(`Force killed process pid=${pid}`);
      } catch {
        // Ignore kill errors
      }
    }
  } catch {
    // Process might already be dead - that's OK
  }
}
