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
import { createLogger, getErrorMessage, formatZodError, type ILogger } from '../../core/index.js';
import { runAdaptiveOrchestrator, classifyTask } from '../../pipeline/adaptive-orchestrator.js';
import { warnIfSimulatedOutsideTests } from './simulation-guard.js';
import type { AdaptiveOrchestratorResult } from '../../pipeline/adaptive-orchestrator.js';
import { createAgentStages } from '../../pipeline/agent-executor.js';
import {
  createDevStageRegistry,
  createGreenfieldStageRegistry,
  createAuditStageRegistry,
} from '../../pipeline/stage-wrappers.js';
import { listTemplateIds } from '../../pipeline/templates.js';
import { getToolAnnotations } from '../tool-annotations.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler } from '../middleware/secure-handler.js';
import {
  toolStructuredError,
  toolSuccessStructured,
  type BaseMcpToolDeps,
  type ToolResult,
} from './tool-result.js';

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
  /** Override template — see `listTemplateIds()` for the canonical list (#2728). Auto-detected if omitted. */
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
  /** TESTS ONLY — random output, must not be used for real decisions. (#2319) */
  simulateVotes: z
    .boolean()
    .default(false)
    .describe('TESTS ONLY — random output, must not be used for real decisions (#2319)'),
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
    // Rate limit awareness (#1802)
    rateLimitHint:
      result.error?.toLowerCase().includes('rate limit') === true
        ? 'Consider using quickMode or increasing delay between pipeline runs'
        : undefined,
  };
}

// ============================================================================
// Input Resolution
// ============================================================================

/**
 * Resolve task text — prepend spec file content if provided.
 *
 * Async because spec files can be large and the previous synchronous read
 * blocked libuv for the duration, stalling concurrent MCP requests (#2354).
 */
async function resolveTask(task: string, specFile: string | undefined): Promise<string> {
  if (specFile === undefined) return task;
  const resolved = path.resolve(specFile);
  // Path traversal guard — restrict to cwd subtree (security audit 2026-04-10)
  const cwdRoot = path.resolve('.');
  if (!resolved.startsWith(cwdRoot)) {
    throw new Error(`Path traversal denied: specFile must be within ${cwdRoot}`);
  }
  try {
    const specContent = await fs.promises.readFile(resolved, 'utf-8');
    return `${specContent}\n\n---\n\n${task}`;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Spec file not found: ${resolved}`);
    }
    throw err;
  }
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

// Templates listed dynamically so a new entry in PIPELINE_TEMPLATES can't
// drift this description (#2728 — previously hardcoded the pre-`general`
// 4-template list).
const RUN_PIPELINE_DESCRIPTION = `Single unified entry point for all pipeline templates (${listTemplateIds().join('/')}). Auto-detects template from task content or accepts an explicit override.`;

/** Validates input, runs the adaptive orchestrator, and shapes the result. */
async function runPipelineHandler(args: unknown, logger: ILogger): Promise<ToolResult> {
  const parsed = PipelineInputSchema.safeParse(args);
  if (!parsed.success) {
    return toolStructuredError({
      errorCategory: 'validation',
      message: `Invalid input: ${formatZodError(parsed.error)}`,
    });
  }
  const input = parsed.data;
  if (input.simulateVotes) {
    warnIfSimulatedOutsideTests('run_pipeline', logger);
  }

  try {
    const task = await resolveTask(input.task, input.specFile);
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

    return toolSuccessStructured(buildOutput(result));
  } catch (error: unknown) {
    return toolStructuredError({
      errorCategory: 'internal',
      message: `Pipeline error: ${getErrorMessage(error)}`,
    });
  }
}

/**
 * Register the run_pipeline MCP tool.
 *
 * Routed through the standard `createSecureHandler → wrapToolWithTimeout →
 * toSdkCallback` chain like every other tool (#2824): the bare-callback
 * registration it used before had no rate-limiting, no abort-signal /
 * progress-token plumbing, and surfaced a `ZodError` on bad input as a raw
 * JSON-RPC `-32603` instead of a structured `validation` envelope.
 */
export function registerPipelineTool(server: McpServer, deps: BaseMcpToolDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'run_pipeline' });
  const secureHandler = createSecureHandler((args: unknown) => runPipelineHandler(args, logger), {
    toolName: 'run_pipeline',
    rateLimiter: deps.rateLimiter,
    logger,
  });
  const timeoutMs = getToolTimeout('run_pipeline', deps.security);
  const wrapped = wrapToolWithTimeout('run_pipeline', secureHandler, { timeoutMs, logger });

  server.registerTool(
    'run_pipeline',
    {
      description: RUN_PIPELINE_DESCRIPTION,
      inputSchema: PipelineInputSchema.shape,
      annotations: getToolAnnotations('run_pipeline'),
    },
    toSdkCallback(wrapped)
  );
  logger.info('Registered run_pipeline tool');
}
