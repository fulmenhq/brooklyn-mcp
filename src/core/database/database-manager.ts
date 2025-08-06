/**
 * Database Manager for Brooklyn MCP
 * Centralized database management with fail-fast behavior
 */

import { createClient, type Client, type ResultSet } from "@libsql/client";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { getLogger } from "../../shared/pino-logger.js";
import { getStableInstanceId, type InstanceContext } from "./instance-id-generator.js";
import type { BrooklynInstance, DatabaseConfig } from "./types.js";

// Initialize logger
const logger = getLogger("database-manager");

/**
 * Database initialization error
 */
export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly fatal: boolean = false,
  ) {
    super(message);
    this.name = "DatabaseError";
  }
}

/**
 * Singleton database manager with fail-fast behavior
 */
export class DatabaseManager {
  private static instance: DatabaseManager | null = null;
  private client: Client | null = null;
  private config: DatabaseConfig;
  private instanceId: string | null = null;
  private instanceContext: InstanceContext | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;

  private constructor(config?: Partial<DatabaseConfig>) {
    // Default configuration
    this.config = {
      url: config?.url || this.getDefaultDatabasePath(),
      walMode: config?.walMode ?? true,
      busyTimeout: config?.busyTimeout ?? 5000,
      maxConnections: config?.maxConnections ?? 10,
      ...config,
    };
  }

  /**
   * Get singleton instance
   */
  static async getInstance(config?: Partial<DatabaseConfig>): Promise<DatabaseManager> {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager(config);
      await DatabaseManager.instance.initialize();
    }
    return DatabaseManager.instance;
  }

  /**
   * Get default database path
   */
  private getDefaultDatabasePath(): string {
    const baseDir = join(homedir(), ".brooklyn");
    const dbPath = join(baseDir, "brooklyn.db");
    
    // Ensure directory exists
    if (!existsSync(baseDir)) {
      mkdirSync(baseDir, { recursive: true });
    }
    
    return `file:${dbPath}`;
  }

  /**
   * Initialize database with fail-fast behavior
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      logger.info("Initializing database", { url: this.config.url });

      // Create database client
      this.client = createClient({
        url: this.config.url,
        authToken: this.config.authToken,
      });

      // Test connection
      await this.testConnection();

      // Set WAL mode for concurrent access
      if (this.config.walMode) {
        await this.enableWALMode();
      }

      // Run migrations
      await this.runMigrations();

      // Register this instance
      await this.registerInstance();

      // Start heartbeat
      this.startHeartbeat();

      // Clean stale instances
      await this.cleanStaleInstances();

      this.isInitialized = true;
      logger.info("Database initialized successfully", {
        instanceId: this.instanceId,
      });
    } catch (error) {
      const dbError = new DatabaseError(
        `Failed to initialize database: ${error instanceof Error ? error.message : String(error)}`,
        "DB_INIT_FAILED",
        true,
      );
      logger.error("Database initialization failed", { error: dbError });
      throw dbError;
    }
  }

  /**
   * Test database connection
   */
  private async testConnection(): Promise<void> {
    if (!this.client) throw new DatabaseError("Client not initialized", "NO_CLIENT", true);

    try {
      const result = await this.client.execute("SELECT 1 as test");
      if (!result.rows || result.rows.length === 0) {
        throw new Error("Connection test returned no results");
      }
    } catch (error) {
      throw new DatabaseError(
        `Database connection test failed: ${error instanceof Error ? error.message : String(error)}`,
        "CONNECTION_FAILED",
        true,
      );
    }
  }

  /**
   * Enable WAL mode for concurrent access
   */
  private async enableWALMode(): Promise<void> {
    if (!this.client) return;

    try {
      await this.client.execute("PRAGMA journal_mode = WAL");
      await this.client.execute(`PRAGMA busy_timeout = ${this.config.busyTimeout}`);
      logger.debug("WAL mode enabled");
    } catch (error) {
      logger.warn("Failed to enable WAL mode", { error });
      // Non-fatal - continue without WAL
    }
  }

  /**
   * Run database migrations
   */
  private async runMigrations(): Promise<void> {
    if (!this.client) throw new DatabaseError("Client not initialized", "NO_CLIENT", true);

    try {
      // Create migrations table if not exists
      await this.client.execute(`
        CREATE TABLE IF NOT EXISTS migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          version INTEGER NOT NULL UNIQUE,
          name TEXT NOT NULL,
          applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Get current version
      const result = await this.client.execute(
        "SELECT MAX(version) as version FROM migrations",
      );
      const currentVersion = (result.rows[0]?.["version"] as number) || 0;

      // Import and run migrations
      const { migrations } = await import("./migrations/index.js");
      
      for (const migration of migrations) {
        if (migration.version > currentVersion) {
          logger.info(`Running migration ${migration.version}: ${migration.name}`);
          
          // Run migration in transaction
          await this.client.batch(migration.up);
          
          // Record migration
          await this.client.execute(
            "INSERT INTO migrations (version, name) VALUES (?, ?)",
            [migration.version, migration.name],
          );
        }
      }
    } catch (error) {
      throw new DatabaseError(
        `Migration failed: ${error instanceof Error ? error.message : String(error)}`,
        "MIGRATION_FAILED",
        true,
      );
    }
  }

  /**
   * Register this Brooklyn instance
   */
  private async registerInstance(): Promise<void> {
    if (!this.client) return;

    try {
      const { id, displayName, context } = await getStableInstanceId();
      this.instanceId = id;
      this.instanceContext = context;

      // Upsert instance record
      await this.client.execute(`
        INSERT INTO instances (
          id, display_name, type, scope, install_path, project_path,
          pid, started_at, last_heartbeat, first_seen, last_seen, total_runs, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 
                  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1, 1)
        ON CONFLICT(id) DO UPDATE SET
          pid = excluded.pid,
          started_at = CURRENT_TIMESTAMP,
          last_heartbeat = CURRENT_TIMESTAMP,
          last_seen = CURRENT_TIMESTAMP,
          total_runs = total_runs + 1,
          active = 1
      `, [
        id,
        displayName,
        context.type,
        context.scope,
        context.installPath,
        context.projectPath || null,
        process.pid,
      ]);

      logger.info("Instance registered", {
        instanceId: id,
        displayName,
        type: context.type,
      });
    } catch (error) {
      logger.error("Failed to register instance", { error });
      // Non-fatal - continue without registration
    }
  }

  /**
   * Start heartbeat to keep instance active
   */
  private startHeartbeat(): void {
    if (!this.instanceId || !this.client) return;

    // Update heartbeat every 30 seconds
    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.client?.execute(
          "UPDATE instances SET last_heartbeat = CURRENT_TIMESTAMP WHERE id = ?",
          [this.instanceId],
        );
      } catch (error) {
        logger.debug("Heartbeat update failed", { error });
      }
    }, 30000);
  }

  /**
   * Clean stale instances (no heartbeat > 5 minutes)
   */
  private async cleanStaleInstances(): Promise<void> {
    if (!this.client) return;

    try {
      const result = await this.client.execute(`
        UPDATE instances 
        SET active = 0 
        WHERE last_heartbeat < datetime('now', '-5 minutes') 
        AND active = 1
        RETURNING id, display_name
      `);

      if (result.rows.length > 0) {
        logger.info("Cleaned stale instances", {
          count: result.rows.length,
          instances: result.rows.map((row) => row["display_name"]),
        });
      }
    } catch (error) {
      logger.debug("Failed to clean stale instances", { error });
      // Non-fatal - continue
    }
  }

  /**
   * Execute a query with fail-fast behavior
   */
  async execute(sql: string, params?: any[]): Promise<ResultSet> {
    if (!this.client) {
      throw new DatabaseError("Database not initialized", "NOT_INITIALIZED", true);
    }

    try {
      return await this.client.execute({ sql, args: params || [] });
    } catch (error) {
      throw new DatabaseError(
        `Query execution failed: ${error instanceof Error ? error.message : String(error)}`,
        "QUERY_FAILED",
        false,
      );
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction(queries: Array<{ sql: string; params?: any[] }>): Promise<ResultSet[]> {
    if (!this.client) {
      throw new DatabaseError("Database not initialized", "NOT_INITIALIZED", true);
    }

    try {
      const statements = queries.map((q) => ({
        sql: q.sql,
        args: q.params || [],
      }));
      return await this.client.batch(statements);
    } catch (error) {
      throw new DatabaseError(
        `Transaction failed: ${error instanceof Error ? error.message : String(error)}`,
        "TRANSACTION_FAILED",
        false,
      );
    }
  }

  /**
   * Get current instance ID
   */
  getInstanceId(): string | null {
    return this.instanceId;
  }

  /**
   * Get current instance context
   */
  getInstanceContext(): InstanceContext | null {
    return this.instanceContext;
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.client && this.instanceId) {
      try {
        // Mark instance as inactive
        await this.client.execute(
          "UPDATE instances SET active = 0, last_heartbeat = CURRENT_TIMESTAMP WHERE id = ?",
          [this.instanceId],
        );
      } catch (error) {
        logger.debug("Failed to mark instance inactive", { error });
      }

      this.client.close();
      this.client = null;
    }

    this.isInitialized = false;
    DatabaseManager.instance = null;
    logger.info("Database connection closed");
  }

  /**
   * Check if database is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.testConnection();
      return true;
    } catch {
      return false;
    }
  }
}

// Export lazy initialization helper
let dbManager: DatabaseManager | null = null;

export async function getDatabaseManager(
  config?: Partial<DatabaseConfig>,
): Promise<DatabaseManager> {
  if (!dbManager) {
    dbManager = await DatabaseManager.getInstance(config);
  }
  return dbManager;
}