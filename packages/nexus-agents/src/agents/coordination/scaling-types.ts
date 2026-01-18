/**
 * Scaling Coordination Predictor Types
 *
 * Type definitions for predicting optimal agent coordination strategies
 * based on task features and model capabilities.
 *
 * Based on research from arXiv:2512.08296 "Towards a Science of Scaling Agent Systems":
 * - R^2=0.524 cross-validated prediction accuracy
 * - Identifies optimal multi-agent strategies for 87% of configurations
 *
 * @module agents/coordination/scaling-types
 * (Source: Issue #337, arXiv:2512.08296)
 */

import { z } from 'zod';

// =============================================================================
// Core Enums and Literals
// =============================================================================

/**
 * Coordination topology options.
 * Based on arXiv:2512.08296 canonical architectures.
 */
export type CoordinationTopology =
  | 'single_agent' // No coordination - single model execution
  | 'centralized' // Hub-and-spoke with central coordinator
  | 'decentralized' // Peer-to-peer communication
  | 'independent' // Parallel independent execution + aggregation
  | 'hierarchical'; // Multi-level tree structure

/**
 * Task type classification for prediction.
 */
export type ScalingTaskType =
  | 'sequential_reasoning' // Step-by-step logical reasoning
  | 'parallelizable' // Can be split into independent subtasks
  | 'tool_heavy' // Heavy tool/API usage
  | 'web_navigation' // Browser/web interaction tasks
  | 'code_generation' // Code writing/modification
  | 'knowledge_retrieval' // Information lookup/synthesis
  | 'creative' // Open-ended creative tasks
  | 'unknown';

// =============================================================================
// Zod Schemas
// =============================================================================

/** Schema for coordination topology. */
export const CoordinationTopologySchema = z.enum([
  'single_agent',
  'centralized',
  'decentralized',
  'independent',
  'hierarchical',
]);

/** Schema for scaling task type. */
export const ScalingTaskTypeSchema = z.enum([
  'sequential_reasoning',
  'parallelizable',
  'tool_heavy',
  'web_navigation',
  'code_generation',
  'knowledge_retrieval',
  'creative',
  'unknown',
]);

/** Schema for task signal source. */
export const TaskSignalSourceSchema = z.enum(['keyword', 'pattern', 'structure']);

/** Schema for scaling principle relevance. */
export const ScalingRelevanceSchema = z.enum(['high', 'medium', 'low']);

// =============================================================================
// Task Feature Types
// =============================================================================

/**
 * Signal that contributed to task classification.
 */
export interface TaskSignal {
  readonly name: string;
  readonly weight: number;
  readonly source: 'keyword' | 'pattern' | 'structure';
}

/** Zod schema for TaskSignal. */
export const TaskSignalSchema = z.object({
  name: z.string(),
  weight: z.number(),
  source: TaskSignalSourceSchema,
});

/**
 * Features extracted from a task for prediction.
 */
export interface TaskFeatures {
  /** Task type classification */
  readonly taskType: ScalingTaskType;
  /** Confidence in task type classification (0-1) */
  readonly typeConfidence: number;
  /** Estimated complexity (0-1) */
  readonly complexity: number;
  /** Number of distinct subtasks (0 = not parallelizable) */
  readonly parallelizability: number;
  /** Estimated tool usage intensity (0-1) */
  readonly toolIntensity: number;
  /** Whether task requires sequential dependencies */
  readonly hasSequentialDependencies: boolean;
  /** Estimated token budget required */
  readonly estimatedTokens: number;
  /** Keywords indicating task type */
  readonly signals: readonly TaskSignal[];
}

/** Zod schema for TaskFeatures. */
export const TaskFeaturesSchema = z.object({
  taskType: ScalingTaskTypeSchema,
  typeConfidence: z.number().min(0).max(1),
  complexity: z.number().min(0).max(1),
  parallelizability: z.number().int().min(0),
  toolIntensity: z.number().min(0).max(1),
  hasSequentialDependencies: z.boolean(),
  estimatedTokens: z.number().int().positive(),
  signals: z.array(TaskSignalSchema).readonly(),
});

// =============================================================================
// Model Capability Types
// =============================================================================

/**
 * Model capability assessment.
 */
export interface ModelCapability {
  /** Model identifier */
  readonly modelId: string;
  /** Estimated single-agent accuracy for task type (0-1) */
  readonly estimatedAccuracy: number;
  /** Whether this exceeds the 45% saturation threshold */
  readonly exceedsSaturationThreshold: boolean;
  /** Relative cost (normalized 0-1) */
  readonly relativeCost: number;
  /** Average latency in ms */
  readonly avgLatencyMs: number;
}

/** Zod schema for ModelCapability. */
export const ModelCapabilitySchema = z.object({
  modelId: z.string(),
  estimatedAccuracy: z.number().min(0).max(1),
  exceedsSaturationThreshold: z.boolean(),
  relativeCost: z.number().min(0).max(1),
  avgLatencyMs: z.number().nonnegative(),
});

// =============================================================================
// Coordination Metrics Types
// =============================================================================

/**
 * Coordination metrics from historical execution.
 */
export interface CoordinationMetrics {
  /** Average error amplification factor */
  readonly errorAmplificationFactor: number;
  /** Communication overhead (0-1) */
  readonly communicationOverhead: number;
  /** Average coordination latency in ms */
  readonly coordinationLatencyMs: number;
  /** Historical success rate for this topology (0-1) */
  readonly successRate: number;
  /** Number of samples in history */
  readonly sampleCount: number;
}

/** Zod schema for CoordinationMetrics. */
export const CoordinationMetricsSchema = z.object({
  errorAmplificationFactor: z.number().positive(),
  communicationOverhead: z.number().min(0).max(1),
  coordinationLatencyMs: z.number().nonnegative(),
  successRate: z.number().min(0).max(1),
  sampleCount: z.number().int().nonnegative(),
});

// =============================================================================
// Prediction Types
// =============================================================================

/**
 * Scaling principle from research.
 */
export interface ScalingPrinciple {
  readonly name: string;
  readonly description: string;
  readonly relevance: 'high' | 'medium' | 'low';
}

/** Zod schema for ScalingPrinciple. */
export const ScalingPrincipleSchema = z.object({
  name: z.string(),
  description: z.string(),
  relevance: ScalingRelevanceSchema,
});

/**
 * Reasoning behind a prediction.
 */
export interface PredictionReasoning {
  /** Primary factors that influenced the decision */
  readonly primaryFactors: readonly string[];
  /** Scaling principles applied */
  readonly appliedPrinciples: readonly ScalingPrinciple[];
  /** Warnings or caveats */
  readonly warnings: readonly string[];
}

/** Zod schema for PredictionReasoning. */
export const PredictionReasoningSchema = z.object({
  primaryFactors: z.array(z.string()).readonly(),
  appliedPrinciples: z.array(ScalingPrincipleSchema).readonly(),
  warnings: z.array(z.string()).readonly(),
});

/**
 * Resource utilization estimate.
 */
export interface ResourceEstimate {
  /** Estimated tokens to be consumed */
  readonly estimatedTokens: number;
  /** Estimated total latency in ms */
  readonly estimatedLatencyMs: number;
  /** Estimated cost (relative units) */
  readonly estimatedCost: number;
  /** Estimated coordination overhead (0-1) */
  readonly coordinationOverhead: number;
}

/** Zod schema for ResourceEstimate. */
export const ResourceEstimateSchema = z.object({
  estimatedTokens: z.number().int().nonnegative(),
  estimatedLatencyMs: z.number().nonnegative(),
  estimatedCost: z.number().nonnegative(),
  coordinationOverhead: z.number().min(0).max(1),
});

/**
 * Alternative strategy option.
 */
export interface AlternativeStrategy {
  readonly topology: CoordinationTopology;
  readonly agentCount: number;
  readonly expectedSuccessRate: number;
  readonly tradeoffs: readonly string[];
}

/** Zod schema for AlternativeStrategy. */
export const AlternativeStrategySchema = z.object({
  topology: CoordinationTopologySchema,
  agentCount: z.number().int().positive(),
  expectedSuccessRate: z.number().min(0).max(1),
  tradeoffs: z.array(z.string()).readonly(),
});

/**
 * Prediction result with recommended strategy.
 */
export interface ScalingPrediction {
  /** Recommended coordination topology */
  readonly recommendedTopology: CoordinationTopology;
  /** Recommended number of agents */
  readonly recommendedAgentCount: number;
  /** Confidence in prediction (0-1) */
  readonly confidence: number;
  /** Predicted success rate (0-1) */
  readonly predictedSuccessRate: number;
  /** Estimated resource utilization */
  readonly resourceEstimate: ResourceEstimate;
  /** Reasoning for the recommendation */
  readonly reasoning: PredictionReasoning;
  /** Alternative strategies with expected outcomes */
  readonly alternatives: readonly AlternativeStrategy[];
}

/** Zod schema for ScalingPrediction. */
export const ScalingPredictionSchema = z.object({
  recommendedTopology: CoordinationTopologySchema,
  recommendedAgentCount: z.number().int().positive(),
  confidence: z.number().min(0).max(1),
  predictedSuccessRate: z.number().min(0).max(1),
  resourceEstimate: ResourceEstimateSchema,
  reasoning: PredictionReasoningSchema,
  alternatives: z.array(AlternativeStrategySchema).readonly(),
});

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration for the scaling predictor.
 */
export interface ScalingPredictorConfig {
  /** Enable historical metrics collection */
  readonly collectMetrics?: boolean;
  /** Saturation threshold (default: 0.45 from paper) */
  readonly saturationThreshold?: number;
  /** Minimum samples for reliable metrics */
  readonly minMetricsSamples?: number;
  /** Default model capability if unknown */
  readonly defaultCapability?: Partial<ModelCapability>;
}

/** Zod schema for ScalingPredictorConfig. */
export const ScalingPredictorConfigSchema = z.object({
  collectMetrics: z.boolean().optional(),
  saturationThreshold: z.number().min(0).max(1).optional(),
  minMetricsSamples: z.number().int().positive().optional(),
  defaultCapability: ModelCapabilitySchema.partial().optional(),
});

/**
 * Default configuration values.
 */
export const DEFAULT_SCALING_CONFIG: Required<ScalingPredictorConfig> = {
  collectMetrics: true,
  saturationThreshold: 0.45,
  minMetricsSamples: 10,
  defaultCapability: {
    modelId: 'unknown',
    estimatedAccuracy: 0.5,
    exceedsSaturationThreshold: true,
    relativeCost: 0.5,
    avgLatencyMs: 2000,
  },
};

// =============================================================================
// Research Constants from arXiv:2512.08296
// =============================================================================

/**
 * Performance variations by task type from research.
 * Values represent percentage change compared to single-agent baseline.
 */
export const TASK_TYPE_PERFORMANCE: Record<
  ScalingTaskType,
  Record<Exclude<CoordinationTopology, 'hierarchical' | 'single_agent'>, number>
> = {
  parallelizable: { centralized: 0.808, decentralized: 0.123, independent: -0.052 },
  web_navigation: { centralized: 0.152, decentralized: 0.457, independent: 0.221 },
  sequential_reasoning: { centralized: -0.55, decentralized: -0.535, independent: -0.6 },
  tool_heavy: { centralized: -0.25, decentralized: -0.18, independent: -0.32 },
  code_generation: { centralized: 0.1, decentralized: 0.05, independent: -0.1 },
  knowledge_retrieval: { centralized: 0.05, decentralized: 0.08, independent: 0.15 },
  creative: { centralized: 0.02, decentralized: 0.05, independent: -0.05 },
  unknown: { centralized: 0, decentralized: 0, independent: 0 },
};

/**
 * Error amplification factors by topology from research.
 * Independent agents amplify errors 17.2x vs 4.4x for centralized.
 */
export const ERROR_AMPLIFICATION_FACTORS: Record<CoordinationTopology, number> = {
  single_agent: 1.0,
  centralized: 4.4,
  decentralized: 8.2,
  independent: 17.2,
  hierarchical: 6.0,
};

/**
 * Coordination overhead factors by topology.
 */
export const COORDINATION_OVERHEAD_FACTORS: Record<CoordinationTopology, number> = {
  single_agent: 0,
  centralized: 0.15,
  decentralized: 0.25,
  independent: 0.1,
  hierarchical: 0.3,
};
