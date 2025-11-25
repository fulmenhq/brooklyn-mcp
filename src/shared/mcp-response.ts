import type { CallToolResult, ContentBlock } from "@modelcontextprotocol/sdk/types.js";

/**
 * Normalize arbitrary tool outputs into a CallToolResult compatible with MCP v1.22.
 * - Strings/numbers/booleans become a text content block
 * - Objects become structuredContent plus a text rendering for readability
 * - Existing CallToolResult shapes pass through with minimal wrapping
 */
export function normalizeCallToolResult(output: unknown): CallToolResult {
  // Pass through if already looks like a CallToolResult
  if (output && typeof output === "object" && "content" in (output as Record<string, unknown>)) {
    return output as CallToolResult;
  }

  const content: ContentBlock[] = [];
  let structuredContent: Record<string, unknown> | undefined;
  let isError: boolean | undefined;

  if (output && typeof output === "object") {
    // Preserve explicit isError flag if present
    if ("isError" in (output as Record<string, unknown>)) {
      const flag = (output as Record<string, unknown>)["isError"];
      if (typeof flag === "boolean") {
        isError = flag;
      }
    }

    structuredContent = output as Record<string, unknown>;
    try {
      content.push({ type: "text", text: JSON.stringify(output) });
    } catch {
      // fallback to generic string conversion
      content.push({ type: "text", text: String(output) });
    }
  } else if (typeof output === "string") {
    content.push({ type: "text", text: output });
  } else if (output === undefined || output === null) {
    content.push({ type: "text", text: "null" });
  } else {
    content.push({ type: "text", text: String(output) });
  }

  return {
    content,
    ...(structuredContent ? { structuredContent } : {}),
    ...(isError !== undefined ? { isError } : {}),
  };
}
