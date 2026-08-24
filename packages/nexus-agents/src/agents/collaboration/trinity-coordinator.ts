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

import type { Result, ILogger } from '../../core/index.js';
import { ok, err, AgentError, createLogger, getTimeProvider } from '../../core/index.js';
import type {
  TrinityConfig,
  TrinityResult,
  TrinityRole,
  TrinityPhaseResult,
  ThinkerOutput,
  WorkerOutput,
  VerifierOutput,
  TrinityExecuteOptions,
  CoordinationContext,
  TrinityCoordinatorOptions,
  ResolvedConfig,
  ResultBuildOpts,
} from './trinity-types.js';
import {
  buildRoleTask,
  parseThinkerOutput,
  parseWorkerOutput,
  parseVerifierOutput,
  createDefaultWorkerOutput,
  createDefaultVerifierOutput,
  resolveConfig,
} from './trinity-helpers.js';
import type { IEventBus } from './event-bus-types.js';
import { getGlobalEventBus } from './event-bus.js';
import {
  emitTrinityStarted,
  emitTrinityIteration,
  emitTrinityCompleted,
  emitPhaseStarted,
  emitPhaseCompleted,
} from './trinity-events.js';

// Re-export types for backward compatibility
export type { TrinityExecuteOptions, TrinityCoordinatorOptions };

const logger = createLogger({ component: 'trinity-coordinator' });

// =============================================================================
// TrinityCoordinator Class
// =============================================================================

/**
 * Coordinates Thinker, Worker, and Verifier roles for task execution.
 */
export class TrinityCoordinator {
  private readonly config: ResolvedConfig;
  private readonly trinityConfig: TrinityConfig;
  private readonly log: ILogger;
  private readonly eventBus: IEventBus;
  private cancelFlag = false;

  constructor(options?: TrinityConfig | TrinityCoordinatorOptions) {
    // Handle both old (config only) and new (options object) signatures
    const opts = this.normalizeOptions(options);
    this.config = resolveConfig(opts.config);
    this.trinityConfig = opts.config ?? {};
    this.eventBus = opts.eventBus ?? getGlobalEventBus();
    this.log = logger;
  }

  /** Normalizes constructor options for backward compatibility. */
  private normalizeOptions(
    options?: TrinityConfig | TrinityCoordinatorOptions
  ): TrinityCoordinatorOptions {
    if (options === undefined) return {};
    if ('config' in options || 'eventBus' in options) return options;
    // At this point, options is TrinityConfig (has neither config nor eventBus keys)
    return { config: options as TrinityConfig };
  }

  cancel(reason: string): void {
    this.cancelFlag = true;
    this.log.info('TRINITY coordination cancelled', { reason });
  }

  async execute(options: TrinityExecuteOptions): Promise<Result<TrinityResult, AgentError>> {
    this.cancelFlag = false;
    const time = getTimeProvider();
    const sessionId = `trinity-${options.task.id}-${String(time.now())}`;
    const ctx: CoordinationContext = {
      task: options.task,
      agent: options.agent,
      startTime: time.now(),
      history: [],
      sessionId,
    };

    this.log.info('Starting TRINITY coordination', { taskId: options.task.id });
    emitTrinityStarted(this.eventBus, {
      sessionId,
      trinityConfig: { ...this.trinityConfig, maxIterations: this.config.maxIterations },
    });
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
        return this.returnResult(ctx, {
          thinker,
          worker,
          verifier,
          stopReason: 'timeout',
          iterations: i + 1,
        });
      }

      const workResult = await this.runWorker(ctx, thinker, verifier, i);
      if (!workResult.ok) return workResult;
      worker = workResult.value;
      if (this.cancelFlag) return this.buildCancelledResult(ctx, thinker, worker);

      const verifyResult = await this.runVerifier(ctx, thinker, worker, i);
      if (!verifyResult.ok) return verifyResult;
      verifier = verifyResult.value;

      if (verifier.verdict === 'pass') {
        this.log.info('TRINITY verification passed', { iterations: i + 1 });
        this.emitIteration(i, 'converged', ctx.sessionId);
        return this.returnResult(ctx, {
          thinker,
          worker,
          verifier,
          stopReason: 'verified',
          iterations: i + 1,
        });
      }

      this.log.info('TRINITY verification failed, iterating', { iterations: i + 1 });
      this.emitIteration(i, 'in_progress', ctx.sessionId);
    }

    this.log.warn('TRINITY max iterations reached', { iterations: this.config.maxIterations });
    this.emitIteration(this.config.maxIterations - 1, 'max_reached', ctx.sessionId);
    return this.returnResult(ctx, {
      thinker,
      worker,
      verifier,
      stopReason: 'max_iterations',
      iterations: this.config.maxIterations,
    });
  }

  /** Emits an iteration event with given status. */
  private emitIteration(
    round: number,
    status: 'converged' | 'max_reached' | 'in_progress',
    sessionId: string
  ): void {
    emitTrinityIteration(this.eventBus, {
      round,
      maxRounds: this.config.maxIterations,
      status,
      sessionId,
    });
  }

  /** Builds result, emits completed event, and returns. */
  private emitAndReturn(
    ctx: CoordinationContext,
    opts: ResultBuildOpts
  ): Result<TrinityResult, AgentError> {
    const result = this.buildResult(opts);
    emitTrinityCompleted(this.eventBus, {
      result,
      startTime: ctx.startTime,
      sessionId: ctx.sessionId,
    });
    return ok(result);
  }

  /** Shorthand for emitAndReturn with inline arguments. */
  private returnResult(
    ctx: CoordinationContext,
    opts: {
      thinker: ThinkerOutput;
      worker: WorkerOutput | undefined;
      verifier: VerifierOutput | undefined;
      stopReason: TrinityResult['stopReason'];
      iterations: number;
    }
  ): Result<TrinityResult, AgentError> {
    return this.emitAndReturn(ctx, { ctx, ...opts });
  }

  private async runThinker(ctx: CoordinationContext): Promise<Result<ThinkerOutput, AgentError>> {
    const time = getTimeProvider();
    const phaseStart = time.now();

    // Emit phase started event (Issue #216)
    emitPhaseStarted(this.eventBus, {
      iteration: 0,
      phase: 'thinker',
      sessionId: ctx.sessionId,
    });

    const task = buildRoleTask(ctx.task, 'thinker', '');
    const result = await ctx.agent.execute(task);

    const durationMs = time.now() - phaseStart;
    const tokensUsed = result.ok ? result.value.metadata.tokensUsed : 0;
    // #4743: a failed phase has no measurement at all, so it is unmeasured
    // rather than a measured zero.
    const tokensMeasured = result.ok ? result.value.metadata.tokensMeasured : false;

    // Emit phase completed event (Issue #216)
    emitPhaseCompleted(this.eventBus, {
      iteration: 0,
      phase: 'thinker',
      durationMs,
      tokensUsed,
      sessionId: ctx.sessionId,
    });

    if (!result.ok) return err(new AgentError('Thinker phase failed', { cause: result.error }));

    const output = String(result.value.output);
    ctx.history.push(
      this.createPhaseResult('thinking', 'thinker', output, phaseStart, {
        tokensUsed,
        ...(tokensMeasured !== undefined ? { tokensMeasured } : {}),
      })
    );

    return ok(parseThinkerOutput(output));
  }

  private async runWorker(
    ctx: CoordinationContext,
    thinker: ThinkerOutput,
    feedback: VerifierOutput | undefined,
    iteration: number
  ): Promise<Result<WorkerOutput, AgentError>> {
    const time = getTimeProvider();
    const phaseStart = time.now();

    // Emit phase started event (Issue #216)
    emitPhaseStarted(this.eventBus, {
      iteration,
      phase: 'worker',
      sessionId: ctx.sessionId,
    });

    let context = `Thinker's Analysis:\n${thinker.problemAnalysis}\n\nApproach:\n${thinker.approach}`;

    if (feedback !== undefined) {
      context += `\n\nPrevious Attempt Feedback:\n- Issues: ${feedback.issuesFound.join(', ')}\n- Recommendations: ${feedback.recommendations.join(', ')}`;
    }

    const task = buildRoleTask(ctx.task, 'worker', context);
    const result = await ctx.agent.execute(task);

    const durationMs = time.now() - phaseStart;
    const tokensUsed = result.ok ? result.value.metadata.tokensUsed : 0;
    // #4743: a failed phase has no measurement at all, so it is unmeasured
    // rather than a measured zero.
    const tokensMeasured = result.ok ? result.value.metadata.tokensMeasured : false;

    // Emit phase completed event (Issue #216)
    emitPhaseCompleted(this.eventBus, {
      iteration,
      phase: 'worker',
      durationMs,
      tokensUsed,
      sessionId: ctx.sessionId,
    });

    if (!result.ok) return err(new AgentError('Worker phase failed', { cause: result.error }));

    const output = String(result.value.output);
    ctx.history.push(
      this.createPhaseResult('working', 'worker', output, phaseStart, {
        tokensUsed,
        ...(tokensMeasured !== undefined ? { tokensMeasured } : {}),
      })
    );

    return ok(parseWorkerOutput(output));
  }

  private async runVerifier(
    ctx: CoordinationContext,
    thinker: ThinkerOutput,
    worker: WorkerOutput,
    iteration: number
  ): Promise<Result<VerifierOutput, AgentError>> {
    const time = getTimeProvider();
    const phaseStart = time.now();

    // Emit phase started event (Issue #216)
    emitPhaseStarted(this.eventBus, {
      iteration,
      phase: 'verifier',
      sessionId: ctx.sessionId,
    });

    const context = `Original Plan:\n${thinker.approach}\n\nSuccess Criteria:\n${thinker.successCriteria.join('\n')}\n\nWorker Output:\n${worker.implementation}`;

    const task = buildRoleTask(ctx.task, 'verifier', context);
    const result = await ctx.agent.execute(task);

    const durationMs = time.now() - phaseStart;
    const tokensUsed = result.ok ? result.value.metadata.tokensUsed : 0;
    // #4743: a failed phase has no measurement at all, so it is unmeasured
    // rather than a measured zero.
    const tokensMeasured = result.ok ? result.value.metadata.tokensMeasured : false;

    // Emit phase completed event (Issue #216)
    emitPhaseCompleted(this.eventBus, {
      iteration,
      phase: 'verifier',
      durationMs,
      tokensUsed,
      sessionId: ctx.sessionId,
    });

    if (!result.ok) return err(new AgentError('Verifier phase failed', { cause: result.error }));

    const output = String(result.value.output);
    ctx.history.push(
      this.createPhaseResult('verifying', 'verifier', output, phaseStart, {
        tokensUsed,
        ...(tokensMeasured !== undefined ? { tokensMeasured } : {}),
      })
    );

    return ok(parseVerifierOutput(output));
  }

  private createPhaseResult(
    phase: TrinityPhaseResult['phase'],
    role: TrinityRole,
    output: string,
    startTime: number,
    // #4743: the count and its provenance travel together — passing them as
    // separate positional arguments is what let them drift apart. `undefined`
    // provenance means the caller had none to pass on, which is different from
    // knowing the count was unmeasured.
    usage: { tokensUsed: number; tokensMeasured?: boolean }
  ): TrinityPhaseResult {
    return {
      phase,
      role,
      output,
      durationMs: getTimeProvider().now() - startTime,
      tokensUsed: usage.tokensUsed,
      ...(usage.tokensMeasured !== undefined ? { tokensMeasured: usage.tokensMeasured } : {}),
    };
  }

  private isTimedOut(ctx: CoordinationContext): boolean {
    return getTimeProvider().now() - ctx.startTime > this.config.timeoutMs;
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
      totalDurationMs: getTimeProvider().now() - opts.ctx.startTime,
      history: this.config.includeHistory ? [...opts.ctx.history] : [],
      stopReason: opts.stopReason,
    };
  }
}

/** Creates a TRINITY coordinator instance. */
export function createTrinityCoordinator(config?: TrinityConfig): TrinityCoordinator {
  return new TrinityCoordinator(config);
}
