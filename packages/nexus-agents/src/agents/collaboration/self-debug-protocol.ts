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
  ErrorPattern,
} from './self-debug-types.js';
import { DEFAULT_ERROR_PATTERNS, DEFAULT_SELF_DEBUG_CONFIG } from './self-debug-types.js';
import {
  createParsedError,
  buildExplanationPrompt,
  buildFixPrompt,
  parseExplanation,
  parseFix,
} from './self-debug-helpers.js';

// =============================================================================
// Types
// =============================================================================

/** Executor function that runs code and returns results. */
export type CodeExecutor = (code: string) => Promise<ExecutionResult>;

/** Options for executing Self-Debug protocol. */
export interface SelfDebugExecuteOptions {
  readonly code: string;
  readonly task: Task;
  readonly agent: IAgent;
  readonly executor: CodeExecutor;
}

/** Resolved config with all defaults applied. */
interface ResolvedConfig {
  readonly maxIterations: number;
  readonly iterationTimeoutMs: number;
  readonly stopOnFirstError: boolean;
  readonly includeExplanation: boolean;
  readonly errorPatterns: readonly ErrorPattern[];
}

/** Context passed between methods during execution. */
interface ExecutionContext {
  readonly task: Task;
  readonly agent: IAgent;
  readonly executor: CodeExecutor;
  readonly startTime: number;
}

/** Options for fix attempt. */
interface FixAttemptOptions {
  readonly ctx: ExecutionContext;
  readonly code: string;
  readonly execution: ExecutionResult;
  readonly errors: ParsedError[];
  readonly iterNum: number;
  readonly iterStart: number;
}

/** Options for building iteration record. */
interface IterationBuildOpts {
  readonly iteration: number;
  readonly code: string;
  readonly execution: ExecutionResult;
  readonly errors: ParsedError[];
  readonly explanations: ErrorExplanation[];
  readonly fixes: CodeFix[];
  readonly appliedFix: CodeFix | undefined;
  readonly startTime: number;
}

/** Options for building final result. */
interface ResultBuildOpts {
  readonly success: boolean;
  readonly code: string;
  readonly execution: ExecutionResult;
  readonly history: DebugIteration[];
  readonly errorsFixed: ParsedError[];
  readonly stopReason: SelfDebugResult['stopReason'];
}

/** Internal result from an iteration. */
interface IterationResult {
  success: boolean;
  newCode: string;
  execution: ExecutionResult;
  fixedErrors: ParsedError[];
  madeProgress: boolean;
  iteration: DebugIteration;
}

const logger = createLogger({ component: 'self-debug-protocol' });

/** Get default resolved config. */
function getDefaultConfig(): ResolvedConfig {
  const d = DEFAULT_SELF_DEBUG_CONFIG;
  return {
    maxIterations: d.maxIterations,
    iterationTimeoutMs: d.iterationTimeoutMs,
    stopOnFirstError: d.stopOnFirstError,
    includeExplanation: d.includeExplanation,
    errorPatterns: DEFAULT_ERROR_PATTERNS,
  };
}

/** Merge config with defaults. */
function mergeConfig(config: SelfDebugConfig | undefined): ResolvedConfig {
  if (config === undefined) return getDefaultConfig();
  const d = getDefaultConfig();
  return {
    maxIterations: config.maxIterations ?? d.maxIterations,
    iterationTimeoutMs: config.iterationTimeoutMs ?? d.iterationTimeoutMs,
    stopOnFirstError: config.stopOnFirstError ?? d.stopOnFirstError,
    includeExplanation: config.includeExplanation ?? d.includeExplanation,
    errorPatterns: config.errorPatterns ?? d.errorPatterns,
  };
}

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

    const initialResult = await this.executeCode(ctx, options.code);
    if (initialResult.success) {
      return ok(
        this.buildResult({
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
    const history: DebugIteration[] = [];
    let currentCode = initialCode;
    let errorsFixed: ParsedError[] = [];

    for (let i = 0; i < this.config.maxIterations; i++) {
      if (this.isCancelled()) {
        return this.handleCancellation(ctx, currentCode, history, errorsFixed);
      }

      const iterResult = await this.runIteration(ctx, currentCode, i + 1);
      if (!iterResult.ok) {
        this.log.warn('Iteration failed', { iteration: i + 1, error: iterResult.error.message });
        continue;
      }

      history.push(iterResult.value.iteration);

      if (this.isCancelled()) {
        return this.handleCancellation(ctx, iterResult.value.newCode, history, errorsFixed);
      }

      if (iterResult.value.success) {
        const allFixed = [...errorsFixed, ...iterResult.value.fixedErrors];
        return ok(
          this.buildResult({
            success: true,
            code: iterResult.value.newCode,
            execution: iterResult.value.execution,
            history,
            errorsFixed: allFixed,
            stopReason: 'success',
          })
        );
      }

      if (!iterResult.value.madeProgress) {
        return ok(
          this.buildResult({
            success: false,
            code: currentCode,
            execution: iterResult.value.execution,
            history,
            errorsFixed,
            stopReason: 'no_progress',
          })
        );
      }

      errorsFixed = [...errorsFixed, ...iterResult.value.fixedErrors];
      currentCode = iterResult.value.newCode;
    }

    const finalExec = await this.executeCode(ctx, currentCode);
    return ok(
      this.buildResult({
        success: false,
        code: currentCode,
        execution: finalExec,
        history,
        errorsFixed,
        stopReason: 'max_iterations',
      })
    );
  }

  private async handleCancellation(
    ctx: ExecutionContext,
    code: string,
    history: DebugIteration[],
    errorsFixed: ParsedError[]
  ): Promise<Result<SelfDebugResult, AgentError>> {
    const finalExec = await this.executeCode(ctx, code);
    return ok(
      this.buildResult({
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
    const execution = await this.executeCode(ctx, code);
    const errors = this.getErrors(execution, iterNum);

    if (errors.length === 0 && execution.success) {
      return ok({
        success: true,
        newCode: code,
        execution,
        fixedErrors: [],
        madeProgress: true,
        iteration: this.buildIteration({
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
        iteration: this.buildIteration({
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
    let errors = this.parseErrors(execution);
    if (errors.length === 0 && !execution.success) {
      const stderr =
        execution.stderr.length > 0
          ? execution.stderr
          : execution.stdout.length > 0
            ? execution.stdout
            : 'Unknown error';
      errors = [
        {
          id: `error-synthetic-${String(iterNum)}`,
          category: 'unknown',
          severity: 'error',
          message: stderr.slice(0, 500),
          rawError: stderr,
        },
      ];
    }
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
        iteration: this.buildIteration({
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
    const newCode = this.applyFix(code, bestFix);

    if (this.isCancelled()) {
      return ok({
        success: false,
        newCode,
        execution,
        fixedErrors: [],
        madeProgress: true,
        iteration: this.buildIteration({
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

    const newExecution = await this.executeCode(ctx, newCode);
    const newErrors = this.parseErrors(newExecution);
    const fixedErrors = errors.filter((e) => !newErrors.some((ne) => ne.message === e.message));
    const madeProgress = newExecution.success || fixedErrors.length > 0 || newCode !== code;

    return ok({
      success: newExecution.success,
      newCode,
      execution: newExecution,
      fixedErrors,
      madeProgress,
      iteration: this.buildIteration({
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

  private async executeCode(ctx: ExecutionContext, code: string): Promise<ExecutionResult> {
    try {
      return await ctx.executor(code);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: message,
        durationMs: 0,
        errors: [],
      };
    }
  }

  parseErrors(result: ExecutionResult): ParsedError[] {
    if (result.errors.length > 0) return [...result.errors];
    const errors: ParsedError[] = [];
    const output = result.stderr.length > 0 ? result.stderr : result.stdout;
    let errorId = 0;
    for (const pattern of this.config.errorPatterns) {
      const matches = output.matchAll(new RegExp(pattern.pattern, 'gm'));
      for (const match of matches) {
        errors.push(createParsedError(match, pattern, ++errorId));
      }
    }
    return errors;
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

  private applyFix(code: string, fix: CodeFix): string {
    const hasLocation = fix.location?.line !== undefined;
    const hasOriginal = fix.originalCode.length > 0;
    const hasFixed = fix.fixedCode.length > 0;
    if (hasLocation && hasOriginal && hasFixed)
      return code.replace(fix.originalCode, fix.fixedCode);
    return hasFixed ? fix.fixedCode : code;
  }

  private buildIteration(opts: IterationBuildOpts): DebugIteration {
    return {
      iteration: opts.iteration,
      codeSnapshot: opts.code,
      executionResult: opts.execution,
      errorsDetected: opts.errors,
      explanations: opts.explanations,
      proposedFixes: opts.fixes,
      appliedFix: opts.appliedFix,
      durationMs: Date.now() - opts.startTime,
    };
  }

  private buildResult(opts: ResultBuildOpts): SelfDebugResult {
    return {
      success: opts.success,
      finalCode: opts.code,
      finalExecution: opts.execution,
      totalIterations: opts.history.length,
      totalDurationMs: opts.history.reduce((sum, h) => sum + h.durationMs, 0),
      errorsFixed: opts.errorsFixed,
      errorsRemaining: opts.execution.errors,
      history: opts.history,
      stopReason: opts.stopReason,
    };
  }
}

/** Creates a Self-Debug protocol instance. */
export function createSelfDebugProtocol(config?: SelfDebugConfig): SelfDebugProtocol {
  return new SelfDebugProtocol(config);
}
