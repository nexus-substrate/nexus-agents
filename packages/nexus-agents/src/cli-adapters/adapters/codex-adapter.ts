/**
 * nexus-agents/cli-adapters - Codex CLI Adapter
 *
 * MCP-based adapter for Codex CLI.
 * Uses Codex's MCP server mode for stable integration.
 *
 * (Source: cli-project_plan.md v2.1.0)
 * (Source: docs/research/cli-integration-architecture.md)
 *
 * SECURITY NOTE (shell: true):
 * spawn() uses shell: true to ensure the CLI tool is found via PATH.
 * This is acceptable because:
 * 1. The command ('codex') is hardcoded, not user-provided
 * 2. All arguments are validated and constructed internally
 * 3. User task content is passed via --print flag with shell escaping
 * If shell: false is preferred, ensure 'codex' is in PATH or use full path.
 * See: https://nodejs.org/api/child_process.html#child_processspawncommand-args-options
 */

import { spawn } from 'node:child_process';
import type {
  ICliAdapter,
  CliName,
  CliTransport,
  CliTask,
  CliResponse,
  CliError,
  HealthStatus,
  CapacityStatus,
  ModelInfo,
  CapabilityProfile,
  ExecutionOptions,
} from '../types.js';
import { DEFAULT_CAPABILITIES } from '../types.js';
import type { Result } from '../../core/index.js';
import { ok, err } from '../../core/index.js';
import type { ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import { CodexResponseParser } from '../parsers/codex-parser.js';
import {
  getModelDisplayName,
  getCostPerMillionInput,
  getCostPerMillionOutput,
  createCodexError,
  normalizeCodexResponse,
  delay,
} from './codex-adapter-helpers.js';

// Re-export helpers for backward compatibility
export {
  getModelDisplayName,
  getCostPerMillionInput,
  getCostPerMillionOutput,
  createCodexError,
  normalizeCodexResponse,
  delay,
} from './codex-adapter-helpers.js';

/**
 * Default execution options for Codex.
 */
const DEFAULT_OPTIONS: Required<ExecutionOptions> = {
  timeoutMs: 120_000, // 2 minutes
  allowRetry: true,
  maxRetries: 2,
  trackUsage: true,
};

/**
 * Codex CLI adapter using subprocess transport.
 *
 * Note: While Codex supports MCP server mode, we use subprocess
 * execution for simplicity. MCP mode can be added later if needed
 * for bidirectional communication.
 */
export class CodexCliAdapter implements ICliAdapter {
  readonly name: CliName = 'codex';
  readonly transport: CliTransport = 'subprocess';

  protected readonly logger: ILogger;
  protected readonly parser = new CodexResponseParser();
  private readonly model: string;
  private initialized = false;
  private cachedVersion?: string;

  constructor(options?: { model?: string; logger?: ILogger }) {
    this.logger = options?.logger ?? createLogger({ component: 'codex-adapter' });
    // Use CLI's default model (avoid specifying unsupported models)
    this.model = options?.model ?? '';
  }

  /**
   * Gets the capability profile for Codex.
   */
  get capabilities(): CapabilityProfile {
    return DEFAULT_CAPABILITIES.codex;
  }

  /**
   * Gets Codex model information.
   */
  getModelInfo(): ModelInfo {
    return {
      id: this.model,
      name: getModelDisplayName(this.model),
      contextWindow: 400_000,
      maxOutput: 100_000,
      costPerMillionInput: getCostPerMillionInput(this.model),
      costPerMillionOutput: getCostPerMillionOutput(this.model),
    };
  }

  /**
   * Executes a task on Codex CLI.
   */
  async execute(task: CliTask, options?: ExecutionOptions): Promise<Result<CliResponse, CliError>> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    if (!this.initialized) {
      await this.initialize();
    }

    this.logger.debug('Executing task on Codex', {
      contentLength: task.content.length,
      model: task.model ?? this.model,
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
      await delay(Math.pow(2, attempt) * 1000);
    }

    return err(lastError ?? createCodexError('UNKNOWN', 'Unknown error', this.name));
  }

  /**
   * Executes a task via subprocess.
   */
  private executeTask(
    task: CliTask,
    options: Required<ExecutionOptions>
  ): Promise<Result<CliResponse, CliError>> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const args = this.buildArgs(task);
      const childProcess = spawn('codex', args, {
        // Note: shell: true removed - causes argument splitting issues
        timeout: options.timeoutMs,
      });

      let stdout = '';
      let stderr = '';

      childProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      childProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      childProcess.on('close', (code) => {
        resolve(this.handleClose(code, stdout, stderr, startTime));
      });

      childProcess.on('error', (error: Error) => {
        resolve(this.handleError(error));
      });
    });
  }

  /**
   * Handles subprocess close event.
   */
  private handleClose(
    code: number | null,
    stdout: string,
    stderr: string,
    startTime: number
  ): Result<CliResponse, CliError> {
    if (code !== 0 && stdout === '') {
      const message = stderr !== '' ? stderr : 'Process exited with error';
      return err(createCodexError('EXECUTION_ERROR', message, this.name));
    }

    const text = this.parser.extractResponse(stdout);
    if (text === null) {
      return err(createCodexError('PARSE_ERROR', 'Failed to parse response', this.name));
    }

    const usage = this.parser.extractUsage(stdout);
    const sessionId = this.parser.extractSessionId(stdout);

    return ok(
      normalizeCodexResponse(text, usage ?? undefined, {
        durationMs: Date.now() - startTime,
        raw: stdout,
        ...(sessionId !== null && { sessionId }),
      })
    );
  }

  /**
   * Handles subprocess error event.
   */
  private handleError(error: Error): Result<CliResponse, CliError> {
    if (error.message.includes('ENOENT')) {
      return err(createCodexError('NOT_FOUND', 'codex CLI not found', this.name, error));
    }
    if (error.message.includes('ETIMEDOUT') || error.message.includes('timeout')) {
      return err(createCodexError('TIMEOUT', 'Execution timed out', this.name, error));
    }
    return err(createCodexError('EXECUTION_ERROR', error.message, this.name, error));
  }

  /**
   * Builds command line arguments for Codex.
   */
  private buildArgs(task: CliTask): string[] {
    const args: string[] = ['exec'];

    // Add JSON output
    args.push('--json');

    // Add model only if specified (use CLI default otherwise)
    const model = task.model ?? this.model;
    if (model !== '') {
      args.push('-m', model);
    }

    // Add sandbox mode for safety (read-only by default)
    args.push('-s', 'read-only');

    // Skip git repo check for standalone prompts
    args.push('--skip-git-repo-check');

    // Add the task content (no JSON.stringify needed without shell: true)
    args.push(task.content);

    return args;
  }

  /**
   * Performs a health check.
   */
  async healthCheck(): Promise<HealthStatus> {
    try {
      const version = await this.getVersion();

      return {
        healthy: true,
        version,
        versionStatus: 'supported',
        lastChecked: new Date(),
      };
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
  getVersion(): Promise<string> {
    if (this.cachedVersion !== undefined && this.cachedVersion !== '') {
      return Promise.resolve(this.cachedVersion);
    }

    return new Promise((resolve, reject) => {
      const childProcess = spawn('codex', ['--version'], {
        shell: true,
        timeout: 10_000,
      });

      let stdout = '';

      childProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      childProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error('Failed to get codex version'));
          return;
        }

        const match = /(\d+\.\d+\.\d+)/.exec(stdout.trim());
        const version = match?.[1] ?? '0.0.0';
        this.cachedVersion = version;
        resolve(version);
      });

      childProcess.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Gets current capacity status.
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
   * Initializes the adapter.
   */
  initialize(): Promise<void> {
    this.initialized = true;
    return Promise.resolve();
  }

  /**
   * Disposes the adapter.
   */
  dispose(): Promise<void> {
    this.initialized = false;
    return Promise.resolve();
  }
}
