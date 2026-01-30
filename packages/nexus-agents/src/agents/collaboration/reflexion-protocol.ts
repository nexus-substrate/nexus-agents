/**
 * nexus-agents/agents - Multi-Agent Reflexion Protocol
 *
 * Implementation of MAR (Multi-Agent Reflexion) from arxiv:2512.20845.
 * Uses persona-based critics and structured debate to improve outputs
 * through iterative refinement.
 */

import type { Result, TaskResult, ILogger, IAgent, Task } from '../../core/index.js';
import { ok, err, AgentError, createLogger } from '../../core/index.js';
import type {
  CollaborationConfig,
  CollaborationResult,
  ICollaborationProtocol,
  ProtocolOptions,
} from './collaboration-types.js';
import { CollaborationSession, createCollaborationSession } from './collaboration-session.js';
import type { IEventBus } from './event-bus-types.js';
import { getGlobalEventBus } from './event-bus.js';
import {
  emitReflexionStarted,
  emitReflexionIteration,
  emitReflexionCompleted,
  emitCritiqueStarted,
  emitCritiqueCompleted,
  emitSynthesis,
} from './reflexion-events.js';
import type {
  PersonaCritique,
  DebateResult,
  ReflexionRound,
  ReflexionConfig,
  ReflexionResult,
} from './reflexion-types.js';
import { calculateWeightedSeverity } from './reflexion-types.js';
import {
  generatePersonaCritique,
  runDebate,
  createReflexionRound,
  buildReflexionConfig,
  formatRefinementTask,
  createFinalResultPayload,
  SyntheticCritiqueError,
  type PartialReflexionConfig,
} from './reflexion-helpers.js';

/**
 * Options for the reflexion protocol.
 */
export interface ReflexionProtocolOptions extends ProtocolOptions {
  /** Reflexion-specific configuration */
  readonly reflexionConfig?: PartialReflexionConfig;
  /** Optional event bus for protocol lifecycle events. Uses global bus if not provided. */
  readonly eventBus?: IEventBus;
}

/**
 * Multi-Agent Reflexion protocol implementation.
 *
 * This protocol implements the MAR algorithm which uses multiple
 * persona-based critics to provide diverse feedback, avoiding the
 * "degeneration of thought" problem in single-agent self-reflection.
 */
export class ReflexionProtocol implements ICollaborationProtocol {
  readonly pattern = 'reflexion' as const;
  protected readonly logger: ILogger;
  protected readonly eventBus: IEventBus;
  protected session: CollaborationSession | null = null;
  protected cancelled = false;
  protected readonly options: ReflexionProtocolOptions;
  protected readonly config: ReflexionConfig;

  constructor(options: ReflexionProtocolOptions = {}) {
    this.options = options;
    this.logger = options.logger ?? createLogger({ component: 'ReflexionProtocol' });
    this.eventBus = options.eventBus ?? getGlobalEventBus();
    this.config = buildReflexionConfig(options.reflexionConfig);
  }

  cancel(reason: string): void {
    this.cancelled = true;
    this.session?.cancel(reason);
    this.logger.info('Reflexion protocol cancelled', { reason });
  }

  async execute(
    config: CollaborationConfig,
    agents: Map<string, IAgent>
  ): Promise<Result<CollaborationResult, AgentError>> {
    const startTime = Date.now();
    this.cancelled = false;
    this.session = createCollaborationSession(this.options.sessionOptions);

    const startResult = this.session.start(config);
    if (!startResult.ok) return err(startResult.error);

    const producerResult = this.getProducerAgent(config, agents);
    if (!producerResult.ok) return err(producerResult.error);

    const { producerId, producer } = producerResult.value;
    this.logProtocolStart(config.sessionId, producerId);

    return this.runProtocol(producer, producerId, config.task, startTime);
  }

  /** Gets and validates the producer agent. */
  private getProducerAgent(
    config: CollaborationConfig,
    agents: Map<string, IAgent>
  ): Result<{ producerId: string; producer: IAgent }, AgentError> {
    const producerId = config.experts[0];
    if (producerId === undefined) {
      return err(new AgentError('Reflexion requires at least one producer expert'));
    }

    const producer = agents.get(producerId);
    if (producer === undefined) {
      return err(new AgentError(`Producer agent not found: ${producerId}`));
    }

    return ok({ producerId, producer });
  }

  /** Logs protocol start and emits started event. */
  private logProtocolStart(sessionId: string, producerId: string): void {
    this.logger.info('Starting reflexion protocol', {
      sessionId,
      producerId,
      personas: this.config.personas.map((p) => p.role),
      maxIterations: this.config.maxIterations,
    });
    emitReflexionStarted(this.eventBus, {
      sessionId,
      personaCount: this.config.personas.length,
      reflexionConfig: this.config,
    });
  }

  /** Runs the full protocol workflow. */
  private async runProtocol(
    producer: IAgent,
    producerId: string,
    task: Task,
    startTime: number
  ): Promise<Result<CollaborationResult, AgentError>> {
    if (this.session === null) {
      return err(new AgentError('No active session'));
    }

    const initialResult = await this.executeProduction(producer, task);
    if (!initialResult.ok) {
      this.session.cancel(initialResult.error.message);
      return err(initialResult.error);
    }

    const sessionId = this.session.getStatus()?.config.sessionId;
    const reflexionResult = await this.runReflexionLoop(
      producer,
      task,
      initialResult.value.output,
      sessionId
    );
    if (!reflexionResult.ok) {
      this.session.cancel(reflexionResult.error.message);
      return err(reflexionResult.error);
    }

    emitReflexionCompleted(this.eventBus, {
      result: reflexionResult.value,
      startTime,
      ...(sessionId !== undefined && { sessionId }),
    });

    this.submitFinalResult(producerId, task.id, reflexionResult.value, startTime);
    return this.session.finalize();
  }

  /** Submits the final result to the session. */
  private submitFinalResult(
    producerId: string,
    taskId: string,
    result: ReflexionResult,
    startTime: number
  ): void {
    if (this.session === null) return;
    const totalDurationMs = Date.now() - startTime;
    this.session.submitResult(
      producerId,
      createFinalResultPayload(taskId, result, totalDurationMs)
    );
  }

  /** Executes the initial production task. */
  private async executeProduction(
    producer: IAgent,
    task: Task
  ): Promise<Result<TaskResult, AgentError>> {
    if (this.cancelled) {
      return err(new AgentError('Reflexion cancelled'));
    }
    this.logger.debug('Executing initial production', { taskId: task.id });
    return producer.execute(task);
  }

  /** Runs the main reflexion loop with persona-based critics. */
  private async runReflexionLoop(
    producer: IAgent,
    originalTask: Task,
    initialOutput: unknown,
    sessionId: string | undefined
  ): Promise<Result<ReflexionResult, AgentError>> {
    const startTime = Date.now();
    const rounds: ReflexionRound[] = [];
    let currentOutput = initialOutput;
    let converged = false;
    let terminationReason: ReflexionResult['terminationReason'] = 'max_iterations';

    for (let iteration = 0; iteration < this.config.maxIterations; iteration++) {
      if (this.cancelled) {
        terminationReason = 'error';
        break;
      }

      const roundResult = await this.executeReflexionRound(
        producer,
        originalTask,
        currentOutput,
        iteration,
        sessionId
      );
      if (!roundResult.ok) return err(roundResult.error);

      const { round, isConverged, output } = roundResult.value;
      rounds.push(round);

      if (isConverged) {
        converged = true;
        terminationReason = 'converged';
        this.emitIteration(iteration, 'converged', sessionId);
        break;
      }

      this.emitIteration(iteration, 'in_progress', sessionId);
      currentOutput = output;
    }

    if (terminationReason === 'max_iterations') {
      this.emitIteration(rounds.length - 1, 'max_reached', sessionId);
    }

    return ok({
      rounds,
      finalOutput: currentOutput,
      totalIterations: rounds.length,
      converged,
      terminationReason,
      totalDurationMs: Date.now() - startTime,
    });
  }

  /** Emits an iteration event with given status. */
  private emitIteration(
    round: number,
    status: 'converged' | 'max_reached' | 'in_progress',
    sessionId: string | undefined
  ): void {
    if (sessionId !== undefined) {
      emitReflexionIteration(this.eventBus, {
        round,
        maxRounds: this.config.maxIterations,
        status,
        sessionId,
      });
    }
  }

  /** Emits synthesis event if session exists. */
  private emitSynthesisEvent(
    iteration: number,
    debate: DebateResult,
    sessionId: string | undefined
  ): void {
    if (sessionId !== undefined) {
      emitSynthesis(this.eventBus, {
        iteration,
        consensusSeverity: debate.consensusSeverity,
        actionItemCount: debate.actionItems.length,
        sessionId,
      });
    }
  }

  /** Executes a single reflexion round. */
  private async executeReflexionRound(
    producer: IAgent,
    originalTask: Task,
    currentOutput: unknown,
    iteration: number,
    sessionId: string | undefined
  ): Promise<Result<{ round: ReflexionRound; isConverged: boolean; output: unknown }, AgentError>> {
    const roundStart = Date.now();
    this.logger.debug('Starting reflexion iteration', { iteration });

    const critiques = this.collectCritiques(currentOutput, originalTask, iteration, sessionId);
    const debate = runDebate(critiques);
    const weightedSeverity = calculateWeightedSeverity(critiques, this.config.personas);
    this.emitSynthesisEvent(iteration, debate, sessionId);

    if (weightedSeverity < this.config.severityThreshold) {
      this.logger.info('Reflexion converged', {
        iteration,
        threshold: this.config.severityThreshold,
      });
      const round = createReflexionRound(
        iteration,
        { original: currentOutput, improved: currentOutput },
        critiques,
        debate,
        roundStart
      );
      return ok({ round, isConverged: true, output: currentOutput });
    }

    const improvedResult = await this.generateImprovedOutput(
      producer,
      originalTask,
      currentOutput,
      debate
    );
    if (!improvedResult.ok) return err(improvedResult.error);

    this.logger.debug('Completed reflexion iteration', {
      iteration,
      weightedSeverity,
      actionItems: debate.actionItems.length,
    });
    const round = createReflexionRound(
      iteration,
      { original: currentOutput, improved: improvedResult.value.output },
      critiques,
      debate,
      roundStart
    );
    return ok({ round, isConverged: false, output: improvedResult.value.output });
  }

  /** Collects critiques from all persona-based critics. */
  private collectCritiques(
    output: unknown,
    task: Task,
    iteration: number,
    sessionId: string | undefined
  ): readonly PersonaCritique[] {
    // (Issue #509) Fail-safe: check if synthetic critiques are allowed
    // Currently, generatePersonaCritique always uses heuristics instead of real LLM analysis.
    // This may lead to poor quality feedback. Require explicit opt-in for synthetic critiques.
    if (!this.config.allowSyntheticCritiques) {
      this.logger.error(
        'Synthetic critiques not allowed. Set allowSyntheticCritiques: true to use heuristic critiques.'
      );
      throw new SyntheticCritiqueError(
        'No real critique generator available. ' +
          'Current implementation uses heuristic-based synthetic critiques'
      );
    }

    // Log warning when using synthetic critiques
    if (iteration === 0) {
      this.logger.warn(
        'Using synthetic critiques - results are heuristic-based and may produce unreliable feedback'
      );
    }

    return this.config.personas.map((persona) => {
      // Emit critique started event (Issue #216)
      if (sessionId !== undefined) {
        emitCritiqueStarted(this.eventBus, {
          iteration,
          personaId: persona.id,
          personaRole: persona.role,
          sessionId,
        });
      }

      const critique = generatePersonaCritique(persona, output, task);

      // Emit critique completed event (Issue #216)
      if (sessionId !== undefined) {
        emitCritiqueCompleted(this.eventBus, {
          iteration,
          personaId: persona.id,
          severity: critique.severity,
          issueCount: critique.issues.length,
          sessionId,
        });
      }

      return critique;
    });
  }

  /** Generates improved output based on debate feedback. */
  private async generateImprovedOutput(
    producer: IAgent,
    originalTask: Task,
    currentOutput: unknown,
    debate: DebateResult
  ): Promise<Result<TaskResult, AgentError>> {
    if (this.cancelled) {
      return err(new AgentError('Reflexion cancelled'));
    }
    return producer.execute(formatRefinementTask(originalTask, currentOutput, debate));
  }
}

/**
 * Creates a reflexion protocol with the specified options.
 */
export function createReflexionProtocol(options?: ReflexionProtocolOptions): ReflexionProtocol {
  return new ReflexionProtocol(options);
}
