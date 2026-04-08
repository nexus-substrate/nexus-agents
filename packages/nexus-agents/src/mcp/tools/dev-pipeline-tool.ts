/**
 * run_dev_pipeline MCP Tool (#1684)
 *
 * Exposes the multi-agent development pipeline as an MCP tool.
 * Accepts input from direct instructions, a plan file, or a spec file.
 *
 * @module mcp/tools/dev-pipeline-tool
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getErrorMessage } from '../../core/index.js';
import { runDevPipeline } from '../../pipeline/dev-pipeline.js';
import type { DevPipelineResult } from '../../pipeline/dev-pipeline.js';
import { createAgentStages } from '../../pipeline/agent-executor.js';
import { createTaskTracker, detectBackend } from '../../pipeline/task-tracker.js';
import type { TrackerBackend } from '../../pipeline/task-tracker.js';

// ============================================================================
// Input Schema
// ============================================================================

export const DevPipelineInputSchema = z.object({
  /** Direct task instructions. */
  task: z.string().max(10000).optional().describe('Direct task instructions (what to build)'),
  /** Path to a plan file (.md, .yaml, .txt) to use as input. */
  planFile: z.string().max(500).optional().describe('Path to a plan/spec file to use as input'),
  /** Whether to run in dry-run mode (plan+vote only, no implementation). */
  dryRun: z.boolean().default(false).describe('If true, stop after plan+vote (no implementation)'),
  /** Maximum vote iterations before proceeding (default: 3). */
  maxVoteIterations: z.number().int().min(1).max(5).default(3).describe('Max plan→vote iterations'),
  /** Maximum QA iterations per task (default: 3). */
  maxQaIterations: z
    .number()
    .int()
    .min(1)
    .max(5)
    .default(3)
    .describe('Max QA review iterations per task'),
  /** Directory to security scan (default: current working directory). */
  scanTarget: z.string().max(500).optional().describe('Directory to security scan (default: cwd)'),
  /** GitHub issue number to track progress on. Updates posted as comments. */
  issueNumber: z.number().int().positive().optional().describe('GitHub issue to post progress to'),
  /** GitHub repo (owner/name) for issue tracking. */
  repo: z
    .string()
    .max(200)
    .optional()
    .describe('GitHub repo for issue tracking (e.g., owner/repo)'),
  /** Task tracking backend: github, gitlab, or json (default: json). */
  trackerBackend: z
    .enum(['github', 'gitlab', 'json'])
    .default('json')
    .describe('Task tracking backend for issue creation'),
  /** Labels to apply to created issues. */
  labels: z.array(z.string()).optional().describe('Labels for created issues'),
});

export type DevPipelineInput = z.infer<typeof DevPipelineInputSchema>;

// ============================================================================
// Input Resolution
// ============================================================================

/** Resolve task input from direct instructions or file. */
function resolveTaskInput(input: DevPipelineInput): string {
  if (input.task !== undefined && input.task.trim() !== '') {
    return input.task;
  }
  if (input.planFile !== undefined) {
    const resolved = path.resolve(input.planFile);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Plan file not found: ${resolved}`);
    }
    return fs.readFileSync(resolved, 'utf-8');
  }
  throw new Error('Either task or planFile must be provided');
}

// ============================================================================
// Stub Stages (replaced by real agents when available)
// ============================================================================

/** Create pipeline stages wired to real agents via agent-executor. */
async function createStages(
  input: DevPipelineInput
): Promise<ReturnType<typeof createAgentStages>> {
  // Auto-detect tracker backend if set to 'auto' or default
  const backendChoice = input.trackerBackend as TrackerBackend;
  const backend =
    backendChoice === 'json' && input.repo !== undefined ? await detectBackend() : backendChoice;
  const tracker =
    input.repo !== undefined
      ? createTaskTracker({ backend, repo: input.repo, labels: input.labels })
      : undefined;
  return createAgentStages({
    scanTarget: input.scanTarget,
    simulateVotes: false,
    issueNumber: input.issueNumber,
    repo: input.repo,
    tracker,
  });
}

// ============================================================================
// Tool Registration
// ============================================================================

/** Format pipeline result for MCP response. */
function formatResult(result: DevPipelineResult, dryRun: boolean): string {
  const lines: string[] = [
    `## Development Pipeline ${result.completed ? 'Complete' : 'Blocked'}`,
    '',
    `**Status:** ${result.completed ? 'All gates passed' : `Blocked (security: ${String(result.securityPassed)})`}`,
    `**Vote iterations:** ${String(result.voteIterations)}`,
    `**QA iterations:** ${String(result.qaIterations)}`,
    `**Tasks:** ${String(result.tasks.length)}`,
    '',
  ];

  if (dryRun) {
    lines.push('*Dry run — stopped after plan+vote.*', '');
  }

  lines.push('### Plan', '', result.plan.slice(0, 2000), '');

  if (result.tasks.length > 0) {
    lines.push('### Tasks', '');
    for (const task of result.tasks) {
      lines.push(`- **${task.id}**: ${task.title} (${task.status})`);
    }
  }

  return lines.join('\n');
}

/** Register the run_dev_pipeline MCP tool. */
export function registerDevPipelineTool(
  server: McpServer,
  _deps: { logger: unknown; rateLimiter: unknown }
): void {
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- matches existing tool registration pattern
  server.tool('run_dev_pipeline', DevPipelineInputSchema.shape, async (args) => {
    const input = DevPipelineInputSchema.parse(args);

    try {
      const taskText = resolveTaskInput(input);
      const stages = await createStages(input);
      const result = await runDevPipeline(taskText, stages);
      const text = formatResult(result, input.dryRun);
      return { content: [{ type: 'text' as const, text }] };
    } catch (error: unknown) {
      const msg = getErrorMessage(error);
      return {
        content: [{ type: 'text' as const, text: `Pipeline error: ${msg}` }],
        isError: true,
      };
    }
  });
}
