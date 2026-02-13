/**
 * nexus-agents/learning - Module Exports
 *
 * Closed-loop learning infrastructure for continuous improvement.
 *
 * @module learning
 */

// Types
export type {
  RouterType,
  OutcomeClass,
  QualitySignals,
  RoutingDecision,
  TaskOutcome,
  ComputedReward,
  FeedbackLoopStats,
  FeedbackCollectorConfig,
  IOutcomeFeedback,
  OutcomeProcessedCallback,
} from './outcome-feedback-types.js';

export {
  DEFAULT_FEEDBACK_COLLECTOR_CONFIG,
  FeedbackCollectorConfigSchema,
  QualitySignalsSchema,
  RoutingDecisionSchema,
  TaskOutcomeSchema,
} from './outcome-feedback-types.js';

// Outcome Feedback Collector
export {
  OutcomeFeedbackCollector,
  createRoutingDecision,
  createTaskOutcome,
  createOutcomeFeedbackCollector,
} from './outcome-feedback.js';

// Feedback Integration (Issue #167)
export {
  FeedbackIntegration,
  createFeedbackIntegration,
  computeOutcomeReward,
  DEFAULT_FEEDBACK_INTEGRATION_CONFIG,
} from './feedback-integration.js';
export type {
  IFeedbackIntegration,
  FeedbackIntegrationConfig,
  RecordOutcomeParams,
} from './feedback-integration.js';

// Outcome Storage (Issue #188 - SQLite persistence)
export type {
  IOutcomeStorage,
  ISQLiteDatabase,
  ISQLiteStatement,
  OutcomeStorageConfig,
  StoredRoutingDecision,
  StoredTaskOutcome,
  StoredReward,
  StoredModelStats,
} from './outcome-storage-types.js';
export {
  OutcomeStorageError,
  OutcomeStorageConfigSchema,
  DEFAULT_OUTCOME_STORAGE_CONFIG,
} from './outcome-storage-types.js';
export { SQLiteOutcomeStorage, createOutcomeStorage } from './outcome-storage.js';

// Validation Statistics (Issue #273)
export type {
  ConfidenceInterval,
  ComparisonResult,
  DistributionStats,
  RegretAnalysis,
  WinLossAnalysis,
  ExperimentResult,
  PerformanceMatrixEntry,
  StatisticalOptions,
} from './validation-stats-types.js';
export { DEFAULT_STATISTICAL_OPTIONS } from './validation-stats-types.js';
export {
  proportionConfidenceInterval,
  meanConfidenceInterval,
  compareProportions,
  calculateDistributionStats,
  calculateRegret,
  calculateWinLoss,
  calculateMinSampleSize,
} from './validation-stats.js';

// Strategy Distiller (Issue #999)
export type {
  RuleStatus,
  PatternType,
  StrategyAction,
  DistilledRule,
  DistillerConfig,
  DistillerStats,
} from './strategy-distiller-types.js';
export { DEFAULT_DISTILLER_CONFIG } from './strategy-distiller-types.js';
export {
  StrategyDistiller,
  createStrategyDistiller,
  sigmoidConfidence,
  detectFailurePatterns,
  detectSuccessPatterns,
  detectLatencyPatterns,
} from './strategy-distiller.js';

// A/B Test Tracker (Issue #273)
export type {
  ExperimentStatus,
  ExperimentVariant,
  ExperimentDefinition,
  ExperimentOutcome,
  VariantStats,
  ExperimentSummary,
  ExperimentExport,
  IAbTestTracker,
} from './ab-test-types.js';
export { AbTestTracker, createAbTestTracker } from './ab-test-tracker.js';
