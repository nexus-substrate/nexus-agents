/**
 * nexus-agents/cli - REPL Types
 *
 * Type definitions for the interactive REPL command.
 *
 * @module cli/repl-types
 * (Source: Issue #64, extracted from repl.ts for #272)
 */

/**
 * ANSI color codes for terminal output.
 */
export const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
} as const;

/**
 * Session context maintained across REPL commands.
 */
export interface ReplSession {
  /** History of tasks submitted */
  history: string[];
  /** Current session ID */
  readonly sessionId: string;
  /** Session start time */
  readonly startTime: Date;
  /** Verbose mode */
  verbose: boolean;
}

/**
 * REPL command result.
 */
export interface CommandResult {
  /** Whether the command was handled */
  handled: boolean;
  /** Whether to exit the REPL */
  exit: boolean;
  /** Output message */
  output?: string;
}

/**
 * Handled result for simple commands.
 */
export const HANDLED: CommandResult = { handled: true, exit: false };
