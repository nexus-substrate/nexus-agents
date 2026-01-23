/**
 * nexus-agents/cli-adapters - Response Cache Types
 *
 * Type definitions for CLI response caching layer.
 * Supports LRU eviction, TTL expiration, and memory bounds.
 *
 * @module cli-adapters/response-cache-types
 * (Source: Issue #358)
 */

import { z } from 'zod';

/**
 * Cache entry with TTL and hit tracking.
 * Readonly to prevent mutation of cached data.
 */
export interface CacheEntry<T> {
  /** The cached value */
  readonly value: T;
  /** When this entry was created (Unix timestamp ms) */
  readonly createdAt: number;
  /** When this entry expires (Unix timestamp ms) */
  readonly expiresAt: number;
  /** Number of times this entry has been accessed */
  readonly hits: number;
  /** Estimated size in bytes for memory tracking */
  readonly sizeBytes: number;
}

/**
 * Configuration for the response cache.
 */
export interface ResponseCacheConfig {
  /** Default TTL in milliseconds (default: 5 minutes) */
  readonly defaultTTL: number;
  /** Maximum number of entries before LRU eviction (default: 1000) */
  readonly maxEntries: number;
  /** Maximum memory usage in megabytes (default: 50) */
  readonly maxMemoryMB: number;
  /** Cleanup interval in milliseconds (default: 1 minute) */
  readonly cleanupInterval: number;
  /** Whether to log cache operations (default: false) */
  readonly enableLogging: boolean;
}

/**
 * Zod schema for cache configuration validation.
 */
export const ResponseCacheConfigSchema = z.object({
  defaultTTL: z.number().min(1000).max(3600_000).default(300_000), // 5 minutes
  maxEntries: z.number().min(10).max(100_000).default(1000),
  maxMemoryMB: z.number().min(1).max(1000).default(50),
  cleanupInterval: z.number().min(1000).max(600_000).default(60_000), // 1 minute
  enableLogging: z.boolean().default(false),
});

/**
 * Default cache configuration.
 */
export const DEFAULT_RESPONSE_CACHE_CONFIG: ResponseCacheConfig = {
  defaultTTL: 300_000, // 5 minutes
  maxEntries: 1000,
  maxMemoryMB: 50,
  cleanupInterval: 60_000, // 1 minute
  enableLogging: false,
};

/**
 * Statistics for cache observability.
 */
export interface ResponseCacheStats {
  /** Current number of entries */
  readonly entries: number;
  /** Total cache hits */
  readonly hits: number;
  /** Total cache misses */
  readonly misses: number;
  /** Hit rate (0-1) */
  readonly hitRate: number;
  /** Estimated memory usage in bytes */
  readonly memoryUsedBytes: number;
  /** Number of entries evicted due to LRU */
  readonly evictionsLRU: number;
  /** Number of entries evicted due to TTL */
  readonly evictionsTTL: number;
  /** Number of entries evicted due to memory pressure */
  readonly evictionsMemory: number;
  /** When the cache was created */
  readonly createdAt: Date;
  /** When stats were last updated */
  readonly lastUpdated: Date;
}

/**
 * Interface for response cache.
 * Supports generics for type-safe caching.
 */
export interface IResponseCache {
  /**
   * Gets a cached value by key.
   * Returns undefined if not found or expired.
   */
  get(key: string): unknown;

  /**
   * Sets a value in the cache with optional TTL.
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - TTL in milliseconds (uses default if not specified)
   */
  set(key: string, value: unknown, ttl?: number): void;

  /**
   * Checks if a key exists and is not expired.
   */
  has(key: string): boolean;

  /**
   * Deletes a specific key from the cache.
   * @returns true if the key existed
   */
  delete(key: string): boolean;

  /**
   * Clears all entries from the cache.
   */
  clear(): void;

  /**
   * Gets cache statistics.
   */
  stats(): ResponseCacheStats;

  /**
   * Stops background cleanup and releases resources.
   */
  dispose(): void;
}

/**
 * Options for the withCache helper.
 */
export interface WithCacheOptions {
  /** Cache key */
  readonly key: string;
  /** TTL in milliseconds */
  readonly ttl?: number;
  /** Whether to skip caching on error */
  readonly skipOnError?: boolean;
}

/**
 * Options for generating cache keys.
 */
export interface CacheKeyOptions {
  /** Adapter name (claude, gemini, codex) */
  readonly adapter: string;
  /** The prompt or task content */
  readonly prompt: string;
  /** Additional options that affect the response */
  readonly options?: Record<string, unknown>;
}

/**
 * Error thrown for cache operations.
 */
export class ResponseCacheError extends Error {
  constructor(
    message: string,
    public readonly code: ResponseCacheErrorCode
  ) {
    super(message);
    this.name = 'ResponseCacheError';
  }
}

/**
 * Error codes for cache operations.
 */
export type ResponseCacheErrorCode =
  | 'MEMORY_EXCEEDED'
  | 'INVALID_KEY'
  | 'SERIALIZATION_ERROR'
  | 'DISPOSED';
