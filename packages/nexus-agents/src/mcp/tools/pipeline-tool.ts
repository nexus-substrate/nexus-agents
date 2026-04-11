/**
 * run_pipeline MCP Tool (#1736, Phase 3)
 *
 * Single unified entry point for all pipeline types. Auto-detects
 * the appropriate pipeline template based on task analysis, or
 * accepts an explicit template override.
 *
 * @module mcp/tools/pipeline-tool
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getErrorMessage } from '../../core/index.js';
import { runAdaptiveOrchestrator, classifyTask } from '../../pipeline/adaptive-orchestrator.js';
import type { AdaptiveOrchestratorResult } from '../../pipeline/adaptive-orchestrator.js';
import { createAgentStages } from '../../pipeline/agent-executor.js';
import {
  createDevStageRegistry,
  createGreenfieldStageRegistry,
  createAuditStageRegistry,
} from '../../pipeline/stage-wrappers.js';
import { listTemplateIds } from '../../pipeline/templates.js';

// ============================================================================
// Input Schema
// ============================================================================

export const PipelineInputSchema = z.object({
  /** The task to execute. */
  task: z
    .string()
    .min(5)
    .max(10000)
    .describe('Task description — pipeline template auto-selected based on content'),
  /** Path to a spec file (.md, .yaml) to use as task input. */
  specFile: z
    .string()
    .max(500)
    .optional()
    .describe('Path to a spec file — content prepended to task for greenfield projects'),
  /** Override template (dev, research, audit, greenfield). Auto-detected if omitted. */
  template: z
    .string()
    .max(50)
    .optional()
    .describe(`Pipeline template override. Available: ${listTemplateIds().join(', ')}`),
  /** Voting strategy for consensus stages. */
  votingStrategy: z
    .enum([
      'simple_majority',
      'supermajority',
      'unanimous',
      'higher_order',
      'proof_of_learning',
      'opinion_wise',
    ])
    .optional()
    .describe(
      'Voting strategy for plan approval. simple_majority (default), supermajority (67%), unanimous, higher_order (Bayesian), proof_of_learning, opinion_wise'
    ),
  /** Use 3 agents instead of 6 for faster voting. */
  quickMode: z
    .boolean()
    .default(false)
    .describe('Use 3 agents instead of 6 for faster consensus voting'),
  /** Maximum execution time per stage in milliseconds (min 30s, max 600s). */
  timeoutMs: z
    .number()
    .int()
    .min(30_000)
    .max(600_000)
    .optional()
    .describe('Max time per stage in ms (30000-600000). Default: varies by stage complexity'),
  /** Stop after planning/voting (no implementation). */
  dryRun: z.boolean().default(false).describe('Stop after vote stage (no implementation)'),
  /** Use simulated votes (for testing). */
  simulateVotes: z
    .boolean()
    .default(false)
    .describe('Use simulated votes (for testing without real CLIs)'),
});

export type PipelineInput = z.infer<typeof PipelineInputSchema>;

// ============================================================================
// Output Formatting
// ============================================================================

function buildOutput(result: AdaptiveOrchestratorResult): Record<string, unknown> {
  return {
    success: result.success,
    templateId: result.templateId,
    selectionMethod: result.selectionMethod,
    taskClassification: result.taskClassification,
    stepsExecuted: result.stepsExecuted,
    durationMs: result.durationMs,
    error: result.error ?? null,
  };
}

// ============================================================================
// Input Resolution
// ============================================================================

/** Resolve task text — prepend spec file content if provided. */
function resolveTask(task: string, specFile: string | undefined): string {
  if (specFile === undefined) return task;
  const resolved = path.resolve(specFile);
  // Path traversal guard — restrict to cwd subtree (security audit 2026-04-10)
  const cwdRoot = path.resolve('.');
  if (!resolved.startsWith(cwdRoot)) {
    throw new Error(`Path traversal denied: specFile must be within ${cwdRoot}`);
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`Spec file not found: ${resolved}`);
  }
  const specContent = fs.readFileSync(resolved, 'utf-8');
  return `${specContent}\n\n---\n\n${task}`;
}

/** Select the appropriate stage registry based on template or auto-detection. */
function selectStageRegistry(
  template: string | undefined,
  task: string,
  agentStages: ReturnType<typeof createAgentStages>
): Map<string, import('../../pipeline/stage-types.js').IPipelineStage> {
  // Use explicit template or auto-detect from task content
  const effectiveTemplate = template ?? classifyTask(task).pipelineType;

  if (effectiveTemplate === 'greenfield') {
    return createGreenfieldStageRegistry(agentStages);
  }
  if (effectiveTemplate === 'audit') {
    return createAuditStageRegistry();
  }
  return createDevStageRegistry(agentStages);
}

// ============================================================================
// Tool Registration
// ============================================================================

/** Register the run_pipeline MCP tool. */
export function registerPipelineTool(
  server: McpServer,
  _deps: { logger: unknown; rateLimiter: unknown }
): void {
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- matches existing tool registration pattern
  server.tool('run_pipeline', PipelineInputSchema.shape, async (args) => {
    const input = PipelineInputSchema.parse(args);

    try {
      const task = resolveTask(input.task, input.specFile);
      const agentStages = createAgentStages({
        simulateVotes: input.simulateVotes,
        votingStrategy: input.votingStrategy,
        quickMode: input.quickMode,
      });
      const stages = selectStageRegistry(input.template, task, agentStages);

      const result = await runAdaptiveOrchestrator(task, {
        stages,
        templateId: input.template,
        dryRun: input.dryRun,
      });

      const structured = buildOutput(result);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(structured, null, 2) }],
        structuredContent: structured,
      };
    } catch (error: unknown) {
      return {
        content: [{ type: 'text' as const, text: `Pipeline error: ${getErrorMessage(error)}` }],
        isError: true,
      };
    }
  });
}
