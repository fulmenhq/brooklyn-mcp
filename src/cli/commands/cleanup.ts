import type { Command } from "commander";

// Register "brooklyn cleanup" operational command
export function registerCleanupCommand(program: Command) {
  program
    .command("cleanup")
    .description("Cleanup running Brooklyn processes and resources")
    .option("--all", "Cleanup all Brooklyn processes and resources")
    .option("--http", "Cleanup HTTP mode servers")
    .option("--mcp", "Cleanup MCP mode servers")
    .option("--force", "Force kill lingering processes if graceful stop fails")
    .action(async (opts: { all?: boolean; http?: boolean; mcp?: boolean; force?: boolean }) => {
      const { BrooklynProcessManager } = await import("../../shared/process-manager.js");
      const pm = BrooklynProcessManager;

      const doHttp = Boolean(opts.all || opts.http);
      const doMcp = Boolean(opts.all || opts.mcp);

      if (doHttp) {
        await cleanupHttp(pm);
      }
      if (doMcp) {
        await cleanupMcp(pm);
      }
      if (opts.force) {
        await forceKillAll(pm);
      }
      await bestEffortScriptCleanup();

      // eslint-disable-next-line no-console
      console.log("Cleanup completed");
    });
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
 * Stop MCP-like processes best-effort
 */
async function cleanupMcp(pm: PM): Promise<void> {
  const processes = await pm.findAllProcesses();
  const mcpLike = processes.filter(
    (p: { type: string }) =>
      p.type === "mcp-stdio" || p.type === "dev-mode" || p.type === "repl-session",
  );
  for (const proc of mcpLike) {
    const stopped = await pm.stopProcess(proc.pid);
    // eslint-disable-next-line no-console
    console.log(`Stopped ${proc.type} pid=${proc.pid} stopped=${stopped}`);
  }
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
