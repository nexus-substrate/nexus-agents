/**
 * nexus-agents/cli-adapters - Difficulty Space
 *
 * Functions for mapping tasks to the universal difficulty space.
 * Each dimension is normalized to 0-1 for consistent comparison.
 *
 * @module cli-adapters/difficulty-space
 * (Source: Issue #338)
 */

import type { CliTask } from './types-capability.js';
import type { TaskProfile } from './task-analyzer.js';
import {
  type DifficultySpace,
  type DifficultyDimension,
  type DifficultyWeights,
  type DifficultyLevel,
  type DifficultyThresholds,
  DIFFICULTY_DIMENSIONS,
  DEFAULT_DIFFICULTY_WEIGHTS,
  DEFAULT_DIFFICULTY_THRESHOLDS,
} from './zero-router-types.js';

// Re-export dimension estimators for backward compatibility
export {
  estimateReasoningDifficulty,
  estimateKnowledgeDifficulty,
  estimateCreativityDifficulty,
  estimatePrecisionDifficulty,
  estimateContextLengthDifficulty,
} from './difficulty-estimators.js';

// Import for internal use
import {
  estimateReasoningDifficulty,
  estimateKnowledgeDifficulty,
  estimateCreativityDifficulty,
  estimatePrecisionDifficulty,
  estimateContextLengthDifficulty,
} from './difficulty-estimators.js';

// ============================================================================
// Normalization Functions
// ============================================================================

/**
 * Normalizes a value to the 0-1 range.
 *
 * @param value - Value to normalize
 * @param min - Minimum expected value
 * @param max - Maximum expected value
 * @returns Normalized value between 0 and 1
 */
export function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5;
  const normalized = (value - min) / (max - min);
  return Math.max(0, Math.min(1, normalized));
}

// ============================================================================
// Main Estimation Functions
// ============================================================================

/**
 * Maps a task to the universal difficulty space.
 *
 * @param task - CLI task to analyze
 * @param profile - Optional pre-computed task profile
 * @returns Difficulty space with all dimensions normalized to 0-1
 */
export function estimateDifficultySpace(task: CliTask, profile?: TaskProfile): DifficultySpace {
  const content = task.content + (task.systemPrompt ?? '');

  return {
    reasoning: estimateReasoningDifficulty(content, profile),
    knowledge: estimateKnowledgeDifficulty(content, profile),
    creativity: estimateCreativityDifficulty(content, profile),
    precision: estimatePrecisionDifficulty(content, profile),
    context_length: estimateContextLengthDifficulty(content, profile),
  };
}

/**
 * Aggregates difficulty dimensions into a single score.
 *
 * @param space - Difficulty space to aggregate
 * @param weights - Weights for each dimension (should sum to 1)
 * @returns Aggregate difficulty score (0-1)
 */
export function aggregateDifficulty(
  space: DifficultySpace,
  weights: DifficultyWeights = DEFAULT_DIFFICULTY_WEIGHTS
): number {
  let sum = 0;
  let weightSum = 0;

  for (const dim of DIFFICULTY_DIMENSIONS) {
    sum += space[dim] * weights[dim];
    weightSum += weights[dim];
  }

  // Normalize by weight sum to handle non-normalized weights
  return weightSum > 0 ? sum / weightSum : 0;
}

/**
 * Finds the dominant (highest) difficulty dimension.
 *
 * @param space - Difficulty space to analyze
 * @returns The dimension with highest difficulty
 */
export function findDominantDimension(space: DifficultySpace): DifficultyDimension {
  let maxDim: DifficultyDimension = 'reasoning';
  let maxValue = space.reasoning;

  for (const dim of DIFFICULTY_DIMENSIONS) {
    if (space[dim] > maxValue) {
      maxValue = space[dim];
      maxDim = dim;
    }
  }

  return maxDim;
}

/**
 * Classifies aggregate difficulty into a level.
 *
 * @param aggregateScore - Aggregate difficulty score (0-1)
 * @param thresholds - Optional custom thresholds
 * @returns Difficulty level classification
 */
export function classifyDifficultyLevel(
  aggregateScore: number,
  thresholds: DifficultyThresholds = DEFAULT_DIFFICULTY_THRESHOLDS
): DifficultyLevel {
  if (aggregateScore < thresholds.easyUpperBound) {
    return 'easy';
  }
  if (aggregateScore > thresholds.hardLowerBound) {
    return 'hard';
  }
  return 'medium';
}

/**
 * Calculates confidence in the difficulty estimate.
 * Higher when dimensions are consistent, lower when spread out.
 *
 * @param space - Difficulty space to analyze
 * @returns Confidence score (0-1)
 */
export function calculateEstimateConfidence(space: DifficultySpace): number {
  const values = DIFFICULTY_DIMENSIONS.map((dim) => space[dim]);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;

  // Calculate standard deviation
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  // Lower variance = higher confidence
  // Max stdDev for 0-1 values is ~0.5
  const normalizedStdDev = stdDev / 0.5;
  const confidence = 1 - normalizedStdDev;

  return Math.max(0, Math.min(1, confidence));
}

/**
 * Creates a human-readable summary of the difficulty space.
 *
 * @param space - Difficulty space to summarize
 * @returns Human-readable summary string
 */
export function summarizeDifficultySpace(space: DifficultySpace): string {
  const parts: string[] = [];

  for (const dim of DIFFICULTY_DIMENSIONS) {
    const value = space[dim];
    const level = value < 0.3 ? 'low' : value > 0.7 ? 'high' : 'med';
    parts.push(`${dim}:${level}`);
  }

  return parts.join(' | ');
}
