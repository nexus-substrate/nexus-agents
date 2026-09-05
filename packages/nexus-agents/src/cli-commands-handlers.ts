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
  // Issue #2851: nexus-agents tour
  runTour,
  interactiveIO,
  scriptedIO,
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
import { initPortable, formatInitPortableMessage } from './cli/init-portable.js';
import {
  EXIT_CODES,
  cliExit,
  cliExitFromStatus,
  LIFECYCLE_DELEGATED,
  type CliExitResult,
  type LifecycleDelegated,
  type ParsedCliArgs,
} from './cli-types.js';
import { startServer, type OrchestratorModeOptions } from './cli-server.js';
import type { VoteCommandOptions } from './cli/vote-types.js';
import {
  isValidExpertListFormat,
  isValidThreshold,
  isValidErrorPolicy,
  isValidIndexSubcommand,
  isValidIndexFormat,
  isValidResearchFormat,
  isValidResearchSubcommand,
  parsePositiveInt,
} from './cli-commands-validators.js';
import {
  printWorkflowRunUsage,
  printRoutingAuditUsage,
  printVoteUsage,
  printIndexUsage,
  printResearchUsage,
} from './cli-commands-usage.js';
import { getErrorMessage } from './core/index.js';
import { suggestCommand } from './cli-command-suggester.js';
import { ResearchDiscoverInputSchema } from './mcp/tools/research-discover.js';

// Re-export complex handlers for backward compatibility
export {
  handleConfigCommand,
  handleOrchestrateCommand,
  handleSweBenchCommand,
  handleAtbenchCommand,
} from './cli-commands-handlers-complex.js';

/**
 * Handles unimplemented CLI subcommands. Writes to stderr (not stdout) so
 * a shell script piping stdout doesn't silently consume the notice, and
 * the caller is expected to follow up by returning
 * `cliExit(EXIT_CODES.NOT_IMPLEMENTED)` (the dispatcher then exits with it).
 *
 * Pre-#2727 this wrote to stdout and callers exited with EXIT_CODES.SUCCESS —
 * automation scripts couldn't tell that nothing happened.
 *
 * Where possible we name the equivalent MCP tool the user CAN call today
 * (e.g. `expert create` → `create_expert` MCP tool), so the message
 * carries an escape hatch.
 */
const MCP_EQUIVALENTS: Record<string, string> = {
  'expert create': 'create_expert',
  'expert execute': 'execute_expert',
};

/**
 * Implemented subcommands per top-level command, keyed by top-level name. Used
 * only to power the "Did you mean?" hint: a mistyped subcommand
 * (`workflow lst`) resolves to the closest *built* one (`workflow list`), while
 * a recognized-but-unbuilt subcommand (`expert create`) has no close match and
 * stays silent rather than guessing. Keep in sync with the dispatch switches in
 * `handleExpertCommand` / `handleWorkflowCommand` below.
 */
const IMPLEMENTED_SUBCOMMANDS: Record<string, readonly string[]> = {
  expert: ['list'],
  workflow: ['list', 'run'],
};

/**
 * The repo's own issue tracker — where a user can file or upvote a
 * recognized-but-unbuilt command. Deliberately generic (no per-command issue
 * mapping to drift): the tracker is the single durable pointer.
 */
const TRACKING_ISSUES_URL = 'https://github.com/nexus-substrate/nexus-agents/issues';

/**
 * Emits a `Did you mean: <top> <sub>?` line to stderr when the unimplemented
 * `command` (`"<top> <sub>"`) has a mistyped subcommand within edit-distance of
 * an implemented sibling. Reuses the Levenshtein-backed `suggestCommand` matcher
 * (#3211) so the threshold/ranking matches the top-level unknown-command path.
 * No-op when the top-level command has no implemented-subcommand table, the
 * subcommand is empty, or nothing is close (avoids bogus suggestions).
 */
function writeSubcommandSuggestion(command: string): void {
  const [topLevel, ...subParts] = command.split(' ');
  const subcommand = subParts.join(' ');
  if (topLevel === undefined || subcommand.length === 0) return;
  const validSubcommands = IMPLEMENTED_SUBCOMMANDS[topLevel];
  if (validSubcommands === undefined) return;
  const suggestions = suggestCommand(subcommand, validSubcommands);
  if (suggestions.length === 0) return;
  const rendered = suggestions.map((sub) => `${topLevel} ${sub}`).join(', ');
  process.stderr.write(`Did you mean: ${rendered}?\n`);
}

export function handleUnimplementedCommand(command: string): void {
  const equiv = MCP_EQUIVALENTS[command];
  process.stderr.write(`The '${command}' CLI subcommand is not yet implemented.\n`);
  if (equiv !== undefined) {
    process.stderr.write(
      `Equivalent today: run \`nexus-agents --mode=server\` and call the \`${equiv}\` MCP tool.\n`
    );
  }
  writeSubcommandSuggestion(command);
  // #3207: point users at the tracker so a wanted-but-unbuilt command gets
  // filed/upvoted instead of silently dropped.
  process.stderr.write(`Track or request this command: ${TRACKING_ISSUES_URL}\n`);
  process.stderr.write('Run "nexus-agents --help" for available options.\n');
}

/**
 * Handles the expert command and its subcommands.
 */
export function handleExpertCommand(args: ParsedCliArgs): CliExitResult {
  if (args.subcommand === 'list') {
    const format = isValidExpertListFormat(args.options.format) ? args.options.format : 'table';
    return cliExitFromStatus(expertListCommand({ format }));
  }
  handleUnimplementedCommand(`expert ${args.subcommand ?? ''}`);
  return cliExit(EXIT_CODES.NOT_IMPLEMENTED);
}

/**
 * Handles the workflow command and its subcommands.
 */
export async function handleWorkflowCommand(args: ParsedCliArgs): Promise<CliExitResult> {
  if (args.subcommand === 'list') {
    // #2726 A: respect --format=json. Pre-fix the flag parsed but the
    // dispatcher never forwarded it to printWorkflowTemplates, so the
    // table form rendered regardless.
    const format = args.options.format === 'json' ? 'json' : 'table';
    await printWorkflowTemplates({ format });
    return cliExit(EXIT_CODES.SUCCESS);
  } else if (args.subcommand === 'run') {
    // Get workflow name from positionals (workflow run <name>)
    const workflowName = args.positionals[2];
    if (workflowName === undefined) {
      printWorkflowRunUsage();
      return cliExit(EXIT_CODES.INVALID_ARGS);
    }

    const exitCode = await workflowRunCommand({
      name: workflowName,
      input: args.options.input,
      dryRun: args.options.dryRun,
      verbose: args.options.verbose,
    });
    return cliExitFromStatus(exitCode);
  }
  handleUnimplementedCommand(`workflow ${args.subcommand ?? ''}`);
  return cliExit(EXIT_CODES.NOT_IMPLEMENTED);
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

/**
 * Handles the server command (default mode or interactive REPL).
 * In orchestrator mode, executes tasks directly without MCP server.
 * (Source: Issue #446 - Implement orchestrator mode)
 *
 * The first-run setup hint moved out of here in #3208 — it now fires from the
 * CLI dispatch seam (`dispatchCommand` → `maybeShowFirstRunHint`) for ALL
 * commands except version/help/setup, not just `server`.
 */
export async function handleServerCommand(
  args: ParsedCliArgs
): Promise<CliExitResult | LifecycleDelegated> {
  if (args.options.interactive) {
    const exitCode = await replCommand({ verbose: args.options.verbose });
    return cliExitFromStatus(exitCode);
  } else if (args.options.mode === 'orchestrator') {
    // Orchestrator mode: execute tasks directly (Issue #446). startServer
    // delegates to startOrchestratorMode, which owns the process lifecycle
    // (it calls process.exit itself once the task/REPL completes).
    const orchestratorOptions = buildOrchestratorOptions(args);
    await startServer(args.options.verbose, args.options.mode, true, orchestratorOptions);
  } else {
    // MCP stdio server: startServer owns the process lifecycle (it runs
    // until the transport closes, then exits itself).
    await startServer(args.options.verbose, args.options.mode);
  }
  // #3942: explicit lifecycle-delegation sentinel — the dispatcher must NOT
  // force an exit here (the server/orchestrator path owns the process). This
  // is a deliberate, type-checked choice, not an accidentally-dropped return.
  return LIFECYCLE_DELEGATED;
}

/**
 * Handles the review command for PR review (dogfooding).
 * Enhanced with setup wizard and pre-flight checks (Issue #258).
 */
export async function handleReviewCommand(args: ParsedCliArgs): Promise<CliExitResult> {
  // Get PR URL from positionals (review <url>) - optional with --setup
  const prUrl = args.positionals[1] ?? '';

  const exitCode = await reviewDemoCommand({
    prUrl,
    setup: args.options.setup,
    dryRun: args.options.dryRun,
    verbose: args.options.verbose,
    skipChecks: args.options.skipChecks,
  });
  return cliExitFromStatus(exitCode);
}

/**
 * Handles the routing-audit command for debugging model selection.
 */
export function handleRoutingAuditCommand(args: ParsedCliArgs): CliExitResult {
  // Get task from positionals (routing-audit <task>)
  const task = args.positionals[1];
  if (task === undefined) {
    printRoutingAuditUsage();
    return cliExit(EXIT_CODES.INVALID_ARGS);
  }

  const exitCode = routingAuditCommand({
    task,
    explain: args.options.verbose,
    deterministic: args.options.dryRun,
    json: args.options.format === 'json',
    verbose: args.options.verbose,
    banditStats: args.options.banditStats,
  });
  return cliExitFromStatus(exitCode);
}

/**
 * Handles the system-review command for automated system review.
 * (Source: Issue #211, Process Automation Epic #209)
 */
export function handleSystemReviewCommand(args: ParsedCliArgs): CliExitResult {
  const exitCode = systemReviewCommand({
    createIssue: args.options.createIssue,
    fix: args.options.fix,
    verbose: args.options.verbose,
  });
  return cliExitFromStatus(exitCode);
}

/**
 * Handles the vote command for consensus voting.
 * (Source: Issue #212, Process Automation Epic #209)
 */
/** A defined value that passes its guard, or undefined. */
function validated<T>(value: T | undefined, guard: (v: T) => boolean): T | undefined {
  return value !== undefined && guard(value) ? value : undefined;
}

/**
 * Map parsed CLI args onto {@link VoteCommandOptions}.
 *
 * Extracted so the mapping is one reviewable list rather than an inline
 * enumeration inside the handler. Every field on `VoteCommandOptions` is
 * optional, so the compiler cannot notice one that is missing — `--option` and
 * `--timeout` were both dropped here (#4963, #4965). When adding a field to
 * that type, add it here too.
 */
function buildVoteCommandOptions(args: ParsedCliArgs): VoteCommandOptions {
  const validThreshold = validated(args.options.threshold, isValidThreshold);
  const validErrorPolicy = validated(args.options.errorPolicy, isValidErrorPolicy);

  return {
    proposal: args.options.proposal ?? '',
    ...(args.options.options !== undefined && { options: args.options.options }),
    ...(validThreshold !== undefined && { threshold: validThreshold }),
    ...(validErrorPolicy !== undefined && { errorPolicy: validErrorPolicy }),
    ...(args.options.onNoQuorum !== undefined && { onNoQuorum: args.options.onNoQuorum }),
    ...(args.options.timeoutMs !== undefined && { timeoutMs: args.options.timeoutMs }),
    dryRun: args.options.dryRun,
    quick: args.options.quick,
    verbose: args.options.verbose,
  };
}

export async function handleVoteCommand(args: ParsedCliArgs): Promise<CliExitResult> {
  if (args.options.proposal === undefined) {
    printVoteUsage();
    return cliExit(EXIT_CODES.INVALID_ARGS);
  }

  const exitCode = await voteCommand(buildVoteCommandOptions(args));
  // #4135: use `cliExit` (not `cliExitFromStatus`) so a distinct `--on-no-quorum=exit2`
  // code (2) survives to the process instead of being collapsed to 1. Codes 0/1 map
  // identically, so back-compat holds.
  return cliExit(exitCode);
}

/**
 * Handles the index command for codebase indexing.
 * (Source: Issue #240)
 */
export async function handleIndexCommand(args: ParsedCliArgs): Promise<CliExitResult> {
  const subcommand = args.subcommand;
  if (!isValidIndexSubcommand(subcommand)) {
    printIndexUsage();
    return cliExit(EXIT_CODES.INVALID_ARGS);
  }

  const format = isValidIndexFormat(args.options.format) ? args.options.format : undefined;

  const result = await indexCommand({
    subcommand,
    ...(format !== undefined && { format }),
    ...(args.options.output !== undefined && { output: args.options.output }),
    ...(args.options.verbose && { verbose: args.options.verbose }),
  });

  process.stdout.write(formatIndexResult(result) + '\n');
  return cliExit(result.success ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

/**
 * Handles the research command for research registry management.
 * (Source: Issue #237, Epic #225, Epic #261)
 */
export async function handleResearchCommand(args: ParsedCliArgs): Promise<CliExitResult> {
  const subcommand = args.subcommand;
  if (!isValidResearchSubcommand(subcommand)) {
    printResearchUsage();
    return cliExit(EXIT_CODES.INVALID_ARGS);
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
  if (args.options.source !== undefined) {
    const source = ResearchDiscoverInputSchema.shape.source.safeParse(args.options.source);
    if (!source.success) {
      const message = `Invalid research source: ${args.options.source}`;
      process.stdout.write(`Error: ${message}\n`);
      return cliExit(EXIT_CODES.INVALID_ARGS, message);
    }
    options['source'] = source.data;
  }

  try {
    const result = await researchCommand(subcommand, positionalArgs, options);
    process.stdout.write(result.text + '\n');
    // #2761: pre-fix the dispatcher always called process.exit(SUCCESS),
    // dropping the handler's exitCode signal. `research index check`
    // reporting "Research index is out of date" therefore exited 0 in
    // CI, silently passing. The contract is now: handler returns
    // exitCode → process exits with that code.
    return cliExitFromStatus(result.exitCode);
  } catch (error) {
    const message = getErrorMessage(error);
    process.stdout.write(`Error: ${message}\n`);
    return cliExit(EXIT_CODES.SERVER_START_FAILED, message);
  }
}

/**
 * Handles the `registry` command: doctor or refresh subcommand (#2179).
 * Dispatches to registryCommand and forwards the text + exit code.
 */
export async function handleRegistryCommand(args: ParsedCliArgs): Promise<CliExitResult> {
  const { registryCommand, isValidRegistrySubcommand, formatRegistryUsage } =
    await import('./cli/registry-command.js');
  const subcommand = args.subcommand;
  if (!isValidRegistrySubcommand(subcommand)) {
    process.stdout.write(`${formatRegistryUsage()}\n`);
    return cliExit(EXIT_CODES.INVALID_ARGS);
  }

  const source = typeof args.options.source === 'string' ? args.options.source : undefined;
  const options = {
    json: args.options.json === true,
    dryRun: args.options.dryRun,
    ...(source !== undefined ? { source } : {}),
  };

  try {
    const result = await registryCommand(subcommand, options);
    process.stdout.write(`${result.text}\n`);
    return cliExitFromStatus(result.exitCode);
  } catch (error) {
    const message = getErrorMessage(error);
    process.stdout.write(`Error: ${message}\n`);
    return cliExit(EXIT_CODES.SERVER_START_FAILED, message);
  }
}

/**
 * Handles the validation command for learning validation dashboard.
 * (Source: Issue #273)
 */
export function handleValidationCommand(args: ParsedCliArgs): CliExitResult {
  const options = parseValidationArgs(args.positionals, args.options.format, args.options.verbose);
  const exitCode = validationDashboardCommand(options);
  return cliExitFromStatus(exitCode);
}

/**
 * Handles the learning-metrics command for aggregated learning dashboard.
 * (Source: Issue #284)
 */
export function handleLearningMetricsCommand(args: ParsedCliArgs): CliExitResult {
  const format: 'ascii' | 'json' = args.options.format === 'json' ? 'json' : 'ascii';
  const exitCode = learningMetricsCommand({
    period: args.options.period ?? 24,
    format,
    banditStats: args.options.banditStats,
    showTrends: args.options.noTrends !== true,
    ...(args.options.export !== undefined && { exportPath: args.options.export }),
  });
  return cliExitFromStatus(exitCode);
}

/**
 * Handles the verify command for quick installation verification.
 * (Source: Issue #253)
 */
export async function handleVerifyCommand(args: ParsedCliArgs): Promise<CliExitResult> {
  const exitCode = await verifyCommand({ verbose: args.options.verbose });
  return cliExitFromStatus(exitCode);
}

/**
 * Handles doctor command (extracted for dispatch table).
 */
export async function handleDoctorCommand(args: ParsedCliArgs): Promise<CliExitResult> {
  const exitCode = await doctorCommand({ fix: args.options.fix });
  if (args.options.deep) {
    const { runDeepDiagnostics, formatDeepDiagnostics } = await import('./cli/doctor-deep.js');
    const diag = runDeepDiagnostics();
    process.stdout.write(formatDeepDiagnostics(diag) + '\n');
  }
  // #4376: the `serves` readiness level. Opt-in because it spends generation
  // quota; without it the ladder reports `serves` as not-attempted, which is
  // the honest state rather than a pass.
  if (args.options.live) {
    const { runLiveReadiness, formatLiveReadiness } = await import('./cli/doctor-live.js');
    const report = await runLiveReadiness();
    process.stdout.write(formatLiveReadiness(report) + '\n');
    // A failed live probe is a real not-ready finding, so it must reach the
    // exit code — a level that reports and cannot fail is not a check.
    if (report.some((r) => r.levels.serves.status === 'failed')) {
      return cliExitFromStatus(1);
    }
  }
  return cliExitFromStatus(exitCode);
}

/**
 * Validates init flag combinations. Returns a failing {@link CliExitResult}
 * when a problem is found (caller propagates it to the dispatcher), or
 * `undefined` when the flags are valid.
 */
function validateInitFlags(args: ParsedCliArgs): CliExitResult | undefined {
  const hasPortable = args.options.portable === true;
  const hasOpencode = args.options.opencode !== undefined && args.options.opencode !== '';
  if (!hasPortable && !hasOpencode) {
    process.stderr.write(
      'Usage: nexus-agents init --portable [path] [--force] [--dry-run]\n' +
        '                            [--gitignore] [--mcp-config]\n' +
        '                            [--install | --uninstall]\n' +
        '       nexus-agents init --opencode <path-to-opencode.json>\n' +
        '                            [--dry-run] [--validate]\n' +
        'Bootstraps a workspace-local nexus-agents data directory or merges\n' +
        'the nexus-agents MCP block into an existing opencode.json.\n'
    );
    return cliExit(EXIT_CODES.INVALID_ARGS);
  }
  if (hasPortable && hasOpencode) {
    process.stderr.write('Error: --portable and --opencode are mutually exclusive entry modes.\n');
    return cliExit(EXIT_CODES.INVALID_ARGS);
  }
  if (args.options.install === true && args.options.uninstall === true) {
    process.stderr.write('Error: --install and --uninstall are mutually exclusive.\n');
    return cliExit(EXIT_CODES.INVALID_ARGS);
  }
  return undefined;
}

/**
 * Handles `nexus-agents init --portable` (#2305 / #2308 / #2311) or
 * `nexus-agents init --opencode <path>` (#2504).
 *
 * Async because `--install` may spawn `npm install`. When neither
 * `--install` nor `--uninstall` is set, no subprocess is spawned.
 */
export async function handleInitCommand(args: ParsedCliArgs): Promise<CliExitResult> {
  const flagError = validateInitFlags(args);
  if (flagError !== undefined) {
    return flagError;
  }
  if (args.options.opencode !== undefined && args.options.opencode !== '') {
    return runInitOpencodeFlow(args);
  }
  return runInitPortableFlow(args);
}

/** Runs the `init --portable` path and renders its outcome (#2305/#2308/#2311). */
async function runInitPortableFlow(args: ParsedCliArgs): Promise<CliExitResult> {
  const targetPath = args.positionals[1]; // [0] is "init"
  const result = await initPortable({
    ...(targetPath !== undefined && targetPath !== '' ? { path: targetPath } : {}),
    force: args.options.force,
    dryRun: args.options.dryRun,
    gitignore: args.options.gitignore ?? false,
    mcpConfig: args.options.mcpConfig ?? false,
    install: args.options.install ?? false,
    uninstall: args.options.uninstall ?? false,
  });
  process.stdout.write(formatInitPortableMessage(result, args.options.dryRun));
  return cliExit(result.success ? EXIT_CODES.SUCCESS : EXIT_CODES.SERVER_START_FAILED);
}

async function runInitOpencodeFlow(args: ParsedCliArgs): Promise<CliExitResult> {
  const { runInitOpencode } = await import('./cli/init-opencode.js');
  const opencodePath = args.options.opencode;
  if (opencodePath === undefined || opencodePath === '') {
    process.stderr.write('Error: --opencode requires a path argument.\n');
    return cliExit(EXIT_CODES.INVALID_ARGS);
  }
  // The CLI binary path the MCP block will spawn — defaults to the running
  // binary so the resulting opencode.json points at this install. Operators
  // can override post-init by hand-editing the file.
  const cliPath = process.argv[1] ?? 'nexus-agents';
  const sandboxFlavor = process.env['NEXUS_SANDBOX'];
  const result = runInitOpencode({
    path: opencodePath,
    cliPath,
    ...(sandboxFlavor !== undefined && sandboxFlavor !== '' && { sandboxFlavor }),
    dryRun: args.options.dryRun,
  });
  process.stdout.write(`init --opencode ${result.action} ${result.path}\n`);
  if (args.options.dryRun || result.action !== 'unchanged') {
    process.stdout.write(`${result.diff}\n`);
  }

  if (args.options.validate === true) {
    return cliExit(await renderOpencodeValidate(opencodePath));
  }
  return cliExit(EXIT_CODES.SUCCESS);
}

/**
 * Run --validate via the helper in cli/init-opencode and render the
 * outcome to stdout/stderr. Returns the exit code (0 success, 1 fail).
 */
async function renderOpencodeValidate(opencodePath: string): Promise<number> {
  const { runOpencodeValidate } = await import('./cli/init-opencode.js');
  const result = await runOpencodeValidate(opencodePath);
  if (!result.ok) {
    process.stderr.write(`init --opencode --validate: ${result.reason ?? 'failed'}\n`);
    return 1;
  }
  process.stdout.write(
    `init --opencode --validate: ${String(result.models?.length ?? 0)} model(s) discovered at ${result.baseURL ?? '(unknown)'}:\n`
  );
  for (const id of result.models ?? []) {
    process.stdout.write(`  - ${id}\n`);
  }
  return 0;
}

/**
 * Handles setup command for Claude CLI integration (sync version).
 * (Source: Issue #363 - Auto-configure Claude CLI integration)
 * (Source: Issue #416 - Setup command hook configuration)
 */
export function handleSetupCommand(args: ParsedCliArgs): CliExitResult {
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
  return cliExitFromStatus(exitCode);
}

/**
 * Handles setup command with interactive wizard support (async version).
 * (Source: Issue #425 - Interactive setup wizard)
 *
 * #2124: when `--custom-api <url>` is set, short-circuits the normal flow
 * and just configures the custom gateway (URL validation + probe + shell
 * fragment). Rationale: normal setup configures Claude/OpenCode/Codex
 * MCP hookup; custom-api is orthogonal — the user has a gateway they
 * want to plug in, not a harness they want to wire up.
 */
export async function handleSetupCommandAsync(args: ParsedCliArgs): Promise<CliExitResult> {
  if (args.options.customApi !== undefined && args.options.customApi !== '') {
    return cliExit(await runCustomApiSetup(args));
  }
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
  return cliExitFromStatus(exitCode);
}

/** Wrapper for `setup --custom-api` (#2124). */
async function runCustomApiSetup(args: ParsedCliArgs): Promise<number> {
  const { configureCustomApi } = await import('./cli/setup-custom-api.js');
  const baseUrl = args.options.customApi;
  if (baseUrl === undefined) return EXIT_CODES.SERVER_START_FAILED;
  const input: Parameters<typeof configureCustomApi>[0] = {
    baseUrl,
    nonInteractive: args.options.nonInteractive,
    ...(args.options.customApiKey !== undefined ? { apiKey: args.options.customApiKey } : {}),
    ...(args.options.customModel !== undefined ? { model: args.options.customModel } : {}),
  };
  const result = await configureCustomApi(input);
  if (!result.ok) {
    process.stderr.write(`✗ ${result.error.message}\n`);
    return EXIT_CODES.SERVER_START_FAILED;
  }
  const { baseUrl: canonical, model, probeSucceeded, shellFragment } = result.value;
  process.stdout.write(`✓ Gateway validated: ${canonical}\n`);
  process.stdout.write(`✓ Model: ${model}\n`);
  if (probeSucceeded) process.stdout.write(`✓ Probe succeeded (GET /models → 2xx)\n`);
  process.stdout.write('\nAdd the following to your shell rc (~/.bashrc, ~/.zshrc, etc.):\n\n');
  process.stdout.write(shellFragment);
  return EXIT_CODES.SUCCESS;
}

/**
 * Handles hello command for quick introduction.
 * (Source: Issue #423 - Hello World Command)
 */
export function handleHelloCommand(_args: ParsedCliArgs): CliExitResult {
  return cliExitFromStatus(helloCommand());
}

/**
 * Handles demo command for API-free exploration.
 * (Source: Issue #424 - Demo mode for API-free exploration)
 */
export async function handleDemoCommand(args: ParsedCliArgs): Promise<CliExitResult> {
  // Get subcommand from positionals (demo <subcommand> [args...])
  const subcommand = args.subcommand;
  const additionalArgs = args.positionals.slice(2);
  const options = {
    mock: args.options.mock,
  };
  const exitCode = await demoCommand(subcommand, additionalArgs, options);
  return cliExitFromStatus(exitCode);
}

/**
 * Handles the `tour` command — an interactive, zero-API walkthrough of the
 * four headline tools. Reuses the existing `--non-interactive` option for
 * the scripted mode. (Source: Issue #2851)
 */
export async function handleTourCommand(args: ParsedCliArgs): Promise<CliExitResult> {
  const io = args.options.nonInteractive ? scriptedIO() : interactiveIO();
  const exitCode = await runTour({ nonInteractive: args.options.nonInteractive }, io);
  return cliExitFromStatus(exitCode);
}

/**
 * Handles hooks command for Claude CLI hook integration.
 * (Source: Issue #411 - Claude CLI Hook Integration Commands)
 */
export async function handleHooksCommand(args: ParsedCliArgs): Promise<CliExitResult> {
  // If --help flag or no subcommand, print help
  if (args.options.help || args.positionals.length < 2) {
    printHookHelp();
    return cliExit(EXIT_CODES.SUCCESS);
  }

  // Pass remaining args to hook command (hooks <subcommand> [options...])
  const hookArgs = args.positionals.slice(1);
  const exitCode = await hookCommand(hookArgs);
  return cliExitFromStatus(exitCode);
}

// ============================================================================
// Issue #526: Newly Wired Commands
// ============================================================================

/**
 * Handles sprint command for automated sprint planning.
 * (Source: Issue #230, Epic #225)
 */
export async function handleSprintCommand(args: ParsedCliArgs): Promise<CliExitResult> {
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
    return cliExit(EXIT_CODES.INVALID_ARGS);
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
  return cliExitFromStatus(exitCode);
}

/**
 * Handles session command for session management.
 * (Source: Issue #190 - CLI session persistence with SQLite)
 */
export async function handleSessionCommand(
  args: ParsedCliArgs
): Promise<CliExitResult | LifecycleDelegated> {
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
    return cliExit(EXIT_CODES.INVALID_ARGS);
  }

  // Pass remaining args after subcommand to sessionCommand.
  // Errors thrown by sessionCommand propagate to the top-level CLI error handler.
  // The valid-subcommand path intentionally delegates the lifecycle (no forced
  // process.exit) — pre-#3210 this path never called process.exit, letting
  // the event loop drain naturally (e.g. pending SQLite writes) before the
  // process ends with code 0. Forcing an exit here could truncate that I/O.
  // #3942: signal that delegation explicitly with the sentinel rather than a
  // bare `undefined`, so a dropped return on the error path above is caught.
  const remainingArgs = args.positionals.slice(2);
  await sessionCommand(subcommand, remainingArgs);
  return LIFECYCLE_DELEGATED;
}

/**
 * Handles evaluate command for self-evaluation.
 * (Source: Issue #140, Self-Evaluation MVP)
 */
export async function handleEvaluateCommand(args: ParsedCliArgs): Promise<CliExitResult> {
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

  // NOTE: evaluate uses a 3-way exit mapping (0→SUCCESS, 1→SERVER_START_FAILED,
  // other→SHUTDOWN_ERROR), distinct from the binary `cliExitFromStatus` map —
  // preserved verbatim (#3210 is behavior-preserving).
  const exitCode = await evaluateCommand(evalArgs);
  return cliExit(
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
export function handleIssueCommand(args: ParsedCliArgs): CliExitResult {
  const subcommand = args.subcommand;
  if (subcommand !== 'validate' && subcommand !== 'create') {
    process.stdout.write('Usage: nexus-agents issue <subcommand> [options]\n');
    process.stdout.write('\nSubcommands:\n');
    process.stdout.write('  validate <number>  Validate issue against template\n');
    process.stdout.write('  create <type>      Show issue template for creating\n');
    process.stdout.write('\nTypes: feat, bug, task, refactor, docs\n');
    return cliExit(EXIT_CODES.INVALID_ARGS);
  }

  // Get issue number or template type from positionals
  const arg = args.positionals[2];
  if (arg === undefined) {
    process.stdout.write('Error: Missing argument\n');
    return cliExit(EXIT_CODES.INVALID_ARGS);
  }

  // Build options based on subcommand
  const format: 'text' | 'json' = args.options.format === 'json' ? 'json' : 'text';

  if (subcommand === 'validate') {
    const issueNumber = parseInt(arg, 10);
    if (isNaN(issueNumber)) {
      process.stdout.write('Error: Invalid issue number\n');
      return cliExit(EXIT_CODES.INVALID_ARGS);
    }
    return cliExitFromStatus(
      issueCommand({
        subcommand: 'validate',
        issueNumber,
        format,
      })
    );
  }
  // create subcommand
  const validTypes = ['feat', 'bug', 'task', 'refactor', 'docs'];
  const type = validTypes.includes(arg)
    ? (arg as 'feat' | 'bug' | 'task' | 'refactor' | 'docs')
    : 'feat';
  return cliExitFromStatus(
    issueCommand({
      subcommand: 'create',
      type,
      format,
    })
  );
}

// ============================================================================
// System Mandate LOOP I: Fitness Audit Command
// ============================================================================

/**
 * Handles fitness-audit command for CLI orchestration fitness scoring.
 * (Source: System Mandate LOOP I)
 */
export function handleFitnessAuditCommand(args: ParsedCliArgs): CliExitResult {
  const exitCode = fitnessAuditCommand({
    json: args.options.format === 'json',
  });
  return cliExitFromStatus(exitCode);
}

// ============================================================================
// Issue #1023: Warm-Up Command
// ============================================================================

/**
 * Handles warm-up command for LinUCB bandit cold-start seeding.
 * (Source: Issue #1023 — Bootstrap LinUCB with synthetic outcomes)
 */
export function handleWarmUpCommand(_args: ParsedCliArgs): CliExitResult {
  const result = runWarmUp();
  const msg = result.skipped
    ? `Warm-up skipped: ${result.reason ?? 'already seeded'}`
    : `Seeded with ${String(result.seeded)} synthetic observations`;
  process.stdout.write(msg + '\n');
  return cliExit(EXIT_CODES.SUCCESS);
}

/**
 * Handles e2e-eval command for learning loop validation.
 * (Source: Issue #1030 — E2E scenario runner)
 */
export function handleE2EEvalCommand(args: ParsedCliArgs): CliExitResult {
  const count = parsePositiveInt(args.positionals[1], 50);
  const result = runE2EEval({ taskCount: count });
  process.stdout.write(formatE2EEvalResult(result) + '\n');
  return cliExit(result.passed ? EXIT_CODES.SUCCESS : 1);
}

/**
 * Handles routing-ab command for A/B comparison of routing strategies.
 * (Source: Issue #1033 — Routing strategy A/B framework)
 */
export function handleRoutingABCommand(args: ParsedCliArgs): CliExitResult {
  const count = parsePositiveInt(args.positionals[1], 30);
  const result = runRoutingAB({ taskCount: count });
  process.stdout.write(formatABReport(result) + '\n');
  return cliExit(EXIT_CODES.SUCCESS);
}

/**
 * Handles memory-eval command for comparative memory evaluation.
 * (Source: Issue #1034 — Comparative memory evaluation benchmark)
 */
export function handleMemoryEvalCommand(args: ParsedCliArgs): CliExitResult {
  const count = parsePositiveInt(args.positionals[1], 50);
  const result = runMemoryEval(count);
  process.stdout.write(formatMemoryEvalReport(result) + '\n');
  return cliExit(EXIT_CODES.SUCCESS);
}
