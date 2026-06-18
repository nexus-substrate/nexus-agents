/**
 * nexus-agents CLI Commands
 *
 * Command dispatch and routing for the CLI.
 *
 * @module cli-commands
 *
 * File structure:
 * - Validators in cli-commands-validators.ts (Issue #272)
 * - Usage text in cli-commands-usage.ts
 * - Command handlers in cli-commands-handlers.ts (Issue #285)
 */

import { VERSION } from './version.js';
import { EXIT_CODES, type ParsedCliArgs } from './cli-types.js';
import { renderHelp } from './cli-help-text.js';

// Re-export handlers for backward compatibility
export {
  handleUnimplementedCommand,
  handleConfigCommand,
  handleExpertCommand,
  handleWorkflowCommand,
  handleServerCommand,
  handleReviewCommand,
  handleRoutingAuditCommand,
  handleOrchestrateCommand,
  handleSystemReviewCommand,
  handleVoteCommand,
  handleIndexCommand,
  handleRegistryCommand,
  handleResearchCommand,
  handleValidationCommand,
  handleLearningMetricsCommand,
  handleSweBenchCommand,
  handleAtbenchCommand,
  handleVerifyCommand,
  handleDoctorCommand,
  handleInitCommand,
  handleSetupCommand,
  handleSetupCommandAsync,
  handleHelloCommand,
  handleHooksCommand,
  handleDemoCommand,
  handleTourCommand,
  // Issue #526: Newly wired commands
  handleSprintCommand,
  handleSessionCommand,
  handleEvaluateCommand,
  handleIssueCommand,
  // System Mandate LOOP I: Fitness Audit
  handleFitnessAuditCommand,
  // Issue #1023: Warm-Up Command
  handleWarmUpCommand,
  handleE2EEvalCommand,
  handleRoutingABCommand,
  handleMemoryEvalCommand,
} from './cli-commands-handlers.js';
// Issue #739: Auth command
export { handleAuthCommand } from './cli-auth-handler.js';
// Issue #637: Release Automation Suite
export {
  handleReleaseNotesCommand,
  handleReleaseValidateCommand,
  handleReleaseAnnounceCommand,
} from './cli-release-handlers.js';
// Issue #653: Scaffold Command
export { handleScaffoldCommand } from './cli-scaffold-handler.js';
// Creative: Visualize Command
export { handleVisualizeCommand } from './cli/visualize-command.js';
// Issue #684: Capabilities Command
export { handleCapabilitiesCommand } from './cli/capabilities-command.js';
// Issue #748: Memory Benchmark Command
export { handleMemoryBenchmarkCommand } from './cli/memory-benchmark-command.js';
// Issue #688: Status Command
export { handleStatusCommand } from './cli/status-command.js';
// Epic #952: Scenario Command
export { handleScenarioCommand } from './cli/scenario-command.js';
// Issue #1403: Health Command
export { handleHealthCommand } from './cli/health-command.js';
// Issue #1598: Validate Command
export { handleValidateCommand } from './cli/validate-command.js';
// Issue #3214: Mode Command — expose mode detection for inspection/debugging
export { handleModeCommand } from './cli/mode-command.js';

// Import handlers for dispatch
import {
  handleExpertCommand,
  handleRoutingAuditCommand,
  handleSystemReviewCommand,
  handleValidationCommand,
  handleLearningMetricsCommand,
  handleServerCommand,
  handleDoctorCommand,
  handleVerifyCommand,
  handleConfigCommand,
  handleWorkflowCommand,
  handleReviewCommand,
  handleOrchestrateCommand,
  handleVoteCommand,
  handleIndexCommand,
  handleRegistryCommand,
  handleResearchCommand,
  handleSweBenchCommand,
  handleAtbenchCommand,
  handleInitCommand,
  handleSetupCommandAsync,
  handleHelloCommand,
  handleHooksCommand,
  handleDemoCommand,
  handleTourCommand,
  // Issue #526: Newly wired commands
  handleSprintCommand,
  handleSessionCommand,
  handleEvaluateCommand,
  handleIssueCommand,
  // System Mandate LOOP I: Fitness Audit
  handleFitnessAuditCommand,
  // Issue #1023: Warm-Up Command
  handleWarmUpCommand,
  handleE2EEvalCommand,
  handleRoutingABCommand,
  handleMemoryEvalCommand,
} from './cli-commands-handlers.js';
// Issue #739: Auth command
import { handleAuthCommand } from './cli-auth-handler.js';
// Issue #2447: nexus-agents login — guided per-CLI auth status
import { handleLoginCommand } from './cli/login-command.js';
// Issue #2469: nexus-agents usage — cost / usage / quality dashboard
import { handleUsageCommand } from './cli/usage-command.js';
// Issue #2444: nexus-agents improvement-review — observability-driven improvement loop CLI surface
import { handleImprovementReviewCommand } from './cli/improvement-review-command.js';
import { handleAutoRemediateCommand } from './cli/auto-remediate-command.js';
// #3765: nexus-agents remediation-review — human soundness-review surface (enforce gate evidence)
import { handleRemediationReviewCommand } from './cli/remediation-review-command.js';
// Issue #2879 / epic #2872: nexus-agents migrate — relocate homedir state per-repo
import { handleMigrateCommand } from './cli/migrate-command.js';
// Issue #637: Release Automation Suite
import {
  handleReleaseNotesCommand,
  handleReleaseValidateCommand,
  handleReleaseAnnounceCommand,
} from './cli-release-handlers.js';
// Issue #653: Scaffold Command
import { handleScaffoldCommand } from './cli-scaffold-handler.js';
// Creative: Visualize Command
import { handleVisualizeCommand } from './cli/visualize-command.js';
// Issue #684: Capabilities Command
import { handleCapabilitiesCommand } from './cli/capabilities-command.js';
// Issue #688: Status Command
import { handleStatusCommand } from './cli/status-command.js';
// Issue #748: Memory Benchmark Command
import { handleMemoryBenchmarkCommand } from './cli/memory-benchmark-command.js';
// Epic #952: Scenario Command
import { handleScenarioCommand } from './cli/scenario-command.js';
// Issue #1403: Health Command
import { handleHealthCommand } from './cli/health-command.js';
// Issue #1598: Validate Command
import { handleValidateCommand } from './cli/validate-command.js';
// Issue #3214: Mode Command — expose mode detection for inspection/debugging
import { handleModeCommand } from './cli/mode-command.js';
// Issue #1398: Lazy data directory initialization
import { initDataDirectories } from './cli/setup-data-dir.js';
// #1930: Step notifications (human-readable progress trail)
import { bootstrapStepNotifications } from './core/step-notifications.js';

/**
 * Prints help text to stdout.
 *
 * Default output hides maintainer commands (benchmarks, release tooling, deep
 * diagnostics). Pass `--all` to include them. See `cli-command-catalog.ts` for
 * the audience classification.
 */
export function printHelp(args?: ParsedCliArgs): void {
  const all = args?.options.all ?? false;
  process.stdout.write(renderHelp({ all }) + '\n');
}

/**
 * Prints version information to stdout.
 */
export function printVersion(): void {
  process.stdout.write(`nexus-agents v${VERSION}\n`);
}

/** Sync command dispatch table for reduced complexity. */
const SYNC_COMMAND_HANDLERS: Record<string, ((args: ParsedCliArgs) => void) | undefined> = {
  hello: handleHelloCommand,
  expert: handleExpertCommand,
  'routing-audit': handleRoutingAuditCommand,
  'system-review': handleSystemReviewCommand,
  validation: handleValidationCommand,
  'learning-metrics': handleLearningMetricsCommand,
  // Issue #526: Newly wired sync command
  issue: handleIssueCommand,
  // System Mandate LOOP I: Fitness Audit
  'fitness-audit': handleFitnessAuditCommand,
  // Issue #653: Scaffold Command
  scaffold: handleScaffoldCommand,
  // Creative: Visualize Command
  visualize: handleVisualizeCommand,
  // Issue #684: Capabilities Command
  capabilities: handleCapabilitiesCommand,
  // Issue #688: Status Command
  status: handleStatusCommand,
  // Issue #1023: Warm-Up Command
  'warm-up': handleWarmUpCommand,
  'e2e-eval': handleE2EEvalCommand,
  'routing-ab': handleRoutingABCommand,
  'memory-eval': handleMemoryEvalCommand,
  // Issue #1403: Health Command
  health: handleHealthCommand,
  // Issue #3214: Mode Command — print detected mode + signals + reasoning
  mode: handleModeCommand,
};

/**
 * Handles synchronous commands that don't require await.
 * Returns true if the command was handled.
 */
function handleSyncCommand(args: ParsedCliArgs): boolean {
  // Handle help and version separately (they have special exit behavior)
  if (args.command === 'help') {
    printHelp(args);
    process.exit(EXIT_CODES.SUCCESS);
  }
  if (args.command === 'version') {
    printVersion();
    process.exit(EXIT_CODES.SUCCESS);
  }

  // Dispatch to sync handler table
  const handler = SYNC_COMMAND_HANDLERS[args.command];
  if (handler !== undefined) {
    handler(args);
    return true;
  }
  return false;
}

/** Async command dispatch table for reduced complexity. */
const ASYNC_COMMAND_HANDLERS: Record<string, ((args: ParsedCliArgs) => Promise<void>) | undefined> =
  {
    server: handleServerCommand,
    doctor: handleDoctorCommand,
    verify: handleVerifyCommand,
    config: handleConfigCommand,
    workflow: handleWorkflowCommand,
    review: handleReviewCommand,
    orchestrate: handleOrchestrateCommand,
    vote: handleVoteCommand,
    index: handleIndexCommand,
    research: handleResearchCommand,
    registry: handleRegistryCommand,
    'swe-bench': handleSweBenchCommand,
    atbench: handleAtbenchCommand,
    hooks: handleHooksCommand,
    setup: handleSetupCommandAsync, // Uses async for interactive wizard support (Issue #425)
    // Issue #2447: nexus-agents login — async because it spawns codex/opencode for status probes.
    // Issue #2449 made `auth status` the canonical name; this remains as a soft alias.
    login: handleLoginCommand,
    // Issue #739/#2449: auth command (now async — `auth status` routes to login probe)
    auth: handleAuthCommand,
    // Issue #2469: usage command (cost / usage / quality dashboard)
    usage: handleUsageCommand,
    // Issue #2444: improvement-review command (observability-driven improvement loop)
    'improvement-review': handleImprovementReviewCommand,
    // #3540 phase 3 / #3671: run one auto-remediation cycle (mode from NEXUS_AUTO_REMEDIATE).
    'auto-remediate': handleAutoRemediateCommand,
    // #3765: human soundness-review surface — produces the enforce-gate readiness evidence.
    'remediation-review': handleRemediationReviewCommand,
    // Issue #2879 / epic #2872: migrate command (relocate homedir state per-repo)
    migrate: handleMigrateCommand,
    // #2305 / #2308 / #2311: Init Portable Command (async because --install spawns npm)
    init: handleInitCommand,
    demo: handleDemoCommand, // Made async for live CLI execution
    // Issue #2851: nexus-agents tour — interactive zero-API walkthrough
    tour: handleTourCommand,
    // Issue #526: Newly wired async commands
    sprint: handleSprintCommand,
    session: handleSessionCommand,
    evaluate: handleEvaluateCommand,
    // Issue #637: Release Automation Suite
    'release-notes': handleReleaseNotesCommand,
    'release-validate': handleReleaseValidateCommand,
    'release-announce': handleReleaseAnnounceCommand,
    // Issue #748: Memory Benchmark Command
    'memory-benchmark': handleMemoryBenchmarkCommand,
    // Epic #952: Scenario Command
    scenario: handleScenarioCommand,
    // Issue #1598: Validate Command
    validate: handleValidateCommand,
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
  // Ensure data directories exist before any command runs (#1398)
  initDataDirectories();

  // #1930: Wire step notifications. `server` command is the MCP stdio server —
  // renderer must default off there to protect JSON-RPC frames. All other
  // commands are human-facing CLI where the renderer helps.
  bootstrapStepNotifications({ mode: args.command === 'server' ? 'mcp-stdio' : 'cli' });

  if (!handleSyncCommand(args)) {
    await handleAsyncCommand(args);
  }
}
