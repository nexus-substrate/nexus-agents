/**
 * Tests for the offline meta-strategy accuracy eval (#4095, epic #4094).
 */

import { describe, it, expect } from 'vitest';

import {
  evaluateMetaStrategy,
  splitCorpus,
  type MetaStrategyCorpusEntry,
} from './meta-strategy-eval.js';
import { META_STRATEGY_CORPUS } from './meta-strategy-corpus.js';

describe('splitCorpus — stratified, deterministic (#4095)', () => {
  it('covers every strategy in BOTH splits and is index-stable', () => {
    const { train, test } = splitCorpus(META_STRATEGY_CORPUS, 0.25);
    const trainStrats = new Set(train.map((e) => e.expectedStrategy));
    const testStrats = new Set(test.map((e) => e.expectedStrategy));
    const allStrats = new Set(META_STRATEGY_CORPUS.map((e) => e.expectedStrategy));
    expect(trainStrats).toEqual(allStrats);
    expect(testStrats).toEqual(allStrats);
    expect(train.length + test.length).toBe(META_STRATEGY_CORPUS.length);
    // Re-split → identical (no randomness).
    const again = splitCorpus(META_STRATEGY_CORPUS, 0.25);
    expect(again.train).toEqual(train);
    expect(again.test).toEqual(test);
  });
});

describe('evaluateMetaStrategy — offline learned-vs-rules accuracy (#4095)', () => {
  it('is fully deterministic (same corpus → identical numbers)', () => {
    const a = evaluateMetaStrategy(META_STRATEGY_CORPUS);
    const b = evaluateMetaStrategy(META_STRATEGY_CORPUS);
    expect(a).toEqual(b);
  });

  it('produces valid accuracy numbers over a held-out test split', () => {
    const r = evaluateMetaStrategy(META_STRATEGY_CORPUS);
    expect(r.total).toBe(META_STRATEGY_CORPUS.length);
    expect(r.testCount).toBeGreaterThan(0);
    expect(r.trainCount + r.testCount).toBe(r.total);
    for (const acc of [r.rulesAccuracy, r.learnedAccuracy]) {
      expect(acc).toBeGreaterThanOrEqual(0);
      expect(acc).toBeLessThanOrEqual(1);
    }
    expect(r.delta).toBeCloseTo(r.learnedAccuracy - r.rulesAccuracy, 10);
    // Surface the headline number (this is the #3552-blocked metric).
    // eslint-disable-next-line no-console
    console.log(
      `[meta-strategy-eval #4095] rules=${r.rulesAccuracy.toFixed(2)} ` +
        `learned=${r.learnedAccuracy.toFixed(2)} delta=${r.delta.toFixed(2)} (test n=${String(r.testCount)})`
    );
  });

  it('REGRESSION GUARD: the rule router classifies a meaningful share of goals', () => {
    // Routing-accuracy regression guard (the standalone value): a drop here means a
    // routing change degraded auto-strategy selection. Floor set conservatively below
    // the observed baseline; tighten as the corpus grows.
    const r = evaluateMetaStrategy(META_STRATEGY_CORPUS);
    expect(r.rulesAccuracy).toBeGreaterThanOrEqual(0.25);
  });

  it('handles an empty corpus without dividing by zero', () => {
    const empty: MetaStrategyCorpusEntry[] = [];
    const r = evaluateMetaStrategy(empty);
    expect(r.rulesAccuracy).toBe(0);
    expect(r.learnedAccuracy).toBe(0);
    expect(r.testCount).toBe(0);
  });
});
