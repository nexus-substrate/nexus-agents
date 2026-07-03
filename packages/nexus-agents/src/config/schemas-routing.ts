/**
 * nexus-agents/config - Routing Configuration Schemas
 *
 * Zod schemas for routing configuration exposed via nexus-agents.yaml.
 * Allows users to configure the CompositeRouter pipeline, TOPSIS criteria,
 * ZeroRouter thresholds, and other routing parameters.
 *
 * @module config/schemas-routing
 * (Source: Issue #475 - Add routing configuration section to nexus-agents.yaml)
 */

import { z } from 'zod';
import { CliNameSchema } from './model-capabilities-types.js';
import { TaskCategorySchema } from './task-specialization-types.js';

/**
 * Budget constraints schema for cost/token/latency limits.
 */
export const BudgetConstraintsSchema = z
  .object({
    /** Maximum tokens per request */
    maxTokens: z.number().positive().optional(),
    /** Maximum cost per request in USD */
    maxCostUsd: z.number().positive().optional(),
    /** Maximum latency per request in milliseconds */
    maxLatencyMs: z.number().positive().optional(),
    /**
     * Per-task-class cost ceilings in USD, keyed by `TaskCategory`
     * (#4196, #4214). Keys are validated against the enum so a typo'd
     * class fails config parsing instead of silently configuring nothing.
     * Absent → no ceiling (OFF/unlimited). Enforced only under
     * `NEXUS_BILLING_MODE=api`; a candidate with missing registry pricing
     * fails a configured ceiling (fail-closed).
     */
    taskClassMaxCostUsd: z.partialRecord(TaskCategorySchema, z.number().positive()).optional(),
  })
  .optional();

export type BudgetConstraints = z.infer<typeof BudgetConstraintsSchema>;

/**
 * TOPSIS criterion schema for multi-criteria decision making.
 */
export const TopsisCriterionSchema = z.object({
  /** Criterion name (e.g., 'quality', 'cost', 'latency') */
  name: z.string().min(1),
  /** Weight for this criterion (0-1, should sum to 1 across all criteria) */
  weight: z.number().min(0).max(1),
  /** Whether higher values are better (true) or lower is better (false) */
  beneficial: z.boolean(),
});

export type TopsisCriterion = z.infer<typeof TopsisCriterionSchema>;

/**
 * TOPSIS configuration schema.
 */
export const TopsisConfigSchema = z
  .object({
    /** Criteria with weights (must sum to 1.0) */
    criteria: z.array(TopsisCriterionSchema).optional(),
    /** Minimum acceptable quality score (0-10) */
    minQualityThreshold: z.number().min(0).max(10).default(5),
    /** Maximum acceptable latency in milliseconds (optional) */
    maxLatencyMs: z.number().positive().optional(),
    /** Maximum acceptable cost per request in USD (optional) */
    maxCostPerRequest: z.number().positive().optional(),
    /** Whether to log detailed scoring info */
    verbose: z.boolean().default(false),
  })
  .optional();

export type TopsisConfig = z.infer<typeof TopsisConfigSchema>;

/**
 * Difficulty weights schema for ZeroRouter aggregation.
 */
export const DifficultyWeightsConfigSchema = z.object({
  /** Weight for reasoning difficulty (0-1) */
  reasoning: z.number().min(0).max(1).default(0.3),
  /** Weight for knowledge difficulty (0-1) */
  knowledge: z.number().min(0).max(1).default(0.15),
  /** Weight for creativity difficulty (0-1) */
  creativity: z.number().min(0).max(1).default(0.15),
  /** Weight for precision difficulty (0-1) */
  precision: z.number().min(0).max(1).default(0.25),
  /** Weight for context length difficulty (0-1) */
  context_length: z.number().min(0).max(1).default(0.15),
});

export type DifficultyWeightsConfig = z.infer<typeof DifficultyWeightsConfigSchema>;

/**
 * Difficulty thresholds schema for level classification.
 */
export const DifficultyThresholdsSchema = z.object({
  /** Upper bound for 'easy' classification (0-1) */
  easyUpperBound: z.number().min(0).max(1).default(0.3),
  /** Lower bound for 'hard' classification (0-1) */
  hardLowerBound: z.number().min(0).max(1).default(0.7),
});

export type DifficultyThresholds = z.infer<typeof DifficultyThresholdsSchema>;

// CliNameSchema imported from model-capabilities-types.ts (canonical source)

/**
 * Valid difficulty levels.
 */
const DifficultyLevelSchema = z.enum(['easy', 'medium', 'hard']);

/**
 * Valid model tiers.
 */
const ModelTierSchema = z.enum(['fast', 'balanced', 'powerful']);

/**
 * ZeroRouter configuration schema.
 */
export const ZeroRouterConfigSchema = z
  .object({
    /** Difficulty thresholds for level classification */
    thresholds: DifficultyThresholdsSchema.optional(),
    /** Weights for difficulty aggregation */
    weights: DifficultyWeightsConfigSchema.optional(),
    /** Mapping from difficulty level to model tier */
    difficultyToTier: z.record(DifficultyLevelSchema, ModelTierSchema).optional(),
    /** Mapping from model tier to CLI preference order */
    tierToClis: z.record(ModelTierSchema, z.array(CliNameSchema)).optional(),
    /** Enable adaptive calibration from outcomes */
    enableCalibration: z.boolean().default(true),
    /** Maximum outcomes to store for calibration */
    maxCalibrationOutcomes: z.number().int().positive().default(1000),
    /** Minimum outcomes before applying calibration adjustments */
    minCalibrationOutcomes: z.number().int().positive().default(50),
    /** Verbose logging */
    verbose: z.boolean().default(false),
  })
  .optional();

export type ZeroRouterConfig = z.infer<typeof ZeroRouterConfigSchema>;

/**
 * Latency tracker configuration schema.
 */
export const LatencyTrackerConfigSchema = z
  .object({
    /** Maximum number of samples to keep per CLI */
    windowSize: z.number().int().positive().default(100),
    /** Time-weighted decay factor (0-1, higher = more weight to recent) */
    decayFactor: z.number().min(0).max(1).default(0.95),
    /** Maximum age of samples in milliseconds before forced eviction */
    maxSampleAgeMs: z.number().int().positive().default(3600000),
    /** Percentiles to calculate */
    percentiles: z.array(z.number().min(0).max(100)).max(20).default([50, 95, 99]),
  })
  .optional();

export type LatencyTrackerConfig = z.infer<typeof LatencyTrackerConfigSchema>;

/**
 * Routing memory configuration schema.
 */
export const RoutingMemoryConfigSchema = z
  .object({
    /** Minimum observations before using learned routing */
    minObservations: z.number().int().positive().default(5),
    /** Confidence threshold for using cached decisions */
    confidenceThreshold: z.number().min(0).max(1).default(0.6),
    /** Success rate threshold for trusting a routing pattern */
    successRateThreshold: z.number().min(0).max(1).default(0.7),
    /** Maximum age of cached actions in milliseconds */
    actionCacheMaxAgeMs: z.number().int().positive().default(3600000),
  })
  .optional();

export type RoutingMemoryConfig = z.infer<typeof RoutingMemoryConfigSchema>;

/**
 * Complete routing configuration schema.
 * Exposes all routing subsystem parameters via nexus-agents.yaml.
 */
export const RoutingConfigSchema = z.object({
  /**
   * Pipeline stage toggles.
   * Enable or disable individual routing stages.
   */
  stages: z
    .object({
      /** Enable budget filtering stage */
      budgetFilter: z.boolean().default(true),
      /** Enable ZeroRouter difficulty-based routing */
      zeroRouter: z.boolean().default(true),
      /** Enable preference-trained routing */
      preferenceRouting: z.boolean().default(false),
      /** Enable TOPSIS ranking */
      topsisRanking: z.boolean().default(true),
      /** Enable LinUCB selection */
      linucbSelection: z.boolean().default(true),
      /** Enable latency tracking */
      latencyTracking: z.boolean().default(true),
      /** Enable routing memory for learned routing */
      routingMemory: z.boolean().default(false),
      /** Enable confidence cascade stage (Issue #755, ADR-0005) */
      confidenceCascade: z.boolean().default(false),
      /** Enable capability match stage (Issue #755, ADR-0005) */
      capabilityMatch: z.boolean().default(false),
      /** Enable quality constraint stage (Issue #755, ADR-0005) */
      qualityConstraint: z.boolean().default(false),
      /** Enable resource strategy stage for budget-aware oscillation (Issue #998) */
      resourceStrategy: z.boolean().default(true),
      /** Enable strategy distillation for learned routing rules (Issue #999) */
      strategyDistillation: z.boolean().default(false),
    })
    .optional(),

  /**
   * Budget constraints for routing decisions.
   */
  budget: BudgetConstraintsSchema,

  /**
   * TOPSIS multi-criteria decision making configuration.
   */
  topsis: TopsisConfigSchema,

  /**
   * ZeroRouter difficulty-based routing configuration.
   */
  zeroRouter: ZeroRouterConfigSchema,

  /**
   * Latency tracker configuration.
   */
  latencyTracker: LatencyTrackerConfigSchema,

  /**
   * Routing memory configuration.
   */
  routingMemory: RoutingMemoryConfigSchema,

  /**
   * LinUCB bandit parameters.
   */
  linucb: z
    .object({
      /** Exploration parameter (higher = more exploration) */
      alpha: z.number().positive().default(1.0),
      /** Maximum routing decision time in milliseconds */
      maxDecisionTimeMs: z.number().positive().default(50),
    })
    .optional(),

  /**
   * Preference router parameters.
   */
  preference: z
    .object({
      /** Minimum data points before using learned preferences */
      minDataPoints: z.number().int().positive().default(10),
    })
    .optional(),

  /**
   * Weight for latency score in final routing (0-1).
   */
  latencyScoreWeight: z.number().min(0).max(1).default(0.2),
});

export type RoutingConfig = z.infer<typeof RoutingConfigSchema>;

/**
 * Default routing configuration values.
 * Used when no routing config is provided in nexus-agents.yaml.
 */
export const DEFAULT_ROUTING_CONFIG: RoutingConfig = {
  stages: {
    budgetFilter: true,
    zeroRouter: true,
    preferenceRouting: false,
    topsisRanking: true,
    linucbSelection: true,
    latencyTracking: true,
    routingMemory: false,
    // Issue #755: New replacement stages (disabled by default for backward compatibility)
    confidenceCascade: false,
    capabilityMatch: false,
    qualityConstraint: false,
    // Issue #998: Resource strategy (enabled by default)
    resourceStrategy: true,
    // Issue #999: Strategy distillation (opt-in)
    strategyDistillation: false,
  },
  topsis: {
    minQualityThreshold: 5,
    verbose: false,
  },
  zeroRouter: {
    enableCalibration: true,
    maxCalibrationOutcomes: 1000,
    minCalibrationOutcomes: 50,
    verbose: false,
  },
  latencyTracker: {
    windowSize: 100,
    decayFactor: 0.95,
    maxSampleAgeMs: 3600000,
    percentiles: [50, 95, 99],
  },
  routingMemory: {
    minObservations: 5,
    confidenceThreshold: 0.6,
    successRateThreshold: 0.7,
    actionCacheMaxAgeMs: 3600000,
  },
  linucb: {
    alpha: 1.0,
    maxDecisionTimeMs: 50,
  },
  preference: {
    minDataPoints: 10,
  },
  latencyScoreWeight: 0.2,
};
