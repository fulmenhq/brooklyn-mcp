/**
 * Isolate Playwright SVG rendering from the network.
 *
 * javaScriptEnabled:false is not enough: SVG image/CSS/filter URLs can still
 * trigger Chromium fetches. Abort non-local requests and pin a restrictive CSP.
 */

export const SVG_RENDER_CSP =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; media-src 'none'; connect-src 'none'; script-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";

export interface PlaywrightRouteLike {
  request(): { url(): string };
  continue(): Promise<unknown>;
  abort(errorCode?: string): Promise<unknown>;
}

export interface PlaywrightPageLike {
  route(
    url: string,
    handler: (route: PlaywrightRouteLike) => Promise<unknown> | unknown,
  ): Promise<unknown>;
}

export function isAllowedSvgRenderRequestUrl(url: string): boolean {
  return url.startsWith("about:") || url.startsWith("data:") || url.startsWith("blob:");
}

export function wrapSvgForIsolatedRender(svgContent: string, bgStyle: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${SVG_RENDER_CSP}"></head><body style="margin:0;${bgStyle}">${svgContent}</body></html>`;
}

export async function abortNonLocalPlaywrightRequests(page: PlaywrightPageLike): Promise<void> {
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (isAllowedSvgRenderRequestUrl(url)) {
      await route.continue();
      return;
    }
    await route.abort("blockedbyclient");
  });
}
