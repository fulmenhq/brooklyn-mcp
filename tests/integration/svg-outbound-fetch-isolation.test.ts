/**
 * Playwright regression: SVG-to-PNG must not fetch hostile remote URLs.
 * Local canary only — no external network.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ImageProcessingService } from "../../src/core/image/image-processing-service.js";

function startCanary(): Promise<{
  server: Server;
  origin: string;
  hits: Array<{ method: string; url: string }>;
}> {
  const hits: Array<{ method: string; url: string }> = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    hits.push({ method: req.method || "GET", url: req.url || "/" });
    res.statusCode = 204;
    res.end();
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({ server, origin: `http://127.0.0.1:${addr.port}`, hits });
    });
  });
}

describe("SVG outbound-fetch isolation (Playwright)", () => {
  let canary: Awaited<ReturnType<typeof startCanary>>;
  let workDir: string;

  beforeAll(async () => {
    canary = await startCanary();
    workDir = mkdtempSync(join(tmpdir(), "brooklyn-svg-canary-"));
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      canary.server.close((err) => (err ? reject(err) : resolve()));
    });
    rmSync(workDir, { recursive: true, force: true });
  });

  it("renders a hostile SVG without the local canary seeing any request", async () => {
    const svgPath = join(workDir, "hostile.svg");
    const pngPath = join(workDir, "hostile.png");
    const o = canary.origin;
    writeFileSync(
      svgPath,
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="16" height="16">
  <image href="${o}/canary.png" width="16" height="16"/>
  <image xlink:href="${o}/canary-xlink.png" width="16" height="16"/>
  <filter id="f"><feImage href="${o}/canary-filter.png"/></filter>
  <rect width="16" height="16" fill="red" filter="url(#f)" style="fill:url(${o}/canary-css.png)"/>
</svg>`,
      "utf8",
    );

    const before = canary.hits.length;
    const service = new ImageProcessingService();
    const result = await service.convertSVGToPNG({
      svgPath,
      outputPath: pngPath,
      options: { width: 16, height: 16 },
    });

    expect(result.success).toBe(true);
    expect(canary.hits.slice(before)).toEqual([]);
  }, 30000);
});
