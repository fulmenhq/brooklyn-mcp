import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { replaceInstalledBinary } from "../../src/shared/install-binary.js";

describe("replaceInstalledBinary", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "brooklyn-install-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("copies when the destination does not exist", () => {
    const src = join(dir, "src-bin");
    const dest = join(dir, "dest-bin");
    writeFileSync(src, "new-bytes");
    replaceInstalledBinary(src, dest);
    expect(readFileSync(dest, "utf8")).toBe("new-bytes");
  });

  it("unlinks an existing destination before copy", () => {
    mkdirSync(dir, { recursive: true });
    const src = join(dir, "src-bin");
    const dest = join(dir, "dest-bin");
    writeFileSync(src, "replacement");
    writeFileSync(dest, "stale");
    replaceInstalledBinary(src, dest);
    expect(readFileSync(dest, "utf8")).toBe("replacement");
  });
});
