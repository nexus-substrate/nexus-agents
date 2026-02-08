/**
 * nexus-tui — Interactive REPL and terminal UI for nexus-agents
 *
 * @module nexus-tui
 */

export { VERSION } from './version.js';
export { startRepl, createRepl, processLine } from './repl.js';
export type { ReplInstance } from './repl.js';
export { createCommandRegistry } from './commands/index.js';
export { parseInput } from './parse-input.js';
export { formatResult, formatHeader, formatTable } from './formatter.js';
export type { CommandResult, CommandHandler, ReplConfig, ParsedInput } from './types.js';
