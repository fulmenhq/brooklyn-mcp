/**
 * Instance ID Generator for Brooklyn MCP
 * Generates stable UUID5 IDs based on installation context
 */

import { createHash } from "node:crypto";

export interface InstanceContext {
  type: "claude-code" | "vscode" | "cursor" | "cli" | "unknown";
  scope: "user" | "project" | "global";
  installPath: string;
  projectPath?: string;
}

/**
 * Generate a stable UUID5 from installation context
 * Same context will always generate the same ID
 */
export function generateStableInstanceId(context: InstanceContext): string {
  // UUID namespace for Brooklyn instances (DNS namespace)
  const DNS_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

  // Create deterministic name from context
  const name = [
    "brooklyn",
    context.type,
    context.scope,
    context.installPath,
    context.projectPath || "global",
  ].join(":");

  // Generate UUID5 using SHA-1
  const hash = createHash("sha1");

  // Add namespace bytes (remove hyphens first)
  const namespaceBytes = DNS_NAMESPACE.replace(/-/g, "");
  hash.update(Buffer.from(namespaceBytes, "hex"));
  hash.update(name, "utf8");

  const hashBytes = hash.digest();

  // Format as UUID5 (version 5, variant 10)
  // We know hashBytes is 20 bytes from SHA-1, so these accesses are safe
  const byte6 = hashBytes[6] ?? 0;
  const byte7 = hashBytes[7] ?? 0;
  const byte8 = hashBytes[8] ?? 0;
  const byte9 = hashBytes[9] ?? 0;

  const uuid = [
    hashBytes.subarray(0, 4).toString("hex"),
    hashBytes.subarray(4, 6).toString("hex"),
    // Version 5 in bits 12-15
    ((byte6 & 0x0f) | 0x50).toString(16) + byte7.toString(16),
    // Variant 10 in bits 6-7 of byte 8
    ((byte8 & 0x3f) | 0x80).toString(16) + byte9.toString(16),
    hashBytes.subarray(10, 16).toString("hex"),
  ].join("-");

  return uuid;
}

/**
 * Generate a human-readable instance identifier
 * Combines type with short hash for easy identification
 */
export function generateReadableInstanceId(context: InstanceContext): string {
  const input = `${context.type}:${context.scope}:${context.installPath}`;
  const hash = createHash("sha256").update(input).digest("hex");
  return `${context.type}-${hash.substring(0, 8)}`;
}

/**
 * Detect the current execution context
 * Determines if running in Claude Code, VSCode, CLI, etc.
 */
export async function detectInstanceContext(): Promise<InstanceContext> {
  // Check for MCP environment variables (Claude Code)
  if (process.env["MCP_SERVER_NAME"] === "brooklyn") {
    const scope = (process.env["MCP_SCOPE"] as "user" | "project") || "user";
    const installPath = process.env["MCP_INSTALL_PATH"] || process.cwd();

    return {
      type: "claude-code",
      scope,
      installPath,
      projectPath: scope === "project" ? process.cwd() : undefined,
    };
  }

  // Check for VSCode/Cursor environment
  if (process.env["TERM_PROGRAM"] === "vscode") {
    return {
      type: "vscode",
      scope: "project",
      installPath: process.cwd(),
      projectPath: process.cwd(),
    };
  }

  if (process.env["CURSOR_EDITOR"]) {
    return {
      type: "cursor",
      scope: "project",
      installPath: process.cwd(),
      projectPath: process.cwd(),
    };
  }

  // Check parent process for additional detection
  try {
    const ppid = process.ppid;
    if (ppid) {
      // Could enhance with process name detection
      // For now, assume CLI
    }
  } catch {
    // Process detection not available
  }

  // Default to CLI mode
  return {
    type: "cli",
    scope: "global",
    installPath: process.argv[1] || process.cwd(),
  };
}

/**
 * Get or create stable instance ID for current process
 */
let cachedInstanceId: string | null = null;
let cachedDisplayName: string | null = null;

export async function getStableInstanceId(): Promise<{
  id: string;
  displayName: string;
  context: InstanceContext;
}> {
  if (cachedInstanceId && cachedDisplayName) {
    return {
      id: cachedInstanceId,
      displayName: cachedDisplayName,
      context: await detectInstanceContext(),
    };
  }

  const context = await detectInstanceContext();
  cachedInstanceId = generateStableInstanceId(context);
  cachedDisplayName = generateReadableInstanceId(context);

  return {
    id: cachedInstanceId,
    displayName: cachedDisplayName,
    context,
  };
}
