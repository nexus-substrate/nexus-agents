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
