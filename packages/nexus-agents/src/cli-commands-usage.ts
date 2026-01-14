/**
 * nexus-agents CLI Commands - Usage Messages
 *
 * Error and usage message output functions for CLI commands.
 *
 * @module cli-commands-usage
 * (Source: Extracted from cli-commands.ts for #272)
 */

/**
 * Prints workflow run usage and exits.
 */
export function printWorkflowRunUsage(): void {
  process.stdout.write('Error: Workflow name is required.\n');
  process.stdout.write('Usage: nexus-agents workflow run <name> [options]\n');
}

/**
 * Prints review command usage and exits.
 */
export function printReviewUsage(): void {
  process.stdout.write('Error: PR URL is required.\n');
  process.stdout.write('Usage: nexus-agents review <url> [options]\n');
  process.stdout.write('Examples:\n');
  process.stdout.write('  nexus-agents review https://github.com/owner/repo/pull/123\n');
  process.stdout.write('  nexus-agents review owner/repo#123 --dry-run\n');
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
  process.stdout.write('Error: Task description is required.\n');
  process.stdout.write('Usage: nexus-agents orchestrate <task> [options]\n');
  process.stdout.write('Examples:\n');
  process.stdout.write('  nexus-agents orchestrate "Explain this function"\n');
  process.stdout.write('  nexus-agents orchestrate "Generate tests" --model=claude\n');
  process.stdout.write('  nexus-agents orchestrate "Refactor code" --dry-run\n');
}

/**
 * Prints vote command usage and exits.
 */
export function printVoteUsage(): void {
  process.stdout.write('Error: Proposal is required.\n');
  process.stdout.write('Usage: nexus-agents vote --proposal "..." [options]\n');
  process.stdout.write('Examples:\n');
  process.stdout.write('  nexus-agents vote --proposal "Add feature X"\n');
  process.stdout.write('  nexus-agents vote -p "Proposal" -t supermajority\n');
  process.stdout.write('  nexus-agents vote -p "Quick decision" --quick\n');
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
}
