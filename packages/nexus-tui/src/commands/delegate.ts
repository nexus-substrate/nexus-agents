/**
 * nexus-tui — Delegate command
 *
 * Routes a task to the optimal model via delegate_to_model logic.
 *
 * @module commands/delegate
 */

import type { CommandHandler, CommandResult } from '../types.js';

/** Create the delegate command handler. */
export function createDelegateCommand(): CommandHandler {
  return {
    name: 'delegate',
    description: 'Route a task to the optimal model',
    usage: 'delegate <task description> [--prefer=reasoning|speed|code|context]',
    async execute(args: readonly string[]): Promise<CommandResult> {
      const task = args.filter((a) => !a.startsWith('--')).join(' ');
      if (task.length === 0) {
        return { output: 'Usage: delegate <task description>', isError: true };
      }
      try {
        const { analyzeDelegateTask, selectModel } = await import('nexus-agents');
        const prefer = args.find((a) => a.startsWith('--prefer='))?.slice(9);
        const valid = ['reasoning', 'speed', 'code', 'context'] as const;
        const cap = valid.find((v): v is (typeof valid)[number] => v === prefer);
        const requirements = analyzeDelegateTask(task);
        const input = {
          task,
          estimate_tokens: false,
          ...(cap !== undefined && { preferred_capability: cap }),
        };
        const result = selectModel(input, requirements);
        const lines = [`Model: ${result.model}`, `Reasoning: ${result.reasoning}`];
        for (const alt of result.alternatives.slice(0, 2)) {
          lines.push(`Alternative: ${alt.model} (${alt.tradeoff})`);
        }
        return { output: lines.join('\n') };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { output: `Delegation failed: ${msg}`, isError: true };
      }
    },
  };
}
