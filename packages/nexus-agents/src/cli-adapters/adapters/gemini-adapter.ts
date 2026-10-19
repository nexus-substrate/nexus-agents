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

import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
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
import { createCallerInputCliError } from '../cli-error-helpers.js';
import { withEnforcedAccessMode, isReadOnlyAnalysis, accessModeConflict } from '../access-mode.js';
import {
  createBwrapPreflight,
  type BwrapIsolation,
  BWRAP_READ_ONLY_ARGS,
} from '../codex-sandbox-preflight.js';
import { AgyResponseParser } from '../parsers/agy-parser.js';
import { toAgyModelSlug, fromAgyModelSlug, AGY_MODEL_SLUGS } from '../../config/agy-model-map.js';
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
import { GEMINI_CLI_COMMAND } from '../cli-error-envelope.js';
import { DEFAULT_GEMINI_CLI_MODEL, agyPrintTimeoutArgs } from './agy-invocation.js';
import {
  buildModelInfo,
  getCliModelName,
  resolveCliAlias,
} from '../../config/model-config-helpers.js';

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
  /** Injectable bwrap sandbox probe for read-only analysis mode */
  readonly sandboxProbe?: () => Promise<BwrapIsolation>;
  /** Platform override for sandbox behavior (defaults to process.platform) */
  readonly platform?: NodeJS.Platform;
}

/** Execution result with metadata. */
export interface GeminiExecutionResult {
  readonly response: CliResponse;
  readonly retryCount: number;
  readonly totalDurationMs: number;
  readonly complexity: TaskComplexity;
  readonly circuitState: 'closed' | 'open' | 'half-open';
}

const DEFAULT_CONFIG: Required<
  Omit<GeminiConfig, 'logger' | 'circuitBreakerConfig' | 'sandboxProbe' | 'platform'>
> = {
  model: DEFAULT_GEMINI_CLI_MODEL,
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  enableCircuitBreaker: true,
};

/**
 * The executable name spawned by the Gemini CLI adapter (#4346, #6278).
 * The standalone gemini CLI is EOL — it exits 55 with IneligibleTierError on
 * every invocation.
 */
export { GEMINI_CLI_COMMAND };

function resolveWorkDir(task: CliTask): string {
  const rawWorkDir = task.options?.['workDir'];
  return typeof rawWorkDir === 'string' && rawWorkDir !== '' ? rawWorkDir : process.cwd();
}

function resolvePromptContent(task: CliTask): string {
  return task.systemPrompt !== undefined && task.systemPrompt !== ''
    ? `${task.systemPrompt}\n\n${task.content}`
    : task.content;
}

function buildBwrapArgs(binaryName: string, agyArgs: readonly string[], workDir: string): string[] {
  const resolvedWorkDir = existsSync(workDir) ? realpathSync(workDir) : path.resolve(workDir);
  const bwrapArgs: string[] = [...BWRAP_READ_ONLY_ARGS, '--bind', '/tmp', '/tmp'];
  const customConfig = process.env['ANTIGRAVITY_CONFIG_DIR'];
  const home = process.env['HOME'];
  const configDir =
    customConfig !== undefined && customConfig !== ''
      ? customConfig
      : home !== undefined && home !== ''
        ? path.join(home, '.gemini', 'antigravity-cli')
        : undefined;
  if (configDir !== undefined && existsSync(configDir)) {
    bwrapArgs.push('--bind', configDir, configDir);
  }
  bwrapArgs.push('--ro-bind', resolvedWorkDir, resolvedWorkDir);
  if (resolvedWorkDir !== workDir && existsSync(workDir)) {
    bwrapArgs.push('--ro-bind', workDir, workDir);
  }
  bwrapArgs.push('--', binaryName, ...agyArgs);
  return bwrapArgs;
}

/**
 * Gemini CLI adapter with reliability features.
 *
 * Includes tiered timeouts, resilient parsing, retry logic, and circuit breaker.
 */
export class GeminiCliAdapter extends SubprocessCliAdapter {
  readonly name: CliName = 'gemini';
  /**
   * Gemini enforces read-only analysis via the bubblewrap (bwrap) Linux sandbox (#6962).
   * Kernel-level filesystem isolation mounts root and workDir as read-only.
   */
  override readonly enforcesReadOnlyAnalysis = true;

  /**
   * #4346: the arm is still called `gemini` (it serves Google's Gemini models
   * and keeps the routing/LinUCB identity), but the executable is `agy`. The
   * standalone gemini CLI is EOL — it exits 55 with IneligibleTierError on
   * every invocation.
   */
  override get binaryName(): string {
    return GEMINI_CLI_COMMAND;
  }
  protected readonly parser: ICliResponseParser;

  private readonly model: string;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly circuitBreaker: CliCircuitBreaker | null;
  private readonly adapterLogger: ILogger;
  private readonly sandboxProbe: () => Promise<BwrapIsolation>;
  private readonly platform: NodeJS.Platform;

  constructor(options?: GeminiConfig) {
    const mergedConfig = { ...DEFAULT_CONFIG, ...options };
    super(options?.logger);

    this.model = mergedConfig.model;
    this.maxRetries = mergedConfig.maxRetries;
    this.baseDelayMs = mergedConfig.baseDelayMs;
    this.maxDelayMs = mergedConfig.maxDelayMs;
    this.parser = new AgyResponseParser();
    this.adapterLogger = options?.logger ?? createLogger({ component: 'gemini-adapter' });
    this.platform = options?.platform ?? process.platform;
    this.sandboxProbe = options?.sandboxProbe ?? createBwrapPreflight(undefined, this.platform);

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
    // Describe a supported migrated selection honestly; unsupported configured
    // models retain their requested descriptor but are refused at execution.
    let selected = this.model;
    try {
      const canonical = fromAgyModelSlug(toAgyModelSlug(this.model));
      const resolved = canonical === null ? undefined : resolveCliAlias(canonical);
      if (resolved !== undefined) selected = getCliModelName(resolved);
    } catch {
      /* No selection: execution returns a non-retryable refusal. */
    }
    const fromRegistry = buildModelInfo('gemini', selected);
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
      // #6792: this path bypasses the base execute, so it stamps the mode too.
      return ok(withEnforcedAccessMode(result.value.response, task));
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
    // #6754: this path bypasses the base execute, so it applies the same
    // fail-closed access-mode check first.
    const refusal = await this.accessModeRefusal(task);
    if (refusal !== undefined) return err(refusal);
    try {
      toAgyModelSlug(task.model ?? this.model);
    } catch (error: unknown) {
      return err(
        createCallerInputCliError(
          error instanceof Error ? error.message : 'Unsupported AGY model',
          'gemini'
        )
      );
    }
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
   * Refuse read-only analysis if bwrap sandbox is unavailable on the host.
   */
  protected override async accessModeRefusal(task: CliTask): Promise<CliError | undefined> {
    const base = await super.accessModeRefusal(task);
    if (base !== undefined) return base;
    if (isReadOnlyAnalysis(task)) {
      const isolation = await this.sandboxProbe();
      if (isolation.mode !== 'os-sandbox') {
        return accessModeConflict(
          this.name,
          'read-only-analysis',
          `bubblewrap (bwrap) sandbox is unavailable: ${isolation.reason ?? 'bwrap requires Linux with kernel unprivileged user namespaces'}`
        );
      }
    }
    return undefined;
  }

  /**
   * Gets CLI command and arguments for execution.
   */
  protected override getCommand(task: CliTask): CommandConfig {
    const args: string[] = ['--output-format', 'json'];

    const requested = task.model ?? this.model;
    const model = toAgyModelSlug(requested);
    if (model !== requested) {
      this.adapterLogger.debug('Substituted an agy model slug', { requested, model });
    }
    args.push('--model', model);

    if (task.sessionId !== undefined && task.sessionId !== '') {
      args.push('--conversation', task.sessionId);
    }

    const workDir = resolveWorkDir(task);
    args.push('--add-dir', workDir);
    args.push(...agyPrintTimeoutArgs(task.timeoutMs));

    const content = resolvePromptContent(task);

    if (isReadOnlyAnalysis(task)) {
      return {
        command: 'bwrap',
        args: buildBwrapArgs(this.binaryName, args, workDir),
        stdin: content,
      };
    }

    return { command: this.binaryName, args, stdin: content };
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
