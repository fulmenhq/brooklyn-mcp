import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function loadEnumValues(schemaPath: string): string[] {
  const text = readFileSync(schemaPath, "utf-8");
  const schema = JSON.parse(text);
  return Array.isArray(schema.enum) ? (schema.enum as string[]) : [];
}

describe("Phase markers", () => {
  it("LIFECYCLE_PHASE must be a valid lifecycle enum", () => {
    const root = join(import.meta.dirname, "../..");
    const lifecycle = readFileSync(join(root, "LIFECYCLE_PHASE"), "utf-8").trim();
    const allowed = loadEnumValues(join(root, "schemas/config/lifecycle-phase-v1.0.0.json"));
    expect(allowed.includes(lifecycle)).toBe(true);
  });

  it("RELEASE_PHASE must be a valid release enum", () => {
    const root = join(import.meta.dirname, "../..");
    const phase = readFileSync(join(root, "RELEASE_PHASE"), "utf-8").trim();
    const allowed = loadEnumValues(join(root, "schemas/config/release-phase-v1.0.0.json"));
    expect(allowed.includes(phase)).toBe(true);
  });
});
