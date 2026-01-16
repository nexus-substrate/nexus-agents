/**
 * Aegean Consensus Protocol - Byzantine-fault-tolerant consensus.
 * Based on arxiv:2512.20184 "Reaching Agreement Among Reasoning LLM Agents".
 * Types: aegean-types.ts, Events: aegean-events.ts, Helpers: aegean-helpers.ts
 */

import type { Result, ILogger, IAgent, Task } from '../../core/index.js';
import { ok, err, AgentError, createLogger } from '../../core/index.js';
import type {
  CollaborationConfig,
  CollaborationResult,
  ICollaborationProtocol,
  ProtocolOptions,
} from './collaboration-types.js';
import { CollaborationSession, createCollaborationSession } from './collaboration-session.js';
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
  evaluateQuorumStatus,
  buildAegeanConfig,
  createProposalTask,
  createProposal,
  createVoteTask,
  createVoteFromOutput,
  selectLeader,
  createRoundData,
  determineIterationAction,
  determinePreRoundAction,
  createIterationContext,
  processIterationAction,
  buildLoopResult,
  validateAegeanSetup,
  buildSessionTaskResult,
  type CollectVotesOptions,
  type IterationContext,
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
    const validation = validateAegeanSetup({
      config,
      agents,
      byzantineTolerance: this.config.byzantineTolerance,
    });
    if (!validation.ok) return err(validation.error);

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

  /** Runs the main consensus loop. */
  private async runConsensusLoop(
    config: CollaborationConfig,
    agents: Map<string, IAgent>
  ): Promise<Result<AegeanResult, AgentError>> {
    const startTime = Date.now();
    const rounds: AegeanRound[] = [];
    let totalTokensUsed = 0;

    for (let round = 0; round < this.config.maxRounds; round++) {
      const preAction = determinePreRoundAction(this.cancelled, rounds, startTime, totalTokensUsed);
      if (preAction) return ok(preAction);

      const roundResult = await this.executeRound(round, config, agents);
      if (!roundResult.ok) return err(roundResult.error);

      const { roundData, tokensUsed } = roundResult.value;
      rounds.push(roundData);
      totalTokensUsed += tokensUsed;

      const ctx = createIterationContext(rounds, startTime, totalTokensUsed);
      const iterAction = this.handleIterationAction(round, roundData, config, ctx);
      if (iterAction) return ok(iterAction);
    }

    return ok(buildLoopResult(rounds, null, 'max_rounds', startTime, totalTokensUsed));
  }

  /** Handles post-round iteration actions. */
  private handleIterationAction(
    round: number,
    roundData: AegeanRound,
    config: CollaborationConfig,
    ctx: IterationContext
  ): AegeanResult | null {
    const action = determineIterationAction({
      cancelled: this.cancelled,
      consensusReached: roundData.quorumStatus.consensusReached,
      consensusValue: roundData.proposal?.value ?? null,
      earlyTerminationEnabled: this.config.earlyTermination,
      shouldEarlyTerminate: isConsensusFailed(roundData.quorumStatus, config.experts.length),
    });

    return processIterationAction({
      action,
      round,
      sessionId: config.sessionId,
      maxRounds: this.config.maxRounds,
      ctx,
      emitIterationEvent: (r, status, sessId) => {
        this.emitIterationEvent(r, status, sessId);
      },
      onEarlyTermination: (r) => {
        this.logger.info('Early termination: consensus impossible', { round: r });
      },
    });
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
    this.session.submitResult(leaderId, buildSessionTaskResult(config.task.id, result, startTime));

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
