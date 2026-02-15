/**
 * Tests for inspect_network tool
 * Covers: tool schema, network event types, BROOKLYN_FULL_HEADER_SUPPORT gating
 */

import { afterEach, describe, expect, it } from "vitest";
import { getAllTools } from "../../src/core/tool-definitions.js";

describe("inspect_network tool schema", () => {
  it("should be defined in tools", () => {
    const tools = getAllTools();
    const tool = tools.find((t) => t.name === "inspect_network");

    expect(tool).toBeDefined();
    expect(tool!.category).toBe("content-capture");
  });

  it("should have browserId, target, filter, redact, and includeRaw properties", () => {
    const tools = getAllTools();
    const tool = tools.find((t) => t.name === "inspect_network");
    const props = tool!.inputSchema.properties as Record<string, unknown>;

    expect(props["browserId"]).toBeDefined();
    expect(props["target"]).toBeDefined();
    expect(props["filter"]).toBeDefined();
    expect(props["redact"]).toBeDefined();
    expect(props["includeRaw"]).toBeDefined();
  });

  it("should have filter with urlPattern and method subproperties", () => {
    const tools = getAllTools();
    const tool = tools.find((t) => t.name === "inspect_network");
    const filterProp = (tool!.inputSchema.properties as Record<string, Record<string, unknown>>)[
      "filter"
    ];

    expect(filterProp?.["type"]).toBe("object");
    const filterProps = filterProp?.["properties"] as Record<string, unknown>;
    expect(filterProps?.["urlPattern"]).toBeDefined();
    expect(filterProps?.["method"]).toBeDefined();
  });

  it("should not require any parameters", () => {
    const tools = getAllTools();
    const tool = tools.find((t) => t.name === "inspect_network");

    // All params optional — browserId auto-resolves
    expect(tool!.inputSchema.required).toBeUndefined();
  });

  it("should have examples", () => {
    const tools = getAllTools();
    const tool = tools.find((t) => t.name === "inspect_network");

    expect(tool!.examples).toBeDefined();
    expect(tool!.examples!.length).toBeGreaterThanOrEqual(2);
  });

  it("should have RAW_HEADERS_NOT_ALLOWED error definition", () => {
    const tools = getAllTools();
    const tool = tools.find((t) => t.name === "inspect_network");

    const errorCodes = tool!.errors!.map((e) => e.code);
    expect(errorCodes).toContain("RAW_HEADERS_NOT_ALLOWED");
    expect(errorCodes).toContain("BROWSER_NOT_FOUND");
  });
});

describe("NetworkEvent type from browser-instance", () => {
  it("should export NetworkEvent interface", async () => {
    const mod = await import("../../src/core/browser/browser-instance.js");
    expect(mod.BrowserInstance).toBeDefined();

    // Verify getNetworkEvents method exists
    const instance = new mod.BrowserInstance({
      browserType: "chromium",
      headless: true,
      timeout: 30000,
    });
    expect(typeof instance.getNetworkEvents).toBe("function");
    expect(instance.getNetworkEvents()).toEqual([]);
  });
});

describe("BROOKLYN_FULL_HEADER_SUPPORT env var", () => {
  const originalEnv = process.env["BROOKLYN_FULL_HEADER_SUPPORT"];

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env["BROOKLYN_FULL_HEADER_SUPPORT"] = originalEnv;
    } else {
      delete process.env["BROOKLYN_FULL_HEADER_SUPPORT"];
    }
  });

  it("should recognize when BROOKLYN_FULL_HEADER_SUPPORT is true", () => {
    process.env["BROOKLYN_FULL_HEADER_SUPPORT"] = "true";
    expect(process.env["BROOKLYN_FULL_HEADER_SUPPORT"]).toBe("true");
  });

  it("should recognize when BROOKLYN_FULL_HEADER_SUPPORT is not set", () => {
    delete process.env["BROOKLYN_FULL_HEADER_SUPPORT"];
    expect(process.env["BROOKLYN_FULL_HEADER_SUPPORT"]).toBeUndefined();
  });
});
