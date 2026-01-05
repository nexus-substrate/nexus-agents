/**
 * nexus-agents/cli-adapters - Base Adapter
 *
 * Abstract base class for CLI adapters with common functionality.
 *
 * (Source: cli-project_plan.md v2.1.0)
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import semver from 'semver';

import type { Result } from '../core/index.js';
import { ok, err } from '../core/index.js';
import type { ILogger } from '../core/index.js';
import { createLogger } from '../core/index.js';

import type {
  ICliAdapter,
  ICliResponseParser,
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

const execAsync = promisify(exec);

/**
 * Default execution options.
 */
const DEFAULT_OPTIONS: Required<ExecutionOptions> = {
  timeoutMs: 120_000, // 2 minutes
  allowRetry: true,
  maxRetries: 2,
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
  protected initialized = false;
  protected lastHealthCheck?: HealthStatus;
  protected cachedVersion?: string;

  constructor(logger?: ILogger) {
    this.logger = logger ?? createLogger({ component: 'cli-adapter' });
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
   */
  async execute(task: CliTask, options?: ExecutionOptions): Promise<Result<CliResponse, CliError>> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    if (!this.initialized) {
      await this.initialize();
    }

    this.logger.debug('Executing task', {
      cli: this.name,
      contentLength: task.content.length,
      model: task.model,
    });

    let lastError: CliError | undefined;
    const maxAttempts = opts.allowRetry ? opts.maxRetries + 1 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await this.executeTask(task, opts);

      if (result.ok) {
        this.logger.info('Task executed successfully', {
          cli: this.name,
          attempt,
          durationMs: result.value.durationMs,
        });
        return result;
      }

      lastError = result.error;

      if (!result.error.retryable || attempt === maxAttempts) {
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

      // Exponential backoff
      await this.delay(Math.pow(2, attempt) * 1000);
    }

    return err(lastError ?? this.createError('UNKNOWN', 'Unknown error'));
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
        lastChecked: new Date(),
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
        lastChecked: new Date(),
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
   * Gets current capacity status.
   * Default implementation returns full capacity.
   * Override in subclasses to track actual usage.
   */
  getCapacity(): Promise<CapacityStatus> {
    return Promise.resolve({
      remainingTokens: Number.MAX_SAFE_INTEGER,
      remainingRequests: Number.MAX_SAFE_INTEGER,
      resetTime: new Date(Date.now() + 3600_000),
      utilizationPercent: 0,
      exhausted: false,
    });
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

/**
 * Base class for subprocess-based CLI adapters.
 */
export abstract class SubprocessCliAdapter extends BaseCliAdapter {
  readonly transport: CliTransport = 'subprocess';

  protected abstract readonly parser: ICliResponseParser;

  /**
   * Gets CLI command and arguments for execution.
   */
  protected abstract getCommand(task: CliTask): { command: string; args: string[] };

  /**
   * Executes a task via subprocess.
   */
  async executeTask(
    task: CliTask,
    options: Required<ExecutionOptions>
  ): Promise<Result<CliResponse, CliError>> {
    const { command, args } = this.getCommand(task);
    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync(`${command} ${args.join(' ')}`, {
        timeout: options.timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      return this.handleSubprocessOutput(stdout, stderr, startTime);
    } catch (error) {
      return this.handleSubprocessError(error);
    }
  }

  /**
   * Handles successful subprocess output.
   */
  private handleSubprocessOutput(
    stdout: string,
    stderr: string,
    startTime: number
  ): Result<CliResponse, CliError> {
    if (stderr !== '' && stdout === '') {
      return err(this.createError('EXECUTION_ERROR', stderr));
    }

    const text = this.parser.extractResponse(stdout);
    if (text === null) {
      return err(this.createError('PARSE_ERROR', 'Failed to parse response'));
    }

    const usage = this.parser.extractUsage(stdout);
    const sessionId = this.parser.extractSessionId(stdout);

    return ok(
      this.normalizeResponse(text, usage ?? undefined, {
        durationMs: Date.now() - startTime,
        raw: stdout,
        ...(sessionId !== null && { sessionId }),
      })
    );
  }

  /**
   * Handles subprocess execution errors.
   */
  private handleSubprocessError(error: unknown): Result<CliResponse, CliError> {
    if (!(error instanceof Error)) {
      return err(this.createError('EXECUTION_ERROR', 'Unknown error'));
    }

    if (error.message.includes('ETIMEDOUT') || error.message.includes('timeout')) {
      return err(this.createError('TIMEOUT', 'Execution timed out', error));
    }

    if (error.message.includes('ENOENT')) {
      return err(this.createError('NOT_FOUND', `${this.name} CLI not found`, error));
    }

    return err(this.createError('EXECUTION_ERROR', error.message, error));
  }

  /**
   * Initializes the adapter (no-op for subprocess).
   */
  initialize(): Promise<void> {
    this.initialized = true;
    return Promise.resolve();
  }

  /**
   * Disposes the adapter (no-op for subprocess).
   */
  dispose(): Promise<void> {
    this.initialized = false;
    return Promise.resolve();
  }
}
