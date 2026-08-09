/**
 * nexus-agents/cli-adapters - Base Adapter
 *
 * Abstract base class for CLI adapters with common functionality.
 * Provides version checking, health checks, and error handling.
 *
 * SubprocessCliAdapter extracted to subprocess-adapter.ts per Issue #272.
 *
 * (Source: cli-project_plan.md v2.1.0)
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import semver from 'semver';
import { CLI_SUBPROCESS_TIMEOUTS } from '../config/timeouts.js';

import type { Result } from '../core/index.js';
import { getTimeProvider } from '../core/index.js';
import type { ILogger } from '../core/index.js';
import { createLogger } from '../core/index.js';

import type {
  ICliAdapter,
  CliName,
  CliTransport,
  CliTask,
  CliResponse,
  CliError,
  CliErrorCode,
  HealthStatus,
  CapacityStatus,
  ModelInfo,
  CapabilityProfile,
  ExecutionOptions,
  ResolvedExecutionOptions,
  VersionStatus,
  TokenUsage,
} from './types.js';
import { CLI_VERSION_REQUIREMENTS, DEFAULT_CAPABILITIES } from './types.js';
import { getTimeoutForTaskAuto } from './cli-timeout-profiles.js';
import { CapacityTracker, createCapacityTracker } from './capacity-tracker.js';
import { executeCliRetryLoop } from './cli-retry-loop.js';
import { getDefaultCliCircuitBreakerRegistry } from './cli-circuit-breaker.js';
import { parseRetryAfterMs } from '../adapters/rate-limit-detector.js';

const execAsync = promisify(exec);

/**
 * Default execution options.
 *
 * Timeout reduced from 120s to 60s per Issue #280 to prevent
 * cascading timeouts in multi-agent voting scenarios.
 */
const DEFAULT_OPTIONS: ResolvedExecutionOptions = {
  timeoutMs: 60_000, // 1 minute (reduced from 2 minutes per Issue #280)
  allowRetry: true,
  maxRetries: 1, // Reduced from 2 to prevent 3+ minute total wait
  trackUsage: true,
  onProgress: undefined,
};

/**
 * Abstract base class for CLI adapters.
 * Provides common functionality for version checking, health, and error handling.
 */
export abstract class BaseCliAdapter implements ICliAdapter {
  abstract readonly name: CliName;
  abstract readonly transport: CliTransport;

  protected readonly logger: ILogger;
  protected capacityTracker: CapacityTracker | null = null;
  protected initialized = false;
  protected lastHealthCheck?: HealthStatus;
  protected cachedVersion?: string;

  constructor(logger?: ILogger) {
    this.logger = logger ?? createLogger({ component: 'cli-adapter' });
  }

  /**
   * Initializes the capacity tracker.
   * Called by subclasses after name is set.
   */
  protected initCapacityTracker(): void {
    this.capacityTracker = createCapacityTracker(this.name);
  }

  /**
   * Gets the capability profile for this CLI.
   */
  get capabilities(): CapabilityProfile {
    return DEFAULT_CAPABILITIES[this.name];
  }

  /**
   * Abstract method for executing a task.
   * Implemented by concrete adapters.
   */
  abstract executeTask(
    task: CliTask,
    options: ResolvedExecutionOptions
  ): Promise<Result<CliResponse, CliError>>;

  /**
   * Abstract method for getting model info.
   * Implemented by concrete adapters.
   */
  abstract getModelInfo(): ModelInfo;

  /**
   * Abstract method for initialization.
   * Implemented by concrete adapters.
   */
  abstract initialize(): Promise<void>;

  /**
   * Abstract method for cleanup.
   * Implemented by concrete adapters.
   */
  abstract dispose(): Promise<void>;

  /**
   * Executes a task with error handling and retries.
   *
   * Timeout priority (highest to lowest):
   * 1. options.timeoutMs - explicit execution option
   * 2. task.timeoutMs - task-level setting
   * 3. getTimeoutForTaskAuto() - computed from task complexity and CLI
   */
  async execute(task: CliTask, options?: ExecutionOptions): Promise<Result<CliResponse, CliError>> {
    const effectiveTimeout = this.computeTimeout(task, options);
    const opts = { ...DEFAULT_OPTIONS, ...options, timeoutMs: effectiveTimeout };

    if (!this.initialized) {
      await this.initialize();
    }

    this.logger.debug('Executing task', {
      cli: this.name,
      contentLength: task.content.length,
      model: task.model,
      timeoutMs: effectiveTimeout,
    });

    return this.executeWithRetry(task, opts);
  }

  /**
   * Computes effective timeout for a task.
   */
  private computeTimeout(task: CliTask, options?: ExecutionOptions): number {
    if (options?.timeoutMs !== undefined) return options.timeoutMs;
    if (task.timeoutMs !== undefined) return task.timeoutMs;
    return getTimeoutForTaskAuto(this.name, task.content);
  }

  /**
   * Whether the shared outer retry loop ({@link executeCliRetryLoop}) is
   * allowed to retry this adapter's failures. The base adapter honors the
   * caller's `allowRetry`. Subprocess adapters override this to suppress
   * the outer loop when their own transient-retry layer is active, so the
   * two layers do not nest into multiplied spawns (#2824).
   */
  protected shouldOuterRetry(opts: ResolvedExecutionOptions): boolean {
    return opts.allowRetry;
  }

  /**
   * Executes task with retry logic via shared retry loop.
   */
  private async executeWithRetry(
    task: CliTask,
    opts: ResolvedExecutionOptions
  ): Promise<Result<CliResponse, CliError>> {
    // #4330: this used to pass no breaker, which made the `recordFailure` in
    // `executeCliRetryLoop` unreachable for every subprocess CLI. The voter
    // serving-gate reads exactly this registry, so a quota-dead CLI's snapshot
    // stayed `undefined` and the gate fail-opened on every panel — #4325's
    // exclusion could never fire because nothing produced the signal.
    const circuitBreaker = getDefaultCliCircuitBreakerRegistry().getBreaker(this.name);
    const result = await executeCliRetryLoop(() => this.executeTask(task, opts), {
      maxRetries: opts.maxRetries,
      allowRetry: this.shouldOuterRetry(opts),
      baseDelayMs: 1_000,
      maxDelayMs: 16_000,
      circuitBreaker,
      cli: this.name,
      logger: this.logger,
    });

    if (result.ok) {
      // Recording the success is the caller's job (`executeCliRetryLoop` only
      // records failures — see its test), and it matters: in the closed state
      // `recordSuccess` zeroes the failure count, which is what makes the
      // threshold mean "consecutive failures". Without it a long-lived process
      // accumulates scattered blips and eventually evicts a healthy CLI.
      circuitBreaker.recordSuccess();
      this.recordUsage(result.value.response);
      this.logger.info('Task executed successfully', {
        cli: this.name,
        attempt: result.value.retryCount + 1,
        durationMs: result.value.response.durationMs,
        tokensUsed: result.value.response.usage?.totalTokens,
      });
      return { ok: true, value: result.value.response };
    }

    this.logger.warn('Task execution failed', {
      cli: this.name,
      error: result.error.message,
      retryable: result.error.retryable,
    });
    return result;
  }

  /**
   * Performs a health check.
   */
  async healthCheck(): Promise<HealthStatus> {
    try {
      const version = await this.getVersion();
      const versionStatus = this.checkVersionCompatibility(version);

      const message = this.getVersionMessage(versionStatus, version);
      const status: HealthStatus = {
        healthy: versionStatus !== 'unsupported' && versionStatus !== 'breaking',
        version,
        versionStatus,
        lastChecked: new Date(getTimeProvider().now()),
        ...(message !== undefined && { message }),
      };

      this.lastHealthCheck = status;
      return status;
    } catch (error) {
      return {
        healthy: false,
        version: 'unknown',
        versionStatus: 'unsupported',
        message: error instanceof Error ? error.message : 'Health check failed',
        lastChecked: new Date(getTimeProvider().now()),
      };
    }
  }

  /**
   * Gets CLI version.
   */
  async getVersion(): Promise<string> {
    if (this.cachedVersion !== undefined && this.cachedVersion !== '') {
      return this.cachedVersion;
    }

    try {
      const { stdout } = await execAsync(`${this.name} --version`, {
        timeout: CLI_SUBPROCESS_TIMEOUTS.spawnMs,
      });

      // Extract version number from output
      const version = this.parseVersion(stdout.trim());
      this.cachedVersion = version;
      return version;
    } catch (cause: unknown) {
      throw new Error(`Failed to get ${this.name} version`, { cause });
    }
  }

  /**
   * Gets current capacity status based on tracked usage.
   * Uses usage-based tracking since CLI subprocess execution
   * doesn't expose HTTP rate limit headers.
   *
   * @see Issue #456 - Real API rate limit tracking
   */
  getCapacity(): Promise<CapacityStatus> {
    // Lazy-init the tracker if no caller has run initialize() yet (#2714).
    // Pre-fix every doctor invocation tripped this path: doctor calls
    // adapter.getCapacity() WITHOUT first calling adapter.initialize(),
    // so each of the four adapters logged a "Capacity tracker uninitialized"
    // WARN and returned a hardcoded 100k-token fallback. The fallback
    // surfaced in doctor's output as "Capacity: 100% remaining" — a
    // fictional reading, not a real one. The tracker is per-process and
    // idempotent under createCapacityTracker, so initializing on first
    // read is safe.
    if (this.capacityTracker === null) {
      this.initCapacityTracker();
    }
    const tracker = this.capacityTracker;
    if (tracker === null) {
      // Unreachable in practice — initCapacityTracker assigns the field —
      // but keep the type-safe path for the impossible case.
      throw new Error(`Capacity tracker initialization failed for ${this.name}`);
    }
    return Promise.resolve(tracker.getCapacity());
  }

  /**
   * Records usage from a response for capacity tracking.
   */
  protected recordUsage(response: CliResponse): void {
    if (this.capacityTracker !== null) {
      this.capacityTracker.recordUsage(response.usage);
    }
  }

  /**
   * Parses version from CLI output.
   */
  protected parseVersion(output: string): string {
    // Handle common version formats:
    // "2.0.76 (Claude Code)"
    // "0.22.5"
    // "codex-cli 0.77.0"
    const match = /(\d+\.\d+\.\d+)/.exec(output);
    return match?.[1] ?? '0.0.0';
  }

  /**
   * Checks version compatibility.
   */
  protected checkVersionCompatibility(version: string): VersionStatus {
    const requirements = CLI_VERSION_REQUIREMENTS[this.name];

    const validVersion = semver.valid(version);
    if (validVersion === null) {
      return 'unsupported';
    }

    const isLtMinimum = semver.lt(validVersion, requirements.minimum);
    if (isLtMinimum) {
      return 'unsupported';
    }

    const hasBreaking = requirements.breaking.some((v) => semver.gte(validVersion, v));
    if (hasBreaking) {
      return 'breaking';
    }

    const isLtRecommended = semver.lt(validVersion, requirements.recommended);
    if (isLtRecommended) {
      return 'outdated';
    }

    return 'supported';
  }

  /**
   * Gets version status message.
   */
  protected getVersionMessage(status: VersionStatus, version: string): string | undefined {
    const requirements = CLI_VERSION_REQUIREMENTS[this.name];

    switch (status) {
      case 'unsupported':
        return `Version ${version} is not supported. Minimum: ${requirements.minimum}`;
      case 'breaking':
        return `Version ${version} has known compatibility issues`;
      case 'outdated':
        return `Consider upgrading to ${requirements.recommended}`;
      case 'supported':
        return undefined;
    }
  }

  /**
   * Creates a CLI error.
   */
  protected createError(code: CliErrorCode, message: string, cause?: Error): CliError {
    const retryable = ['RATE_LIMITED', 'TIMEOUT', 'CONNECTION_ERROR'].includes(code);
    // #4373: `parseRetryAfterMs` existed with regexes for "retry after Xs" /
    // "try again in Xs" and was called from nowhere under cli-adapters, so a
    // provider telling us exactly how long to wait was ignored in favour of our
    // own exponential backoff. Only meaningful on a retryable error.
    const retryAfterMs = retryable ? parseRetryAfterMs(message) : undefined;

    return {
      code,
      message,
      cli: this.name,
      retryable,
      ...(retryAfterMs !== undefined && { retryAfterMs }),
      ...(cause !== undefined && { cause }),
    };
  }

  /**
   * Normalizes CLI response to common format.
   */
  protected normalizeResponse(
    text: string,
    usage?: TokenUsage,
    extra?: Partial<CliResponse>
  ): CliResponse {
    return {
      text,
      ...(usage !== undefined && { usage }),
      ...extra,
    };
  }

  /**
   * Delays for the specified milliseconds.
   */
  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
