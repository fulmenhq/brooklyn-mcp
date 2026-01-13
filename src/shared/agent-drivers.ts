/**
 * Agent Interface Drivers - Data-driven definitions for IDE/client MCP configurations
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type AgentClientKey =
  | "cursor"
  | "claude"
  | "codex"
  | "kilocode"
  | "cline"
  | "opencode"
  | "project";
export type AgentTransport = "stdio" | "http";
export type AgentScope = "user" | "project";

export interface Location {
  scope: AgentScope;
  /** Resolve absolute path for this scope */
  resolvePath: (homeDir: string, projectRoot: string) => string;
  /** Whether brooklyn should write this location (some clients prefer CLI commands) */
  writable: boolean;
}

export interface StdIoTemplateOptions {
  teamId?: string;
  logLevel?: string;
}

export interface HttpTemplateOptions {
  host?: string; // e.g., 127.0.0.1
  port?: number; // e.g., 3000
  teamId?: string;
}

export interface AgentDriver {
  key: AgentClientKey;
  displayName: string;
  supportedTransports: AgentTransport[];
  locations: Location[];
  /** JSON templates for configuration files (where writable) */
  templates: {
    stdio?: (opts: StdIoTemplateOptions) => unknown;
    http?: (opts: HttpTemplateOptions) => unknown;
  };
  /**
   * For clients configured via commands rather than files (e.g., Claude user scope)
   * return an array of shell commands to run.
   */
  commands?: {
    stdio?: (opts: StdIoTemplateOptions) => string[];
    http?: (opts: HttpTemplateOptions) => string[];
  };
}

/** Helper to resolve current homedir and project root, for direct consumption */
export function resolvePathFor(location: Location, projectRoot: string): string {
  return location.resolvePath(homedir(), projectRoot);
}

function withTeamQuery(url: string, teamId?: string): string {
  if (!teamId) {
    return url;
  }
  const encoded = encodeURIComponent(teamId);
  return url.includes("?") ? `${url}&team=${encoded}` : `${url}?team=${encoded}`;
}

/** Resolve VS Code/VSCodium/Cursor/Windsurf user globalStorage base for a specific product. */
export function getEditorGlobalStorageBase(product: string, homeDir?: string): string {
  const home = homeDir || homedir();
  const p = product;
  if (process.platform === "darwin") {
    return join(home, "Library", "Application Support", p, "User", "globalStorage");
  }
  if (process.platform === "win32") {
    const appData: string = process.env["APPDATA"] || join(home, "AppData", "Roaming");
    return join(appData, p, "User", "globalStorage");
  }
  return join(home, ".config", p, "User", "globalStorage");
}

function resolveVSCodeUserGlobalStorageBase(homeDir: string): string {
  const products = ["Code", "VSCodium", "Cursor", "Windsurf"];
  const candidates: string[] = [];
  if (process.platform === "darwin") {
    for (const p of products) {
      candidates.push(join(homeDir, "Library", "Application Support", p, "User", "globalStorage"));
    }
  } else if (process.platform === "win32") {
    const appData: string = process.env["APPDATA"] || join(homeDir, "AppData", "Roaming");
    for (const p of products) {
      candidates.push(join(appData, p, "User", "globalStorage"));
    }
  } else {
    for (const p of products) {
      candidates.push(join(homeDir, ".config", p, "User", "globalStorage"));
    }
  }
  const found = candidates.find((c) => existsSync(c));
  if (found) return found;
  if (candidates.length > 0) {
    const first = candidates[0];
    if (first) return first;
  }
  // Fallback to OS-specific default
  if (process.platform === "darwin") {
    return join(homeDir, "Library", "Application Support", "Code", "User", "globalStorage");
  }
  if (process.platform === "win32") {
    const appData: string = process.env["APPDATA"] || join(homeDir, "AppData", "Roaming");
    return join(appData, "Code", "User", "globalStorage");
  }
  return join(homeDir, ".config", "Code", "User", "globalStorage");
}

function buildStdioEntry(opts: StdIoTemplateOptions, includeType = true) {
  const args: string[] = ["mcp", "start"];
  if (opts.teamId) {
    args.push("--team-id", opts.teamId);
  }
  return includeType
    ? { type: "stdio" as const, command: "brooklyn", args, env: {} }
    : { command: "brooklyn", args, env: {} };
}

const projectMcpTemplate = (opts: StdIoTemplateOptions) => ({
  mcpServers: {
    brooklyn: buildStdioEntry(opts, true),
  },
});

export const agentDrivers: Record<AgentClientKey, AgentDriver> = {
  cursor: {
    key: "cursor",
    displayName: "Cursor",
    supportedTransports: ["stdio"],
    locations: [
      {
        scope: "project",
        resolvePath: (_home, projectRoot) => join(projectRoot, ".cursor", "mcp.json"),
        writable: true,
      },
      {
        scope: "user",
        resolvePath: (home) => join(home, ".config", "cursor", "mcp.json"),
        writable: true,
      },
    ],
    templates: {
      stdio: (opts) => ({
        mcpServers: {
          brooklyn: {
            ...buildStdioEntry(opts, false),
            env: {
              BROOKLYN_LOG_LEVEL: "info",
              BROOKLYN_HEADLESS: "true",
            },
          },
        },
      }),
    },
  },
  claude: {
    key: "claude",
    displayName: "Claude Code",
    supportedTransports: ["stdio", "http"],
    locations: [
      {
        scope: "project",
        resolvePath: (_home, projectRoot) => join(projectRoot, ".claude_mcp.json"),
        writable: true,
      },
      {
        scope: "user",
        // User configuration is maintained by Claude CLI; avoid writing directly
        resolvePath: (home) => join(home, ".config", "claude", "claude_desktop_config.json"),
        writable: false,
      },
    ],
    templates: {
      stdio: (opts) => projectMcpTemplate(opts),
      http: (opts) => ({
        mcpServers: {
          brooklyn: {
            type: "http",
            url: withTeamQuery(
              `http://${opts.host || "127.0.0.1"}:${opts.port || 3000}`,
              opts.teamId,
            ),
          },
        },
      }),
    },
    commands: {
      stdio: (opts) => [
        // Use -- separator per Claude CLI
        `claude mcp add -s user -t stdio brooklyn -- brooklyn mcp start${
          opts.teamId ? ` --team-id ${opts.teamId}` : ""
        }`,
      ],
      http: (opts) => [
        `claude mcp add -s user -t http brooklyn ${withTeamQuery(
          `http://${opts.host || "127.0.0.1"}:${opts.port || 3000}`,
          opts.teamId,
        )}`,
      ],
    },
  },
  codex: {
    key: "codex",
    displayName: "Codex CLI",
    supportedTransports: ["stdio", "http"],
    locations: [
      {
        scope: "user",
        // Codex CLI uses TOML at ~/.codex/config.toml
        resolvePath: (home) => join(home, ".codex", "config.toml"),
        writable: true,
      },
    ],
    templates: {
      // For Codex, prefer commands guidance due to TOML format merging
      stdio: (_opts) => ({
        note: "Add the following to ~/.codex/config.toml under [mcp_servers.brooklyn]",
        toml: {
          section: "[mcp_servers.brooklyn]",
          command: "brooklyn",
          args: ["mcp", "start"],
        },
      }),
      http: (opts) => ({
        note: "Add the following to ~/.codex/config.toml under [mcp_servers.brooklyn]",
        toml: {
          section: "[mcp_servers.brooklyn]",
          type: "http",
          url: withTeamQuery(
            `http://${opts.host || "127.0.0.1"}:${opts.port || 3000}`,
            opts.teamId,
          ),
        },
      }),
    },
    commands: {
      stdio: (_opts) => [
        "# ~/.codex/config.toml",
        "[mcp_servers.brooklyn]",
        'command = "brooklyn"',
        'args = ["mcp", "start"]',
      ],
      http: (opts) => [
        "# ~/.codex/config.toml",
        "[mcp_servers.brooklyn]",
        `type = "http"`,
        `url = "${withTeamQuery(`http://${opts.host || "127.0.0.1"}:${opts.port || 3000}`, opts.teamId)}"`,
      ],
    },
  },
  kilocode: {
    key: "kilocode",
    displayName: "Kilocode",
    supportedTransports: ["stdio", "http"],
    locations: [
      {
        scope: "project",
        resolvePath: (_home, projectRoot) => join(projectRoot, ".kilocode", "mcp.json"),
        writable: true,
      },
      {
        scope: "user",
        resolvePath: (home) =>
          join(
            resolveVSCodeUserGlobalStorageBase(home),
            "kilocode.kilo-code",
            "settings",
            "mcp_settings.json",
          ),
        writable: true,
      },
    ],
    templates: {
      stdio: (opts) => ({
        mcpServers: {
          brooklyn: {
            type: "stdio" as const,
            command: "brooklyn",
            args: ["mcp", "start", ...(opts.teamId ? ["--team-id", opts.teamId] : [])],
            env: {},
          },
        },
      }),
      http: (opts) => ({
        mcpServers: {
          brooklyn: {
            type: "http" as const,
            url: withTeamQuery(
              `http://${opts.host || "127.0.0.1"}:${opts.port || 3000}`,
              opts.teamId,
            ),
          },
        },
      }),
    },
  },
  cline: {
    key: "cline",
    displayName: "Cline",
    supportedTransports: ["stdio", "http"],
    locations: [
      {
        scope: "user",
        resolvePath: (home) =>
          join(
            resolveVSCodeUserGlobalStorageBase(home),
            "saoudrizwan.claude-dev",
            "settings",
            "cline_mcp_settings.json",
          ),
        writable: true,
      },
    ],
    templates: {
      stdio: (opts) => ({
        mcpServers: {
          brooklyn: {
            type: "stdio" as const,
            command: "brooklyn",
            args: ["mcp", "start", ...(opts.teamId ? ["--team-id", opts.teamId] : [])],
            env: {},
          },
        },
      }),
      http: (opts) => ({
        mcpServers: {
          brooklyn: {
            type: "http" as const,
            url: withTeamQuery(
              `http://${opts.host || "127.0.0.1"}:${opts.port || 3000}`,
              opts.teamId,
            ),
          },
        },
      }),
    },
  },
  project: {
    key: "project",
    displayName: "Project .mcp.json",
    supportedTransports: ["stdio", "http"],
    locations: [
      {
        scope: "project",
        resolvePath: (_home, projectRoot) => join(projectRoot, ".mcp.json"),
        writable: true,
      },
    ],
    templates: {
      stdio: (opts) => projectMcpTemplate(opts),
      http: (opts) => ({
        mcpServers: {
          brooklyn: {
            type: "http",
            url: withTeamQuery(
              `http://${opts.host || "127.0.0.1"}:${opts.port || 3000}`,
              opts.teamId,
            ),
          },
        },
      }),
    },
  },
  // opencode client (global + project JSON)
  // Managed via client configure/remove using opencode's JSON schema
  opencode: {
    key: "opencode",
    displayName: "OpenCode",
    supportedTransports: ["stdio", "http"],
    locations: [
      {
        scope: "user",
        resolvePath: (home: string) => join(home, ".config", "opencode", "opencode.json"),
        writable: true,
      },
      {
        scope: "project",
        resolvePath: (_home: string, projectRoot: string) => join(projectRoot, "opencode.json"),
        writable: true,
      },
    ],
    templates: {
      stdio: (_opts: StdIoTemplateOptions) => ({
        $schema: "https://opencode.ai/config.json",
        mcp: {
          brooklyn: {
            type: "local",
            command: ["brooklyn", "mcp", "start"],
            enabled: true,
          },
        },
      }),
      http: (opts: HttpTemplateOptions) => ({
        $schema: "https://opencode.ai/config.json",
        mcp: {
          brooklyn: {
            type: "remote",
            url: withTeamQuery(
              `http://${opts.host || "127.0.0.1"}:${opts.port || 3000}`,
              opts.teamId,
            ),
            enabled: true,
          },
        },
      }),
    },
  },
};
