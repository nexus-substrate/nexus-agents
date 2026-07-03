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
import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger, getErrorMessage, formatZodError, type ILogger } from '../../core/index.js';
import { runAdaptiveOrchestrator, classifyTask } from '../../pipeline/adaptive-orchestrator.js';
import { checkSimulationAllowed, simulationDeniedResult } from './simulation-guard.js';
import type { AdaptiveOrchestratorResult } from '../../pipeline/adaptive-orchestrator.js';
import { createAgentStages } from '../../pipeline/agent-executor.js';
import type { AgentBudgetConfig } from '../../pipeline/budget-guard.js';
import { estimateRelativeBudget, resolveBudgetTolerance } from '../../pipeline/budget-guard.js';
import { getTemplate } from '../../pipeline/templates.js';
import { createSharedTaskAnalyzer } from '../../core/task-analysis/shared-task-analyzer.js';
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
// #3730 / epic #2631: async-mode dispatch via the shared `runAsJob` helper.
import { runAsJob } from '../jobs/run-as-job.js';

/**
 * Discoverability hint (#3730) appended to sync run_pipeline error/timeout
 * envelopes. A real multi-stage adaptive run can exceed the 900s MCP request
 * timeout; async mode is the durable escape hatch.
 */
const PIPELINE_ASYNC_HINT =
  'A full run_pipeline run can exceed the synchronous MCP request timeout. ' +
  "Retry with `dispatch: 'async'` to get a jobId immediately, then poll " +
  'get_job_result({ jobId }) for the result.';

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
  /**
   * Dispatch mode (#3730). `sync` (default) runs the pipeline inline and
   * returns the result — but a real multi-stage adaptive run can exceed the
   * 900s MCP request timeout. `async` returns a `{ status: 'pending', jobId }`
   * envelope immediately and runs the pipeline in the background; poll
   * `get_job_result({ jobId })` for the result. Ignored when `dryRun` is true
   * (plan+vote completes fast, so dry runs always stay sync).
   */
  dispatch: z
    .enum(['sync', 'async'])
    .default('sync')
    .describe(
      "Dispatch mode (#3730). 'sync' (default): run inline. 'async': return a jobId immediately + run in background (poll get_job_result). Ignored for dryRun."
    ),
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

function buildOutput(
  result: AdaptiveOrchestratorResult,
  simulated: boolean
): Record<string, unknown> {
  return {
    success: result.success,
    templateId: result.templateId,
    selectionMethod: result.selectionMethod,
    taskClassification: result.taskClassification,
    stepsExecuted: result.stepsExecuted,
    durationMs: result.durationMs,
    error: result.error ?? null,
    // #4170: stamped only on an explicit NEXUS_ALLOW_SIMULATE=1 opt-in run so
    // a random demo panel can never pass as a real decision.
    ...(simulated ? { simulated: true } : {}),
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
  // Path traversal guard — restrict to cwd subtree. The `+ path.sep` is
  // load-bearing: a sibling whose name starts with the cwd basename
  // (`/home/u/projEVIL` for cwd `/home/u/proj`) bypasses a bare startsWith.
  // Match the convention in security/safe-path.ts.
  const cwdRoot = path.resolve('.');
  if (resolved !== cwdRoot && !resolved.startsWith(cwdRoot + path.sep)) {
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

/** Typical LLM output:input token ratio (matches `buildDryRunReport`). */
const OUTPUT_TOKEN_RATIO = 0.6;
/** Fallback stage count when the effective template can't be resolved. */
const DEFAULT_STAGE_COUNT = 6;

/**
 * Estimate-relative per-run token budget (#3262), gated behind
 * `NEXUS_BUDGET_ENFORCE=1` (default-off — existing runs are byte-for-byte
 * unchanged). The dry-run estimator is per-CALL, so the whole run is
 * approximated as `perCallTokens × stageCount` (stages of the effective
 * template), then capped at `× tolerance` (NEXUS_BUDGET_TOLERANCE, default 1.5).
 * Token-based — never dollars — so it holds under `NEXUS_BILLING_MODE=plan`.
 * Returns `undefined` (→ the existing no-op guard) when enforcement is off or no
 * usable estimate exists; the fail-OPEN no-op is logged so it's never silent.
 */
function resolveRunBudget(
  task: string,
  templateId: string | undefined,
  logger: ILogger
): AgentBudgetConfig | undefined {
  if (process.env['NEXUS_BUDGET_ENFORCE'] !== '1') return undefined;
  const effectiveId = templateId ?? classifyTask(task).pipelineType;
  const template = getTemplate(effectiveId) ?? getTemplate('general');
  const stageCount = template?.stages.length ?? DEFAULT_STAGE_COUNT;
  const perCall = Math.round(
    createSharedTaskAnalyzer().estimateTokens(task) * (1 + OUTPUT_TOKEN_RATIO)
  );
  const budget = estimateRelativeBudget(perCall * stageCount, resolveBudgetTolerance());
  if (budget === undefined) {
    logger.warn('Budget enforcement on but no usable token estimate — running unguarded (#3262)', {
      perCall,
      stageCount,
    });
  } else {
    logger.info('Estimate-relative token budget enforced (#3262)', {
      template: effectiveId,
      stageCount,
      maxTokens: budget.maxTokens,
    });
  }
  return budget;
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
const RUN_PIPELINE_DESCRIPTION = `Single unified entry point for all pipeline templates (${listTemplateIds().join('/')}). Auto-detects template from task content or accepts an explicit override. Supports dispatch: 'async' (non-dryRun runs) — returns a jobId immediately; poll get_job_result.`;

/**
 * Run the adaptive pipeline for a plain goal string with default settings
 * (auto-detected template, non-simulated). The strategy executor the unified
 * `run` entry point dispatches to for the `pipeline` and `research` strategies
 * (#3575). Mirrors {@link runPipelineHandler} minus arg parsing.
 */
export async function runPipelineForGoal(
  goal: string,
  logger: ILogger = createLogger({ tool: 'run_pipeline' })
): Promise<AdaptiveOrchestratorResult> {
  const budget = resolveRunBudget(goal, undefined, logger);
  const agentStages = createAgentStages(budget !== undefined ? { budget } : {});
  const stages = selectStageRegistry(undefined, goal, agentStages);
  return runAdaptiveOrchestrator(goal, { stages });
}

/**
 * Run the adaptive-orchestrator body + shape the structured success envelope.
 * The sync handler awaits this inline; the async dispatcher backgrounds it via
 * {@link runAsJob}. `task` + `stages` are resolved by the sync prelude in
 * {@link runPipelineHandler} so only the (long) orchestrator body runs in the
 * background (#3730).
 */
async function executePipelineBody(
  task: string,
  stages: ReturnType<typeof selectStageRegistry>,
  templateId: string | undefined,
  dryRun: boolean,
  simulated: boolean
): Promise<ToolResult> {
  const result = await runAdaptiveOrchestrator(task, {
    stages,
    templateId,
    dryRun,
  });
  return toolSuccessStructured(buildOutput(result, simulated));
}

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
  // #4170: simulateVotes fails CLOSED outside test runners — BEFORE the try
  // block (its catch categorizes as `internal`) and BEFORE the async dispatch
  // (sync and async modes must reject identically).
  let simulated = false;
  if (input.simulateVotes) {
    const simCheck = checkSimulationAllowed('run_pipeline', logger);
    if (!simCheck.allowed) return simulationDeniedResult(simCheck.reason);
    simulated = simCheck.optedIn;
  }

  try {
    // Sync prelude — fast: input resolution + stage wiring. Only the
    // orchestrator BODY backgrounds in async mode (#3730).
    const task = await resolveTask(input.task, input.specFile);
    const agentStages = createAgentStages({
      simulateVotes: input.simulateVotes,
      votingStrategy: input.votingStrategy,
      quickMode: input.quickMode,
      budget: resolveRunBudget(task, input.template, logger),
    });
    const stages = selectStageRegistry(input.template, task, agentStages);

    // #3730: async dispatch for real (non-dryRun) runs — a full adaptive
    // pipeline can exceed the 900s MCP request timeout. dryRun ALWAYS stays
    // sync (plan+vote completes fast). run_pipeline has no sessionId, so a
    // fresh `rp-<uuid>` jobId is always minted (no idempotency surface).
    // Returns `{ status: 'pending', jobId }` immediately.
    if (input.dispatch === 'async' && !input.dryRun) {
      return runAsJob<PipelineInput, ToolResult>({
        toolName: 'run_pipeline',
        input,
        freshJobId: () => `rp-${randomUUID()}`,
        run: () => executePipelineBody(task, stages, input.template, input.dryRun, simulated),
        logger,
      });
    }

    return await executePipelineBody(task, stages, input.template, input.dryRun, simulated);
  } catch (error: unknown) {
    // #3730 discoverability: a sync run that times out (or otherwise fails
    // mid-pipeline) should point the caller at async mode — the durable fix
    // for runs that exceed the request timeout.
    return toolStructuredError({
      errorCategory: 'internal',
      message: `${PIPELINE_ASYNC_HINT} Pipeline error: ${getErrorMessage(error)}`,
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
