/**
 * Browser Version Consistency Tests
 *
 * Validates that installed Playwright browser revisions match what the
 * Playwright package expects. Catches version drift early before CI failures.
 *
 * @see docs/development/browser-update-procedure.md
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface PlaywrightBrowserSpec {
  name: string;
  revision: string;
  installByDefault: boolean;
  browserVersion?: string;
}

interface PlaywrightBrowsersJson {
  browsers: PlaywrightBrowserSpec[];
}

/**
 * Get the expected browser revisions from Playwright's browsers.json
 */
function getExpectedBrowserRevisions(): Map<string, string> {
  const browsersJsonPath = join(
    process.cwd(),
    "node_modules",
    "playwright-core",
    "browsers.json",
  );

  if (!existsSync(browsersJsonPath)) {
    throw new Error(
      `browsers.json not found at ${browsersJsonPath}. Run 'bun install' first.`,
    );
  }

  const browsersJson: PlaywrightBrowsersJson = JSON.parse(
    readFileSync(browsersJsonPath, "utf8"),
  );

  const revisions = new Map<string, string>();
  for (const browser of browsersJson.browsers) {
    if (browser.installByDefault) {
      revisions.set(browser.name, browser.revision);
    }
  }

  return revisions;
}

/**
 * Get installed browser revisions from Playwright cache
 */
function getInstalledBrowserRevisions(): Map<string, string> {
  const cacheBase =
    process.platform === "darwin"
      ? join(homedir(), "Library", "Caches")
      : process.platform === "win32"
        ? join(homedir(), "AppData", "Local")
        : join(homedir(), ".cache");

  const playwrightCache = join(cacheBase, "ms-playwright");

  if (!existsSync(playwrightCache)) {
    return new Map();
  }

  const entries = readdirSync(playwrightCache);
  const revisions = new Map<string, string>();

  // Pattern: browserName-revision or browserName_suffix-revision
  const browserPattern = /^(chromium|firefox|webkit|chromium_headless_shell|ffmpeg)-(\d+)$/;

  for (const entry of entries) {
    const match = entry.match(browserPattern);
    if (match) {
      const browserName = match[1];
      const revision = match[2];
      if (browserName && revision) {
        // Normalize chromium_headless_shell to chromium-headless-shell for comparison
        const normalizedName = browserName.replace("_", "-");
        revisions.set(normalizedName, revision);
      }
    }
  }

  return revisions;
}

describe("Browser Version Consistency", () => {
  it("should have browsers.json available from playwright-core", () => {
    const browsersJsonPath = join(
      process.cwd(),
      "node_modules",
      "playwright-core",
      "browsers.json",
    );
    expect(existsSync(browsersJsonPath)).toBe(true);
  });

  it("should detect expected browser revisions from Playwright", () => {
    const expected = getExpectedBrowserRevisions();

    // Playwright should define at least chromium, firefox, webkit
    expect(expected.has("chromium")).toBe(true);
    expect(expected.has("firefox")).toBe(true);
    expect(expected.has("webkit")).toBe(true);

    // Revisions should be numeric strings
    for (const [name, revision] of expected) {
      expect(revision).toMatch(/^\d+$/);
      console.log(`Expected ${name}: revision ${revision}`);
    }
  });

  it("should have chromium installed with correct revision", () => {
    const expected = getExpectedBrowserRevisions();
    const installed = getInstalledBrowserRevisions();

    const expectedChromium = expected.get("chromium");
    const installedChromium = installed.get("chromium");

    if (!installedChromium) {
      console.warn(
        "⚠️ Chromium not installed. Run: bunx playwright install chromium",
      );
      // Skip instead of fail - browser may not be installed in all environments
      return;
    }

    expect(installedChromium).toBe(expectedChromium);
  });

  it("should have chromium-headless-shell installed with correct revision", () => {
    const expected = getExpectedBrowserRevisions();
    const installed = getInstalledBrowserRevisions();

    const expectedRevision = expected.get("chromium-headless-shell");
    const installedRevision = installed.get("chromium-headless-shell");

    if (!expectedRevision) {
      // Some Playwright versions don't have headless shell as separate
      return;
    }

    if (!installedRevision) {
      console.warn(
        "⚠️ chromium-headless-shell not installed. Run: bunx playwright install chromium",
      );
      return;
    }

    expect(installedRevision).toBe(expectedRevision);
  });

  it("should report version mismatch details for debugging", () => {
    const expected = getExpectedBrowserRevisions();
    const installed = getInstalledBrowserRevisions();

    const mismatches: string[] = [];

    for (const [name, expectedRev] of expected) {
      const installedRev = installed.get(name);
      if (installedRev && installedRev !== expectedRev) {
        mismatches.push(
          `${name}: installed=${installedRev}, expected=${expectedRev}`,
        );
      }
    }

    if (mismatches.length > 0) {
      console.error("🚨 Browser version mismatches detected:");
      for (const mismatch of mismatches) {
        console.error(`   ${mismatch}`);
      }
      console.error("\nTo fix: bunx playwright install --force");
    }

    // This test documents mismatches but doesn't fail
    // The specific browser tests above will fail on mismatch
    expect(mismatches.length).toBe(0);
  });
});

describe("Browser Update Procedure Validation", () => {
  it("should document current Playwright version", () => {
    const packageJsonPath = join(process.cwd(), "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    const playwrightVersion = packageJson.dependencies?.playwright;

    expect(playwrightVersion).toBeDefined();
    console.log(`📦 Playwright package version: ${playwrightVersion}`);
  });

  it("should have lock file with pinned Playwright version", () => {
    const lockPath = join(process.cwd(), "bun.lock");
    expect(existsSync(lockPath)).toBe(true);

    const lockContent = readFileSync(lockPath, "utf8");
    expect(lockContent).toContain("playwright@");
    expect(lockContent).toContain("playwright-core@");
  });
});
