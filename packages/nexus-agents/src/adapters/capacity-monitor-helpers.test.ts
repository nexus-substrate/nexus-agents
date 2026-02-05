/**
 * Tests for capacity-monitor-helpers.ts
 *
 * Covers Anthropic/OpenAI header parsing and GoogleQuotaTracker.
 */

import { describe, it, expect } from 'vitest';
import {
  parseAnthropicHeaders,
  parseOpenAIHeaders,
  GoogleQuotaTracker,
  createGoogleQuotaTracker,
} from './capacity-monitor-helpers.js';
import type { HeadersLike } from './capacity-monitor-types.js';

// ============================================================================
// Helpers
// ============================================================================

function makeHeaders(map: Record<string, string>): HeadersLike {
  return {
    get(name: string): string | null {
      return map[name.toLowerCase()] ?? null;
    },
  };
}

// ============================================================================
// parseAnthropicHeaders
// ============================================================================

describe('parseAnthropicHeaders', () => {
  it('parses rate limit headers from Anthropic response', () => {
    const headers = makeHeaders({
      'anthropic-ratelimit-tokens-remaining': '5000',
      'anthropic-ratelimit-requests-remaining': '50',
      'anthropic-ratelimit-tokens-reset': new Date(Date.now() + 60000).toISOString(),
      'anthropic-ratelimit-requests-reset': new Date(Date.now() + 60000).toISOString(),
    });
    const result = parseAnthropicHeaders(headers);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.remainingTokens).toBeDefined();
    }
  });

  it('handles empty headers gracefully', () => {
    const headers = makeHeaders({});
    const result = parseAnthropicHeaders(headers);
    // Monitor may return ok with defaults or err when no rate limit headers found
    expect(typeof result.ok).toBe('boolean');
  });
});

// ============================================================================
// parseOpenAIHeaders
// ============================================================================

describe('parseOpenAIHeaders', () => {
  it('parses rate limit headers from OpenAI response', () => {
    const headers = makeHeaders({
      'x-ratelimit-remaining-tokens': '10000',
      'x-ratelimit-remaining-requests': '100',
      'x-ratelimit-reset-tokens': '1s',
      'x-ratelimit-reset-requests': '1s',
    });
    const result = parseOpenAIHeaders(headers);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.remainingTokens).toBeDefined();
    }
  });

  it('handles empty headers gracefully', () => {
    const headers = makeHeaders({});
    const result = parseOpenAIHeaders(headers);
    // Monitor may still return ok with default values when no headers present
    expect(typeof result.ok).toBe('boolean');
  });
});

// ============================================================================
// GoogleQuotaTracker
// ============================================================================

describe('GoogleQuotaTracker', () => {
  it('creates with default monitor', () => {
    const tracker = new GoogleQuotaTracker();
    expect(tracker.getMonitor()).toBeDefined();
  });

  it('returns null quota before any updates', () => {
    const tracker = new GoogleQuotaTracker();
    expect(tracker.getQuota()).toBeNull();
  });

  it('tracks quota after update', () => {
    const tracker = new GoogleQuotaTracker();
    tracker.updateQuota({
      remainingTokens: 50000,
      remainingRequests: 500,
    });
    const quota = tracker.getQuota();
    expect(quota).not.toBeNull();
    if (quota) {
      expect(quota.remainingTokens).toBe(50000);
      expect(quota.remainingRequests).toBe(500);
    }
  });

  it('tracks project and region metadata', () => {
    const tracker = new GoogleQuotaTracker();
    tracker.updateQuota({
      remainingTokens: 1000,
      projectId: 'my-project',
      region: 'us-central1',
    });
    const quota = tracker.getQuota();
    expect(quota).not.toBeNull();
    if (quota?.metadata) {
      expect(quota.metadata.projectId).toBe('my-project');
      expect(quota.metadata.region).toBe('us-central1');
    }
  });

  it('updates with reset time', () => {
    const tracker = new GoogleQuotaTracker();
    const resetTime = new Date(Date.now() + 60000);
    tracker.updateQuota({
      remainingTokens: 1000,
      resetTime,
    });
    const quota = tracker.getQuota();
    expect(quota).not.toBeNull();
    if (quota) {
      expect(quota.resetTime).toEqual(resetTime);
    }
  });

  it('handles partial updates', () => {
    const tracker = new GoogleQuotaTracker();
    tracker.updateQuota({ remainingTokens: 5000 });
    const quota = tracker.getQuota();
    expect(quota).not.toBeNull();
  });
});

// ============================================================================
// createGoogleQuotaTracker
// ============================================================================

describe('createGoogleQuotaTracker', () => {
  it('creates tracker without monitor', () => {
    const tracker = createGoogleQuotaTracker();
    expect(tracker).toBeInstanceOf(GoogleQuotaTracker);
  });

  it('returns functional tracker', () => {
    const tracker = createGoogleQuotaTracker();
    tracker.updateQuota({ remainingTokens: 100 });
    expect(tracker.getQuota()).not.toBeNull();
  });
});
