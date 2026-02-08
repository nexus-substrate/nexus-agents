/**
 * Consensus exports - Voting protocols, consensus engine, and strategies
 * Split from index.ts for file size compliance (Issue #285)
 * Added to public API per Issue #351
 *
 * NOTE: VoteDecision and VoteDecisionSchema are exported from agents.ts (collaboration module)
 * NOTE: TaskOutcome and TaskOutcomeSchema are exported from learning.ts
 * These are intentionally omitted to avoid duplicate export errors.
 */

// Types and schemas
export type {
  ConsensusAlgorithm,
  // VoteDecision - already exported from agents.ts (collaboration)
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
  // Multi-round voting protocol types
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
  // Weighted voting types
  // TaskOutcome - already exported from learning.ts
  WeightedAgentRecord,
  WeightedConsensusResult,
  WeightedVotingConfig,
  IWeightedVoting,
} from '../consensus/index.js';

export {
  // Schema exports
  ConsensusAlgorithmSchema,
  // VoteDecisionSchema - already exported from agents.ts (collaboration)
  ProposalStatusSchema,
  VoteSchema,
  ProposalSchema,
  ConsensusResultSchema,
  AgentPerformanceSchema,
  ConsensusEngineConfigSchema,
  ConsensusMetricsSchema,
  // Config defaults
  DEFAULT_CONSENSUS_CONFIG,
  VOTING_THRESHOLDS,
  // Voting protocol schemas and defaults
  VotingRoundPhaseSchema,
  VotingRoundStatusSchema,
  AgentFindingSchema,
  FindingVoteSchema,
  VotingProtocolConfigSchema,
  DEFAULT_VOTING_PROTOCOL_CONFIG,
  // Weighted voting defaults
  DEFAULT_WEIGHTED_VOTING_CONFIG,
} from '../consensus/index.js';

// Voting strategies
export type { IVotingStrategy, VotingOutcome } from '../consensus/index.js';

export {
  SimpleMajorityStrategy,
  SupermajorityStrategy,
  UnanimousStrategy,
  ProofOfLearningStrategy,
  VotingStrategyFactory,
  calculateVoteWeight,
  createStrategyFactory,
} from '../consensus/index.js';

// Result builders
export {
  buildPendingResult,
  buildFinalResult,
  buildTimeoutResult,
  determineFinalStatus,
} from '../consensus/index.js';

// Helpers
export { generateProposalId } from '../consensus/index.js';

// Consensus engine
export type { IConsensusEngine } from '../consensus/index.js';

export { ConsensusEngine, ConsensusError, createConsensusEngine } from '../consensus/index.js';

// Multi-round voting protocol
export { VotingProtocol, createVotingProtocol } from '../consensus/index.js';

// Weighted Byzantine voting (CP-WBFT)
export {
  WeightedVoting,
  createWeightedVoting,
  type WeightedVotingOptions,
} from '../consensus/index.js';

// Higher-Order Voting (OW/ISP correlation-aware consensus)
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
} from '../consensus/index.js';

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
} from '../consensus/index.js';

export { CorrelationTracker, createCorrelationTracker } from '../consensus/index.js';

export {
  OWVoting,
  createOWVoting,
  HigherOrderVotingStrategy,
  createHigherOrderVotingStrategy,
  type OWVotingOptions,
} from '../consensus/index.js';

// Voter agents — real CLI-based voting
export type { CollectRealVotesOptions, AgentVoteResult } from '../cli/voter-agents.js';

export { collectRealVotes, NoAdapterError } from '../cli/voter-agents.js';
