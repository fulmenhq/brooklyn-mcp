import { describe, expect, it } from "vitest";

import { normalizeCallToolResult } from "../../src/shared/mcp-response.js";

describe("normalizeCallToolResult", () => {
  it("wraps primitives into content blocks", () => {
    const result = normalizeCallToolResult("hello");
    const block = result.content?.[0];
    if (block?.type !== "text") {
      throw new Error("expected text content block");
    }
    expect(block.text).toBe("hello");
    expect(result.structuredContent).toBeUndefined();
  });

  it("preserves structured objects and renders them as text", () => {
    const payload = { foo: "bar" };
    const result = normalizeCallToolResult(payload);
    expect(result.structuredContent).toEqual(payload);
    const block = result.content?.[0];
    if (block?.type !== "text") {
      throw new Error("expected text content block");
    }
    expect(block.text).toContain("foo");
  });

  it("passes through CallToolResult-like shapes", () => {
    const existing = {
      content: [{ type: "text", text: "ok" }],
      structuredContent: { ok: true },
    };
    const result = normalizeCallToolResult(existing);
    expect(result).toEqual(existing);
  });
});
