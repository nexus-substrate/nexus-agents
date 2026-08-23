/**
 * nexus-agents/cli-adapters - Capacity Tracker
 *
 * Usage-based capacity tracking for CLI adapters.
 * Tracks cumulative token/request usage to estimate remaining capacity.
 *
 * Since CLI subprocess execution doesn't expose HTTP rate limit headers,
 * this tracker estimates capacity based on usage patterns.
 *
 * @see Issue #456 - Real API rate limit tracking
 */

import type { CliName, TokenUsage, CapacityStatus } from './types-core.js';
import { getTimeProvider } from '../core/index.js';
import { clampPercent } from '../utils/math-utils.js';

/**
 * Default rate limits per CLI provider (tokens per minute).
 * These are conservative estimates based on typical API tiers.
 * Override via environment variables: NEXUS_<CLI>_TOKEN_LIMIT
 */
export const DEFAULT_TOKEN_LIMITS: Record<CliName, number> = {
  claude: 100_000, // Claude API Build tier
  gemini: 1_000_000, // Gemini Pro generous limits
  codex: 500_000, // OpenAI tier 1
  opencode: 500_000, // Multi-provider proxy
};

/**
 * Default request limits per CLI provider (requests per minute).
 * Override via environment variables: NEXUS_<CLI>_REQUEST_LIMIT
 */
export const DEFAULT_REQUEST_LIMITS: Record<CliName, number> = {
  claude: 50, // Claude API Build tier
  gemini: 60, // Gemini Pro
  codex: 500, // OpenAI tier 1
  opencode: 300, // Multi-provider proxy
};

/**
 * Rate limit window in milliseconds (1 minute).
 */
export const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Configuration for capacity tracker.
 */
export interface CapacityTrackerConfig {
  /** Maximum tokens per window */
  readonly tokenLimit: number;
  /** Maximum requests per window */
  readonly requestLimit: number;
  /** Window duration in milliseconds */
  readonly windowMs: number;
}

/**
 * Tracked usage entry with timestamp.
 */
interface UsageEntry {
  readonly timestamp: number;
  readonly tokens: number;
}

/**
 * Creates default configuration for a CLI from environment or defaults.
 */
export function getDefaultConfig(cli: CliName): CapacityTrackerConfig {
  const envPrefix = `NEXUS_${cli.toUpperCase()}`;
  const tokenEnv = process.env[`${envPrefix}_TOKEN_LIMIT`];
  const requestEnv = process.env[`${envPrefix}_REQUEST_LIMIT`];

  return {
    tokenLimit:
      tokenEnv !== undefined && tokenEnv !== ''
        ? parseInt(tokenEnv, 10)
        : DEFAULT_TOKEN_LIMITS[cli],
    requestLimit:
      requestEnv !== undefined && requestEnv !== ''
        ? parseInt(requestEnv, 10)
        : DEFAULT_REQUEST_LIMITS[cli],
    windowMs: RATE_LIMIT_WINDOW_MS,
  };
}

/**
 * Capacity tracker for CLI adapters.
 *
 * Tracks cumulative usage within a sliding window to estimate
 * remaining capacity when HTTP headers are not available.
 *
 * @example
 * ```typescript
 * const tracker = new CapacityTracker(getDefaultConfig('claude'));
 *
 * // Record usage after each request
 * tracker.recordUsage({ inputTokens: 1000, outputTokens: 500 });
 *
 * // Get current capacity status
 * const status = tracker.getCapacity();
 * if (status.exhausted) {
 *   // Wait before next request
 * }
 * ```
 */
export class CapacityTracker {
  private readonly config: CapacityTrackerConfig;
  private readonly usageHistory: UsageEntry[];
  private requestCount: number;
  private windowStart: number;

  /**
   * Timestamps of every recorded request (#3026 finding 4).
   *
   * Pre-fix, `requestCount` was a plain counter reset only by the
   * tumbling-window branch of `pruneOldEntries`. Under continuous
   * traffic across a window boundary, that branch drops requests that
   * are still inside the *sliding* window — e.g. with windowMs=60s, a
   * request at t=59s followed by one at t=61s would tumbling-reset
   * the counter to 1 even though the t=59s request is still inside
   * the [1s, 61s] window. The downstream `remainingRequests === 0`
   * exhaustion check fired prematurely (or too late) depending on
   * burst patterns.
   *
   * Counting via a per-request timestamp array that's pruned the same
   * way as `usageHistory` keeps the two views consistent. Every
   * `recordUsage` pushes here; `requestCount` is derived from
   * `.length` after pruning.
   */
  private requestTimestamps: number[];

  /**
   * Whether this process has recorded even one request against this adapter
   * (#4374). Sticky: pruning the usage window back to empty does NOT clear it,
   * because the process has still seen the adapter work — it simply has no
   * recent samples. Without this flag a never-used tracker is indistinguishable
   * from an idle healthy one, and both report full remaining capacity.
   */
  private hasObserved = false;

  /**
   * Provider-asserted quota exhaustion (#4456), with the horizon the provider
   * gave. Null until a provider says so — never inferred from local counting.
   */
  private quotaExhaustedUntil: number | null = null;

  constructor(config: CapacityTrackerConfig) {
    this.config = config;
    this.usageHistory = [];
    this.requestCount = 0;
    this.requestTimestamps = [];
    this.windowStart = getTimeProvider().now();
  }

  /**
   * Records token usage from a completed request.
   */
  recordUsage(usage: TokenUsage | undefined): void {
    const now = getTimeProvider().now();
    this.hasObserved = true;
    this.pruneOldEntries(now);

    // #4456 follow-up: a completed request is direct evidence that the
    // provider is serving, and it outranks an earlier `retry-after` that has
    // not yet elapsed. Without this, a provider that says "wait an hour" and
    // then recovers in a minute stays reported as quota-exhausted — and
    // excludable, once enforcement is on — for the full hour, against a
    // success that contradicts it.
    this.quotaExhaustedUntil = null;

    this.requestTimestamps.push(now);
    this.requestCount = this.requestTimestamps.length;

    if (usage !== undefined) {
      const tokens = usage.totalTokens ?? usage.inputTokens + usage.outputTokens;
      this.usageHistory.push({
        timestamp: now,
        tokens,
      });
    }
  }

  /**
   * Gets current capacity status based on tracked usage.
   */
  getCapacity(): CapacityStatus {
    const now = getTimeProvider().now();
    this.pruneOldEntries(now);

    const usedTokens = this.usageHistory.reduce((sum, entry) => sum + entry.tokens, 0);
    const remainingTokens = Math.max(0, this.config.tokenLimit - usedTokens);
    const remainingRequests = Math.max(0, this.config.requestLimit - this.requestCount);

    const tokenUtilization = (usedTokens / this.config.tokenLimit) * 100;
    const requestUtilization = (this.requestCount / this.config.requestLimit) * 100;
    const utilizationPercent = clampPercent(Math.max(tokenUtilization, requestUtilization));

    const rateLimited = remainingTokens === 0 || remainingRequests === 0;
    const resetTime = new Date(this.windowStart + this.config.windowMs);

    // Expire a provider assertion once its own stated horizon passes. The
    // provider set the deadline, so we do not extend or shorten it.
    if (this.quotaExhaustedUntil !== null && now >= this.quotaExhaustedUntil) {
      this.quotaExhaustedUntil = null;
    }
    const quotaExhausted = this.quotaExhaustedUntil !== null;

    return {
      remainingTokens,
      remainingRequests,
      resetTime,
      utilizationPercent: Math.round(utilizationPercent * 100) / 100,
      rateLimited,
      // #4456: identical value, deprecated name. Kept so the rename is not a
      // breaking change to an exported type; removal is scheduled for the next
      // major, and `no-restricted-syntax` blocks new reads in the meantime.
      exhausted: rateLimited,
      quotaExhausted,
      ...(this.quotaExhaustedUntil !== null
        ? { quotaResetAt: new Date(this.quotaExhaustedUntil) }
        : {}),
      observed: this.hasObserved,
    };
  }

  /**
   * Record a PROVIDER's assertion that durable quota is exhausted (#4456).
   *
   * Only a `retryAfterMs` longer than the local window counts. A shorter one
   * is an ordinary per-minute throttle, which {@link CapacityStatus.rateLimited}
   * already covers — treating it as quota exhaustion would empty the candidate
   * pool for a condition that clears in under a minute, the failure mode that
   * kept #4373's enforcement stage switched off.
   *
   * Without a `retryAfterMs` the provider gave no horizon, so nothing is
   * asserted: an exhaustion with no end is not distinguishable here from a
   * transient error, and inventing a horizon would manufacture a measurement.
   *
   * @param retryAfterMs - The provider's stated wait, from `retry-after`.
   * @returns true when the assertion was durable enough to record.
   */
  recordProviderQuotaExhaustion(retryAfterMs: number | undefined): boolean {
    if (retryAfterMs === undefined || retryAfterMs <= this.config.windowMs) return false;
    // #4602: a recorded assertion is an observation. `assessCapacity`
    // short-circuits to 'unmeasured' on `observed === false`, so without this
    // the strongest evidence we can get about an arm — the provider stating
    // its quota is gone — would be stored and then ignored on any adapter
    // whose first call rate-limits (no success has run, so `recordUsage`
    // never fired). Only set on a recorded assertion: a rejected one
    // observed nothing.
    this.hasObserved = true;
    this.quotaExhaustedUntil = getTimeProvider().now() + retryAfterMs;
    return true;
  }

  /**
   * Gets time until the rate limit window resets.
   */
  getTimeUntilReset(): number {
    const now = getTimeProvider().now();
    const resetTime = this.windowStart + this.config.windowMs;
    return Math.max(0, resetTime - now);
  }

  /**
   * Resets all tracked usage (for testing or manual reset).
   */
  reset(): void {
    this.usageHistory.length = 0;
    this.requestTimestamps.length = 0;
    this.requestCount = 0;
    this.windowStart = getTimeProvider().now();
    this.quotaExhaustedUntil = null;
  }

  /**
   * Updates configuration (e.g., after receiving actual rate limit info).
   */
  updateConfig(partial: Partial<CapacityTrackerConfig>): void {
    Object.assign(this.config, partial);
  }

  /**
   * Gets current configuration.
   */
  getConfig(): Readonly<CapacityTrackerConfig> {
    return { ...this.config };
  }

  /**
   * Removes entries older than the window duration.
   */
  private pruneOldEntries(now: number): void {
    const cutoff = now - this.config.windowMs;

    // Sliding-window prune (#3026 finding 4):
    // Pre-fix, this used a "tumbling reset" branch — when `windowStart`
    // (the time of the FIRST request) was older than the cutoff, the
    // whole structure was zeroed. Under continuous traffic, that condition
    // fires whenever the earliest tracked request is older than windowMs
    // ago — even though more recent requests are still inside the
    // sliding window. The result was a periodic mass-prune that incorrectly
    // dropped current-window requests, making `remainingRequests === 0`
    // fire prematurely (or too late) depending on burst pattern.
    //
    // Now both arrays are slide-pruned individually: drop entries with
    // `timestamp < cutoff`, leave the rest. `windowStart` is rebased to
    // the earliest remaining entry (used by `resetTime` reporting),
    // falling back to `now` when both arrays are empty.
    while (this.usageHistory[0] !== undefined && this.usageHistory[0].timestamp < cutoff) {
      this.usageHistory.shift();
    }
    while (this.requestTimestamps[0] !== undefined && this.requestTimestamps[0] < cutoff) {
      this.requestTimestamps.shift();
    }
    this.requestCount = this.requestTimestamps.length;

    const earliestRequest = this.requestTimestamps[0];
    const earliestUsage = this.usageHistory[0]?.timestamp;
    if (earliestRequest === undefined && earliestUsage === undefined) {
      this.windowStart = now;
    } else {
      this.windowStart = Math.min(earliestRequest ?? Infinity, earliestUsage ?? Infinity);
    }
  }
}

/**
 * Creates a capacity tracker for a specific CLI.
 */
export function createCapacityTracker(cli: CliName): CapacityTracker {
  return new CapacityTracker(getDefaultConfig(cli));
}
