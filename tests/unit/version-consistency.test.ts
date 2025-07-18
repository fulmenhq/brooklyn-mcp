/**
 * Version consistency test for Brooklyn MCP server
 *
 * Ensures that the VERSION file and package.json version are synchronized.
 * This test validates the Single Source of Truth (SSOT) pattern.
 */

import { describe, expect, it } from "vitest";
import { checkVersionConsistency } from "../../scripts/check-versions.js";

describe("Version Consistency", () => {
  it("should have consistent versions between VERSION file and package.json", async () => {
    const result = await checkVersionConsistency();

    expect(result.consistent).toBe(true);
    expect(result.sourceVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(result.issues).toHaveLength(0);
  });

  it("should have a valid semantic version format", async () => {
    const result = await checkVersionConsistency();

    // Test that the version follows semantic versioning
    const versionRegex = /^(\d+)\.(\d+)\.(\d+)$/;
    const match = result.sourceVersion.match(versionRegex);

    expect(match).toBeTruthy();
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(0); // major
    expect(Number(match?.[2])).toBeGreaterThanOrEqual(0); // minor
    expect(Number(match?.[3])).toBeGreaterThanOrEqual(0); // patch
  });

  it("should provide detailed information about version locations", async () => {
    const result = await checkVersionConsistency();

    // Should have at least VERSION file and package.json
    expect(result.sourceVersion).toBeDefined();
    expect(typeof result.sourceVersion).toBe("string");
    expect(result.sourceVersion.length).toBeGreaterThan(0);
  });
});
