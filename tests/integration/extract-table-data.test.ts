/**
 * Integration test: extract_table_data parses real HTML tables.
 *
 * Spins up a tiny HTTP server that serves HTML pages with various table
 * structures, launches a browser, navigates to each, and verifies the
 * extracted data matches expectations.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MCPBrowserRouter } from "../../src/core/browser/mcp-browser-router.js";
import { MCPRequestContextFactory } from "../../src/core/browser/mcp-request-context.js";
import { BrowserPoolManager } from "../../src/core/browser-pool-manager.js";

let htmlServer: Server;
let htmlPort: number;

function makeContext(teamId = "test-table") {
  return MCPRequestContextFactory.create({
    teamId,
    userId: "integration-test",
    metadata: { permissions: ["browser.launch", "browser.navigate"] },
  });
}

const pages: Record<string, string> = {
  "/simple": `<html><body>
    <table id="simple">
      <thead><tr><th>Name</th><th>Age</th><th>City</th></tr></thead>
      <tbody>
        <tr><td>Alice</td><td>30</td><td>NYC</td></tr>
        <tr><td>Bob</td><td>25</td><td>LA</td></tr>
      </tbody>
    </table>
  </body></html>`,

  "/no-thead": `<html><body>
    <table id="no-thead">
      <tr><th>Product</th><th>Price</th></tr>
      <tr><td>Widget</td><td>$9.99</td></tr>
      <tr><td>Gadget</td><td>$19.99</td></tr>
    </table>
  </body></html>`,

  "/colspan": `<html><body>
    <table id="colspan">
      <thead><tr><th>Category</th><th>Q1</th><th>Q2</th></tr></thead>
      <tbody>
        <tr><td colspan="2">Revenue Total</td><td>$500</td></tr>
        <tr><td>Sales</td><td>$200</td><td>$300</td></tr>
      </tbody>
    </table>
  </body></html>`,

  "/rowspan": `<html><body>
    <table id="rowspan">
      <thead><tr><th>Region</th><th>Product</th><th>Sales</th></tr></thead>
      <tbody>
        <tr><td rowspan="2">North</td><td>A</td><td>100</td></tr>
        <tr><td>B</td><td>200</td></tr>
        <tr><td>South</td><td>A</td><td>150</td></tr>
      </tbody>
    </table>
  </body></html>`,

  "/empty": `<html><body>
    <table id="empty">
      <thead><tr><th>Col1</th><th>Col2</th></tr></thead>
      <tbody></tbody>
    </table>
  </body></html>`,
};

beforeAll(async () => {
  htmlServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    const html = pages[req.url || ""];
    if (html) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  await new Promise<void>((resolve) => {
    htmlServer.listen(0, "127.0.0.1", () => {
      const addr = htmlServer.address();
      htmlPort = typeof addr === "object" && addr ? addr.port : 0;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => htmlServer.close(() => resolve()));
}, 10000);

describe("extract_table_data integration", () => {
  it("should extract a simple table with thead/tbody", async () => {
    const pool = new BrowserPoolManager({ mcpMode: true });
    await pool.initialize();
    const router = new MCPBrowserRouter(pool);
    const ctx = makeContext("team-simple");

    try {
      const launch = await router.route({
        tool: "launch_browser",
        params: { browserType: "chromium", headless: true },
        context: ctx,
      });
      expect(launch.success).toBe(true);
      const browserId = (launch.result as Record<string, unknown>)["browserId"] as string;

      await router.route({
        tool: "navigate_to_url",
        params: { browserId, url: `http://127.0.0.1:${htmlPort}/simple`, waitUntil: "networkidle" },
        context: ctx,
      });

      const result = await router.route({
        tool: "extract_table_data",
        params: { browserId, selector: "#simple" },
        context: ctx,
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data["headers"]).toEqual(["Name", "Age", "City"]);
      expect(data["rows"]).toBe(2);
      expect(data["columns"]).toBe(3);

      const rows = data["data"] as Record<string, string>[];
      expect(rows[0]).toEqual({ Name: "Alice", Age: "30", City: "NYC" });
      expect(rows[1]).toEqual({ Name: "Bob", Age: "25", City: "LA" });
    } finally {
      await pool.cleanup();
    }
  });

  it("should detect headers from th elements when no thead", async () => {
    const pool = new BrowserPoolManager({ mcpMode: true });
    await pool.initialize();
    const router = new MCPBrowserRouter(pool);
    const ctx = makeContext("team-nothead");

    try {
      const launch = await router.route({
        tool: "launch_browser",
        params: { browserType: "chromium", headless: true },
        context: ctx,
      });
      const browserId = (launch.result as Record<string, unknown>)["browserId"] as string;

      await router.route({
        tool: "navigate_to_url",
        params: {
          browserId,
          url: `http://127.0.0.1:${htmlPort}/no-thead`,
          waitUntil: "networkidle",
        },
        context: ctx,
      });

      const result = await router.route({
        tool: "extract_table_data",
        params: { browserId, selector: "#no-thead" },
        context: ctx,
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data["headers"]).toEqual(["Product", "Price"]);
      expect(data["rows"]).toBe(2);

      const rows = data["data"] as Record<string, string>[];
      expect(rows[0]).toEqual({ Product: "Widget", Price: "$9.99" });
    } finally {
      await pool.cleanup();
    }
  });

  it("should handle colspan by expanding cells", async () => {
    const pool = new BrowserPoolManager({ mcpMode: true });
    await pool.initialize();
    const router = new MCPBrowserRouter(pool);
    const ctx = makeContext("team-colspan");

    try {
      const launch = await router.route({
        tool: "launch_browser",
        params: { browserType: "chromium", headless: true },
        context: ctx,
      });
      const browserId = (launch.result as Record<string, unknown>)["browserId"] as string;

      await router.route({
        tool: "navigate_to_url",
        params: {
          browserId,
          url: `http://127.0.0.1:${htmlPort}/colspan`,
          waitUntil: "networkidle",
        },
        context: ctx,
      });

      const result = await router.route({
        tool: "extract_table_data",
        params: { browserId, selector: "#colspan" },
        context: ctx,
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data["headers"]).toEqual(["Category", "Q1", "Q2"]);
      expect(data["rows"]).toBe(2);

      const rows = data["data"] as Record<string, string>[];
      // colspan=2 means "Revenue Total" fills both Category and Q1
      expect(rows[0]!["Category"]).toBe("Revenue Total");
      expect(rows[0]!["Q1"]).toBe("Revenue Total");
      expect(rows[0]!["Q2"]).toBe("$500");
    } finally {
      await pool.cleanup();
    }
  });

  it("should handle rowspan by filling cells downward", async () => {
    const pool = new BrowserPoolManager({ mcpMode: true });
    await pool.initialize();
    const router = new MCPBrowserRouter(pool);
    const ctx = makeContext("team-rowspan");

    try {
      const launch = await router.route({
        tool: "launch_browser",
        params: { browserType: "chromium", headless: true },
        context: ctx,
      });
      const browserId = (launch.result as Record<string, unknown>)["browserId"] as string;

      await router.route({
        tool: "navigate_to_url",
        params: {
          browserId,
          url: `http://127.0.0.1:${htmlPort}/rowspan`,
          waitUntil: "networkidle",
        },
        context: ctx,
      });

      const result = await router.route({
        tool: "extract_table_data",
        params: { browserId, selector: "#rowspan" },
        context: ctx,
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data["headers"]).toEqual(["Region", "Product", "Sales"]);
      expect(data["rows"]).toBe(3);

      const rows = data["data"] as Record<string, string>[];
      // rowspan=2 means "North" fills both row 0 and row 1
      expect(rows[0]!["Region"]).toBe("North");
      expect(rows[0]!["Product"]).toBe("A");
      expect(rows[1]!["Region"]).toBe("North");
      expect(rows[1]!["Product"]).toBe("B");
      expect(rows[2]!["Region"]).toBe("South");
    } finally {
      await pool.cleanup();
    }
  });

  it("should return CSV format when requested", async () => {
    const pool = new BrowserPoolManager({ mcpMode: true });
    await pool.initialize();
    const router = new MCPBrowserRouter(pool);
    const ctx = makeContext("team-csv");

    try {
      const launch = await router.route({
        tool: "launch_browser",
        params: { browserType: "chromium", headless: true },
        context: ctx,
      });
      const browserId = (launch.result as Record<string, unknown>)["browserId"] as string;

      await router.route({
        tool: "navigate_to_url",
        params: { browserId, url: `http://127.0.0.1:${htmlPort}/simple`, waitUntil: "networkidle" },
        context: ctx,
      });

      const result = await router.route({
        tool: "extract_table_data",
        params: { browserId, selector: "#simple", format: "csv" },
        context: ctx,
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data["format"]).toBe("csv");
      expect(data["csv"]).toBeDefined();

      const csv = data["csv"] as string;
      const lines = csv.split("\n");
      expect(lines[0]).toBe("Name,Age,City");
      expect(lines[1]).toBe("Alice,30,NYC");
      expect(lines[2]).toBe("Bob,25,LA");
    } finally {
      await pool.cleanup();
    }
  });

  it("should handle empty table body", async () => {
    const pool = new BrowserPoolManager({ mcpMode: true });
    await pool.initialize();
    const router = new MCPBrowserRouter(pool);
    const ctx = makeContext("team-empty");

    try {
      const launch = await router.route({
        tool: "launch_browser",
        params: { browserType: "chromium", headless: true },
        context: ctx,
      });
      const browserId = (launch.result as Record<string, unknown>)["browserId"] as string;

      await router.route({
        tool: "navigate_to_url",
        params: { browserId, url: `http://127.0.0.1:${htmlPort}/empty`, waitUntil: "networkidle" },
        context: ctx,
      });

      const result = await router.route({
        tool: "extract_table_data",
        params: { browserId, selector: "#empty" },
        context: ctx,
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data["headers"]).toEqual(["Col1", "Col2"]);
      expect(data["rows"]).toBe(0);
      expect(data["data"]).toEqual([]);
    } finally {
      await pool.cleanup();
    }
  });
});
