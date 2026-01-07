/**
 * nexus-agents/consensus - Weighted Byzantine Voting Implementation
 *
 * Implements CP-WBFT (arXiv:2511.10400) for weighted Byzantine fault-tolerant voting.
 * Agent votes are weighted by historical reliability with automatic trust calibration.
 *
 * @module consensus/weighted-voting
 * (Source: Issue #103, arXiv:2511.10400 - CP-WBFT)
 */

import { createLogger } from '../core/logger.js';
import type {
  IWeightedVoting,
  WeightedAgentRecord,
  WeightedConsensusResult,
  WeightedVotingConfig,
  TaskOutcome,
  Vote,
} from './types.js';
import { DEFAULT_WEIGHTED_VOTING_CONFIG } from './types.js';

const logger = createLogger({ component: 'weighted-voting' });

/**
 * Mutable agent record for internal tracking.
 */
interface MutableAgentRecord {
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

/**
 * Weighted Byzantine voting implementation.
 * Implements CP-WBFT pattern for fault-tolerant multi-agent consensus.
 */
export class WeightedVoting implements IWeightedVoting {
  private readonly records: Map<string, MutableAgentRecord> = new Map();
  private readonly config: WeightedVotingConfig;

  constructor(config: Partial<WeightedVotingConfig> = {}) {
    this.config = { ...DEFAULT_WEIGHTED_VOTING_CONFIG, ...config };
    logger.info('WeightedVoting initialized', { config: this.config });
  }

  calculateWeight(agentId: string): number {
    const record = this.records.get(agentId);
    if (record === undefined) return 0;
    return record.weight;
  }

  updatePerformance(agentId: string, outcome: TaskOutcome): void {
    let record = this.records.get(agentId);
    if (record === undefined) {
      this.registerAgent(agentId);
      record = this.records.get(agentId);
      if (record === undefined) return; // Should never happen
    }

    record.totalTasks += 1;
    record.lastActive = new Date();

    switch (outcome) {
      case 'success':
        record.successfulTasks += 1;
        record.weight = Math.min(1, record.weight * this.config.weightRecoveryFactor);
        break;
      case 'failure':
        record.failedTasks += 1;
        record.weight = Math.max(0, record.weight * this.config.weightDecayFactor);
        break;
      case 'partial':
        record.partialTasks += 1;
        // Partial success: slight weight decay
        record.weight = Math.max(0, record.weight * ((this.config.weightDecayFactor + 1) / 2));
        break;
      case 'unknown':
        // No weight change for unknown outcomes
        break;
    }

    this.updateDerivedMetrics(record);

    logger.debug('Performance updated', {
      agentId,
      outcome,
      newWeight: record.weight,
      successRate: record.successRate,
    });
  }

  weightedConsensus(votes: ReadonlyMap<string, Vote>): WeightedConsensusResult {
    const { approval, rejection, total, agents, breakdown } = this.countVotes(votes);
    const byzantineDetected = this.detectByzantinePatterns(votes, breakdown);
    const quorumReached = total >= this.config.quorumThreshold;
    const decision = this.determineDecision(approval, rejection, total, quorumReached);

    const result: WeightedConsensusResult = {
      decision,
      weightedApproval: approval,
      weightedRejection: rejection,
      totalWeight: total,
      quorumReached,
      byzantineDetected,
      participatingAgents: agents,
      weightBreakdown: breakdown,
    };

    this.logConsensusResult(result);
    return result;
  }

  private countVotes(votes: ReadonlyMap<string, Vote>): {
    approval: number;
    rejection: number;
    total: number;
    agents: string[];
    breakdown: Map<string, number>;
  } {
    let approval = 0;
    let rejection = 0;
    let total = 0;
    const agents: string[] = [];
    const breakdown = new Map<string, number>();

    for (const [agentId, vote] of votes) {
      if (!this.canVote(agentId)) {
        logger.warn('Agent cannot vote', { agentId, reason: 'insufficient weight or trust' });
        continue;
      }
      const weight = this.calculateWeight(agentId);
      breakdown.set(agentId, weight);
      agents.push(agentId);
      total += weight;
      const effectiveWeight = weight * vote.confidence;
      if (vote.decision === 'approve') approval += effectiveWeight;
      else if (vote.decision === 'reject') rejection += effectiveWeight;
    }
    return { approval, rejection, total, agents, breakdown };
  }

  private determineDecision(
    approval: number,
    rejection: number,
    total: number,
    quorumReached: boolean
  ): WeightedConsensusResult['decision'] {
    if (!quorumReached || total === 0) return 'no_consensus';
    const approvalRatio = approval / total;
    const rejectionRatio = rejection / total;
    if (approvalRatio > rejectionRatio && approvalRatio >= this.config.quorumThreshold)
      return 'approve';
    if (rejectionRatio > approvalRatio && rejectionRatio >= this.config.quorumThreshold)
      return 'reject';
    return 'no_consensus';
  }

  private logConsensusResult(result: WeightedConsensusResult): void {
    logger.info('Weighted consensus calculated', {
      decision: result.decision,
      approval: result.weightedApproval.toFixed(3),
      rejection: result.weightedRejection.toFixed(3),
      totalWeight: result.totalWeight.toFixed(3),
      quorumReached: result.quorumReached,
      byzantineDetected: result.byzantineDetected,
    });
  }

  registerAgent(agentId: string): void {
    if (this.records.has(agentId)) {
      logger.debug('Agent already registered', { agentId });
      return;
    }

    const now = new Date();
    const record: MutableAgentRecord = {
      agentId,
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      partialTasks: 0,
      successRate: 0,
      weight: this.config.initialWeight,
      trustScore: this.config.initialWeight, // Initial trust = initial weight
      byzantineFlags: 0,
      byzantineReasons: [],
      lastActive: now,
      createdAt: now,
    };

    this.records.set(agentId, record);
    logger.info('Agent registered', { agentId, initialWeight: this.config.initialWeight });
  }

  getAgentRecord(agentId: string): WeightedAgentRecord | undefined {
    const record = this.records.get(agentId);
    if (record === undefined) return undefined;
    return this.toImmutableRecord(record);
  }

  flagByzantine(agentId: string, reason: string): void {
    const record = this.records.get(agentId);
    if (record === undefined) {
      logger.warn('Cannot flag unregistered agent', { agentId });
      return;
    }

    record.byzantineFlags += 1;
    record.byzantineReasons.push(reason);

    // Severe weight penalty for Byzantine behavior
    record.weight = Math.max(0, record.weight * 0.5);
    this.updateDerivedMetrics(record);

    logger.warn('Agent flagged for Byzantine behavior', {
      agentId,
      reason,
      totalFlags: record.byzantineFlags,
      newWeight: record.weight,
    });

    // Check if agent should be excluded
    if (record.byzantineFlags >= this.config.byzantineFlagThreshold) {
      record.trustScore = 0;
      record.weight = 0;
      logger.warn('Agent excluded from voting due to Byzantine behavior', {
        agentId,
        flags: record.byzantineFlags,
      });
    }
  }

  getAllRecords(): readonly WeightedAgentRecord[] {
    return Array.from(this.records.values()).map((r) => this.toImmutableRecord(r));
  }

  canVote(agentId: string): boolean {
    const record = this.records.get(agentId);
    if (record === undefined) return false;
    return record.weight >= this.config.minWeight && record.trustScore >= this.config.minTrustScore;
  }

  recalibrateWeights(): void {
    // Calculate global statistics
    let totalSuccess = 0;
    let totalTasks = 0;

    for (const record of this.records.values()) {
      totalSuccess += record.successfulTasks;
      totalTasks += record.totalTasks;
    }

    const globalSuccessRate = totalTasks > 0 ? totalSuccess / totalTasks : 0.5;

    // Recalibrate weights relative to global performance
    for (const record of this.records.values()) {
      if (record.totalTasks < 3) continue; // Skip agents with insufficient history

      const relativePerformance = record.successRate / Math.max(0.01, globalSuccessRate);
      const calibratedWeight = Math.min(
        1,
        Math.max(0, this.config.initialWeight * relativePerformance)
      );

      // Smooth transition (50% old weight, 50% calibrated)
      record.weight = (record.weight + calibratedWeight) / 2;
      this.updateDerivedMetrics(record);
    }

    logger.info('Weights recalibrated', {
      agentCount: this.records.size,
      globalSuccessRate: globalSuccessRate.toFixed(3),
    });
  }

  // Private helpers

  private updateDerivedMetrics(record: MutableAgentRecord): void {
    // Update success rate
    if (record.totalTasks > 0) {
      const weightedSuccess = record.successfulTasks + record.partialTasks * 0.5;
      record.successRate = weightedSuccess / record.totalTasks;
    }

    // Update trust score based on weight and Byzantine flags
    const byzantinePenalty = Math.pow(0.7, record.byzantineFlags);
    record.trustScore = Math.min(1, record.weight * byzantinePenalty);
  }

  private toImmutableRecord(record: MutableAgentRecord): WeightedAgentRecord {
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

  private detectByzantinePatterns(
    votes: ReadonlyMap<string, Vote>,
    weights: Map<string, number>
  ): boolean {
    const voteArray = Array.from(votes.entries());
    if (voteArray.length < 3) return false;
    const majorityApprove = this.computeMajorityDirection(voteArray, weights);
    if (this.detectContrarianByzantine(voteArray, majorityApprove)) return true;
    return this.detectCollusionPattern(voteArray);
  }

  private computeMajorityDirection(
    voteArray: Array<[string, Vote]>,
    weights: Map<string, number>
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

  private detectContrarianByzantine(
    voteArray: Array<[string, Vote]>,
    majorityApprove: boolean
  ): boolean {
    for (const [agentId, vote] of voteArray) {
      if (!this.isLowConfidenceContrarian(vote, majorityApprove)) continue;
      const record = this.records.get(agentId);
      if (record !== undefined && record.byzantineFlags >= 2) return true;
    }
    return false;
  }

  private isLowConfidenceContrarian(vote: Vote, majorityApprove: boolean): boolean {
    const isContrarian = majorityApprove ? vote.decision === 'reject' : vote.decision === 'approve';
    return isContrarian && vote.confidence < 0.3;
  }

  private detectCollusionPattern(voteArray: Array<[string, Vote]>): boolean {
    const voteSignatures = new Map<string, number>();
    for (const [, vote] of voteArray) {
      const sig = `${vote.decision}:${vote.confidence.toFixed(2)}`;
      voteSignatures.set(sig, (voteSignatures.get(sig) ?? 0) + 1);
    }
    const threshold = voteArray.length * 0.6;
    for (const count of voteSignatures.values()) {
      if (count >= 3 && count > threshold) return true;
    }
    return false;
  }
}

/** Create a weighted voting instance. */
export function createWeightedVoting(config?: Partial<WeightedVotingConfig>): IWeightedVoting {
  return new WeightedVoting(config);
}
