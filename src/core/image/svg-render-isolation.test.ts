import { describe, expect, it } from "vitest";

import {
  isAllowedSvgRenderRequestUrl,
  SVG_RENDER_CSP,
  wrapSvgForIsolatedRender,
} from "./svg-render-isolation.js";

describe("svg-render-isolation", () => {
  it("allows only about/data/blob URLs", () => {
    expect(isAllowedSvgRenderRequestUrl("about:blank")).toBe(true);
    expect(isAllowedSvgRenderRequestUrl("data:image/svg+xml,...")).toBe(true);
    expect(isAllowedSvgRenderRequestUrl("blob:https://localhost/x")).toBe(true);
    expect(isAllowedSvgRenderRequestUrl("https://evil.example/x.png")).toBe(false);
    expect(isAllowedSvgRenderRequestUrl("http://127.0.0.1/x.png")).toBe(false);
    expect(isAllowedSvgRenderRequestUrl("file:///etc/passwd")).toBe(false);
  });

  it("wraps SVG with a restrictive CSP without dropping the payload", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png"/></svg>';
    const html = wrapSvgForIsolatedRender(svg, "background:transparent;");
    expect(html).toContain(`content="${SVG_RENDER_CSP}"`);
    expect(SVG_RENDER_CSP).toContain("default-src 'none'");
    expect(SVG_RENDER_CSP).toContain("connect-src 'none'");
    expect(html).toContain('href="https://evil.example/x.png"');
  });
});
