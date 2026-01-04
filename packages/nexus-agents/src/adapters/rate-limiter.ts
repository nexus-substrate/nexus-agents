/**
 * @nexus-agents/adapters - Token Bucket Rate Limiter
 *
 * A rate limiter implementation using the token bucket algorithm.
 * Tokens are added to the bucket at a fixed rate up to a maximum capacity.
 * Each operation consumes tokens; operations are rejected when insufficient tokens.
 *
 * @see https://en.wikipedia.org/wiki/Token_bucket
 */

import { type Result, ok, err } from '../core/index.js';
import { RateLimitError } from '../core/index.js';

/**
 * Configuration options for the RateLimiter.
 */
export interface RateLimiterConfig {
  /**
   * Maximum number of tokens the bucket can hold.
   * This is also the initial token count.
   */
  readonly capacity: number;

  /**
   * Number of tokens added to the bucket per second.
   */
  readonly refillRate: number;

  /**
   * Interval in milliseconds for automatic refill checks.
   * Only used when waiting for tokens. Default: 100ms.
   */
  readonly refillInterval?: number;
}

/**
 * Error returned when rate limit is exceeded.
 */
export interface RateLimitExceeded {
  readonly type: 'rate_limit_exceeded';
  readonly requested: number;
  readonly available: number;
  readonly retryAfterMs: number;
}

/**
 * Token bucket rate limiter for controlling request rates.
 *
 * The token bucket algorithm works as follows:
 * 1. A bucket holds tokens up to a maximum capacity
 * 2. Tokens are added at a fixed rate (refillRate per second)
 * 3. Each request consumes one or more tokens
 * 4. If insufficient tokens, the request is rejected or waits
 *
 * @example
 * ```typescript
 * const limiter = new RateLimiter({
 *   capacity: 100,    // Max 100 tokens
 *   refillRate: 10,   // 10 tokens per second
 * });
 *
 * if (limiter.tryAcquire()) {
 *   // Proceed with operation
 * } else {
 *   // Rate limited
 * }
 *
 * // Or wait for tokens
 * await limiter.waitForTokens();
 * ```
 */
export class RateLimiter {
  private readonly capacity: number;
  private readonly refillRate: number;
  private readonly refillInterval: number;
  private tokens: number;
  private lastRefillTime: number;

  /**
   * Creates a new RateLimiter instance.
   *
   * @param config - Configuration options
   * @throws {RateLimitError} If configuration is invalid
   */
  constructor(config: RateLimiterConfig) {
    this.validateConfig(config);

    this.capacity = config.capacity;
    this.refillRate = config.refillRate;
    this.refillInterval = config.refillInterval ?? 100;
    this.tokens = config.capacity;
    this.lastRefillTime = Date.now();
  }

  /**
   * Validates the configuration parameters.
   */
  private validateConfig(config: RateLimiterConfig): void {
    if (config.capacity <= 0) {
      throw new RateLimitError('Capacity must be a positive number', {
        context: { capacity: config.capacity },
      });
    }
    if (config.refillRate <= 0) {
      throw new RateLimitError('Refill rate must be a positive number', {
        context: { refillRate: config.refillRate },
      });
    }
    if (config.refillInterval !== undefined && config.refillInterval <= 0) {
      throw new RateLimitError('Refill interval must be a positive number', {
        context: { refillInterval: config.refillInterval },
      });
    }
  }

  /**
   * Refills tokens based on elapsed time since last refill.
   * Called automatically before token operations.
   */
  private refill(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastRefillTime;
    const elapsedSeconds = elapsedMs / 1000;
    const tokensToAdd = elapsedSeconds * this.refillRate;

    if (tokensToAdd >= 1) {
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefillTime = now;
    }
  }

  /**
   * Attempts to acquire the specified number of tokens.
   *
   * @param tokens - Number of tokens to acquire (default: 1)
   * @returns true if tokens were acquired, false if rate limited
   *
   * @example
   * ```typescript
   * if (limiter.tryAcquire(5)) {
   *   // Acquired 5 tokens
   * }
   * ```
   */
  public tryAcquire(tokens: number = 1): boolean {
    if (tokens <= 0) {
      return true;
    }
    if (tokens > this.capacity) {
      return false;
    }

    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  /**
   * Attempts to acquire tokens and returns a Result with detailed information.
   *
   * @param tokens - Number of tokens to acquire (default: 1)
   * @returns Result containing void on success, or RateLimitExceeded on failure
   *
   * @example
   * ```typescript
   * const result = limiter.acquire(5);
   * if (!result.ok) {
   *   console.log(`Retry after ${result.error.retryAfterMs}ms`);
   * }
   * ```
   */
  public acquire(tokens: number = 1): Result<void, RateLimitExceeded> {
    if (tokens <= 0) {
      return ok(undefined);
    }
    if (tokens > this.capacity) {
      return err({
        type: 'rate_limit_exceeded',
        requested: tokens,
        available: this.tokens,
        retryAfterMs: Infinity,
      });
    }

    this.refill();

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return ok(undefined);
    }

    const deficit = tokens - this.tokens;
    const retryAfterMs = Math.ceil((deficit / this.refillRate) * 1000);

    return err({
      type: 'rate_limit_exceeded',
      requested: tokens,
      available: Math.floor(this.tokens),
      retryAfterMs,
    });
  }

  /**
   * Waits until the specified number of tokens are available, then acquires them.
   *
   * @param tokens - Number of tokens to acquire (default: 1)
   * @returns Promise that resolves when tokens are acquired
   * @throws {RateLimitError} If tokens exceed capacity (would wait forever)
   *
   * @example
   * ```typescript
   * await limiter.waitForTokens(10);
   * // 10 tokens acquired
   * ```
   */
  public async waitForTokens(tokens: number = 1): Promise<void> {
    if (tokens <= 0) {
      return;
    }
    if (tokens > this.capacity) {
      throw new RateLimitError(
        `Cannot acquire ${String(tokens)} tokens: exceeds capacity of ${String(this.capacity)}`,
        { context: { requested: tokens, capacity: this.capacity } }
      );
    }

    while (!this.tryAcquire(tokens)) {
      await this.sleep(this.refillInterval);
    }
  }

  /**
   * Sleeps for the specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Returns the current number of available tokens.
   * Performs a refill before returning the count.
   *
   * @returns Number of available tokens (may be fractional)
   */
  public getRemainingTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Returns the number of whole tokens available.
   *
   * @returns Integer number of available tokens
   */
  public getAvailableTokens(): number {
    return Math.floor(this.getRemainingTokens());
  }

  /**
   * Resets the rate limiter to its initial state.
   * The bucket is refilled to capacity.
   */
  public reset(): void {
    this.tokens = this.capacity;
    this.lastRefillTime = Date.now();
  }

  /**
   * Returns the bucket's maximum capacity.
   */
  public getCapacity(): number {
    return this.capacity;
  }

  /**
   * Returns the refill rate in tokens per second.
   */
  public getRefillRate(): number {
    return this.refillRate;
  }

  /**
   * Calculates the time in milliseconds until the specified tokens are available.
   *
   * @param tokens - Number of tokens needed (default: 1)
   * @returns Time in milliseconds until tokens are available, 0 if already available
   */
  public getTimeUntilAvailable(tokens: number = 1): number {
    if (tokens <= 0) {
      return 0;
    }
    if (tokens > this.capacity) {
      return Infinity;
    }

    this.refill();

    if (this.tokens >= tokens) {
      return 0;
    }

    const deficit = tokens - this.tokens;
    return Math.ceil((deficit / this.refillRate) * 1000);
  }
}

/**
 * Creates a rate limiter with the specified configuration.
 * Factory function for cleaner API.
 *
 * @param config - Rate limiter configuration
 * @returns A new RateLimiter instance
 *
 * @example
 * ```typescript
 * const limiter = createRateLimiter({
 *   capacity: 100,
 *   refillRate: 10,
 * });
 * ```
 */
export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  return new RateLimiter(config);
}
