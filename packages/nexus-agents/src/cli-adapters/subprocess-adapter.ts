/**
 * nexus-agents/cli-adapters - Subprocess Adapter
 *
 * Base class for subprocess-based CLI adapters.
 * Used by ClaudeCliAdapter and GeminiCliAdapter.
 *
 * Extracted from base-adapter.ts per Issue #272 (file size limits).
 */

import { spawn } from 'node:child_process';

import type { Result } from '../core/index.js';
import { ok, err } from '../core/index.js';

import type {
  CliTransport,
  CliTask,
  CliResponse,
  CliError,
  ExecutionOptions,
  ICliResponseParser,
} from './types.js';
import { BaseCliAdapter } from './base-adapter.js';

/**
 * Command configuration returned by getCommand.
 */
export interface CommandConfig {
  command: string;
  args: string[];
  /** Optional stdin content (prompt passed via stdin instead of args) */
  stdin?: string;
}

/**
 * Base class for subprocess-based CLI adapters.
 * Used by ClaudeCliAdapter and GeminiCliAdapter.
 */
export abstract class SubprocessCliAdapter extends BaseCliAdapter {
  readonly transport: CliTransport = 'subprocess';

  protected abstract readonly parser: ICliResponseParser;

  /**
   * Gets CLI command and arguments for execution.
   * If stdin is provided, it will be written to the process stdin.
   */
  protected abstract getCommand(task: CliTask): CommandConfig;

  /**
   * Executes a task via subprocess using spawn for proper argument handling.
   * Using spawn avoids shell escaping issues with multi-line content.
   * If stdin is provided in command config, it is written to process stdin.
   */
  async executeTask(
    task: CliTask,
    options: Required<ExecutionOptions>
  ): Promise<Result<CliResponse, CliError>> {
    const cmdConfig = this.getCommand(task);
    const startTime = Date.now();

    return new Promise((resolve) => {
      const child = spawn(cmdConfig.command, cmdConfig.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const state = this.setupChildProcessHandlers(child, startTime, options.timeoutMs, resolve);

      // Write stdin content if provided and close stdin
      if (cmdConfig.stdin !== undefined) {
        child.stdin.write(cmdConfig.stdin);
      }
      child.stdin.end();

      // Reference state to prevent unused variable warning
      void state;
    });
  }

  /**
   * Sets up child process event handlers for output collection and error handling.
   */
  private setupChildProcessHandlers(
    child: ReturnType<typeof spawn>,
    startTime: number,
    timeoutMs: number,
    resolve: (result: Result<CliResponse, CliError>) => void
  ): { stdout: string; stderr: string; resolved: boolean } {
    const state = { stdout: '', stderr: '', resolved: false };

    const resolveOnce = (result: Result<CliResponse, CliError>): void => {
      if (!state.resolved) {
        state.resolved = true;
        resolve(result);
      }
    };

    // stdio: ['pipe', 'pipe', 'pipe'] guarantees non-null streams
    if (child.stdout !== null) {
      child.stdout.on('data', (data: Buffer) => {
        state.stdout += data.toString();
      });
    }
    if (child.stderr !== null) {
      child.stderr.on('data', (data: Buffer) => {
        state.stderr += data.toString();
      });
    }

    child.on('error', (error: Error) => {
      resolveOnce(this.handleSubprocessError(error));
    });

    child.on('close', (code: number | null) => {
      if (code !== 0 && state.stdout === '') {
        const msg = state.stderr !== '' ? state.stderr : `Process exited with code ${String(code)}`;
        resolveOnce(err(this.createError('EXECUTION_ERROR', msg)));
        return;
      }
      resolveOnce(this.handleSubprocessOutput(state.stdout, state.stderr, startTime));
    });

    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
      resolveOnce(err(this.createError('TIMEOUT', 'Execution timed out')));
    }, timeoutMs);

    child.on('close', () => {
      clearTimeout(timeoutId);
    });

    return state;
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
