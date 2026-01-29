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
} from './cli-commands-handlers.js';

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
} from './cli-commands-handlers.js';

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
  demo: handleDemoCommand,
  // Issue #526: Newly wired sync command
  issue: handleIssueCommand,
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
    // Issue #526: Newly wired async commands
    sprint: handleSprintCommand,
    session: handleSessionCommand,
    evaluate: handleEvaluateCommand,
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
