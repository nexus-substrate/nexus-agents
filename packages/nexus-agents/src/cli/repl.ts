/**
 * nexus-agents REPL - Interactive command-line interface
 *
 * Provides an interactive REPL mode for Nexus Agents.
 *
 * (Source: Issue #64, PROJECT_PLAN.md Section 5.2)
 * (Source: Node.js 22.x readline documentation)
 *
 * File structure: Types in repl-types.ts, formatters in
 * repl-formatters.ts. Extracted per Issue #272.
 */

import * as readline from 'node:readline';
import { createLogger, getTimeProvider, getErrorMessage, type ILogger } from '../core/index.js';
import { printWorkflowTemplates } from './workflow-run.js';
import { expertListCommand } from './expert-list.js';

// Re-export types
export type { ReplSession, CommandResult } from './repl-types.js';
export { colors, HANDLED } from './repl-types.js';

// Local imports from extracted modules
import { colors, HANDLED, type ReplSession, type CommandResult } from './repl-types.js';
import {
  printBanner,
  printReplHelp,
  printStatus,
  printHistory,
  clearScreen,
} from './repl-formatters.js';

/**
 * Creates a new REPL session.
 */
function createSession(verbose: boolean): ReplSession {
  return {
    history: [],
    sessionId: `repl-${String(getTimeProvider().now())}`,
    startTime: new Date(getTimeProvider().now()),
    verbose,
  };
}

/**
 * Handles simple single-word commands.
 */
function handleSimpleCommand(cmd: string, session: ReplSession): CommandResult | null {
  switch (cmd) {
    case 'exit':
    case 'quit':
      return { handled: true, exit: true, output: 'Goodbye!' };
    case 'help':
      printReplHelp();
      return HANDLED;
    case 'clear':
      clearScreen();
      printBanner();
      return HANDLED;
    case 'history':
      printHistory(session);
      return HANDLED;
    case 'status':
      printStatus(session);
      return HANDLED;
    case 'experts':
      expertListCommand({ format: 'table' });
      return HANDLED;
    default:
      return null;
  }
}

/**
 * Handles the 'create' command.
 */
function handleCreateCommand(parts: string[]): CommandResult {
  const role = parts[1] ?? 'custom';
  process.stdout.write(
    `${colors.yellow}Expert creation is available in MCP server mode.${colors.reset}\n`
  );
  process.stdout.write(
    `${colors.dim}To create a '${role}' expert, use the create_expert tool via Claude.${colors.reset}\n\n`
  );
  return HANDLED;
}

/**
 * Handles the 'run' command.
 */
function handleRunCommand(parts: string[]): CommandResult {
  const workflowName = parts[1] ?? 'unknown';
  process.stdout.write(
    `${colors.yellow}Workflow execution requires MCP server mode for full functionality.${colors.reset}\n`
  );
  process.stdout.write(
    `${colors.dim}Workflow '${workflowName}' would be executed with run_workflow tool.${colors.reset}\n\n`
  );
  return HANDLED;
}

/**
 * Handles built-in REPL commands.
 */
async function handleBuiltInCommand(input: string, session: ReplSession): Promise<CommandResult> {
  const trimmed = input.trim().toLowerCase();
  const parts = input.trim().split(/\s+/);
  const command = parts[0]?.toLowerCase() ?? '';

  // Try simple commands first
  const simpleResult = handleSimpleCommand(trimmed, session);
  if (simpleResult !== null) {
    return simpleResult;
  }

  // Handle 'workflows' command (async)
  if (trimmed === 'workflows') {
    await printWorkflowTemplates();
    return HANDLED;
  }

  // Handle multi-word commands
  if (command === 'create' && parts.length >= 2) {
    return handleCreateCommand(parts);
  }

  if (command === 'run' && parts.length >= 2) {
    return handleRunCommand(parts);
  }

  return { handled: false, exit: false };
}

/**
 * Handles task orchestration (non-command input).
 */
function handleTask(input: string, session: ReplSession, logger: ILogger): void {
  const trimmed = input.trim();

  if (session.verbose) {
    logger.debug('Processing task', { task: trimmed, sessionId: session.sessionId });
  }

  process.stdout.write(`\n${colors.bold}Task Analysis:${colors.reset}\n`);
  process.stdout.write(`${colors.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`);
  process.stdout.write(`${colors.cyan}Task:${colors.reset} ${trimmed}\n\n`);

  process.stdout.write(
    `${colors.yellow}Note:${colors.reset} Full task orchestration requires MCP server mode.\n`
  );
  process.stdout.write(`${colors.dim}In MCP mode, the TechLead agent would:${colors.reset}\n`);
  process.stdout.write(`  1. Analyze this task\n`);
  process.stdout.write(`  2. Select appropriate expert agents\n`);
  process.stdout.write(`  3. Coordinate expert collaboration\n`);
  process.stdout.write(`  4. Synthesize and return results\n\n`);

  process.stdout.write(
    `${colors.dim}Start the server with: ${colors.cyan}nexus-agents${colors.reset}\n`
  );
  process.stdout.write(
    `${colors.dim}Then use the 'orchestrate' tool via Claude Desktop.${colors.reset}\n\n`
  );
}

/**
 * Creates the readline interface.
 */
function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    prompt: `${colors.green}nexus${colors.reset}${colors.dim}>${colors.reset} `,
    historySize: 100,
  });
}

/**
 * Processes a single line of input.
 */
async function processLine(line: string, session: ReplSession, logger: ILogger): Promise<boolean> {
  const trimmed = line.trim();

  // Skip empty lines
  if (trimmed === '') {
    return false;
  }

  // Add to history (cast required because history is readonly in interface)
  session.history.push(trimmed);

  // Try built-in commands first
  const result = await handleBuiltInCommand(trimmed, session);

  if (result.handled) {
    if (result.output !== undefined) {
      process.stdout.write(`${result.output}\n`);
    }
    return result.exit;
  }

  // Treat as task for orchestration
  handleTask(trimmed, session, logger);
  return false;
}

/**
 * Starts the interactive REPL.
 *
 * @param options - REPL options
 * @returns Promise that resolves when REPL exits
 */
export async function startRepl(options: { verbose?: boolean } = {}): Promise<void> {
  const logger = createLogger({ component: 'repl' });
  const session = createSession(options.verbose ?? false);

  if (session.verbose) {
    logger.setLevel('debug');
  }

  logger.info('Starting interactive REPL', { sessionId: session.sessionId });

  // Print welcome banner
  printBanner();

  // Create readline interface
  const rl = createReadlineInterface();

  // Handle close event (Ctrl+C or Ctrl+D)
  rl.on('close', () => {
    process.stdout.write(`\n${colors.dim}Session ended.${colors.reset}\n`);
    logger.info('REPL session ended', {
      sessionId: session.sessionId,
      commandsRun: session.history.length,
    });
  });

  // Prompt for input
  rl.prompt();

  // Process lines
  return new Promise<void>((resolve) => {
    rl.on('line', (line: string) => {
      void (async (): Promise<void> => {
        try {
          const shouldExit = await processLine(line, session, logger);
          if (shouldExit) {
            rl.close();
            resolve();
            return;
          }
        } catch (error) {
          const message = getErrorMessage(error);
          process.stdout.write(`${colors.red}Error:${colors.reset} ${message}\n`);
        }

        // Show prompt again
        rl.prompt();
      })();
    });

    rl.on('close', () => {
      resolve();
    });
  });
}

/**
 * REPL command for CLI integration.
 *
 * @param options - REPL options
 * @returns Exit code (0 = success)
 */
export async function replCommand(options: { verbose?: boolean } = {}): Promise<number> {
  try {
    await startRepl(options);
    return 0;
  } catch (error) {
    const message = getErrorMessage(error);
    process.stderr.write(`REPL error: ${message}\n`);
    return 1;
  }
}
