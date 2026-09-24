/**
 * nexus-agents/cli - Research Index Helpers
 *
 * Argument parsing and help text for the research index CLI command.
 *
 * @see Issue #367 - Deterministic RESEARCH_INDEX.md generation
 */

import type { ResearchIndexOptions, ParseState } from './research-index-types.js';

// ============================================================================
// Argument Parsing Helpers
// ============================================================================

/**
 * Parse action flags from CLI argument.
 * @returns true if the argument was an action flag
 */
export function parseActionArg(arg: string, state: ParseState): boolean {
  // The bare words are the positional spelling (`research index check`,
  // #2761), which the parser used to accept by ignoring every argument.
  if (arg === '--generate' || arg === '-g' || arg === 'generate') {
    state.action = 'generate';
    return true;
  }
  if (arg === '--validate' || arg === '-v' || arg === 'validate') {
    state.action = 'validate';
    return true;
  }
  if (arg === '--check' || arg === '-c' || arg === 'check') {
    state.action = 'check';
    return true;
  }
  return false;
}

/**
 * Parse boolean flags from CLI argument.
 * @returns true if the argument was a boolean flag
 */
export function parseBooleanFlags(arg: string, state: ParseState): boolean {
  if (arg === '--strict') {
    state.strict = true;
    return true;
  }
  if (arg === '--no-check-files') {
    state.checkFiles = false;
    return true;
  }
  if (arg === '--silent' || arg === '-s') {
    state.silent = true;
    return true;
  }
  return false;
}

/**
 * Parse value flags (flags that take the next argument as value).
 * @returns the number of arguments consumed (0 if not a value flag)
 */
export function parseValueArg(
  arg: string,
  args: readonly string[],
  index: number,
  state: ParseState
): number {
  if (arg === '--output' || arg === '-o') {
    state.output = args[index + 1];
    return 2;
  }
  if (arg === '--format' || arg === '-f') {
    const formatArg = args[index + 1];
    if (formatArg === 'json') {
      state.format = 'json';
    }
    return 2;
  }
  return 0;
}

/**
 * Build the final options object from parse state.
 */
export function buildOptionsFromState(state: ParseState): ResearchIndexOptions {
  const result: ResearchIndexOptions = {
    action: state.action,
    format: state.format,
    strict: state.strict,
    checkFiles: state.checkFiles,
    silent: state.silent,
  };

  if (state.output !== undefined) {
    return { ...result, output: state.output };
  }

  return result;
}

/**
 * Create initial parse state with default values.
 */
export function createInitialParseState(): ParseState {
  return {
    action: 'check',
    output: undefined,
    format: 'text',
    strict: false,
    checkFiles: true,
    silent: false,
  };
}

// ============================================================================
// CLI Argument Parser
// ============================================================================

/** `--output=x` → `['--output', 'x']`; any other argument is returned as-is. */
function splitInlineValue(arg: string): string[] {
  const eq = arg.indexOf('=');
  return arg.startsWith('--') && eq > 0 ? [arg.slice(0, eq), arg.slice(eq + 1)] : [arg];
}

/**
 * Parse CLI arguments for the research index command.
 *
 * This is the ONE definition of the `research index` flags: the CLI forwards
 * everything after `research` here verbatim (#6678, see `FLAG_OWNERS` in
 * `cli.ts`). An argument it does not recognise is therefore refused rather
 * than ignored — nothing else will read it.
 *
 * @throws Error on an unrecognised argument
 */
export function parseResearchIndexArgs(args: readonly string[]): ResearchIndexOptions {
  const state = createInitialParseState();
  const tokens = args.flatMap(splitInlineValue);

  for (let i = 0; i < tokens.length; i++) {
    const arg = tokens[i];
    if (arg === undefined) continue;

    if (parseActionArg(arg, state)) continue;
    if (parseBooleanFlags(arg, state)) continue;

    const consumed = parseValueArg(arg, tokens, i, state);
    if (consumed === 0) {
      throw new Error(`Unknown research index argument '${arg}'.\n\n${getResearchIndexHelp()}`);
    }
    i += consumed - 1; // -1 because the loop will increment i
  }

  return buildOptionsFromState(state);
}

// ============================================================================
// Help Text
// ============================================================================

/**
 * Get help text for the research index command.
 */
export function getResearchIndexHelp(): string {
  return `Usage: nexus-agents research index [options]

Options:
  --generate, -g    Generate RESEARCH_INDEX.md from registry files
  --validate, -v    Validate registry consistency (cross-references, files)
  --check, -c       Check if index is up to date (default)
  --output, -o      Output path for generate (default: docs/research/RESEARCH_INDEX.md)
  --format, -f      Output format for validate: text or json (default: text)
  --strict          Treat warnings as errors in validate
  --no-check-files  Skip integration file existence checks
  --silent, -s      Silent mode (only exit code, for CI)

Examples:
  nexus-agents research index --generate
  nexus-agents research index --validate --strict
  nexus-agents research index --check --silent`;
}
