#!/usr/bin/env bun

/**
 * Minimal license scanner for Node/Bun projects.
 * - Walks node_modules, reads package.json, collects name/version/license
 * - Attempts to locate a license file alongside the package.json
 * - Emits dist/licenses/licenses.json and dist/licenses/THIRD_PARTY_NOTICES.md
 * - --strict: exits non-zero on unknown/missing/disallowed licenses
 */

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const nodeModulesDir = path.join(root, "node_modules");
const outDir = path.join(root, "dist", "licenses");
const strict = process.argv.includes("--strict");

const ALLOWLIST = new Set([
  "MIT",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "ISC",
  "CC0-1.0",
  "0BSD",
  "BlueOak-1.0.0",
]);

const DISALLOWED_PREFIXES = ["GPL", "LGPL", "AGPL"];

type LicenseRecord = {
  name: string;
  version: string;
  license: string | { type?: string } | undefined;
  licenseFile?: string;
  path: string;
};

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function findLicenseFile(pkgDir: string): Promise<string | undefined> {
  const candidates = ["LICENSE", "LICENSE.txt", "LICENSE.md", "LICENCE", "COPYING", "NOTICE"];
  for (const c of candidates) {
    const p = path.join(pkgDir, c);
    if (await exists(p)) return p;
  }
  return undefined;
}

async function walkPackages(dir: string, acc: LicenseRecord[]): Promise<void> {
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  const tasks: Promise<void>[] = [];
  for (const name of entries) {
    if (name.startsWith(".") || name === ".bin") continue;
    const full = path.join(dir, name);
    tasks.push(
      (async () => {
        let st: Awaited<ReturnType<typeof stat>> | undefined;
        try {
          st = await stat(full);
        } catch {
          return;
        }
        if (!st.isDirectory()) return;
        if (name.startsWith("@")) {
          await walkPackages(full, acc);
          return;
        }
        const pkgJson = path.join(full, "package.json");
        if (await exists(pkgJson)) {
          try {
            const raw = await readFile(pkgJson, "utf-8");
            const json = JSON.parse(raw);
            const licenseFile = await findLicenseFile(full);
            acc.push({
              name: json.name || name,
              version: json.version || "",
              license: json.license,
              licenseFile,
              path: full,
            });
          } catch {
            // ignore
          }
        }
        const nested = path.join(full, "node_modules");
        if (await exists(nested)) {
          await walkPackages(nested, acc);
        }
      })(),
    );
  }
  await Promise.all(tasks);
}

function toSpdx(license: LicenseRecord["license"]): string {
  if (!license) return "UNKNOWN";
  if (typeof license === "string") return license.trim();
  if (typeof license.type === "string") return license.type.trim();
  return "UNKNOWN";
}

function isDualLicenseAllowed(spdx: string): boolean {
  // Handle dual licenses like "MIT OR Apache-2.0", "(MIT OR CC0-1.0)"
  if (spdx.includes(" OR ")) {
    const licenses = spdx
      .replace(/[()]/g, "") // Remove parentheses
      .split(" OR ")
      .map((l) => l.trim());
    return licenses.some((license) => ALLOWLIST.has(license));
  }
  return false;
}

function uniqueAndSort(records: LicenseRecord[]): LicenseRecord[] {
  const map = new Map<string, LicenseRecord>();
  for (const r of records) {
    const key = `${r.name}@${r.version}`;
    if (!map.has(key)) map.set(key, r);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function writeInventory(pkgs: LicenseRecord[]): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, "licenses.json"),
    `${JSON.stringify(
      pkgs.map((p) => ({
        name: p.name,
        version: p.version,
        license: toSpdx(p.license),
        path: path.relative(root, p.path),
        licenseFile: p.licenseFile ? path.relative(root, p.licenseFile) : undefined,
      })),
      null,
      2,
    )}\n`,
    "utf-8",
  );
}

async function generateNotices(
  pkgs: LicenseRecord[],
): Promise<{ unknowns: string[]; disallowed: string[] }> {
  let md = "# Third-Party Notices\n\n";
  md += "This project includes third-party software. Below are licenses and notices.\n\n";
  const disallowed: string[] = [];
  const unknowns: string[] = [];
  for (const p of pkgs) {
    const spdx = toSpdx(p.license);
    md += `## ${p.name} @ ${p.version}\n\n`;
    md += `- License: ${spdx}\n`;
    md += `- Path: ${path.relative(root, p.path)}\n\n`;
    if (p.licenseFile) {
      try {
        const text = await readFile(p.licenseFile, "utf-8");
        md += "<details><summary>License Text</summary>\n\n";
        md += `\`\`\`\n${text.trim()}\n\`\`\`\n`;
        md += "</details>\n\n";
      } catch {
        // ignore
      }
    }
    if (strict) {
      if (spdx === "UNKNOWN") {
        unknowns.push(`${p.name}@${p.version}`);
      } else if (DISALLOWED_PREFIXES.some((pref) => spdx.toUpperCase().startsWith(pref))) {
        disallowed.push(`${p.name}@${p.version} (${spdx})`);
      } else if (!(ALLOWLIST.has(spdx) || isDualLicenseAllowed(spdx))) {
        unknowns.push(`${p.name}@${p.version} (${spdx} - not in allowlist)`);
      }
    }
  }
  await writeFile(path.join(outDir, "THIRD_PARTY_NOTICES.md"), md, "utf-8");
  return { unknowns, disallowed };
}

async function main(): Promise<void> {
  const records: LicenseRecord[] = [];
  await walkPackages(nodeModulesDir, records);
  const pkgs = uniqueAndSort(records);

  await writeInventory(pkgs);
  const { unknowns, disallowed } = await generateNotices(pkgs);

  if (strict && (unknowns.length || disallowed.length)) {
    console.error("License scan failed under --strict policy.");
    if (unknowns.length) console.error(`Unknown licenses:\n - ${unknowns.join("\n - ")}`);
    if (disallowed.length) console.error(`Disallowed licenses:\n - ${disallowed.join("\n - ")}`);
    process.exit(1);
  }

  console.info(`Scanned ${pkgs.length} packages. Output: ${path.relative(root, outDir)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
