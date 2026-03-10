/**
 * Tests for synthesis historical learning (#1507).
 *
 * Tracks which synthesis tiers succeed/fail for conflict patterns
 * so the system can skip tiers with repeated failures.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SynthesisHistoryTracker, createConflictPatternKey } from './synthesis-history.js';

describe('createConflictPatternKey', () => {
  it('creates key from sorted roles', () => {
    const key = createConflictPatternKey(['security', 'code', 'architecture']);
    expect(key).toBe('architecture+code+security');
  });

  it('creates consistent key regardless of order', () => {
    const key1 = createConflictPatternKey(['code', 'security']);
    const key2 = createConflictPatternKey(['security', 'code']);
    expect(key1).toBe(key2);
  });

  it('returns empty string for no roles', () => {
    expect(createConflictPatternKey([])).toBe('');
  });

  it('deduplicates roles', () => {
    const key = createConflictPatternKey(['code', 'code', 'security']);
    expect(key).toBe('code+security');
  });
});

describe('SynthesisHistoryTracker', () => {
  let tracker: SynthesisHistoryTracker;

  beforeEach(() => {
    tracker = new SynthesisHistoryTracker();
  });

  it('recommends tier 2 for unknown patterns', () => {
    expect(tracker.recommendStartTier('code+security')).toBe(2);
  });

  it('recommends tier 2 after one failure', () => {
    tracker.record('code+security', 2, false);
    expect(tracker.recommendStartTier('code+security')).toBe(2);
  });

  it('recommends tier 3 after 2 consecutive tier-2 failures', () => {
    tracker.record('code+security', 2, false);
    tracker.record('code+security', 2, false);
    expect(tracker.recommendStartTier('code+security')).toBe(3);
  });

  it('resets failure count on success', () => {
    tracker.record('code+security', 2, false);
    tracker.record('code+security', 2, false);
    tracker.record('code+security', 2, true);
    // After success, should recommend tier 2 again
    expect(tracker.recommendStartTier('code+security')).toBe(2);
  });

  it('tracks different patterns independently', () => {
    tracker.record('code+security', 2, false);
    tracker.record('code+security', 2, false);
    expect(tracker.recommendStartTier('code+security')).toBe(3);
    expect(tracker.recommendStartTier('architecture+code')).toBe(2);
  });

  it('returns stats for known patterns', () => {
    tracker.record('code+security', 2, true);
    tracker.record('code+security', 2, false);
    tracker.record('code+security', 3, true);

    const stats = tracker.getStats('code+security');
    expect(stats).toBeDefined();
    expect(stats?.totalAttempts).toBe(3);
    expect(stats?.tier2Successes).toBe(1);
    expect(stats?.tier3Successes).toBe(1);
  });

  it('returns undefined stats for unknown patterns', () => {
    expect(tracker.getStats('unknown')).toBeUndefined();
  });

  it('caps stored patterns to prevent unbounded growth', () => {
    // Insert 200 unique patterns (max is 100)
    for (let i = 0; i < 200; i++) {
      tracker.record(`pattern-${String(i)}`, 2, true);
    }
    // Should have evicted oldest entries
    const allStats = tracker.allPatterns();
    expect(allStats.length).toBeLessThanOrEqual(100);
  });
});
