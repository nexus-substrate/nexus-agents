/**
 * Coordination module exports
 *
 * Re-exports from the coordination module to reduce main index file size.
 */

export {
  // Types
  type CoordinationTopology,
  type ScalingTaskType,
  type TaskFeatures,
  type TaskSignal,
  type ModelCapability,
  type CoordinationMetrics,
  type ScalingPrediction,
  type ScalingPrinciple,
  type PredictionReasoning,
  type ResourceEstimate,
  type AlternativeStrategy,
  type ScalingPredictorConfig,
  // Schemas
  CoordinationTopologySchema,
  ScalingTaskTypeSchema,
  TaskFeaturesSchema,
  ModelCapabilitySchema,
  ScalingPredictionSchema,
  ScalingPredictorConfigSchema,
  // Constants
  DEFAULT_SCALING_CONFIG,
  TASK_TYPE_PERFORMANCE,
  ERROR_AMPLIFICATION_FACTORS,
  COORDINATION_OVERHEAD_FACTORS,
  // Task feature extraction
  extractTaskFeatures,
  isLikelyParallelizable,
  hasSequentialDependencies,
  // Capability estimation
  estimateModelCapability,
  registerModelCapability,
  findBestModel,
  rankModelsByEfficiency,
  exceedsSaturation,
  getSaturationThreshold,
  getKnownModelIds,
  // Predictor
  ScalingPredictor,
  createScalingPredictor,
} from './coordination/index.js';
