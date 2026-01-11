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
  type ExpertListFormat,
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
    default:
      return false;
  }
}

/**
 * Handles async commands that require await.
 */
async function handleAsyncCommand(args: ParsedCliArgs): Promise<void> {
  switch (args.command) {
    case 'server':
      await handleServerCommand(args);
      break;
    case 'doctor': {
      const exitCode = await doctorCommand();
      process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
      break;
    }
    case 'config':
      await handleConfigCommand(args);
      break;
    case 'workflow':
      await handleWorkflowCommand(args);
      break;
    case 'review':
      await handleReviewCommand(args);
      break;
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
