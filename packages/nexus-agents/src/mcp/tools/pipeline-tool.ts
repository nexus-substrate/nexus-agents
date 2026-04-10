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
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getErrorMessage } from '../../core/index.js';
import { runAdaptiveOrchestrator } from '../../pipeline/adaptive-orchestrator.js';
import type { AdaptiveOrchestratorResult } from '../../pipeline/adaptive-orchestrator.js';
import { createAgentStages } from '../../pipeline/agent-executor.js';
import { createDevStageRegistry } from '../../pipeline/stage-wrappers.js';
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
  /** Override template (dev, research, audit). Auto-detected if omitted. */
  template: z
    .string()
    .max(50)
    .optional()
    .describe(`Pipeline template override. Available: ${listTemplateIds().join(', ')}`),
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
      const agentStages = createAgentStages({
        simulateVotes: input.simulateVotes,
      });
      const stages = createDevStageRegistry(agentStages);

      const result = await runAdaptiveOrchestrator(input.task, {
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
