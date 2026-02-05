/**
 * Tests for BaseAgent Context Helpers
 * @module agents/base-agent-context-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { ContextPruningMetrics } from './base-agent-pruning-init.js';
import { copyPruningMetrics, createInitialPruningMetrics } from './base-agent-context-helpers.js';

// ============================================================================
// createInitialPruningMetrics
// ============================================================================

describe('createInitialPruningMetrics', () => {
  it('creates metrics with zeroed values', () => {
    const metrics = createInitialPruningMetrics();
    expect(metrics.pruningRounds).toBe(0);
    expect(metrics.totalTokensPruned).toBe(0);
    expect(metrics.lastPruningTokens).toBe(0);
    expect(metrics.lastPruningItemsRemoved).toBe(0);
    expect(metrics.lastPruningTargetReached).toBe(false);
  });

  it('returns a new object each time', () => {
    const a = createInitialPruningMetrics();
    const b = createInitialPruningMetrics();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ============================================================================
// copyPruningMetrics
// ============================================================================

describe('copyPruningMetrics', () => {
  it('returns a copy with same values', () => {
    const original: ContextPruningMetrics = {
      pruningRounds: 5,
      totalTokensPruned: 1000,
      lastPruningTokens: 200,
      lastPruningItemsRemoved: 3,
      lastPruningTargetReached: true,
    };
    const copy = copyPruningMetrics(original);
    expect(copy).toEqual(original);
    expect(copy).not.toBe(original);
  });

  it('mutations to copy do not affect original', () => {
    const original: ContextPruningMetrics = {
      pruningRounds: 1,
      totalTokensPruned: 100,
      lastPruningTokens: 50,
      lastPruningItemsRemoved: 2,
      lastPruningTargetReached: false,
    };
    const copy = copyPruningMetrics(original);
    // The returned type is Readonly, but we can cast to verify isolation
    (copy as ContextPruningMetrics).pruningRounds = 999;
    expect(original.pruningRounds).toBe(1);
  });
});
