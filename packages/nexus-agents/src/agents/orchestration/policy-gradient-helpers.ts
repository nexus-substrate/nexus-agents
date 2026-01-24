/**
 * Policy Gradient Computation Helpers
 *
 * REINFORCE gradient computation utilities for learnable policy.
 * Extracted from learnable-policy.ts for modularity.
 *
 * @module agents/orchestration/policy-gradient-helpers
 * (Source: Issue #154, arXiv:2505.19591)
 */

import type { ScoringFeatures } from './policy-feature-extraction.js';
import type { PolicyTrajectoryStep } from './policy-types.js';
import { extractFeatures } from './policy-feature-extraction.js';

// =============================================================================
// Constants
// =============================================================================

/** Feature weight keys that can be learned. */
export const LEARNABLE_WEIGHTS = [
  'recency',
  'capability_match',
  'cost_efficiency',
  'pattern_match',
] as const;

export type LearnableWeightKey = (typeof LEARNABLE_WEIGHTS)[number];

// =============================================================================
// Gradient Computation State
// =============================================================================

/**
 * State tracked during gradient computation.
 */
export interface GradientState {
  baseline: number;
  lastGradientNorm: number;
}

// =============================================================================
// Returns Computation
// =============================================================================

/**
 * Compute discounted returns for each step in a trajectory.
 * Returns[t] = reward[t] + gamma * reward[t+1] + gamma^2 * reward[t+2] + ...
 *
 * @param trajectory - The trajectory steps
 * @param finalReward - The final reward at episode end
 * @param discountFactor - Gamma value for discounting future rewards
 * @returns Array of return values, one per step
 */
export function computeReturns(
  trajectory: readonly PolicyTrajectoryStep[],
  finalReward: number,
  discountFactor: number
): number[] {
  const returns: number[] = Array.from({ length: trajectory.length }, () => 0);

  // Bootstrap from final reward
  let runningReturn = finalReward;

  // Compute returns backwards
  for (let t = trajectory.length - 1; t >= 0; t--) {
    const step = trajectory[t];
    if (step !== undefined) {
      runningReturn = step.reward + discountFactor * runningReturn;
      returns[t] = runningReturn;
    }
  }

  return returns;
}

// =============================================================================
// Feature Value Extraction
// =============================================================================

/**
 * Extract feature values from scoring features for gradient computation.
 *
 * @param features - The extracted scoring features
 * @returns Record mapping feature names to numeric values
 */
export function extractFeatureValues(
  features: ScoringFeatures
): Record<LearnableWeightKey, number> {
  return {
    recency: features.recentAgents.length > 0 ? 0.5 : 1.0,
    capability_match: features.taskKeywords.length > 0 ? 0.8 : 0.2,
    cost_efficiency: 0.5, // Neutral default
    pattern_match: features.lastPattern !== undefined && features.lastPattern !== '' ? 0.7 : 0.3,
  };
}

// =============================================================================
// Gradient Computation
// =============================================================================

/**
 * Compute gradients across trajectory steps using REINFORCE.
 *
 * @param trajectory - The trajectory steps
 * @param returns - Discounted returns for each step
 * @param baseline - Current baseline for variance reduction
 * @returns Record mapping weight keys to gradient values
 */
export function computeGradients(
  trajectory: readonly PolicyTrajectoryStep[],
  returns: number[],
  baseline: number
): Record<string, number> {
  const gradients: Record<string, number> = {};
  for (const key of LEARNABLE_WEIGHTS) {
    gradients[key] = 0;
  }

  for (let t = 0; t < trajectory.length; t++) {
    const step = trajectory[t];
    const returnValue = returns[t];
    if (step === undefined || returnValue === undefined) continue;

    const advantage = returnValue - baseline;
    const features = extractFeatures(step.state);
    const featureValues = extractFeatureValues(features);

    for (const key of LEARNABLE_WEIGHTS) {
      const featureVal = featureValues[key];
      const currentGrad = gradients[key] ?? 0;
      gradients[key] = currentGrad + advantage * featureVal;
    }
  }

  // Normalize by trajectory length
  for (const key of LEARNABLE_WEIGHTS) {
    const currentGrad = gradients[key] ?? 0;
    gradients[key] = currentGrad / trajectory.length;
  }

  return gradients;
}

// =============================================================================
// Weight Update
// =============================================================================

/**
 * Normalize weights to sum to 1.
 *
 * @param weights - Raw weight values
 * @returns Normalized weights
 */
export function normalizeWeights(weights: Record<string, number>): Record<string, number> {
  const weightSum = Object.values(weights).reduce((s, w) => s + Math.abs(w), 0);
  if (weightSum === 0) return weights;

  const normalized = { ...weights };
  for (const key of Object.keys(normalized)) {
    const weight = normalized[key] ?? 0;
    normalized[key] = Math.abs(weight) / weightSum;
  }
  return normalized;
}

/**
 * Apply gradient update with clipping and weight normalization.
 *
 * @param gradients - Computed gradients
 * @param currentWeights - Current weight values
 * @param learningRate - Current learning rate
 * @param gradientClip - Maximum gradient norm
 * @returns Object containing new weights and gradient norm
 */
export function applyGradientUpdate(
  gradients: Record<string, number>,
  currentWeights: Record<string, number>,
  learningRate: number,
  gradientClip: number
): { weights: Record<string, number>; gradientNorm: number } {
  const gradNorm = Math.sqrt(Object.values(gradients).reduce((sum, g) => sum + g * g, 0));
  const clipRatio = gradNorm > gradientClip ? gradientClip / gradNorm : 1.0;

  const newWeights = { ...currentWeights };
  for (const key of LEARNABLE_WEIGHTS) {
    const currentWeight = newWeights[key] ?? 0;
    const gradient = gradients[key] ?? 0;
    newWeights[key] = currentWeight + learningRate * gradient * clipRatio;
  }

  return {
    weights: normalizeWeights(newWeights),
    gradientNorm: gradNorm,
  };
}
