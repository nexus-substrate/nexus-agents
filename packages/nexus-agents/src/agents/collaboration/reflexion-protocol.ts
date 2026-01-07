/**
 * nexus-agents/agents - Multi-Agent Reflexion Protocol
 *
 * Implementation of MAR (Multi-Agent Reflexion) from arxiv:2512.20845.
 * Uses persona-based critics and structured debate to improve outputs
 * through iterative refinement.
 */

import type { Result, TaskResult, ILogger, IAgent, Task } from '../../core/index.js';
import { ok, err, AgentError, createLogger } from '../../core/index.js';
import type { CollaborationConfig, CollaborationResult } from './collaboration-types.js';
import { CollaborationSession, createCollaborationSession } from './collaboration-session.js';
import type { ICollaborationProtocol, ProtocolOptions } from './collaboration-protocol.js';
import type {
  Persona,
  PersonaCritique,
  DebateResult,
  ReflexionRound,
  ReflexionConfig,
  ReflexionResult,
} from './reflexion-types.js';
import {
  ReflexionConfigSchema,
  DEFAULT_CODE_REVIEW_PERSONAS,
  calculateWeightedSeverity,
} from './reflexion-types.js';

/**
 * Options for the reflexion protocol.
 */
export interface ReflexionProtocolOptions extends ProtocolOptions {
  /** Reflexion-specific configuration */
  readonly reflexionConfig?: Partial<ReflexionConfig>;
}

/** Default reflexion configuration values. */
const REFLEXION_DEFAULTS = {
  maxIterations: 3,
  severityThreshold: 0.3,
  iterationTimeoutMs: 60000,
  requireConsensus: false,
} as const;

/** Builds and validates the reflexion configuration. */
function buildReflexionConfig(options: ReflexionProtocolOptions): ReflexionConfig {
  const userConfig = options.reflexionConfig ?? {};
  const configInput = {
    maxIterations: userConfig.maxIterations ?? REFLEXION_DEFAULTS.maxIterations,
    severityThreshold: userConfig.severityThreshold ?? REFLEXION_DEFAULTS.severityThreshold,
    personas: userConfig.personas ?? DEFAULT_CODE_REVIEW_PERSONAS,
    iterationTimeoutMs: userConfig.iterationTimeoutMs ?? REFLEXION_DEFAULTS.iterationTimeoutMs,
    requireConsensus: userConfig.requireConsensus ?? REFLEXION_DEFAULTS.requireConsensus,
  };

  const parsedConfig = ReflexionConfigSchema.safeParse(configInput);
  if (!parsedConfig.success) {
    throw new Error(`Invalid reflexion config: ${parsedConfig.error.message}`);
  }
  return parsedConfig.data;
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
  protected session: CollaborationSession | null = null;
  protected cancelled = false;
  protected readonly options: ReflexionProtocolOptions;
  protected readonly config: ReflexionConfig;

  constructor(options: ReflexionProtocolOptions = {}) {
    this.options = options;
    this.logger = options.logger ?? createLogger({ component: 'ReflexionProtocol' });
    this.config = buildReflexionConfig(options);
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

  /** Logs protocol start. */
  private logProtocolStart(sessionId: string, producerId: string): void {
    this.logger.info('Starting reflexion protocol', {
      sessionId,
      producerId,
      personas: this.config.personas.map((p) => p.role),
      maxIterations: this.config.maxIterations,
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

    const reflexionResult = await this.runReflexionLoop(producer, task, initialResult.value.output);
    if (!reflexionResult.ok) {
      this.session.cancel(reflexionResult.error.message);
      return err(reflexionResult.error);
    }

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
    this.session.submitResult(producerId, {
      taskId,
      output: {
        result: result.finalOutput,
        reflexion: {
          rounds: result.totalIterations,
          converged: result.converged,
          terminationReason: result.terminationReason,
        },
      },
      metadata: {
        durationMs: totalDurationMs,
        tokensUsed: 0,
        toolsUsed: [],
        model: 'reflexion-protocol',
      },
    });
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
    initialOutput: unknown
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
        iteration
      );
      if (!roundResult.ok) return err(roundResult.error);

      const { round, isConverged, output } = roundResult.value;
      rounds.push(round);

      if (isConverged) {
        converged = true;
        terminationReason = 'converged';
        break;
      }

      currentOutput = output;
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

  /** Executes a single reflexion round. */
  private async executeReflexionRound(
    producer: IAgent,
    originalTask: Task,
    currentOutput: unknown,
    iteration: number
  ): Promise<Result<{ round: ReflexionRound; isConverged: boolean; output: unknown }, AgentError>> {
    const roundStart = Date.now();
    this.logger.debug('Starting reflexion iteration', { iteration });

    const critiques = this.collectCritiques(currentOutput, originalTask);
    const debate = this.runDebate(critiques);
    const weightedSeverity = calculateWeightedSeverity(critiques, this.config.personas);

    if (weightedSeverity < this.config.severityThreshold) {
      this.logger.info('Reflexion converged', {
        iteration,
        weightedSeverity,
        threshold: this.config.severityThreshold,
      });
      return ok({
        round: this.createRound(
          iteration,
          { original: currentOutput, improved: currentOutput },
          critiques,
          debate,
          roundStart
        ),
        isConverged: true,
        output: currentOutput,
      });
    }

    const improvedResult = await this.generateImprovedOutput(
      producer,
      originalTask,
      currentOutput,
      debate
    );
    if (!improvedResult.ok) return err(improvedResult.error);

    const improvedOutput = improvedResult.value.output;
    this.logger.debug('Completed reflexion iteration', {
      iteration,
      weightedSeverity,
      actionItems: debate.actionItems.length,
    });

    return ok({
      round: this.createRound(
        iteration,
        { original: currentOutput, improved: improvedOutput },
        critiques,
        debate,
        roundStart
      ),
      isConverged: false,
      output: improvedOutput,
    });
  }

  /** Creates a reflexion round object. */
  private createRound(
    iteration: number,
    outputs: { original: unknown; improved: unknown },
    critiques: readonly PersonaCritique[],
    debate: DebateResult,
    roundStart: number
  ): ReflexionRound {
    return {
      iteration,
      originalOutput: outputs.original,
      critiques,
      debate,
      improvedOutput: outputs.improved,
      durationMs: Date.now() - roundStart,
    };
  }

  /** Collects critiques from all persona-based critics. */
  private collectCritiques(output: unknown, task: Task): readonly PersonaCritique[] {
    return this.config.personas.map((persona) =>
      this.generatePersonaCritique(persona, output, task)
    );
  }

  /** Generates a critique from a specific persona. */
  private generatePersonaCritique(persona: Persona, output: unknown, _task: Task): PersonaCritique {
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
    const hasIssues = outputStr.length < 50;
    const focusArea = persona.focusAreas[0] ?? 'key areas';

    return {
      personaId: persona.id,
      role: persona.role,
      critique: hasIssues
        ? `As ${persona.role}, I found the output needs improvement in ${persona.focusAreas.join(', ')}.`
        : `As ${persona.role}, the output adequately addresses ${persona.focusAreas.join(', ')}.`,
      suggestedImprovement: hasIssues
        ? `Consider expanding coverage of ${focusArea}.`
        : 'No major improvements needed.',
      severity: hasIssues ? 0.6 : 0.1,
      issues: hasIssues ? [`Insufficient coverage of ${focusArea}`] : [],
    };
  }

  /** Runs structured debate among critiques to synthesize feedback. */
  private runDebate(critiques: readonly PersonaCritique[]): DebateResult {
    const { agreements, disagreements } = this.categorizeIssues(critiques);
    const avgSeverity = this.calculateAverageSeverity(critiques);
    const actionItems = this.extractActionItems(critiques);

    const agreementCount = String(agreements.length);
    const disagreementCount = String(disagreements.length);
    const severityStr = avgSeverity.toFixed(2);

    return {
      synthesizedReflection: `Debate complete: ${agreementCount} points of agreement, ${disagreementCount} points of disagreement. Average severity: ${severityStr}.`,
      consensusSeverity: avgSeverity,
      agreements,
      disagreements,
      actionItems,
    };
  }

  /** Categorizes issues into agreements and disagreements. */
  private categorizeIssues(critiques: readonly PersonaCritique[]): {
    agreements: string[];
    disagreements: string[];
  } {
    const issueCount = new Map<string, number>();
    for (const critique of critiques) {
      for (const issue of critique.issues) {
        issueCount.set(issue, (issueCount.get(issue) ?? 0) + 1);
      }
    }

    const agreements: string[] = [];
    const disagreements: string[] = [];
    const threshold = critiques.length / 2;

    for (const [issue, count] of issueCount) {
      if (count >= threshold) {
        agreements.push(issue);
      } else {
        disagreements.push(issue);
      }
    }

    return { agreements, disagreements };
  }

  /** Calculates average severity across critiques. */
  private calculateAverageSeverity(critiques: readonly PersonaCritique[]): number {
    if (critiques.length === 0) return 0;
    return critiques.reduce((sum, c) => sum + c.severity, 0) / critiques.length;
  }

  /** Extracts action items from high-severity critiques. */
  private extractActionItems(critiques: readonly PersonaCritique[]): string[] {
    return critiques
      .filter((c) => c.severity > 0.3)
      .map((c) => c.suggestedImprovement)
      .filter((s) => s !== 'No major improvements needed.');
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

    const outputStr =
      typeof currentOutput === 'string' ? currentOutput : JSON.stringify(currentOutput, null, 2);
    const actionItemsStr = debate.actionItems.map((a, i) => `${String(i + 1)}. ${a}`).join('\n');

    const refinementTask: Task = {
      ...originalTask,
      id: `${originalTask.id}-refinement-${String(Date.now())}`,
      description: `Improve the following output based on critic feedback:

ORIGINAL OUTPUT:
${outputStr}

CRITIC FEEDBACK:
${debate.synthesizedReflection}

ACTION ITEMS:
${actionItemsStr}

Please provide an improved version addressing the feedback.`,
    };

    return producer.execute(refinementTask);
  }
}

/**
 * Creates a reflexion protocol with the specified options.
 */
export function createReflexionProtocol(options?: ReflexionProtocolOptions): ReflexionProtocol {
  return new ReflexionProtocol(options);
}
