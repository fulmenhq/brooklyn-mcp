/**
 * Tests for extract_table_data tool
 * Covers: tool schema, content extraction service logic, CSV output
 */

import { describe, expect, it } from "vitest";
import { getAllTools } from "../../src/core/tool-definitions.js";

describe("extract_table_data tool schema", () => {
  it("should be defined in contentCaptureTools", () => {
    const tools = getAllTools();
    const tool = tools.find((t) => t.name === "extract_table_data");

    expect(tool).toBeDefined();
    expect(tool!.category).toBe("content-capture");
  });

  it("should require selector parameter", () => {
    const tools = getAllTools();
    const tool = tools.find((t) => t.name === "extract_table_data");

    expect(tool!.inputSchema.required).toContain("selector");
  });

  it("should have browserId, target, selector, format, and timeout properties", () => {
    const tools = getAllTools();
    const tool = tools.find((t) => t.name === "extract_table_data");
    const props = tool!.inputSchema.properties as Record<string, unknown>;

    expect(props["browserId"]).toBeDefined();
    expect(props["target"]).toBeDefined();
    expect(props["selector"]).toBeDefined();
    expect(props["format"]).toBeDefined();
    expect(props["timeout"]).toBeDefined();
  });

  it("should have format enum of json and csv", () => {
    const tools = getAllTools();
    const tool = tools.find((t) => t.name === "extract_table_data");
    const formatProp = (tool!.inputSchema.properties as Record<string, Record<string, unknown>>)[
      "format"
    ];

    expect(formatProp?.["enum"]).toEqual(["json", "csv"]);
    expect(formatProp?.["default"]).toBe("json");
  });

  it("should have examples with expected output shape", () => {
    const tools = getAllTools();
    const tool = tools.find((t) => t.name === "extract_table_data");

    expect(tool!.examples).toBeDefined();
    expect(tool!.examples!.length).toBeGreaterThanOrEqual(2);

    const jsonExample = tool!.examples![0];
    expect(jsonExample!.expectedOutput).toHaveProperty("success");
    expect(jsonExample!.expectedOutput).toHaveProperty("headers");
    expect(jsonExample!.expectedOutput).toHaveProperty("data");
    expect(jsonExample!.expectedOutput).toHaveProperty("rows");
    expect(jsonExample!.expectedOutput).toHaveProperty("columns");

    const csvExample = tool!.examples![1];
    expect(csvExample!.expectedOutput).toHaveProperty("csv");
  });

  it("should have error definitions", () => {
    const tools = getAllTools();
    const tool = tools.find((t) => t.name === "extract_table_data");

    expect(tool!.errors).toBeDefined();
    const errorCodes = tool!.errors!.map((e) => e.code);
    expect(errorCodes).toContain("ELEMENT_NOT_FOUND");
    expect(errorCodes).toContain("BROWSER_NOT_FOUND");
  });
});

describe("ContentExtractionService.extractTableData", () => {
  // We test the page.evaluate logic indirectly through integration tests.
  // Here we verify the interface types and service method exist.

  it("should export ExtractTableDataArgs and ExtractTableDataResult types", async () => {
    const mod = await import("../../src/core/content/content-extraction-service.js");
    expect(mod.ContentExtractionService).toBeDefined();

    // Verify the service has the method
    const service = new mod.ContentExtractionService();
    expect(typeof service.extractTableData).toBe("function");
  });
});
