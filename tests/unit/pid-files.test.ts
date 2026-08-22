import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  canonicalDaemonPidPath,
  findDaemonPidFile,
  getPidDir,
  listDaemonPidFiles,
  parseDaemonPidFileName,
} from "../../src/shared/pid-files.js";

describe("pid-files", () => {
  const originalHome = process.env["BROOKLYN_HOME"];
  let home: string;
  let cwd: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "brooklyn-home-"));
    cwd = mkdtempSync(join(tmpdir(), "brooklyn-cwd-"));
    process.env["BROOKLYN_HOME"] = home;
  });

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env["BROOKLYN_HOME"];
    } else {
      process.env["BROOKLYN_HOME"] = originalHome;
    }
    rmSync(home, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  it("parses canonical and legacy pid names", () => {
    expect(parseDaemonPidFileName("brooklyn-web-3000.pid")).toEqual({ kind: "web", port: 3000 });
    expect(parseDaemonPidFileName(".brooklyn-http-8080.pid")).toEqual({ kind: "http", port: 8080 });
    expect(parseDaemonPidFileName("notes.txt")).toBeUndefined();
  });

  it("places canonical pid files under BROOKLYN_HOME/pids", () => {
    expect(canonicalDaemonPidPath("web", 3000)).toBe(join(home, "pids", "brooklyn-web-3000.pid"));
    expect(getPidDir()).toBe(join(home, "pids"));
  });

  it("prefers the app-home pid file over a leftover CWD file", () => {
    mkdirSync(join(home, "pids"), { recursive: true });
    const homePid = join(home, "pids", "brooklyn-web-3000.pid");
    const cwdPid = join(cwd, ".brooklyn-web-3000.pid");
    writeFileSync(homePid, "111");
    writeFileSync(cwdPid, "222");
    expect(findDaemonPidFile("web", 3000, cwd)).toBe(homePid);
  });

  it("falls back to a legacy CWD pid file", () => {
    writeFileSync(join(cwd, ".brooklyn-web-3000.pid"), "333");
    expect(findDaemonPidFile("web", 3000, cwd)).toBe(join(cwd, ".brooklyn-web-3000.pid"));
  });

  it("lists home pid files and does not duplicate CWD leftovers for the same port", () => {
    mkdirSync(join(home, "pids"), { recursive: true });
    writeFileSync(join(home, "pids", "brooklyn-web-3000.pid"), "1");
    writeFileSync(join(cwd, ".brooklyn-web-3000.pid"), "2");
    writeFileSync(join(cwd, ".brooklyn-http-8080.pid"), "3");
    const listed = listDaemonPidFiles(cwd);
    expect(listed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "web", port: 3000, location: "home" }),
        expect.objectContaining({ kind: "http", port: 8080, location: "cwd" }),
      ]),
    );
    expect(listed.filter((f) => f.kind === "web" && f.port === 3000)).toHaveLength(1);
  });

  it("does not treat a web pid as http on the same port", () => {
    mkdirSync(join(home, "pids"), { recursive: true });
    writeFileSync(join(home, "pids", "brooklyn-web-3000.pid"), "111");
    expect(findDaemonPidFile("http", 3000, cwd)).toBeUndefined();
    expect(findDaemonPidFile("web", 3000, cwd)).toBe(join(home, "pids", "brooklyn-web-3000.pid"));
  });

  it("dev-http-stop listing ignores web daemons when both kinds are present", () => {
    mkdirSync(join(home, "pids"), { recursive: true });
    writeFileSync(join(home, "pids", "brooklyn-web-3000.pid"), "111");
    writeFileSync(join(home, "pids", "brooklyn-http-8080.pid"), "222");
    const httpOnly = listDaemonPidFiles(cwd, { kind: "http" });
    expect(httpOnly).toEqual([
      expect.objectContaining({ kind: "http", port: 8080, location: "home" }),
    ]);
    expect(httpOnly.some((file) => file.kind === "web")).toBe(false);
  });
});
