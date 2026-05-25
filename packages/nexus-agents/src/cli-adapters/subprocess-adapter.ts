/* eslint-disable max-lines -- Cohesive subprocess adapter base class; governance 400-600 OK if cohesive */
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
import { buildChildEnv } from './subprocess-env.js';
import { sanitizeOutput } from '../security/output-sanitizer.js';
import { isRateLimitText } from '../adapters/rate-limit-detector.js';
import { parseCliErrorEnvelope } from './cli-error-envelope.js';
import { generateHyphenId } from '../utils/id-utils.js';

/** Minimum length for plaintext fallback to kick in.
 * Lowered from 100→30 to recover short but valid CLI responses (#1401). */
const PLAINTEXT_FALLBACK_MIN_LENGTH = 30;

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
  'eaddrinuse',
  'address already in use',
];

/** Stderr patterns indicating timeout (retryable). */
const STDERR_TIMEOUT_PATTERNS = ['timeout', 'timed out', 'etimedout'];

/**
 * Classifies a stderr error message into the most specific CliErrorCode.
 * Checks for transient patterns (connection, rate-limit, timeout) before
 * falling back to EXECUTION_ERROR. This ensures transient failures in
 * stderr are retried instead of treated as terminal. (#1401)
 *
 * Rate-limit detection uses shared patterns from rate-limit-detector. (#1596)
 */
function classifyStderrError(stderr: string): CliErrorCode {
  const lower = stderr.toLowerCase();
  if (STDERR_CONNECTION_PATTERNS.some((p) => lower.includes(p))) return 'CONNECTION_ERROR';
  if (isRateLimitText(stderr)) return 'RATE_LIMITED';
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
  'PARSE_ERROR',
]);

/** Delay schedule for transient-error retries (ms per attempt index). */
const TRANSIENT_RETRY_DELAYS_MS = [500, 1000] as const;

/** Maximum number of transient-error retries. */
const MAX_TRANSIENT_RETRIES = TRANSIENT_RETRY_DELAYS_MS.length;

/**
 * Maximum retries for PARSE_ERROR specifically (#1533).
 * Parse errors are less likely to self-heal than timeouts/connection errors,
 * so we cap at 1 retry instead of 2.
 */
export const MAX_PARSE_RETRIES = 1;

/** Timeout extension multiplier when retrying a TIMEOUT error. (#1401) */
export const TIMEOUT_RETRY_MULTIPLIER = 1.5;

/**
 * Grace period before escalating SIGTERM to SIGKILL on timeout (#3026
 * finding 1). 5s gives well-behaved children time to flush state and
 * exit cleanly while bounding zombie-process accumulation when a child
 * ignores SIGTERM. Exported so tests can assert against the threshold.
 */
export const SIGKILL_GRACE_MS = 5_000;

/**
 * Checks whether a CliErrorCode represents a transient failure.
 * Timeout, rate_limit, connection, and parse errors are transient.
 * Parse errors get fewer retries (MAX_PARSE_RETRIES) than others (#1533).
 */
export function isTransientError(code: CliErrorCode): boolean {
  return TRANSIENT_ERROR_CODES.has(code);
}

/**
 * Exit codes that indicate transient process termination (retryable).
 * - 137 = 128 + SIGKILL (9): OOM killer, system resource limits
 * - 143 = 128 + SIGTERM (15): external termination (our timeout SIGTERM
 *   is already caught by the timeout handler before close fires)
 */
const TRANSIENT_EXIT_CODES = new Set([137, 143]);

/** Human-readable signal names for exit codes (128 + signal number). */
const EXIT_CODE_SIGNAL_NAMES: Record<number, string> = {
  137: 'SIGKILL (OOM or killed)',
  143: 'SIGTERM (terminated)',
};

/** Builds an error message for signal exit codes that includes identifiable keywords. */
function buildSignalExitMessage(code: number): string {
  const signalName = EXIT_CODE_SIGNAL_NAMES[code];
  if (signalName !== undefined) return `Process killed by ${signalName}, exit code ${String(code)}`;
  return `Process exited with code ${String(code)}`;
}

/**
 * Checks whether a process exit code indicates a transient failure
 * that is safe to retry (e.g., OOM kill, external SIGTERM).
 */
export function isTransientExitCode(code: number | null): boolean {
  return code !== null && TRANSIENT_EXIT_CODES.has(code);
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
  /**
   * Wall-clock at first stdout byte (or null if none yet). Used by #2472 to
   * split total subprocess time into spawn-latency (spawn→first byte) and
   * streaming (first byte→close), which is the cheapest way to identify
   * which stage causes stochastic timeouts.
   */
  firstByteTime: number | null;
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
  /**
   * Optional cleanup callback invoked after the subprocess resolves
   * (success, error, or timeout). Used by adapters that materialize
   * temp files for the subprocess (e.g. codex `model_instructions_file`).
   * Errors thrown by cleanup are logged but do not affect the request result.
   */
  cleanup?: () => void | Promise<void>;
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
   * The inner {@link retryTransient} layer is the single retry authority
   * for subprocess CLIs. When it is enabled (the default), the shared
   * outer retry loop must not also retry: nesting both meant up to 6
   * subprocess spawns and ~10-minute hangs on a persistent TIMEOUT, since
   * the inner layer's timeout extension compounds on every outer attempt
   * (#2824). The outer loop still runs once, so circuit-breaker failure
   * recording is unaffected.
   */
  protected override shouldOuterRetry(opts: Required<ExecutionOptions>): boolean {
    return opts.allowRetry && !this.transientRetry.enabled;
  }

  /**
   * Gets CLI command and arguments for execution.
   * If stdin is provided, it will be written to the process stdin.
   */
  protected abstract getCommand(task: CliTask): CommandConfig;

  /**
   * Executes a task via subprocess, with optional transient-error retry.
   * When `transientRetry.enabled` is true, transient errors (timeout,
   * rate_limit, connection, parse) are retried with exponential backoff
   * (500ms, 1000ms). Parse errors get max 1 retry (#1533); others get 2.
   */
  async executeTask(
    task: CliTask,
    options: Required<ExecutionOptions>
  ): Promise<Result<CliResponse, CliError>> {
    // #2963 site 3: per-execute request ID for log correlation. CliTask
    // doesn't carry a task-id field; generate one here so every
    // log-line for this invocation (including the per-retry timing
    // breakdown emitted by `logTimingBreakdown`) can be grouped by a
    // single ID. Doesn't propagate up to MCP — it's purely an
    // adapter-internal correlation key.
    const requestId = generateHyphenId('cli-req', 8);
    const result = await this.spawnSubprocess(task, options, requestId);
    if (result.ok || !this.transientRetry.enabled) return result;
    if (!isTransientError(result.error.code)) return result;

    return this.retryTransient(task, options, result, 0, requestId);
  }

  /**
   * Retries a transient error with bounded exponential backoff.
   */
  private async retryTransient(
    task: CliTask,
    options: Required<ExecutionOptions>,
    lastResult: Result<CliResponse, CliError>,
    attempt: number,
    requestId: string
  ): Promise<Result<CliResponse, CliError>> {
    const isParseError = !lastResult.ok && lastResult.error.code === 'PARSE_ERROR';
    const maxRetries = isParseError ? MAX_PARSE_RETRIES : MAX_TRANSIENT_RETRIES;
    if (attempt >= maxRetries) return lastResult;

    // Guard above ensures attempt < maxRetries ≤ TRANSIENT_RETRY_DELAYS_MS.length
    const delayMs = TRANSIENT_RETRY_DELAYS_MS[attempt] as number;
    const isTimeout = !lastResult.ok && lastResult.error.code === 'TIMEOUT';
    subprocessLogger.debug('Retrying transient error', {
      cli: this.name,
      requestId,
      attempt: attempt + 1,
      delayMs,
      errorCode: !lastResult.ok ? lastResult.error.code : undefined,
    });

    await this.delay(delayMs);

    // Extend timeout on TIMEOUT retries so near-miss tasks can complete (#1401)
    const retryOptions = isTimeout
      ? { ...options, timeoutMs: Math.round(options.timeoutMs * TIMEOUT_RETRY_MULTIPLIER) }
      : options;
    const result = await this.spawnSubprocess(task, retryOptions, requestId);
    if (result.ok) return result;
    if (!isTransientError(result.error.code)) return result;

    return this.retryTransient(task, retryOptions, result, attempt + 1, requestId);
  }

  /**
   * Spawns a single subprocess execution (no retry).
   *
   * `requestId` (#2963 site 3) correlates the timing-breakdown log emitted
   * on subprocess close back to the parent `executeTask` invocation —
   * essential when multiple subprocesses for the same CLI run concurrently
   * (pipelines, votes) and the JSDoc's stated goal ("group by cli + provider
   * + model and surface tail-latency outliers") requires a way to
   * disambiguate which timing row belongs to which call.
   */
  private spawnSubprocess(
    task: CliTask,
    options: Required<ExecutionOptions>,
    requestId: string
  ): Promise<Result<CliResponse, CliError>> {
    const cmdConfig = this.getCommand(task);
    const startTime = getTimeProvider().now();

    const cleanup = cmdConfig.cleanup;
    const runCleanup = (): void => {
      if (cleanup === undefined) return;
      try {
        const r = cleanup();
        if (r instanceof Promise) {
          r.catch((e: unknown) => {
            this.logger.warn('Subprocess cleanup failed', { error: String(e) });
          });
        }
      } catch (e: unknown) {
        this.logger.warn('Subprocess cleanup threw', { error: String(e) });
      }
    };

    return new Promise((resolveOuter) => {
      const resolve = (result: Result<CliResponse, CliError>): void => {
        runCleanup();
        resolveOuter(result);
      };
      // Curated child env: base infrastructure vars + only this CLI's
      // own vendor credentials, so cross-vendor API keys don't leak
      // into the spawned CLI (#2865). Also drops CLAUDECODE — a nested
      // CLI must not believe it's already inside Claude Code.
      const childEnv = buildChildEnv(this.name);

      const child = spawn(cmdConfig.command, cmdConfig.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: childEnv,
      });

      const onProgress = options.onProgress;
      const state = this.setupChildProcessHandlers({
        child,
        startTime,
        timeoutMs: options.timeoutMs,
        resolve,
        requestId,
        ...(onProgress !== undefined ? { onProgress } : {}),
      });

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
  private setupChildProcessHandlers(args: {
    child: ReturnType<typeof spawn>;
    startTime: number;
    timeoutMs: number;
    resolve: (result: Result<CliResponse, CliError>) => void;
    requestId: string;
    onProgress?: () => void;
  }): BufferState {
    const { child, startTime, timeoutMs, resolve, requestId, onProgress } = args;
    const state: BufferState = {
      stdout: '',
      stderr: '',
      resolved: false,
      stdoutBytes: 0,
      stderrBytes: 0,
      stdoutTruncated: false,
      stderrTruncated: false,
      firstByteTime: null,
    };

    const resolveOnce = (result: Result<CliResponse, CliError>): void => {
      if (!state.resolved) {
        state.resolved = true;
        resolve(result);
      }
    };

    this.attachStdoutHandlers(child, state, onProgress);

    child.on('error', (error: Error) => {
      resolveOnce(this.handleSubprocessError(error));
    });

    const timers = this.scheduleTimeoutWithSigkillEscalation({
      child,
      timeoutMs,
      requestId,
      resolveOnce,
    });

    child.on('close', (code: number | null) => {
      clearTimeout(timers.timeoutId);
      if (timers.sigkillTimerId !== undefined) clearTimeout(timers.sigkillTimerId);
      this.logTimingBreakdown(state, startTime, code, requestId);
      resolveOnce(this.classifyCloseResult(code, state, startTime));
    });

    return state;
  }

  /**
   * Schedules the SIGTERM-on-timeout + SIGKILL-on-grace escalation
   * (#3026 finding 1).
   *
   * The primary timer fires SIGTERM and resolves the caller's promise
   * immediately so it doesn't wait on a hung child. The escalation
   * timer (`SIGKILL_GRACE_MS` later) checks whether the child actually
   * exited and force-reaps it with SIGKILL if not — preventing
   * zombie accumulation when a child ignores SIGTERM (Node CLIs that
   * install graceful-shutdown handlers can hang on a broken stream).
   * Both timers are cleared from the `'close'` handler so a child
   * that exits within the grace window doesn't see the second signal.
   */
  private scheduleTimeoutWithSigkillEscalation(opts: {
    child: ReturnType<typeof spawn>;
    timeoutMs: number;
    requestId: string;
    resolveOnce: (result: Result<CliResponse, CliError>) => void;
  }): { timeoutId: NodeJS.Timeout; sigkillTimerId: NodeJS.Timeout | undefined } {
    const { child, timeoutMs, requestId, resolveOnce } = opts;
    const timers: { timeoutId: NodeJS.Timeout; sigkillTimerId: NodeJS.Timeout | undefined } = {
      timeoutId: setTimeout(() => {
        child.kill('SIGTERM');
        resolveOnce(err(this.createError('TIMEOUT', 'Execution timed out')));
        timers.sigkillTimerId = setTimeout(() => {
          if (child.exitCode === null && child.signalCode === null) {
            this.logger.warn('Child ignored SIGTERM, escalating to SIGKILL', {
              cli: this.name,
              requestId,
              sigkillGraceMs: SIGKILL_GRACE_MS,
            });
            child.kill('SIGKILL');
          }
        }, SIGKILL_GRACE_MS);
        timers.sigkillTimerId.unref();
      }, timeoutMs),
      sigkillTimerId: undefined,
    };
    return timers;
  }

  /** Attach stdout/stderr data handlers + capture first-byte time (#2472). */
  private attachStdoutHandlers(
    child: ReturnType<typeof spawn>,
    state: BufferState,
    onProgress?: () => void
  ): void {
    // stdio: ['pipe', 'pipe', 'pipe'] guarantees non-null streams
    if (child.stdout !== null) {
      child.stdout.on('data', (data: Buffer) => {
        if (state.firstByteTime === null && data.length > 0) {
          state.firstByteTime = getTimeProvider().now();
        }
        appendBuffered(state, 'stdout', data);
        onProgress?.();
      });
    }
    if (child.stderr !== null) {
      child.stderr.on('data', (data: Buffer) => {
        appendBuffered(state, 'stderr', data);
      });
    }
  }

  /**
   * Log spawn-latency vs streaming breakdown at info level (#2472). Emits
   * one structured event per subprocess invocation, queryable via the
   * existing trace JSONL infrastructure. The breakdown lets operators
   * identify whether a slow run was caused by:
   *   - High spawn-latency: model gateway took its time before producing
   *     the first token (cold-start, queueing, network jitter).
   *   - High streaming-time: response body was large or generation slow.
   *   - Total approaches the timeout cap with no first-byte: hung process.
   *
   * Structured fields chosen so existing query_trace tooling can group by
   * cli + provider + model and surface tail-latency outliers.
   */
  private logTimingBreakdown(
    state: BufferState,
    startTime: number,
    code: number | null,
    requestId: string
  ): void {
    const now = getTimeProvider().now();
    const totalMs = now - startTime;
    const spawnLatencyMs = state.firstByteTime === null ? null : state.firstByteTime - startTime;
    const streamingMs = state.firstByteTime === null ? null : now - state.firstByteTime;
    this.logger.info('Subprocess timing', {
      cli: this.name,
      requestId,
      totalMs,
      spawnLatencyMs,
      streamingMs,
      sawFirstByte: state.firstByteTime !== null,
      exitCode: code,
      stdoutBytes: state.stdoutBytes,
      stderrBytes: state.stderrBytes,
    });
  }

  /** Classify a subprocess close event into a Result. */
  private classifyCloseResult(
    code: number | null,
    state: BufferState,
    startTime: number
  ): Result<CliResponse, CliError> {
    // Redact API keys from output before any processing, logging, or tracing (#1597)
    state.stdout = sanitizeOutput(state.stdout);
    state.stderr = sanitizeOutput(state.stderr);

    if (code !== 0 && state.stdout === '') {
      // Stderr classification takes priority over exit code (#1401)
      if (state.stderr !== '') {
        const msg = state.stderr;
        return err(this.createError(classifyStderrError(state.stderr), msg));
      }
      // Signal-killed processes (137=SIGKILL/OOM, 143=SIGTERM) are transient.
      // Message includes signal name for downstream outcome classification.
      const msg = code !== null ? buildSignalExitMessage(code) : 'Process exited with unknown code';
      if (isTransientExitCode(code)) {
        return err(this.createError('CONNECTION_ERROR', msg));
      }
      return err(this.createError('EXECUTION_ERROR', msg));
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
      return this.handleUnparseableOutput(stdout, stderr, startTime);
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
   * Handles the parse-failure branch: when the CLI's structured response
   * parser returned null. Order of recovery attempts (most-specific first):
   *   1. Rate-limit text in raw stdout (#1320)
   *   2. Structured CLI error envelope (#2440)
   *   3. Plaintext fallback for natural-language output (#1401)
   *   4. Generic PARSE_ERROR with truncated snippet
   */
  private handleUnparseableOutput(
    stdout: string,
    stderr: string,
    startTime: number
  ): Result<CliResponse, CliError> {
    if (isRateLimitText(stdout)) {
      const snippet = stdout.slice(0, 500).trim();
      return err(this.createError('RATE_LIMITED', snippet));
    }
    const envelope = parseCliErrorEnvelope(stdout, this.name);
    if (envelope !== null) {
      const msg =
        envelope.hint !== undefined
          ? `${envelope.message}\n  → ${envelope.hint}`
          : envelope.message;
      // #2455 ask 3: at debug level, dump the full sanitized envelope so
      // operators can recover context without re-running. Sanitized via
      // output-sanitizer.ts so leaked tokens (some upstreams echo back the
      // bad token in error responses) don't reach logs.
      subprocessLogger.debug('CLI error envelope unwrapped', {
        cli: this.name,
        code: envelope.code,
        rawSanitized: sanitizeOutput(stdout),
      });
      return err(this.createError(envelope.code, msg));
    }
    const plaintext = tryPlaintextFallback(stdout);
    if (plaintext !== null) {
      subprocessLogger.debug('Using plaintext fallback for unparseable output', {
        rawSanitized: sanitizeOutput(stdout),
      });
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

    return err(this.createError('EXECUTION_ERROR', sanitizeOutput(error.message), error));
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
