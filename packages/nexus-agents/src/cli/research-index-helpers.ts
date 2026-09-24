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
  if (arg === '--generate' || arg === '-g') {
    state.action = 'generate';
    return true;
  }
  if (arg === '--validate' || arg === '-v') {
    state.action = 'validate';
    return true;
  }
  if (arg === '--check' || arg === '-c') {
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

/** Apply options forwarded from global parser (#6678). */
function applyForwardedOptions(state: ParseState, options?: Record<string, unknown>): void {
  if (options === undefined) return;
  if (options['validate'] === true) state.action = 'validate';
  if (typeof options['output'] === 'string') state.output = options['output'];
  if (options['format'] === 'json') state.format = 'json';
}

/**
 * Parse CLI arguments and forwarded options for the research index command (#6678).
 */
export function parseResearchIndexArgs(
  args: readonly string[],
  options?: Record<string, unknown>
): ResearchIndexOptions {
  const state = createInitialParseState();
  applyForwardedOptions(state, options);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;

    if (parseActionArg(arg, state)) continue;
    if (parseBooleanFlags(arg, state)) continue;

    const consumed = parseValueArg(arg, args, i, state);
    if (consumed > 0) {
      i += consumed - 1; // -1 because the loop will increment i
    }
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
