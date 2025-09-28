import { platform } from "node:os";
import { join } from "node:path";

export function getBinaryName(): string {
  return platform() === "win32" ? "brooklyn.exe" : "brooklyn";
}

export function getBinaryPath(dir = "dist"): string {
  return join(dir, getBinaryName());
}

export function isWindows(): boolean {
  return platform() === "win32";
}
