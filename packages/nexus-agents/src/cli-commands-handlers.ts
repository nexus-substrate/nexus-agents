/**
 * nexus-agents CLI Command Handlers
 *
 * Individual command handler implementations extracted from cli-commands.ts.
 *
 * @module cli-commands-handlers
 * (Source: Extracted from cli-commands.ts per Issue #285)
 */

import {
  doctorCommand,
  configInitCommand,
  expertListCommand,
  workflowRunCommand,
  printWorkflowTemplates,
  replCommand,
  reviewDemoCommand,
  routingAuditCommand,
  orchestrateCommand,
  systemReviewCommand,
  voteCommand,
  indexCommand,
  formatIndexResult,
  researchCommand,
  validationDashboardCommand,
  parseValidationArgs,
  verifyCommand,
  sweBenchCommand,
  learningMetricsCommand,
  setupCommand,
} from './cli/index.js';
import { EXIT_CODES, type ParsedCliArgs } from './cli-types.js';
import { startServer } from './cli-server.js';
import {
  isValidExpertListFormat,
  isValidOrchestrateModel,
  isValidThreshold,
  isValidIndexSubcommand,
  isValidIndexFormat,
  isValidResearchFormat,
  isValidResearchSubcommand,
} from './cli-commands-validators.js';
import {
  printWorkflowRunUsage,
  printRoutingAuditUsage,
  printOrchestrateUsage,
  printVoteUsage,
  printIndexUsage,
  printResearchUsage,
} from './cli-commands-usage.js';

/**
 * Handles unimplemented commands with a coming soon message.
 */
export function handleUnimplementedCommand(command: string): void {
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
      printWorkflowRunUsage();
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
 * Enhanced with setup wizard and pre-flight checks (Issue #258).
 */
export async function handleReviewCommand(args: ParsedCliArgs): Promise<void> {
  // Get PR URL from positionals (review <url>) - optional with --setup
  const prUrl = args.positionals[1] ?? '';

  const exitCode = await reviewDemoCommand({
    prUrl,
    setup: args.options.setup,
    dryRun: args.options.dryRun,
    verbose: args.options.verbose,
    skipChecks: args.options.skipChecks,
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
    printRoutingAuditUsage();
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
 * Handles the orchestrate command for standalone CLI execution.
 * (Source: Issue #183, 5-0 consensus vote)
 */
export async function handleOrchestrateCommand(args: ParsedCliArgs): Promise<void> {
  // Get task from positionals (orchestrate <task>)
  const task = args.positionals[1];
  if (task === undefined) {
    printOrchestrateUsage();
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
 * Handles the vote command for consensus voting.
 * (Source: Issue #212, Process Automation Epic #209)
 */
export async function handleVoteCommand(args: ParsedCliArgs): Promise<void> {
  const proposal = args.options.proposal;
  if (proposal === undefined) {
    printVoteUsage();
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
 * Handles the index command for codebase indexing.
 * (Source: Issue #240)
 */
export async function handleIndexCommand(args: ParsedCliArgs): Promise<void> {
  const subcommand = args.subcommand;
  if (!isValidIndexSubcommand(subcommand)) {
    printIndexUsage();
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
 * Handles the research command for research registry management.
 * (Source: Issue #237, Epic #225, Epic #261)
 */
export async function handleResearchCommand(args: ParsedCliArgs): Promise<void> {
  const subcommand = args.subcommand;
  if (!isValidResearchSubcommand(subcommand)) {
    printResearchUsage();
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
 * Handles the validation command for learning validation dashboard.
 * (Source: Issue #273)
 */
export function handleValidationCommand(args: ParsedCliArgs): void {
  const options = parseValidationArgs(args.positionals, args.options.format, args.options.verbose);
  const exitCode = validationDashboardCommand(options);
  process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

/**
 * Handles the learning-metrics command for aggregated learning dashboard.
 * (Source: Issue #284)
 */
export function handleLearningMetricsCommand(args: ParsedCliArgs): void {
  const format: 'ascii' | 'json' = args.options.format === 'json' ? 'json' : 'ascii';
  const exitCode = learningMetricsCommand({
    period: args.options.period ?? 24,
    format,
    banditStats: args.options.banditStats,
    showTrends: args.options.noTrends !== true,
    ...(args.options.export !== undefined && { exportPath: args.options.export }),
  });
  process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

/**
 * Handles the swe-bench command for benchmark evaluation.
 * (Source: Issue #257 - SWE-Bench Evaluation)
 */
export async function handleSweBenchCommand(args: ParsedCliArgs): Promise<void> {
  // Build args array from parsed options for sweBenchCommand
  const subArgs: string[] = [];

  // Add subcommand (run, status, info, evaluate)
  const subcommand = args.positionals[1] ?? 'run';
  subArgs.push(subcommand);

  // Add parsed options
  if (args.options.variant !== undefined) {
    subArgs.push(`--variant=${args.options.variant}`);
  }
  if (args.options.limit !== undefined) {
    subArgs.push(`--limit=${String(args.options.limit)}`);
  }
  if (args.options.output !== undefined) {
    subArgs.push(`--output=${args.options.output}`);
  }
  if (args.options.resume) {
    subArgs.push('--resume');
  }
  if (args.options.verbose) {
    subArgs.push('--verbose');
  }
  if (args.options.instance !== undefined) {
    for (const inst of args.options.instance) {
      subArgs.push(`--instance=${inst}`);
    }
  }

  const exitCode = await sweBenchCommand(subArgs);
  process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

/**
 * Handles the verify command for quick installation verification.
 * (Source: Issue #253)
 */
export async function handleVerifyCommand(args: ParsedCliArgs): Promise<void> {
  const exitCode = await verifyCommand({ verbose: args.options.verbose });
  process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

/**
 * Handles doctor command (extracted for dispatch table).
 */
export async function handleDoctorCommand(_args: ParsedCliArgs): Promise<void> {
  const exitCode = await doctorCommand();
  process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

/**
 * Handles setup command for Claude CLI integration.
 * (Source: Issue #363 - Auto-configure Claude CLI integration)
 */
export function handleSetupCommand(args: ParsedCliArgs): void {
  const exitCode = setupCommand({
    nonInteractive: args.options.nonInteractive,
    force: args.options.force,
    skipMcp: args.options.skipMcp,
    skipRules: args.options.skipRules,
    dryRun: args.options.dryRun,
    verbose: args.options.verbose,
    scope: args.options.scope === 'project' ? 'project' : 'user',
  });
  process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}
