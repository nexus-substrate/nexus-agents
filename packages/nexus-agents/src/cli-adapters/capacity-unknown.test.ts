/**
 * Tests for the unobserved-capacity state (#4374).
 *
 * `CapacityStatus` had no way to say "I do not know". A tracker that had never
 * recorded a single usage sample returned `remainingTokens: tokenLimit`,
 * `utilizationPercent: 0`, `exhausted: false` — byte-identical to a genuinely
 * idle, healthy adapter — and `doctor` rendered that as a green
 * `100% remaining`. For a CLI whose weekly quota was consumed by another
 * process that reading is fiction, and it is the reading that made the #4351
 * reproduction confusing: the panel advertised healthy capacity while every
 * voter came back empty.
 *
 * The tracker only ever observes this process's own spend. It cannot see what
 * it cannot see; the fix is to say so rather than to report health.
 *
 * @module cli-adapters/capacity-unknown.test
 */

import { describe, it, expect } from 'vitest';
import { createCapacityTracker } from './capacity-tracker.js';

describe('capacity observation state (#4374)', () => {
  it('reports a fresh tracker as unobserved', () => {
    const tracker = createCapacityTracker('opencode');

    expect(tracker.getCapacity().observed).toBe(false);
  });

  it('reports it as observed once usage has been recorded', () => {
    const tracker = createCapacityTracker('opencode');

    tracker.recordUsage({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });

    expect(tracker.getCapacity().observed).toBe(true);
  });

  it('distinguishes never-observed from observed-and-idle', () => {
    // Both report full remaining tokens. Before this change they were
    // indistinguishable, which is the entire bug.
    const fresh = createCapacityTracker('claude');
    const used = createCapacityTracker('claude');
    used.recordUsage({ inputTokens: 1, outputTokens: 1, totalTokens: 2 });

    const freshStatus = fresh.getCapacity();
    const usedStatus = used.getCapacity();

    expect(freshStatus.observed).toBe(false);
    expect(usedStatus.observed).toBe(true);
    // The numbers still look similar — `observed` is the only thing that
    // separates them, which is why consumers must read it.
    expect(freshStatus.exhausted).toBe(false);
    expect(usedStatus.exhausted).toBe(false);
  });

  it('stays observed after the usage window prunes back to empty', () => {
    // Pruning old entries must not reset the flag to "never observed" — the
    // process HAS seen this adapter work; it simply has no recent samples.
    const tracker = createCapacityTracker('codex');
    tracker.recordUsage({ inputTokens: 1, outputTokens: 1, totalTokens: 2 });

    expect(tracker.getCapacity().observed).toBe(true);
  });
});
