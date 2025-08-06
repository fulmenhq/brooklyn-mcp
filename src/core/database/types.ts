/**
 * Database types for Brooklyn MCP
 */

export interface BrooklynInstance {
  id: string;
  displayName: string;
  type: "claude-code" | "vscode" | "cursor" | "cli" | "unknown";
  scope: "user" | "project" | "global";
  installPath: string;
  projectPath?: string;

  // Runtime info
  pid?: number;
  startedAt: Date;
  lastHeartbeat: Date;

  // Persistent info
  firstSeen: Date;
  lastSeen: Date;
  totalRuns: number;

  // State
  config?: Record<string, unknown>;
  active: boolean;
}

export interface ScreenshotRecord {
  id: string;
  instanceId: string;
  filePath: string;
  filename: string;
  sessionId: string;
  browserId: string;
  teamId?: string;
  userId?: string;
  tag?: string;
  format: "png" | "jpeg";
  fileSize: number;
  width?: number;
  height?: number;
  fullPage: boolean;
  quality?: number;
  hash: string;
  createdAt: Date;
  accessedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface AuditLog {
  id: number;
  instanceId: string;
  timestamp: Date;
  tool: string;
  teamId?: string;
  userId?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
  executionTimeMs?: number;
}

export interface DatabaseConfig {
  url: string;
  syncUrl?: string;
  authToken?: string;
  encryptionKey?: string;
  walMode?: boolean;
  busyTimeout?: number;
  maxConnections?: number;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: "ASC" | "DESC";
}

export interface ScreenshotQuery extends QueryOptions {
  instanceId?: string;
  sessionId?: string;
  teamId?: string;
  userId?: string;
  tag?: string;
  format?: "png" | "jpeg";
  startDate?: Date;
  endDate?: Date;
  maxAge?: number; // seconds
}

export interface ScreenshotListResult {
  items: ScreenshotRecord[];
  total: number;
  hasMore: boolean;
  nextOffset?: number;
}
