/**
 * nexus-agents/mcp - Rate Limiter Middleware
 *
 * Token bucket implementation for rate limiting MCP tool calls.
 * Prevents abuse and ensures fair resource usage.
 *
 * (Source: Token Bucket Algorithm, RFC 6585)
 */

import { createLogger, type ILogger, getTimeProvider } from '../../core/index.js';

/**
 * Configuration for the token bucket rate limiter.
 */
export interface RateLimiterConfig {
  /** Maximum number of tokens in the bucket */
  readonly capacity: number;
  /** Number of tokens added per interval */
  readonly refillRate: number;
  /** Interval in milliseconds between token refills (default: 1000ms) */
  readonly refillIntervalMs?: number;
  /** Optional logger instance */
  readonly logger?: ILogger;
  /** Optional identifier for logging */
  readonly name?: string;
}

/**
 * Current state of the rate limiter.
 */
export interface RateLimiterState {
  /** Current number of available tokens */
  readonly tokens: number;
  /** Capacity of the bucket */
  readonly capacity: number;
  /** Time until next token is available (0 if tokens available) */
  readonly nextTokenMs: number;
}

// Canonical source: config/timeouts.ts (Issue #1046)
import { CACHE_TIMEOUTS } from '../../config/timeouts.js';

const DEFAULT_REFILL_INTERVAL_MS = CACHE_TIMEOUTS.rateLimitRefillMs;

/**
 * Token bucket rate limiter implementation.
 *
 * The token bucket algorithm allows for bursting up to the capacity,
 * while maintaining a steady-state rate equal to the refill rate.
 *
 * @example
 * ```typescript
 * const limiter = new RateLimiter({
 *   capacity: 100,
 *   refillRate: 10,
 *   refillIntervalMs: 1000,
 * });
 *
 * if (limiter.tryAcquire()) {
 *   // Proceed with operation
 * } else {
 *   // Rate limited, reject or queue
 * }
 * ```
 */
export class RateLimiter {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillRate: number;
  private readonly refillIntervalMs: number;
  private lastRefillTime: number;
  private readonly logger: ILogger;
  private readonly name: string;

  constructor(config: RateLimiterConfig) {
    this.capacity = config.capacity;
    this.refillRate = config.refillRate;
    this.refillIntervalMs = config.refillIntervalMs ?? DEFAULT_REFILL_INTERVAL_MS;
    this.tokens = this.capacity;
    this.lastRefillTime = getTimeProvider().now();
    this.name = config.name ?? 'rate-limiter';
    this.logger = config.logger ?? createLogger({ component: this.name });

    this.logger.debug('Rate limiter initialized', {
      capacity: this.capacity,
      refillRate: this.refillRate,
      refillIntervalMs: this.refillIntervalMs,
    });
  }

  /**
   * Refills tokens based on elapsed time.
   * Called automatically before each acquire attempt.
   */
  private refill(): void {
    const now = getTimeProvider().now();
    const elapsed = now - this.lastRefillTime;
    const intervals = Math.floor(elapsed / this.refillIntervalMs);

    if (intervals > 0) {
      const tokensToAdd = intervals * this.refillRate;
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefillTime = now - (elapsed % this.refillIntervalMs);

      if (tokensToAdd > 0) {
        this.logger.debug('Tokens refilled', {
          added: tokensToAdd,
          current: this.tokens,
        });
      }
    }
  }

  /**
   * Attempts to acquire a token.
   *
   * @param count - Number of tokens to acquire (default: 1)
   * @returns True if tokens were acquired, false if rate limited
   */
  tryAcquire(count = 1): boolean {
    this.refill();

    if (this.tokens >= count) {
      this.tokens -= count;
      this.logger.debug('Token acquired', {
        requested: count,
        remaining: this.tokens,
      });
      return true;
    }

    this.logger.warn('Rate limit exceeded', {
      requested: count,
      available: this.tokens,
    });
    return false;
  }

  /**
   * Gets the current state of the rate limiter.
   *
   * @returns The current rate limiter state
   */
  getState(): RateLimiterState {
    this.refill();

    const nextTokenMs =
      this.tokens > 0 ? 0 : this.refillIntervalMs - (getTimeProvider().now() - this.lastRefillTime);

    return {
      tokens: this.tokens,
      capacity: this.capacity,
      nextTokenMs: Math.max(0, nextTokenMs),
    };
  }

  /**
   * Resets the rate limiter to full capacity.
   * Useful for testing or after configuration changes.
   */
  reset(): void {
    this.tokens = this.capacity;
    this.lastRefillTime = getTimeProvider().now();
    this.logger.debug('Rate limiter reset', { tokens: this.tokens });
  }
}

/**
 * Creates a rate limiter with default settings suitable for MCP tools.
 *
 * Default configuration:
 * - Capacity: 100 tokens
 * - Refill rate: 10 tokens per second
 *
 * @param name - Optional name for the rate limiter
 * @param logger - Optional logger instance
 * @returns A configured RateLimiter instance
 */
export function createDefaultRateLimiter(name?: string, logger?: ILogger): RateLimiter {
  const config: RateLimiterConfig = {
    capacity: 100,
    refillRate: 10,
    refillIntervalMs: 1000,
  };
  if (name !== undefined) {
    (config as { name?: string }).name = name;
  }
  if (logger !== undefined) {
    (config as { logger?: ILogger }).logger = logger;
  }
  return new RateLimiter(config);
}
