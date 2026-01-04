/**
 * nexus-agents/agents - Review Collaboration Protocol
 *
 * Protocol implementation for review collaboration pattern where
 * one expert produces work and another reviews it.
 */

import type { Result, TaskResult, ILogger, IAgent, Task } from '../../core/index.js';
import { ok, err, AgentError, createLogger } from '../../core/index.js';
import type { CollaborationConfig, CollaborationResult } from './collaboration-types.js';
import { CollaborationSession, createCollaborationSession } from './collaboration-session.js';
import { extractApproval, extractFeedback, createReviewTask } from './protocol-helpers.js';
import type { ICollaborationProtocol, ProtocolOptions } from './collaboration-protocol.js';

/**
 * Review collaboration protocol.
 */
export class ReviewProtocol implements ICollaborationProtocol {
  readonly pattern = 'review' as const;
  protected readonly logger: ILogger;
  protected session: CollaborationSession | null = null;
  protected cancelled = false;
  protected readonly options: ProtocolOptions;

  constructor(options: ProtocolOptions = {}) {
    this.options = options;
    this.logger = options.logger ?? createLogger({ component: 'ReviewProtocol' });
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
    const initResult = this.initReviewSession(config, agents);
    if (!initResult.ok) return err(initResult.error);

    const { session, producer, reviewer, producerId, reviewerId } = initResult.value;

    const productionResult = await this.executeProduction(
      session,
      producer,
      config.task,
      producerId
    );
    if (!productionResult.ok) return err(productionResult.error);

    const reviewResult = await this.executeReview(
      { session, reviewer, task: config.task, producerId, reviewerId },
      productionResult.value
    );
    if (!reviewResult.ok) return err(reviewResult.error);

    return session.finalize();
  }

  private initReviewSession(
    config: CollaborationConfig,
    agents: Map<string, IAgent>
  ): Result<
    {
      session: CollaborationSession;
      producer: IAgent;
      reviewer: IAgent;
      producerId: string;
      reviewerId: string;
    },
    AgentError
  > {
    const validation = this.validateAgents(config, agents);
    if (!validation.ok) return err(validation.error);

    if (config.experts.length < 2) {
      return err(new AgentError('Review protocol requires at least 2 experts'));
    }

    const producerId = config.experts[0];
    const reviewerId = config.experts[1];

    if (producerId === undefined || reviewerId === undefined) {
      return err(new AgentError('Invalid expert configuration'));
    }

    const producer = agents.get(producerId);
    const reviewer = agents.get(reviewerId);

    if (producer === undefined || reviewer === undefined) {
      return err(new AgentError('Required agents not found'));
    }

    this.cancelled = false;
    this.session = createCollaborationSession(this.options.sessionOptions);

    const startResult = this.session.start(config);
    if (!startResult.ok) return err(startResult.error);

    this.logger.info('Starting review protocol', {
      sessionId: config.sessionId,
      producerId,
      reviewerId,
    });

    return ok({ session: this.session, producer, reviewer, producerId, reviewerId });
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

  private async executeProduction(
    session: CollaborationSession,
    producer: IAgent,
    task: Task,
    producerId: string
  ): Promise<Result<TaskResult, AgentError>> {
    const productionResult = await this.executeAgentTask(producer, task);
    if (!productionResult.ok) {
      session.cancel(productionResult.error.message);
      return err(productionResult.error);
    }

    session.submitResult(producerId, productionResult.value);
    return ok(productionResult.value);
  }

  private async executeReview(
    ctx: ReviewContext,
    productionResult: TaskResult
  ): Promise<Result<TaskResult, AgentError>> {
    const { session, reviewer, task, producerId, reviewerId } = ctx;
    session.requestReview(producerId, reviewerId, productionResult.output);

    const reviewTask = createReviewTask(task, productionResult.output, producerId);

    const reviewResult = await this.executeAgentTask(reviewer, reviewTask);
    if (!reviewResult.ok) {
      session.cancel(reviewResult.error.message);
      return err(reviewResult.error);
    }

    session.submitResult(reviewerId, reviewResult.value);

    const reviewOutput = reviewResult.value.output;
    const approved = extractApproval(reviewOutput);
    const feedback = extractFeedback(reviewOutput);

    session.submitReview(reviewerId, producerId, approved, feedback);

    return ok(reviewResult.value);
  }
}

/**
 * Context for review execution.
 */
interface ReviewContext {
  session: CollaborationSession;
  reviewer: IAgent;
  task: Task;
  producerId: string;
  reviewerId: string;
}
