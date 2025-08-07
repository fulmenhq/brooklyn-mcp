/**
 * Database module exports
 * Central export point for all database-related functionality
 */

// Core database manager
export { getDatabaseManager, DatabaseManager } from "./database-manager.js";

// Instance ID generation
export { generateStableInstanceId, getStableInstanceId } from "./instance-id-generator.js";

// Repositories
export { ScreenshotRepository } from "./repositories/screenshot-repository.js";
export { ScreenshotRepositoryOptimized } from "./repositories/screenshot-repository-optimized.js";

// Background services
export { BackgroundSyncService } from "./background-sync-service.js";

// Performance utilities
export { PerformanceBenchmark } from "./performance-benchmark.js";
export { QueryCache, createCacheKey } from "./query-cache.js";

// Types
export type {
  ScreenshotRecord,
  ScreenshotQuery,
  ScreenshotListResult,
  DatabaseConfig,
} from "./types.js";
