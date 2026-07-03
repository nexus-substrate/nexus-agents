/**
 * nexus-agents/cli-adapters - ZeroRouter Types
 *
 * Type definitions for the ZeroRouter universal difficulty space routing.
 * ZeroRouter creates a unified difficulty metric across diverse task types,
 * enabling better model selection across domains.
 *
 * @module cli-adapters/zero-router-types
 * (Source: Issue #338)
 */

import { z } from 'zod';
import type { CliName } from './types-core.js';
import { deriveTierToClis } from './derive-tier-tables.js';

/**
 * Difficulty dimensions for task analysis.
 * Each dimension represents a different aspect of task difficulty.
 */
export const DifficultyDimensionSchema = z.enum([
  'reasoning',
  'knowledge',
  'creativity',
  'precision',
  'context_length',
]);

export type DifficultyDimension = z.infer<typeof DifficultyDimensionSchema>;

/**
 * All difficulty dimensions for iteration.
 */
export const DIFFICULTY_DIMENSIONS: readonly DifficultyDimension[] = [
  'reasoning',
  'knowledge',
  'creativity',
  'precision',
  'context_length',
] as const;

/**
 * Difficulty space representation (normalized 0-1 across all dimensions).
 */
export const DifficultySpaceSchema = z.object({
  /** Reasoning difficulty: logical complexity, multi-step inference (0-1) */
  reasoning: z.number().min(0).max(1),
  /** Knowledge difficulty: domain expertise required (0-1) */
  knowledge: z.number().min(0).max(1),
  /** Creativity difficulty: novel generation, open-endedness (0-1) */
  creativity: z.number().min(0).max(1),
  /** Precision difficulty: accuracy requirements, error tolerance (0-1) */
  precision: z.number().min(0).max(1),
  /** Context length difficulty: amount of context to process (0-1) */
  context_length: z.number().min(0).max(1),
});

export type DifficultySpace = z.infer<typeof DifficultySpaceSchema>;

/**
 * Difficulty level classification based on aggregate score.
 */
export type DifficultyLevel = 'easy' | 'medium' | 'hard';

/**
 * Threshold configuration type.
 */
export interface DifficultyThresholds {
  readonly easyUpperBound: number;
  readonly hardLowerBound: number;
}

/**
 * Default difficulty thresholds for classification.
 * - easy: aggregate difficulty < 0.3
 * - medium: aggregate difficulty 0.3 - 0.7
 * - hard: aggregate difficulty > 0.7
 */
export const DEFAULT_DIFFICULTY_THRESHOLDS: DifficultyThresholds = {
  easyUpperBound: 0.3,
  hardLowerBound: 0.7,
};

/**
 * Model tier based on capability/cost trade-off.
 */
export type ModelTier = 'fast' | 'balanced' | 'powerful';

/**
 * Mapping from difficulty level to recommended model tier.
 */
export const DEFAULT_DIFFICULTY_TO_TIER: Record<DifficultyLevel, ModelTier> = {
  easy: 'fast',
  medium: 'balanced',
  hard: 'powerful',
} as const;

/**
 * Mapping from model tier to CLI preference order.
 *
 * DERIVED from each CLI's default-model `qualityScores` + real registry pricing
 * (#4195) — no longer a hand-maintained literal. `powerful` leads with the
 * strongest premium default and EXCLUDES any CLI whose default lacks
 * qualityScores (fail-safe: an unvetted model never fronts the powerful tier);
 * `fast` leads with the fastest/cheapest; `balanced` with the best quality/cost
 * blend. Ordering is deterministic (stable, explicit tie-breaks).
 */
export const DEFAULT_TIER_TO_CLIS: Record<ModelTier, CliName[]> = deriveTierToClis();

/**
 * Weight configuration for difficulty aggregation.
 */
export const DifficultyWeightsSchema = z.object({
  reasoning: z.number().min(0).max(1),
  knowledge: z.number().min(0).max(1),
  creativity: z.number().min(0).max(1),
  precision: z.number().min(0).max(1),
  context_length: z.number().min(0).max(1),
});

export type DifficultyWeights = z.infer<typeof DifficultyWeightsSchema>;

/**
 * Default weights for difficulty aggregation.
 * Reasoning and precision weighted higher as they most impact model selection.
 */
export const DEFAULT_DIFFICULTY_WEIGHTS: DifficultyWeights = {
  reasoning: 0.3,
  knowledge: 0.15,
  creativity: 0.15,
  precision: 0.25,
  context_length: 0.15,
} as const;

/**
 * Result of difficulty estimation.
 */
export interface DifficultyEstimate {
  /** Difficulty values per dimension (all 0-1) */
  readonly dimensions: DifficultySpace;
  /** Aggregated difficulty score (0-1) */
  readonly aggregateScore: number;
  /** Classified difficulty level */
  readonly level: DifficultyLevel;
  /** Recommended model tier based on difficulty */
  readonly recommendedTier: ModelTier;
  /** Confidence in the estimate (0-1) */
  readonly confidence: number;
  /** Dominant difficulty dimension */
  readonly dominantDimension: DifficultyDimension;
}

/**
 * Outcome record for calibration.
 */
export interface DifficultyOutcome {
  /** Task content hash (for deduplication) */
  readonly taskHash: string;
  /** Estimated difficulty at routing time */
  readonly estimatedDifficulty: number;
  /** CLI that was selected */
  readonly selectedCli: CliName;
  /** Whether the task succeeded */
  readonly success: boolean;
  /** Quality score if available (0-1) */
  readonly qualityScore?: number;
  /** Actual execution time in ms */
  readonly executionTimeMs?: number;
  /** Timestamp of the outcome */
  readonly timestamp: number;
}

/**
 * Calibration statistics for self-improvement.
 */
export interface CalibrationStats {
  /** Total outcomes recorded */
  readonly totalOutcomes: number;
  /** Mean absolute error of difficulty estimates */
  readonly meanAbsoluteError: number;
  /** Correlation between estimated difficulty and actual success rate */
  readonly difficultySuccessCorrelation: number;
  /** Success rate by difficulty level */
  readonly successRateByLevel: Readonly<Record<DifficultyLevel, number>>;
  /** Average quality score by difficulty level */
  readonly avgQualityByLevel: Readonly<Record<DifficultyLevel, number>>;
  /** Calibration bias (-1 to 1, negative = underestimating difficulty) */
  readonly calibrationBias: number;
}

/**
 * Configuration for ZeroRouter.
 */
export const ZeroRouterConfigSchema = z.object({
  /** Difficulty thresholds for level classification */
  thresholds: z
    .object({
      easyUpperBound: z.number().min(0).max(1),
      hardLowerBound: z.number().min(0).max(1),
    })
    .default(DEFAULT_DIFFICULTY_THRESHOLDS),
  /** Weights for difficulty aggregation */
  weights: DifficultyWeightsSchema.default(DEFAULT_DIFFICULTY_WEIGHTS),
  /** Mapping from difficulty level to model tier */
  difficultyToTier: z
    .record(z.enum(['easy', 'medium', 'hard']), z.enum(['fast', 'balanced', 'powerful']))
    .default(DEFAULT_DIFFICULTY_TO_TIER),
  /** Mapping from model tier to CLI preference order */
  tierToClis: z
    .record(
      z.enum(['fast', 'balanced', 'powerful']),
      z.array(z.enum(['claude', 'gemini', 'codex', 'opencode']))
    )
    .default(DEFAULT_TIER_TO_CLIS),
  /** Enable adaptive calibration from outcomes */
  enableCalibration: z.boolean().default(true),
  /** Maximum outcomes to store for calibration */
  maxCalibrationOutcomes: z.number().int().positive().default(1000),
  /** Minimum outcomes before applying calibration adjustments */
  minCalibrationOutcomes: z.number().int().positive().default(50),
  /** Verbose logging */
  verbose: z.boolean().default(false),
});

export type ZeroRouterConfig = z.infer<typeof ZeroRouterConfigSchema>;

/**
 * Default ZeroRouter configuration.
 */
export const DEFAULT_ZERO_ROUTER_CONFIG: ZeroRouterConfig = {
  thresholds: DEFAULT_DIFFICULTY_THRESHOLDS,
  weights: DEFAULT_DIFFICULTY_WEIGHTS,
  difficultyToTier: DEFAULT_DIFFICULTY_TO_TIER,
  tierToClis: DEFAULT_TIER_TO_CLIS,
  enableCalibration: true,
  maxCalibrationOutcomes: 1000,
  minCalibrationOutcomes: 50,
  verbose: false,
};

/**
 * Routing decision from ZeroRouter.
 */
export interface ZeroRoutingDecision {
  /** Estimated difficulty */
  readonly difficulty: DifficultyEstimate;
  /** Selected CLI based on difficulty */
  readonly selectedCli: CliName;
  /** Recommended model tier */
  readonly tier: ModelTier;
  /** Alternative CLIs in preference order */
  readonly alternatives: readonly CliName[];
  /** Reasoning for the decision */
  readonly reason: string;
  /** Whether calibration was applied */
  readonly calibrationApplied: boolean;
  /** Calibration adjustment applied (if any) */
  readonly calibrationAdjustment?: number | undefined;
}

/**
 * Error from ZeroRouter operations.
 */
export class ZeroRoutingError extends Error {
  readonly code: 'ESTIMATION_FAILED' | 'CALIBRATION_FAILED' | 'NO_AVAILABLE_CLIS';

  constructor(message: string, code: ZeroRoutingError['code'], cause?: Error) {
    super(message, { cause });
    this.name = 'ZeroRoutingError';
    this.code = code;
  }
}
