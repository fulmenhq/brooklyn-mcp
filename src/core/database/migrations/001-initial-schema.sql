-- Migration 001: Initial Schema
-- Brooklyn MCP Database Schema

-- Brooklyn instance registry (stable across restarts)
CREATE TABLE IF NOT EXISTS instances (
  id TEXT PRIMARY KEY,           -- Stable UUID5 from context
  display_name TEXT NOT NULL,    -- Human-readable like "claude-code-a3f2c891"
  type TEXT NOT NULL,            -- 'claude-code', 'vscode', 'cursor', 'cli'
  scope TEXT NOT NULL,           -- 'user', 'project', 'global'
  install_path TEXT NOT NULL,    -- Source for UUID5 generation
  project_path TEXT,             -- If project-scoped
  
  -- Runtime info (changes each run)
  pid INTEGER,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  -- Persistent across restarts
  first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
  total_runs INTEGER DEFAULT 1,
  
  -- Configuration and state
  config JSON,
  active BOOLEAN DEFAULT 1
);

-- Indexes for instance queries
CREATE INDEX IF NOT EXISTS idx_instances_heartbeat ON instances(last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_instances_type_scope ON instances(type, scope);
CREATE INDEX IF NOT EXISTS idx_instances_active ON instances(active);

-- Screenshots metadata cache
CREATE TABLE IF NOT EXISTS screenshots (
  id TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL,      -- Which Brooklyn instance created this
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
  
  -- Foreign key for cascade operations
  FOREIGN KEY (instance_id) REFERENCES instances(id)
);

-- Indexes for screenshot queries
CREATE INDEX IF NOT EXISTS idx_screenshots_instance_session ON screenshots(instance_id, session_id);
CREATE INDEX IF NOT EXISTS idx_screenshots_team_created ON screenshots(team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_screenshots_tag ON screenshots(tag);
CREATE INDEX IF NOT EXISTS idx_screenshots_created ON screenshots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_screenshots_hash ON screenshots(hash);

-- Audit logs for tool execution
CREATE TABLE IF NOT EXISTS audit_logs (
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
);

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_audit_instance_timestamp ON audit_logs(instance_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_tool ON audit_logs(tool);
CREATE INDEX IF NOT EXISTS idx_audit_team ON audit_logs(team_id);
