/**
 * Self-Debug Protocol
 *
 * Implements the Self-Debug code repair loop from arXiv:2304.05128.
 * Uses "rubber duck debugging" where the model explains code, identifies
 * errors, and iteratively fixes issues until tests pass.
 *
 * @module agents/collaboration/self-debug-protocol
 * (Source: Issue #131, arXiv:2304.05128)
 */

import type { Result, ILogger, IAgent, Task } from '../../core/index.js';
import { ok, err, AgentError, createLogger } from '../../core/index.js';
import type {
  SelfDebugConfig,
  SelfDebugResult,
  ExecutionResult,
  ParsedError,
  ErrorExplanation,
  CodeFix,
  DebugIteration,
} from './self-debug-types.js';
import {
  buildExplanationPrompt,
  buildFixPrompt,
  parseExplanation,
  parseFix,
  applyFix,
  buildIteration,
  buildResult,
  executeCode,
  parseErrorsFromOutput,
  createSyntheticError,
  type CodeExecutor,
  type ResultBuildOpts,
} from './self-debug-helpers.js';
import type {
  ResolvedConfig,
  ExecutionContext,
  FixAttemptOptions,
  IterationResult,
} from './self-debug-config.js';
import { mergeConfig } from './self-debug-config.js';

export type { CodeExecutor } from './self-debug-helpers.js';

// =============================================================================
// Types
// =============================================================================

/** Options for executing Self-Debug protocol. */
export interface SelfDebugExecuteOptions {
  readonly code: string;
  readonly task: Task;
  readonly agent: IAgent;
  readonly executor: CodeExecutor;
}

const logger = createLogger({ component: 'self-debug-protocol' });

// =============================================================================
// Self-Debug Protocol
// =============================================================================

/**
 * Self-Debug Protocol for automatic error recovery.
 * Implements the debug loop: execute → detect → explain → fix → verify
 */
export class SelfDebugProtocol {
  private readonly config: ResolvedConfig;
  private readonly log: ILogger;
  private cancelFlag = false;

  constructor(config?: SelfDebugConfig) {
    this.config = mergeConfig(config);
    this.log = logger;
  }

  private isCancelled(): boolean {
    return this.cancelFlag;
  }

  async execute(options: SelfDebugExecuteOptions): Promise<Result<SelfDebugResult, AgentError>> {
    const ctx: ExecutionContext = {
      task: options.task,
      agent: options.agent,
      executor: options.executor,
      startTime: Date.now(),
    };

    this.cancelFlag = false;
    this.log.info('Starting self-debug protocol', { taskId: options.task.id });

    const initialResult = await executeCode(ctx.executor, options.code);
    if (initialResult.success) {
      return ok(
        buildResult({
          success: true,
          code: options.code,
          execution: initialResult,
          history: [],
          errorsFixed: [],
          stopReason: 'success',
        })
      );
    }

    return this.runDebugLoop(ctx, options.code);
  }

  private async runDebugLoop(
    ctx: ExecutionContext,
    initialCode: string
  ): Promise<Result<SelfDebugResult, AgentError>> {
    const h: DebugIteration[] = [];
    let code = initialCode;
    let fixed: ParsedError[] = [];

    for (let i = 0; i < this.config.maxIterations; i++) {
      if (this.isCancelled()) return this.handleCancellation(ctx, code, h, fixed);
      const r = await this.runIteration(ctx, code, i + 1);
      if (!r.ok) {
        this.log.warn('Iteration failed', { iteration: i + 1, error: r.error.message });
        continue;
      }
      h.push(r.value.iteration);
      if (this.isCancelled()) return this.handleCancellation(ctx, r.value.newCode, h, fixed);
      if (r.value.success) {
        return this.okResult({
          success: true,
          code: r.value.newCode,
          execution: r.value.execution,
          history: h,
          errorsFixed: [...fixed, ...r.value.fixedErrors],
          stopReason: 'success',
        });
      }
      if (!r.value.madeProgress) {
        return this.okResult({
          success: false,
          code,
          execution: r.value.execution,
          history: h,
          errorsFixed: fixed,
          stopReason: 'no_progress',
        });
      }
      fixed = [...fixed, ...r.value.fixedErrors];
      code = r.value.newCode;
    }
    return this.okResult({
      success: false,
      code,
      execution: await executeCode(ctx.executor, code),
      history: h,
      errorsFixed: fixed,
      stopReason: 'max_iterations',
    });
  }

  /** Build an ok Result with the given parameters. */
  private okResult(opts: ResultBuildOpts): Result<SelfDebugResult, AgentError> {
    return ok(buildResult(opts));
  }

  private async handleCancellation(
    ctx: ExecutionContext,
    code: string,
    history: DebugIteration[],
    errorsFixed: ParsedError[]
  ): Promise<Result<SelfDebugResult, AgentError>> {
    const finalExec = await executeCode(ctx.executor, code);
    return ok(
      buildResult({
        success: false,
        code,
        execution: finalExec,
        history,
        errorsFixed,
        stopReason: 'cancelled',
      })
    );
  }

  cancel(reason: string): void {
    this.cancelFlag = true;
    this.log.info('Self-debug cancelled', { reason });
  }

  private async runIteration(
    ctx: ExecutionContext,
    code: string,
    iterNum: number
  ): Promise<Result<IterationResult, AgentError>> {
    const iterStart = Date.now();
    const execution = await executeCode(ctx.executor, code);
    const errors = this.getErrors(execution, iterNum);

    if (errors.length === 0 && execution.success) {
      return ok({
        success: true,
        newCode: code,
        execution,
        fixedErrors: [],
        madeProgress: true,
        iteration: buildIteration({
          iteration: iterNum,
          code,
          execution,
          errors: [],
          explanations: [],
          fixes: [],
          appliedFix: undefined,
          startTime: iterStart,
        }),
      });
    }

    if (this.isCancelled()) {
      return ok({
        success: false,
        newCode: code,
        execution,
        fixedErrors: [],
        madeProgress: false,
        iteration: buildIteration({
          iteration: iterNum,
          code,
          execution,
          errors,
          explanations: [],
          fixes: [],
          appliedFix: undefined,
          startTime: iterStart,
        }),
      });
    }

    return this.attemptFix({ ctx, code, execution, errors, iterNum, iterStart });
  }

  private getErrors(execution: ExecutionResult, iterNum: number): ParsedError[] {
    const errors = this.parseErrors(execution);
    if (errors.length === 0 && !execution.success)
      return [createSyntheticError(execution, iterNum)];
    return errors;
  }

  private async attemptFix(opts: FixAttemptOptions): Promise<Result<IterationResult, AgentError>> {
    const { ctx, code, execution, errors, iterNum, iterStart } = opts;
    const explanations = this.config.includeExplanation
      ? await this.explainErrors(ctx, code, errors)
      : [];
    const fixes = await this.generateFixes(ctx, code, errors, explanations);

    if (fixes.length === 0) {
      return ok({
        success: false,
        newCode: code,
        execution,
        fixedErrors: [],
        madeProgress: false,
        iteration: buildIteration({
          iteration: iterNum,
          code,
          execution,
          errors,
          explanations,
          fixes: [],
          appliedFix: undefined,
          startTime: iterStart,
        }),
      });
    }

    const bestFix = fixes[0];
    if (bestFix === undefined) return err(new AgentError('No valid fix generated'));

    return this.applyAndVerifyFix(opts, explanations, fixes, bestFix);
  }

  private async applyAndVerifyFix(
    opts: FixAttemptOptions,
    explanations: ErrorExplanation[],
    fixes: CodeFix[],
    bestFix: CodeFix
  ): Promise<Result<IterationResult, AgentError>> {
    const { ctx, code, execution, errors, iterNum, iterStart } = opts;
    const newCode = applyFix(code, bestFix);

    if (this.isCancelled()) {
      return ok({
        success: false,
        newCode,
        execution,
        fixedErrors: [],
        madeProgress: true,
        iteration: buildIteration({
          iteration: iterNum,
          code,
          execution,
          errors,
          explanations,
          fixes,
          appliedFix: bestFix,
          startTime: iterStart,
        }),
      });
    }

    const newExecution = await executeCode(ctx.executor, newCode);
    const newErrors = this.parseErrors(newExecution);
    const fixedErrors = errors.filter((e) => !newErrors.some((ne) => ne.message === e.message));
    const madeProgress = newExecution.success || fixedErrors.length > 0 || newCode !== code;

    return ok({
      success: newExecution.success,
      newCode,
      execution: newExecution,
      fixedErrors,
      madeProgress,
      iteration: buildIteration({
        iteration: iterNum,
        code,
        execution,
        errors,
        explanations,
        fixes,
        appliedFix: bestFix,
        startTime: iterStart,
      }),
    });
  }

  parseErrors(result: ExecutionResult): ParsedError[] {
    return parseErrorsFromOutput(result, this.config.errorPatterns);
  }

  private async explainErrors(
    ctx: ExecutionContext,
    code: string,
    errors: ParsedError[]
  ): Promise<ErrorExplanation[]> {
    const explanations: ErrorExplanation[] = [];
    for (const error of errors.slice(0, 3)) {
      const prompt = buildExplanationPrompt(code, error);
      const task: Task = {
        id: `${ctx.task.id}-explain-${error.id}`,
        description: prompt,
        context: {},
      };
      const result = await ctx.agent.execute(task);
      if (result.ok) explanations.push(parseExplanation(error.id, String(result.value.output)));
    }
    return explanations;
  }

  private async generateFixes(
    ctx: ExecutionContext,
    code: string,
    errors: ParsedError[],
    explanations: ErrorExplanation[]
  ): Promise<CodeFix[]> {
    const targetError = errors[0];
    if (targetError === undefined) return [];
    const explanation = explanations.find((e) => e.errorId === targetError.id);
    const prompt = buildFixPrompt(code, targetError, explanation);
    const task: Task = {
      id: `${ctx.task.id}-fix-${targetError.id}`,
      description: prompt,
      context: {},
    };
    const result = await ctx.agent.execute(task);
    return result.ok ? [parseFix(targetError.id, code, String(result.value.output))] : [];
  }
}

/** Creates a Self-Debug protocol instance. */
export function createSelfDebugProtocol(config?: SelfDebugConfig): SelfDebugProtocol {
  return new SelfDebugProtocol(config);
}
