/**
 * Daemon PID files live under the Brooklyn app home, not the operator CWD.
 *
 * Canonical: `$BROOKLYN_HOME/pids/brooklyn-web-<port>.pid`
 * Legacy (still read): `<cwd>/.brooklyn-web-<port>.pid`
 */

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type DaemonPidKind = "web" | "http";

export interface DaemonPidFile {
  path: string;
  name: string;
  kind: DaemonPidKind;
  port: number;
  location: "home" | "cwd";
}

export function getBrooklynHome(): string {
  const override = process.env["BROOKLYN_HOME"];
  if (override && override.trim().length > 0) return override.trim();
  return join(homedir(), ".brooklyn");
}

export function getPidDir(): string {
  return join(getBrooklynHome(), "pids");
}

export function ensurePidDir(): string {
  const dir = getPidDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

export function canonicalDaemonPidPath(kind: DaemonPidKind, port: number | string): string {
  return join(getPidDir(), `brooklyn-${kind}-${port}.pid`);
}

export function legacyCwdDaemonPidPath(
  kind: DaemonPidKind,
  port: number | string,
  cwd = process.cwd(),
): string {
  return join(cwd, `.brooklyn-${kind}-${port}.pid`);
}

export function findDaemonPidFile(
  kind: DaemonPidKind,
  port: number | string,
  cwd = process.cwd(),
): string | undefined {
  const homePath = canonicalDaemonPidPath(kind, port);
  if (existsSync(homePath)) return homePath;
  const legacy = legacyCwdDaemonPidPath(kind, port, cwd);
  if (existsSync(legacy)) return legacy;
  return undefined;
}

const PID_NAME_RE = /^(?:\.?)brooklyn-(web|http)-(\d+)\.pid$/;

export function parseDaemonPidFileName(
  name: string,
): { kind: DaemonPidKind; port: number } | undefined {
  const match = name.match(PID_NAME_RE);
  if (!(match?.[1] && match[2])) return undefined;
  const port = Number.parseInt(match[2], 10);
  if (!Number.isFinite(port)) return undefined;
  return { kind: match[1] as DaemonPidKind, port };
}

function scanPidDir(dir: string, location: DaemonPidFile["location"]): DaemonPidFile[] {
  if (!existsSync(dir)) return [];
  const files: DaemonPidFile[] = [];
  try {
    for (const name of readdirSync(dir)) {
      const parsed = parseDaemonPidFileName(name);
      if (!parsed) continue;
      files.push({
        path: join(dir, name),
        name,
        kind: parsed.kind,
        port: parsed.port,
        location,
      });
    }
  } catch {
    // unreadable dir
  }
  return files;
}

export function listDaemonPidFiles(
  cwd = process.cwd(),
  filter?: { kind?: DaemonPidKind },
): DaemonPidFile[] {
  const home = scanPidDir(getPidDir(), "home");
  const local = scanPidDir(cwd, "cwd");
  const seen = new Set(home.map((f) => `${f.kind}:${f.port}`));
  const merged = [...home];
  for (const file of local) {
    const key = `${file.kind}:${file.port}`;
    if (seen.has(key)) continue;
    merged.push(file);
  }
  if (filter?.kind) {
    return merged.filter((file) => file.kind === filter.kind);
  }
  return merged;
}
