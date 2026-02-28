/* eslint-disable max-lines */
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
  expertListCommand,
  workflowRunCommand,
  printWorkflowTemplates,
  replCommand,
  reviewDemoCommand,
  routingAuditCommand,
  systemReviewCommand,
  voteCommand,
  indexCommand,
  formatIndexResult,
  researchCommand,
  validationDashboardCommand,
  parseValidationArgs,
  verifyCommand,
  learningMetricsCommand,
  setupCommand,
  setupCommandAsync,
  helloCommand,
  demoCommand,
  // Issue #526: Newly wired commands
  sprintCommand,
  sessionCommand,
  evaluateCommand,
  issueCommand,
  // System Mandate LOOP I: Fitness Audit
  fitnessAuditCommand,
} from './cli/index.js';
import { hookCommand, printHookHelp } from './cli/hooks/index.js';
import { runWarmUp } from './cli/warm-up.js';
import { runE2EEval, formatE2EEvalResult } from './cli/e2e-eval.js';
import { runRoutingAB, formatABReport } from './cli/routing-ab.js';
import { runMemoryEval, formatMemoryEvalReport } from './cli/memory-eval.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { EXIT_CODES, type ParsedCliArgs } from './cli-types.js';
import { startServer, type OrchestratorModeOptions } from './cli-server.js';
import {
  isValidExpertListFormat,
  isValidThreshold,
  isValidIndexSubcommand,
  isValidIndexFormat,
  isValidResearchFormat,
  isValidResearchSubcommand,
} from './cli-commands-validators.js';
import {
  printWorkflowRunUsage,
  printRoutingAuditUsage,
  printVoteUsage,
  printIndexUsage,
  printResearchUsage,
} from './cli-commands-usage.js';
import { getErrorMessage } from './core/index.js';

// Re-export complex handlers for backward compatibility
export {
  handleConfigCommand,
  handleOrchestrateCommand,
  handleSweBenchCommand,
} from './cli-commands-handlers-complex.js';

/**
 * Handles unimplemented commands with a coming soon message.
 */
export function handleUnimplementedCommand(command: string): void {
  process.stdout.write(`The '${command}' command is coming soon.\n`);
  process.stdout.write('Run "nexus-agents --help" for available options.\n');
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
 * Builds orchestrator mode options from CLI args.
 * (Source: Issue #446 - Implement orchestrator mode)
 */
function buildOrchestratorOptions(args: ParsedCliArgs): OrchestratorModeOptions {
  return {
    verbose: args.options.verbose,
    format: args.options.format === 'json' ? 'json' : 'text',
    dryRun: args.options.dryRun,
    ...(args.options.task !== undefined && { task: args.options.task }),
    ...(args.options.model !== undefined && { model: args.options.model }),
    ...(args.options.maxTokens !== undefined && { maxTokens: args.options.maxTokens }),
    ...(args.options.maxCostUsd !== undefined && { maxCostUsd: args.options.maxCostUsd }),
  };
}

/** Prints a first-run hint to stderr when no setup has been done (#1261). */
function printFirstRunHint(): void {
  const isTTY = process.stderr.isTTY;
  if (!isTTY) return;
  const dataDir = join(homedir(), '.nexus-agents');
  const hasConfig = existsSync('./nexus-agents.yaml') || existsSync('./nexus-agents.yml');
  if (existsSync(dataDir) || hasConfig) return;
  process.stderr.write(
    '\n\x1b[36mnexus-agents\x1b[0m: First time? Run \x1b[1mnexus-agents setup\x1b[0m to configure.\n\n'
  );
}

/**
 * Handles the server command (default mode or interactive REPL).
 * In orchestrator mode, executes tasks directly without MCP server.
 * (Source: Issue #446 - Implement orchestrator mode)
 */
export async function handleServerCommand(args: ParsedCliArgs): Promise<void> {
  printFirstRunHint();
  if (args.options.interactive) {
    const exitCode = await replCommand({ verbose: args.options.verbose });
    process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
  } else if (args.options.mode === 'orchestrator') {
    // Orchestrator mode: execute tasks directly (Issue #446)
    const orchestratorOptions = buildOrchestratorOptions(args);
    await startServer(args.options.verbose, args.options.mode, true, orchestratorOptions);
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
    const message = getErrorMessage(error);
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
export async function handleDoctorCommand(args: ParsedCliArgs): Promise<void> {
  const exitCode = await doctorCommand({ fix: args.options.fix });
  if (args.options.deep) {
    const { runDeepDiagnostics, formatDeepDiagnostics } = await import('./cli/doctor-deep.js');
    const diag = runDeepDiagnostics();
    process.stdout.write(formatDeepDiagnostics(diag) + '\n');
  }
  process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

/**
 * Handles setup command for Claude CLI integration (sync version).
 * (Source: Issue #363 - Auto-configure Claude CLI integration)
 * (Source: Issue #416 - Setup command hook configuration)
 */
export function handleSetupCommand(args: ParsedCliArgs): void {
  const exitCode = setupCommand({
    nonInteractive: args.options.nonInteractive,
    force: args.options.force,
    skipMcp: args.options.skipMcp,
    skipRules: args.options.skipRules,
    skipHooks: args.options.skipHooks,
    skipConfig: args.options.skipConfig,
    skipOpencode: args.options.skipOpencode,
    skipGemini: args.options.skipGemini,
    skipCodex: args.options.skipCodex,
    dryRun: args.options.dryRun,
    verbose: args.options.verbose,
    scope: args.options.scope === 'project' ? 'project' : 'user',
  });
  process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

/**
 * Handles setup command with interactive wizard support (async version).
 * (Source: Issue #425 - Interactive setup wizard)
 */
export async function handleSetupCommandAsync(args: ParsedCliArgs): Promise<void> {
  const exitCode = await setupCommandAsync({
    interactive: args.options.interactive,
    nonInteractive: args.options.nonInteractive,
    force: args.options.force,
    skipMcp: args.options.skipMcp,
    skipRules: args.options.skipRules,
    skipHooks: args.options.skipHooks,
    skipConfig: args.options.skipConfig,
    skipOpencode: args.options.skipOpencode,
    skipGemini: args.options.skipGemini,
    skipCodex: args.options.skipCodex,
    dryRun: args.options.dryRun,
    verbose: args.options.verbose,
    scope: args.options.scope === 'project' ? 'project' : 'user',
  });
  process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

/**
 * Handles hello command for quick introduction.
 * (Source: Issue #423 - Hello World Command)
 */
export function handleHelloCommand(_args: ParsedCliArgs): void {
  const exitCode = helloCommand();
  process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

/**
 * Handles demo command for API-free exploration.
 * (Source: Issue #424 - Demo mode for API-free exploration)
 */
export async function handleDemoCommand(args: ParsedCliArgs): Promise<void> {
  // Get subcommand from positionals (demo <subcommand> [args...])
  const subcommand = args.subcommand;
  const additionalArgs = args.positionals.slice(2);
  const options = {
    mock: args.options.mock,
  };
  const exitCode = await demoCommand(subcommand, additionalArgs, options);
  process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

/**
 * Handles hooks command for Claude CLI hook integration.
 * (Source: Issue #411 - Claude CLI Hook Integration Commands)
 */
export async function handleHooksCommand(args: ParsedCliArgs): Promise<void> {
  // If --help flag or no subcommand, print help
  if (args.options.help || args.positionals.length < 2) {
    printHookHelp();
    process.exit(EXIT_CODES.SUCCESS);
  }

  // Pass remaining args to hook command (hooks <subcommand> [options...])
  const hookArgs = args.positionals.slice(1);
  const exitCode = await hookCommand(hookArgs);
  process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

// ============================================================================
// Issue #526: Newly Wired Commands
// ============================================================================

/**
 * Handles sprint command for automated sprint planning.
 * (Source: Issue #230, Epic #225)
 */
export async function handleSprintCommand(args: ParsedCliArgs): Promise<void> {
  const subcommand = args.subcommand;
  if (subcommand !== 'plan' && subcommand !== 'list') {
    process.stdout.write('Usage: nexus-agents sprint <plan|list> [options]\n');
    process.stdout.write('\nSubcommands:\n');
    process.stdout.write('  plan    Generate sprint proposal from open issues\n');
    process.stdout.write('  list    Show prioritized backlog\n');
    process.stdout.write('\nOptions:\n');
    process.stdout.write('  --vote          Run consensus vote on proposal\n');
    process.stdout.write('  --create-issue  Create GitHub issue if approved\n');
    process.stdout.write('  --dry-run       Preview without side effects\n');
    process.stdout.write('  --format        Output format (text|json)\n');
    process.exit(EXIT_CODES.INVALID_ARGS);
  }

  // Build options based on flags
  const sprintOpts: {
    subcommand: 'plan' | 'list';
    vote?: boolean;
    createIssue?: boolean;
    format?: 'text' | 'json';
    dryRun?: boolean;
  } = {
    subcommand,
    format: args.options.format === 'json' ? 'json' : 'text',
  };
  if (args.options.createIssue) {
    sprintOpts.vote = true;
    sprintOpts.createIssue = true;
  }
  if (args.options.dryRun) {
    sprintOpts.dryRun = true;
  }
  const exitCode = await sprintCommand(sprintOpts);
  process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

/**
 * Handles session command for session management.
 * (Source: Issue #190 - CLI session persistence with SQLite)
 */
export async function handleSessionCommand(args: ParsedCliArgs): Promise<void> {
  const subcommand = args.subcommand;
  if (
    subcommand !== 'list' &&
    subcommand !== 'show' &&
    subcommand !== 'export' &&
    subcommand !== 'delete' &&
    subcommand !== 'prune'
  ) {
    process.stdout.write('Usage: nexus-agents session <subcommand> [options]\n');
    process.stdout.write('\nSubcommands:\n');
    process.stdout.write('  list     List sessions\n');
    process.stdout.write('  show     Show session details\n');
    process.stdout.write('  export   Export session to file\n');
    process.stdout.write('  delete   Delete a session\n');
    process.stdout.write('  prune    Delete old sessions\n');
    process.stdout.write('\nOptions:\n');
    process.stdout.write('  --limit <n>     Limit results (default: 20)\n');
    process.stdout.write('  --format        Output format (table|json)\n');
    process.stdout.write('  --output <path> Output file path\n');
    process.exit(EXIT_CODES.INVALID_ARGS);
  }

  // Pass remaining args after subcommand to sessionCommand
  const remainingArgs = args.positionals.slice(2);
  await sessionCommand(subcommand, remainingArgs);
  // sessionCommand handles its own exit
}

/**
 * Handles evaluate command for self-evaluation.
 * (Source: Issue #140, Self-Evaluation MVP)
 */
export async function handleEvaluateCommand(args: ParsedCliArgs): Promise<void> {
  // Build args array for evaluateCommand
  const evalArgs: string[] = [];

  // Map CLI options to evaluate command args
  if (args.options.verbose) evalArgs.push('--verbose');
  if (args.options.format === 'json') evalArgs.push('--json');

  // Get target from positionals (evaluate <target>)
  const target = args.positionals[1];
  if (target !== undefined) {
    evalArgs.push('--target', target);
  }

  const exitCode = await evaluateCommand(evalArgs);
  process.exit(
    exitCode === 0
      ? EXIT_CODES.SUCCESS
      : exitCode === 1
        ? EXIT_CODES.SERVER_START_FAILED
        : EXIT_CODES.SHUTDOWN_ERROR
  );
}

/**
 * Handles issue command for issue template management.
 * (Source: Issue #229, Epic #225)
 */
export function handleIssueCommand(args: ParsedCliArgs): void {
  const subcommand = args.subcommand;
  if (subcommand !== 'validate' && subcommand !== 'create') {
    process.stdout.write('Usage: nexus-agents issue <subcommand> [options]\n');
    process.stdout.write('\nSubcommands:\n');
    process.stdout.write('  validate <number>  Validate issue against template\n');
    process.stdout.write('  create <type>      Show issue template for creating\n');
    process.stdout.write('\nTypes: feat, bug, task, refactor, docs\n');
    process.exit(EXIT_CODES.INVALID_ARGS);
  }

  // Get issue number or template type from positionals
  const arg = args.positionals[2];
  if (arg === undefined) {
    process.stdout.write('Error: Missing argument\n');
    process.exit(EXIT_CODES.INVALID_ARGS);
  }

  // Build options based on subcommand
  const format: 'text' | 'json' = args.options.format === 'json' ? 'json' : 'text';

  if (subcommand === 'validate') {
    const issueNumber = parseInt(arg, 10);
    if (isNaN(issueNumber)) {
      process.stdout.write('Error: Invalid issue number\n');
      process.exit(EXIT_CODES.INVALID_ARGS);
    }
    const exitCode = issueCommand({
      subcommand: 'validate',
      issueNumber,
      format,
    });
    process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
  } else {
    // create subcommand
    const validTypes = ['feat', 'bug', 'task', 'refactor', 'docs'];
    const type = validTypes.includes(arg)
      ? (arg as 'feat' | 'bug' | 'task' | 'refactor' | 'docs')
      : 'feat';
    const exitCode = issueCommand({
      subcommand: 'create',
      type,
      format,
    });
    process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
  }
}

// ============================================================================
// System Mandate LOOP I: Fitness Audit Command
// ============================================================================

/**
 * Handles fitness-audit command for CLI orchestration fitness scoring.
 * (Source: System Mandate LOOP I)
 */
export function handleFitnessAuditCommand(args: ParsedCliArgs): void {
  const exitCode = fitnessAuditCommand({
    json: args.options.format === 'json',
  });
  process.exit(exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

// ============================================================================
// Issue #1023: Warm-Up Command
// ============================================================================

/**
 * Handles warm-up command for LinUCB bandit cold-start seeding.
 * (Source: Issue #1023 — Bootstrap LinUCB with synthetic outcomes)
 */
export function handleWarmUpCommand(_args: ParsedCliArgs): void {
  const result = runWarmUp();
  const msg = result.skipped
    ? `Warm-up skipped: ${result.reason ?? 'already seeded'}`
    : `Seeded with ${String(result.seeded)} synthetic observations`;
  process.stdout.write(msg + '\n');
  process.exit(EXIT_CODES.SUCCESS);
}

/**
 * Handles e2e-eval command for learning loop validation.
 * (Source: Issue #1030 — E2E scenario runner)
 */
export function handleE2EEvalCommand(args: ParsedCliArgs): void {
  const countArg = args.positionals[1];
  const taskCount = countArg !== undefined ? parseInt(countArg, 10) : 50;
  const count = Number.isNaN(taskCount) || taskCount <= 0 ? 50 : taskCount;
  const result = runE2EEval({ taskCount: count });
  process.stdout.write(formatE2EEvalResult(result) + '\n');
  process.exit(result.passed ? EXIT_CODES.SUCCESS : 1);
}

/**
 * Handles routing-ab command for A/B comparison of routing strategies.
 * (Source: Issue #1033 — Routing strategy A/B framework)
 */
export function handleRoutingABCommand(args: ParsedCliArgs): void {
  const countArg = args.positionals[1];
  const taskCount = countArg !== undefined ? parseInt(countArg, 10) : 30;
  const count = Number.isNaN(taskCount) || taskCount <= 0 ? 30 : taskCount;
  const result = runRoutingAB({ taskCount: count });
  process.stdout.write(formatABReport(result) + '\n');
  process.exit(EXIT_CODES.SUCCESS);
}

/**
 * Handles memory-eval command for comparative memory evaluation.
 * (Source: Issue #1034 — Comparative memory evaluation benchmark)
 */
export function handleMemoryEvalCommand(args: ParsedCliArgs): void {
  const sizeArg = args.positionals[1];
  const size = sizeArg !== undefined ? parseInt(sizeArg, 10) : 50;
  const count = Number.isNaN(size) || size <= 0 ? 50 : size;
  const result = runMemoryEval(count);
  process.stdout.write(formatMemoryEvalReport(result) + '\n');
  process.exit(EXIT_CODES.SUCCESS);
}
