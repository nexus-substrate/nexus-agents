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
  SelfRefineProtocol as SelfRefineProtocolBase,
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

// Self-Refine iterative improvement protocol (Source: Issue #126, arxiv:2303.17651)
export {
  SelfRefineProtocol,
  createSelfRefineProtocol,
  type SelfRefineConfig,
  type RefinementIteration,
  type SelfRefineResult,
} from './self-refine-protocol.js';

// Self-Debug code repair protocol (Source: Issue #131, arxiv:2304.05128)
export type {
  ErrorCategory,
  ErrorSeverity,
  ErrorLocation,
  ParsedError,
  ErrorExplanation,
  CodeFix,
  ExecutionResult,
  DebugIteration,
  SelfDebugConfig,
  SelfDebugResult,
  ErrorPattern,
} from './self-debug-types.js';

export {
  ErrorCategorySchema,
  ErrorSeveritySchema,
  ErrorLocationSchema,
  ParsedErrorSchema,
  ErrorExplanationSchema,
  CodeFixSchema,
  ExecutionResultSchema,
  DebugIterationSchema,
  DEFAULT_ERROR_PATTERNS,
  DEFAULT_SELF_DEBUG_CONFIG,
} from './self-debug-types.js';

export {
  SelfDebugProtocol,
  createSelfDebugProtocol,
  type CodeExecutor,
  type SelfDebugExecuteOptions,
} from './self-debug-protocol.js';

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
} from './trinity-types.js';

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
} from './trinity-types.js';

export {
  TrinityCoordinator,
  createTrinityCoordinator,
  type TrinityExecuteOptions,
} from './trinity-coordinator.js';

// Free-MAD Anti-Conformity Scoring (Source: Issue #152, arxiv:2509.11035)
export type {
  DebatePosition,
  AgentTrajectory,
  RoundSnapshot,
  AntiConformityScore,
  DebateTrajectory,
  FreeMadResult,
  FreeMadConfig,
  TrajectoryVote,
} from './free-mad-types.js';

export { DEFAULT_FREE_MAD_CONFIG } from './free-mad-types.js';

export {
  FreeMadScorer,
  createFreeMadScorer,
  evaluateWithAntiConformity,
} from './free-mad-scoring.js';

// Constitutional AI Self-Critique (Source: Issue #147, arxiv:2212.08073)
export type {
  Constitution,
  Principle,
  PrincipleExample,
  Violation,
  ViolationSeverity,
  CritiqueResult,
  RevisionIteration,
  RefinementResult,
  ConstitutionalCriticConfig,
} from './constitutional-types.js';

export { DEFAULT_CRITIC_CONFIG } from './constitutional-types.js';

export {
  ConstitutionalCritic,
  createConstitutionalCritic,
  critiqueCode,
  type CritiqueOptions,
  type RevisionOptions,
  type RefinementOptions,
} from './constitutional-critic.js';

// Constitutional Critic helpers (Source: Issue #147, arxiv:2212.08073)
export {
  SEVERITY_ORDER,
  getDetectionPatterns,
  getLineNumber,
  calculateScore,
  checksPasses,
  generateSummary,
  summarizeChanges,
  matchKeywords,
  applyFix,
  filterViolationsBySeverity,
  type DetectionResult,
} from './constitutional-critic-helpers.js';

export {
  CODE_CONSTITUTION,
  getCriticalPrinciples,
  getPrinciplesByCategory,
} from './constitutions/code.js';

// Event Bus for agent-to-agent communication (Source: Issue #182, ARCHITECTURE.md Hybrid Architecture)
export type {
  SubscriptionId,
  TopicPattern,
  DomainEvent,
  SessionCreatedEvent,
  SessionStatusChangedEvent,
  SessionParticipantJoinedEvent,
  SessionResultSubmittedEvent,
  SessionFinalizedEvent,
  MessageSentEvent,
  MessageReceivedEvent,
  AgentTaskDelegatedEvent,
  AgentResultBroadcastEvent,
  ConsensusVoteRequestedEvent,
  ConsensusVoteCastEvent,
  ConsensusReachedEvent,
  ProtocolStartedEvent,
  ProtocolIterationEvent,
  ProtocolCompletedEvent,
  TypedEvent,
  EventListener,
  Subscription,
  EventFilter,
  EventBusOptions,
  EventBusStats,
  IEventBus,
} from './event-bus-types.js';

export { EventTopics } from './event-bus-types.js';

export { EventBus, getGlobalEventBus, resetGlobalEventBus, createEvent } from './event-bus.js';

// Agent Message Router for peer-to-peer communication (Source: Issue #217, Sprint #219)
export type {
  AgentMessageRouterConfig,
  AgentMessageRouterOptions,
  SendOptions,
  BroadcastOptions,
  BroadcastResult,
  RouterStats,
  IAgentMessageRouter,
} from './agent-message-router-types.js';

export { DEFAULT_ROUTER_CONFIG } from './agent-message-router-types.js';

export { AgentMessageRouter, createAgentMessageRouter } from './agent-message-router.js';

// Message event helpers (Source: Issue #217, Sprint #219)
export {
  emitMessageSent,
  emitMessageReceived,
  emitTaskDelegated,
  emitResultBroadcast,
  type MessageSentParams,
  type MessageReceivedParams,
  type TaskDelegatedParams,
  type ResultBroadcastParams,
} from './message-events.js';
