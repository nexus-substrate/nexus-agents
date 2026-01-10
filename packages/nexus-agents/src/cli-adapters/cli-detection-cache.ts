/**
 * nexus-agents/cli-adapters - CLI Detection Cache
 *
 * Caches CLI health check results to avoid repeated subprocess calls.
 * Invalidates on circuit breaker trips or manual invalidation.
 *
 * @module cli-adapters/cli-detection-cache
 * (Source: Issue #165, Proposal adapter-architecture-review.md)
 */

import { z } from 'zod';
import { createLogger } from '../core/logger.js';
import type { ILogger } from '../core/index.js';
import type { CliName, HealthStatus, VersionStatus } from './types.js';

/**
 * Cached health result for a CLI.
 */
export interface CliHealthResult {
  /** Whether the CLI is healthy and available */
  readonly healthy: boolean;
  /** CLI version detected */
  readonly version: string;
  /** Version compatibility status */
  readonly versionStatus: VersionStatus;
  /** When this result was captured */
  readonly checkedAt: Date;
  /** Optional status message */
  readonly message?: string | undefined;
}

/**
 * Configuration for the CLI detection cache.
 */
export interface CliDetectionCacheConfig {
  /** Time-to-live in milliseconds (default: 5 minutes) */
  readonly ttlMs: number;
  /** Logger instance */
  readonly logger?: ILogger | undefined;
}

/**
 * Zod schema for cache configuration validation.
 */
export const CliDetectionCacheConfigSchema = z.object({
  ttlMs: z.number().min(1000).max(3600_000).default(300_000),
});

/**
 * Default cache configuration.
 */
export const DEFAULT_CACHE_CONFIG: CliDetectionCacheConfig = {
  ttlMs: 300_000, // 5 minutes
};

/**
 * Interface for CLI detection cache.
 * Allows dependency injection for testing.
 */
export interface ICliDetectionCache {
  /** Get cached health result for a CLI */
  get(cli: CliName): CliHealthResult | undefined;

  /** Set health result for a CLI */
  set(cli: CliName, result: CliHealthResult): void;

  /** Check if cache entry is stale */
  isStale(cli: CliName): boolean;

  /** Invalidate cache for a specific CLI or all CLIs */
  invalidate(cli?: CliName): void;

  /** Get all cached results */
  getAll(): ReadonlyMap<CliName, CliHealthResult>;

  /** Get cache statistics */
  getStats(): CacheStats;
}

/**
 * Cache statistics for observability.
 */
export interface CacheStats {
  /** Number of cached entries */
  readonly size: number;
  /** Cache hits since last reset */
  readonly hits: number;
  /** Cache misses since last reset */
  readonly misses: number;
  /** Hit rate (0-1) */
  readonly hitRate: number;
  /** When stats were last reset */
  readonly lastReset: Date;
}

/**
 * CLI detection cache implementation.
 * Thread-safe for Node.js single-threaded execution.
 */
export class CliDetectionCache implements ICliDetectionCache {
  private readonly config: CliDetectionCacheConfig;
  private readonly logger: ILogger;
  private readonly cache: Map<CliName, CliHealthResult> = new Map();
  private hits = 0;
  private misses = 0;
  private lastReset: Date = new Date();

  constructor(config?: Partial<CliDetectionCacheConfig>) {
    const validated = CliDetectionCacheConfigSchema.parse({
      ttlMs: config?.ttlMs ?? DEFAULT_CACHE_CONFIG.ttlMs,
    });
    this.config = { ...validated, logger: config?.logger };
    this.logger = config?.logger ?? createLogger({ component: 'CliDetectionCache' });

    this.logger.debug('CliDetectionCache initialized', { ttlMs: this.config.ttlMs });
  }

  get(cli: CliName): CliHealthResult | undefined {
    const result = this.cache.get(cli);

    if (result === undefined) {
      this.misses++;
      this.logger.debug('Cache miss', { cli });
      return undefined;
    }

    if (this.isStale(cli)) {
      this.misses++;
      this.logger.debug('Cache stale', { cli, checkedAt: result.checkedAt });
      return undefined;
    }

    this.hits++;
    this.logger.debug('Cache hit', { cli, healthy: result.healthy });
    return result;
  }

  set(cli: CliName, result: CliHealthResult): void {
    this.cache.set(cli, result);
    this.logger.debug('Cache updated', {
      cli,
      healthy: result.healthy,
      version: result.version,
    });
  }

  isStale(cli: CliName): boolean {
    const result = this.cache.get(cli);
    if (result === undefined) return true;

    const age = Date.now() - result.checkedAt.getTime();
    return age > this.config.ttlMs;
  }

  invalidate(cli?: CliName): void {
    if (cli !== undefined) {
      this.cache.delete(cli);
      this.logger.info('Cache invalidated', { cli });
    } else {
      this.cache.clear();
      this.logger.info('Cache cleared');
    }
  }

  getAll(): ReadonlyMap<CliName, CliHealthResult> {
    return this.cache;
  }

  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      lastReset: this.lastReset,
    };
  }

  /**
   * Resets cache statistics.
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.lastReset = new Date();
    this.logger.debug('Cache stats reset');
  }

  /**
   * Converts HealthStatus to CliHealthResult for caching.
   */
  static fromHealthStatus(status: HealthStatus): CliHealthResult {
    return {
      healthy: status.healthy,
      version: status.version,
      versionStatus: status.versionStatus,
      checkedAt: status.lastChecked,
      message: status.message,
    };
  }
}

/**
 * Creates a CLI detection cache instance.
 *
 * @param config - Optional cache configuration
 * @returns CLI detection cache
 *
 * @example
 * ```typescript
 * const cache = createCliDetectionCache({ ttlMs: 60_000 }); // 1 minute TTL
 * const result = cache.get('claude');
 * if (!result) {
 *   const health = await adapter.healthCheck();
 *   cache.set('claude', CliDetectionCache.fromHealthStatus(health));
 * }
 * ```
 */
export function createCliDetectionCache(
  config?: Partial<CliDetectionCacheConfig>
): ICliDetectionCache {
  return new CliDetectionCache(config);
}
