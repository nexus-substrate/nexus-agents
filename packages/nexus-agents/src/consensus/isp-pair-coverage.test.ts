/**
 * An unobserved voter pair must not read as measured independence (#5813).
 *
 * `computeSubsetIndependenceScore` averages only the pairs PRESENT in the
 * correlation matrix, so a pair that has never co-voted is dropped from the
 * average rather than represented. A subset whose pairs were measured at 0 and
 * one whose pairs were never observed both score 0 — and 0 earns the maximum
 * posterior weight in `aggregateSubsets` (`size * (1 - score)`).
 *
 * The score is deliberately unchanged here: reweighting changes vote outcomes,
 * which is a decision for a panel rather than a disclosure fix. What changes is
 * that the record can now say how much of the subset it measured.
 */
import { describe, it, expect } from 'vitest';

import {
  computeSubsetIndependence,
  computeSubsetIndependenceScore,
} from './correlation-helpers.js';
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
    // a-c and a-d measured, c-d never co-voted. The score averages the two it
    // has; the coverage is what says the third is missing rather than zero.
    const result = computeSubsetIndependence(['a', 'c', 'd'], matrix({ 'a:c': 0.1, 'a:d': 0.1 }));

    expect(result.score).toBeCloseTo(0.1);
    expect(result.observedPairs).toBe(2);
    expect(result.totalPairs).toBe(3);
  });

  it('distinguishes measured-zero from never-observed', () => {
    // The property that matters. Both score 0; only the coverage tells them
    // apart, and 0 is the score that earns the maximum weight.
    const measuredZero = computeSubsetIndependence(['a', 'b'], matrix({ 'a:b': 0 }));
    const neverObserved = computeSubsetIndependence(['a', 'b'], matrix({}));

    expect(measuredZero.score).toBe(0);
    expect(neverObserved.score).toBe(0);
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

  it('keeps the original score function returning exactly what it did', () => {
    // The behaviour this change must NOT alter.
    expect(
      computeSubsetIndependenceScore(['a', 'c', 'd'], matrix({ 'a:c': 0.1, 'a:d': 0.1 }))
    ).toBeCloseTo(0.1);
    expect(computeSubsetIndependenceScore(['a'], matrix({}))).toBe(0);
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
