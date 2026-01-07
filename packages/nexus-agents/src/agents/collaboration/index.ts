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

// Aegean Byzantine-fault-tolerant consensus (Source: arxiv:2512.20184)
export type {
  AegeanPhase,
  AgentVoteStatus,
  Proposal,
  AgentVote,
  QuorumStatus,
  AegeanRound,
  AegeanResult,
  AegeanConfig,
} from './aegean-types.js';

export {
  AegeanPhaseSchema,
  AgentVoteStatusSchema,
  ProposalSchema,
  AgentVoteSchema,
  QuorumStatusSchema,
  AegeanRoundSchema,
  AegeanResultSchema,
  AegeanConfigSchema,
  DEFAULT_AEGEAN_CONFIG,
  calculateQuorumSize,
  hasAcceptQuorum,
  isConsensusFailed,
} from './aegean-types.js';

export {
  AegeanProtocol,
  createAegeanProtocol,
  type AegeanProtocolOptions,
} from './aegean-protocol.js';

// Task-Aware Protocol Selection (Source: Issue #125, arxiv:2502.19130)
export {
  TaskTypeClassifier,
  createTaskTypeClassifier,
  type TaskType,
  type ClassificationResult,
  type ClassificationSignal,
  type TaskTypeClassifierConfig,
} from './task-type-classifier.js';

export {
  AdaptiveProtocolSelector,
  createAdaptiveProtocolSelector,
  type AdaptiveProtocolConfig,
  type SelectionResult,
} from './adaptive-protocol-selector.js';
