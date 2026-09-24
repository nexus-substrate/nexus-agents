#!/usr/bin/env node
/**
 * nexus-agents CLI
 *
 * CLI entry point for Nexus Agents MCP server.
 * Supports commands for server operation, configuration, and expert management.
 *
 * (Source: MCP Protocol 2025-11-25)
 * (Source: Node.js 22.x parseArgs documentation)
 */

// MUST stay the first import: side-effect mutates process.env.NEXUS_LOG_LEVEL
// before any module loads core/logger.ts. See #2443.
import './cli/cli-log-bootstrap.js';

// #5392: MUST be a side-effect import, and MUST precede any module that reaches
// `node:sqlite`. ESM evaluates every import before the first statement of this
// body, and `open-database.ts` imports `node:sqlite` statically — so calling a
// suppressor as a STATEMENT here ran after the warning had already been emitted.
// That is how #5388 shipped a filter that could never fire.
import './cli/suppress-sqlite-warning.js';

import { parseArgs } from 'node:util';
import { createLogger } from './core/index.js';
import { claimGlobalRegistry } from './adapters/unified-registry.js';
import {
  EXIT_CODES,
  PARSE_ARGS_CONFIG,
  isValidCommand,
  type CliCommand,
  type ParsedCliArgs,
} from './cli-types.js';
import { dispatchCommand } from './cli-commands.js';
import { isDirectRun } from './cli-direct-run.js';
import { formatCommandHelp } from './cli-command-help.js';
import { catalogCommandNames, formatUnknownCommandMessage } from './cli-command-suggester.js';
import { buildOptions } from './cli/cli-options-builders.js';

// Re-export types and constants for external use
export { EXIT_CODES, type CliCommand, type ParsedCliArgs } from './cli-types.js';
export { printHelp, printVersion } from './cli-commands.js';
// dispatchCommand also uses printHelp and printVersion, but they are also exported
export type { ServerMode } from './cli/mode-detector.js';

/**
 * Determines the command from parsed options and positionals.
 * When --help is combined with a valid command (e.g., `orchestrate --help`),
 * returns the command so per-command help can be shown.
 */
function determineCommand(
  options: { help: boolean; version: boolean },
  positionals: string[]
): CliCommand {
  const firstArg = positionals[0];
  const hasValidCommand = firstArg !== undefined && isValidCommand(firstArg);

  // Per-command help: `nexus-agents orchestrate --help` returns 'orchestrate'
  if (options.help && hasValidCommand) return firstArg;
  if (options.help) return 'help';
  if (options.version) return 'version';

  if (hasValidCommand) return firstArg;

  return 'server';
}

const HOOKS_COMMAND = 'hooks';
const HELP_FLAGS: ReadonlySet<string> = new Set(['--help', '-h']);

/**
 * `hooks` owns its flags (#6679). `parseHookArgs` in `cli/hooks/hook-router.ts`
 * is the one definition of `--tool`, `--validate`, `--track-metrics`,
 * `--check-tasks` and the rest, so the strict global parser must not see them:
 * it rejected the ones it did not know (every `setup`-installed hook exited 3)
 * and consumed-and-dropped the ones it did (`--validate`, `--source`, #6678).
 * Everything after `hooks` is therefore forwarded verbatim as positionals,
 * which `handleHooksCommand` hands to the hook router. Only `--help`/`-h` is
 * read here, so per-command help keeps working.
 */
function parseHooksPassthrough(args: string[]): ParsedCliArgs {
  const hookArgs = args.slice(1);
  const wantsHelp = hookArgs.some((arg) => HELP_FLAGS.has(arg));
  const { values } = parseArgs({
    options: PARSE_ARGS_CONFIG.options,
    allowPositionals: PARSE_ARGS_CONFIG.allowPositionals,
    strict: PARSE_ARGS_CONFIG.strict,
    args: wantsHelp ? ['--help'] : [],
  });
  const result: ParsedCliArgs = {
    command: HOOKS_COMMAND,
    options: buildOptions(values),
    positionals: [HOOKS_COMMAND, ...hookArgs.filter((arg) => !HELP_FLAGS.has(arg))],
  };
  const subcommand = result.positionals[1];
  if (subcommand !== undefined) result.subcommand = subcommand;
  return result;
}

/**
 * Parses CLI arguments and determines the command to run.
 *
 * @param args - Command line arguments (defaults to process.argv.slice(2))
 * @returns Parsed CLI arguments with command and options
 */
export function parseCliArgs(args: string[] = process.argv.slice(2)): ParsedCliArgs {
  if (args[0] === HOOKS_COMMAND) return parseHooksPassthrough(args);
  const { values, positionals } = parseArgs({
    options: PARSE_ARGS_CONFIG.options,
    allowPositionals: PARSE_ARGS_CONFIG.allowPositionals,
    strict: PARSE_ARGS_CONFIG.strict,
    args,
  });

  const options = buildOptions(values);
  const command = determineCommand(options, positionals);

  const result: ParsedCliArgs = {
    command,
    options,
    positionals,
  };

  // Only add subcommand if it exists
  if (positionals.length > 1 && positionals[1] !== undefined) {
    result.subcommand = positionals[1];
  }

  return result;
}

/**
 * If the user typed a first positional that isn't a recognized command, prints
 * an `Unknown command '<x>'.` message (with a typo-tolerant "Did you mean: …?"
 * line when a close match exists) and exits INVALID_ARGS — instead of silently
 * falling through to the MCP server (#3211).
 *
 * Only fires when the resolved command is the `server` fall-through AND the
 * first positional is present but not a valid command. A bare `nexus-agents`
 * (no positionals) and an explicit `nexus-agents server` are untouched. No
 * sub-handler consumes `positionals[0]` as a server goal, so an unrecognized
 * one is unambiguously a typo.
 */
function maybeReportUnknownCommand(parsedArgs: ParsedCliArgs): void {
  if (parsedArgs.command !== 'server') return;
  if (parsedArgs.options.help || parsedArgs.options.version) return;
  const firstArg = parsedArgs.positionals[0];
  if (firstArg === undefined || isValidCommand(firstArg)) return;

  console.error(formatUnknownCommandMessage(firstArg, catalogCommandNames()));
  process.exit(EXIT_CODES.INVALID_ARGS);
}

/**
 * Main entry point for the Nexus Agents CLI.
 * Parses arguments and dispatches to appropriate command handler.
 */
async function main(): Promise<void> {
  // Composition root for the adapter registry (#6012). The registry is a
  // process-wide singleton whose logger is fixed by whoever constructs it
  // FIRST — before this, that was whichever of nine call sites happened to run
  // first, so the component on every adapter/circuit-breaker log line was an
  // accident of call order and eight callers got a "config ignored" warning on
  // the success path.
  //
  // This does NOT give per-caller attribution — a singleton has one logger, and
  // that would need the logger passed per operation. What it buys is that the
  // one logger is chosen deliberately here rather than by a race.
  claimGlobalRegistry(createLogger({ component: 'nexus-cli' }));

  let parsedArgs: ParsedCliArgs;

  try {
    parsedArgs = parseCliArgs();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown argument parsing error';
    console.error(`Error: ${message}`);
    console.error('Run "nexus-agents --help" for usage information.');
    process.exit(EXIT_CODES.INVALID_ARGS);
  }

  // #3211: an unrecognized top-level subcommand otherwise silently starts the
  // MCP server. Catch it here, suggest the closest command, and exit.
  maybeReportUnknownCommand(parsedArgs);

  // Per-command help: show targeted help when --help is used with a command
  if (parsedArgs.options.help && parsedArgs.command !== 'help') {
    const helpText = formatCommandHelp(parsedArgs.command);
    if (helpText !== undefined) {
      process.stdout.write(helpText + '\n');
      process.exit(EXIT_CODES.SUCCESS);
    }
    // Fall through to general help if no per-command help exists
    parsedArgs = { ...parsedArgs, command: 'help' };
  }

  await dispatchCommand(parsedArgs);
}

// Run main only if this is the direct entry point (not imported as module).
// The decision is a pure function of process.argv[1] in cli-direct-run.ts
// (#6102): it accepts the built cli.js, the nexus-agents bin, and the source
// entry under tsx. When it declines — a test runner or another entry imported
// this module — do nothing, but say so at debug level so the no-op is
// traceable. Never print to stderr or exit here: that would break importers.
if (isDirectRun(process.argv[1])) {
  main().catch((error: unknown) => {
    const logger = createLogger({ component: 'cli' });
    logger.error(
      'Fatal error during startup',
      error instanceof Error ? error : new Error(String(error))
    );
    process.exit(EXIT_CODES.SERVER_START_FAILED);
  });
} else {
  createLogger({ component: 'cli' }).debug('Not the direct CLI entry; main() not run', {
    argv1: process.argv[1] ?? '<undefined>',
  });
}
