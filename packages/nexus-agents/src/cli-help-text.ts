/**
 * nexus-agents CLI Help Text
 *
 * Help documentation for the CLI commands and options.
 * Extracted from cli-types.ts to maintain file size limits.
 *
 * The COMMANDS list is NO LONGER hardcoded here (#3209). It is generated from
 * `COMMAND_CATALOG` in `cli-command-catalog.ts` — the single source of truth
 * for each command's one-line description — via `renderCommandsSection`. The
 * non-command sections (USAGE, OPTIONS, EXAMPLES) stay static in
 * `HELP_TEXT_FRAME`. `HELP_TEXT` is that frame with the full (`--all`)
 * catalog-derived COMMANDS block stitched in; `renderHelp({ all: false })`
 * stitches in the audience-filtered block instead.
 *
 * Do not reshape the top-level sections (USAGE / COMMANDS / OPTIONS /
 * EXAMPLES): `indexer/entrypoint-extractor.ts` loads this module by AST and
 * the catalog/help snapshot tests assert their presence. (Command names +
 * descriptions for the entrypoint index come from the catalog via
 * `catalogForExtractors()`, not from parsing this text — #2156.)
 *
 * @module cli-help-text
 */

import { renderCommandsSection } from './cli-command-catalog.js';

/**
 * Placeholder token inside {@link HELP_TEXT_FRAME} that the renderers replace
 * with the catalog-derived COMMANDS block. Distinct from any real help content
 * so the single substitution is unambiguous.
 */
const COMMANDS_PLACEHOLDER = '__COMMANDS__';

/**
 * Static help frame: everything except the COMMANDS list, which is a single
 * {@link COMMANDS_PLACEHOLDER} token filled at render time from the catalog.
 */
const HELP_TEXT_FRAME = `
nexus-agents - Intelligent orchestration platform for AI coding tools

USAGE:
  nexus-agents [OPTIONS]
  nexus-agents [COMMAND] [SUBCOMMAND] [OPTIONS]

COMMANDS:
${COMMANDS_PLACEHOLDER}

OPTIONS:
  -h, --help           Show this help message
  -v, --version        Show version information
  --verbose            Enable verbose output
  --interactive        Start interactive REPL mode
  -m, --mode <mode>    Server mode: server, orchestrator (default: server)
                       - server:       MCP server only (for Claude CLI integration)
                       - orchestrator: CLI orchestrator (calls Gemini/Codex CLIs)

For command-specific options, run: nexus-agents <command> --help
(For example: nexus-agents vote --help)

EXAMPLES:
  nexus-agents hello                Show welcome + quick start (no API keys needed)
  nexus-agents setup --interactive  Run guided setup wizard
  nexus-agents verify               Quick install check (run first)
  nexus-agents auth status          Per-CLI auth state + login fix instructions
  nexus-agents doctor               Detailed CLI/adapter health check
  nexus-agents orchestrate -t "..." Run a one-off task via the CLI orchestrator
  nexus-agents vote --quick -p "X"  3-agent consensus vote on proposal "X"
  nexus-agents --help --all         Show every command (incl. maintainer tools)

For more information, visit: https://github.com/nexus-substrate/nexus-agents
`.trim();

/** Fills the COMMANDS placeholder in the frame with a catalog-derived block. */
function composeHelp(commandsSection: string): string {
  return HELP_TEXT_FRAME.replace(COMMANDS_PLACEHOLDER, commandsSection);
}

/**
 * Full (`--all`) help text, with the COMMANDS list generated from
 * `COMMAND_CATALOG` (single source of truth — #3209). Equivalent to
 * `renderHelp({ all: true })`; exported for callers/tests that want the
 * canonical full view as a value.
 */
export const HELP_TEXT = composeHelp(renderCommandsSection(true));

/**
 * Renders the top-level help output.
 *
 * @param opts.all - If true, returns the full view (includes maintainer
 *   commands like benchmarks and release tooling). If false, returns a tiered
 *   view that hides maintainer commands — surfaced via `--all` hint at the
 *   bottom of the COMMANDS block. Both views derive the command list (and its
 *   one-line descriptions) from `COMMAND_CATALOG`.
 */
export function renderHelp(opts: { all: boolean }): string {
  if (opts.all) return HELP_TEXT;
  return composeHelp(renderCommandsSection(false));
}
