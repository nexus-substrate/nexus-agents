/**
 * nexus-agents/agents - Collaboration Module
 *
 * Expert collaboration protocol for multi-agent orchestration.
 * Supports sequential, parallel, review, and consensus patterns.
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
} from './collaboration-types.js';

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
} from './collaboration-types.js';

// Session management
export {
  CollaborationSession,
  createCollaborationSession,
  type CollaborationSessionOptions,
  type SessionEvent,
} from './collaboration-session.js';

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
} from './collaboration-protocol.js';

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
} from './result-aggregator.js';

// Multi-Agent Reflexion (MAR) protocol (Source: arxiv:2512.20845)
export type {
  Persona,
  PersonaCritique,
  DebateResult,
  ReflexionRound,
  ReflexionConfig,
  ReflexionResult,
} from './reflexion-types.js';

export {
  PersonaSchema,
  PersonaCritiqueSchema,
  DebateResultSchema,
  ReflexionRoundSchema,
  ReflexionConfigSchema,
  ReflexionResultSchema,
  DEFAULT_CODE_REVIEW_PERSONAS,
  calculateWeightedSeverity,
} from './reflexion-types.js';

export {
  ReflexionProtocol,
  createReflexionProtocol,
  type ReflexionProtocolOptions,
} from './reflexion-protocol.js';
