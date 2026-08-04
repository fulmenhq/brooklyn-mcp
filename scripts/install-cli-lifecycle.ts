#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const invocationDir = resolve(process.env["INIT_CWD"] || process.cwd());

// Package consumers receive the source CLI through package.json's bin links.
// The developer installer writes to user-level Brooklyn paths and is only
// appropriate when explicitly invoked from this repository.
if (invocationDir !== repoRoot) {
  console.log("Brooklyn package installed; skipping repository-local CLI installation.");
  process.exit(0);
}

for (const args of [["run", "build"], ["scripts/install-cli.ts"]]) {
  const result = spawnSync("bun", args, {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
