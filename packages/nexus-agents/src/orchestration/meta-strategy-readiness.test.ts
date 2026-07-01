/**
 * Tests for the learned-selector promotion readiness gate (#4094).
 * Falsifiable, fail-closed: ready only when EVERY criterion passes.
 */

import { describe, it, expect } from 'vitest';

import {
  evaluateMetaStrategyReadiness,
  DEFAULT_META_STRATEGY_READINESS_CONFIG,
} from './meta-strategy-readiness.js';
import type { MetaStrategyEvalResult } from './meta-strategy-eval.js';
import { evaluateMetaStrategy } from './meta-strategy-eval.js';
import { META_STRATEGY_CORPUS } from './meta-strategy-corpus.js';
import { SHADOW_STRATEGY_ARMS } from './meta-shadow-selector.js';

/** A result that satisfies every default criterion. */
function readyResult(over: Partial<MetaStrategyEvalResult> = {}): MetaStrategyEvalResult {
  const rulesAccuracy = 0.7;
  const learnedAccuracy = 0.8; // delta 0.10 ≥ 0.05, and ≥ 0.7 floor
  return {
    total: 80,
    trainCount: 60,
    testCount: 20, // ≥ 20
    rulesAccuracy,
    learnedAccuracy,
    delta: learnedAccuracy - rulesAccuracy,
    ...over,
  };
}

describe('evaluateMetaStrategyReadiness — promotion gate (#4094)', () => {
  it('is ready when every criterion is met', () => {
    const v = evaluateMetaStrategyReadiness(readyResult());
    expect(v.ready).toBe(true);
    expect(v.blockers).toEqual([]);
    expect(v.criteria).toHaveLength(3);
  });

  it('blocks on insufficient volume (testCount < 20)', () => {
    const v = evaluateMetaStrategyReadiness(readyResult({ testCount: 19 }));
    expect(v.ready).toBe(false);
    expect(v.blockers).toContain('volume');
  });

  it('blocks when the learned arm only ties rules (delta below margin)', () => {
    // learned == rules → delta 0, below the 0.05 margin. A tie is not enough.
    const v = evaluateMetaStrategyReadiness(
      readyResult({ rulesAccuracy: 0.8, learnedAccuracy: 0.8, delta: 0 })
    );
    expect(v.ready).toBe(false);
    expect(v.blockers).toContain('learned-beats-rules');
  });

  it('blocks when learned beats rules but is below the absolute accuracy floor', () => {
    // learned 0.6 beats rules 0.5 by 0.10, but 0.6 < 0.7 floor: both arms are weak.
    const v = evaluateMetaStrategyReadiness(
      readyResult({ rulesAccuracy: 0.5, learnedAccuracy: 0.6, delta: 0.1 })
    );
    expect(v.ready).toBe(false);
    expect(v.blockers).toContain('learned-accuracy-floor');
    expect(v.blockers).not.toContain('learned-beats-rules');
  });

  it('fail-closed: an empty/thin corpus eval is never ready', () => {
    const empty: MetaStrategyEvalResult = {
      total: 0,
      trainCount: 0,
      testCount: 0,
      rulesAccuracy: 0,
      learnedAccuracy: 0,
      delta: 0,
    };
    const v = evaluateMetaStrategyReadiness(empty);
    expect(v.ready).toBe(false);
    expect(v.blockers).toEqual(['volume', 'learned-beats-rules', 'learned-accuracy-floor']);
  });

  describe('boundary conditions — exactly at the thresholds', () => {
    it('passes volume at exactly minTestCases', () => {
      const v = evaluateMetaStrategyReadiness(readyResult({ testCount: 20 }));
      expect(v.blockers).not.toContain('volume');
    });

    it('passes learned-beats-rules at exactly minDelta', () => {
      const v = evaluateMetaStrategyReadiness(
        readyResult({ rulesAccuracy: 0.7, learnedAccuracy: 0.75, delta: 0.05 })
      );
      expect(v.blockers).not.toContain('learned-beats-rules');
    });

    it('passes learned-accuracy-floor at exactly minLearnedAccuracy', () => {
      const v = evaluateMetaStrategyReadiness(
        readyResult({ rulesAccuracy: 0.6, learnedAccuracy: 0.7, delta: 0.1 })
      );
      expect(v.blockers).not.toContain('learned-accuracy-floor');
    });

    it('is ready at all three thresholds simultaneously', () => {
      const v = evaluateMetaStrategyReadiness(
        readyResult({ testCount: 20, rulesAccuracy: 0.65, learnedAccuracy: 0.7, delta: 0.05 })
      );
      expect(v.ready).toBe(true);
    });
  });

  it('honors a stricter caller-supplied config', () => {
    const base = readyResult();
    // Default config says ready; a raised floor blocks it (monotonically safer).
    expect(evaluateMetaStrategyReadiness(base).ready).toBe(true);
    const strict = evaluateMetaStrategyReadiness(base, {
      ...DEFAULT_META_STRATEGY_READINESS_CONFIG,
      minLearnedAccuracy: 0.95,
    });
    expect(strict.ready).toBe(false);
    expect(strict.blockers).toContain('learned-accuracy-floor');
  });

  it('conservative defaults are the documented values', () => {
    expect(DEFAULT_META_STRATEGY_READINESS_CONFIG).toEqual({
      minTestCases: 20,
      minDelta: 0.05,
      minLearnedAccuracy: 0.7,
    });
  });

  it('applies over the real corpus without throwing (audit-mode signal)', () => {
    const v = evaluateMetaStrategyReadiness(evaluateMetaStrategy(META_STRATEGY_CORPUS));
    expect(typeof v.ready).toBe('boolean');
    expect(v.criteria).toHaveLength(3);
  });
});

describe('META_STRATEGY_CORPUS — balance guard (#4094)', () => {
  it('has at least 80 entries', () => {
    expect(META_STRATEGY_CORPUS.length).toBeGreaterThanOrEqual(80);
  });

  it('has at least 10 entries for every ExecutionStrategy label (even balance)', () => {
    const counts = new Map<string, number>();
    for (const entry of META_STRATEGY_CORPUS) {
      counts.set(entry.expectedStrategy, (counts.get(entry.expectedStrategy) ?? 0) + 1);
    }
    for (const strategy of SHADOW_STRATEGY_ARMS) {
      expect(counts.get(strategy) ?? 0).toBeGreaterThanOrEqual(10);
    }
    // Every label present in the corpus is one of the 8 known strategies.
    expect([...counts.keys()].sort()).toEqual([...SHADOW_STRATEGY_ARMS].sort());
  });

  it('has no duplicate goals (no near-duplicate padding by exact match)', () => {
    const goals = META_STRATEGY_CORPUS.map((e) => e.goal);
    expect(new Set(goals).size).toBe(goals.length);
  });
});
