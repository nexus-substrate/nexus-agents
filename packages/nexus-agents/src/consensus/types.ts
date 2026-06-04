/**
 * nexus-agents/consensus - Type Definitions
 *
 * Barrel file that re-exports all consensus types.
 * Split into modules for maintainability:
 * - types-core.ts: Core consensus types (algorithms, votes, proposals)
 * - types-voting-protocol.ts: Multi-round voting protocol (Issue #100)
 * - types-weighted-voting.ts: Weighted Byzantine voting (Issue #103, CP-WBFT)
 */

// Core consensus types
export {
  ConsensusAlgorithmSchema,
  type ConsensusAlgorithm,
  VoteDecisionSchema,
  type VoteDecision,
  ProposalStatusSchema,
  type ProposalStatus,
  VoteSchema,
  type Vote,
  ProposalSchema,
  type Proposal,
  type ProposalId,
  type VoteCounts,
  type WeightedVoteCounts,
  type ConsensusResult,
  ConsensusResultSchema,
  type AgentPerformance,
  AgentPerformanceSchema,
  type ConsensusEngineConfig,
  ConsensusEngineConfigSchema,
  DEFAULT_CONSENSUS_CONFIG,
  VOTING_THRESHOLDS,
  type ProposalState,
  type ConsensusMetrics,
  ConsensusMetricsSchema,
  // Proposal caching (Issue #589)
  type ProposalCacheConfig,
  ProposalCacheConfigSchema,
  // Rejection categories (Issue #1213)
  RejectionCategorySchema,
  type RejectionCategory,
  REJECTION_CATEGORIES,
  // Incremental quorum (Issue #1408)
  type IncrementalQuorumConfig,
  DEFAULT_INCREMENTAL_QUORUM_CONFIG,
  type VoterExpansionCallback,
} from './types-core.js';

// Multi-round voting protocol types (Issue #100)
export {
  VotingRoundPhaseSchema,
  type VotingRoundPhase,
  VotingRoundStatusSchema,
  type VotingRoundStatus,
  AgentFindingSchema,
  type AgentFinding,
  FindingVoteSchema,
  type FindingVote,
  type VotingRound,
  type VotingProtocolConfig,
  VotingProtocolConfigSchema,
  DEFAULT_VOTING_PROTOCOL_CONFIG,
  type VotingSession,
  type VotingProtocolResult,
  type ConsolidatedFinding,
  type RoundSummary,
  type IVotingProtocol,
  type SycophancyReport,
  type SycophancyIndicator,
} from './types-voting-protocol.js';

// Weighted Byzantine voting types (Issue #103, CP-WBFT)
export {
  TaskOutcomeStatusSchema,
  type TaskOutcomeStatus,
  type WeightedAgentRecord,
  WeightedAgentRecordSchema,
  type WeightedConsensusResult,
  type WeightedVotingConfig,
  WeightedVotingConfigSchema,
  DEFAULT_WEIGHTED_VOTING_CONFIG,
  type IWeightedVoting,
} from './types-weighted-voting.js';
