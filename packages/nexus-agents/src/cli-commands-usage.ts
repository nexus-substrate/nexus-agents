/**
 * nexus-agents CLI Commands - Usage Messages
 *
 * Error and usage message output functions for CLI commands.
 *
 * @module cli-commands-usage
 * (Source: Extracted from cli-commands.ts for #272)
 */

import { getCommandHelp } from './cli-command-help.js';

/**
 * Print a standard "missing required arg" usage message whose Examples block is
 * single-sourced from {@link getCommandHelp} (#3209, epic #3691) — so the on-error
 * examples can't drift from `nexus-agents <cmd> --help`. The Examples section is
 * omitted when the command has no registered help examples.
 */
function printUsageWithExamples(opts: {
  readonly error: string;
  readonly usage: string;
  readonly command: string;
}): void {
  process.stdout.write(`Error: ${opts.error}\n`);
  process.stdout.write(`Usage: ${opts.usage}\n`);
  const examples = getCommandHelp(opts.command)?.examples ?? [];
  if (examples.length > 0) {
    process.stdout.write('Examples:\n');
    for (const example of examples) {
      process.stdout.write(`  ${example}\n`);
    }
  }
}

/**
 * Prints workflow run usage and exits.
 */
export function printWorkflowRunUsage(): void {
  process.stdout.write('Error: Workflow name is required.\n');
  process.stdout.write('Usage: nexus-agents workflow run <name> [options]\n');
}

/**
 * Prints routing-audit command usage and exits.
 */
export function printRoutingAuditUsage(): void {
  process.stdout.write('Error: Task description is required.\n');
  process.stdout.write('Usage: nexus-agents routing-audit <task> [options]\n');
  process.stdout.write('Examples:\n');
  process.stdout.write('  nexus-agents routing-audit "Implement a complex algorithm"\n');
  process.stdout.write('  nexus-agents routing-audit "Review this code" --verbose\n');
  process.stdout.write('  nexus-agents routing-audit "Generate tests" --format=json\n');
}

/**
 * Prints orchestrate command usage and exits.
 */
export function printOrchestrateUsage(): void {
  printUsageWithExamples({
    error: 'Task description is required.',
    usage: 'nexus-agents orchestrate <task> [options]',
    command: 'orchestrate',
  });
}

/**
 * Prints vote command usage and exits.
 */
export function printVoteUsage(): void {
  printUsageWithExamples({
    error: 'Proposal is required.',
    usage: 'nexus-agents vote --proposal "..." [options]',
    command: 'vote',
  });
}

/**
 * Prints index command usage and exits.
 */
export function printIndexUsage(): void {
  process.stdout.write('Error: Index subcommand is required.\n');
  process.stdout.write('Usage: nexus-agents index <subcommand> [options]\n');
  process.stdout.write('Subcommands:\n');
  process.stdout.write('  generate     Generate/update codebase index\n');
  process.stdout.write('  check        Validate index freshness (for CI)\n');
  process.stdout.write('  diagram      Generate Mermaid dependency diagram\n');
  process.stdout.write('  validate     Check ARCHITECTURE.md matches index\n');
  process.stdout.write('  entrypoints  Extract CLI/MCP/REST entrypoints\n');
  process.stdout.write('  freshness    Check documentation freshness\n');
  process.stdout.write('  links        Validate markdown links\n');
}

/**
 * Prints research command usage and exits.
 */
export function printResearchUsage(): void {
  process.stdout.write('Error: Research subcommand is required.\n');
  process.stdout.write('Usage: nexus-agents research <subcommand> [options]\n');
  process.stdout.write('Subcommands:\n');
  process.stdout.write('  status [id]      Show technique status (optional: specific technique)\n');
  process.stdout.write('  overlap <id>     Find overlapping techniques\n');
  process.stdout.write('  add <arxiv-id>   Add paper from arXiv\n');
  process.stdout.write('  stats            Show research statistics\n');
  process.stdout.write('  refresh          Regenerate RESEARCH_INDEX.md\n');
  process.stdout.write('  check            Check if index is up to date\n');
  process.stdout.write('  discover         Discover papers/repos from external sources\n');
  process.stdout.write('  review           Discover, score, and rank research findings\n');
  process.stdout.write('  prioritize       Rank actionable techniques by priority\n');
}

/**
 * Prints validation dashboard command usage and exits.
 * (Source: Issue #273)
 */
export function printValidationUsage(): void {
  process.stdout.write('Usage: nexus-agents validation [options]\n');
  process.stdout.write('Options:\n');
  process.stdout.write(
    '  --period=<period>    Time period: 1h, 24h, 7d, 30d, all (default: all)\n'
  );
  process.stdout.write('  --model=<name>       Filter to specific model(s) (comma-separated)\n');
  process.stdout.write(
    '  --task-type=<type>   Filter to specific task type(s) (comma-separated)\n'
  );
  process.stdout.write('  --min-sample=<n>     Minimum sample size for inclusion (default: 10)\n');
  process.stdout.write('  --format=<fmt>       Output format: ascii, json (default: ascii)\n');
  process.stdout.write('Examples:\n');
  process.stdout.write('  nexus-agents validation                    Show learning dashboard\n');
  process.stdout.write('  nexus-agents validation --period=7d        Last 7 days only\n');
  process.stdout.write('  nexus-agents validation --format=json      Output as JSON\n');
}
