/**
 * Coordination Module
 *
 * Agent coordination prediction and optimization based on scaling research.
 *
 * @module agents/coordination
 */

// =============================================================================
// Types
// =============================================================================

export type {
  // Core types
  CoordinationTopology,
  ScalingTaskType,
  // Feature types
  TaskFeatures,
  TaskSignal,
  // Capability types
  ModelCapability,
  CoordinationMetrics,
  // Prediction types
  ScalingPrediction,
  ScalingPrinciple,
  PredictionReasoning,
  ResourceEstimate,
  AlternativeStrategy,
  // Config types
  ScalingPredictorConfig,
} from './scaling-types.js';

// =============================================================================
// Schemas
// =============================================================================

export {
  // Core schemas
  CoordinationTopologySchema,
  ScalingTaskTypeSchema,
  TaskSignalSourceSchema,
  ScalingRelevanceSchema,
  // Feature schemas
  TaskFeaturesSchema,
  TaskSignalSchema,
  // Capability schemas
  ModelCapabilitySchema,
  CoordinationMetricsSchema,
  // Prediction schemas
  ScalingPredictionSchema,
  ScalingPrincipleSchema,
  PredictionReasoningSchema,
  ResourceEstimateSchema,
  AlternativeStrategySchema,
  // Config schemas
  ScalingPredictorConfigSchema,
  // Constants
  DEFAULT_SCALING_CONFIG,
  TASK_TYPE_PERFORMANCE,
  ERROR_AMPLIFICATION_FACTORS,
  COORDINATION_OVERHEAD_FACTORS,
} from './scaling-types.js';

// =============================================================================
// Task Feature Extraction
// =============================================================================

export {
  extractTaskFeatures,
  isLikelyParallelizable,
  hasSequentialDependencies,
} from './task-features.js';

// =============================================================================
// Capability Estimation
// =============================================================================

export {
  estimateModelCapability,
  registerModelCapability,
  findBestModel,
  rankModelsByEfficiency,
  exceedsSaturation,
  getSaturationThreshold,
  getKnownModelIds,
} from './capability-estimator.js';

// =============================================================================
// Scaling Predictor
// =============================================================================

export { ScalingPredictor, createScalingPredictor } from './scaling-predictor.js';

// =============================================================================
// Helper Functions (for advanced use)
// =============================================================================

export {
  selectTopology,
  selectAgentCount,
  estimateSuccessRate,
  calculateConfidence,
  estimateResources,
  generateAlternatives,
  getTradeoffs,
} from './scaling-predictor-helpers.js';
