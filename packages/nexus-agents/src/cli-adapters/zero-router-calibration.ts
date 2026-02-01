/**
 * nexus-agents/cli-adapters - ZeroRouter Calibration Helpers
 *
 * Helper functions for ZeroRouter calibration and statistics.
 * Extracted from zero-router.ts to maintain file size limits.
 *
 * @module cli-adapters/zero-router-calibration
 * (Source: Issue #338, #339)
 */

import type {
  DifficultyOutcome,
  DifficultyLevel,
  DifficultyThresholds,
} from './zero-router-types.js';
import { classifyDifficultyLevel } from './difficulty-space.js';
import { clamp } from '../utils/math-utils.js';

/**
 * Groups outcomes by difficulty level.
 */
export function groupOutcomesByLevel(
  outcomes: readonly DifficultyOutcome[],
  thresholds: DifficultyThresholds
): Record<DifficultyLevel, DifficultyOutcome[]> {
  const groups: Record<DifficultyLevel, DifficultyOutcome[]> = {
    easy: [],
    medium: [],
    hard: [],
  };

  for (const outcome of outcomes) {
    const level = classifyDifficultyLevel(outcome.estimatedDifficulty, thresholds);
    groups[level].push(outcome);
  }

  return groups;
}

/**
 * Calculates success rate for each difficulty level.
 */
export function calculateSuccessRateByLevel(
  groups: Record<DifficultyLevel, readonly DifficultyOutcome[]>
): Record<DifficultyLevel, number> {
  const result: Record<DifficultyLevel, number> = { easy: 0, medium: 0, hard: 0 };

  for (const level of ['easy', 'medium', 'hard'] as DifficultyLevel[]) {
    const levelOutcomes = groups[level];
    if (levelOutcomes.length > 0) {
      const successes = levelOutcomes.filter((o) => o.success).length;
      result[level] = successes / levelOutcomes.length;
    }
  }

  return result;
}

/**
 * Calculates average quality score for each difficulty level.
 */
export function calculateAvgQualityByLevel(
  groups: Record<DifficultyLevel, readonly DifficultyOutcome[]>
): Record<DifficultyLevel, number> {
  const result: Record<DifficultyLevel, number> = { easy: 0, medium: 0, hard: 0 };

  for (const level of ['easy', 'medium', 'hard'] as DifficultyLevel[]) {
    const levelOutcomes = groups[level];
    const withQuality = levelOutcomes.filter((o) => o.qualityScore !== undefined);
    if (withQuality.length > 0) {
      const qualitySum = withQuality.reduce((sum, o) => sum + (o.qualityScore ?? 0), 0);
      result[level] = qualitySum / withQuality.length;
    }
  }

  return result;
}

/**
 * Calculates mean absolute error between estimated and actual difficulty.
 */
export function calculateMeanAbsoluteError(outcomes: readonly DifficultyOutcome[]): number {
  if (outcomes.length === 0) return 0;

  // MAE between estimated difficulty and inferred actual difficulty
  let totalError = 0;
  for (const outcome of outcomes) {
    // Use quality score as proxy for actual difficulty if available
    // Otherwise, use success as binary indicator
    const actualDifficulty =
      outcome.qualityScore !== undefined
        ? 1 - outcome.qualityScore // High quality = easier task
        : outcome.success
          ? 0.3 // Success suggests reasonable difficulty
          : 0.8; // Failure suggests high difficulty

    totalError += Math.abs(outcome.estimatedDifficulty - actualDifficulty);
  }

  return totalError / outcomes.length;
}

/**
 * Calculates Pearson correlation between difficulty and success rate.
 * Negative correlation expected: higher difficulty = lower success.
 */
export function calculateDifficultySuccessCorrelation(
  outcomes: readonly DifficultyOutcome[]
): number {
  if (outcomes.length < 2) return 0;

  // Calculate Pearson correlation between difficulty and success rate
  const difficulties = outcomes.map((o) => o.estimatedDifficulty);
  const successes: number[] = outcomes.map((o) => (o.success ? 1 : 0));

  const n = difficulties.length;
  const sumD = difficulties.reduce((a, b) => a + b, 0);
  const sumS = successes.reduce((a: number, b: number) => a + b, 0);
  const sumDS = difficulties.reduce((sum, d, i) => sum + d * (successes[i] ?? 0), 0);
  const sumD2 = difficulties.reduce((sum, d) => sum + d * d, 0);
  const sumS2 = successes.reduce((sum: number, s: number) => sum + s * s, 0);

  const numerator = n * sumDS - sumD * sumS;
  const denominator = Math.sqrt((n * sumD2 - sumD * sumD) * (n * sumS2 - sumS * sumS));

  if (denominator === 0) return 0;

  return numerator / denominator;
}

/**
 * Updates calibration bias based on recorded outcomes.
 *
 * @param outcomes - Array of recorded outcomes
 * @returns New calibration bias value (clamped to [-0.2, 0.2])
 */
export function calculateCalibrationBias(outcomes: readonly DifficultyOutcome[]): number {
  if (outcomes.length < 10) {
    return 0;
  }

  // Calculate bias: difference between estimated and actual difficulty
  // Actual difficulty is inferred from success rate
  // Low success = task was harder than estimated (positive bias needed)
  // High success = task was easier than estimated (negative bias needed)

  let biasSum = 0;
  let count = 0;

  for (const outcome of outcomes) {
    // Infer actual difficulty from success (failure indicates harder task)
    const actualDifficulty = outcome.success ? outcome.estimatedDifficulty : 1.0;
    const error = actualDifficulty - outcome.estimatedDifficulty;
    biasSum += error;
    count++;
  }

  // Small learning rate to prevent overcorrection
  const learningRate = 0.1;
  const rawBias = count > 0 ? biasSum / count : 0;
  const bias = rawBias * learningRate;

  // Clamp bias to reasonable range
  return clamp(bias, -0.2, 0.2);
}

/**
 * Simple hash function for task deduplication.
 */
export function hashTaskContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/**
 * Options for building routing reason string.
 */
export interface BuildRoutingReasonOptions {
  readonly level: DifficultyLevel;
  readonly aggregateScore: number;
  readonly dominantDimension: string;
  readonly recommendedTier: string;
  readonly selectedCli: string;
  readonly calibrationApplied: boolean;
  readonly calibrationBias: number;
}

/**
 * Builds routing reason string.
 */
export function buildRoutingReason(options: BuildRoutingReasonOptions): string {
  const parts: string[] = [];

  parts.push(`Difficulty: ${options.level} (${(options.aggregateScore * 100).toFixed(1)}%)`);
  parts.push(`Dominant: ${options.dominantDimension}`);
  parts.push(`Tier: ${options.recommendedTier} → ${options.selectedCli}`);

  if (options.calibrationApplied) {
    parts.push(
      `(calibrated: ${options.calibrationBias > 0 ? '+' : ''}${(options.calibrationBias * 100).toFixed(1)}%)`
    );
  }

  return parts.join(' | ');
}
