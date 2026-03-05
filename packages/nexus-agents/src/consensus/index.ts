/**
 * nexus-agents/consensus
 *
 * Consensus engine module for multi-agent decision making.
 * Supports multiple voting strategies including:
 * - Simple majority (>50%)
 * - Supermajority (>=67%)
 * - Unanimous (100%)
 * - Proof-of-learning (weighted by agent performance)
 */

// Types and schemas
export type {
  ConsensusAlgorithm,
  VoteDecision,
  ProposalStatus,
  Vote,
  Proposal,
  ProposalId,
  VoteCounts,
  WeightedVoteCounts,
  ConsensusResult,
  AgentPerformance,
  ConsensusEngineConfig,
  ProposalState,
  ConsensusMetrics,
  // Rejection categories (Issue #1213)
  RejectionCategory,
  // Incremental quorum (Issue #1408)
  IncrementalQuorumConfig,
  VoterExpansionCallback,
} from './types.js';

export {
  ConsensusAlgorithmSchema,
  VoteDecisionSchema,
  ProposalStatusSchema,
  VoteSchema,
  ProposalSchema,
  ConsensusResultSchema,
  AgentPerformanceSchema,
  ConsensusEngineConfigSchema,
  ConsensusMetricsSchema,
  DEFAULT_CONSENSUS_CONFIG,
  VOTING_THRESHOLDS,
  // Rejection categories (Issue #1213)
  RejectionCategorySchema,
  REJECTION_CATEGORIES,
  // Incremental quorum (Issue #1408)
  DEFAULT_INCREMENTAL_QUORUM_CONFIG,
} from './types.js';

// Incremental quorum (Issue #1408)
export { isVotingAmbiguous, type AmbiguityParams } from './incremental-quorum.js';

// Voting strategies
export type { IVotingStrategy, VotingOutcome } from './strategies.js';

export {
  SimpleMajorityStrategy,
  SupermajorityStrategy,
  UnanimousStrategy,
  ProofOfLearningStrategy,
  VotingStrategyFactory,
  calculateVoteWeight,
  createStrategyFactory,
} from './strategies.js';

// Result builders
export {
  buildPendingResult,
  buildFinalResult,
  buildTimeoutResult,
  determineFinalStatus,
} from './result-builder.js';

// Helpers
export { generateProposalId } from './helpers.js';

// Consensus engine
export type { IConsensusEngine } from './engine.js';

export { ConsensusEngine, ConsensusError, createConsensusEngine } from './engine.js';

// Unified quorum validator (Issue #576 - consolidates quorum logic)
export type {
  IQuorumValidator,
  QuorumValidationInput,
  QuorumValidationConfig,
  QuorumValidationResult,
  QuorumBreakdown,
  EligibilityResult,
  AgentRecord,
} from './quorum-validator.js';

export {
  QuorumValidator,
  createQuorumValidator,
  DEFAULT_QUORUM_THRESHOLDS,
} from './quorum-validator.js';

// Multi-round voting protocol (Issue #100)
export type {
  VotingRoundPhase,
  VotingRoundStatus,
  AgentFinding,
  FindingVote,
  VotingRound,
  VotingProtocolConfig,
  VotingSession,
  VotingProtocolResult,
  ConsolidatedFinding,
  RoundSummary,
  IVotingProtocol,
  SycophancyReport,
  SycophancyIndicator,
} from './types.js';

export {
  VotingRoundPhaseSchema,
  VotingRoundStatusSchema,
  AgentFindingSchema,
  FindingVoteSchema,
  VotingProtocolConfigSchema,
  DEFAULT_VOTING_PROTOCOL_CONFIG,
} from './types.js';

export { VotingProtocol, createVotingProtocol } from './voting-protocol.js';

// Weighted Byzantine voting (Issue #103, arXiv:2511.10400 - CP-WBFT)
export type {
  TaskOutcome,
  WeightedAgentRecord,
  WeightedConsensusResult,
  WeightedVotingConfig,
  IWeightedVoting,
} from './types.js';

export { DEFAULT_WEIGHTED_VOTING_CONFIG } from './types.js';

export {
  WeightedVoting,
  createWeightedVoting,
  type WeightedVotingOptions,
} from './weighted-voting.js';

// Weighted voting helpers (internal utilities exported for testing)
export {
  isLowConfidenceContrarian,
  computeMajorityDirection,
  determineDecision,
  updateDerivedMetrics,
  toImmutableRecord,
  createVoteSignature,
  groupVotesBySignature,
  createAgentRecord,
  computeGlobalStats,
  calculateCalibratedWeight,
  applyOutcomeWeight,
  type MutableAgentRecord,
} from './weighted-voting-helpers.js';

// Higher-Order Voting (Issue #333 - OW/ISP correlation-aware consensus)
export type {
  AgentPairKey,
  CorrelationCoefficient,
  CorrelationMatrix,
  IndependentSubset,
  VotingObservation,
  PairwiseVotingHistory,
  HigherOrderVotingConfig,
  HigherOrderVotingResult,
  CorrelationTrackerStats,
  ICorrelationTracker,
  IHigherOrderVoting,
} from './higher-order-types.js';

export {
  createAgentPairKey,
  parseAgentPairKey,
  CorrelationCoefficientSchema,
  IndependentSubsetSchema,
  VotingObservationSchema,
  PairwiseVotingHistorySchema,
  HigherOrderVotingConfigSchema,
  DEFAULT_HIGHER_ORDER_CONFIG,
  HigherOrderVotingResultSchema,
  CorrelationTrackerStatsSchema,
} from './higher-order-types.js';

export { CorrelationTracker, createCorrelationTracker } from './correlation-tracker.js';

// Correlation persistence (disk-backed HOV state)
export type { PersistedCorrelationData } from './correlation-persistence.js';

export {
  PersistedCorrelationDataSchema,
  getCorrelationDataPath,
  saveCorrelationData,
  loadCorrelationData,
  createPersistentCorrelationTracker,
  createPersistedProposal,
} from './correlation-persistence.js';

export {
  OWVoting,
  createOWVoting,
  HigherOrderVotingStrategy,
  createHigherOrderVotingStrategy,
  type OWVotingOptions,
} from './higher-order-voting.js';

// Higher-order voting helpers (Issue #1366 - utilities for HOV logic)
export type {
  BayesianAggregateResult,
  SubsetAggregationResult,
  CombinedSubsetResult,
} from './higher-order-helpers.js';

export {
  hasSufficientCorrelationData,
  computeEffectiveWeights,
  bayesianAggregate,
  aggregateSubsets,
  combineSubsetResults,
  countSubsetVotes,
  determineHigherOrderDecision,
  aggregateSimple,
  calculateImprovement,
  buildReasoning,
} from './higher-order-helpers.js';
