/**
 * nexus-agents/agents/collaboration - Aegean Consensus Protocol
 *
 * Implementation of Byzantine-fault-tolerant consensus based on
 * arxiv:2512.20184 "Reaching Agreement Among Reasoning LLM Agents".
 *
 * Key features:
 * - Leader-based coordination with round-robin leader selection
 * - Incremental quorum detection for early termination
 * - Byzantine fault tolerance (tolerates f faults out of 3f+1 agents)
 */

import type { Result, ILogger, IAgent, Task } from '../../core/index.js';
import { ok, err, AgentError, createLogger } from '../../core/index.js';
import type { CollaborationConfig, CollaborationResult } from './collaboration-types.js';
import { CollaborationSession, createCollaborationSession } from './collaboration-session.js';
import type { ICollaborationProtocol, ProtocolOptions } from './collaboration-protocol.js';
import type {
  AegeanConfig,
  AegeanResult,
  AegeanRound,
  Proposal,
  AgentVote,
  QuorumStatus,
} from './aegean-types.js';
import { calculateQuorumSize, isConsensusFailed } from './aegean-types.js';
import type { IEventBus } from './event-bus-types.js';
import { getGlobalEventBus } from './event-bus.js';
import {
  emitProtocolStarted,
  emitProtocolIteration,
  emitProtocolCompleted,
  emitAegeanRoundStarted,
  emitAegeanVoteCollected,
  emitAegeanQuorumDetected,
} from './aegean-events.js';
import {
  createTimeoutVote,
  createLeaderVote,
  buildAegeanResult,
  evaluateQuorumStatus,
  buildAegeanConfig,
  createProposalTask,
  createProposal,
  createVoteTask,
  createVoteFromOutput,
  selectLeader,
  createRoundData,
  determineIterationAction,
  type CollectVotesOptions,
  type IterationAction,
} from './aegean-helpers.js';

/** Options for the Aegean protocol. */
export interface AegeanProtocolOptions extends ProtocolOptions {
  readonly aegeanConfig?: Partial<AegeanConfig>;
  /** Optional event bus for protocol lifecycle events. Uses global bus if not provided. */
  readonly eventBus?: IEventBus;
}

/**
 * Aegean Byzantine-fault-tolerant consensus protocol.
 */
export class AegeanProtocol implements ICollaborationProtocol {
  readonly pattern = 'aegean' as const;
  protected readonly logger: ILogger;
  protected readonly eventBus: IEventBus;
  protected session: CollaborationSession | null = null;
  protected cancelled = false;
  protected readonly options: AegeanProtocolOptions;
  protected readonly config: AegeanConfig;

  constructor(options: AegeanProtocolOptions = {}) {
    this.options = options;
    this.logger = options.logger ?? createLogger({ component: 'AegeanProtocol' });
    this.eventBus = options.eventBus ?? getGlobalEventBus();
    this.config = buildAegeanConfig(options);
  }

  cancel(reason: string): void {
    this.cancelled = true;
    this.session?.cancel(reason);
    this.logger.info('Aegean protocol cancelled', { reason });
  }

  async execute(
    config: CollaborationConfig,
    agents: Map<string, IAgent>
  ): Promise<Result<CollaborationResult, AgentError>> {
    const validationResult = this.validateSetup(config, agents);
    if (!validationResult.ok) return err(validationResult.error);

    const startTime = Date.now();
    this.cancelled = false;
    this.session = createCollaborationSession(this.options.sessionOptions);

    const startResult = this.session.start(config);
    if (!startResult.ok) return err(startResult.error);

    this.logger.info('Starting Aegean consensus', {
      sessionId: config.sessionId,
      agents: config.experts.length,
      byzantineTolerance: this.config.byzantineTolerance,
      maxRounds: this.config.maxRounds,
    });
    emitProtocolStarted(this.eventBus, {
      sessionId: config.sessionId,
      agentCount: config.experts.length,
      aegeanConfig: this.config,
    });

    const aegeanResult = await this.runConsensusLoop(config, agents);
    if (!aegeanResult.ok) {
      this.session.cancel(aegeanResult.error.message);
      return err(aegeanResult.error);
    }

    return this.finalizeSession(config, aegeanResult.value, startTime);
  }

  /** Validates the protocol setup. */
  private validateSetup(
    config: CollaborationConfig,
    agents: Map<string, IAgent>
  ): Result<void, AgentError> {
    const minAgents = 3 * this.config.byzantineTolerance + 1;
    if (config.experts.length < minAgents) {
      return err(
        new AgentError(
          `Aegean requires at least ${String(minAgents)} agents for f=${String(this.config.byzantineTolerance)} Byzantine tolerance`
        )
      );
    }

    for (const expertId of config.experts) {
      if (!agents.has(expertId)) {
        return err(new AgentError(`Agent not found: ${expertId}`));
      }
    }

    return ok(undefined);
  }

  /** Runs the main consensus loop. */
  private async runConsensusLoop(
    config: CollaborationConfig,
    agents: Map<string, IAgent>
  ): Promise<Result<AegeanResult, AgentError>> {
    const startTime = Date.now();
    const rounds: AegeanRound[] = [];
    let totalTokensUsed = 0;

    for (let round = 0; round < this.config.maxRounds; round++) {
      const action = this.determinePreRoundAction(rounds, startTime, totalTokensUsed);
      if (action) return ok(action);

      const roundResult = await this.executeRound(round, config, agents);
      if (!roundResult.ok) return err(roundResult.error);

      const { roundData, tokensUsed } = roundResult.value;
      rounds.push(roundData);
      totalTokensUsed += tokensUsed;

      const ctx = this.createIterationContext(rounds, startTime, totalTokensUsed);
      const iterAction = this.handleIterationAction(round, roundData, config, ctx);
      if (iterAction) return ok(iterAction);
    }

    return ok(this.buildLoopResult(rounds, null, 'max_rounds', startTime, totalTokensUsed));
  }

  /** Determines if the loop should exit before a round. */
  private determinePreRoundAction(
    rounds: AegeanRound[],
    startTime: number,
    tokensUsed: number
  ): AegeanResult | null {
    if (this.cancelled) {
      return this.buildLoopResult(rounds, null, 'error', startTime, tokensUsed);
    }
    return null;
  }

  /** Context for loop iteration handling. */
  private createIterationContext(
    rounds: AegeanRound[],
    startTime: number,
    totalTokensUsed: number
  ): { rounds: AegeanRound[]; startTime: number; tokensUsed: number } {
    return { rounds, startTime, tokensUsed: totalTokensUsed };
  }

  /** Handles post-round iteration actions. */
  private handleIterationAction(
    round: number,
    roundData: AegeanRound,
    config: CollaborationConfig,
    ctx: { rounds: AegeanRound[]; startTime: number; tokensUsed: number }
  ): AegeanResult | null {
    const action = determineIterationAction({
      cancelled: this.cancelled,
      consensusReached: roundData.quorumStatus.consensusReached,
      consensusValue: roundData.proposal?.value ?? null,
      earlyTerminationEnabled: this.config.earlyTermination,
      shouldEarlyTerminate: isConsensusFailed(roundData.quorumStatus, config.experts.length),
    });

    return this.processIterationAction(action, round, config.sessionId, ctx);
  }

  /** Processes the iteration action and emits events. */
  private processIterationAction(
    action: IterationAction,
    round: number,
    sessionId: string,
    ctx: { rounds: AegeanRound[]; startTime: number; tokensUsed: number }
  ): AegeanResult | null {
    switch (action.type) {
      case 'consensus':
        this.emitIterationEvent(round, 'converged', sessionId);
        return this.buildLoopResult(
          ctx.rounds,
          action.value,
          'consensus',
          ctx.startTime,
          ctx.tokensUsed
        );
      case 'early_termination':
        this.logger.info('Early termination: consensus impossible', { round });
        this.emitIterationEvent(round, 'max_reached', sessionId);
        return this.buildLoopResult(ctx.rounds, null, 'max_rounds', ctx.startTime, ctx.tokensUsed);
      case 'continue':
        this.emitIterationEvent(round, 'in_progress', sessionId);
        return null;
      case 'cancelled':
        return this.buildLoopResult(ctx.rounds, null, 'error', ctx.startTime, ctx.tokensUsed);
    }
  }

  /** Emits a protocol iteration event. */
  private emitIterationEvent(
    round: number,
    status: 'converged' | 'max_reached' | 'in_progress',
    sessionId: string
  ): void {
    emitProtocolIteration(this.eventBus, {
      round,
      maxRounds: this.config.maxRounds,
      status,
      sessionId,
    });
  }

  /** Builds the final loop result. */
  private buildLoopResult(
    rounds: AegeanRound[],
    consensusValue: unknown,
    terminationReason: AegeanResult['terminationReason'],
    startTime: number,
    tokensUsed: number
  ): AegeanResult {
    return buildAegeanResult({ rounds, consensusValue, terminationReason, startTime, tokensUsed });
  }

  /** Executes a single consensus round. */
  private async executeRound(
    roundNumber: number,
    config: CollaborationConfig,
    agents: Map<string, IAgent>
  ): Promise<Result<{ roundData: AegeanRound; tokensUsed: number }, AgentError>> {
    const roundStart = Date.now();
    const leaderId = selectLeader(config.experts, roundNumber);
    const leader = agents.get(leaderId);

    if (leader === undefined) {
      return err(new AgentError(`Leader agent not found: ${leaderId}`));
    }

    this.logger.debug('Starting round', { roundNumber, leaderId });

    // Emit round started event (Issue #216)
    emitAegeanRoundStarted(this.eventBus, {
      round: roundNumber,
      maxRounds: this.config.maxRounds,
      leaderId,
      sessionId: config.sessionId,
    });

    // Phase 1: Leader proposes
    const proposalResult = await this.generateProposal(leader, leaderId, config.task, roundNumber);
    if (!proposalResult.ok) return err(proposalResult.error);

    const { proposal, tokensUsed: proposalTokens } = proposalResult.value;

    // Phase 2: Collect votes
    const votesResult = await this.collectVotes({
      experts: config.experts,
      agents,
      proposal,
      leaderId,
      roundNumber,
      sessionId: config.sessionId,
    });
    if (!votesResult.ok) return err(votesResult.error);

    const { votes, tokensUsed: voteTokens } = votesResult.value;

    // Phase 3: Evaluate quorum
    const quorumStatus = this.evaluateQuorum(
      votes,
      config.experts.length,
      roundNumber,
      config.sessionId
    );

    const roundData = createRoundData({
      roundNumber,
      leaderId,
      proposal,
      votes,
      quorumStatus,
      startTime: roundStart,
    });
    this.logger.debug('Round complete', { roundNumber, ...quorumStatus });

    return ok({ roundData, tokensUsed: proposalTokens + voteTokens });
  }

  /** Generates a proposal from the leader. */
  private async generateProposal(
    leader: IAgent,
    leaderId: string,
    task: Task,
    round: number
  ): Promise<Result<{ proposal: Proposal; tokensUsed: number }, AgentError>> {
    const result = await leader.execute(createProposalTask(task, round));
    if (!result.ok) return err(result.error);
    return ok({
      proposal: createProposal(round, leaderId, result.value.output),
      tokensUsed: result.value.metadata.tokensUsed,
    });
  }

  /** Collects votes from all agents. */
  private async collectVotes(
    opts: CollectVotesOptions
  ): Promise<Result<{ votes: AgentVote[]; tokensUsed: number }, AgentError>> {
    const { experts, agents, proposal, leaderId, roundNumber, sessionId } = opts;
    const votes: AgentVote[] = [];
    let totalTokens = 0;
    const quorumSize = calculateQuorumSize(experts.length, this.config.byzantineTolerance);

    const voterIds = experts.filter((id) => id !== leaderId);

    const votePromises = voterIds.map(async (agentId) => {
      const agent = agents.get(agentId);
      if (agent === undefined) {
        return { agentId, vote: createTimeoutVote(agentId, proposal.proposalId), tokens: 0 };
      }

      const voteResult = await this.getAgentVote(agent, agentId, proposal);
      if (!voteResult.ok) {
        return {
          agentId,
          vote: createTimeoutVote(agentId, proposal.proposalId),
          tokens: 0,
        };
      }

      return { agentId, vote: voteResult.value.vote, tokens: voteResult.value.tokensUsed };
    });

    const results = await Promise.all(votePromises);

    for (const { vote, tokens } of results) {
      votes.push(vote);
      totalTokens += tokens;

      // Emit vote collected event (Issue #216)
      emitAegeanVoteCollected(this.eventBus, {
        round: roundNumber,
        voterId: vote.agentId,
        voteCount: votes.length,
        requiredQuorum: quorumSize,
        sessionId,
      });
    }

    // Leader implicitly accepts their own proposal
    votes.push(createLeaderVote(leaderId, proposal.proposalId));

    return ok({ votes, tokensUsed: totalTokens });
  }

  /** Gets a vote from an agent. */
  private async getAgentVote(
    agent: IAgent,
    agentId: string,
    proposal: Proposal
  ): Promise<Result<{ vote: AgentVote; tokensUsed: number }, AgentError>> {
    const result = await agent.execute(createVoteTask(proposal, agentId));
    if (!result.ok) {
      return ok({ vote: createTimeoutVote(agentId, proposal.proposalId), tokensUsed: 0 });
    }
    return ok(
      createVoteFromOutput(
        agentId,
        proposal.proposalId,
        result.value.output,
        result.value.metadata.tokensUsed
      )
    );
  }

  /** Evaluates quorum status from votes. */
  private evaluateQuorum(
    votes: readonly AgentVote[],
    totalAgents: number,
    roundNumber: number,
    sessionId: string
  ): QuorumStatus {
    const quorum = evaluateQuorumStatus({
      votes,
      totalAgents,
      byzantineTolerance: this.config.byzantineTolerance,
    });

    if (quorum.hasQuorum) {
      emitAegeanQuorumDetected(this.eventBus, {
        round: roundNumber,
        quorumSize: quorum.accepts,
        earlyTermination: this.config.earlyTermination,
        sessionId,
      });
    }
    return quorum;
  }

  /** Finalizes the session with results. */
  private finalizeSession(
    config: CollaborationConfig,
    result: AegeanResult,
    startTime: number
  ): Result<CollaborationResult, AgentError> {
    if (this.session === null) {
      return err(new AgentError('No active session'));
    }

    const leaderId = config.experts[0] ?? 'unknown';
    this.session.submitResult(leaderId, {
      taskId: config.task.id,
      output: {
        consensusValue: result.consensusValue,
        aegean: {
          rounds: result.totalRounds,
          consensusReached: result.consensusReached,
          terminationReason: result.terminationReason,
        },
      },
      metadata: {
        durationMs: Date.now() - startTime,
        tokensUsed: result.tokensUsed,
        toolsUsed: [],
        model: 'aegean-protocol',
      },
    });

    const sessionId = this.session.getStatus()?.config.sessionId;
    emitProtocolCompleted(this.eventBus, {
      result,
      startTime,
      ...(sessionId !== undefined && { sessionId }),
    });
    return this.session.finalize();
  }
}

/** Creates an Aegean protocol instance. */
export function createAegeanProtocol(options?: AegeanProtocolOptions): AegeanProtocol {
  return new AegeanProtocol(options);
}
