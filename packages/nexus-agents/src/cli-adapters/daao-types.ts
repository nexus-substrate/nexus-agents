/**
 * nexus-agents/cli-adapters - DAAO Types
 *
 * Type definitions for Difficulty-Aware Agent Orchestration (DAAO).
 * DAAO uses VAE-inspired feature encoding to estimate task difficulty
 * for intelligent model routing.
 *
 * @module cli-adapters/daao-types
 * (Source: Issue #334, arXiv:2509.11079)
 */

import { z } from 'zod';
import type { CliName } from './types-core.js';
import type { DifficultyLevel, ModelTier } from './zero-router-types.js';

// ============================================================================
// Feature Encoding Types (VAE-inspired)
// ============================================================================

/**
 * Encoded feature vector from task content.
 * Mimics VAE latent space representation using interpretable features.
 */
export const EncodedFeaturesSchema = z.object({
  /** Lexical complexity score (vocabulary diversity, rare words) */
  lexicalComplexity: z.number().min(0).max(1),
  /** Syntactic complexity score (sentence structure, nesting) */
  syntacticComplexity: z.number().min(0).max(1),
  /** Semantic density score (concept density, abstraction level) */
  semanticDensity: z.number().min(0).max(1),
  /** Technical specificity (domain-specific terminology) */
  technicalSpecificity: z.number().min(0).max(1),
  /** Task scope (breadth of requirements) */
  taskScope: z.number().min(0).max(1),
  /** Constraint complexity (constraints, edge cases, requirements) */
  constraintComplexity: z.number().min(0).max(1),
  /** Ambiguity level (inverse - higher means more clear/specific) */
  clarity: z.number().min(0).max(1),
  /** Output complexity expectation */
  outputComplexity: z.number().min(0).max(1),
});

export type EncodedFeatures = z.infer<typeof EncodedFeaturesSchema>;

/**
 * All feature dimensions for iteration.
 */
export const FEATURE_DIMENSIONS = [
  'lexicalComplexity',
  'syntacticComplexity',
  'semanticDensity',
  'technicalSpecificity',
  'taskScope',
  'constraintComplexity',
  'clarity',
  'outputComplexity',
] as const;

export type FeatureDimension = (typeof FEATURE_DIMENSIONS)[number];

// ============================================================================
// Difficulty Estimation Types
// ============================================================================

/**
 * DAAO difficulty estimate result.
 */
export interface DAAODifficultyEstimate {
  /** Raw encoded features from the task */
  readonly features: EncodedFeatures;
  /** Aggregate difficulty score (0-1) */
  readonly score: number;
  /** Difficulty level classification */
  readonly level: DifficultyLevel;
  /** Recommended model tier */
  readonly recommendedTier: ModelTier;
  /** Confidence in the estimate (0-1) */
  readonly confidence: number;
  /** Dominant feature dimension */
  readonly dominantFeature: FeatureDimension;
  /** Reconstruction error (lower = more typical task pattern) */
  readonly reconstructionError: number;
}

/**
 * Feature weights for difficulty aggregation.
 */
export const FeatureWeightsSchema = z.object({
  lexicalComplexity: z.number().min(0).max(1),
  syntacticComplexity: z.number().min(0).max(1),
  semanticDensity: z.number().min(0).max(1),
  technicalSpecificity: z.number().min(0).max(1),
  taskScope: z.number().min(0).max(1),
  constraintComplexity: z.number().min(0).max(1),
  clarity: z.number().min(0).max(1),
  outputComplexity: z.number().min(0).max(1),
});

export type FeatureWeights = z.infer<typeof FeatureWeightsSchema>;

/**
 * Default feature weights for difficulty aggregation.
 * Weights reflect impact on model selection.
 */
export const DEFAULT_FEATURE_WEIGHTS: FeatureWeights = {
  lexicalComplexity: 0.1,
  syntacticComplexity: 0.1,
  semanticDensity: 0.15,
  technicalSpecificity: 0.15,
  taskScope: 0.15,
  constraintComplexity: 0.15,
  clarity: 0.1, // Inverted - high clarity reduces difficulty
  outputComplexity: 0.1,
} as const;

// ============================================================================
// Routing Types
// ============================================================================

/**
 * DAAO routing decision result.
 */
export interface DAAORoutingDecision {
  /** Difficulty estimate */
  readonly estimate: DAAODifficultyEstimate;
  /** Selected CLI for the task */
  readonly selectedCli: CliName;
  /** Recommended model tier */
  readonly tier: ModelTier;
  /** Alternative CLIs in preference order */
  readonly alternatives: readonly CliName[];
  /** Human-readable routing reason */
  readonly reason: string;
  /** Whether the task pattern is well-understood */
  readonly isTypicalPattern: boolean;
}

// ============================================================================
// Calibration Types
// ============================================================================

/**
 * Outcome record for DAAO calibration.
 */
export interface DAAOOutcome {
  /** Task content hash for deduplication */
  readonly taskHash: string;
  /** Encoded features at estimation time */
  readonly features: EncodedFeatures;
  /** Estimated difficulty score */
  readonly estimatedScore: number;
  /** Selected CLI */
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
 * Calibration statistics for DAAO.
 */
export interface DAAOCalibrationStats {
  /** Total outcomes recorded */
  readonly totalOutcomes: number;
  /** Mean absolute error of estimates */
  readonly meanAbsoluteError: number;
  /** Success rate by difficulty level */
  readonly successRateByLevel: Readonly<Record<DifficultyLevel, number>>;
  /** Average reconstruction error */
  readonly avgReconstructionError: number;
  /** Feature importance ranking */
  readonly featureImportance: readonly FeatureDimension[];
  /** Calibration bias (-1 to 1) */
  readonly calibrationBias: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Difficulty thresholds for DAAO.
 */
export interface DAAOThresholds {
  readonly easyUpperBound: number;
  readonly hardLowerBound: number;
}

/**
 * Default DAAO difficulty thresholds.
 */
export const DEFAULT_DAAO_THRESHOLDS: DAAOThresholds = {
  easyUpperBound: 0.35,
  hardLowerBound: 0.65,
} as const;

/**
 * Default tier to CLI mapping for DAAO.
 */
export const DEFAULT_DAAO_TIER_TO_CLIS: Record<ModelTier, CliName[]> = {
  fast: ['gemini', 'codex', 'claude'],
  balanced: ['codex', 'gemini', 'claude'],
  powerful: ['claude', 'codex', 'gemini'],
} as const;

/**
 * DAAO configuration schema.
 */
export const DAAOConfigSchema = z.object({
  /** Difficulty thresholds for level classification */
  thresholds: z
    .object({
      easyUpperBound: z.number().min(0).max(1),
      hardLowerBound: z.number().min(0).max(1),
    })
    .default(DEFAULT_DAAO_THRESHOLDS),
  /** Feature weights for difficulty aggregation */
  weights: FeatureWeightsSchema.default(DEFAULT_FEATURE_WEIGHTS),
  /** Mapping from model tier to CLI preference order */
  tierToClis: z
    .record(
      z.enum(['fast', 'balanced', 'powerful']),
      z.array(z.enum(['claude', 'gemini', 'codex']))
    )
    .default(DEFAULT_DAAO_TIER_TO_CLIS),
  /** Enable adaptive calibration from outcomes */
  enableCalibration: z.boolean().default(true),
  /** Maximum outcomes to store for calibration */
  maxCalibrationOutcomes: z.number().int().positive().default(1000),
  /** Minimum outcomes before applying calibration adjustments */
  minCalibrationOutcomes: z.number().int().positive().default(50),
  /** Reconstruction error threshold for typical patterns */
  typicalPatternThreshold: z.number().min(0).max(1).default(0.3),
  /** Verbose logging */
  verbose: z.boolean().default(false),
});

export type DAAOConfig = z.infer<typeof DAAOConfigSchema>;

/**
 * Default DAAO configuration.
 */
export const DEFAULT_DAAO_CONFIG: DAAOConfig = {
  thresholds: DEFAULT_DAAO_THRESHOLDS,
  weights: DEFAULT_FEATURE_WEIGHTS,
  tierToClis: DEFAULT_DAAO_TIER_TO_CLIS,
  enableCalibration: true,
  maxCalibrationOutcomes: 1000,
  minCalibrationOutcomes: 50,
  typicalPatternThreshold: 0.3,
  verbose: false,
};

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error from DAAO operations.
 */
export class DAAOError extends Error {
  readonly code: 'ENCODING_FAILED' | 'ESTIMATION_FAILED' | 'NO_AVAILABLE_CLIS';

  constructor(message: string, code: DAAOError['code'], cause?: Error) {
    super(message, { cause });
    this.name = 'DAAOError';
    this.code = code;
  }
}
