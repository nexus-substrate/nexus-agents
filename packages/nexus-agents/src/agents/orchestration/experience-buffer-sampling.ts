/**
 * Experience Buffer Sampling Strategies
 *
 * Sampling algorithms for the experience buffer including uniform
 * and priority-based sampling.
 *
 * @module agents/orchestration/experience-buffer-sampling
 * (Source: Issue #379, Issue #154, Issue #402)
 */

import { getRandomProvider } from '../../core/index.js';
import type {
  Episode,
  SampledBatch,
  StepWithEpisodeId,
  SampledStepWithProb,
} from './experience-buffer-types.js';

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Flattens all steps from episodes with their episode IDs.
 *
 * @param episodes - Array of episodes to flatten
 * @returns Array of steps with their associated episode IDs
 */
export function flattenStepsWithEpisodeIds(episodes: readonly Episode[]): StepWithEpisodeId[] {
  const result: StepWithEpisodeId[] = [];

  for (const episode of episodes) {
    for (const step of episode.steps) {
      result.push({ step, episodeId: episode.id });
    }
  }

  return result;
}

/**
 * Returns a random index weighted by probabilities.
 *
 * @param probabilities - Array of probabilities (should sum to 1)
 * @returns Selected index
 */
export function weightedRandomIndex(probabilities: readonly number[]): number {
  const random = getRandomProvider();
  const r = random.random();
  let cumulative = 0;

  for (let i = 0; i < probabilities.length; i++) {
    cumulative += probabilities[i] ?? 0;
    if (r < cumulative) {
      return i;
    }
  }

  return probabilities.length - 1;
}

// =============================================================================
// Uniform Sampling
// =============================================================================

/**
 * Samples steps uniformly at random using reservoir sampling (Algorithm R).
 * Optimized for O(k) memory where k = batchSize, instead of O(n) for full array copy.
 *
 * @param episodes - Array of episodes to sample from
 * @param batchSize - Number of steps to sample
 * @returns Sampled batch with uniform weights
 * @see Issue #402 - Performance optimization
 */
export function sampleUniformly(episodes: readonly Episode[], batchSize: number): SampledBatch {
  const random = getRandomProvider();
  // Use reservoir sampling to avoid full array materialization
  const reservoir: StepWithEpisodeId[] = [];
  let count = 0;

  for (const episode of episodes) {
    for (const step of episode.steps) {
      count++;
      if (reservoir.length < batchSize) {
        // Fill reservoir until we have enough samples
        reservoir.push({ step, episodeId: episode.id });
      } else {
        // Algorithm R: replace with probability k/n
        const j = random.randomInt(0, count);
        if (j < batchSize) {
          reservoir[j] = { step, episodeId: episode.id };
        }
      }
    }
  }

  return {
    steps: reservoir.map((s) => s.step),
    episodeIds: reservoir.map((s) => s.episodeId),
    weights: reservoir.map(() => 1.0),
  };
}

// =============================================================================
// Priority Sampling
// =============================================================================

/**
 * Computes priorities for steps based on absolute reward magnitude.
 * Uses reward as a proxy for TD error in prioritized experience replay.
 *
 * @param steps - Steps to compute priorities for
 * @param priorityExponent - Exponent for priority calculation (alpha)
 * @returns Array of priority values
 */
export function computePriorities(
  steps: readonly StepWithEpisodeId[],
  priorityExponent: number
): number[] {
  return steps.map((s) => Math.pow(Math.abs(s.step.reward) + 0.01, priorityExponent));
}

/**
 * Converts priorities to probability distribution.
 *
 * @param priorities - Array of priority values
 * @returns Array of probabilities (sums to 1)
 */
export function prioritiesToProbabilities(priorities: readonly number[]): number[] {
  const totalPriority = priorities.reduce((sum, p) => sum + p, 0);
  return priorities.map((p) => p / totalPriority);
}

/**
 * Computes importance sampling weights for prioritized samples.
 * Weights are normalized to [0, 1] range.
 *
 * @param sampled - Array of sampled steps with probabilities
 * @param totalSteps - Total number of steps in buffer
 * @returns Array of normalized importance weights
 */
export function computeImportanceWeights(
  sampled: readonly SampledStepWithProb[],
  totalSteps: number
): number[] {
  const maxWeight = 1.0 / (totalSteps * Math.min(...sampled.map((s) => s.prob)));

  return sampled.map((s) => {
    const weight = 1.0 / (totalSteps * s.prob);
    return weight / maxWeight; // Normalize to [0, 1]
  });
}

/**
 * Samples steps with priority based on absolute TD error (approximated by reward magnitude).
 * Note: This method uses full array flattening. For very large buffers,
 * consider using weighted reservoir sampling (Efraimidis & Spirakis algorithm).
 *
 * @param episodes - Array of episodes to sample from
 * @param batchSize - Number of steps to sample
 * @param priorityExponent - Exponent for priority calculation
 * @param totalStepsCount - Total number of steps in the buffer
 * @returns Sampled batch with importance weights
 * @see Issue #402 - Future optimization opportunity
 */
export function sampleWithPriority(
  episodes: readonly Episode[],
  batchSize: number,
  priorityExponent: number,
  totalStepsCount: number
): SampledBatch {
  const allStepsWithEpisode = flattenStepsWithEpisodeIds(episodes);

  // Compute priorities (using absolute reward as proxy for TD error)
  const priorities = computePriorities(allStepsWithEpisode, priorityExponent);
  const probabilities = prioritiesToProbabilities(priorities);

  // Sample with replacement according to probabilities
  const sampled: SampledStepWithProb[] = [];

  for (let i = 0; i < batchSize; i++) {
    const idx = weightedRandomIndex(probabilities);
    const item = allStepsWithEpisode[idx];
    if (item) {
      sampled.push({
        step: item.step,
        episodeId: item.episodeId,
        prob: probabilities[idx] ?? 1,
      });
    }
  }

  // Compute importance sampling weights
  const weights = computeImportanceWeights(sampled, totalStepsCount);

  return {
    steps: sampled.map((s) => s.step),
    episodeIds: sampled.map((s) => s.episodeId),
    weights,
  };
}
