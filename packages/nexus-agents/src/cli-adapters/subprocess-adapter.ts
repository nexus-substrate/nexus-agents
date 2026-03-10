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
import { ok, err, getTimeProvider, createLogger } from '../core/index.js';

import type {
  CliTransport,
  CliTask,
  CliResponse,
  CliError,
  CliErrorCode,
  ExecutionOptions,
  ICliResponseParser,
} from './types.js';
import { BaseCliAdapter } from './base-adapter.js';

/** Rate-limit indicator patterns in CLI stdout (case-insensitive). */
const RATE_LIMIT_PATTERNS = [
  'rate limit',
  '429',
  'too many requests',
  'quota exceeded',
  'usage limit',
];

/** Checks if raw stdout contains rate-limit indicators (#1320). */
function isRateLimitOutput(stdout: string): boolean {
  const lower = stdout.toLowerCase();
  return RATE_LIMIT_PATTERNS.some((pattern) => lower.includes(pattern));
}

/** Minimum length for plaintext fallback to kick in. */
const PLAINTEXT_FALLBACK_MIN_LENGTH = 100;

/**
 * Attempts to extract a usable response from raw stdout when the structured
 * parser fails. Returns the trimmed text if it looks like natural language
 * (not JSON/NDJSON) and exceeds the minimum length threshold.
 *
 * Recovers responses from CLIs that output plaintext instead of their
 * expected structured format. (#1401)
 */
function tryPlaintextFallback(stdout: string): string | null {
  const trimmed = stdout.trim();
  if (trimmed.length < PLAINTEXT_FALLBACK_MIN_LENGTH) return null;
  // Skip if it looks like structured output the parser should handle
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return null;
  return trimmed;
}

/** Error patterns in stderr that indicate a real failure, not debug output (#1402). */
const STDERR_ERROR_PATTERNS = [
  'error:',
  'fatal:',
  'panic:',
  'unhandled',
  'not found',
  'invalid model',
  'authentication',
  'unauthorized',
  'permission denied',
  'connection refused',
  'econnrefused',
  'enotfound',
  'timeout',
  'failed to connect',
  'invalid api key',
  'rate limit',
  'quota exceeded',
  'service unavailable',
];

/** Checks if stderr looks like a real error (not just debug/progress output). */
function looksLikeErrorStderr(stderr: string): boolean {
  const lower = stderr.toLowerCase();
  return STDERR_ERROR_PATTERNS.some((pattern) => lower.includes(pattern));
}

/** Stderr patterns indicating transient connection failures (retryable). */
const STDERR_CONNECTION_PATTERNS = [
  'connection refused',
  'econnrefused',
  'enotfound',
  'econnreset',
  'failed to connect',
  'service unavailable',
];

/** Stderr patterns indicating rate limiting (retryable). */
const STDERR_RATE_LIMIT_PATTERNS = ['rate limit', 'quota exceeded', '429', 'too many requests'];

/** Stderr patterns indicating timeout (retryable). */
const STDERR_TIMEOUT_PATTERNS = ['timeout', 'timed out', 'etimedout'];

/**
 * Classifies a stderr error message into the most specific CliErrorCode.
 * Checks for transient patterns (connection, rate-limit, timeout) before
 * falling back to EXECUTION_ERROR. This ensures transient failures in
 * stderr are retried instead of treated as terminal. (#1401)
 */
function classifyStderrError(stderr: string): CliErrorCode {
  const lower = stderr.toLowerCase();
  if (STDERR_CONNECTION_PATTERNS.some((p) => lower.includes(p))) return 'CONNECTION_ERROR';
  if (STDERR_RATE_LIMIT_PATTERNS.some((p) => lower.includes(p))) return 'RATE_LIMITED';
  if (STDERR_TIMEOUT_PATTERNS.some((p) => lower.includes(p))) return 'TIMEOUT';
  return 'EXECUTION_ERROR';
}

const subprocessLogger = createLogger({ component: 'subprocess-adapter' });

/** Maximum buffer size for stdout/stderr (10 MB). */
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/** CliErrorCodes that represent transient failures safe to retry. */
const TRANSIENT_ERROR_CODES: ReadonlySet<CliErrorCode> = new Set([
  'TIMEOUT',
  'RATE_LIMITED',
  'CONNECTION_ERROR',
]);

/** Delay schedule for transient-error retries (ms per attempt index). */
const TRANSIENT_RETRY_DELAYS_MS = [500, 1000] as const;

/** Maximum number of transient-error retries. */
const MAX_TRANSIENT_RETRIES = TRANSIENT_RETRY_DELAYS_MS.length;

/** Timeout extension multiplier when retrying a TIMEOUT error. (#1401) */
export const TIMEOUT_RETRY_MULTIPLIER = 1.5;

/**
 * Checks whether a CliErrorCode represents a transient failure.
 * Only timeout, rate_limit, and connection errors are transient.
 */
export function isTransientError(code: CliErrorCode): boolean {
  return TRANSIENT_ERROR_CODES.has(code);
}

/** Internal state for buffered stream collection. */
interface BufferState {
  stdout: string;
  stderr: string;
  stdoutBytes: number;
  stderrBytes: number;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  resolved: boolean;
}

/** Append data to a buffered stream, respecting the 10 MB cap. */
function appendBuffered(state: BufferState, stream: 'stdout' | 'stderr', data: Buffer): void {
  const bytesKey = stream === 'stdout' ? 'stdoutBytes' : 'stderrBytes';
  const truncKey = stream === 'stdout' ? 'stdoutTruncated' : 'stderrTruncated';
  if (state[bytesKey] < MAX_BUFFER_BYTES) {
    state[stream] += data.toString();
    state[bytesKey] += data.length;
  } else if (!state[truncKey]) {
    state[truncKey] = true;
    subprocessLogger.warn(`${stream} buffer exceeded 10 MB, truncating`);
  }
}

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
 * Configuration for transient-error retry behaviour.
 */
export interface TransientRetryConfig {
  /** Whether transient-error retry is enabled (default: false). */
  enabled: boolean;
}

/**
 * Base class for subprocess-based CLI adapters.
 * Used by ClaudeCliAdapter and GeminiCliAdapter.
 */
export abstract class SubprocessCliAdapter extends BaseCliAdapter {
  readonly transport: CliTransport = 'subprocess';

  protected abstract readonly parser: ICliResponseParser;

  /** Transient-error retry config. Override in subclass to enable. */
  protected readonly transientRetry: TransientRetryConfig = { enabled: true };

  /**
   * Gets CLI command and arguments for execution.
   * If stdin is provided, it will be written to the process stdin.
   */
  protected abstract getCommand(task: CliTask): CommandConfig;

  /**
   * Executes a task via subprocess, with optional transient-error retry.
   * When `transientRetry.enabled` is true, transient errors (timeout,
   * rate_limit, connection) are retried up to 2 times with exponential
   * backoff (500ms, 1000ms). Non-transient errors fail immediately.
   */
  async executeTask(
    task: CliTask,
    options: Required<ExecutionOptions>
  ): Promise<Result<CliResponse, CliError>> {
    const result = await this.spawnSubprocess(task, options);
    if (result.ok || !this.transientRetry.enabled) return result;
    if (!isTransientError(result.error.code)) return result;

    return this.retryTransient(task, options, result, 0);
  }

  /**
   * Retries a transient error with bounded exponential backoff.
   */
  private async retryTransient(
    task: CliTask,
    options: Required<ExecutionOptions>,
    lastResult: Result<CliResponse, CliError>,
    attempt: number
  ): Promise<Result<CliResponse, CliError>> {
    if (attempt >= MAX_TRANSIENT_RETRIES) return lastResult;

    // Guard above ensures attempt < MAX_TRANSIENT_RETRIES (length of array)
    const delayMs = TRANSIENT_RETRY_DELAYS_MS[attempt] as number;
    const isTimeout = !lastResult.ok && lastResult.error.code === 'TIMEOUT';
    subprocessLogger.debug('Retrying transient error', {
      cli: this.name,
      attempt: attempt + 1,
      delayMs,
      errorCode: !lastResult.ok ? lastResult.error.code : undefined,
    });

    await this.delay(delayMs);

    // Extend timeout on TIMEOUT retries so near-miss tasks can complete (#1401)
    const retryOptions = isTimeout
      ? { ...options, timeoutMs: Math.round(options.timeoutMs * TIMEOUT_RETRY_MULTIPLIER) }
      : options;
    const result = await this.spawnSubprocess(task, retryOptions);
    if (result.ok) return result;
    if (!isTransientError(result.error.code)) return result;

    return this.retryTransient(task, retryOptions, result, attempt + 1);
  }

  /**
   * Spawns a single subprocess execution (no retry).
   */
  private spawnSubprocess(
    task: CliTask,
    options: Required<ExecutionOptions>
  ): Promise<Result<CliResponse, CliError>> {
    const cmdConfig = this.getCommand(task);
    const startTime = getTimeProvider().now();

    return new Promise((resolve) => {
      // Strip CLAUDECODE env var to allow nested CLI sessions (SWE-bench, etc.)
      const childEnv = { ...process.env };
      delete childEnv['CLAUDECODE'];

      const child = spawn(cmdConfig.command, cmdConfig.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: childEnv,
      });

      const onProgress = options.onProgress;
      const state = this.setupChildProcessHandlers(
        child,
        startTime,
        options.timeoutMs,
        resolve,
        onProgress
      );

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
    resolve: (result: Result<CliResponse, CliError>) => void,
    onProgress?: () => void
  ): BufferState {
    const state: BufferState = {
      stdout: '',
      stderr: '',
      resolved: false,
      stdoutBytes: 0,
      stderrBytes: 0,
      stdoutTruncated: false,
      stderrTruncated: false,
    };

    const resolveOnce = (result: Result<CliResponse, CliError>): void => {
      if (!state.resolved) {
        state.resolved = true;
        resolve(result);
      }
    };

    // stdio: ['pipe', 'pipe', 'pipe'] guarantees non-null streams
    if (child.stdout !== null) {
      child.stdout.on('data', (data: Buffer) => {
        appendBuffered(state, 'stdout', data);
        onProgress?.();
      });
    }
    if (child.stderr !== null) {
      child.stderr.on('data', (data: Buffer) => {
        appendBuffered(state, 'stderr', data);
      });
    }

    child.on('error', (error: Error) => {
      resolveOnce(this.handleSubprocessError(error));
    });

    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
      resolveOnce(err(this.createError('TIMEOUT', 'Execution timed out')));
    }, timeoutMs);

    child.on('close', (code: number | null) => {
      clearTimeout(timeoutId);
      resolveOnce(this.classifyCloseResult(code, state, startTime));
    });

    return state;
  }

  /** Classify a subprocess close event into a Result. */
  private classifyCloseResult(
    code: number | null,
    state: BufferState,
    startTime: number
  ): Result<CliResponse, CliError> {
    if (code !== 0 && state.stdout === '') {
      const msg = state.stderr !== '' ? state.stderr : `Process exited with code ${String(code)}`;
      const errorCode = state.stderr !== '' ? classifyStderrError(state.stderr) : 'EXECUTION_ERROR';
      return err(this.createError(errorCode, msg));
    }
    // Non-zero exit with stderr errors: classify specifically to enable
    // transient retry for connection/rate-limit/timeout errors (#1401, #1402)
    if (code !== 0 && state.stderr !== '' && looksLikeErrorStderr(state.stderr)) {
      const msg = `Exit code ${String(code)}: ${state.stderr.slice(0, 500).trim()}`;
      return err(this.createError(classifyStderrError(state.stderr), msg));
    }
    return this.handleSubprocessOutput(state.stdout, state.stderr, startTime);
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
      // Check for rate-limit indicators in raw stdout (#1320)
      if (isRateLimitOutput(stdout)) {
        const snippet = stdout.slice(0, 500).trim();
        return err(this.createError('RATE_LIMITED', snippet));
      }
      // Plaintext fallback: recover responses from CLIs outputting unstructured text (#1401)
      const plaintext = tryPlaintextFallback(stdout);
      if (plaintext !== null) {
        subprocessLogger.debug('Using plaintext fallback for unparseable output');
        return ok(
          this.normalizeResponse(plaintext, undefined, {
            durationMs: getTimeProvider().now() - startTime,
            raw: stdout,
          })
        );
      }
      const snippet = stdout.slice(0, 500).trim();
      const stderrHint = stderr !== '' ? ` [stderr: ${stderr.slice(0, 300).trim()}]` : '';
      return err(
        this.createError('PARSE_ERROR', `Failed to parse response: ${snippet}${stderrHint}`)
      );
    }

    const usage = this.parser.extractUsage(stdout);
    const sessionId = this.parser.extractSessionId(stdout);

    return ok(
      this.normalizeResponse(text, usage ?? undefined, {
        durationMs: getTimeProvider().now() - startTime,
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
   * Initializes the adapter and capacity tracker.
   */
  initialize(): Promise<void> {
    this.initCapacityTracker();
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
