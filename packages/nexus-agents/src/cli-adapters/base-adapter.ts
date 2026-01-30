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

import type { Result } from '../core/index.js';
import { err, getTimeProvider } from '../core/index.js';
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
  VersionStatus,
  TokenUsage,
} from './types.js';
import { CLI_VERSION_REQUIREMENTS, DEFAULT_CAPABILITIES } from './types.js';
import { getTimeoutForTaskAuto } from './cli-timeout-profiles.js';
import { CapacityTracker, createCapacityTracker } from './capacity-tracker.js';

const execAsync = promisify(exec);

/**
 * Default execution options.
 *
 * Timeout reduced from 120s to 60s per Issue #280 to prevent
 * cascading timeouts in multi-agent voting scenarios.
 */
const DEFAULT_OPTIONS: Required<ExecutionOptions> = {
  timeoutMs: 60_000, // 1 minute (reduced from 2 minutes per Issue #280)
  allowRetry: true,
  maxRetries: 1, // Reduced from 2 to prevent 3+ minute total wait
  trackUsage: true,
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
    options: Required<ExecutionOptions>
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
   * Executes task with retry logic.
   */
  private async executeWithRetry(
    task: CliTask,
    opts: Required<ExecutionOptions>
  ): Promise<Result<CliResponse, CliError>> {
    let lastError: CliError | undefined;
    const maxAttempts = opts.allowRetry ? opts.maxRetries + 1 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await this.executeTask(task, opts);

      if (result.ok) {
        this.recordUsage(result.value);
        this.logger.info('Task executed successfully', {
          cli: this.name,
          attempt,
          durationMs: result.value.durationMs,
          tokensUsed: result.value.usage?.totalTokens,
        });
        return result;
      }

      lastError = result.error;

      if (this.isTerminalAttempt(result.error, attempt, maxAttempts)) {
        this.logger.warn('Task execution failed', {
          cli: this.name,
          attempt,
          error: result.error.message,
          retryable: result.error.retryable,
        });
        return result;
      }

      this.logger.debug('Retrying task execution', {
        cli: this.name,
        attempt,
        nextAttempt: attempt + 1,
      });

      await this.delay(Math.pow(2, attempt) * 1000);
    }

    return err(lastError ?? this.createError('UNKNOWN', 'Unknown error'));
  }

  /**
   * Checks if this attempt should be the final one.
   */
  private isTerminalAttempt(error: CliError, attempt: number, maxAttempts: number): boolean {
    return !error.retryable || attempt === maxAttempts;
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
        timeout: 10_000,
      });

      // Extract version number from output
      const version = this.parseVersion(stdout.trim());
      this.cachedVersion = version;
      return version;
    } catch {
      throw new Error(`Failed to get ${this.name} version`);
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
    if (this.capacityTracker === null) {
      // Fallback for uninitialized tracker
      return Promise.resolve({
        remainingTokens: Number.MAX_SAFE_INTEGER,
        remainingRequests: Number.MAX_SAFE_INTEGER,
        resetTime: new Date(getTimeProvider().now() + 3600_000),
        utilizationPercent: 0,
        exhausted: false,
      });
    }
    return Promise.resolve(this.capacityTracker.getCapacity());
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

    return {
      code,
      message,
      cli: this.name,
      retryable,
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
