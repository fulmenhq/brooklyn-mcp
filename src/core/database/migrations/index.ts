/**
 * Database migrations for Brooklyn MCP
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface Migration {
  version: number;
  name: string;
  up: string[];
}

/**
 * Load SQL migration file and split into statements
 */
function loadMigration(filename: string): string[] {
  const sql = readFileSync(join(__dirname, filename), "utf-8");
  
  // Split by semicolon but respect SQL statement boundaries
  // Filter out empty statements and comments
  return sql
    .split(/;\s*$/gm)
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0 && !stmt.startsWith("--"));
}

/**
 * All database migrations in order
 */
export const migrations: Migration[] = [
  {
    version: 1,
    name: "initial-schema",
    up: loadMigration("001-initial-schema.sql"),
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