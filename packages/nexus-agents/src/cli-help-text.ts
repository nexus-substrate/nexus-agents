/**
 * nexus-agents CLI Help Text
 *
 * Help documentation for the CLI commands and options.
 * Extracted from cli-types.ts to maintain file size limits.
 *
 * HELP_TEXT below is the full (`--all`) view and also doubles as the raw
 * template that `entrypoint-cli-extractor.ts` parses via AST to build the
 * entrypoint index. Do not reshape its top-level sections without updating
 * that extractor. Tiered rendering (default vs `--all`) lives in
 * `renderHelp({ all })`, which swaps the COMMANDS block based on the
 * audience catalog in `cli-command-catalog.ts`.
 *
 * @module cli-help-text
 */

import { renderCommandsSection } from './cli-command-catalog.js';

/**
 * Help text for the CLI.
 */
export const HELP_TEXT = `
nexus-agents - Intelligent orchestration platform for AI coding tools

USAGE:
  nexus-agents [OPTIONS]
  nexus-agents [COMMAND] [SUBCOMMAND] [OPTIONS]

COMMANDS:
  (default)       Start MCP server with stdio transport
  hello           Show welcome message and quick start (no API keys needed)
  demo            API-free exploration mode (no API keys needed)
  setup           Configure Claude CLI integration (MCP + CLAUDE.md rules)
  login           Show per-CLI auth status + login fix instructions
  verify          Quick installation verification (no API keys needed)
  doctor          Check CLI installations and health status
  config          Manage configuration (init, get, set, list, reset, export, import)
  expert list     List available experts (built-in and custom)
  workflow list   List available workflow templates
  workflow run    Execute a workflow template
  review <url>    Review a GitHub pull request (dogfooding)
  routing-audit   Debug model routing decisions
  orchestrate     Execute task using CLI tools (standalone mode)
  vote            Run consensus vote on a proposal (6 agents)
  system-review   Run automated system review (5-phase checklist)
  sprint          Automated sprint planning from open issues
  session         Manage session persistence (list, show, export, delete, prune)
  evaluate        Self-evaluation of codebase components
  issue           Issue template validation and management
  index           Generate and manage codebase index
  research        Manage research registry and index
  validation      Show learning validation dashboard
  learning-metrics Show aggregated learning metrics dashboard
  swe-bench       Run SWE-bench evaluation benchmark
  atbench         Run ATBench trajectory-safety evaluation (#1981)
  hooks           Claude CLI hook integration commands
  fitness-audit   Run CLI orchestration fitness score audit
  release-notes   Generate release notes from git commits
  release-validate Run expert swarm validation for releases
  release-announce Generate release announcements (blog, Bluesky)
  scaffold        Generate project files from templates (tool, expert, workflow, command)
  visualize       Generate Mermaid diagrams and ASCII dashboards (architecture, swarm, flow)
  capabilities    Show model capabilities matrix (modalities, tools, features)
  status          At-a-glance project health dashboard (fitness, adapters, version)
  health          Swarm health metrics dashboard (utilization, routing accuracy, failures)
  validate        Run unified validation (doctor + fitness + config)
  auth            Manage MCP authentication tokens (init, show, rotate)

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

For more information, visit: https://github.com/williamzujkowski/nexus-agents
`.trim();

/**
 * Regex matching the COMMANDS: block in HELP_TEXT, from the heading line
 * through (but not including) the blank line before OPTIONS:.
 *
 * The template literal in HELP_TEXT has the COMMANDS list indented 2 spaces,
 * followed by a blank line, followed by `OPTIONS:`. We swap out everything
 * between `COMMANDS:\n` and the blank line before `OPTIONS:`.
 */
const COMMANDS_BLOCK_RE = /COMMANDS:\n([\s\S]*?)\n\nOPTIONS:/;

/**
 * Renders the top-level help output.
 *
 * @param opts.all - If true, returns the full HELP_TEXT (includes maintainer
 *   commands like benchmarks and release tooling). If false, returns a tiered
 *   view that hides maintainer commands — surfaced via `--all` hint at the
 *   bottom of the COMMANDS block.
 */
export function renderHelp(opts: { all: boolean }): string {
  if (opts.all) return HELP_TEXT;
  const replacement = renderCommandsSection(false);
  return HELP_TEXT.replace(COMMANDS_BLOCK_RE, `COMMANDS:\n${replacement}\n\nOPTIONS:`);
}
