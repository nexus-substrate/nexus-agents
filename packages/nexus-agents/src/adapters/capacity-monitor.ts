/**
 * nexus-agents/adapters - Capacity Monitor
 *
 * Real-time capacity monitoring for model providers by parsing rate limit headers.
 * Tracks remaining tokens/requests and emits callbacks when capacity drops below thresholds.
 *
 * @see Anthropic API: https://docs.anthropic.com/en/api/rate-limits
 * @see OpenAI API: https://platform.openai.com/docs/guides/rate-limits
 * @see Google Cloud: https://cloud.google.com/docs/quota
 */

import { getTimeProvider } from '../core/index.js';
import { clampPercent } from '../utils/math-utils.js';
import {
  type CapacityInfo,
  type CapacityMonitorConfig,
  type HeadersLike,
  type ICapacityMonitor,
  type LowCapacityCallback,
  type ProviderCapacityState,
  DEFAULT_CAPACITY_CONFIG,
  HEADER_MAPPINGS,
} from './capacity-monitor-types.js';

// Re-export types for convenience
export type {
  CapacityInfo,
  CapacityMonitorConfig,
  CapacityProvider,
  HeadersLike,
  ICapacityMonitor,
  LowCapacityCallback,
} from './capacity-monitor-types.js';

/**
 * Capacity monitor for tracking provider rate limits.
 *
 * @example
 * ```typescript
 * const monitor = new CapacityMonitor();
 *
 * // Register for low capacity warnings
 * monitor.onLowCapacity((provider, remaining, info) => {
 *   console.warn(`${provider} capacity low: ${remaining} tokens remaining`);
 * });
 *
 * // Update from API response headers
 * const response = await anthropicClient.complete(...);
 * monitor.updateFromHeaders('anthropic', response.headers);
 *
 * // Check current capacity
 * const capacity = monitor.getCapacity('anthropic');
 * if (capacity && capacity.utilizationPercent > 90) {
 *   // Consider backing off
 * }
 * ```
 */
/** Maximum tracked providers to prevent unbounded Map growth. */
const MAX_PROVIDERS = 50;

export class CapacityMonitor implements ICapacityMonitor {
  private readonly providers: Map<string, ProviderCapacityState>;
  private readonly callbacks: Set<LowCapacityCallback>;
  private readonly config: Required<CapacityMonitorConfig>;

  constructor(config?: CapacityMonitorConfig) {
    this.providers = new Map();
    this.callbacks = new Set();
    this.config = { ...DEFAULT_CAPACITY_CONFIG, ...config };
  }

  public updateFromHeaders(provider: string, headers: Headers | HeadersLike): void {
    const mapping = HEADER_MAPPINGS[provider];
    const state = this.getOrCreateState(provider);
    const now = new Date(getTimeProvider().now());

    if (mapping) {
      this.parseProviderHeaders(headers, mapping, state);
    } else {
      this.parseGenericHeaders(headers, state);
    }

    state.lastUpdated = now;
    this.providers.set(provider, state);
    this.checkLowCapacity(provider, state);
  }

  public getCapacity(provider: string): CapacityInfo | null {
    const state = this.providers.get(provider);
    if (!state) {
      return null;
    }
    return this.stateToCapacityInfo(state);
  }

  public onLowCapacity(callback: LowCapacityCallback): () => void {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  public setLowCapacityThreshold(threshold: number): void {
    if (threshold < 0 || threshold > 100) {
      throw new Error('Threshold must be between 0 and 100');
    }
    this.config.lowCapacityThreshold = threshold;
  }

  public getTimeUntilReset(provider: string): number | null {
    const state = this.providers.get(provider);
    if (!state?.resetTime) {
      return null;
    }
    const now = getTimeProvider().now();
    const resetMs = state.resetTime.getTime();
    return Math.max(0, resetMs - now);
  }

  public updateCapacity(provider: string, info: Partial<CapacityInfo>): void {
    const state = this.getOrCreateState(provider);

    if (info.remainingTokens !== undefined) {
      state.remainingTokens = info.remainingTokens;
    }
    if (info.remainingRequests !== undefined) {
      state.remainingRequests = info.remainingRequests;
    }
    if (info.resetTime !== undefined) {
      state.resetTime = info.resetTime;
    }
    if (info.metadata !== undefined) {
      state.metadata = { ...state.metadata, ...info.metadata };
    }

    state.lastUpdated = new Date(getTimeProvider().now());
    this.providers.set(provider, state);
    this.checkLowCapacity(provider, state);
  }

  public clearCapacity(provider: string): void {
    this.providers.delete(provider);
  }

  public getTrackedProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  private getOrCreateState(provider: string): ProviderCapacityState {
    const existing = this.providers.get(provider);
    if (existing) {
      return existing;
    }

    // Guard against unbounded growth from arbitrary provider names
    if (this.providers.size >= MAX_PROVIDERS) {
      // Evict the oldest entry (first key in insertion order)
      const oldestKey = this.providers.keys().next();
      if (oldestKey.done !== true) {
        this.providers.delete(oldestKey.value);
      }
    }

    return {
      remainingTokens: this.config.defaultTotalTokens,
      remainingRequests: this.config.defaultTotalRequests,
      totalTokens: this.config.defaultTotalTokens,
      totalRequests: this.config.defaultTotalRequests,
      resetTime: null,
      lastUpdated: new Date(getTimeProvider().now()),
      metadata: {},
    };
  }

  private parseProviderHeaders(
    headers: Headers | HeadersLike,
    mapping: (typeof HEADER_MAPPINGS)[string],
    state: ProviderCapacityState
  ): void {
    const tokensRemaining = this.parseNumber(headers.get(mapping.tokensRemaining));
    const tokensLimit = this.parseNumber(headers.get(mapping.tokensLimit ?? ''));
    const tokensReset = this.parseResetTime(headers.get(mapping.tokensReset));
    const requestsRemaining = this.parseNumber(headers.get(mapping.requestsRemaining ?? ''));
    const requestsLimit = this.parseNumber(headers.get(mapping.requestsLimit ?? ''));

    if (tokensRemaining !== null) state.remainingTokens = tokensRemaining;
    if (tokensLimit !== null) state.totalTokens = tokensLimit;
    if (tokensReset !== null) state.resetTime = tokensReset;
    if (requestsRemaining !== null) state.remainingRequests = requestsRemaining;
    if (requestsLimit !== null) state.totalRequests = requestsLimit;
  }

  private stateToCapacityInfo(state: ProviderCapacityState): CapacityInfo {
    const utilizationPercent = this.calculateUtilization(state);
    return {
      remainingTokens: state.remainingTokens,
      remainingRequests: state.remainingRequests,
      resetTime: state.resetTime,
      utilizationPercent,
      lastUpdated: state.lastUpdated,
      metadata: { ...state.metadata },
    };
  }

  private calculateUtilization(state: ProviderCapacityState): number {
    if (state.totalTokens === 0) {
      return 100;
    }
    const usedTokens = state.totalTokens - state.remainingTokens;
    const utilization = (usedTokens / state.totalTokens) * 100;
    return clampPercent(utilization);
  }

  private checkLowCapacity(provider: string, state: ProviderCapacityState): void {
    const utilization = this.calculateUtilization(state);
    if (utilization >= this.config.lowCapacityThreshold) {
      const info = this.stateToCapacityInfo(state);
      for (const callback of this.callbacks) {
        try {
          callback(provider, state.remainingTokens, info);
        } catch {
          // Ignore callback errors
        }
      }
    }
  }

  private parseNumber(value: string | null): number | null {
    if (value === null || value === '') {
      return null;
    }
    const cleaned = value.replace(/,/g, '');
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? null : num;
  }

  private parseResetTime(value: string | null): Date | null {
    if (value === null || value === '') {
      return null;
    }

    // Try ISO 8601 format (Anthropic)
    const isoDate = this.parseIsoDate(value);
    if (isoDate !== null) return isoDate;

    // Try relative time format (OpenAI): "1s", "60s", "1m", "500ms"
    const relativeDate = this.parseRelativeTime(value);
    if (relativeDate !== null) return relativeDate;

    // Try Unix timestamp (seconds)
    return this.parseUnixTimestamp(value);
  }

  private parseIsoDate(value: string): Date | null {
    if (!value.includes('T') && !value.includes('-')) return null;
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  private parseRelativeTime(value: string): Date | null {
    const relativeMatch = value.match(/^(\d+(?:\.\d+)?)(ms|s|m)?$/);
    if (!relativeMatch) return null;

    const numStr = relativeMatch[1];
    if (numStr === undefined) return null;

    const num = parseFloat(numStr);
    const unit = relativeMatch[2] ?? 's';
    const ms = this.getMilliseconds(num, unit);
    return new Date(getTimeProvider().now() + ms);
  }

  private parseUnixTimestamp(value: string): Date | null {
    const timestamp = parseInt(value, 10);
    if (isNaN(timestamp)) return null;

    if (timestamp > 1000000000) {
      return new Date(timestamp * 1000);
    }
    return new Date(getTimeProvider().now() + timestamp * 1000);
  }

  private getMilliseconds(num: number, unit: string): number {
    switch (unit) {
      case 'ms':
        return num;
      case 's':
        return num * 1000;
      case 'm':
        return num * 60 * 1000;
      default:
        return num * 1000;
    }
  }

  private parseGenericHeaders(headers: Headers | HeadersLike, state: ProviderCapacityState): void {
    const remainingPatterns = [
      'ratelimit-remaining',
      'x-ratelimit-remaining',
      'rate-limit-remaining',
    ];

    for (const pattern of remainingPatterns) {
      const remaining = this.parseNumber(headers.get(pattern));
      if (remaining !== null) {
        state.remainingRequests = remaining;
        break;
      }
    }

    const resetPatterns = ['ratelimit-reset', 'x-ratelimit-reset', 'rate-limit-reset'];

    for (const pattern of resetPatterns) {
      const resetTime = this.parseResetTime(headers.get(pattern));
      if (resetTime !== null) {
        state.resetTime = resetTime;
        break;
      }
    }
  }
}

/**
 * Creates a capacity monitor with the specified configuration.
 *
 * @param config - Optional configuration
 * @returns A new CapacityMonitor instance
 */
export function createCapacityMonitor(config?: CapacityMonitorConfig): CapacityMonitor {
  return new CapacityMonitor(config);
}
