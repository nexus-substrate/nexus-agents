/**
 * nexus-agents CLI Orchestrator Mode
 *
 * Standalone task execution mode for the CLI. Executes tasks directly
 * without starting the MCP server.
 *
 * @module cli-orchestrator
 * (Source: Issue #446 - Implement orchestrator mode)
 */

import * as readline from 'node:readline';
import { createLogger } from './core/index.js';
import { VERSION } from './version.js';
import { EXIT_CODES } from './cli-types.js';
import { orchestrateCommand, type OrchestrateOptions } from './cli/orchestrate-command.js';
import type { CliNameLiteral } from './config/model-capabilities-types.js';

/**
 * Options for orchestrator mode.
 * (Source: Issue #446 - Implement orchestrator mode)
 */
export interface OrchestratorModeOptions {
  verbose: boolean;
  task?: string;
  format?: 'text' | 'json';
  model?: CliNameLiteral;
  dryRun?: boolean;
  maxTokens?: number;
  maxCostUsd?: number;
}

/**
 * Runs orchestrator mode in interactive REPL.
 * Reads tasks from stdin and processes them one at a time.
 * (Source: Issue #446 - Implement orchestrator mode)
 */
function runOrchestratorRepl(
  options: OrchestratorModeOptions,
  logger: ReturnType<typeof createLogger>
): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'nexus> ',
    });

    logger.info('Orchestrator REPL started (type "exit" to quit)');
    process.stdout.write('\n');
    rl.prompt();

    rl.on('line', (line) => {
      const task = line.trim();
      if (task === 'exit' || task === 'quit') {
        rl.close();
        return;
      }
      if (task.length === 0) {
        rl.prompt();
        return;
      }

      // Execute task asynchronously
      void (async () => {
        const orchestrateOptions: OrchestrateOptions = {
          task,
          verbose: options.verbose,
          format: options.format,
          model: options.model,
          dryRun: options.dryRun,
          maxTokens: options.maxTokens,
          maxCostUsd: options.maxCostUsd,
        };
        await orchestrateCommand(orchestrateOptions);
        process.stdout.write('\n');
        rl.prompt();
      })();
    });

    rl.on('close', () => {
      logger.info('Orchestrator REPL closed');
      resolve();
    });
  });
}

/**
 * Starts orchestrator mode for standalone CLI operation.
 * Executes a single task or enters interactive REPL mode.
 *
 * (Source: Issue #446 - Implement orchestrator mode)
 *
 * @param options - Orchestrator mode options
 */
export async function startOrchestratorMode(options: OrchestratorModeOptions): Promise<void> {
  const logger = createLogger({ component: 'orchestrator' });
  if (options.verbose) logger.setLevel('debug');

  logger.info('Starting Nexus Agents in orchestrator mode', {
    version: VERSION,
    hasTask: options.task !== undefined,
  });

  // If a task was provided, execute it and exit
  if (options.task !== undefined) {
    const orchestrateOptions: OrchestrateOptions = {
      task: options.task,
      verbose: options.verbose,
      format: options.format,
      model: options.model,
      dryRun: options.dryRun,
      maxTokens: options.maxTokens,
      maxCostUsd: options.maxCostUsd,
    };
    const exitCode = await orchestrateCommand(orchestrateOptions);
    process.exit(exitCode);
  }

  // Check if stdin is TTY for interactive mode
  if (process.stdin.isTTY) {
    await runOrchestratorRepl(options, logger);
    process.exit(EXIT_CODES.SUCCESS);
  }

  // Non-interactive: read task from stdin
  logger.info('Reading task from stdin...');
  const chunks: string[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(String(chunk));
  }
  const task = chunks.join('').trim();
  if (task.length === 0) {
    logger.error('No task provided. Use --task or pipe input via stdin.');
    process.exit(EXIT_CODES.INVALID_ARGS);
  }
  const orchestrateOptions: OrchestrateOptions = {
    task,
    verbose: options.verbose,
    format: options.format,
    model: options.model,
    dryRun: options.dryRun,
    maxTokens: options.maxTokens,
    maxCostUsd: options.maxCostUsd,
  };
  const exitCode = await orchestrateCommand(orchestrateOptions);
  process.exit(exitCode);
}
