/**
 * Database migrations for Brooklyn MCP
 */

export interface Migration {
  version: number;
  name: string;
  up: string[];
}

/**
 * Migration 001: Initial schema
 * Embedded directly to avoid bundling issues
 */
const migration001 = [
  // Instances table
  `CREATE TABLE IF NOT EXISTS instances (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    type TEXT NOT NULL,
    scope TEXT NOT NULL,
    install_path TEXT NOT NULL,
    project_path TEXT,
    pid INTEGER,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP,
    first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_runs INTEGER DEFAULT 1,
    config JSON,
    active BOOLEAN DEFAULT 1
  )`,

  // Instance indexes
  "CREATE INDEX IF NOT EXISTS idx_instances_heartbeat ON instances(last_heartbeat)",
  "CREATE INDEX IF NOT EXISTS idx_instances_type_scope ON instances(type, scope)",
  "CREATE INDEX IF NOT EXISTS idx_instances_active ON instances(active)",

  // Screenshots table
  `CREATE TABLE IF NOT EXISTS screenshots (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    filename TEXT NOT NULL,
    session_id TEXT NOT NULL,
    browser_id TEXT NOT NULL,
    team_id TEXT,
    user_id TEXT,
    tag TEXT,
    format TEXT CHECK(format IN ('png', 'jpeg')),
    file_size INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    full_page BOOLEAN DEFAULT 0,
    quality INTEGER,
    hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    accessed_at DATETIME,
    metadata JSON,
    FOREIGN KEY (instance_id) REFERENCES instances(id)
  )`,

  // Screenshot indexes
  "CREATE INDEX IF NOT EXISTS idx_screenshots_instance_session ON screenshots(instance_id, session_id)",
  "CREATE INDEX IF NOT EXISTS idx_screenshots_team_created ON screenshots(team_id, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_screenshots_tag ON screenshots(tag)",
  "CREATE INDEX IF NOT EXISTS idx_screenshots_created ON screenshots(created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_screenshots_hash ON screenshots(hash)",

  // Audit logs table
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    tool TEXT NOT NULL,
    team_id TEXT,
    user_id TEXT,
    params JSON,
    result JSON,
    error TEXT,
    execution_time_ms INTEGER,
    FOREIGN KEY (instance_id) REFERENCES instances(id)
  )`,

  // Audit indexes
  "CREATE INDEX IF NOT EXISTS idx_audit_instance_timestamp ON audit_logs(instance_id, timestamp DESC)",
  "CREATE INDEX IF NOT EXISTS idx_audit_tool ON audit_logs(tool)",
  "CREATE INDEX IF NOT EXISTS idx_audit_team ON audit_logs(team_id)",
];

/**
 * All database migrations in order
 */
export const migrations: Migration[] = [
  {
    version: 1,
    name: "initial-schema",
    up: migration001,
  },
];

/**
 * Get migration by version
 */
export function getMigration(version: number): Migration | undefined {
  return migrations.find((m) => m.version === version);
}

/**
 * Get migrations after a specific version
 */
export function getMigrationsAfter(version: number): Migration[] {
  return migrations.filter((m) => m.version > version);
}
