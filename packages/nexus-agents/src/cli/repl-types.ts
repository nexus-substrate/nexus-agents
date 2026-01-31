/**
 * nexus-agents/cli - REPL Types
 *
 * Type definitions for the interactive REPL command.
 *
 * @module cli/repl-types
 * (Source: Issue #64, extracted from repl.ts for #272)
 */

// Re-export ANSI colors from consolidated module
export { colors } from './ansi-output.js';

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
