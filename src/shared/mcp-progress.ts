import { randomUUID } from "node:crypto";
import type {
  CallToolRequest,
  CallToolResult,
  ProgressNotificationParams,
} from "@modelcontextprotocol/sdk/types.js";

export interface ProgressNotifier {
  notifyProgress: (progress: ProgressNotificationParams) => void;
}

export interface ProgressContext {
  progressToken?: string;
}

/**
 * No-op progress notifier for transports that don't wire streaming yet.
 */
export function createNoopProgressNotifier(): ProgressNotifier {
  return {
    notifyProgress: () => {},
  };
}

/**
 * Extract or generate a progress token for a tool request.
 */
export function getProgressContext(request: CallToolRequest): ProgressContext {
  const token = request.params._meta?.progressToken;
  if (token === undefined) {
    return {};
  }
  return { progressToken: String(token) };
}

/**
 * Attach minimal progress metadata to a CallToolResult if a token is present.
 */
export function attachProgressMetadata(
  result: CallToolResult,
  context: ProgressContext,
): CallToolResult {
  if (!context.progressToken) {
    return result;
  }
  const enriched = { ...result };
  if (!enriched.structuredContent) {
    enriched.structuredContent = {};
  }
  enriched.structuredContent["progressToken"] = context.progressToken;
  return enriched;
}

export function generateProgressToken(): string {
  return randomUUID();
}
