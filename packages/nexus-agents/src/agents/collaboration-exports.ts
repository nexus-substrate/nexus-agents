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

// TRINITY Thinker/Worker/Verifier coordinator (Source: Issue #141, arxiv:2512.04695)
export type {
  TrinityRole,
  TrinityRoleConfig,
  TrinityPhase,
  TrinityPhaseResult,
  ThinkerOutput,
  WorkerOutput,
  VerifierOutput,
  TrinityConfig,
  TrinityResult,
} from './collaboration/index.js';

export {
  TRINITY_ROLE_PROMPTS,
  TRINITY_ROLE_TEMPERATURES,
  TRINITY_ROLE_MAX_TOKENS,
  DEFAULT_TRINITY_CONFIG,
  TrinityRoleSchema,
  TrinityPhaseSchema,
  VerifierVerdictSchema,
  TrinityConfigSchema,
  TrinityStopReasonSchema,
} from './collaboration/index.js';

export {
  TrinityCoordinator,
  createTrinityCoordinator,
  type TrinityExecuteOptions,
} from './collaboration/index.js';

// Agent Message Router for peer-to-peer communication (Source: Issue #217)
export type {
  AgentMessageRouterConfig,
  AgentMessageRouterOptions,
  SendOptions,
  BroadcastOptions,
  BroadcastResult,
  RouterStats,
  IAgentMessageRouter,
} from './collaboration/index.js';

export { DEFAULT_ROUTER_CONFIG } from './collaboration/index.js';

export { AgentMessageRouter, createAgentMessageRouter } from './collaboration/index.js';

// Message event helpers (Source: Issue #217)
export {
  emitMessageSent,
  emitMessageReceived,
  emitTaskDelegated,
  emitResultBroadcast,
  type MessageSentParams,
  type MessageReceivedParams,
  type TaskDelegatedParams,
  type ResultBroadcastParams,
} from './collaboration/index.js';

// AST-based code fixer for constitutional violations (Source: Issue #459)
export { AstFixer, createAstFixer, type AstFixResult } from './collaboration/index.js';
