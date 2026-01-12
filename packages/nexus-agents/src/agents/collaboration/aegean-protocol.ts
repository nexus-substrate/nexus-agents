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
import {
  DEFAULT_AEGEAN_CONFIG,
  AegeanConfigSchema,
  calculateQuorumSize,
  isConsensusFailed,
} from './aegean-types.js';
import type {
  IEventBus,
  ProtocolStartedEvent,
  ProtocolIterationEvent,
  ProtocolCompletedEvent,
} from './event-bus-types.js';
import { createEvent, getGlobalEventBus } from './event-bus.js';

/** Options for the Aegean protocol. */
export interface AegeanProtocolOptions extends ProtocolOptions {
  readonly aegeanConfig?: Partial<AegeanConfig>;
  /** Optional event bus for protocol lifecycle events. Uses global bus if not provided. */
  readonly eventBus?: IEventBus;
}

/** Builds and validates Aegean configuration. */
function buildAegeanConfig(options: AegeanProtocolOptions): AegeanConfig {
  const merged = { ...DEFAULT_AEGEAN_CONFIG, ...options.aegeanConfig };
  const parsed = AegeanConfigSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(`Invalid Aegean config: ${parsed.error.message}`);
  }
  return parsed.data;
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

    this.logProtocolStart(config);
    this.emitProtocolStarted(config);

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

  /** Logs protocol start. */
  private logProtocolStart(config: CollaborationConfig): void {
    this.logger.info('Starting Aegean consensus', {
      sessionId: config.sessionId,
      agents: config.experts.length,
      byzantineTolerance: this.config.byzantineTolerance,
      maxRounds: this.config.maxRounds,
    });
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
      if (this.cancelled) {
        return ok(this.buildResult(rounds, null, 'error', startTime, totalTokensUsed));
      }

      const roundResult = await this.executeRound(round, config, agents);
      if (!roundResult.ok) return err(roundResult.error);

      const { roundData, tokensUsed } = roundResult.value;
      rounds.push(roundData);
      totalTokensUsed += tokensUsed;

      if (roundData.quorumStatus.consensusReached) {
        this.emitProtocolIteration(round, 'converged', config.sessionId);
        return ok(
          this.buildResult(
            rounds,
            roundData.proposal?.value ?? null,
            'consensus',
            startTime,
            totalTokensUsed
          )
        );
      }

      if (
        this.config.earlyTermination &&
        isConsensusFailed(roundData.quorumStatus, config.experts.length)
      ) {
        this.logger.info('Early termination: consensus impossible', { round });
        this.emitProtocolIteration(round, 'max_reached', config.sessionId);
        break;
      }

      // Emit iteration event for rounds that continue
      this.emitProtocolIteration(round, 'in_progress', config.sessionId);
    }

    return ok(this.buildResult(rounds, null, 'max_rounds', startTime, totalTokensUsed));
  }

  /** Executes a single consensus round. */
  private async executeRound(
    roundNumber: number,
    config: CollaborationConfig,
    agents: Map<string, IAgent>
  ): Promise<Result<{ roundData: AegeanRound; tokensUsed: number }, AgentError>> {
    const roundStart = Date.now();
    const leaderId = this.selectLeader(config.experts, roundNumber);
    const leader = agents.get(leaderId);

    if (leader === undefined) {
      return err(new AgentError(`Leader agent not found: ${leaderId}`));
    }

    this.logger.debug('Starting round', { roundNumber, leaderId });

    // Phase 1: Leader proposes
    const proposalResult = await this.generateProposal(leader, leaderId, config.task, roundNumber);
    if (!proposalResult.ok) return err(proposalResult.error);

    const { proposal, tokensUsed: proposalTokens } = proposalResult.value;

    // Phase 2: Collect votes
    const votesResult = await this.collectVotes(config.experts, agents, proposal, leaderId);
    if (!votesResult.ok) return err(votesResult.error);

    const { votes, tokensUsed: voteTokens } = votesResult.value;

    // Phase 3: Evaluate quorum
    const quorumStatus = this.evaluateQuorum(votes, config.experts.length);

    const roundData: AegeanRound = {
      roundNumber,
      phase: quorumStatus.consensusReached ? 'done' : 'voting',
      leaderId,
      proposal,
      votes,
      quorumStatus,
      startTime: roundStart,
      endTime: Date.now(),
    };

    this.logger.debug('Round complete', {
      roundNumber,
      accepts: quorumStatus.accepts,
      rejects: quorumStatus.rejects,
      consensusReached: quorumStatus.consensusReached,
    });

    return ok({ roundData, tokensUsed: proposalTokens + voteTokens });
  }

  /** Selects leader for a round using round-robin. */
  private selectLeader(experts: readonly string[], round: number): string {
    const expertList = experts as string[];
    return expertList[round % expertList.length] as string;
  }

  /** Generates a proposal from the leader. */
  private async generateProposal(
    leader: IAgent,
    leaderId: string,
    task: Task,
    round: number
  ): Promise<Result<{ proposal: Proposal; tokensUsed: number }, AgentError>> {
    const proposalTask: Task = {
      ...task,
      id: `${task.id}-proposal-${String(round)}`,
      description: `${task.description}\n\nAs the leader for round ${String(round + 1)}, propose a solution.`,
    };

    const result = await leader.execute(proposalTask);
    if (!result.ok) return err(result.error);

    const proposal: Proposal = {
      proposalId: `proposal-${String(round)}-${String(Date.now())}`,
      round,
      leaderId,
      value: result.value.output,
      timestamp: Date.now(),
    };

    return ok({ proposal, tokensUsed: result.value.metadata.tokensUsed });
  }

  /** Collects votes from all agents. */
  private async collectVotes(
    experts: readonly string[],
    agents: Map<string, IAgent>,
    proposal: Proposal,
    leaderId: string
  ): Promise<Result<{ votes: AgentVote[]; tokensUsed: number }, AgentError>> {
    const votes: AgentVote[] = [];
    let totalTokens = 0;

    const voterIds = experts.filter((id) => id !== leaderId);

    const votePromises = voterIds.map(async (agentId) => {
      const agent = agents.get(agentId);
      if (agent === undefined) {
        return { agentId, vote: this.createTimeoutVote(agentId, proposal.proposalId), tokens: 0 };
      }

      const voteResult = await this.getAgentVote(agent, agentId, proposal);
      if (!voteResult.ok) {
        return {
          agentId,
          vote: this.createTimeoutVote(agentId, proposal.proposalId),
          tokens: 0,
        };
      }

      return { agentId, vote: voteResult.value.vote, tokens: voteResult.value.tokensUsed };
    });

    const results = await Promise.all(votePromises);

    for (const { vote, tokens } of results) {
      votes.push(vote);
      totalTokens += tokens;
    }

    // Leader implicitly accepts their own proposal
    votes.push({
      agentId: leaderId,
      proposalId: proposal.proposalId,
      status: 'accept',
      reasoning: 'Leader accepts own proposal',
      confidence: 1.0,
      timestamp: Date.now(),
    });

    return ok({ votes, tokensUsed: totalTokens });
  }

  /** Gets a vote from an agent. */
  private async getAgentVote(
    agent: IAgent,
    agentId: string,
    proposal: Proposal
  ): Promise<Result<{ vote: AgentVote; tokensUsed: number }, AgentError>> {
    const voteTask: Task = {
      id: `vote-${proposal.proposalId}-${agentId}`,
      description: `Review the following proposal and vote ACCEPT or REJECT.\n\nProposal:\n${JSON.stringify(proposal.value, null, 2)}`,
      context: { metadata: { proposal } },
    };

    const result = await agent.execute(voteTask);
    if (!result.ok) {
      return ok({
        vote: this.createTimeoutVote(agentId, proposal.proposalId),
        tokensUsed: 0,
      });
    }

    const outputStr =
      typeof result.value.output === 'string'
        ? result.value.output
        : JSON.stringify(result.value.output);

    const isAccept = /accept|approve|agree|yes/i.test(outputStr);
    const isReject = /reject|disapprove|disagree|no/i.test(outputStr);

    const vote: AgentVote = {
      agentId,
      proposalId: proposal.proposalId,
      status: isAccept ? 'accept' : isReject ? 'reject' : 'pending',
      reasoning: outputStr.slice(0, 500),
      confidence: isAccept || isReject ? 0.8 : 0.5,
      timestamp: Date.now(),
    };

    return ok({ vote, tokensUsed: result.value.metadata.tokensUsed });
  }

  /** Creates a timeout vote. */
  private createTimeoutVote(agentId: string, proposalId: string): AgentVote {
    return {
      agentId,
      proposalId,
      status: 'timeout',
      reasoning: 'Agent did not respond in time',
      confidence: 0,
      timestamp: Date.now(),
    };
  }

  /** Evaluates quorum status from votes. */
  private evaluateQuorum(votes: readonly AgentVote[], totalAgents: number): QuorumStatus {
    const required = calculateQuorumSize(totalAgents, this.config.byzantineTolerance);
    const accepts = votes.filter((v) => v.status === 'accept').length;
    const rejects = votes.filter((v) => v.status === 'reject').length;
    const pending = votes.filter((v) => v.status === 'pending' || v.status === 'timeout').length;

    const quorum: QuorumStatus = {
      required,
      accepts,
      rejects,
      pending,
      hasQuorum: accepts >= required,
      consensusReached: accepts >= required,
    };

    return quorum;
  }

  /** Builds the final result. */
  private buildResult(
    rounds: readonly AegeanRound[],
    consensusValue: unknown,
    terminationReason: AegeanResult['terminationReason'],
    startTime: number,
    tokensUsed: number
  ): AegeanResult {
    return {
      consensusValue,
      consensusReached: terminationReason === 'consensus',
      totalRounds: rounds.length,
      totalDurationMs: Date.now() - startTime,
      tokensUsed,
      rounds,
      terminationReason,
    };
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

    this.emitProtocolCompleted(result, startTime);
    return this.session.finalize();
  }

  // ============================================================================
  // EventBus Integration (Issue #220)
  // ============================================================================

  /** Emits protocol.started event. */
  private emitProtocolStarted(config: CollaborationConfig): void {
    const event = createEvent<ProtocolStartedEvent>(
      'protocol.started',
      {
        protocolType: 'aegean',
        config: {
          maxRounds: this.config.maxRounds,
          confidenceThreshold: this.config.confidenceThreshold,
          byzantineTolerance: this.config.byzantineTolerance,
          agentCount: config.experts.length,
        },
      },
      {
        sessionId: config.sessionId,
      }
    );
    this.eventBus.emit(event);
  }

  /** Emits protocol.iteration event for each round. */
  private emitProtocolIteration(
    round: number,
    status: 'in_progress' | 'converged' | 'max_reached',
    sessionId: string
  ): void {
    const event = createEvent<ProtocolIterationEvent>(
      'protocol.iteration',
      {
        round: round + 1,
        maxRounds: this.config.maxRounds,
        status,
      },
      {
        sessionId,
      }
    );
    this.eventBus.emit(event);
  }

  /** Emits protocol.completed event. */
  private emitProtocolCompleted(result: AegeanResult, startTime: number): void {
    const sessionId = this.session?.getStatus()?.config.sessionId;
    const event = createEvent<ProtocolCompletedEvent>(
      'protocol.completed',
      {
        success: result.consensusReached,
        iterations: result.totalRounds,
        durationMs: Date.now() - startTime,
      },
      {
        ...(sessionId !== undefined && { sessionId }),
      }
    );
    this.eventBus.emit(event);
  }
}

/** Creates an Aegean protocol instance. */
export function createAegeanProtocol(options?: AegeanProtocolOptions): AegeanProtocol {
  return new AegeanProtocol(options);
}
