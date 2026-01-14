/**
 * nexus-agents CLI Commands
 *
 * Command handlers for the CLI.
 *
 * @module cli-commands
 */

import { VERSION } from './version.js';
import {
  doctorCommand,
  configInitCommand,
  expertListCommand,
  workflowRunCommand,
  printWorkflowTemplates,
  replCommand,
  reviewCommand,
  routingAuditCommand,
  orchestrateCommand,
  systemReviewCommand,
  voteCommand,
  indexCommand,
  formatIndexResult,
  researchCommand,
  isValidResearchSubcommand,
  type ExpertListFormat,
  type IndexSubcommand,
} from './cli/index.js';
import { EXIT_CODES, HELP_TEXT, type ParsedCliArgs } from './cli-types.js';
import { startServer } from './cli-server.js';

/**
 * Prints help text to stdout.
 */
export function printHelp(): void {
  process.stdout.write(HELP_TEXT + '\n');
}

/**
 * Prints version information to stdout.
 */
export function printVersion(): void {
  process.stdout.write(`nexus-agents v${VERSION}\n`);
}

/**
 * Handles unimplemented commands with a coming soon message.
 */
function handleUnimplementedCommand(command: string): void {
  process.stdout.write(`The '${command}' command is coming soon.\n`);
  process.stdout.write('Run "nexus-agents --help" for available options.\n');
}

/**
 * Handles the config command and its subcommands.
 */
export async function handleConfigCommand(args: ParsedCliArgs): Promise<void> {
  if (args.subcommand === 'init') {
    const configOpts = {
      force: args.options.force,
      ...(args.options.output !== undefined && { output: args.options.output }),
    };
    const exitCode = await configInitCommand(configOpts);
    process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
  } else {
    handleUnimplementedCommand(`config ${args.subcommand ?? ''}`);
    process.exit(EXIT_CODES.SUCCESS);
  }
}

/**
 * Validates and coerces format to ExpertListFormat.
 */
function isValidExpertListFormat(value: string): value is ExpertListFormat {
  return ['table', 'json', 'yaml'].includes(value);
}

/**
 * Handles the expert command and its subcommands.
 */
export function handleExpertCommand(args: ParsedCliArgs): void {
  if (args.subcommand === 'list') {
    const format = isValidExpertListFormat(args.options.format) ? args.options.format : 'table';
    const exitCode = expertListCommand({ format });
    process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
  } else {
    handleUnimplementedCommand(`expert ${args.subcommand ?? ''}`);
    process.exit(EXIT_CODES.SUCCESS);
  }
}

/**
 * Handles the workflow command and its subcommands.
 */
export async function handleWorkflowCommand(args: ParsedCliArgs): Promise<void> {
  if (args.subcommand === 'list') {
    await printWorkflowTemplates();
    process.exit(EXIT_CODES.SUCCESS);
  } else if (args.subcommand === 'run') {
    // Get workflow name from positionals (workflow run <name>)
    const workflowName = args.positionals[2];
    if (workflowName === undefined) {
      process.stdout.write('Error: Workflow name is required.\n');
      process.stdout.write('Usage: nexus-agents workflow run <name> [options]\n');
      process.exit(EXIT_CODES.INVALID_ARGS);
    }

    const exitCode = await workflowRunCommand({
      name: workflowName,
      input: args.options.input,
      dryRun: args.options.dryRun,
      verbose: args.options.verbose,
    });
    process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
  } else {
    handleUnimplementedCommand(`workflow ${args.subcommand ?? ''}`);
    process.exit(EXIT_CODES.SUCCESS);
  }
}

/**
 * Handles the server command (default mode or interactive REPL).
 */
export async function handleServerCommand(args: ParsedCliArgs): Promise<void> {
  if (args.options.interactive) {
    const exitCode = await replCommand({ verbose: args.options.verbose });
    process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
  } else {
    await startServer(args.options.verbose, args.options.mode);
  }
}

/**
 * Handles the review command for PR review (dogfooding).
 */
export async function handleReviewCommand(args: ParsedCliArgs): Promise<void> {
  // Get PR URL from positionals (review <url>)
  const prUrl = args.positionals[1];
  if (prUrl === undefined) {
    process.stdout.write('Error: PR URL is required.\n');
    process.stdout.write('Usage: nexus-agents review <url> [options]\n');
    process.stdout.write('Examples:\n');
    process.stdout.write('  nexus-agents review https://github.com/owner/repo/pull/123\n');
    process.stdout.write('  nexus-agents review owner/repo#123 --dry-run\n');
    process.exit(EXIT_CODES.INVALID_ARGS);
  }

  const exitCode = await reviewCommand({
    prUrl,
    dryRun: args.options.dryRun,
    verbose: args.options.verbose,
  });
  process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

/**
 * Handles the routing-audit command for debugging model selection.
 */
export function handleRoutingAuditCommand(args: ParsedCliArgs): void {
  // Get task from positionals (routing-audit <task>)
  const task = args.positionals[1];
  if (task === undefined) {
    process.stdout.write('Error: Task description is required.\n');
    process.stdout.write('Usage: nexus-agents routing-audit <task> [options]\n');
    process.stdout.write('Examples:\n');
    process.stdout.write('  nexus-agents routing-audit "Implement a complex algorithm"\n');
    process.stdout.write('  nexus-agents routing-audit "Review this code" --verbose\n');
    process.stdout.write('  nexus-agents routing-audit "Generate tests" --format=json\n');
    process.exit(EXIT_CODES.INVALID_ARGS);
  }

  const exitCode = routingAuditCommand({
    task,
    explain: args.options.verbose,
    deterministic: args.options.dryRun,
    json: args.options.format === 'json',
    verbose: args.options.verbose,
    banditStats: args.options.banditStats,
  });
  process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

/**
 * Validates model option for orchestrate command.
 */
function isValidOrchestrateModel(value: string): value is 'claude' | 'gemini' | 'codex' {
  return ['claude', 'gemini', 'codex'].includes(value);
}

/**
 * Handles the orchestrate command for standalone CLI execution.
 * (Source: Issue #183, 5-0 consensus vote)
 */
export async function handleOrchestrateCommand(args: ParsedCliArgs): Promise<void> {
  // Get task from positionals (orchestrate <task>)
  const task = args.positionals[1];
  if (task === undefined) {
    process.stdout.write('Error: Task description is required.\n');
    process.stdout.write('Usage: nexus-agents orchestrate <task> [options]\n');
    process.stdout.write('Examples:\n');
    process.stdout.write('  nexus-agents orchestrate "Explain this function"\n');
    process.stdout.write('  nexus-agents orchestrate "Generate tests" --model=claude\n');
    process.stdout.write('  nexus-agents orchestrate "Refactor code" --dry-run\n');
    process.exit(EXIT_CODES.INVALID_ARGS);
  }

  // Parse optional model
  const model = args.options.model;
  const validModel = model !== undefined && isValidOrchestrateModel(model) ? model : undefined;

  // Parse format
  const format = args.options.format === 'json' ? 'json' : 'text';

  // Parse numeric options
  const maxTokens = args.options.maxTokens;
  const maxCostUsd = args.options.maxCostUsd;

  const exitCode = await orchestrateCommand({
    task,
    model: validModel,
    format,
    verbose: args.options.verbose,
    dryRun: args.options.dryRun,
    maxTokens,
    maxCostUsd,
  });
  process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

/**
 * Handles the system-review command for automated system review.
 * (Source: Issue #211, Process Automation Epic #209)
 */
export function handleSystemReviewCommand(args: ParsedCliArgs): void {
  const exitCode = systemReviewCommand({
    createIssue: args.options.createIssue,
    fix: args.options.fix,
    verbose: args.options.verbose,
  });
  process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

/**
 * Validates threshold option for vote command.
 */
function isValidThreshold(value: string): value is 'majority' | 'supermajority' | 'unanimous' {
  return ['majority', 'supermajority', 'unanimous'].includes(value);
}

/**
 * Handles the vote command for consensus voting.
 * (Source: Issue #212, Process Automation Epic #209)
 */
export async function handleVoteCommand(args: ParsedCliArgs): Promise<void> {
  const proposal = args.options.proposal;
  if (proposal === undefined) {
    process.stdout.write('Error: Proposal is required.\n');
    process.stdout.write('Usage: nexus-agents vote --proposal "..." [options]\n');
    process.stdout.write('Examples:\n');
    process.stdout.write('  nexus-agents vote --proposal "Add feature X"\n');
    process.stdout.write('  nexus-agents vote -p "Proposal" -t supermajority\n');
    process.stdout.write('  nexus-agents vote -p "Quick decision" --quick\n');
    process.exit(EXIT_CODES.INVALID_ARGS);
  }

  const threshold = args.options.threshold;
  const validThreshold =
    threshold !== undefined && isValidThreshold(threshold) ? threshold : undefined;

  const exitCode = await voteCommand({
    proposal,
    ...(validThreshold !== undefined && { threshold: validThreshold }),
    dryRun: args.options.dryRun,
    quick: args.options.quick,
    verbose: args.options.verbose,
  });
  process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

/**
 * Validates index subcommand.
 */
function isValidIndexSubcommand(value: string | undefined): value is IndexSubcommand {
  const validSubcommands = [
    'generate',
    'check',
    'diagram',
    'validate',
    'entrypoints',
    'freshness',
    'links',
  ];
  return value !== undefined && validSubcommands.includes(value);
}

/**
 * Validates output format for index command.
 */
function isValidIndexFormat(value: string): value is 'yaml' | 'json' {
  return value === 'yaml' || value === 'json';
}

/**
 * Handles the index command for codebase indexing.
 * (Source: Issue #240)
 */
export async function handleIndexCommand(args: ParsedCliArgs): Promise<void> {
  const subcommand = args.subcommand;
  if (!isValidIndexSubcommand(subcommand)) {
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
    process.exit(EXIT_CODES.INVALID_ARGS);
  }

  const format = isValidIndexFormat(args.options.format) ? args.options.format : undefined;

  const result = await indexCommand({
    subcommand,
    ...(format !== undefined && { format }),
    ...(args.options.output !== undefined && { output: args.options.output }),
    ...(args.options.verbose && { verbose: args.options.verbose }),
  });

  process.stdout.write(formatIndexResult(result) + '\n');
  process.exit(result.success ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

/**
 * Validates output format for research command.
 */
function isValidResearchFormat(value: string): value is 'table' | 'json' {
  return value === 'table' || value === 'json';
}

/**
 * Handles the research command for research registry management.
 * (Source: Issue #237, Epic #225, Epic #261)
 */
export async function handleResearchCommand(args: ParsedCliArgs): Promise<void> {
  const subcommand = args.subcommand;
  if (!isValidResearchSubcommand(subcommand)) {
    process.stdout.write('Error: Research subcommand is required.\n');
    process.stdout.write('Usage: nexus-agents research <subcommand> [options]\n');
    process.stdout.write('Subcommands:\n');
    process.stdout.write(
      '  status [id]      Show technique status (optional: specific technique)\n'
    );
    process.stdout.write('  overlap <id>     Find overlapping techniques\n');
    process.stdout.write('  add <arxiv-id>   Add paper from arXiv\n');
    process.stdout.write('  stats            Show research statistics\n');
    process.stdout.write('  refresh          Regenerate RESEARCH_INDEX.md\n');
    process.stdout.write('  check            Check if index is up to date\n');
    process.exit(EXIT_CODES.INVALID_ARGS);
  }

  // Get positional args after subcommand (research <subcommand> [args...])
  const positionalArgs = args.positionals.slice(2);

  // Build options from parsed args
  const options: Record<string, unknown> = {};
  options['format'] = isValidResearchFormat(args.options.format) ? args.options.format : 'table';
  if (args.options.output !== undefined) {
    options['output'] = args.options.output;
  }
  if (args.options.dryRun) {
    options['dryRun'] = true;
  }

  try {
    const result = await researchCommand(subcommand, positionalArgs, options);
    process.stdout.write(result + '\n');
    process.exit(EXIT_CODES.SUCCESS);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`Error: ${message}\n`);
    process.exit(EXIT_CODES.SERVER_START_FAILED);
  }
}

/**
 * Handles synchronous commands that don't require await.
 * Returns true if the command was handled.
 */
function handleSyncCommand(args: ParsedCliArgs): boolean {
  switch (args.command) {
    case 'help':
      printHelp();
      process.exit(EXIT_CODES.SUCCESS);
      return true;
    case 'version':
      printVersion();
      process.exit(EXIT_CODES.SUCCESS);
      return true;
    case 'expert':
      handleExpertCommand(args);
      return true;
    case 'routing-audit':
      handleRoutingAuditCommand(args);
      return true;
    case 'system-review':
      handleSystemReviewCommand(args);
      return true;
    default:
      return false;
  }
}

/**
 * Handles doctor command separately to manage exit code.
 */
async function handleDoctorCommandInternal(_args: ParsedCliArgs): Promise<void> {
  const exitCode = await doctorCommand();
  process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

/** Async command dispatch table for reduced complexity. */
const ASYNC_COMMAND_HANDLERS: Record<string, ((args: ParsedCliArgs) => Promise<void>) | undefined> =
  {
    server: handleServerCommand,
    doctor: handleDoctorCommandInternal,
    config: handleConfigCommand,
    workflow: handleWorkflowCommand,
    review: handleReviewCommand,
    orchestrate: handleOrchestrateCommand,
    vote: handleVoteCommand,
    index: handleIndexCommand,
    research: handleResearchCommand,
  };

/**
 * Handles async commands that require await.
 */
async function handleAsyncCommand(args: ParsedCliArgs): Promise<void> {
  const handler = ASYNC_COMMAND_HANDLERS[args.command];
  if (handler !== undefined) {
    await handler(args);
  }
}

/**
 * Dispatches to the appropriate command handler.
 *
 * @param args - Parsed CLI arguments
 */
export async function dispatchCommand(args: ParsedCliArgs): Promise<void> {
  if (!handleSyncCommand(args)) {
    await handleAsyncCommand(args);
  }
}
