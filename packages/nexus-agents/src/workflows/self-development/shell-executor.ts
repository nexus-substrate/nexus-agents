/**
 * Shell Executor
 *
 * Executes shell commands for verification phases.
 * Provides timeout, output capture, and error handling.
 *
 * @module workflows/self-development/shell-executor
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Result } from '../../core/index.js';
import { ok, err, createLogger, getTimeProvider } from '../../core/index.js';
import { truncateWithInfo } from '../../utils/text-utils.js';

const execFileAsync = promisify(execFile);
const logger = createLogger({ component: 'shell-executor' });

/** Default timeout for shell commands (5 minutes). */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/** Maximum output size to capture (1MB). */
const MAX_OUTPUT_SIZE = 1024 * 1024;

/** Result of a shell command execution. */
export interface ShellResult {
  /** Command that was executed. */
  readonly command: string;
  /** Arguments passed to the command. */
  readonly args: readonly string[];
  /** Exit code (0 = success). */
  readonly exitCode: number;
  /** Standard output (truncated if too large). */
  readonly stdout: string;
  /** Standard error (truncated if too large). */
  readonly stderr: string;
  /** Duration in milliseconds. */
  readonly durationMs: number;
  /** Whether the command succeeded (exitCode === 0). */
  readonly success: boolean;
}

/** Error thrown when shell execution fails. */
export class ShellError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly args: readonly string[],
    public readonly exitCode?: number,
    public readonly stderr?: string
  ) {
    super(message);
    this.name = 'ShellError';
  }
}

/** Options for shell command execution. */
export interface ShellOptions {
  /** Working directory for the command. */
  readonly cwd?: string;
  /** Timeout in milliseconds. */
  readonly timeoutMs?: number;
  /** Environment variables. */
  readonly env?: Record<string, string>;
}

/**
 * Truncate output if it exceeds the maximum size.
 * Wraps truncateWithInfo from utils/text-utils.ts.
 */
function truncateOutput(output: string, maxSize: number = MAX_OUTPUT_SIZE): string {
  return truncateWithInfo(output, maxSize);
}

/** Error object shape from execFile. */
interface ExecError {
  readonly code?: string | number;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly message: string;
  readonly killed?: boolean;
}

/** Build a success result. */
function buildSuccessResult(
  command: string,
  args: readonly string[],
  stdout: string,
  stderr: string,
  durationMs: number
): ShellResult {
  return {
    command,
    args,
    exitCode: 0,
    stdout: truncateOutput(stdout),
    stderr: truncateOutput(stderr),
    durationMs,
    success: true,
  };
}

/** Build a failure result (non-zero exit code). */
function buildFailureResult(
  command: string,
  args: readonly string[],
  execError: ExecError,
  durationMs: number
): ShellResult {
  return {
    command,
    args,
    exitCode: typeof execError.code === 'number' ? execError.code : 1,
    stdout: truncateOutput(execError.stdout ?? ''),
    stderr: truncateOutput(execError.stderr ?? ''),
    durationMs,
    success: false,
  };
}

/**
 * Execute a shell command and return the result.
 */
export async function executeShellCommand(
  command: string,
  args: readonly string[],
  options?: ShellOptions
): Promise<Result<ShellResult, ShellError>> {
  const startTime = getTimeProvider().now();
  const cwd = options?.cwd ?? process.cwd();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  logger.debug('Executing shell command', { command, args, cwd, timeoutMs });

  try {
    const { stdout, stderr } = await execFileAsync(command, [...args], {
      cwd,
      timeout: timeoutMs,
      maxBuffer: MAX_OUTPUT_SIZE * 2,
      env: { ...process.env, ...options?.env },
    });

    const result = buildSuccessResult(
      command,
      args,
      stdout,
      stderr,
      getTimeProvider().now() - startTime
    );
    logger.debug('Shell command succeeded', { command, durationMs: result.durationMs });
    return ok(result);
  } catch (error) {
    return handleExecError(
      command,
      args,
      error as ExecError,
      getTimeProvider().now() - startTime,
      timeoutMs
    );
  }
}

/** Handle exec errors (timeout, non-zero exit, or other). */
function handleExecError(
  command: string,
  args: readonly string[],
  execError: ExecError,
  durationMs: number,
  timeoutMs: number
): Result<ShellResult, ShellError> {
  // Handle timeout
  if (execError.killed === true && execError.code === 'ETIMEDOUT') {
    logger.warn('Shell command timed out', { command, timeoutMs });
    return err(new ShellError(`Command timed out after ${String(timeoutMs)}ms`, command, args));
  }

  // Handle non-zero exit code (returns result, not error)
  if (typeof execError.code === 'number') {
    const result = buildFailureResult(command, args, execError, durationMs);
    logger.debug('Shell command failed', { command, exitCode: execError.code, durationMs });
    return ok(result);
  }

  // Handle other errors
  const shellError = new ShellError(
    `Command failed: ${execError.message}`,
    command,
    args,
    undefined,
    execError.stderr
  );
  logger.error('Shell command error', shellError, { command });
  return err(shellError);
}

/**
 * Execute a pnpm script command.
 */
export async function executePnpmScript(
  script: string,
  options?: ShellOptions
): Promise<Result<ShellResult, ShellError>> {
  return executeShellCommand('pnpm', [script], options);
}

/**
 * Execute verification commands (typecheck, lint, test, build).
 */
export interface VerificationCheckResult {
  readonly name: string;
  readonly command: string;
  readonly passed: boolean;
  readonly durationMs: number;
  readonly output?: string;
  readonly error?: string;
}

/**
 * Run a single verification check.
 */
export async function runVerificationCheck(
  name: string,
  script: string,
  options?: ShellOptions
): Promise<VerificationCheckResult> {
  const result = await executePnpmScript(script, options);

  if (!result.ok) {
    return {
      name,
      command: `pnpm ${script}`,
      passed: false,
      durationMs: 0,
      error: result.error.message,
    };
  }

  const shellResult = result.value;
  const base = {
    name,
    command: `pnpm ${script}`,
    passed: shellResult.success,
    durationMs: shellResult.durationMs,
  };

  // Include output for failed checks
  if (!shellResult.success) {
    return {
      ...base,
      output: shellResult.stdout,
      error: shellResult.stderr,
    };
  }

  return base;
}

/**
 * Run all verification checks in sequence.
 */
export async function runAllVerificationChecks(cwd: string): Promise<VerificationCheckResult[]> {
  const checks = ['typecheck', 'lint', 'test', 'build'];
  const results: VerificationCheckResult[] = [];

  for (const check of checks) {
    const result = await runVerificationCheck(check, check, { cwd });
    results.push(result);

    // Stop on first failure
    if (!result.passed) {
      logger.warn('Verification check failed, stopping', { check });
      break;
    }
  }

  return results;
}
