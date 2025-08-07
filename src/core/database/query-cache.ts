/**
 * Query Cache with TTL for screenshot repository optimization
 * Part of Phase 3: Performance & Caching implementation
 */

import { getLogger } from "../../shared/pino-logger.js";

// Lazy logger initialization
let logger: ReturnType<typeof getLogger> | null = null;
function ensureLogger() {
  if (!logger) {
    logger = getLogger("query-cache");
  }
  return logger;
}

interface CacheEntry<T> {
  data: T;
  expires: number;
  hits: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
}

/**
 * Generic query cache with TTL and statistics
 * Optimized for screenshot query performance
 */
export class QueryCache<T = unknown> {
  private cache = new Map<string, CacheEntry<T>>();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    size: 0,
  };
  private maxSize: number;
  private ttl: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(options: { ttl?: number; maxSize?: number; cleanupIntervalMs?: number } = {}) {
    this.ttl = options.ttl || 60000; // Default 1 minute
    this.maxSize = options.maxSize || 100; // Default 100 entries

    // Start cleanup interval
    const cleanupIntervalMs = options.cleanupIntervalMs || 30000; // Default 30 seconds
    this.startCleanupInterval(cleanupIntervalMs);
  }

  /**
   * Get cached value by key
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      ensureLogger().debug("Cache miss", { key });
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      this.stats.evictions++;
      this.stats.misses++;
      this.stats.size--;
      ensureLogger().debug("Cache entry expired", { key });
      return null;
    }

    // Update hit count and stats
    entry.hits++;
    this.stats.hits++;
    ensureLogger().debug("Cache hit", { key, hits: entry.hits });

    return entry.data;
  }

  /**
   * Set cached value with TTL
   */
  set(key: string, data: T, customTtl?: number): void {
    // Check size limit
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    const ttl = customTtl || this.ttl;
    const entry: CacheEntry<T> = {
      data,
      expires: Date.now() + ttl,
      hits: 0,
    };

    const isNew = !this.cache.has(key);
    this.cache.set(key, entry);

    if (isNew) {
      this.stats.size++;
    }

    ensureLogger().debug("Cache set", { key, ttl, size: this.stats.size });
  }

  /**
   * Invalidate cache entry
   */
  invalidate(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.size--;
      ensureLogger().debug("Cache invalidated", { key });
    }
    return deleted;
  }

  /**
   * Invalidate entries matching pattern
   */
  invalidatePattern(pattern: string | RegExp): number {
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    let count = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        if (this.invalidate(key)) {
          count++;
        }
      }
    }

    if (count > 0) {
      ensureLogger().info("Cache pattern invalidated", { pattern: pattern.toString(), count });
    }

    return count;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.stats.size = 0;
    this.stats.evictions += size;
    ensureLogger().info("Cache cleared", { entriesCleared: size });
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats & { hitRate: number } {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;

    return {
      ...this.stats,
      hitRate,
    };
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let minHits = Number.POSITIVE_INFINITY;
    let oldestExpiry = Number.POSITIVE_INFINITY;

    // Find LRU entry (least hits, oldest expiry)
    for (const [key, entry] of this.cache.entries()) {
      if (entry.hits < minHits || (entry.hits === minHits && entry.expires < oldestExpiry)) {
        lruKey = key;
        minHits = entry.hits;
        oldestExpiry = entry.expires;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.stats.evictions++;
      this.stats.size--;
      ensureLogger().debug("Cache LRU evicted", { key: lruKey, hits: minHits });
    }
  }

  /**
   * Start periodic cleanup of expired entries
   */
  private startCleanupInterval(intervalMs: number): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpired();
    }, intervalMs);
  }

  /**
   * Clean up expired entries
   */
  private cleanupExpired(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expires) {
        this.cache.delete(key);
        this.stats.evictions++;
        this.stats.size--;
        cleaned++;
      }
    }

    if (cleaned > 0) {
      ensureLogger().debug("Cache cleanup", { expiredEntries: cleaned });
    }
  }

  /**
   * Stop cleanup interval (for graceful shutdown)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}

/**
 * Create cache key from query parameters
 */
export function createCacheKey(prefix: string, params: Record<string, unknown>): string {
  const sortedKeys = Object.keys(params).sort();
  const keyParts = [prefix];

  for (const key of sortedKeys) {
    const value = params[key];
    if (value !== undefined && value !== null) {
      keyParts.push(`${key}:${JSON.stringify(value)}`);
    }
  }

  return keyParts.join("|");
}
