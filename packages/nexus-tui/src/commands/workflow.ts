/**
 * nexus-tui — Workflow command
 *
 * List and run graph workflows.
 *
 * @module commands/workflow
 */

import type { CommandHandler, CommandResult } from '../types.js';
import { formatTable } from '../formatter.js';
import { sanitizeOutput, safeParseJson } from '../sanitize.js';

/** Create the workflow command handler. */
export function createWorkflowCommand(): CommandHandler {
  return {
    name: 'workflow',
    description: 'List or run graph workflows',
    usage: 'workflow list | workflow run <name> [--input=JSON]',
    async execute(args: readonly string[]): Promise<CommandResult> {
      const sub = args[0]?.toLowerCase();
      if (sub === 'list') return listWorkflows();
      if (sub === 'run') return runWorkflow(args.slice(1));
      return { output: 'Usage: workflow list | workflow run <name>', isError: true };
    },
  };
}

async function listWorkflows(): Promise<CommandResult> {
  try {
    const { getGraphWorkflowList } = await import('nexus-agents');
    const list = getGraphWorkflowList();
    const rows: Array<readonly [string, string]> = list.map((w) => [
      w.name,
      `${w.description} (${String(w.nodeCount)} nodes)`,
    ]);
    return { output: formatTable(rows) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { output: `Failed to list workflows: ${msg}`, isError: true };
  }
}

async function runWorkflow(args: readonly string[]): Promise<CommandResult> {
  const name = args.find((a) => !a.startsWith('--'));
  if (name === undefined) {
    return { output: 'Usage: workflow run <name> [--input=JSON]', isError: true };
  }
  try {
    const { getGraphRegistry, executeGraph } = await import('nexus-agents');
    const registry = getGraphRegistry();
    const factory = registry.get(name);
    if (factory === undefined) {
      return { output: `Unknown workflow: ${sanitizeOutput(name)}`, isError: true };
    }
    const graph = factory();
    if (graph === undefined) {
      return { output: `Workflow '${sanitizeOutput(name)}' failed to compile`, isError: true };
    }
    const inputFlag = args.find((a) => a.startsWith('--input='));
    let inputs: Record<string, unknown> = {};
    if (inputFlag !== undefined) {
      const parsed = safeParseJson(inputFlag.slice(8));
      if ('error' in parsed) {
        return { output: `Invalid --input JSON: ${parsed.error}`, isError: true };
      }
      inputs = parsed.value;
    }
    const result = await executeGraph(graph, inputs);
    if (!result.ok) {
      return { output: `Workflow failed: ${result.error.message}`, isError: true };
    }
    const lines = [
      `Workflow '${sanitizeOutput(name)}' completed`,
      `Nodes executed: ${String(result.value.nodeResults.length)}`,
      `Final state: ${JSON.stringify(result.value.finalState, null, 2)}`,
    ];
    return { output: lines.join('\n') };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { output: `Workflow execution failed: ${msg}`, isError: true };
  }
}
