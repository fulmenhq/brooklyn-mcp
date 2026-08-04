import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ImageProcessingService } from "./image-processing-service.js";

describe("ImageProcessingService hostile SVG handling", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function compress(svg: string) {
    const dir = await mkdtemp(join(tmpdir(), "brooklyn-hostile-svg-"));
    tempDirs.push(dir);
    const inputPath = join(dir, "input.svg");
    const outputPath = join(dir, "output.svg");
    await writeFile(inputPath, svg, "utf8");

    const result = await new ImageProcessingService().compressSVG({
      filePath: inputPath,
      outputPath,
    });

    expect(result.success).toBe(true);
    return readFile(outputPath, "utf8");
  }

  it("removes scripts, event handlers, and javascript URLs", async () => {
    const output = await compress(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">' +
        '<script>alert(2)</script><a href="javascript:alert(3)"><text>x</text></a></svg>',
    );

    expect(output).not.toMatch(/<script|onload=|javascript:/i);
    expect(output).toContain("<text>x</text>");
  });

  it("rejects nested entity expansion without writing output", async () => {
    const dir = await mkdtemp(join(tmpdir(), "brooklyn-hostile-svg-"));
    tempDirs.push(dir);
    const inputPath = join(dir, "input.svg");
    const outputPath = join(dir, "output.svg");
    await writeFile(
      inputPath,
      `<!DOCTYPE svg [
        <!ENTITY a "1234567890">
        <!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">
        <!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">
        <!ENTITY d "&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;">
      ]><svg xmlns="http://www.w3.org/2000/svg"><text>&d;</text></svg>`,
      "utf8",
    );

    const result = await new ImageProcessingService().compressSVG({
      filePath: inputPath,
      outputPath,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/entity|parse/i);
    await expect(readFile(outputPath, "utf8")).rejects.toThrow();
  });
});
