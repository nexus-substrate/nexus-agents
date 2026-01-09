/**
 * nexus-agents/agents - Free-MAD Types
 *
 * Types for Free-MAD (Score-based Decision with Anti-Conformity)
 * scoring mechanism that evaluates entire debate trajectories and
 * penalizes conformity to majority positions.
 *
 * @module agents/collaboration/free-mad-types
 * (Source: arXiv:2509.11035, Issue #152)
 */

/**
 * A single position in the debate trajectory.
 */
export interface DebatePosition {
  /** Agent ID that took this position */
  agentId: string;
  /** Round number (0-indexed) */
  round: number;
  /** The position/answer taken (normalized string) */
  position: string;
  /** Confidence in this position (0-1) */
  confidence: number;
  /** Reasoning for this position */
  reasoning?: string;
  /** Timestamp when position was taken */
  timestamp: Date;
}

/**
 * Trajectory of positions across all debate rounds for a single agent.
 */
export interface AgentTrajectory {
  agentId: string;
  positions: DebatePosition[];
  /** Number of position changes across rounds */
  positionChanges: number;
  /** Whether agent changed to match majority at any point */
  conformedToMajority: boolean;
  /** Rounds where agent conformed to majority */
  conformityRounds: number[];
}

/**
 * Snapshot of debate state at a specific round.
 */
export interface RoundSnapshot {
  round: number;
  /** Map of position -> list of agent IDs holding that position */
  positionDistribution: Map<string, string[]>;
  /** The majority position for this round (if clear majority exists) */
  majorityPosition: string | null;
  /** Strength of majority (0-1), null if no clear majority */
  majorityStrength: number | null;
}

/**
 * Anti-conformity score for an agent.
 */
export interface AntiConformityScore {
  agentId: string;
  /** Base score from confidence and consistency (0-1) */
  baseScore: number;
  /** Penalty for conforming to majority (-1 to 0) */
  conformityPenalty: number;
  /** Bonus for maintaining minority position (0-1) */
  persistenceBonus: number;
  /** Final anti-conformity adjusted score */
  finalScore: number;
}

/**
 * Complete debate trajectory across all rounds.
 */
export interface DebateTrajectory {
  /** Unique identifier for this debate */
  debateId: string;
  /** Topic or question being debated */
  topic: string;
  /** All positions taken by all agents across all rounds */
  allPositions: DebatePosition[];
  /** Trajectory per agent */
  agentTrajectories: Map<string, AgentTrajectory>;
  /** Snapshots of each round */
  roundSnapshots: RoundSnapshot[];
  /** Total number of rounds */
  totalRounds: number;
  /** When debate started */
  startedAt: Date;
  /** When debate ended */
  endedAt?: Date;
}

/**
 * Result of Free-MAD scoring.
 */
export interface FreeMadResult {
  /** The winning position */
  winningPosition: string;
  /** Anti-conformity scores for each agent */
  scores: AntiConformityScore[];
  /** Position scores (weighted by anti-conformity) */
  positionScores: Map<string, number>;
  /** Whether result differs from simple majority */
  antiConformityMattered: boolean;
  /** Explanation of the scoring decision */
  reasoning: string;
  /** The full trajectory that was evaluated */
  trajectory: DebateTrajectory;
}

/**
 * Configuration for Free-MAD scoring.
 */
export interface FreeMadConfig {
  /** Weight for conformity penalty (0-1), default 0.3 */
  conformityPenaltyWeight: number;
  /** Weight for persistence bonus (0-1), default 0.2 */
  persistenceBonusWeight: number;
  /** Minimum majority strength to trigger conformity detection (0-1), default 0.6 */
  majorityThreshold: number;
  /** Whether to log detailed scoring info */
  verbose: boolean;
}

/**
 * Default configuration for Free-MAD scoring.
 */
export const DEFAULT_FREE_MAD_CONFIG: FreeMadConfig = {
  conformityPenaltyWeight: 0.3,
  persistenceBonusWeight: 0.2,
  majorityThreshold: 0.6,
  verbose: false,
};

/**
 * Vote decision types for compatibility with existing consensus protocol.
 */
export type VoteDecision = 'approve' | 'reject' | 'abstain';

/**
 * Extended vote with trajectory context.
 */
export interface TrajectoryVote {
  agentId: string;
  decision: VoteDecision;
  reasoning?: string;
  confidence: number;
  round: number;
  /** Previous decisions if this is not round 0 */
  previousDecisions?: VoteDecision[];
}
