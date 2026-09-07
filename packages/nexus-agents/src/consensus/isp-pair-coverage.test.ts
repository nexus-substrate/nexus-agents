/**
 * An unobserved voter pair must not read as measured independence (#5813).
 *
 * `computeSubsetIndependenceScore` averages only the pairs PRESENT in the
 * correlation matrix, so a pair that has never co-voted is dropped from the
 * average rather than represented. A subset whose pairs were measured at 0 and
 * one whose pairs were never observed both score 0 — and 0 earns the maximum
 * posterior weight in `aggregateSubsets` (`size * (1 - score)`).
 *
 * The first pass added the coverage marker and deliberately left the score
 * alone, because reweighting changes vote outcomes and that was a decision for
 * a panel. The panel has now made it (#5813, option B, 4 of 6): an unobserved
 * pair counts as MAXIMALLY correlated, so absent evidence stops being credited
 * as evidence of independence. The assertions below that pinned the old score
 * move with it — they recorded an interim state on purpose, not a behaviour to
 * preserve.
 */
import { describe, it, expect } from 'vitest';

import { computeSubsetIndependence } from './subset-independence.js';
import { aggregateSubsets } from './higher-order-helpers.js';
import type { CorrelationMatrix } from './higher-order-types.js';
import type { IndependentSubset } from './higher-order-types.js';
import type { Vote } from './types-core.js';

function matrix(entries: Record<string, number>): CorrelationMatrix {
  return new Map(Object.entries(entries)) as CorrelationMatrix;
}

describe('computeSubsetIndependence reports how much it measured', () => {
  it('reports full coverage when every pair has a correlation', () => {
    const result = computeSubsetIndependence(['a', 'b'], matrix({ 'a:b': 0.4 }));

    expect(result.score).toBeCloseTo(0.4);
    expect(result.observedPairs).toBe(1);
    expect(result.totalPairs).toBe(1);
  });

  it('reports partial coverage when a pair was never observed', () => {
    // a-c and a-d measured at 0.1, c-d never co-voted. The unobserved pair is
    // charged at 1.0, so the score is (0.1 + 0.1 + 1) / 3, not the 0.1 average
    // over the two that happen to exist.
    const result = computeSubsetIndependence(['a', 'c', 'd'], matrix({ 'a:c': 0.1, 'a:d': 0.1 }));

    expect(result.score).toBeCloseTo(1.2 / 3);
    expect(result.observedPairs).toBe(2);
    expect(result.totalPairs).toBe(3);
  });

  it('distinguishes measured-zero from never-observed in the SCORE, not just the marker', () => {
    // The property that matters, and the half the first pass deferred. These
    // used to be indistinguishable at 0 — the score that earns the maximum
    // posterior weight. Only a measured 0 earns it now.
    const measuredZero = computeSubsetIndependence(['a', 'b'], matrix({ 'a:b': 0 }));
    const neverObserved = computeSubsetIndependence(['a', 'b'], matrix({}));

    expect(measuredZero.score).toBe(0);
    expect(neverObserved.score).toBe(1);
    expect(measuredZero.observedPairs).toBe(1);
    expect(neverObserved.observedPairs).toBe(0);
  });

  it('reports a singleton as having no pair to observe', () => {
    // `total: 0` is not "fully covered" — there is nothing to cover, and the
    // score is not a measurement at all.
    const result = computeSubsetIndependence(['a'], matrix({}));

    expect(result.totalPairs).toBe(0);
    expect(result.observedPairs).toBe(0);
  });

  it('leaves a fully observed subset untouched', () => {
    // The pair test. Charging for missing pairs must not move a subset that
    // has none — otherwise the change is a blanket penalty, not a correction.
    const full = computeSubsetIndependence(['a', 'b', 'c'], matrix({
      'a:b': 0.2,
      'a:c': 0.4,
      'b:c': 0.6,
    }));

    expect(full.score).toBeCloseTo(0.4);
    expect(full.observedPairs).toBe(3);
    expect(full.totalPairs).toBe(3);
  });

  it('gives a fully unobserved multi-agent subset zero posterior weight', () => {
    const none = computeSubsetIndependence(['a', 'b', 'c'], matrix({}));

    expect(none.score).toBe(1);
    // `aggregateSubsets` computes `size * (1 - score)`, so this contributes
    // nothing rather than everything.
    expect(3 * (1 - none.score)).toBe(0);
  });

  it('keeps a singleton at full weight without a 0/0 guard', () => {
    // An unmeasurABLE subset is not an unmeasurED one: a lone agent has no
    // peer to correlate with, so there is nothing to discount. This falls out
    // of the formula because zero total pairs means zero missing pairs to
    // charge for — the reason the panel's option B was preferred over the
    // algebraically identical option A, which needs an explicit guard here.
    const singleton = computeSubsetIndependence(['a'], matrix({}));

    expect(singleton.score).toBe(0);
    expect(Number.isNaN(singleton.score)).toBe(false);
    expect(1 * (1 - singleton.score)).toBe(1);
  });

  it('is algebraically the same as scaling the weight by coverage', () => {
    // Recorded so nobody "simplifies" one into the other believing they differ.
    // Charging 1.0 per missing pair equals (observed/total) * (1 - score):
    //   1 - (observed*score + missing)/total  ==  (observed/total)*(1 - score)
    // Four voters chose option B partly believing it gentler than A. It is not.
    const subsets: Array<[string[], Record<string, number>]> = [
      [['a', 'b'], { 'a:b': 0.3 }],
      [['a', 'b', 'c'], { 'a:b': 0.2 }],
      [['a', 'b', 'c'], { 'a:b': 0.2, 'a:c': 0.9 }],
      [['a', 'b', 'c'], {}],
    ];

    for (const [members, entries] of subsets) {
      const r = computeSubsetIndependence(members, matrix(entries));
      const observedScore =
        r.observedPairs > 0
          ? Object.values(entries).reduce((sum, v) => sum + Math.abs(v), 0) / r.observedPairs
          : 0;
      const coverageForm =
        members.length * (1 - observedScore) * (r.observedPairs / r.totalPairs);

      expect(members.length * (1 - r.score)).toBeCloseTo(coverageForm, 10);
    }
  });
});

describe('downweightedAgents names agents that were actually down-weighted', () => {
  // The field is documented as "agents whose votes were down-weighted DUE TO
  // CORRELATION" and is surfaced to MCP. It used to be pushed for every
  // singleton — subset CARDINALITY, not weight. A singleton with an
  // independence score of 0 gets `1 * (1 - 0) = 1`, the same per-vote
  // multiplier everyone else receives.
  function vote(agentId: string): Vote {
    return { agentId, decision: 'approve', confidence: 1, reasoning: 'r' } as Vote;
  }

  function subset(id: string, agentIds: string[], independenceScore: number): IndependentSubset {
    const total = (agentIds.length * (agentIds.length - 1)) / 2;
    return {
      id,
      agentIds,
      independenceScore,
      pairCoverage: { observed: total, total },
      observationCount: 10,
    };
  }

  it('does not name a singleton whose weight equals its vote count', () => {
    const votes = new Map([
      ['a', vote('a')],
      ['b', vote('b')],
    ]);

    const { downweightedAgents } = aggregateSubsets(votes, [
      subset('s0', ['a'], 0),
      subset('s1', ['b'], 0),
    ]);

    expect(downweightedAgents).toEqual([]);
  });

  it('names a subset whose independence score actually reduces its weight', () => {
    // The pair. Without it, never naming anyone would pass.
    const votes = new Map([
      ['a', vote('a')],
      ['b', vote('b')],
    ]);

    const { downweightedAgents } = aggregateSubsets(votes, [subset('s0', ['a', 'b'], 0.5)]);

    expect(downweightedAgents).toEqual(['a', 'b']);
  });
});
