/**
 * nexus-agents/cli - Sandbox Execution Helpers
 *
 * Provides sandbox-aware command execution for CLI commands.
 * Validates commands against sandbox policies before execution.
 *
 * @module cli/sandbox-exec
 * (Source: Issue #295 - Security: Wrap execSync calls with sandbox execution)
 */

import { execSync, type ExecSyncOptions } from 'node:child_process';
import { createLogger, getErrorMessage } from '../core/index.js';
import {
  validateCommand,
  validateArgs,
  DEVELOPMENT_POLICY,
  READONLY_POLICY,
  type SandboxPolicy,
  type PolicyViolation,
} from '../security/sandbox/index.js';

const logger = createLogger({ component: 'sandbox-exec' });

/**
 * Execution context for sandbox policy selection.
 */
export type ExecContext = 'read' | 'write' | 'git' | 'gh';

/**
 * Options for sandboxed exec.
 */
export interface SandboxExecOptions {
  /** Working directory for command execution. */
  readonly cwd?: string;
  /** Execution context for policy selection. */
  readonly context?: ExecContext;
  /** Custom policy (overrides context-based selection). */
  readonly policy?: SandboxPolicy;
  /**
   * Data to pipe to the child process's stdin (#2863). Lets callers
   * pass large or shell-unsafe payloads (e.g. a markdown comment body)
   * without embedding them in the command string — where chars like
   * `| ( ) ; &` would be rejected by `validateArgs`.
   */
  readonly stdin?: string;
  /**
   * Return the child's stdout even when it exits non-zero (#4838).
   *
   * Some tools report their *findings* through a non-zero exit code —
   * `pnpm audit` exits 1 when it finds vulnerabilities, while still writing
   * the full JSON report to stdout. Without this, the detection path and the
   * failure path are the same path, and the caller reads a clean result.
   *
   * A command that exits non-zero with no output still yields `null`: "ran
   * and reported something" and "could not run" must stay distinguishable.
   */
  readonly allowNonZeroExit?: boolean;
}

/** Parser state for command string tokenization. */
interface ParserState {
  inQuote: boolean;
  quoteChar: string;
  current: string;
}

/** Check if character is a quote that starts a quoted section. */
function isOpeningQuote(char: string, state: ParserState): boolean {
  return !state.inQuote && (char === '"' || char === "'");
}

/** Check if character closes the current quoted section. */
function isClosingQuote(char: string, state: ParserState): boolean {
  return state.inQuote && char === state.quoteChar;
}

/** Check if character is an unquoted space (token separator). */
function isTokenSeparator(char: string, state: ParserState): boolean {
  return !state.inQuote && char === ' ';
}

/**
 * Parse a command string into command and arguments.
 */
function parseCommand(commandString: string): { command: string; args: string[] } {
  const parts: string[] = [];
  const state: ParserState = { inQuote: false, quoteChar: '', current: '' };

  for (const char of commandString) {
    if (isOpeningQuote(char, state)) {
      state.inQuote = true;
      state.quoteChar = char;
    } else if (isClosingQuote(char, state)) {
      state.inQuote = false;
      state.quoteChar = '';
    } else if (isTokenSeparator(char, state)) {
      if (state.current.length > 0) {
        parts.push(state.current);
        state.current = '';
      }
    } else {
      state.current += char;
    }
  }

  if (state.current.length > 0) {
    parts.push(state.current);
  }

  return { command: parts[0] ?? '', args: parts.slice(1) };
}

/**
 * Get the appropriate policy for a given context.
 */
function getPolicyForContext(context: ExecContext): SandboxPolicy {
  switch (context) {
    case 'read':
      return READONLY_POLICY;
    case 'write':
    case 'git':
    case 'gh':
      return DEVELOPMENT_POLICY;
    default:
      return READONLY_POLICY;
  }
}

/**
 * Validate a command against sandbox policy.
 *
 * @returns null if valid, violation object if invalid
 */
export function validateCommandWithPolicy(
  commandString: string,
  options: SandboxExecOptions = {}
): PolicyViolation | null {
  const { command, args } = parseCommand(commandString);
  const policy = options.policy ?? getPolicyForContext(options.context ?? 'read');

  // Validate the base command
  const cmdViolation = validateCommand(command, policy.allowedCommands);
  if (cmdViolation !== null) {
    return cmdViolation;
  }

  // Validate arguments for dangerous patterns
  const argsViolation = validateArgs(args);
  if (argsViolation !== null) {
    return argsViolation;
  }

  return null;
}

/**
 * Read a child process's stdout off the error thrown by a non-zero exit.
 *
 * Returns null when the process produced no output — including when it never
 * ran at all (ENOENT, policy denial upstream), which is the case the caller
 * must not mistake for a measurement.
 */
function readErrorStdout(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('stdout' in error)) return null;
  const { stdout } = error;
  const text =
    typeof stdout === 'string' ? stdout : Buffer.isBuffer(stdout) ? stdout.toString('utf-8') : null;
  if (text === null) return null;
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Execute a command with sandbox policy validation (synchronous).
 *
 * This validates the command against the sandbox policy before execution.
 * If the command is denied by policy, it throws an error instead of executing.
 *
 * @param commandString - The command to execute (e.g., "git status --porcelain")
 * @param options - Execution options
 * @returns Command output as string, or null if execution fails
 */
export function safeExecSandboxed(
  commandString: string,
  options: SandboxExecOptions = {}
): string | null {
  const violation = validateCommandWithPolicy(commandString, options);

  if (violation !== null) {
    logger.warn('Sandbox policy denied command', {
      command: commandString,
      violation: violation.reason,
    });
    return null;
  }

  try {
    const execOptions: ExecSyncOptions = {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    };

    if (options.cwd !== undefined) {
      execOptions.cwd = options.cwd;
    }
    if (options.stdin !== undefined) {
      execOptions.input = options.stdin;
    }

    const result = execSync(commandString, execOptions);
    return typeof result === 'string' ? result.trim() : result.toString('utf-8').trim();
  } catch (error) {
    if (options.allowNonZeroExit === true) {
      const stdout = readErrorStdout(error);
      if (stdout !== null) {
        logger.debug('Command exited non-zero but produced output', { command: commandString });
        return stdout;
      }
    }
    logger.debug('Command execution failed', {
      command: commandString,
      error: getErrorMessage(error),
    });
    return null;
  }
}

/**
 * Execute a command with sandbox policy validation, throwing on policy denial.
 *
 * Unlike safeExecSandboxed, this throws an error if the policy denies the command.
 *
 * @param commandString - The command to execute
 * @param options - Execution options
 * @returns Command output as string
 * @throws Error if command is denied by policy or execution fails
 */
export function execSandboxed(commandString: string, options: SandboxExecOptions = {}): string {
  const violation = validateCommandWithPolicy(commandString, options);

  if (violation !== null) {
    const msg = `Sandbox policy denied: ${violation.reason}`;
    logger.warn(msg, { command: commandString });
    throw new Error(msg);
  }

  const execOptions: ExecSyncOptions = {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  };

  if (options.cwd !== undefined) {
    execOptions.cwd = options.cwd;
  }
  if (options.stdin !== undefined) {
    execOptions.input = options.stdin;
  }

  const result = execSync(commandString, execOptions);
  return typeof result === 'string' ? result.trim() : result.toString('utf-8').trim();
}

/**
 * Check if a command would be allowed by sandbox policy.
 */
export function isCommandAllowed(commandString: string, options: SandboxExecOptions = {}): boolean {
  return validateCommandWithPolicy(commandString, options) === null;
}
