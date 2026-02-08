/**
 * nexus-tui — Command registry
 *
 * Creates and registers all REPL command handlers.
 *
 * @module commands
 */

import type { CommandHandler } from '../types.js';
import { createHelpCommand } from './help.js';
import { createWeatherCommand } from './weather.js';
import { createStatusCommand } from './status.js';
import { createDelegateCommand } from './delegate.js';
import { createVoteCommand } from './vote.js';
import { createWorkflowCommand } from './workflow.js';
import { createOrchestrateCommand } from './orchestrate.js';
import { createExpertCommand } from './expert.js';
import { createOutcomesCommand } from './outcomes.js';
import { createWatchCommand } from './watch.js';

/** Build the command registry with all available commands. */
export function createCommandRegistry(): Map<string, CommandHandler> {
  const registry = new Map<string, CommandHandler>();

  const commands: CommandHandler[] = [
    createOrchestrateCommand(),
    createVoteCommand(),
    createWeatherCommand(),
    createWorkflowCommand(),
    createDelegateCommand(),
    createExpertCommand(),
    createStatusCommand(),
    createOutcomesCommand(),
    createWatchCommand(),
  ];

  for (const cmd of commands) {
    registry.set(cmd.name, cmd);
  }

  // Help command needs the registry for self-reference
  const help = createHelpCommand(registry);
  registry.set(help.name, help);

  return registry;
}

export { createHelpCommand } from './help.js';
export { createWeatherCommand } from './weather.js';
export { createStatusCommand } from './status.js';
export { createDelegateCommand } from './delegate.js';
export { createVoteCommand } from './vote.js';
export { createWorkflowCommand } from './workflow.js';
export { createOrchestrateCommand } from './orchestrate.js';
export { createExpertCommand } from './expert.js';
export { createOutcomesCommand } from './outcomes.js';
export { createWatchCommand } from './watch.js';
