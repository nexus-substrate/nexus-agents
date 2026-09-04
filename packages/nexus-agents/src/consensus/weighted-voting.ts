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
import { getTimeProvider } from '../core/index.js';
import type {
  IWeightedVoting,
  WeightedAgentRecord,
  WeightedConsensusResult,
  WeightedVotingConfig,
  TaskOutcomeStatus,
  Vote,
} from './types.js';
import { DEFAULT_WEIGHTED_VOTING_CONFIG } from './types.js';
import type { ICollaborationEventBus } from '../core/event-bus.js';
import {
  emitWeightUpdated,
  emitPatternDetected,
  emitAgentFlagged,
  emitCollusionSuspected,
} from '../agents/collaboration/byzantine-events.js';
import {
  type MutableAgentRecord,
  type WeightedVotingOptions,
  isLowConfidenceContrarian,
  computeMajorityDirection,
  determineDecision,
  updateDerivedMetrics,
  toImmutableRecord,
  groupVotesBySignature,
  createAgentRecord,
  computeGlobalStats,
  calculateCalibratedWeight,
  applyOutcomeWeight,
} from './weighted-voting-helpers.js';

export type { WeightedVotingOptions } from './weighted-voting-helpers.js';

const logger = createLogger({ component: 'weighted-voting' });

/**
 * Weighted Byzantine voting implementation.
 * Implements CP-WBFT pattern for fault-tolerant multi-agent consensus.
 */
export class WeightedVoting implements IWeightedVoting {
  private readonly records: Map<string, MutableAgentRecord> = new Map();
  private readonly config: WeightedVotingConfig;
  private readonly eventBus: ICollaborationEventBus | undefined;
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

  updatePerformance(agentId: string, outcome: TaskOutcomeStatus): void {
    let record = this.records.get(agentId);
    if (record === undefined) {
      this.registerAgent(agentId);
      record = this.records.get(agentId);
      if (record === undefined) return;
    }

    const previousWeight = record.weight;
    record.totalTasks += 1;
    record.lastActive = new Date(getTimeProvider().now());

    // Update task counts
    if (outcome === 'success') record.successfulTasks += 1;
    else if (outcome === 'failure') record.failedTasks += 1;
    else if (outcome === 'partial') record.partialTasks += 1;

    // Apply weight change
    record.weight = applyOutcomeWeight(
      record.weight,
      outcome,
      this.config.weightDecayFactor,
      this.config.weightRecoveryFactor
    );
    updateDerivedMetrics(record);
    this.emitWeightChange(agentId, previousWeight, record.weight, 'performance_update');

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
    const decision = determineDecision(
      approval,
      rejection,
      total,
      quorumReached,
      this.config.quorumThreshold
    );

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

  registerAgent(agentId: string): void {
    if (this.records.has(agentId)) {
      logger.debug('Agent already registered', { agentId });
      return;
    }
    const record = createAgentRecord(agentId, this.config.initialWeight);
    this.records.set(agentId, record);
    logger.info('Agent registered', { agentId, initialWeight: this.config.initialWeight });
  }

  getAgentRecord(agentId: string): WeightedAgentRecord | undefined {
    const record = this.records.get(agentId);
    if (record === undefined) return undefined;
    return toImmutableRecord(record);
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
    record.weight = Math.max(0, record.weight * 0.5);
    updateDerivedMetrics(record);

    const canStillVote = this.canVote(agentId);
    this.emitAgentFlaggedEvent(agentId, reason, previousWeight, canStillVote);
    this.emitWeightChange(agentId, previousWeight, record.weight, 'flag_penalty');

    logger.warn('Agent flagged for Byzantine behavior', {
      agentId,
      reason,
      totalFlags: record.byzantineFlags,
      newWeight: record.weight,
    });

    if (record.byzantineFlags >= this.config.byzantineFlagThreshold) {
      this.excludeAgent(record);
    }
  }

  getAllRecords(): readonly WeightedAgentRecord[] {
    return Array.from(this.records.values()).map((r) => toImmutableRecord(r));
  }

  canVote(agentId: string): boolean {
    const record = this.records.get(agentId);
    if (record === undefined) return false;
    return record.weight >= this.config.minWeight && record.trustScore >= this.config.minTrustScore;
  }

  recalibrateWeights(): void {
    const { globalSuccessRate, totalTasks } = computeGlobalStats(this.records.values());
    if (totalTasks === 0) return;

    for (const record of this.records.values()) {
      if (record.totalTasks < 3) continue;
      const previousWeight = record.weight;
      record.weight = calculateCalibratedWeight(
        record,
        globalSuccessRate,
        this.config.initialWeight
      );
      updateDerivedMetrics(record);
      this.emitWeightChange(record.agentId, previousWeight, record.weight, 'recalibration');
    }

    logger.info('Weights recalibrated', {
      agentCount: this.records.size,
      globalSuccessRate: globalSuccessRate.toFixed(3),
    });
  }

  // Private helpers

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

  private emitWeightChange(
    agentId: string,
    prev: number,
    next: number,
    reason: 'performance_update' | 'flag_penalty' | 'recalibration'
  ): void {
    if (this.emitEvents && this.eventBus !== undefined && prev !== next) {
      emitWeightUpdated(this.eventBus, { agentId, previousWeight: prev, newWeight: next, reason });
    }
  }

  private emitAgentFlaggedEvent(
    agentId: string,
    reason: string,
    previousWeight: number,
    canVote: boolean
  ): void {
    if (this.emitEvents && this.eventBus !== undefined) {
      emitAgentFlagged(this.eventBus, { agentId, reason, previousWeight, canVote });
    }
  }

  private excludeAgent(record: MutableAgentRecord): void {
    const weightBefore = record.weight;
    record.trustScore = 0;
    record.weight = 0;
    this.emitWeightChange(record.agentId, weightBefore, 0, 'flag_penalty');
    logger.warn('Agent excluded from voting due to Byzantine behavior', {
      agentId: record.agentId,
      flags: record.byzantineFlags,
    });
  }

  private detectByzantinePatterns(
    votes: ReadonlyMap<string, Vote>,
    weights: Map<string, number>
  ): boolean {
    const voteArray = Array.from(votes.entries());
    if (voteArray.length < 3) return false;
    const majorityApprove = computeMajorityDirection(voteArray, weights);
    if (this.detectContrarianByzantine(voteArray, majorityApprove)) return true;
    return this.detectCollusionPattern(voteArray);
  }

  private detectContrarianByzantine(
    voteArray: Array<[string, Vote]>,
    majorityApprove: boolean
  ): boolean {
    const contrarianAgents: string[] = [];
    for (const [agentId, vote] of voteArray) {
      if (!isLowConfidenceContrarian(vote, majorityApprove)) continue;
      const record = this.records.get(agentId);
      if (record !== undefined && record.byzantineFlags >= 2) {
        contrarianAgents.push(agentId);
      }
    }
    if (contrarianAgents.length > 0) {
      this.emitContrarianPattern(contrarianAgents);
      return true;
    }
    return false;
  }

  private emitContrarianPattern(agents: string[]): void {
    if (this.emitEvents && this.eventBus !== undefined) {
      emitPatternDetected(this.eventBus, {
        patternType: 'contrarian',
        agentIds: agents,
        confidence: 0.8,
        details: `${String(agents.length)} agent(s) with Byzantine flags voting contrary to majority with low confidence`,
      });
    }
  }

  private detectCollusionPattern(voteArray: Array<[string, Vote]>): boolean {
    const voteSignatures = groupVotesBySignature(voteArray);
    const threshold = voteArray.length * 0.6;
    for (const [signature, agents] of voteSignatures.entries()) {
      if (agents.length >= 3 && agents.length > threshold) {
        this.emitCollusionEvents(agents, signature, voteArray.length);
        return true;
      }
    }
    return false;
  }

  private emitCollusionEvents(agents: string[], signature: string, totalVotes: number): void {
    if (this.emitEvents && this.eventBus !== undefined) {
      emitPatternDetected(this.eventBus, {
        patternType: 'collusion',
        agentIds: agents,
        confidence: Math.min(0.95, agents.length / totalVotes),
        details: `${String(agents.length)} agents voting identically: ${signature}`,
      });
      emitCollusionSuspected(this.eventBus, {
        groupAgentIds: agents,
        groupSize: agents.length,
        votingBlock: agents.length / totalVotes,
        threshold: 0.6,
      });
    }
  }
}

/** Create a weighted voting instance. */
export function createWeightedVoting(options?: WeightedVotingOptions): IWeightedVoting {
  return new WeightedVoting(options);
}
