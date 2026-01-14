import { homedir } from "node:os";
import { join } from "node:path";

function withTeamQuery(url: string, teamId?: string): string {
  if (!teamId) {
    return url;
  }
  const encoded = encodeURIComponent(teamId);
  return url.includes("?") ? `${url}&team=${encoded}` : `${url}?team=${encoded}`;
}

import {
  type AgentClientKey,
  agentDrivers,
  getEditorGlobalStorageBase,
  resolvePathFor,
} from "../../shared/agent-drivers.js";
import {
  ensureDirFor,
  patchJsonBrooklyn,
  patchOpencodeBrooklyn,
  patchTomlBrooklyn,
} from "../../shared/config-patcher.js";

export interface AgentConfigOptions {
  client?: string;
  transport?: "stdio" | "http";
  scope?: "project" | "user";
  host?: string;
  port?: string | number;
  teamId?: string;
  apply?: boolean;
  print?: boolean;
  product?: string; // Optional editor product to target for user-wide configs
}

function resolveAndValidateOptions(options: AgentConfigOptions) {
  const client = String(options.client ?? "project") as AgentClientKey;
  const argv = process.argv || [];
  const userProvidedTransport = argv.some(
    (a) => a === "--transport" || a.startsWith("--transport="),
  );
  const rawTransport = (
    userProvidedTransport || options.transport ? options.transport : undefined
  ) as "stdio" | "http" | undefined;
  const rawScope = options.scope as "project" | "user" | undefined;
  // Defaults before auto-inference
  const transport: "stdio" | "http" = rawTransport ?? "stdio";
  const scope: "project" | "user" = rawScope ?? "project";
  const host = String(options.host ?? "127.0.0.1");
  const port = Number.parseInt(String(options.port ?? 3000), 10) || 3000;
  const teamId = options.teamId ? String(options.teamId) : undefined;
  return { client, transport, scope, host, port, teamId, rawTransport, rawScope };
}

function requireDriver(client: AgentClientKey) {
  const driver = agentDrivers[client];
  if (!driver) {
    console.error(`Unknown client '${client}'. Supported: ${Object.keys(agentDrivers).join(", ")}`);
    process.exit(1);
  }
  return driver;
}

function requireLocation(driver: ReturnType<typeof requireDriver>, scope: "project" | "user") {
  const location = driver.locations.find((l) => l.scope === scope);
  if (!location) {
    console.error(
      `${driver.displayName} does not support scope '${scope}'. Supported: ${driver.locations
        .map((l) => l.scope)
        .join(", ")}`,
    );
    process.exit(1);
  }
  return location;
}

function buildContent(
  driver: ReturnType<typeof requireDriver>,
  transport: "stdio" | "http",
  host: string,
  port: number,
  teamId?: string,
) {
  const templateFn = transport === "stdio" ? driver.templates.stdio : driver.templates.http;
  return templateFn?.(transport === "stdio" ? { teamId } : { host, port, teamId });
}

function printPlan(
  driverName: string,
  scope: string,
  targetPath: string,
  contentObj: unknown,
  cmds?: string[],
) {
  if (contentObj) {
    console.log(`\n# ${driverName} (${scope}) -> ${targetPath}`);
    console.log(JSON.stringify(contentObj, null, 2));
  }
  if (cmds && cmds.length > 0) {
    console.log("\n# Commands:");
    for (const cmd of cmds) console.log(cmd);
  }
}

// (legacy applyPlan removed; safe patchers used instead)

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Orchestrates IO, validated by unit flows
export async function runConfigAgent(options: AgentConfigOptions): Promise<void> {
  const resolved = resolveAndValidateOptions(options);
  let { client, transport, scope, host, port, teamId } = resolved;
  const driver = requireDriver(client);
  const projectRoot = process.cwd();

  // Auto-infer best defaults for multi-instance environments when user didn't force transport/scope
  // Goal: prefer HTTP at user scope where supported; fallback to project+stdio for clients without HTTP
  if (!resolved.rawTransport) {
    const supportsHttp = driver.supportedTransports.includes("http");
    const requestedScope: "project" | "user" = resolved.rawScope ?? scope;
    if (requestedScope === "user") {
      if (supportsHttp) {
        transport = "http";
        scope = "user";
      } else {
        // Fallback: project-specific stdio to avoid multi-instance stdio contention
        scope = "project";
        transport = "stdio";
      }
    }
  }

  // Explicit preference for Claude Code user scope: default to HTTP when not forced
  if (!resolved.rawTransport && client === "claude" && scope === "user") {
    transport = "http";
  }

  // Now resolve location with the possibly adjusted scope
  const location = requireLocation(driver, scope);
  let targetPath = resolvePathFor(location, projectRoot);

  if (scope === "user" && options.product) {
    const product = String(options.product);
    const base = getEditorGlobalStorageBase(product, homedir());
    if (client === "cline") {
      targetPath = join(base, "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json");
    } else if (client === "kilocode") {
      targetPath = join(base, "kilocode.kilo-code", "settings", "mcp_settings.json");
    } else if (client === "opencode") {
      targetPath = join(homedir(), ".config", "opencode", "opencode.json");
    } else if (client === "codex") {
      targetPath = join(homedir(), ".codex", "config.toml");
    }
  }
  const contentObj = buildContent(driver, transport, host, port, teamId);
  // Decide command set for non-writable targets and for printing guidance
  let cmdsForRun: string[] | undefined =
    transport === "stdio"
      ? driver.commands?.stdio?.({ teamId })
      : driver.commands?.http?.({ host, port, teamId });
  // Prefer HTTP for Claude Code user scope when not forced
  if (!resolved.rawTransport && client === "claude" && scope === "user") {
    cmdsForRun = driver.commands?.http?.({ host, port, teamId });
  }

  const printFlag = Boolean(options.print) || !options.apply;
  if (printFlag) {
    // If configuring HTTP at user scope, include a friendly reminder to start the server
    const cmdsOut = Array.isArray(cmdsForRun) ? [...cmdsForRun] : undefined;
    if (transport === "http" && scope === "user") {
      const webStart = `brooklyn web start --host ${host} --port ${port} --daemon`;
      if (cmdsOut) cmdsOut.push(`# Start backend: ${webStart}`);
    }
    printPlan(driver.displayName, scope, targetPath, contentObj, cmdsOut);
  }

  if (options.apply) {
    // If target isn't a writable file location (e.g., Claude Code user scope),
    // execute the driver's CLI commands when available.
    if (!location.writable) {
      if (cmdsForRun && cmdsForRun.length > 0) {
        const { execSync } = await import("node:child_process");
        try {
          for (const cmd of cmdsForRun) {
            execSync(cmd, { stdio: "inherit" });
          }
          console.log("\n✅ Applied via client CLI:", driver.displayName, `(${scope})`);
          if (transport === "http") {
            console.log(
              `\nℹ️  Reminder: start the Brooklyn web server: brooklyn web start --host ${host} --port ${port} --daemon`,
            );
          }
          return;
        } catch (err) {
          console.error(
            "❌ Failed to apply via client CLI. You can run the printed commands manually.",
          );
          console.error(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
      }
      console.error(
        `${driver.displayName} ${scope} configuration is not writable by Brooklyn; please run the printed commands instead.`,
      );
      process.exit(1);
    }

    ensureDirFor(targetPath);
    if (client === "codex") {
      // Codex uses TOML at ~/.codex/config.toml
      const value =
        transport === "http"
          ? { type: "http", url: withTeamQuery(`http://${host}:${port}`, teamId) }
          : { command: "brooklyn", args: ["mcp", "start"] };
      const result = patchTomlBrooklyn(targetPath, value, { backup: true, dryRun: false });
      console.log("\n✅ Updated:", targetPath);
      if (result.backup) console.log("Backup:", result.backup);
    } else if (client === "opencode") {
      const value =
        transport === "http"
          ? {
              type: "remote" as const,
              url: withTeamQuery(`http://${host}:${port}`, teamId),
            }
          : { type: "local" as const, command: ["brooklyn", "mcp", "start"] };
      const result = patchOpencodeBrooklyn(targetPath, value, { backup: true, dryRun: false });
      console.log("\n✅ Updated:", targetPath);
      if (result.backup) console.log("Backup:", result.backup);
    } else {
      // JSON-based clients (client-specific schema)
      let value: unknown;
      if (client === "cline") {
        // Force stdio for Cline (HTTP requires SSE which is not yet supported)
        value = { command: "brooklyn", args: ["mcp", "start"], env: {}, disabled: false };
      } else if (client === "kilocode") {
        value =
          transport === "http"
            ? {
                type: "http",
                url: withTeamQuery(`http://${host}:${port}`, teamId),

                enabled: true,
              }
            : {
                type: "stdio",
                command: "brooklyn",
                args: ["mcp", "start"],
                env: {},
                enabled: true,
              };
      } else if (client === "cursor") {
        value = { command: "brooklyn", args: ["mcp", "start"], env: {} };
      } else {
        value = { command: "brooklyn", args: ["mcp", "start"], env: {} };
      }
      const result = patchJsonBrooklyn(targetPath, value, { backup: true, dryRun: false });
      console.log("\n✅ Updated:", targetPath);
      if (result.backup) console.log("Backup:", result.backup);
    }
  }
}
