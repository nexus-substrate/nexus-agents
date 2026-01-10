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
