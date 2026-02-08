/**
 * nexus-tui — REPL engine
 *
 * Interactive readline-based REPL for nexus-agents.
 * Parses input, dispatches to command handlers, formats output.
 *
 * @module repl
 */

import * as readline from 'node:readline';
import type { CommandHandler, ReplConfig } from './types.js';
import { parseInput } from './parse-input.js';
import { formatResult } from './formatter.js';
import { createCommandRegistry } from './commands/index.js';

const DEFAULT_PROMPT = 'nexus> ';
const BANNER = `
  Nexus Agents TUI v0.1.0
  Type 'help' for commands, 'exit' to quit.
`;

/** Create and return a REPL instance (testable, does not auto-start). */
export function createRepl(config: ReplConfig = {}): ReplInstance {
  const prompt = config.prompt ?? DEFAULT_PROMPT;
  const jsonMode = config.jsonMode ?? false;
  const registry = createCommandRegistry();
  return { prompt, jsonMode, registry, processLine };
}

/** Process a single input line and return formatted output. */
export async function processLine(
  line: string,
  registry: ReadonlyMap<string, CommandHandler>,
  jsonMode: boolean
): Promise<string | null> {
  const { command, args } = parseInput(line);

  if (command === '') return null;
  if (command === 'exit' || command === 'quit' || command === 'q') return null;

  const handler = registry.get(command);
  if (handler === undefined) {
    return formatResult(
      { output: `Unknown command: ${command}. Type 'help' for available commands.`, isError: true },
      jsonMode
    );
  }

  const result = await handler.execute(args);
  return formatResult(result, jsonMode);
}

/** Start the interactive REPL (blocks until exit). */
export function startRepl(config: ReplConfig = {}): void {
  const repl = createRepl(config);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: repl.prompt,
    completer: createCompleter(repl.registry),
  });

  process.stdout.write(BANNER);
  rl.prompt();

  rl.on('line', (line: string) => {
    const trimmed = line.trim();
    if (trimmed === 'exit' || trimmed === 'quit' || trimmed === 'q') {
      rl.close();
      return;
    }

    void processLine(trimmed, repl.registry, repl.jsonMode).then((output) => {
      if (output !== null) {
        process.stdout.write(output + '\n');
      }
      rl.prompt();
    });
  });

  rl.on('close', () => {
    process.stdout.write('\nGoodbye.\n');
  });
}

/** Tab completion for command names. */
function createCompleter(
  registry: ReadonlyMap<string, CommandHandler>
): (line: string) => [string[], string] {
  const commands = [...registry.keys(), 'exit'];
  return (line: string): [string[], string] => {
    const hits = commands.filter((c) => c.startsWith(line.toLowerCase()));
    return [hits.length > 0 ? hits : commands, line];
  };
}

/** REPL instance (for testing). */
export interface ReplInstance {
  readonly prompt: string;
  readonly jsonMode: boolean;
  readonly registry: ReadonlyMap<string, CommandHandler>;
  readonly processLine: typeof processLine;
}
