/**
 * nexus-agents/cli-adapters - Enhanced Gemini CLI Adapter
 *
 * Improved Gemini adapter with:
 * - Tiered timeout profiles based on task complexity
 * - Resilient JSON parsing with fallback strategies
 * - Exponential backoff retry logic
 * - Circuit breaker integration for sustained failures
 *
 * (Source: Issue #366 - Gemini CLI timeout and parser improvements)
 */

import type { Result, ILogger } from '../../core/index.js';
import { ok, err, createLogger } from '../../core/index.js';
import type {
  ICliResponseParser,
  CliTask,
  CliResponse,
  CliError,
  ModelInfo,
  CliName,
  ExecutionOptions,
} from '../types.js';
import { SubprocessCliAdapter, type CommandConfig } from '../subprocess-adapter.js';
import { ResilientGeminiParser } from '../parsers/gemini-parser-resilient.js';
import {
  getTimeoutForTask,
  estimateTaskComplexity,
  type TaskComplexity,
} from '../cli-timeout-profiles.js';
import {
  CliCircuitBreaker,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  type CircuitBreakerConfig,
  type CircuitBreakerSnapshot,
} from '../circuit-breaker.js';

/** Configuration for enhanced Gemini adapter. */
export interface EnhancedGeminiConfig {
  /** Model to use (default: gemini-2.5-flash) */
  readonly model?: string;
  /** Custom logger */
  readonly logger?: ILogger;
  /** Maximum retry attempts (default: 3) */
  readonly maxRetries?: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  readonly baseDelayMs?: number;
  /** Maximum delay for backoff in ms (default: 30000) */
  readonly maxDelayMs?: number;
  /** Circuit breaker configuration */
  readonly circuitBreakerConfig?: Partial<CircuitBreakerConfig>;
  /** Enable circuit breaker (default: true) */
  readonly enableCircuitBreaker?: boolean;
}

/** Retry context for tracking retry state. */
interface RetryContext {
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly lastError?: CliError;
  readonly totalDelayMs: number;
}

/** Execution result with metadata. */
export interface EnhancedExecutionResult {
  readonly response: CliResponse;
  readonly retryCount: number;
  readonly totalDurationMs: number;
  readonly complexity: TaskComplexity;
  readonly circuitState: 'closed' | 'open' | 'half-open';
}

const DEFAULT_CONFIG: Required<Omit<EnhancedGeminiConfig, 'logger' | 'circuitBreakerConfig'>> = {
  model: 'gemini-2.5-flash',
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  enableCircuitBreaker: true,
};

/**
 * Enhanced Gemini CLI adapter with improved reliability.
 */
export class EnhancedGeminiCliAdapter extends SubprocessCliAdapter {
  readonly name: CliName = 'gemini';
  protected readonly parser: ICliResponseParser;

  private readonly model: string;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly circuitBreaker: CliCircuitBreaker | null;
  private readonly adapterLogger: ILogger;

  constructor(config?: EnhancedGeminiConfig) {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    super(config?.logger);

    this.model = mergedConfig.model;
    this.maxRetries = mergedConfig.maxRetries;
    this.baseDelayMs = mergedConfig.baseDelayMs;
    this.maxDelayMs = mergedConfig.maxDelayMs;
    this.parser = new ResilientGeminiParser();
    this.adapterLogger = config?.logger ?? createLogger({ component: 'gemini-enhanced' });

    // Initialize circuit breaker if enabled
    if (mergedConfig.enableCircuitBreaker) {
      const cbConfig: CircuitBreakerConfig = {
        ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
        ...config?.circuitBreakerConfig,
      };
      this.circuitBreaker = new CliCircuitBreaker('gemini', cbConfig);
    } else {
      this.circuitBreaker = null;
    }
  }

  /**
   * Gets Gemini model information.
   */
  getModelInfo(): ModelInfo {
    return {
      id: this.model,
      name: this.getModelDisplayName(),
      contextWindow: this.getContextWindow(),
      maxOutput: 8_192,
      costPerMillionInput: this.getCostPerMillionInput(),
      costPerMillionOutput: this.getCostPerMillionOutput(),
    };
  }

  /**
   * Executes a task with enhanced reliability features.
   */
  override async execute(
    task: CliTask,
    options?: ExecutionOptions
  ): Promise<Result<CliResponse, CliError>> {
    const result = await this.executeEnhanced(task, options);

    if (result.ok) {
      return ok(result.value.response);
    }

    return err(result.error);
  }

  /**
   * Executes with full metadata about retry attempts and circuit state.
   */
  async executeEnhanced(
    task: CliTask,
    options?: ExecutionOptions
  ): Promise<Result<EnhancedExecutionResult, CliError>> {
    const circuitCheckResult = this.checkCircuitBreaker();
    if (circuitCheckResult !== null) {
      return err(circuitCheckResult);
    }

    const startTime = Date.now();
    const complexity = estimateTaskComplexity(task.content);
    const effectiveOptions = this.buildExecutionOptions(task.content, options);

    const result = await this.executeWithRetryEnhanced(task, effectiveOptions);

    return this.buildEnhancedResult(result, startTime, complexity);
  }

  private checkCircuitBreaker(): CliError | null {
    if (this.circuitBreaker === null) {
      return null;
    }
    if (this.circuitBreaker.getState() === 'open') {
      return this.createCircuitOpenError();
    }
    return null;
  }

  private buildExecutionOptions(
    taskContent: string,
    options?: ExecutionOptions
  ): Required<ExecutionOptions> {
    const complexity = estimateTaskComplexity(taskContent);
    const timeoutMs = options?.timeoutMs ?? getTimeoutForTask(this.name, complexity);

    return {
      timeoutMs,
      allowRetry: options?.allowRetry ?? true,
      maxRetries: options?.maxRetries ?? this.maxRetries,
      trackUsage: options?.trackUsage ?? true,
    };
  }

  private buildEnhancedResult(
    result: Result<{ response: CliResponse; retryCount: number }, CliError>,
    startTime: number,
    complexity: TaskComplexity
  ): Result<EnhancedExecutionResult, CliError> {
    const totalDurationMs = Date.now() - startTime;
    const circuitState = this.circuitBreaker?.getState() ?? 'closed';

    if (result.ok) {
      this.circuitBreaker?.recordSuccess();
      return ok({
        response: result.value.response,
        retryCount: result.value.retryCount,
        totalDurationMs,
        complexity,
        circuitState,
      });
    }

    return err(result.error);
  }

  /**
   * Gets current circuit breaker snapshot.
   */
  getCircuitBreakerSnapshot(): CircuitBreakerSnapshot | null {
    return this.circuitBreaker?.getSnapshot() ?? null;
  }

  /**
   * Resets the circuit breaker to closed state.
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker?.reset();
  }

  /**
   * Gets CLI command and arguments for execution.
   */
  protected override getCommand(task: CliTask): CommandConfig {
    const args: string[] = [];

    // Add the task content as positional argument
    args.push(task.content);

    // Add output format
    args.push('-o', 'json');

    // Add model (always present due to default)
    const model = task.model ?? this.model;
    args.push('-m', model);

    // Add session for continuation
    if (task.sessionId !== undefined && task.sessionId !== '') {
      args.push('--resume', task.sessionId);
    }

    // Add sandbox mode for safety
    args.push('-s');

    return { command: 'gemini', args };
  }

  // -------------------------------------------------------------------------
  // Private Methods - Retry Logic
  // -------------------------------------------------------------------------

  private async executeWithRetryEnhanced(
    task: CliTask,
    options: Required<ExecutionOptions>
  ): Promise<Result<{ response: CliResponse; retryCount: number }, CliError>> {
    const maxAttempts = options.allowRetry ? options.maxRetries + 1 : 1;
    let retryContext: RetryContext = {
      attempt: 0,
      maxAttempts,
      totalDelayMs: 0,
    };

    while (retryContext.attempt < maxAttempts) {
      retryContext = { ...retryContext, attempt: retryContext.attempt + 1 };

      this.logRetryAttempt(retryContext, task);

      const result = await this.executeTask(task, options);

      if (result.ok) {
        return ok({ response: result.value, retryCount: retryContext.attempt - 1 });
      }

      const error = result.error;
      retryContext = { ...retryContext, lastError: error };

      // Record failure with circuit breaker
      if (this.circuitBreaker !== null) {
        this.circuitBreaker.recordFailure(this.categorizeError(error));
      }

      // Check if error is retryable
      if (!this.shouldRetry(error, retryContext)) {
        return err(error);
      }

      // Calculate and apply backoff delay
      const delayMs = this.calculateBackoffDelay(retryContext.attempt);
      retryContext = { ...retryContext, totalDelayMs: retryContext.totalDelayMs + delayMs };

      this.logRetryDelay(retryContext, delayMs);
      await this.delay(delayMs);
    }

    return err(retryContext.lastError ?? this.createError('UNKNOWN', 'Max retries exceeded'));
  }

  private shouldRetry(error: CliError, context: RetryContext): boolean {
    // Don't retry if we've exhausted attempts
    if (context.attempt >= context.maxAttempts) {
      return false;
    }

    // Don't retry terminal errors
    if (!error.retryable) {
      return false;
    }

    // Don't retry if circuit breaker is open
    if (this.circuitBreaker?.getState() === 'open') {
      return false;
    }

    // Retry timeouts, rate limits, and connection errors
    const retryableCodes = ['TIMEOUT', 'RATE_LIMITED', 'CONNECTION_ERROR'];
    return retryableCodes.includes(error.code);
  }

  private calculateBackoffDelay(attempt: number): number {
    // Exponential backoff with jitter
    const exponentialDelay = this.baseDelayMs * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.3 * exponentialDelay;
    const delay = exponentialDelay + jitter;

    return Math.min(delay, this.maxDelayMs);
  }

  private categorizeError(
    error: CliError
  ): 'timeout' | 'rate_limit' | 'authentication' | 'connection' | 'unknown' {
    switch (error.code) {
      case 'TIMEOUT':
        return 'timeout';
      case 'RATE_LIMITED':
        return 'rate_limit';
      case 'NOT_AUTHENTICATED':
        return 'authentication';
      case 'CONNECTION_ERROR':
        return 'connection';
      default:
        return 'unknown';
    }
  }

  // -------------------------------------------------------------------------
  // Private Methods - Logging
  // -------------------------------------------------------------------------

  private logRetryAttempt(context: RetryContext, task: CliTask): void {
    if (context.attempt === 1) {
      this.adapterLogger.debug('Executing Gemini task', {
        contentLength: task.content.length,
        model: task.model ?? this.model,
      });
    } else {
      this.adapterLogger.info('Retrying Gemini task', {
        attempt: context.attempt,
        maxAttempts: context.maxAttempts,
        lastError: context.lastError?.code,
      });
    }
  }

  private logRetryDelay(context: RetryContext, delayMs: number): void {
    this.adapterLogger.debug('Backoff delay before retry', {
      attempt: context.attempt,
      delayMs: Math.round(delayMs),
      totalDelayMs: Math.round(context.totalDelayMs),
    });
  }

  // -------------------------------------------------------------------------
  // Private Methods - Model Info
  // -------------------------------------------------------------------------

  private getModelDisplayName(): string {
    const displayNames: Record<string, string> = {
      'gemini-2.5-pro': 'Gemini 2.5 Pro',
      'gemini-2.5-flash': 'Gemini 2.5 Flash',
      'gemini-2.5-flash-lite': 'Gemini 2.5 Flash Lite',
    };

    return displayNames[this.model] ?? this.model;
  }

  private getContextWindow(): number {
    const contextWindows: Record<string, number> = {
      'gemini-2.5-pro': 1_000_000,
      'gemini-2.5-flash': 1_000_000,
      'gemini-2.5-flash-lite': 1_000_000,
    };

    return contextWindows[this.model] ?? 1_000_000;
  }

  private getCostPerMillionInput(): number {
    const costs: Record<string, number> = {
      'gemini-2.5-pro': 1.25,
      'gemini-2.5-flash': 0.075,
      'gemini-2.5-flash-lite': 0.015,
    };

    return costs[this.model] ?? 0.075;
  }

  private getCostPerMillionOutput(): number {
    const costs: Record<string, number> = {
      'gemini-2.5-pro': 10.0,
      'gemini-2.5-flash': 0.3,
      'gemini-2.5-flash-lite': 0.06,
    };

    return costs[this.model] ?? 0.3;
  }

  // -------------------------------------------------------------------------
  // Private Methods - Error Handling
  // -------------------------------------------------------------------------

  private createCircuitOpenError(): CliError {
    return {
      code: 'EXECUTION_ERROR',
      message: 'Circuit breaker is open - Gemini CLI temporarily unavailable',
      cli: 'gemini',
      retryable: false,
    };
  }

  protected override delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Creates an enhanced Gemini CLI adapter with improved reliability.
 */
export function createEnhancedGeminiAdapter(
  config?: EnhancedGeminiConfig
): EnhancedGeminiCliAdapter {
  return new EnhancedGeminiCliAdapter(config);
}
