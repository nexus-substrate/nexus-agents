/**
 * nexus-agents/cli-adapters - Gemini CLI Adapter
 *
 * Subprocess-based adapter for Gemini CLI with:
 * - Tiered timeout profiles based on task complexity
 * - Resilient JSON parsing with fallback strategies
 * - Exponential backoff retry logic
 * - Circuit breaker integration for sustained failures
 *
 * (Source: cli-project_plan.md v2.1.0)
 * (Source: Issue #366 - Gemini CLI timeout and parser improvements)
 * (Source: Issue #389 - Merged enhanced adapter back to canonical)
 */

import type { Result, ILogger } from '../../core/index.js';
import { ok, err, createLogger, getTimeProvider } from '../../core/index.js';
import type {
  ICliResponseParser,
  CliTask,
  CliResponse,
  CliError,
  ModelInfo,
  CliName,
  ExecutionOptions,
  BaseAdapterOptions,
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
import {
  GEMINI_LEGACY_DEFAULTS,
  calculateBackoffDelay,
  isRetryableError,
  categorizeError,
  createCircuitOpenError,
  delay,
} from './gemini-adapter-helpers.js';
import {
  DEFAULT_MODEL_PER_CLI,
  DEFAULT_MODEL_CAPABILITIES,
} from '../../config/model-capabilities.js';
import { buildModelInfo } from '../../config/model-config-helpers.js';

/** Derive the CLI model name for the default Gemini model from the canonical registry. */
const DEFAULT_GEMINI_CLI_MODEL: string =
  DEFAULT_MODEL_CAPABILITIES.models.find((m) => m.id === DEFAULT_MODEL_PER_CLI.gemini)
    ?.cliModelName ?? DEFAULT_MODEL_PER_CLI.gemini;

/** Configuration for Gemini adapter. Extends BaseAdapterOptions with retry/circuit breaker. */
export interface GeminiConfig extends BaseAdapterOptions {
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
export interface GeminiExecutionResult {
  readonly response: CliResponse;
  readonly retryCount: number;
  readonly totalDurationMs: number;
  readonly complexity: TaskComplexity;
  readonly circuitState: 'closed' | 'open' | 'half-open';
}

const DEFAULT_CONFIG: Required<Omit<GeminiConfig, 'logger' | 'circuitBreakerConfig'>> = {
  model: DEFAULT_GEMINI_CLI_MODEL,
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  enableCircuitBreaker: true,
};

/**
 * Gemini CLI adapter with reliability features.
 *
 * Includes tiered timeouts, resilient parsing, retry logic, and circuit breaker.
 */
export class GeminiCliAdapter extends SubprocessCliAdapter {
  readonly name: CliName = 'gemini';
  protected readonly parser: ICliResponseParser;

  private readonly model: string;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly circuitBreaker: CliCircuitBreaker | null;
  private readonly adapterLogger: ILogger;

  constructor(options?: GeminiConfig) {
    const mergedConfig = { ...DEFAULT_CONFIG, ...options };
    super(options?.logger);

    this.model = mergedConfig.model;
    this.maxRetries = mergedConfig.maxRetries;
    this.baseDelayMs = mergedConfig.baseDelayMs;
    this.maxDelayMs = mergedConfig.maxDelayMs;
    this.parser = new ResilientGeminiParser();
    this.adapterLogger = options?.logger ?? createLogger({ component: 'gemini-adapter' });

    // Initialize circuit breaker if enabled
    if (mergedConfig.enableCircuitBreaker) {
      const cbConfig: CircuitBreakerConfig = {
        ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
        ...options?.circuitBreakerConfig,
      };
      this.circuitBreaker = new CliCircuitBreaker('gemini', cbConfig);
    } else {
      this.circuitBreaker = null;
    }
  }

  /**
   * Gets Gemini model information.
   * Resolves from canonical registry when possible, falls back to legacy lookup.
   * Note: maxOutput is capped at 8_192 (Gemini CLI constraint).
   */
  getModelInfo(): ModelInfo {
    const fromRegistry = buildModelInfo('gemini', this.model);
    if (fromRegistry !== undefined) {
      return { ...fromRegistry, maxOutput: 8_192 };
    }
    return {
      id: this.model,
      name: GEMINI_LEGACY_DEFAULTS.displayNames[this.model] ?? this.model,
      contextWindow:
        GEMINI_LEGACY_DEFAULTS.contextWindows[this.model] ?? GEMINI_LEGACY_DEFAULTS.contextWindow,
      maxOutput: 8_192,
      costPerMillionInput:
        GEMINI_LEGACY_DEFAULTS.inputCosts[this.model] ?? GEMINI_LEGACY_DEFAULTS.inputCost,
      costPerMillionOutput:
        GEMINI_LEGACY_DEFAULTS.outputCosts[this.model] ?? GEMINI_LEGACY_DEFAULTS.outputCost,
    };
  }

  /**
   * Executes a task with reliability features.
   */
  override async execute(
    task: CliTask,
    options?: ExecutionOptions
  ): Promise<Result<CliResponse, CliError>> {
    const result = await this.executeWithMetadata(task, options);

    if (result.ok) {
      return ok(result.value.response);
    }

    return err(result.error);
  }

  /**
   * Executes with full metadata about retry attempts and circuit state.
   */
  async executeWithMetadata(
    task: CliTask,
    options?: ExecutionOptions
  ): Promise<Result<GeminiExecutionResult, CliError>> {
    const circuitCheckResult = this.checkCircuitBreaker();
    if (circuitCheckResult !== null) {
      return err(circuitCheckResult);
    }

    const startTime = getTimeProvider().now();
    const complexity = estimateTaskComplexity(task.content);
    const effectiveOptions = this.buildExecutionOptions(task.content, options);

    const result = await this.executeWithRetryTracking(task, effectiveOptions);

    return this.buildExecutionResult(result, startTime, complexity);
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

    // Note: Sandbox mode (-s) removed - causes npm permission issues
    // and "rebuilt dependencies successfully" contamination

    return { command: 'gemini', args };
  }

  private checkCircuitBreaker(): CliError | null {
    if (this.circuitBreaker === null) {
      return null;
    }
    if (this.circuitBreaker.getState() === 'open') {
      return createCircuitOpenError('gemini');
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
      onProgress: options?.onProgress,
    };
  }

  private buildExecutionResult(
    result: Result<{ response: CliResponse; retryCount: number }, CliError>,
    startTime: number,
    complexity: TaskComplexity
  ): Result<GeminiExecutionResult, CliError> {
    const totalDurationMs = getTimeProvider().now() - startTime;
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

  private async executeWithRetryTracking(
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
        this.circuitBreaker.recordFailure(categorizeError(error));
      }

      // Check if error is retryable
      if (!this.shouldRetry(error, retryContext)) {
        return err(error);
      }

      // Calculate and apply backoff delay
      const delayMs = calculateBackoffDelay(
        retryContext.attempt,
        this.baseDelayMs,
        this.maxDelayMs
      );
      retryContext = { ...retryContext, totalDelayMs: retryContext.totalDelayMs + delayMs };

      this.logRetryDelay(retryContext, delayMs);
      await delay(delayMs);
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
    return isRetryableError(error.code);
  }

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
}

/** Creates a Gemini CLI adapter with reliability features. */
export function createGeminiAdapter(options?: GeminiConfig): GeminiCliAdapter {
  return new GeminiCliAdapter(options);
}
