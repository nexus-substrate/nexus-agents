/**
 * nexus-agents/adapters - Capacity Monitor Helpers
 *
 * Helper functions and specialized trackers for capacity monitoring.
 */

import { type Result, ok, err } from '../core/index.js';
import { CapacityMonitor } from './capacity-monitor.js';
import { type CapacityInfo, type HeadersLike } from './capacity-monitor-types.js';

/**
 * Parses Anthropic-specific rate limit headers.
 *
 * @param headers - Response headers
 * @returns Parsed capacity info or error
 *
 * @example
 * ```typescript
 * const response = await anthropic.messages.create(...);
 * const result = parseAnthropicHeaders(response.headers);
 * if (result.ok) {
 *   console.log(`Remaining tokens: ${result.value.remainingTokens}`);
 * }
 * ```
 */
export function parseAnthropicHeaders(
  headers: Headers | HeadersLike
): Result<Partial<CapacityInfo>, Error> {
  try {
    const monitor = new CapacityMonitor();
    monitor.updateFromHeaders('anthropic', headers);
    const capacity = monitor.getCapacity('anthropic');

    if (capacity) {
      return ok(capacity);
    }

    return err(new Error('No rate limit headers found'));
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Parses OpenAI-specific rate limit headers.
 *
 * @param headers - Response headers
 * @returns Parsed capacity info or error
 *
 * @example
 * ```typescript
 * const response = await openai.chat.completions.create(...);
 * const result = parseOpenAIHeaders(response.headers);
 * if (result.ok) {
 *   console.log(`Remaining tokens: ${result.value.remainingTokens}`);
 * }
 * ```
 */
export function parseOpenAIHeaders(
  headers: Headers | HeadersLike
): Result<Partial<CapacityInfo>, Error> {
  try {
    const monitor = new CapacityMonitor();
    monitor.updateFromHeaders('openai', headers);
    const capacity = monitor.getCapacity('openai');

    if (capacity) {
      return ok(capacity);
    }

    return err(new Error('No rate limit headers found'));
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Google Cloud quota tracking helper.
 *
 * Note: Google uses Cloud Console / API quotas rather than response headers.
 * This provides a manual tracking interface for Google AI/Gemini quotas.
 *
 * @example
 * ```typescript
 * const tracker = new GoogleQuotaTracker();
 *
 * // Update from quota API response or console data
 * tracker.updateQuota({
 *   remainingTokens: 50000,
 *   remainingRequests: 500,
 *   projectId: 'my-project',
 *   region: 'us-central1',
 * });
 *
 * // Check current quota
 * const quota = tracker.getQuota();
 * if (quota && quota.utilizationPercent > 80) {
 *   console.warn('Google quota running low');
 * }
 * ```
 */
export class GoogleQuotaTracker {
  private readonly monitor: CapacityMonitor;

  constructor(monitor?: CapacityMonitor) {
    this.monitor = monitor ?? new CapacityMonitor();
  }

  /**
   * Updates Google quota from manual quota check.
   *
   * @param quotaInfo - Quota information from Cloud Console or API
   */
  updateQuota(quotaInfo: {
    remainingTokens?: number;
    remainingRequests?: number;
    resetTime?: Date;
    projectId?: string;
    region?: string;
  }): void {
    // Build metadata only with defined values
    const metadata: Record<string, unknown> = {};
    if (quotaInfo.projectId !== undefined) {
      metadata.projectId = quotaInfo.projectId;
    }
    if (quotaInfo.region !== undefined) {
      metadata.region = quotaInfo.region;
    }

    // Build update object with only defined properties
    this.monitor.updateCapacity('google', {
      ...(quotaInfo.remainingTokens !== undefined && {
        remainingTokens: quotaInfo.remainingTokens,
      }),
      ...(quotaInfo.remainingRequests !== undefined && {
        remainingRequests: quotaInfo.remainingRequests,
      }),
      ...(quotaInfo.resetTime !== undefined && {
        resetTime: quotaInfo.resetTime,
      }),
      ...(Object.keys(metadata).length > 0 && { metadata }),
    });
  }

  /**
   * Gets current Google quota information.
   */
  getQuota(): CapacityInfo | null {
    return this.monitor.getCapacity('google');
  }

  /**
   * Gets the underlying capacity monitor.
   */
  getMonitor(): CapacityMonitor {
    return this.monitor;
  }
}

/**
 * Creates a Google quota tracker.
 *
 * @param monitor - Optional shared capacity monitor
 * @returns A new GoogleQuotaTracker instance
 */
export function createGoogleQuotaTracker(monitor?: CapacityMonitor): GoogleQuotaTracker {
  return new GoogleQuotaTracker(monitor);
}
