/**
 * nexus-tui — Orchestrate command
 *
 * Task orchestration via the core orchestration engine.
 *
 * @module commands/orchestrate
 */

import type { CommandHandler, CommandResult } from '../types.js';
import { sanitizeOutput } from '../sanitize.js';

/** Create the orchestrate command handler. */
export function createOrchestrateCommand(): CommandHandler {
  return {
    name: 'orchestrate',
    description: 'Orchestrate a task with specialized agents',
    usage: 'orchestrate <task description>',
    async execute(args: readonly string[]): Promise<CommandResult> {
      const task = args.filter((a) => !a.startsWith('--')).join(' ');
      if (task.length === 0) {
        return { output: 'Usage: orchestrate <task description>', isError: true };
      }
      try {
        const { analyzeDelegateTask, selectModel } = await import('nexus-agents');
        const requirements = analyzeDelegateTask(task);
        const result = selectModel({ task, estimate_tokens: false }, requirements);
        const lines = [
          `Task: ${sanitizeOutput(task)}`,
          `Routed to: ${result.model}`,
          `Reasoning: ${result.reasoning}`,
          '',
          'Note: Full orchestration requires model API keys.',
          'Use delegate/workflow commands for local analysis.',
        ];
        return { output: lines.join('\n') };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { output: `Orchestration failed: ${msg}`, isError: true };
      }
    },
  };
}
