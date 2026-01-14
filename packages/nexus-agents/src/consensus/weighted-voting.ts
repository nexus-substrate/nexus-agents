/**
 * nexus-agents/consensus - Weighted Byzantine Voting Implementation
 *
 * Implements CP-WBFT (arXiv:2511.10400) for weighted Byzantine fault-tolerant voting.
 * Agent votes are weighted by historical reliability with automatic trust calibration.
 *
 * @module consensus/weighted-voting
 * (Source: Issue #103, arXiv:2511.10400 - CP-WBFT)
 *
 * File length justification: Core WeightedVoting class with types already in
 * ./types.js. Private methods for Byzantine detection and pattern analysis
 * are tightly coupled to class state and cannot be cleanly extracted.
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
import type { IEventBus } from '../agents/collaboration/event-bus-types.js';
import {
  emitWeightUpdated,
  emitPatternDetected,
  emitAgentFlagged,
  emitCollusionSuspected,
} from '../agents/collaboration/byzantine-events.js';

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

/** Options for WeightedVoting constructor. */
export interface WeightedVotingOptions {
  /** Configuration for voting thresholds and weights. */
  config?: Partial<WeightedVotingConfig>;
  /** Optional event bus for Byzantine detection events (Issue #218). */
  eventBus?: IEventBus;
  /** Whether to emit Byzantine detection events (default: true if eventBus provided). */
  emitEvents?: boolean;
}

/**
 * Weighted Byzantine voting implementation.
 * Implements CP-WBFT pattern for fault-tolerant multi-agent consensus.
 */
export class WeightedVoting implements IWeightedVoting {
  private readonly records: Map<string, MutableAgentRecord> = new Map();
  private readonly config: WeightedVotingConfig;
  private readonly eventBus: IEventBus | undefined;
  private readonly emitEvents: boolean;

  constructor(options: WeightedVotingOptions = {}) {
    this.config = { ...DEFAULT_WEIGHTED_VOTING_CONFIG, ...options.config };
    this.eventBus = options.eventBus ?? undefined;
    this.emitEvents = options.emitEvents ?? options.eventBus !== undefined;
    logger.info('WeightedVoting initialized', {
      config: this.config,
      eventsEnabled: this.emitEvents,
    });
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

    const previousWeight = record.weight;
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

    // Emit weight update event (Issue #218)
    if (this.emitEvents && this.eventBus !== undefined && previousWeight !== record.weight) {
      emitWeightUpdated(this.eventBus, {
        agentId,
        previousWeight,
        newWeight: record.weight,
        reason: 'performance_update',
      });
    }

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

    const previousWeight = record.weight;
    record.byzantineFlags += 1;
    record.byzantineReasons.push(reason);

    // Severe weight penalty for Byzantine behavior
    record.weight = Math.max(0, record.weight * 0.5);
    this.updateDerivedMetrics(record);

    const canStillVote = this.canVote(agentId);

    // Emit agent flagged event (Issue #218)
    if (this.emitEvents && this.eventBus !== undefined) {
      emitAgentFlagged(this.eventBus, {
        agentId,
        reason,
        previousWeight,
        canVote: canStillVote,
      });

      // Also emit weight update
      emitWeightUpdated(this.eventBus, {
        agentId,
        previousWeight,
        newWeight: record.weight,
        reason: 'flag_penalty',
      });
    }

    logger.warn('Agent flagged for Byzantine behavior', {
      agentId,
      reason,
      totalFlags: record.byzantineFlags,
      newWeight: record.weight,
    });

    // Check if agent should be excluded
    if (record.byzantineFlags >= this.config.byzantineFlagThreshold) {
      const weightBeforeExclusion = record.weight;
      record.trustScore = 0;
      record.weight = 0;

      // Emit final weight update for exclusion (Issue #218)
      if (this.emitEvents && this.eventBus !== undefined && weightBeforeExclusion > 0) {
        emitWeightUpdated(this.eventBus, {
          agentId,
          previousWeight: weightBeforeExclusion,
          newWeight: 0,
          reason: 'flag_penalty',
        });
      }

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

      const previousWeight = record.weight;
      const relativePerformance = record.successRate / Math.max(0.01, globalSuccessRate);
      const calibratedWeight = Math.min(
        1,
        Math.max(0, this.config.initialWeight * relativePerformance)
      );

      // Smooth transition (50% old weight, 50% calibrated)
      record.weight = (record.weight + calibratedWeight) / 2;
      this.updateDerivedMetrics(record);

      // Emit weight update event for recalibration (Issue #218)
      if (this.emitEvents && this.eventBus !== undefined && previousWeight !== record.weight) {
        emitWeightUpdated(this.eventBus, {
          agentId: record.agentId,
          previousWeight,
          newWeight: record.weight,
          reason: 'recalibration',
        });
      }
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
    const contrarianAgents: string[] = [];

    for (const [agentId, vote] of voteArray) {
      if (!this.isLowConfidenceContrarian(vote, majorityApprove)) continue;
      const record = this.records.get(agentId);
      if (record !== undefined && record.byzantineFlags >= 2) {
        contrarianAgents.push(agentId);
      }
    }

    if (contrarianAgents.length > 0) {
      // Emit pattern detected event (Issue #218)
      if (this.emitEvents && this.eventBus !== undefined) {
        emitPatternDetected(this.eventBus, {
          patternType: 'contrarian',
          agentIds: contrarianAgents,
          confidence: 0.8, // High confidence for flagged agents voting contrary
          details: `${String(contrarianAgents.length)} agent(s) with Byzantine flags voting contrary to majority with low confidence`,
        });
      }
      return true;
    }
    return false;
  }

  private isLowConfidenceContrarian(vote: Vote, majorityApprove: boolean): boolean {
    const isContrarian = majorityApprove ? vote.decision === 'reject' : vote.decision === 'approve';
    return isContrarian && vote.confidence < 0.3;
  }

  private detectCollusionPattern(voteArray: Array<[string, Vote]>): boolean {
    const voteSignatures = new Map<string, string[]>();
    for (const [agentId, vote] of voteArray) {
      const sig = `${vote.decision}:${vote.confidence.toFixed(2)}`;
      const agents = voteSignatures.get(sig) ?? [];
      agents.push(agentId);
      voteSignatures.set(sig, agents);
    }

    const threshold = voteArray.length * 0.6;
    for (const [signature, agents] of voteSignatures.entries()) {
      if (agents.length >= 3 && agents.length > threshold) {
        // Emit collusion events (Issue #218)
        if (this.emitEvents && this.eventBus !== undefined) {
          emitPatternDetected(this.eventBus, {
            patternType: 'collusion',
            agentIds: agents,
            confidence: Math.min(0.95, agents.length / voteArray.length),
            details: `${String(agents.length)} agents voting identically: ${signature}`,
          });

          emitCollusionSuspected(this.eventBus, {
            groupAgentIds: agents,
            groupSize: agents.length,
            votingBlock: agents.length / voteArray.length,
            threshold: 0.6,
          });
        }
        return true;
      }
    }
    return false;
  }
}

/** Create a weighted voting instance. */
export function createWeightedVoting(options?: WeightedVotingOptions): IWeightedVoting {
  return new WeightedVoting(options);
}
