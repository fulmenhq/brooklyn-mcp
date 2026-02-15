/**
 * Playwright runtime resolver
 *
 * Brooklyn is built with playwright marked as an external dependency.
 * That keeps the binary small, but it means module resolution can depend
 * on the user's current working directory.
 *
 * This helper makes Playwright resolution deterministic by also searching
 * Brooklyn's runtime directory (installed by scripts/install-cli.ts).
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export type PlaywrightModule = typeof import("playwright");

export function getBrooklynRuntimeDir(): string {
  return join(homedir(), ".brooklyn", "runtime");
}

function getRequireSearchPaths(): string[] {
  const runtimeDir = getBrooklynRuntimeDir();
  const execDir = process.argv[1] ? dirname(process.argv[1]) : process.cwd();
  return [process.cwd(), execDir, runtimeDir];
}

export function resolvePlaywright(specifier: string): string | null {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve(specifier, { paths: getRequireSearchPaths() });
  } catch {
    return null;
  }
}

export async function importPlaywright(): Promise<PlaywrightModule> {
  try {
    return (await import("playwright")) as PlaywrightModule;
  } catch {
    // fall through to explicit resolution
  }

  const resolved = resolvePlaywright("playwright");
  if (!resolved) {
    throw new Error(
      "Playwright dependency not found. If you installed via 'make install', re-run 'make install' to install runtime deps. Otherwise run 'bun install' in the brooklyn-mcp repo.",
    );
  }

  return (await import(pathToFileURL(resolved).href)) as PlaywrightModule;
}

export function resolvePlaywrightCliJs(): string | null {
  const pkgPath = resolvePlaywright("playwright/package.json");
  if (!pkgPath) return null;

  try {
    const pkgUnknown: unknown = JSON.parse(readFileSync(pkgPath, "utf8"));
    let binRel: string | undefined;
    if (pkgUnknown && typeof pkgUnknown === "object") {
      const pkgObj = pkgUnknown as Record<string, unknown>;
      const bin = pkgObj["bin"];
      if (typeof bin === "string") {
        binRel = bin;
      } else if (bin && typeof bin === "object") {
        const binObj = bin as Record<string, unknown>;
        const pw = binObj["playwright"];
        if (typeof pw === "string") binRel = pw;
      }
    }

    const cliJs = join(dirname(pkgPath), binRel || "cli.js");
    if (!existsSync(cliJs)) return null;
    return cliJs;
  } catch {
    return null;
  }
}
