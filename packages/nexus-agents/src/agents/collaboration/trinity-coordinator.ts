/**
 * TRINITY Coordinator
 *
 * Implements the TRINITY Thinker/Worker/Verifier pattern from arXiv:2512.04695.
 * Coordinates three specialized roles for high-quality task execution.
 *
 * Flow: Think → Work → Verify → (iterate if failed) → Complete
 *
 * @module agents/collaboration/trinity-coordinator
 * (Source: Issue #141, arXiv:2512.04695)
 */

import type { Result, ILogger, IAgent, Task } from '../../core/index.js';
import { ok, err, AgentError, createLogger } from '../../core/index.js';
import type {
  TrinityConfig,
  TrinityResult,
  TrinityRole,
  TrinityPhaseResult,
  ThinkerOutput,
  WorkerOutput,
  VerifierOutput,
} from './trinity-types.js';
import { DEFAULT_TRINITY_CONFIG } from './trinity-types.js';
import {
  buildRoleTask,
  parseThinkerOutput,
  parseWorkerOutput,
  parseVerifierOutput,
  createDefaultWorkerOutput,
  createDefaultVerifierOutput,
} from './trinity-helpers.js';

// =============================================================================
// Types
// =============================================================================

/** Options for executing TRINITY coordination. */
export interface TrinityExecuteOptions {
  readonly task: Task;
  readonly agent: IAgent;
}

/** Internal context during coordination. */
interface CoordinationContext {
  readonly task: Task;
  readonly agent: IAgent;
  readonly startTime: number;
  readonly history: TrinityPhaseResult[];
}

/** Resolved configuration with defaults applied. */
interface ResolvedConfig {
  readonly maxIterations: number;
  readonly timeoutMs: number;
  readonly includeHistory: boolean;
}

/** Options for building final result. */
interface ResultBuildOpts {
  readonly ctx: CoordinationContext;
  readonly thinker: ThinkerOutput;
  readonly worker: WorkerOutput | undefined;
  readonly verifier: VerifierOutput | undefined;
  readonly stopReason: TrinityResult['stopReason'];
  readonly iterations: number;
}

const logger = createLogger({ component: 'trinity-coordinator' });

/** Merge config with defaults. */
function resolveConfig(config: TrinityConfig | undefined): ResolvedConfig {
  const d = DEFAULT_TRINITY_CONFIG;
  return {
    maxIterations: config?.maxIterations ?? d.maxIterations,
    timeoutMs: config?.timeoutMs ?? d.timeoutMs,
    includeHistory: config?.includeHistory ?? d.includeHistory,
  };
}

// =============================================================================
// TrinityCoordinator Class
// =============================================================================

/**
 * Coordinates Thinker, Worker, and Verifier roles for task execution.
 */
export class TrinityCoordinator {
  private readonly config: ResolvedConfig;
  private readonly log: ILogger;
  private cancelFlag = false;

  constructor(config?: TrinityConfig) {
    this.config = resolveConfig(config);
    this.log = logger;
  }

  cancel(reason: string): void {
    this.cancelFlag = true;
    this.log.info('TRINITY coordination cancelled', { reason });
  }

  async execute(options: TrinityExecuteOptions): Promise<Result<TrinityResult, AgentError>> {
    this.cancelFlag = false;
    const ctx: CoordinationContext = {
      task: options.task,
      agent: options.agent,
      startTime: Date.now(),
      history: [],
    };

    this.log.info('Starting TRINITY coordination', { taskId: options.task.id });
    return this.runCoordination(ctx);
  }

  private async runCoordination(
    ctx: CoordinationContext
  ): Promise<Result<TrinityResult, AgentError>> {
    const thinkerResult = await this.runThinker(ctx);
    if (!thinkerResult.ok) return thinkerResult;
    if (this.cancelFlag) return this.buildCancelledResult(ctx, thinkerResult.value);

    return this.runIterationLoop(ctx, thinkerResult.value);
  }

  private async runIterationLoop(
    ctx: CoordinationContext,
    thinker: ThinkerOutput
  ): Promise<Result<TrinityResult, AgentError>> {
    let worker: WorkerOutput | undefined;
    let verifier: VerifierOutput | undefined;

    for (let i = 0; i < this.config.maxIterations; i++) {
      if (this.isTimedOut(ctx)) {
        return this.okResult({
          ctx,
          thinker,
          worker,
          verifier,
          stopReason: 'timeout',
          iterations: i + 1,
        });
      }

      const workResult = await this.runWorker(ctx, thinker, verifier);
      if (!workResult.ok) return workResult;
      worker = workResult.value;
      if (this.cancelFlag) return this.buildCancelledResult(ctx, thinker, worker);

      const verifyResult = await this.runVerifier(ctx, thinker, worker);
      if (!verifyResult.ok) return verifyResult;
      verifier = verifyResult.value;

      if (verifier.verdict === 'pass') {
        this.log.info('TRINITY verification passed', { iterations: i + 1 });
        return this.okResult({
          ctx,
          thinker,
          worker,
          verifier,
          stopReason: 'verified',
          iterations: i + 1,
        });
      }

      this.log.info('TRINITY verification failed, iterating', {
        iterations: i + 1,
        issues: verifier.issuesFound,
      });
    }

    this.log.warn('TRINITY max iterations reached', { iterations: this.config.maxIterations });
    return this.okResult({
      ctx,
      thinker,
      worker,
      verifier,
      stopReason: 'max_iterations',
      iterations: this.config.maxIterations,
    });
  }

  /** Build an ok Result with the given parameters. */
  private okResult(opts: ResultBuildOpts): Result<TrinityResult, AgentError> {
    return ok(this.buildResult(opts));
  }

  private async runThinker(ctx: CoordinationContext): Promise<Result<ThinkerOutput, AgentError>> {
    const phaseStart = Date.now();
    const task = buildRoleTask(ctx.task, 'thinker', '');

    const result = await ctx.agent.execute(task);
    if (!result.ok) return err(new AgentError('Thinker phase failed', { cause: result.error }));

    const output = String(result.value.output);
    ctx.history.push(
      this.createPhaseResult(
        'thinking',
        'thinker',
        output,
        phaseStart,
        result.value.metadata.tokensUsed
      )
    );

    return ok(parseThinkerOutput(output));
  }

  private async runWorker(
    ctx: CoordinationContext,
    thinker: ThinkerOutput,
    feedback: VerifierOutput | undefined
  ): Promise<Result<WorkerOutput, AgentError>> {
    const phaseStart = Date.now();
    let context = `Thinker's Analysis:\n${thinker.problemAnalysis}\n\nApproach:\n${thinker.approach}`;

    if (feedback !== undefined) {
      context += `\n\nPrevious Attempt Feedback:\n- Issues: ${feedback.issuesFound.join(', ')}\n- Recommendations: ${feedback.recommendations.join(', ')}`;
    }

    const task = buildRoleTask(ctx.task, 'worker', context);
    const result = await ctx.agent.execute(task);
    if (!result.ok) return err(new AgentError('Worker phase failed', { cause: result.error }));

    const output = String(result.value.output);
    ctx.history.push(
      this.createPhaseResult(
        'working',
        'worker',
        output,
        phaseStart,
        result.value.metadata.tokensUsed
      )
    );

    return ok(parseWorkerOutput(output));
  }

  private async runVerifier(
    ctx: CoordinationContext,
    thinker: ThinkerOutput,
    worker: WorkerOutput
  ): Promise<Result<VerifierOutput, AgentError>> {
    const phaseStart = Date.now();
    const context = `Original Plan:\n${thinker.approach}\n\nSuccess Criteria:\n${thinker.successCriteria.join('\n')}\n\nWorker Output:\n${worker.implementation}`;

    const task = buildRoleTask(ctx.task, 'verifier', context);
    const result = await ctx.agent.execute(task);
    if (!result.ok) return err(new AgentError('Verifier phase failed', { cause: result.error }));

    const output = String(result.value.output);
    ctx.history.push(
      this.createPhaseResult(
        'verifying',
        'verifier',
        output,
        phaseStart,
        result.value.metadata.tokensUsed
      )
    );

    return ok(parseVerifierOutput(output));
  }

  private createPhaseResult(
    phase: TrinityPhaseResult['phase'],
    role: TrinityRole,
    output: string,
    startTime: number,
    tokensUsed: number
  ): TrinityPhaseResult {
    return { phase, role, output, durationMs: Date.now() - startTime, tokensUsed };
  }

  private isTimedOut(ctx: CoordinationContext): boolean {
    return Date.now() - ctx.startTime > this.config.timeoutMs;
  }

  private buildCancelledResult(
    ctx: CoordinationContext,
    thinker: ThinkerOutput,
    worker?: WorkerOutput
  ): Result<TrinityResult, AgentError> {
    const verifier = createDefaultVerifierOutput(true);
    return ok(
      this.buildResult({
        ctx,
        thinker,
        worker: worker ?? createDefaultWorkerOutput(),
        verifier,
        stopReason: 'error',
        iterations: 0,
      })
    );
  }

  private buildResult(opts: ResultBuildOpts): TrinityResult {
    const w = opts.worker ?? createDefaultWorkerOutput();
    const v = opts.verifier ?? createDefaultVerifierOutput();

    return {
      success: v.verdict === 'pass',
      finalOutput: w.implementation,
      thinkerOutput: opts.thinker,
      workerOutput: w,
      verifierOutput: v,
      iterations: opts.iterations,
      totalDurationMs: Date.now() - opts.ctx.startTime,
      history: this.config.includeHistory ? [...opts.ctx.history] : [],
      stopReason: opts.stopReason,
    };
  }
}

/** Creates a TRINITY coordinator instance. */
export function createTrinityCoordinator(config?: TrinityConfig): TrinityCoordinator {
  return new TrinityCoordinator(config);
}
