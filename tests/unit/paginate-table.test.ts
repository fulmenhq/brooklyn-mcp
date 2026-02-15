/**
 * Tests for paginate_table tool
 * Covers: tool schema, required params, examples
 */

import { describe, expect, it } from "vitest";
import { getAllTools } from "../../src/core/tool-definitions.js";

describe("paginate_table tool schema", () => {
  it("should be defined in tools", () => {
    const tools = getAllTools();
    const tool = tools.find((t) => t.name === "paginate_table");

    expect(tool).toBeDefined();
    expect(tool!.category).toBe("content-capture");
  });

  it("should require browserId, tableSelector, and nextButton", () => {
    const tools = getAllTools();
    const tool = tools.find((t) => t.name === "paginate_table");
    const required = tool!.inputSchema.required;

    expect(required).toContain("browserId");
    expect(required).toContain("tableSelector");
    expect(required).toContain("nextButton");
  });

  it("should have maxPages with default 10", () => {
    const tools = getAllTools();
    const tool = tools.find((t) => t.name === "paginate_table");
    const props = tool!.inputSchema.properties as Record<string, Record<string, unknown>>;

    expect(props["maxPages"]).toBeDefined();
    expect(props["maxPages"]?.["default"]).toBe(10);
    expect(props["maxPages"]?.["minimum"]).toBe(1);
    expect(props["maxPages"]?.["maximum"]).toBe(100);
  });

  it("should have examples with expected output shape", () => {
    const tools = getAllTools();
    const tool = tools.find((t) => t.name === "paginate_table");

    expect(tool!.examples).toBeDefined();
    expect(tool!.examples!.length).toBeGreaterThanOrEqual(1);

    const example = tool!.examples![0];
    expect(example!.expectedOutput).toHaveProperty("success");
    expect(example!.expectedOutput).toHaveProperty("allData");
    expect(example!.expectedOutput).toHaveProperty("pages");
    expect(example!.expectedOutput).toHaveProperty("totalRows");
  });

  it("should have error definitions", () => {
    const tools = getAllTools();
    const tool = tools.find((t) => t.name === "paginate_table");

    const errorCodes = tool!.errors!.map((e) => e.code);
    expect(errorCodes).toContain("BROWSER_NOT_FOUND");
    expect(errorCodes).toContain("ELEMENT_NOT_FOUND");
    expect(errorCodes).toContain("MAX_PAGES_REACHED");
  });
});
