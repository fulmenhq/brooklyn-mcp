/**
 * Integration test: paginate_table navigates through multi-page tables.
 *
 * Serves an HTML page with a table and "Next" button that swaps table content
 * via JavaScript. Verifies data is collected across pages and deduplicated.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MCPBrowserRouter } from "../../src/core/browser/mcp-browser-router.js";
import { MCPRequestContextFactory } from "../../src/core/browser/mcp-request-context.js";
import { BrowserPoolManager } from "../../src/core/browser-pool-manager.js";

let htmlServer: Server;
let htmlPort: number;

function makeContext(teamId = "test-paginate") {
  return MCPRequestContextFactory.create({
    teamId,
    userId: "integration-test",
    metadata: { permissions: ["browser.launch", "browser.navigate"] },
  });
}

const paginatedPage = `<html><body>
<table id="data-table">
  <thead><tr><th>ID</th><th>Name</th></tr></thead>
  <tbody id="table-body">
    <tr><td>1</td><td>Alice</td></tr>
    <tr><td>2</td><td>Bob</td></tr>
  </tbody>
</table>
<button id="next-btn" onclick="nextPage()">Next</button>
<script>
  let currentPage = 1;
  const pages = [
    [["1","Alice"],["2","Bob"]],
    [["3","Charlie"],["4","Dave"]],
    [["5","Eve"]]
  ];
  function nextPage() {
    currentPage++;
    if (currentPage > pages.length) {
      document.getElementById("next-btn").disabled = true;
      return;
    }
    const tbody = document.getElementById("table-body");
    const rows = pages[currentPage - 1];
    tbody.innerHTML = rows.map(r => "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>").join("");
    if (currentPage >= pages.length) {
      document.getElementById("next-btn").disabled = true;
    }
  }
</script>
</body></html>`;

const singlePage = `<html><body>
<table id="single-table">
  <thead><tr><th>Item</th></tr></thead>
  <tbody><tr><td>Only Row</td></tr></tbody>
</table>
<button id="next-btn" style="display:none">Next</button>
</body></html>`;

beforeAll(async () => {
  htmlServer = createServer((_req: IncomingMessage, res: ServerResponse) => {
    const url = _req.url || "";
    if (url.includes("single")) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(singlePage);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(paginatedPage);
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

describe("paginate_table integration", () => {
  it("should collect data across multiple pages", async () => {
    const pool = new BrowserPoolManager({ mcpMode: true });
    await pool.initialize();
    const router = new MCPBrowserRouter(pool);
    const ctx = makeContext("team-paginate");

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
          url: `http://127.0.0.1:${htmlPort}/paginated`,
          waitUntil: "networkidle",
        },
        context: ctx,
      });

      const result = await router.route({
        tool: "paginate_table",
        params: {
          browserId,
          tableSelector: "#data-table",
          nextButton: "#next-btn",
          maxPages: 10,
        },
        context: ctx,
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data["pages"]).toBe(3);

      const allData = data["allData"] as Record<string, string>[];
      expect(allData.length).toBe(5);
      expect(allData[0]).toEqual({ ID: "1", Name: "Alice" });
      expect(allData[1]).toEqual({ ID: "2", Name: "Bob" });
      expect(allData[2]).toEqual({ ID: "3", Name: "Charlie" });
      expect(allData[3]).toEqual({ ID: "4", Name: "Dave" });
      expect(allData[4]).toEqual({ ID: "5", Name: "Eve" });
    } finally {
      await pool.cleanup();
    }
  });

  it("should stop when next button is hidden", async () => {
    const pool = new BrowserPoolManager({ mcpMode: true });
    await pool.initialize();
    const router = new MCPBrowserRouter(pool);
    const ctx = makeContext("team-single");

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
          url: `http://127.0.0.1:${htmlPort}/single`,
          waitUntil: "networkidle",
        },
        context: ctx,
      });

      const result = await router.route({
        tool: "paginate_table",
        params: {
          browserId,
          tableSelector: "#single-table",
          nextButton: "#next-btn",
        },
        context: ctx,
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data["pages"]).toBe(1);
      expect(data["totalRows"]).toBe(1);
      // No limit hit — maxPagesReached should not be present
      expect(data["maxPagesReached"]).toBeUndefined();
    } finally {
      await pool.cleanup();
    }
  });

  it("should respect maxPages limit", async () => {
    const pool = new BrowserPoolManager({ mcpMode: true });
    await pool.initialize();
    const router = new MCPBrowserRouter(pool);
    const ctx = makeContext("team-maxpages");

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
          url: `http://127.0.0.1:${htmlPort}/paginated`,
          waitUntil: "networkidle",
        },
        context: ctx,
      });

      // Limit to 2 pages (table has 3)
      const result = await router.route({
        tool: "paginate_table",
        params: {
          browserId,
          tableSelector: "#data-table",
          nextButton: "#next-btn",
          maxPages: 2,
        },
        context: ctx,
      });

      expect(result.success).toBe(true);
      const data = result.result as Record<string, unknown>;
      expect(data["pages"]).toBe(2);
      // Should have data from pages 1 and 2 only
      const allData = data["allData"] as Record<string, string>[];
      expect(allData.length).toBe(4);
      // maxPagesReached should be flagged since more pages exist
      expect(data["maxPagesReached"]).toBe(true);
    } finally {
      await pool.cleanup();
    }
  });
});
