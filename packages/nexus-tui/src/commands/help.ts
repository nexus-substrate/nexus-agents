/**
 * nexus-tui — Help command
 * @module commands/help
 */

import type { CommandHandler, CommandResult } from '../types.js';
import { formatTable } from '../formatter.js';

/** Create the help command handler. */
export function createHelpCommand(registry: ReadonlyMap<string, CommandHandler>): CommandHandler {
  return {
    name: 'help',
    description: 'Show available commands',
    usage: 'help [command]',
    execute(args: readonly string[]): Promise<CommandResult> {
      const first = args[0];
      if (first !== undefined) {
        return Promise.resolve(showCommandHelp(registry, first));
      }
      return Promise.resolve(showAllCommands(registry));
    },
  };
}

function showAllCommands(registry: ReadonlyMap<string, CommandHandler>): CommandResult {
  const rows: Array<readonly [string, string]> = [];
  for (const [name, handler] of registry) {
    rows.push([name, handler.description]);
  }
  const output = `Nexus TUI — Interactive REPL\n\n${formatTable(rows)}\n\nType 'help <command>' for usage details.`;
  return { output };
}

function showCommandHelp(
  registry: ReadonlyMap<string, CommandHandler>,
  name: string
): CommandResult {
  const handler = registry.get(name);
  if (handler === undefined) {
    return { output: `Unknown command: ${name}`, isError: true };
  }
  return { output: `${handler.name} — ${handler.description}\n\nUsage: ${handler.usage}` };
}
