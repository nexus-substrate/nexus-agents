/**
 * Collaboration protocol exports
 *
 * Re-exports from collaboration/index.js for cleaner main index.
 */

// Types and schemas
export type {
  CollaborationPattern,
  SessionStatus,
  VoteDecision,
  CollaborationConfig,
  ExpertParticipation,
  CollaborationMessage,
  TaskAssignmentMessage,
  ResultSubmissionMessage,
  ReviewRequestMessage,
  ReviewResponseMessage,
  FeedbackMessage,
  VoteMessage,
  StatusUpdateMessage,
  SessionState,
  CollaborationResult,
  ExpertResultSummary,
  AggregatedResult,
  ResultConflict,
  AggregationMetadata,
} from './collaboration/index.js';

export {
  CollaborationPatternSchema,
  SessionStatusSchema,
  VoteDecisionSchema,
  CollaborationConfigSchema,
  ExpertParticipationSchema,
  VoteMessageSchema,
  ReviewResponseMessageSchema,
  DEFAULT_TIMEOUTS,
  DEFAULT_MAX_RETRIES,
  MIN_EXPERTS_FOR_PATTERN,
} from './collaboration/index.js';

// Session management
export {
  CollaborationSession,
  createCollaborationSession,
  type CollaborationSessionOptions,
  type SessionEvent,
} from './collaboration/index.js';

// Protocol implementations
export {
  SequentialProtocol,
  ParallelProtocol,
  ReviewProtocol,
  ConsensusProtocol,
  ProtocolFactory,
  createProtocolFactory,
  type ICollaborationProtocol,
  type ProtocolOptions,
} from './collaboration/index.js';

// Result aggregation
export {
  ResultAggregator,
  createResultAggregator,
  aggregateResults,
  type AggregationStrategy,
  type AggregatorOptions,
  type AggregatorInput,
  type ExpertResult,
  type ConflictResolver,
  type QualityScorer,
} from './collaboration/index.js';
