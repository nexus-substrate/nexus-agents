/**
 * Task outcome tracking module.
 *
 * Records and aggregates results of model delegation and consensus
 * decisions to enable performance measurement.
 *
 * @module orchestration/outcomes
 * (Source: Issue #861 — Task outcome tracking)
 */

export type {
  TaskOutcome,
  OutcomeQuery,
  OutcomeSource,
  OutcomeFailureCategory,
  PerformanceSummary,
  GroupStats,
} from './outcome-types.js';
export {
  TaskOutcomeSchema,
  OutcomeQuerySchema,
  OutcomeFailureCategorySchema,
  categorizeOutcomeError,
  categorizeOutcomeErrorMessage,
  extractNonErrorMessage,
} from './outcome-types.js';
export {
  OutcomeStore,
  getOutcomeStore,
  getOutcomeSummaryText,
  resetOutcomeStore,
  setOutcomeStore,
  registerPersistentOutcomeStoreFactory,
  type OutcomeStoreConfig,
} from './outcome-store.js';

// Persistence (Issue #1009)
// Side-effect import: registers PersistentOutcomeStoreFactory so getOutcomeStore()
// returns the persistent variant when NEXUS_PERSIST_LEARNING=true. Do not remove.
import './outcome-store-persistence.js';
export {
  PersistentOutcomeStore,
  type PersistentOutcomeStoreConfig,
} from './outcome-store-persistence.js';

// Adaptive thresholds — Learning loop (Issue #901, Phase 4)
export { computeAdaptiveThresholds, detectTrend } from './adaptive-thresholds.js';
export type { Trend, AdaptiveThresholdResult } from './adaptive-thresholds.js';
export { emitThresholdUpdate, emitTrendDetected } from './learning-events.js';
export type { ThresholdUpdateDetail, TrendDetectedDetail } from './learning-events.js';
