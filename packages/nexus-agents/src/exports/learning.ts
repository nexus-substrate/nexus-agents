/**
 * Learning exports - Closed-loop feedback and routing improvement
 * Split from index.ts for file size compliance (Issue #285)
 */

export {
  // Outcome Feedback Types
  type RouterType,
  type OutcomeClass,
  type QualitySignals,
  type RoutingDecision as FeedbackRoutingDecision,
  type TaskOutcome,
  type ComputedReward,
  type FeedbackLoopStats,
  type FeedbackCollectorConfig,
  type IOutcomeFeedback,
  type OutcomeProcessedCallback,
  DEFAULT_FEEDBACK_COLLECTOR_CONFIG,
  FeedbackCollectorConfigSchema,
  QualitySignalsSchema,
  RoutingDecisionSchema as FeedbackRoutingDecisionSchema,
  TaskOutcomeSchema,
  // Outcome Feedback Collector
  OutcomeFeedbackCollector,
  createRoutingDecision,
  createTaskOutcome,
  createOutcomeFeedbackCollector,
  // Feedback Integration (Issue #167)
  FeedbackIntegration,
  createFeedbackIntegration,
  computeOutcomeReward,
  DEFAULT_FEEDBACK_INTEGRATION_CONFIG,
  type IFeedbackIntegration,
  type FeedbackIntegrationConfig,
  type RecordOutcomeParams,
} from '../learning/index.js';
