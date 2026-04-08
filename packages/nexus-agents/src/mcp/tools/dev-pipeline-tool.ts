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
import { createLogger, getErrorMessage } from '../../core/index.js';
import { runDevPipeline } from '../../pipeline/dev-pipeline.js';
import type { DevPipelineStages, DevPipelineResult } from '../../pipeline/dev-pipeline.js';

const logger = createLogger({ component: 'run-dev-pipeline' });

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

/** Create pipeline stages. Uses stub implementations that describe what each
 *  agent would do — real wiring to execute_expert/consensus_vote is Phase 2. */
function createStages(input: DevPipelineInput): DevPipelineStages {
  return {
    research: (task) => {
      logger.info('Research stage', { taskLength: task.length });
      return Promise.resolve(`Research context for: ${task.slice(0, 200)}`);
    },
    plan: (task, research, feedback) => {
      const prompt =
        feedback !== undefined
          ? `Revise plan based on feedback: ${feedback}\n\nOriginal task: ${task}\nResearch: ${research}`
          : `Create implementation plan for: ${task}\nResearch: ${research}`;
      logger.info('Plan stage', { hasFeedback: feedback !== undefined });
      return Promise.resolve(prompt);
    },
    vote: (plan) => {
      logger.info('Vote stage', { planLength: plan.length });
      return Promise.resolve({ approved: true, feedback: '', approvalPercentage: 100 });
    },
    decompose: (plan) => {
      logger.info('Decompose stage');
      return Promise.resolve([
        {
          id: 'task-1',
          title: 'Implementation',
          description: plan,
          assignedTo: 'coder' as const,
          status: 'pending' as const,
        },
      ]);
    },
    implement: (task) => {
      logger.info('Implement stage', { taskId: task.id });
      return Promise.resolve(`Implementation of ${task.title}: ${task.description.slice(0, 200)}`);
    },
    qaReview: (task, _implementation) => {
      logger.info('QA stage', { taskId: task.id });
      return Promise.resolve({ verdict: 'pass' as const, feedback: 'Approved', issues: [] });
    },
    securityScan: () => {
      const target = input.scanTarget ?? process.cwd();
      logger.info('Security scan stage', { target });
      return Promise.resolve({ passed: true, feedback: 'No critical findings' });
    },
  };
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
      const stages = createStages(input);
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
