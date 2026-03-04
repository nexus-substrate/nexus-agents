/**
 * Self-Refine Protocol
 *
 * Implements iterative refinement with self-feedback from arXiv:2303.17651.
 * A single LLM acts as generator, feedback provider, and refiner in an
 * iterative loop without any training.
 *
 * @module agents/collaboration/self-refine-protocol
 * (Source: Issue #126, arXiv:2303.17651)
 */

import type { Result, TaskResult, ILogger, IAgent, Task } from '../../core/index.js';
import { ok, err, AgentError, createLogger, getTimeProvider } from '../../core/index.js';
import type { CollaborationConfig, CollaborationResult } from './collaboration-types.js';
import { createCollaborationSession, type CollaborationSession } from './collaboration-session.js';

/**
 * Configuration for self-refine protocol.
 */
export interface SelfRefineConfig {
  /** Maximum number of refinement iterations (default: 3) */
  readonly maxIterations?: number;
  /** Similarity threshold for convergence (0-1, default: 0.95) */
  readonly convergenceThreshold?: number;
  /** Custom feedback prompt template */
  readonly feedbackPromptTemplate?: string;
  /** Custom refinement prompt template */
  readonly refinementPromptTemplate?: string;
  /** Logger instance */
  readonly logger?: ILogger;
}

/**
 * Result from a single refinement iteration.
 */
export interface RefinementIteration {
  /** Iteration number (1-indexed) */
  readonly iteration: number;
  /** Output from this iteration */
  readonly output: string;
  /** Feedback generated for this output */
  readonly feedback: string;
  /** Similarity to previous iteration (0-1) */
  readonly similarityToPrevious: number;
  /** Time taken for this iteration in ms */
  readonly durationMs: number;
}

/**
 * Extended result with refinement history.
 */
export interface SelfRefineResult extends CollaborationResult {
  /** History of refinement iterations */
  readonly refinementHistory: readonly RefinementIteration[];
  /** Whether convergence was reached */
  readonly converged: boolean;
  /** Total iterations executed */
  readonly totalIterations: number;
}

/** Resolved config with all defaults applied. */
interface ResolvedConfig {
  readonly maxIterations: number;
  readonly convergenceThreshold: number;
  readonly feedbackPromptTemplate: string;
  readonly refinementPromptTemplate: string;
}

/** Execution context passed between methods. */
interface ExecutionContext {
  readonly expertId: string;
  readonly agent: IAgent;
  readonly task: Task;
  readonly sessionId: string;
  readonly startTime: number;
}

const DEFAULT_FEEDBACK_TEMPLATE = `Review the following output and provide specific, actionable feedback.
Focus on: accuracy, completeness, clarity, and correctness.

Output to review:
{{output}}

Provide feedback as: 1) What works well, 2) What needs improvement, 3) Suggestions.`;

const DEFAULT_REFINEMENT_TEMPLATE = `Improve the following output based on the feedback provided.

Original output:
{{output}}

Feedback:
{{feedback}}

Provide an improved version that addresses all the feedback points.`;

const logger = createLogger({ component: 'self-refine-protocol' });

/** Builds resolved config from optional config. */
function buildConfig(config?: SelfRefineConfig): ResolvedConfig {
  return {
    maxIterations: config?.maxIterations ?? 3,
    convergenceThreshold: config?.convergenceThreshold ?? 0.95,
    feedbackPromptTemplate: config?.feedbackPromptTemplate ?? DEFAULT_FEEDBACK_TEMPLATE,
    refinementPromptTemplate: config?.refinementPromptTemplate ?? DEFAULT_REFINEMENT_TEMPLATE,
  };
}

/**
 * Self-Refine collaboration protocol.
 *
 * Implements the iterative generate→feedback→refine loop from arXiv:2303.17651.
 */
export class SelfRefineProtocol {
  readonly pattern = 'self-refine' as const;
  private readonly config: ResolvedConfig;
  private readonly log: ILogger;
  private session: CollaborationSession | null = null;
  private cancelled = false;

  constructor(config?: SelfRefineConfig) {
    this.config = buildConfig(config);
    this.log = config?.logger ?? logger;
  }

  /** Execute the self-refine protocol. */
  async execute(
    config: CollaborationConfig,
    agents: Map<string, IAgent>
  ): Promise<Result<SelfRefineResult, AgentError>> {
    const setupResult = this.setupExecution(config, agents);
    if (!setupResult.ok) return err(setupResult.error);

    const ctx = setupResult.value;
    const initialResult = await this.generateInitial(ctx.agent, ctx.task);
    if (!initialResult.ok) {
      this.session?.cancel(initialResult.error.message);
      return err(initialResult.error);
    }

    const initialOutput =
      typeof initialResult.value.output === 'string'
        ? initialResult.value.output
        : JSON.stringify(initialResult.value.output ?? '');
    const loopResult = await this.runRefinementLoop(ctx, initialOutput);
    return this.finalizeExecution(ctx, loopResult);
  }

  /** Cancel the protocol. */
  cancel(reason: string): void {
    this.cancelled = true;
    this.session?.cancel(reason);
    this.log.info('Self-refine cancelled', { reason });
  }

  /** Setup and validate execution. */
  private setupExecution(
    config: CollaborationConfig,
    agents: Map<string, IAgent>
  ): Result<ExecutionContext, AgentError> {
    const expertId = config.experts[0];
    if (expertId === undefined) {
      return err(new AgentError('Self-refine requires at least one expert'));
    }

    const agent = agents.get(expertId);
    if (agent === undefined) {
      return err(new AgentError(`Agent not found: ${expertId}`));
    }

    this.cancelled = false;
    this.session = createCollaborationSession();
    const startResult = this.session.start(config);
    if (!startResult.ok) return err(startResult.error);

    this.log.info('Starting self-refine protocol', {
      sessionId: config.sessionId,
      expertId,
      maxIterations: this.config.maxIterations,
    });

    return ok({
      expertId,
      agent,
      task: config.task,
      sessionId: config.sessionId,
      startTime: getTimeProvider().now(),
    });
  }

  /** Run the iterative refinement loop. */
  private async runRefinementLoop(
    ctx: ExecutionContext,
    initialOutput: string
  ): Promise<{ history: RefinementIteration[]; finalOutput: string }> {
    const history: RefinementIteration[] = [];
    let currentOutput = initialOutput;
    let previousOutput = '';

    for (let i = 0; i < this.config.maxIterations; i++) {
      if (this.cancelled) {
        this.session?.cancel('Protocol cancelled');
        break;
      }

      const iterResult = await this.executeIteration(ctx, currentOutput, previousOutput, i);
      if (iterResult === null) break;

      history.push(iterResult.iteration);
      if (iterResult.converged) break;

      previousOutput = currentOutput;
      currentOutput = iterResult.refinedOutput;
    }

    return { history, finalOutput: currentOutput };
  }

  /** Execute a single refinement iteration. */
  private async executeIteration(
    ctx: ExecutionContext,
    currentOutput: string,
    previousOutput: string,
    index: number
  ): Promise<{ iteration: RefinementIteration; refinedOutput: string; converged: boolean } | null> {
    const iterationStart = getTimeProvider().now();

    const feedbackResult = await this.generateFeedback(ctx.agent, currentOutput, ctx.task);
    if (!feedbackResult.ok) {
      this.log.warn('Failed to generate feedback', { iteration: index + 1 });
      return null;
    }
    const feedback =
      typeof feedbackResult.value.output === 'string'
        ? feedbackResult.value.output
        : JSON.stringify(feedbackResult.value.output ?? '');

    const similarity = this.calculateSimilarity(currentOutput, previousOutput);
    const iteration: RefinementIteration = {
      iteration: index + 1,
      output: currentOutput,
      feedback,
      similarityToPrevious: similarity,
      durationMs: getTimeProvider().now() - iterationStart,
    };

    if (similarity >= this.config.convergenceThreshold && index > 0) {
      this.log.info('Convergence reached', { iteration: index + 1, similarity });
      return { iteration, refinedOutput: currentOutput, converged: true };
    }

    const refineResult = await this.refineOutput(ctx.agent, currentOutput, feedback, ctx.task);
    if (!refineResult.ok) {
      this.log.warn('Failed to refine output', { iteration: index + 1 });
      return null;
    }

    const refinedOutput =
      typeof refineResult.value.output === 'string'
        ? refineResult.value.output
        : JSON.stringify(refineResult.value.output ?? '');
    return { iteration, refinedOutput, converged: false };
  }

  /** Finalize execution and build result. */
  private finalizeExecution(
    ctx: ExecutionContext,
    loopResult: { history: RefinementIteration[]; finalOutput: string }
  ): Result<SelfRefineResult, AgentError> {
    const finalResult: TaskResult = {
      taskId: ctx.task.id,
      output: loopResult.finalOutput,
      metadata: {
        durationMs: getTimeProvider().now() - ctx.startTime,
        tokensUsed: 0,
        toolsUsed: [],
        model: 'self-refine',
      },
    };
    this.session?.submitResult(ctx.expertId, finalResult);

    const sessionResult = this.session?.finalize();
    if (sessionResult === undefined) {
      return err(new AgentError('Session finalization failed'));
    }
    if (!sessionResult.ok) {
      return err(sessionResult.error);
    }

    const lastIter = loopResult.history[loopResult.history.length - 1];
    const converged =
      lastIter !== undefined && lastIter.similarityToPrevious >= this.config.convergenceThreshold;

    return ok({
      ...sessionResult.value,
      refinementHistory: loopResult.history,
      converged,
      totalIterations: loopResult.history.length,
    });
  }

  /** Generate initial output for the task. */
  private async generateInitial(
    agent: IAgent,
    task: Task
  ): Promise<Result<TaskResult, AgentError>> {
    this.log.debug('Generating initial output');
    return agent.execute(task);
  }

  /** Generate feedback on the current output. */
  private async generateFeedback(
    agent: IAgent,
    output: string,
    originalTask: Task
  ): Promise<Result<TaskResult, AgentError>> {
    const feedbackPrompt = this.config.feedbackPromptTemplate.replace('{{output}}', output);
    const feedbackTask: Task = {
      id: `${originalTask.id}-feedback`,
      description: feedbackPrompt,
      context: { ...originalTask.context },
    };
    this.log.debug('Generating feedback');
    return agent.execute(feedbackTask);
  }

  /** Refine output based on feedback. */
  private async refineOutput(
    agent: IAgent,
    output: string,
    feedback: string,
    originalTask: Task
  ): Promise<Result<TaskResult, AgentError>> {
    const refinementPrompt = this.config.refinementPromptTemplate
      .replace('{{output}}', output)
      .replace('{{feedback}}', feedback);
    const refinementTask: Task = {
      id: `${originalTask.id}-refine`,
      description: refinementPrompt,
      context: { ...originalTask.context },
    };
    this.log.debug('Refining output');
    return agent.execute(refinementTask);
  }

  /** Calculate similarity between two outputs using Jaccard similarity. */
  private calculateSimilarity(output1: string, output2: string): number {
    if (output1 === output2) return 1.0;
    if (output1.length === 0 || output2.length === 0) return 0.0;

    const words1 = new Set(output1.toLowerCase().split(/\s+/));
    const words2 = new Set(output2.toLowerCase().split(/\s+/));
    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }
}

/** Creates a self-refine protocol. */
export function createSelfRefineProtocol(config?: SelfRefineConfig): SelfRefineProtocol {
  return new SelfRefineProtocol(config);
}
