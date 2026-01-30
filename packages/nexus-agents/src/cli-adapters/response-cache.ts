/**
 * nexus-agents/cli-adapters - Response Cache
 *
 * In-memory cache for CLI responses with LRU eviction,
 * TTL expiration, and memory bounds.
 *
 * @module cli-adapters/response-cache
 * (Source: Issue #358)
 */

import { createLogger } from '../core/logger.js';
import type { ILogger } from '../core/index.js';
import { getTimeProvider } from '../core/index.js';
import type {
  CacheEntry,
  ResponseCacheConfig,
  ResponseCacheStats,
  IResponseCache,
  WithCacheOptions,
} from './response-cache-types.js';
import {
  ResponseCacheConfigSchema,
  DEFAULT_RESPONSE_CACHE_CONFIG,
  ResponseCacheError,
} from './response-cache-types.js';
import { estimateSize } from './response-cache-utils.js';

/**
 * In-memory response cache with LRU eviction and TTL.
 *
 * Thread-safe for Node.js single-threaded async execution.
 * Implements automatic cleanup of expired entries.
 */
export class InMemoryResponseCache implements IResponseCache {
  private readonly config: ResponseCacheConfig;
  private readonly logger: ILogger;
  private readonly cache: Map<string, CacheEntry<unknown>> = new Map();
  /**
   * Tracks LRU order using Map's insertion order property.
   * When a key is accessed, it's deleted and re-inserted to move to "most recent" end.
   * First key in iteration is always LRU - enables O(1) findLRUKey.
   * @see Issue #408 - Performance optimization
   */
  private readonly lruOrder: Map<string, true> = new Map();

  private hits = 0;
  private misses = 0;
  private evictionsLRU = 0;
  private evictionsTTL = 0;
  private evictionsMemory = 0;
  private memoryUsedBytes = 0;
  private disposed = false;
  private cleanupTimer: NodeJS.Timeout | undefined;
  private readonly createdAt: Date = new Date(getTimeProvider().now());

  constructor(config?: Partial<ResponseCacheConfig>, logger?: ILogger) {
    const validated = ResponseCacheConfigSchema.parse({
      ...DEFAULT_RESPONSE_CACHE_CONFIG,
      ...config,
    });
    this.config = validated;
    this.logger = logger ?? createLogger({ component: 'ResponseCache' });

    this.startCleanupTimer();
    this.logIfEnabled('Cache initialized', { config: this.config });
  }

  get(key: string): unknown {
    this.ensureNotDisposed();
    const entry = this.cache.get(key);

    if (entry === undefined) {
      this.misses++;
      this.logIfEnabled('Cache miss', { key });
      return undefined;
    }

    if (this.isExpired(entry)) {
      this.deleteEntry(key, 'ttl');
      this.misses++;
      this.logIfEnabled('Cache expired', { key });
      return undefined;
    }

    // Update access order and hits
    this.updateAccessOrder(key);
    this.updateEntryHits(key, entry);
    this.hits++;
    this.logIfEnabled('Cache hit', { key, hits: entry.hits + 1 });

    return entry.value;
  }

  set(key: string, value: unknown, ttl?: number): void {
    this.ensureNotDisposed();
    const effectiveTTL = ttl ?? this.config.defaultTTL;
    const now = getTimeProvider().now();
    const sizeBytes = estimateSize(value);

    // Check memory before adding
    this.evictForMemory(sizeBytes);

    // Check entry count
    this.evictLRUIfNeeded();

    const entry: CacheEntry<unknown> = {
      value,
      createdAt: now,
      expiresAt: now + effectiveTTL,
      hits: 0,
      sizeBytes,
    };

    // Remove old entry size if exists
    const existing = this.cache.get(key);
    if (existing !== undefined) {
      this.memoryUsedBytes -= existing.sizeBytes;
    }

    this.cache.set(key, entry);
    this.updateAccessOrder(key);
    this.memoryUsedBytes += sizeBytes;

    this.logIfEnabled('Cache set', { key, ttl: effectiveTTL, sizeBytes });
  }

  has(key: string): boolean {
    this.ensureNotDisposed();
    const entry = this.cache.get(key);
    if (entry === undefined) return false;
    if (this.isExpired(entry)) {
      this.deleteEntry(key, 'ttl');
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    this.ensureNotDisposed();
    return this.deleteEntry(key, 'manual');
  }

  clear(): void {
    this.ensureNotDisposed();
    this.cache.clear();
    this.lruOrder.clear();
    this.memoryUsedBytes = 0;
    this.logIfEnabled('Cache cleared');
  }

  stats(): ResponseCacheStats {
    const total = this.hits + this.misses;
    return {
      entries: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      memoryUsedBytes: this.memoryUsedBytes,
      evictionsLRU: this.evictionsLRU,
      evictionsTTL: this.evictionsTTL,
      evictionsMemory: this.evictionsMemory,
      createdAt: this.createdAt,
      lastUpdated: new Date(getTimeProvider().now()),
    };
  }

  dispose(): void {
    if (this.disposed) return;

    this.disposed = true;
    if (this.cleanupTimer !== undefined) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.cache.clear();
    this.lruOrder.clear();
    this.logIfEnabled('Cache disposed');
  }

  /**
   * Resets cache statistics without clearing entries.
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictionsLRU = 0;
    this.evictionsTTL = 0;
    this.evictionsMemory = 0;
    this.logIfEnabled('Stats reset');
  }

  private isExpired(entry: CacheEntry<unknown>): boolean {
    return getTimeProvider().now() > entry.expiresAt;
  }

  /**
   * Updates LRU order by deleting and re-inserting to move to end.
   * Map iteration order is insertion order, so newest is at the end.
   * O(1) operation.
   */
  private updateAccessOrder(key: string): void {
    this.lruOrder.delete(key);
    this.lruOrder.set(key, true);
  }

  private updateEntryHits(key: string, entry: CacheEntry<unknown>): void {
    // Create new entry with incremented hits (immutable update)
    const updated: CacheEntry<unknown> = {
      ...entry,
      hits: entry.hits + 1,
    };
    this.cache.set(key, updated);
  }

  private deleteEntry(key: string, reason: 'ttl' | 'lru' | 'memory' | 'manual'): boolean {
    const entry = this.cache.get(key);
    if (entry === undefined) return false;

    this.cache.delete(key);
    this.lruOrder.delete(key);
    this.memoryUsedBytes -= entry.sizeBytes;

    switch (reason) {
      case 'ttl':
        this.evictionsTTL++;
        break;
      case 'lru':
        this.evictionsLRU++;
        break;
      case 'memory':
        this.evictionsMemory++;
        break;
      default:
        break;
    }

    this.logIfEnabled('Entry deleted', { key, reason });
    return true;
  }

  private evictLRUIfNeeded(): void {
    while (this.cache.size >= this.config.maxEntries) {
      const lruKey = this.findLRUKey();
      if (lruKey === undefined) break;
      this.deleteEntry(lruKey, 'lru');
    }
  }

  private evictForMemory(additionalBytes: number): void {
    const maxBytes = this.config.maxMemoryMB * 1024 * 1024;
    while (this.memoryUsedBytes + additionalBytes > maxBytes && this.cache.size > 0) {
      const lruKey = this.findLRUKey();
      if (lruKey === undefined) break;
      this.deleteEntry(lruKey, 'memory');
    }
  }

  /**
   * Returns the least recently used key in O(1) time.
   * Uses Map's iteration order property - first key is always LRU.
   * @see Issue #408 - Optimized from O(n) to O(1)
   */
  private findLRUKey(): string | undefined {
    const first = this.lruOrder.keys().next();
    return first.done === true ? undefined : first.value;
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, this.config.cleanupInterval);

    // Unref to allow process to exit
    this.cleanupTimer.unref();
  }

  private cleanupExpired(): void {
    if (this.disposed) return;

    const now = getTimeProvider().now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.deleteEntry(key, 'ttl');
    }

    if (keysToDelete.length > 0) {
      this.logIfEnabled('Cleanup completed', { expiredCount: keysToDelete.length });
    }
  }

  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new ResponseCacheError('Cache has been disposed', 'DISPOSED');
    }
  }

  private logIfEnabled(message: string, context?: Record<string, unknown>): void {
    if (this.config.enableLogging) {
      this.logger.debug(message, context);
    }
  }
}

/**
 * Helper function to wrap async operations with caching.
 *
 * @param cache - The response cache instance
 * @param options - Cache options including key and TTL
 * @param fn - The async function to cache
 * @returns The cached or fresh result
 *
 * @example
 * ```typescript
 * const result = await withCache(cache, { key: 'my-key', ttl: 60000 }, async () => {
 *   return await expensiveOperation();
 * });
 * ```
 */
export async function withCache<T>(
  cache: IResponseCache,
  options: WithCacheOptions,
  fn: () => Promise<T>
): Promise<T> {
  const { key, ttl, skipOnError = true } = options;

  // Check cache first
  const cached = cache.get(key) as T | undefined;
  if (cached !== undefined) {
    return cached;
  }

  // Execute function
  try {
    const result = await fn();
    cache.set(key, result, ttl);
    return result;
  } catch (error) {
    if (!skipOnError) {
      throw error;
    }
    // Don't cache errors, re-throw
    throw error;
  }
}

/**
 * Creates a response cache instance.
 *
 * @param config - Optional cache configuration
 * @param logger - Optional logger instance
 * @returns Response cache instance
 *
 * @example
 * ```typescript
 * const cache = createResponseCache({ defaultTTL: 60_000, maxEntries: 500 });
 *
 * // Generate key
 * const key = generateCacheKey({
 *   adapter: 'claude',
 *   prompt: 'Explain closures',
 *   options: { model: 'claude-sonnet-4' }
 * });
 *
 * // Use with helper
 * const result = await withCache(cache, { key }, async () => {
 *   return await adapter.execute(task);
 * });
 * ```
 */
export function createResponseCache(
  config?: Partial<ResponseCacheConfig>,
  logger?: ILogger
): IResponseCache {
  return new InMemoryResponseCache(config, logger);
}

// Re-export from utils for convenience
export { generateCacheKey } from './response-cache-utils.js';

// Re-export types for convenience
export type {
  CacheEntry,
  ResponseCacheConfig,
  ResponseCacheStats,
  IResponseCache,
  CacheKeyOptions,
  WithCacheOptions,
} from './response-cache-types.js';
export {
  ResponseCacheConfigSchema,
  DEFAULT_RESPONSE_CACHE_CONFIG,
  ResponseCacheError,
} from './response-cache-types.js';
export type { ResponseCacheErrorCode } from './response-cache-types.js';
