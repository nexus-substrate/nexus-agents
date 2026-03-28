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
import { EXIT_CODES, HELP_TEXT, type ParsedCliArgs } from './cli-types.js';

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
  handleResearchCommand,
  handleValidationCommand,
  handleLearningMetricsCommand,
  handleSweBenchCommand,
  handleVerifyCommand,
  handleDoctorCommand,
  handleSetupCommand,
  handleSetupCommandAsync,
  handleHelloCommand,
  handleHooksCommand,
  handleDemoCommand,
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
  handleResearchCommand,
  handleSweBenchCommand,
  handleSetupCommandAsync,
  handleHelloCommand,
  handleHooksCommand,
  handleDemoCommand,
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
// Issue #1398: Lazy data directory initialization
import { initDataDirectories } from './cli/setup-data-dir.js';

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
  // Issue #739: Auth command
  auth: handleAuthCommand,
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
};

/**
 * Handles synchronous commands that don't require await.
 * Returns true if the command was handled.
 */
function handleSyncCommand(args: ParsedCliArgs): boolean {
  // Handle help and version separately (they have special exit behavior)
  if (args.command === 'help') {
    printHelp();
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
    'swe-bench': handleSweBenchCommand,
    hooks: handleHooksCommand,
    setup: handleSetupCommandAsync, // Uses async for interactive wizard support (Issue #425)
    demo: handleDemoCommand, // Made async for live CLI execution
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

  if (!handleSyncCommand(args)) {
    await handleAsyncCommand(args);
  }
}
