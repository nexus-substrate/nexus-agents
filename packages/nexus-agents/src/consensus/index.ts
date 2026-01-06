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

export const VERSION = '0.0.1';

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
} from './types.js';

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
