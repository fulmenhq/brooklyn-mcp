import { describe, expect, it } from "vitest";

import { getSysprims } from "../../src/shared/sysprims.js";

describe("sysprims adapter", () => {
  it("returns unavailable when disabled by env var", async () => {
    process.env["BROOKLYN_DISABLE_SYSPRIMS"] = "1";
    const result = await getSysprims();
    expect(result.available).toBe(false);
    delete process.env["BROOKLYN_DISABLE_SYSPRIMS"];
  });
});
