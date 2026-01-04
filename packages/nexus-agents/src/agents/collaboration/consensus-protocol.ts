/**
 * @nexus-agents/agents - Consensus Collaboration Protocol
 *
 * Protocol implementation for consensus-based collaboration pattern where
 * multiple experts vote on decisions.
 */

import type { Result, TaskResult, ILogger, IAgent, Task } from '../../core/index.js';
import { ok, err, AgentError, createLogger } from '../../core/index.js';
import type { CollaborationConfig, CollaborationResult } from './collaboration-types.js';
import { CollaborationSession, createCollaborationSession } from './collaboration-session.js';
import { extractVote, createVotingTask } from './protocol-helpers.js';
import type { ICollaborationProtocol, ProtocolOptions } from './collaboration-protocol.js';

/**
 * Consensus collaboration protocol.
 */
export class ConsensusProtocol implements ICollaborationProtocol {
  readonly pattern = 'consensus' as const;
  protected readonly logger: ILogger;
  protected session: CollaborationSession | null = null;
  protected cancelled = false;
  protected readonly options: ProtocolOptions;

  constructor(options: ProtocolOptions = {}) {
    this.options = options;
    this.logger = options.logger ?? createLogger({ component: 'ConsensusProtocol' });
  }

  cancel(reason: string): void {
    this.cancelled = true;
    this.session?.cancel(reason);
    this.logger.info('Protocol cancelled', { reason });
  }

  async execute(
    config: CollaborationConfig,
    agents: Map<string, IAgent>
  ): Promise<Result<CollaborationResult, AgentError>> {
    const validation = this.validateAgents(config, agents);
    if (!validation.ok) {
      return err(validation.error);
    }

    if (config.experts.length < 3) {
      return err(new AgentError('Consensus protocol requires at least 3 experts'));
    }

    this.cancelled = false;
    this.session = createCollaborationSession(this.options.sessionOptions);

    const startResult = this.session.start(config);
    if (!startResult.ok) {
      return err(startResult.error);
    }

    this.logger.info('Starting consensus protocol', {
      sessionId: config.sessionId,
      expertCount: config.experts.length,
      requireUnanimous: config.requireUnanimous,
    });

    const votingTask = createVotingTask(config.task);

    const promises = config.experts.map(async (expertId) => {
      const agent = agents.get(expertId);
      if (agent === undefined) {
        return { expertId, result: err(new AgentError(`Agent not found: ${expertId}`)) };
      }
      const result = await this.executeAgentTask(agent, votingTask);
      return { expertId, result };
    });

    const results = await Promise.all(promises);

    for (const { expertId, result } of results) {
      if (result.ok) {
        this.session.submitResult(expertId, result.value);
        const vote = extractVote(result.value.output);
        this.session.vote(expertId, vote.decision, vote.reasoning);
      } else {
        this.logger.warn('Expert failed in consensus voting', {
          expertId,
          error: result.error.message,
        });
        this.session.markExpertFailed(expertId, result.error.message);
      }
    }

    return this.session.finalize();
  }

  private validateAgents(
    config: CollaborationConfig,
    agents: Map<string, IAgent>
  ): Result<void, AgentError> {
    for (const expertId of config.experts) {
      if (!agents.has(expertId)) {
        return err(
          new AgentError(`Agent not found: ${expertId}`, {
            context: { expertId, availableAgents: Array.from(agents.keys()) },
          })
        );
      }
    }
    return ok(undefined);
  }

  private async executeAgentTask(
    agent: IAgent,
    task: Task
  ): Promise<Result<TaskResult, AgentError>> {
    if (this.cancelled) {
      return err(new AgentError('Protocol cancelled'));
    }
    return agent.execute(task);
  }
}
