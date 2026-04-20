/**
 * nexus-agents/consensus - Weighted Byzantine Voting Helpers
 *
 * Pure helper functions extracted from WeightedVoting class.
 * These functions are stateless and operate on parameters only.
 *
 * @module consensus/weighted-voting-helpers
 * (Source: Issue #103, arXiv:2511.10400 - CP-WBFT)
 */

import { getTimeProvider } from '../core/index.js';
import { clamp01 } from '../utils/math-utils.js';
import type { WeightedAgentRecord, WeightedConsensusResult, Vote } from './types.js';
import type { IEventBus } from '../core/event-bus.js';

/**
 * Mutable agent record for internal tracking.
 * Used internally by WeightedVoting class.
 */
export interface MutableAgentRecord {
  agentId: string;
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  partialTasks: number;
  successRate: number;
  weight: number;
  trustScore: number;
  byzantineFlags: number;
  byzantineReasons: string[];
  lastActive: Date;
  createdAt: Date;
}

/** Options for WeightedVoting constructor. */
export interface WeightedVotingOptions {
  /** Configuration for voting thresholds and weights. */
  config?: Partial<import('./types.js').WeightedVotingConfig>;
  /** Optional event bus for Byzantine detection events (Issue #218). */
  eventBus?: IEventBus;
  /** Whether to emit Byzantine detection events (default: true if eventBus provided). */
  emitEvents?: boolean;
}

/**
 * Check if a vote is a low-confidence contrarian vote.
 * Used for Byzantine pattern detection.
 */
export function isLowConfidenceContrarian(vote: Vote, majorityApprove: boolean): boolean {
  const isContrarian = majorityApprove ? vote.decision === 'reject' : vote.decision === 'approve';
  return isContrarian && vote.confidence < 0.3;
}

/**
 * Compute the majority vote direction based on weighted votes.
 * Returns true if majority approves, false if majority rejects.
 */
export function computeMajorityDirection(
  voteArray: ReadonlyArray<readonly [string, Vote]>,
  weights: ReadonlyMap<string, number>
): boolean {
  let totalApprove = 0;
  let totalReject = 0;
  for (const [agentId, vote] of voteArray) {
    const w = weights.get(agentId) ?? 0;
    if (vote.decision === 'approve') totalApprove += w;
    if (vote.decision === 'reject') totalReject += w;
  }
  return totalApprove > totalReject;
}

/**
 * Determine consensus decision based on vote tallies.
 */
export function determineDecision(
  approval: number,
  rejection: number,
  total: number,
  quorumReached: boolean,
  quorumThreshold: number
): WeightedConsensusResult['decision'] {
  if (!quorumReached || total === 0) return 'no_consensus';
  const approvalRatio = approval / total;
  const rejectionRatio = rejection / total;
  if (approvalRatio > rejectionRatio && approvalRatio >= quorumThreshold) return 'approve';
  if (rejectionRatio > approvalRatio && rejectionRatio >= quorumThreshold) return 'reject';
  return 'no_consensus';
}

/**
 * Update derived metrics (success rate, trust score) on a mutable record.
 */
export function updateDerivedMetrics(record: MutableAgentRecord): void {
  // Update success rate
  if (record.totalTasks > 0) {
    const weightedSuccess = record.successfulTasks + record.partialTasks * 0.5;
    record.successRate = weightedSuccess / record.totalTasks;
  }

  // Update trust score based on weight and Byzantine flags
  const byzantinePenalty = Math.pow(0.7, record.byzantineFlags);
  record.trustScore = Math.min(1, record.weight * byzantinePenalty);
}

/**
 * Convert a mutable internal record to an immutable public record.
 */
export function toImmutableRecord(record: MutableAgentRecord): WeightedAgentRecord {
  return {
    agentId: record.agentId,
    totalTasks: record.totalTasks,
    successfulTasks: record.successfulTasks,
    failedTasks: record.failedTasks,
    partialTasks: record.partialTasks,
    successRate: record.successRate,
    weight: record.weight,
    trustScore: record.trustScore,
    byzantineFlags: record.byzantineFlags,
    lastActive: record.lastActive,
    createdAt: record.createdAt,
  };
}

/**
 * Create a vote signature for collusion detection.
 * Combines decision and confidence into a unique key.
 */
export function createVoteSignature(vote: Vote): string {
  return `${vote.decision}:${vote.confidence.toFixed(2)}`;
}

/**
 * Group votes by their signature for collusion pattern detection.
 */
export function groupVotesBySignature(
  voteArray: ReadonlyArray<readonly [string, Vote]>
): Map<string, string[]> {
  const signatures = new Map<string, string[]>();
  for (const [agentId, vote] of voteArray) {
    const sig = createVoteSignature(vote);
    const agents = signatures.get(sig) ?? [];
    agents.push(agentId);
    signatures.set(sig, agents);
  }
  return signatures;
}

/**
 * Create a new mutable agent record with initial values.
 */
export function createAgentRecord(agentId: string, initialWeight: number): MutableAgentRecord {
  const now = new Date(getTimeProvider().now());
  return {
    agentId,
    totalTasks: 0,
    successfulTasks: 0,
    failedTasks: 0,
    partialTasks: 0,
    successRate: 0,
    weight: initialWeight,
    trustScore: initialWeight,
    byzantineFlags: 0,
    byzantineReasons: [],
    lastActive: now,
    createdAt: now,
  };
}

/**
 * Compute global success statistics from all agent records.
 */
export function computeGlobalStats(records: Iterable<MutableAgentRecord>): {
  globalSuccessRate: number;
  totalTasks: number;
} {
  let totalSuccess = 0;
  let totalTasks = 0;

  for (const record of records) {
    totalSuccess += record.successfulTasks;
    totalTasks += record.totalTasks;
  }

  const globalSuccessRate = totalTasks > 0 ? totalSuccess / totalTasks : 0.5;
  return { globalSuccessRate, totalTasks };
}

/**
 * Calculate calibrated weight based on relative performance.
 */
export function calculateCalibratedWeight(
  record: MutableAgentRecord,
  globalSuccessRate: number,
  initialWeight: number
): number {
  const relativePerformance = record.successRate / Math.max(0.01, globalSuccessRate);
  const calibratedWeight = clamp01(initialWeight * relativePerformance);
  // Smooth transition (50% old weight, 50% calibrated)
  return (record.weight + calibratedWeight) / 2;
}

/**
 * Apply weight change based on task outcome.
 */
export function applyOutcomeWeight(
  currentWeight: number,
  outcome: import('./types.js').TaskOutcome,
  decayFactor: number,
  recoveryFactor: number
): number {
  switch (outcome) {
    case 'success':
      return Math.min(1, currentWeight * recoveryFactor);
    case 'failure':
      return Math.max(0, currentWeight * decayFactor);
    case 'partial':
      return Math.max(0, currentWeight * ((decayFactor + 1) / 2));
    case 'unknown':
      return currentWeight;
  }
}
