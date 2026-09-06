/**
 * How independent a subset of agents is, and how much of it was measured.
 *
 * Its own module because the score and its coverage are one fact: the score
 * averages only the pairs present in the correlation matrix, so without the
 * coverage a subset whose pairs were MEASURED at 0 is indistinguishable from
 * one whose pairs were NEVER OBSERVED — and 0 earns the maximum posterior
 * weight in `aggregateSubsets`.
 *
 * @module consensus/subset-independence
 */
import type { CorrelationMatrix } from './higher-order-types.js';
import { createAgentPairKey } from './higher-order-types.js';

/**
 * The independence score AND how much of the subset it was measured over.
 *
 * The score averages only the pairs present in the matrix, so a pair that has
 * never co-voted is dropped from the average rather than represented. A subset
 * whose pairs were MEASURED at 0 and one whose pairs were NEVER OBSERVED both
 * score 0 — and 0 earns the maximum posterior weight in `aggregateSubsets`
 * (`size * (1 - score)`). The coverage is what lets a consumer tell them apart;
 * it does not change the score, because changing the weighting changes vote
 * outcomes and that is a decision for a panel, not a disclosure fix (#5813).
 *
 * `total` is C(n,2), so a singleton reports `{ observed: 0, total: 0 }`: no pair
 * exists to observe, and its score is not a measurement at all.
 */
export function computeSubsetIndependence(
  subset: readonly string[],
  correlationMatrix: CorrelationMatrix
): { score: number; observedPairs: number; totalPairs: number } {
  const totalPairs = (subset.length * (subset.length - 1)) / 2;
  if (subset.length < 2) return { score: 0, observedPairs: 0, totalPairs };

  let totalCorrelation = 0;
  let pairs = 0;

  for (let i = 0; i < subset.length; i++) {
    for (let j = i + 1; j < subset.length; j++) {
      const agentA = subset[i];
      const agentB = subset[j];
      if (agentA !== undefined && agentB !== undefined) {
        const pairKey = createAgentPairKey(agentA, agentB);
        const correlation = correlationMatrix.get(pairKey);
        if (correlation !== undefined) {
          totalCorrelation += Math.abs(correlation);
          pairs++;
        }
      }
    }
  }

  return {
    score: pairs > 0 ? totalCorrelation / pairs : 0,
    observedPairs: pairs,
    totalPairs,
  };
}
