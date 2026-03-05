/* eslint-disable max-lines */
// 426 lines — cohesive single-concern engine. Per governance, 400-600 OK if cohesive.

/**
 * nexus-agents/consensus - Consensus Engine
 *
 * Core consensus engine implementation supporting multiple voting strategies.
 * Manages proposal lifecycle, vote collection, and outcome determination.
 */

import type { Result, ILogger } from '../core/index.js';
import { ok, err, AgentError, createLogger, getTimeProvider } from '../core/index.js';
import type {
  Proposal,
  ProposalId,
  Vote,
  ConsensusResult,
  ConsensusAlgorithm,
  AgentPerformance,
  ConsensusEngineConfig,
  ProposalState,
  ConsensusMetrics,
  ProposalCacheConfig,
} from './types.js';
import {
  ProposalSchema,
  VoteSchema,
  DEFAULT_CONSENSUS_CONFIG,
  VOTING_THRESHOLDS,
} from './types.js';
import { VotingStrategyFactory, calculateVoteWeight, type VotingOutcome } from './strategies.js';
import { buildFinalResult, buildTimeoutResult, buildPendingResult } from './result-builder.js';
import { generateProposalId } from './helpers.js';

/**
 * Error class for consensus-related failures.
 */
export class ConsensusError extends AgentError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context !== undefined ? { context } : {});
    this.name = 'ConsensusError';
  }
}

/**
 * Interface for the consensus engine.
 */
export interface IConsensusEngine {
  propose(proposal: Proposal): Promise<Result<ProposalId, ConsensusError>>;
  vote(proposalId: ProposalId, agentId: string, vote: Vote): Promise<Result<void, ConsensusError>>;
  getResult(proposalId: ProposalId): Promise<Result<ConsensusResult, ConsensusError>>;
  close(proposalId: ProposalId): Promise<Result<ConsensusResult, ConsensusError>>;
  getMetrics(): ConsensusMetrics;
}

interface InternalMetrics {
  totalProposals: number;
  approvedProposals: number;
  rejectedProposals: number;
  timedOutProposals: number;
  totalDurationMs: number;
  totalVotes: number;
  algorithmUsage: Record<ConsensusAlgorithm, number>;
}

/**
 * Cache entry for proposal content-based caching (Issue #589).
 */
interface ProposalCacheEntry {
  readonly proposalId: ProposalId;
  readonly result: ConsensusResult;
  readonly cachedAt: number;
}

/**
 * Default proposal cache configuration.
 * Enabled by default to improve determinism (fitness audit recommendation).
 */
const DEFAULT_PROPOSAL_CACHE_CONFIG: ProposalCacheConfig = {
  enabled: true,
  ttlMs: 3600000, // 1 hour
  maxEntries: 500,
};

/**
 * Consensus engine for multi-agent decision making.
 *
 * @example
 * ```typescript
 * const engine = new ConsensusEngine({ defaultTimeout: 30000 });
 * const proposalResult = await engine.propose({
 *   title: 'Use microservices architecture',
 *   description: 'Proposal to adopt microservices',
 *   algorithm: 'supermajority',
 * });
 * if (proposalResult.ok) {
 *   await engine.vote(proposalResult.value, 'agent-1', {
 *     decision: 'approve',
 *     confidence: 0.9,
 *     reasoning: 'Good for scalability',
 *   });
 * }
 * ```
 */
export class ConsensusEngine implements IConsensusEngine {
  private readonly proposals: Map<ProposalId, ProposalState> = new Map();
  private readonly closedProposals: Map<ProposalId, ConsensusResult> = new Map();
  private readonly agentPerformance: Map<string, AgentPerformance> = new Map();
  private readonly proposalContentCache: Map<string, ProposalCacheEntry> = new Map();
  private readonly strategyFactory: VotingStrategyFactory;
  private readonly config: ConsensusEngineConfig;
  private readonly cacheConfig: ProposalCacheConfig;
  private readonly logger: ILogger;
  private readonly metrics: InternalMetrics;

  constructor(config?: Partial<ConsensusEngineConfig>, logger?: ILogger) {
    this.config = { ...DEFAULT_CONSENSUS_CONFIG, ...config };
    this.cacheConfig = { ...DEFAULT_PROPOSAL_CACHE_CONFIG, ...config?.proposalCache };
    this.logger = logger ?? createLogger({ component: 'ConsensusEngine' });
    this.strategyFactory = new VotingStrategyFactory();
    this.metrics = this.createInitialMetrics();
  }

  propose(proposal: Proposal): Promise<Result<ProposalId, ConsensusError>> {
    const validation = ProposalSchema.safeParse(proposal);
    if (!validation.success) {
      return Promise.resolve(
        err(
          new ConsensusError(`Invalid proposal: ${validation.error.message}`, {
            errors: validation.error.errors,
          })
        )
      );
    }

    // Check cache for identical proposal content (Issue #589)
    if (this.cacheConfig.enabled) {
      const cachedEntry = this.getCachedResult(validation.data);
      if (cachedEntry !== undefined) {
        this.logger.debug('Returning cached proposal result', {
          cachedProposalId: cachedEntry.proposalId,
          cachedOutcome: cachedEntry.result.outcome,
        });
        return Promise.resolve(ok(cachedEntry.proposalId));
      }
    }

    if (this.proposals.size >= this.config.maxActiveProposals) {
      return Promise.resolve(
        err(
          new ConsensusError(
            `Maximum active proposals (${String(this.config.maxActiveProposals)}) reached`
          )
        )
      );
    }

    const proposalId = proposal.id ?? generateProposalId();
    const state = this.createProposalState(validation.data, proposalId);
    this.setupTimeout(state, proposalId, proposal.timeout);
    this.registerProposal(proposalId, state, proposal.algorithm);
    return Promise.resolve(ok(proposalId));
  }

  vote(proposalId: ProposalId, agentId: string, vote: Vote): Promise<Result<void, ConsensusError>> {
    const validationErr = this.validateVote(vote);
    if (validationErr !== undefined) return Promise.resolve(err(validationErr));

    const stateErr = this.validateProposalState(proposalId);
    if (stateErr !== undefined) return Promise.resolve(err(stateErr));

    const state = this.proposals.get(proposalId);
    if (state === undefined) {
      return Promise.resolve(err(new ConsensusError(`Proposal ${proposalId} not found`)));
    }

    this.recordVote(state, agentId, vote);

    // Close if all required voters have voted OR if agreement-based cascade triggers
    if (this.allRequiredVotersVoted(state) || this.canCascadeEarly(state)) {
      return this.closeInternal(proposalId).then((result) =>
        result.ok ? ok(undefined) : err(result.error)
      );
    }

    return Promise.resolve(ok(undefined));
  }

  getResult(proposalId: ProposalId): Promise<Result<ConsensusResult, ConsensusError>> {
    const closedResult = this.closedProposals.get(proposalId);
    if (closedResult !== undefined) return Promise.resolve(ok(closedResult));

    const state = this.proposals.get(proposalId);
    if (state === undefined) {
      return Promise.resolve(err(new ConsensusError(`Proposal ${proposalId} not found`)));
    }

    const outcome = this.calculateOutcome(state);
    return Promise.resolve(ok(buildPendingResult(state, proposalId, outcome, this.config)));
  }

  close(proposalId: ProposalId): Promise<Result<ConsensusResult, ConsensusError>> {
    return this.closeInternal(proposalId);
  }

  getMetrics(): ConsensusMetrics {
    const completed =
      this.metrics.approvedProposals +
      this.metrics.rejectedProposals +
      this.metrics.timedOutProposals;
    return {
      totalProposals: this.metrics.totalProposals,
      approvedProposals: this.metrics.approvedProposals,
      rejectedProposals: this.metrics.rejectedProposals,
      timedOutProposals: this.metrics.timedOutProposals,
      averageDurationMs: completed > 0 ? this.metrics.totalDurationMs / completed : 0,
      averageVotesPerProposal: completed > 0 ? this.metrics.totalVotes / completed : 0,
      algorithmUsage: { ...this.metrics.algorithmUsage },
    };
  }

  updateAgentPerformance(agentId: string, wasCorrect: boolean): void {
    const existing = this.agentPerformance.get(agentId);
    const now = getTimeProvider().nowIso();

    if (existing === undefined) {
      this.agentPerformance.set(agentId, {
        agentId,
        totalVotes: 1,
        correctVotes: wasCorrect ? 1 : 0,
        successRate: wasCorrect ? 1.0 : 0.0,
        lastUpdated: now,
      });
    } else {
      const totalVotes = existing.totalVotes + 1;
      const correctVotes = existing.correctVotes + (wasCorrect ? 1 : 0);
      this.agentPerformance.set(agentId, {
        agentId,
        totalVotes,
        correctVotes,
        successRate: correctVotes / totalVotes,
        lastUpdated: now,
      });
    }
  }

  getAgentPerformance(agentId: string): AgentPerformance | undefined {
    return this.agentPerformance.get(agentId);
  }

  getActiveProposalCount(): number {
    return this.proposals.size;
  }

  private createProposalState(data: Proposal, proposalId: ProposalId): ProposalState {
    const now = new Date(getTimeProvider().now());
    return {
      proposal: { ...data, id: proposalId, createdAt: now.toISOString() },
      status: 'voting',
      votes: new Map(),
      voteWeights: new Map(),
      startedAt: now,
    };
  }

  private setupTimeout(state: ProposalState, proposalId: ProposalId, timeout?: number): void {
    const timeoutMs = timeout ?? this.config.defaultTimeout;
    state.timeoutId = setTimeout(() => {
      this.handleTimeout(proposalId);
    }, timeoutMs);
  }

  private registerProposal(
    proposalId: ProposalId,
    state: ProposalState,
    algorithm: ConsensusAlgorithm
  ): void {
    this.proposals.set(proposalId, state);
    this.metrics.totalProposals++;
    this.metrics.algorithmUsage[algorithm]++;
    this.logger.info('Proposal created', {
      proposalId,
      title: state.proposal.title,
      algorithm,
      timeout: this.config.defaultTimeout,
    });
  }

  private validateVote(vote: Vote): ConsensusError | undefined {
    const validation = VoteSchema.safeParse(vote);
    if (!validation.success) {
      return new ConsensusError(`Invalid vote: ${validation.error.message}`, {
        errors: validation.error.errors,
      });
    }
    return undefined;
  }

  private validateProposalState(proposalId: ProposalId): ConsensusError | undefined {
    const state = this.proposals.get(proposalId);
    if (state === undefined) {
      if (this.closedProposals.has(proposalId)) {
        return new ConsensusError(`Proposal ${proposalId} is already closed`);
      }
      return new ConsensusError(`Proposal ${proposalId} not found`);
    }
    if (state.status !== 'voting') {
      return new ConsensusError(`Proposal ${proposalId} is not accepting votes`, {
        status: state.status,
      });
    }
    return undefined;
  }

  private recordVote(state: ProposalState, agentId: string, vote: Vote): void {
    state.votes.set(agentId, {
      ...vote,
      timestamp: getTimeProvider().nowIso(),
    });
    if (state.proposal.algorithm === 'proof_of_learning') {
      const performance = this.agentPerformance.get(agentId);
      state.voteWeights.set(agentId, calculateVoteWeight(performance));
    }
    this.logger.debug('Vote recorded', {
      proposalId: state.proposal.id,
      agentId,
      decision: vote.decision,
      confidence: vote.confidence,
    });
  }

  private closeInternal(proposalId: ProposalId): Promise<Result<ConsensusResult, ConsensusError>> {
    const state = this.proposals.get(proposalId);
    if (state === undefined) {
      const closed = this.closedProposals.get(proposalId);
      if (closed !== undefined) return Promise.resolve(ok(closed));
      return Promise.resolve(err(new ConsensusError(`Proposal ${proposalId} not found`)));
    }

    if (state.timeoutId !== undefined) clearTimeout(state.timeoutId);

    const outcome = this.calculateOutcome(state);
    const result = buildFinalResult(state, proposalId, outcome, this.config);
    this.finalize(proposalId, result, state.votes.size);
    return Promise.resolve(ok(result));
  }

  private handleTimeout(proposalId: ProposalId): void {
    const state = this.proposals.get(proposalId);
    if (state?.status !== 'voting') return;

    this.logger.warn('Proposal timed out', { proposalId, voteCount: state.votes.size });
    const outcome = this.calculateOutcome(state);
    const result = buildTimeoutResult(state, proposalId, outcome, this.config);
    this.proposals.delete(proposalId);
    this.addClosedProposal(proposalId, result);
    this.metrics.timedOutProposals++;
    this.metrics.totalDurationMs += result.durationMs;
    this.metrics.totalVotes += state.votes.size;
  }

  private finalize(proposalId: ProposalId, result: ConsensusResult, voteCount: number): void {
    this.proposals.delete(proposalId);
    this.addClosedProposal(proposalId, result);
    this.updateMetrics(result);

    // Cache successful results for determinism (Issue #589)
    if (
      this.cacheConfig.enabled &&
      (result.outcome === 'approved' || result.outcome === 'rejected')
    ) {
      this.addToCache(result.proposal, proposalId, result);
    }

    this.logger.info('Proposal closed', {
      proposalId,
      outcome: result.outcome,
      approvalPercentage: result.approvalPercentage.toFixed(1),
      voteCount,
      quorumReached: result.quorumReached,
      durationMs: result.durationMs,
    });
  }

  /**
   * Adds a closed proposal and evicts oldest entries if over limit.
   * Issue #549: Prevent unbounded memory growth in closedProposals Map.
   */
  private addClosedProposal(proposalId: ProposalId, result: ConsensusResult): void {
    // Evict oldest entries if at capacity (Map maintains insertion order)
    while (this.closedProposals.size >= this.config.maxClosedProposals) {
      const firstKey = this.closedProposals.keys().next();
      if (firstKey.done === true) break;
      const oldestKey = firstKey.value;
      this.closedProposals.delete(oldestKey);
      this.logger.debug('Evicted oldest closed proposal', { evictedId: oldestKey });
    }
    this.closedProposals.set(proposalId, result);
  }

  private calculateOutcome(state: ProposalState): VotingOutcome {
    const strategy = this.strategyFactory.getStrategy(state.proposal.algorithm);
    const outcome: VotingOutcome = strategy.calculateOutcome(state.votes, state.voteWeights);
    return outcome;
  }

  /**
   * Agreement-based cascading: close early when outcome is mathematically determined.
   * If approvals already exceed the threshold even if all remaining voters reject,
   * or rejections make approval impossible, the proposal can be decided early.
   */
  private canCascadeEarly(state: ProposalState): boolean {
    const required = state.proposal.requiredVoters;
    if (required === undefined || required.length === 0) return false;

    const totalExpected = required.length;
    const votesCast = state.votes.size;
    const remaining = totalExpected - votesCast;
    if (remaining <= 0) return false; // All voted — handled by allRequiredVotersVoted

    const threshold = VOTING_THRESHOLDS[state.proposal.algorithm];

    let approvals = 0;
    let rejections = 0;
    for (const vote of state.votes.values()) {
      if (vote.decision === 'approve') approvals++;
      else if (vote.decision === 'reject') rejections++;
    }

    // Can approve even if all remaining reject?
    const minApprovalRate = approvals / totalExpected;
    if (minApprovalRate > threshold) {
      this.logger.info('Agreement cascade: early approval', {
        proposalId: state.proposal.id,
        approvals,
        totalExpected,
        threshold,
        remaining,
      });
      return true;
    }

    // Can never reach threshold even if all remaining approve?
    const maxPossibleApprovals = approvals + remaining;
    const maxApprovalRate = maxPossibleApprovals / totalExpected;
    if (maxApprovalRate < threshold) {
      this.logger.info('Agreement cascade: early rejection', {
        proposalId: state.proposal.id,
        rejections,
        totalExpected,
        threshold,
        remaining,
      });
      return true;
    }

    return false;
  }

  private allRequiredVotersVoted(state: ProposalState): boolean {
    const required = state.proposal.requiredVoters;
    if (required === undefined || required.length === 0) return false;
    return required.every((voterId) => state.votes.has(voterId));
  }

  private updateMetrics(result: ConsensusResult): void {
    this.metrics.totalDurationMs += result.durationMs;
    this.metrics.totalVotes += result.voteCounts.total;
    if (result.outcome === 'approved') this.metrics.approvedProposals++;
    else if (result.outcome === 'rejected') this.metrics.rejectedProposals++;
    else if (result.outcome === 'timeout') this.metrics.timedOutProposals++;
  }

  private createInitialMetrics(): InternalMetrics {
    return {
      totalProposals: 0,
      approvedProposals: 0,
      rejectedProposals: 0,
      timedOutProposals: 0,
      totalDurationMs: 0,
      totalVotes: 0,
      algorithmUsage: {
        simple_majority: 0,
        supermajority: 0,
        unanimous: 0,
        proof_of_learning: 0,
        opinion_wise: 0,
      },
    };
  }

  // ============================================================================
  // Proposal Content Caching (Issue #589)
  // ============================================================================

  /**
   * Creates a content hash for a proposal to enable cache lookups.
   * Hash is based on title, description, and algorithm (deterministic content).
   */
  private hashProposalContent(proposal: Proposal): string {
    const content = [proposal.title, proposal.description, proposal.algorithm].join('|');
    // Simple FNV-1a hash for fast deterministic hashing
    let hash = 2166136261;
    for (let i = 0; i < content.length; i++) {
      hash ^= content.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  /**
   * Gets cached result for a proposal if it exists and hasn't expired.
   */
  private getCachedResult(proposal: Proposal): ProposalCacheEntry | undefined {
    const hash = this.hashProposalContent(proposal);
    const cached = this.proposalContentCache.get(hash);
    if (cached === undefined) return undefined;

    const now = getTimeProvider().now();
    if (now - cached.cachedAt > this.cacheConfig.ttlMs) {
      this.proposalContentCache.delete(hash);
      this.logger.debug('Cache entry expired', { hash });
      return undefined;
    }

    return cached;
  }

  /**
   * Adds a proposal result to the cache, evicting oldest entries if needed.
   */
  private addToCache(proposal: Proposal, proposalId: ProposalId, result: ConsensusResult): void {
    const hash = this.hashProposalContent(proposal);

    // Evict oldest entries if at capacity (Map maintains insertion order)
    while (this.proposalContentCache.size >= this.cacheConfig.maxEntries) {
      const firstKey = this.proposalContentCache.keys().next();
      if (firstKey.done === true) break;
      const oldestKey = firstKey.value;
      this.proposalContentCache.delete(oldestKey);
      this.logger.debug('Evicted oldest cache entry', { hash: oldestKey });
    }

    this.proposalContentCache.set(hash, {
      proposalId,
      result,
      cachedAt: getTimeProvider().now(),
    });
    this.logger.debug('Added proposal to cache', { hash, proposalId });
  }

  /**
   * Gets the current cache size (for testing/monitoring).
   */
  getCacheSize(): number {
    return this.proposalContentCache.size;
  }

  /**
   * Clears the proposal content cache (for testing/reset).
   */
  clearCache(): void {
    this.proposalContentCache.clear();
    this.logger.debug('Proposal cache cleared');
  }
}

/**
 * Create a consensus engine with the given configuration.
 *
 * @example
 * ```typescript
 * const engine = createConsensusEngine({
 *   defaultTimeout: 60000,
 *   maxActiveProposals: 10,
 * });
 * ```
 */
export function createConsensusEngine(
  config?: Partial<ConsensusEngineConfig>,
  logger?: ILogger
): ConsensusEngine {
  return new ConsensusEngine(config, logger);
}
