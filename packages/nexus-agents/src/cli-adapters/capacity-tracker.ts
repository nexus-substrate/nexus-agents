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
};

/**
 * Default request limits per CLI provider (requests per minute).
 * Override via environment variables: NEXUS_<CLI>_REQUEST_LIMIT
 */
export const DEFAULT_REQUEST_LIMITS: Record<CliName, number> = {
  claude: 50, // Claude API Build tier
  gemini: 60, // Gemini Pro
  codex: 500, // OpenAI tier 1
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

  constructor(config: CapacityTrackerConfig) {
    this.config = config;
    this.usageHistory = [];
    this.requestCount = 0;
    this.windowStart = getTimeProvider().now();
  }

  /**
   * Records token usage from a completed request.
   */
  recordUsage(usage: TokenUsage | undefined): void {
    const now = getTimeProvider().now();
    this.pruneOldEntries(now);

    this.requestCount++;

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

    const exhausted = remainingTokens === 0 || remainingRequests === 0;
    const resetTime = new Date(this.windowStart + this.config.windowMs);

    return {
      remainingTokens,
      remainingRequests,
      resetTime,
      utilizationPercent: Math.round(utilizationPercent * 100) / 100,
      exhausted,
    };
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
    this.requestCount = 0;
    this.windowStart = getTimeProvider().now();
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

    // If window has fully elapsed, reset everything
    if (this.windowStart < cutoff) {
      this.usageHistory.length = 0;
      this.requestCount = 0;
      this.windowStart = now;
      return;
    }

    // Remove old entries from history
    let firstEntry = this.usageHistory[0];
    while (firstEntry !== undefined && firstEntry.timestamp < cutoff) {
      this.usageHistory.shift();
      firstEntry = this.usageHistory[0];
    }
  }
}

/**
 * Creates a capacity tracker for a specific CLI.
 */
export function createCapacityTracker(cli: CliName): CapacityTracker {
  return new CapacityTracker(getDefaultConfig(cli));
}
