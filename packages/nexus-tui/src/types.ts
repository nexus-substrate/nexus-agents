/**
 * nexus-tui — Core type definitions
 *
 * @module types
 */

/** Result of executing a REPL command. */
export interface CommandResult {
  readonly output: string;
  readonly isError?: boolean;
}

/** A registered REPL command handler. */
export interface CommandHandler {
  readonly name: string;
  readonly description: string;
  readonly usage: string;
  execute(args: readonly string[]): Promise<CommandResult>;
}

/** REPL configuration options. */
export interface ReplConfig {
  readonly prompt?: string;
  readonly jsonMode?: boolean;
}

/** Parsed command line input. */
export interface ParsedInput {
  readonly command: string;
  readonly args: readonly string[];
  readonly flags: ReadonlyMap<string, string>;
}
