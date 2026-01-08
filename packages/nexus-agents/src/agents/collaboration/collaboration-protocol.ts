/**
 * nexus-agents/agents - Collaboration Protocols
 *
 * Protocol implementations for different collaboration patterns:
 * - Sequential: Experts work in order, passing results forward
 * - Parallel: Experts work simultaneously
 * - Review: One expert reviews another's work
 * - Consensus: Voting-based decision making
 */

import type { Result, TaskResult, ILogger, IAgent, Task } from '../../core/index.js';
import { ok, err, AgentError, createLogger } from '../../core/index.js';
import type { CollaborationConfig, CollaborationResult } from './collaboration-types.js';
import {
  CollaborationSession,
  createCollaborationSession,
  type CollaborationSessionOptions,
} from './collaboration-session.js';
import { sleep } from './protocol-helpers.js';

// Import and re-export protocol implementations from their dedicated modules
import { ReviewProtocol } from './review-protocol.js';
import { ConsensusProtocol } from './consensus-protocol.js';
import { ReflexionProtocol } from './reflexion-protocol.js';
import { AegeanProtocol } from './aegean-protocol.js';
import { SelfRefineProtocol } from './self-refine-protocol.js';
export { ReviewProtocol, ConsensusProtocol, ReflexionProtocol, AegeanProtocol, SelfRefineProtocol };

/**
 * Base interface for collaboration protocols.
 */
export interface ICollaborationProtocol {
  readonly pattern: CollaborationConfig['pattern'];
  execute(
    config: CollaborationConfig,
    agents: Map<string, IAgent>
  ): Promise<Result<CollaborationResult, AgentError>>;
  cancel(reason: string): void;
}

/**
 * Options for protocol execution.
 */
export interface ProtocolOptions {
  logger?: ILogger;
  sessionOptions?: CollaborationSessionOptions;
  sequentialDelay?: number;
  continueOnFailure?: boolean;
}

/**
 * Abstract base class for collaboration protocols.
 */
abstract class BaseProtocol implements ICollaborationProtocol {
  abstract readonly pattern: CollaborationConfig['pattern'];
  protected readonly logger: ILogger;
  protected session: CollaborationSession | null = null;
  protected cancelled = false;

  constructor(protected readonly options: ProtocolOptions = {}) {
    this.logger = options.logger ?? createLogger({ component: 'CollaborationProtocol' });
  }

  abstract execute(
    config: CollaborationConfig,
    agents: Map<string, IAgent>
  ): Promise<Result<CollaborationResult, AgentError>>;

  cancel(reason: string): void {
    this.cancelled = true;
    this.session?.cancel(reason);
    this.logger.info('Protocol cancelled', { reason });
  }

  protected createSession(): CollaborationSession {
    this.session = createCollaborationSession(this.options.sessionOptions);
    return this.session;
  }

  protected async executeAgentTask(
    agent: IAgent,
    task: Task,
    previousResults?: TaskResult[]
  ): Promise<Result<TaskResult, AgentError>> {
    if (this.cancelled) {
      return err(new AgentError('Protocol cancelled'));
    }

    const enrichedTask: Task = {
      ...task,
      context: {
        ...task.context,
        metadata: {
          ...task.context.metadata,
          previousResults: previousResults?.map((r) => ({ taskId: r.taskId, output: r.output })),
        },
      },
    };

    return agent.execute(enrichedTask);
  }

  protected validateAgents(
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
}

/**
 * Sequential collaboration protocol.
 */
export class SequentialProtocol extends BaseProtocol {
  readonly pattern = 'sequential' as const;

  async execute(
    config: CollaborationConfig,
    agents: Map<string, IAgent>
  ): Promise<Result<CollaborationResult, AgentError>> {
    const initResult = this.initSession(config, agents);
    if (!initResult.ok) return err(initResult.error);

    const session = initResult.value;

    this.logger.info('Starting sequential protocol', {
      sessionId: config.sessionId,
      expertCount: config.experts.length,
    });

    const previousResults: TaskResult[] = [];
    const delay = this.options.sequentialDelay ?? 0;

    for (const [i, expertId] of config.experts.entries()) {
      if (this.checkCancelled(session)) break;

      const agent = agents.get(expertId);
      if (agent === undefined) continue;

      this.logger.debug('Executing sequential step', {
        step: i + 1,
        expertId,
        previousResultCount: previousResults.length,
      });

      const stepResult = await this.executeSequentialStep(
        session,
        agent,
        config.task,
        expertId,
        previousResults
      );
      if (!stepResult.ok) return err(stepResult.error);

      if (stepResult.value !== undefined) {
        previousResults.push(stepResult.value);
      }

      if (delay > 0 && i < config.experts.length - 1) {
        await sleep(delay);
      }
    }

    return session.finalize();
  }

  private initSession(
    config: CollaborationConfig,
    agents: Map<string, IAgent>
  ): Result<CollaborationSession, AgentError> {
    const validation = this.validateAgents(config, agents);
    if (!validation.ok) return err(validation.error);

    this.cancelled = false;
    const session = this.createSession();

    const startResult = session.start(config);
    if (!startResult.ok) return err(startResult.error);

    return ok(session);
  }

  private checkCancelled(session: CollaborationSession): boolean {
    if (this.cancelled) {
      session.cancel('Protocol cancelled');
      return true;
    }
    return false;
  }

  private async executeSequentialStep(
    session: CollaborationSession,
    agent: IAgent,
    task: Task,
    expertId: string,
    previousResults: TaskResult[]
  ): Promise<Result<TaskResult | undefined, AgentError>> {
    const result = await this.executeAgentTask(agent, task, previousResults);

    if (!result.ok) {
      if (this.options.continueOnFailure === true) {
        this.logger.warn('Expert failed, continuing', { expertId, error: result.error.message });
        session.markExpertFailed(expertId, result.error.message);
        return ok(undefined);
      }
      session.cancel(result.error.message);
      return err(result.error);
    }

    session.submitResult(expertId, result.value);
    return ok(result.value);
  }
}

/**
 * Parallel collaboration protocol.
 */
export class ParallelProtocol extends BaseProtocol {
  readonly pattern = 'parallel' as const;

  async execute(
    config: CollaborationConfig,
    agents: Map<string, IAgent>
  ): Promise<Result<CollaborationResult, AgentError>> {
    const validation = this.validateAgents(config, agents);
    if (!validation.ok) {
      return err(validation.error);
    }

    this.cancelled = false;
    const session = this.createSession();

    const startResult = session.start(config);
    if (!startResult.ok) {
      return err(startResult.error);
    }

    this.logger.info('Starting parallel protocol', {
      sessionId: config.sessionId,
      expertCount: config.experts.length,
    });

    const promises = config.experts.map(async (expertId) => {
      const agent = agents.get(expertId);
      if (agent === undefined) {
        return { expertId, result: err(new AgentError(`Agent not found: ${expertId}`)) };
      }
      const result = await this.executeAgentTask(agent, config.task);
      return { expertId, result };
    });

    const results = await Promise.all(promises);

    for (const { expertId, result } of results) {
      if (result.ok) {
        session.submitResult(expertId, result.value);
      } else {
        this.logger.warn('Expert failed in parallel execution', {
          expertId,
          error: result.error.message,
        });
        session.markExpertFailed(expertId, result.error.message);
      }
    }

    return session.finalize();
  }
}

/**
 * Factory for creating collaboration protocols.
 */
export class ProtocolFactory {
  private readonly options: ProtocolOptions;

  constructor(options: ProtocolOptions = {}) {
    this.options = options;
  }

  create(pattern: CollaborationConfig['pattern']): ICollaborationProtocol {
    switch (pattern) {
      case 'sequential':
        return new SequentialProtocol(this.options);
      case 'parallel':
        return new ParallelProtocol(this.options);
      case 'review':
        return new ReviewProtocol(this.options);
      case 'consensus':
        return new ConsensusProtocol(this.options);
      case 'reflexion':
        return new ReflexionProtocol(this.options);
      case 'aegean':
        return new AegeanProtocol(this.options);
      case 'self-refine':
        return new SelfRefineProtocol(this.options) as unknown as ICollaborationProtocol;
      case 'self-debug':
        // Self-debug is a code repair protocol, not a multi-agent collaboration.
        // Use createSelfDebugProtocol() from self-debug-protocol.ts instead.
        throw new AgentError(
          'self-debug is not a multi-agent protocol. Use createSelfDebugProtocol() directly.'
        );
      default: {
        const unknownPattern: never = pattern;
        throw new AgentError(`Unknown protocol pattern: ${unknownPattern as string}`);
      }
    }
  }

  async execute(
    config: CollaborationConfig,
    agents: Map<string, IAgent>
  ): Promise<Result<CollaborationResult, AgentError>> {
    const protocol = this.create(config.pattern);
    return protocol.execute(config, agents);
  }
}

/**
 * Creates a protocol factory.
 */
export function createProtocolFactory(options?: ProtocolOptions): ProtocolFactory {
  return new ProtocolFactory(options);
}
