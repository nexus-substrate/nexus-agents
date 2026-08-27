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
  ResolvedExecutionOptions,
  BaseAdapterOptions,
} from '../types.js';
import { SubprocessCliAdapter, type CommandConfig } from '../subprocess-adapter.js';
import { AgyResponseParser } from '../parsers/agy-parser.js';
import { toAgyModelSlug, AGY_MODEL_SLUGS } from '../../config/agy-model-map.js';
import type { CliModelInfo } from '../types-capability.js';
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
import { GEMINI_LEGACY_DEFAULTS, createCircuitOpenError } from './gemini-adapter-helpers.js';
import { executeCliRetryLoop } from '../cli-retry-loop.js';
import {
  buildModelInfo,
  getCliModelName,
  getDefaultModelForCli,
} from '../../config/model-config-helpers.js';

/** Derive the CLI model name for the default Gemini model from the canonical registry. */
const DEFAULT_GEMINI_CLI_MODEL: string = getCliModelName(getDefaultModelForCli('gemini'));

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

  /**
   * #4346: the arm is still called `gemini` (it serves Google's Gemini models
   * and keeps the routing/LinUCB identity), but the executable is `agy`. The
   * standalone gemini CLI is EOL — it exits 55 with IneligibleTierError on
   * every invocation.
   */
  override get binaryName(): string {
    return 'agy';
  }
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
    this.parser = new AgyResponseParser();
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

  /** Key-free model enumeration via the models.dev snapshot (#3405). */
  /**
   * The slugs this arm can actually run (#5085).
   *
   * NOT `listModelsForCli('gemini')`, which resolves the models.dev `google`
   * vendor — 82 Google **API** ids like `gemini-2.5-flash`. This arm spawns
   * `agy`, which accepts none of them; the same reasoning already documented
   * for `cliModelName` in `config/agy-model-map.ts` applies to enumeration.
   * Reporting the API list made every consumer confidently wrong rather than
   * empty, which is worse.
   */
  listModels(): Promise<readonly CliModelInfo[]> {
    return Promise.resolve(AGY_MODEL_SLUGS.map((id) => ({ id, provider: 'antigravity' })));
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

    // #4346: the standalone `gemini` CLI is retired — it fails every invocation
    // with IneligibleTierError (exit 55). `agy` (Antigravity) is Google's own
    // replacement. Flag spellings differ entirely from the old CLI:
    //   -o json      -> --output-format json
    //   -m <model>   -> --model <slug>
    //   --resume     -> --conversation
    //   --policy     -> (no equivalent; see systemPrompt handling below)
    args.push('--output-format', 'json');

    // Registry model ids and agy slugs are different namespaces — see
    // config/agy-model-map.ts for why `cliModelName` cannot carry the agy slug.
    // An unmapped id would make agy return status:ERROR with exit code 0, so the
    // resolver substitutes a valid slug rather than letting that happen.
    const requested = task.model ?? this.model;
    const model = toAgyModelSlug(requested);
    if (model !== requested) {
      this.adapterLogger.debug('Substituted an agy model slug', { requested, model });
    }
    args.push('--model', model);

    if (task.sessionId !== undefined && task.sessionId !== '') {
      args.push('--conversation', task.sessionId);
    }

    // agy has no system-prompt flag. The old CLI's `--policy <file>` preserved
    // system-role framing (#1886); agy offers only `--agent`, which selects a
    // preconfigured agent rather than accepting inline instructions. So the
    // system prompt is prepended to the user content — a deliberate downgrade
    // in framing fidelity, recorded here so it is not mistaken for an
    // oversight. No temp file is written, which also removes the tempdir-leak
    // surface the old path had.
    const content =
      task.systemPrompt !== undefined && task.systemPrompt !== ''
        ? `${task.systemPrompt}\n\n${task.content}`
        : task.content;

    // --print LAST with an explicit value. agy accepts flags in any order, but
    // a valueless --print consumes whatever token follows it, so the prompt is
    // always passed as its argument rather than positionally.
    args.push('--print', content);

    return { command: this.binaryName, args };
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
  ): ResolvedExecutionOptions {
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
    options: ResolvedExecutionOptions
  ): Promise<Result<{ response: CliResponse; retryCount: number }, CliError>> {
    return executeCliRetryLoop(() => this.executeTask(task, options), {
      maxRetries: options.maxRetries,
      allowRetry: this.shouldOuterRetry(options),
      baseDelayMs: this.baseDelayMs,
      maxDelayMs: this.maxDelayMs,
      circuitBreaker: this.circuitBreaker,
      cli: this.name,
      logger: this.adapterLogger,
    });
  }
}

/** Creates a Gemini CLI adapter with reliability features. */
export function createGeminiAdapter(options?: GeminiConfig): GeminiCliAdapter {
  return new GeminiCliAdapter(options);
}
