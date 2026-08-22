/**
 * Install a CLI binary by replacing the destination inode.
 *
 * macOS (and Linux) can fail or leave a mapped image when copyFile overwrites a
 * running/already-installed Mach-O. Unlink first when the dest exists, then copy.
 */

import { copyFileSync, existsSync, rmSync } from "node:fs";
import { platform } from "node:os";

export function replaceInstalledBinary(sourcePath: string, destPath: string): void {
  if (existsSync(destPath)) {
    rmSync(destPath, { force: true });
  }
  copyFileSync(sourcePath, destPath);
}

export function shouldUnlinkBeforeInstallCopy(): boolean {
  const os = platform();
  return os === "darwin" || os === "linux";
}
