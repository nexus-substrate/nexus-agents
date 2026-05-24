/**
 * nexus-agents/mcp - Delegate to Model Tool
 *
 * MCP tool for capability-matched task routing.
 * Routes tasks to optimal model based on task requirements and available capacity.
 * Supports intelligent routing via CompositeRouter when available.
 *
 * @module mcp/tools/delegate-to-model
 * (Source: MCP Protocol 2025-11-25)
 * (Source: cli-project_plan.md v2.0.0)
 * (Source: Issue #169, Epic #164)
 * (Refactored: Issue #531 - Use createSecureHandlerFactory)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getErrorMessage, createLogger, formatZodError, type ILogger } from '../../core/index.js';
import { DEFAULTS } from '../../config/defaults.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import {
  mapCompositeDecisionToOutput,
  routeViaCompositeRouter,
  recordRoutingOutcome,
} from './delegate-to-model-router.js';
import type { DelegateDeps, ToolResult } from './delegate-to-model-types.js';
import {
  DelegateInputSchema,
  DelegateOutputSchema,
  TOOL_SCHEMA,
} from './delegate-to-model-types.js';
import {
  analyzeTask,
  selectModel,
  buildDelegateOutput,
  successResultStructured,
  errorResult,
  scoreModel,
} from './delegate-to-model-helpers.js';
import { getToolMemory } from './tool-memory.js';
import { createMcpNotifier, NOOP_NOTIFIER, type IMcpNotifier } from '../mcp-notifier.js';
// getOutcomeStore / detectTaskCategory / CliName / getCliForModel / time +
// random providers were used by the removed recordToOutcomeStore (#2724).
import {
  delegateInputToTaskContract,
  executeDelegatePipeline,
} from '../../pipeline/v2-delegate.js';
import { resolveV2Config } from '../../pipeline/v2-config.js';
import {
  classifyWithGovernance,
  auditGovernancePromotion,
} from '../gateway/governance-enforcer.js';
import type { GovernanceClassification } from '../gateway/governance-enforcer.js';
import { getToolAnnotations } from '../tool-annotations.js';

// Re-export types for backward compatibility
export type {
  PreferredCapability,
  CapabilityProfile,
  DelegateInput,
  DelegateOutput,
  DelegateDeps,
  TaskRequirements,
  ScoredModel,
  ToolResult,
} from './delegate-to-model-types.js';
export {
  MODEL_CAPABILITIES,
  DelegateInputSchema,
  DelegateOutputSchema,
  TOOL_SCHEMA,
} from './delegate-to-model-types.js';

// ============================================================================
// Memory Recording (Issue #753)
// ============================================================================

/**
 * Records a delegation to tool-memory (the "learned pattern" trail).
 *
 * Pre-#2724 this ALSO appended a `success: true` row to the OutcomeStore
 * — but `delegate_to_model` is a recommendation tool, not an execution.
 * Writing synthetic success outcomes for unexecuted tasks polluted every
 * downstream routing aggregation (`weather_report.byCategory`,
 * `recommendedMappings`, LinUCB, TOPSIS, fitness-audit). Audit of
 * `~/.nexus-agents/learning/outcomes.jsonl` found 3993 source-delegate
 * rows total — a large fraction were these synthetic positives. Recording
 * here was removed; the 9 OTHER `source: 'delegate'` writers (orchestrate,
 * agent-executor, parallel-exploration, …) which record real execution
 * outcomes are unchanged.
 */
function recordDelegation(
  task: string,
  model: string,
  usedRouter: boolean,
  _startMs: number,
  _governance?: GovernanceClassification
): void {
  recordToMemory(task, model, usedRouter);
}

/** Records delegation to tool memory. Best-effort, never throws. */
function recordToMemory(task: string, model: string, usedRouter: boolean): void {
  try {
    const memory = getToolMemory();
    memory.recordLearning({
      pattern: `Task routed to ${model}${usedRouter ? ' (via CompositeRouter)' : ''}`,
      context: `task="${task.slice(0, 40)}"`,
      confidence: usedRouter ? 0.85 : 0.7,
      source: 'delegate-to-model',
    });
    void memory.runPromotionPipeline().catch((error: unknown) => {
      createLogger({ tool: 'delegate-to-model' }).warn('Promotion pipeline failed', { error });
    });
  } catch (error: unknown) {
    createLogger({ tool: 'delegate-to-model' }).warn('Failed to record delegation to memory', {
      error: getErrorMessage(error),
    });
  }
}

// recordToOutcomeStore deleted (#2724) — see comment on recordDelegation
// above. The function unconditionally wrote `success: true` for every
// `delegate_to_model` call, polluting the routing feedback loop with
// synthetic recommendation "wins" for tasks that never executed.

// ============================================================================
// Governance Classification (#928, Phase 2)
// ============================================================================

/** Classifies a delegate request for governance promotion. */
function classifyDelegateGovernance(
  input: { task: string },
  logger: ILogger
): GovernanceClassification {
  const classification = classifyWithGovernance('delegate_to_model', { task: input.task });
  auditGovernancePromotion(classification, 'delegate_to_model', logger);
  return classification;
}

/** Enriches output with governance metadata when promoted. */
function enrichWithGovernance(
  output: Record<string, unknown>,
  governance: GovernanceClassification
): Record<string, unknown> {
  if (!governance.promoted) return output;
  return {
    ...output,
    governance: {
      domain: governance.domain,
      votingThreshold: governance.votingThreshold,
      promotionReason: governance.promotionReason,
    },
  };
}

/** Fire-and-forget V2 pipeline instrumentation (Phase A, Issue #920).
 * `trustTier` threaded in so the V2 policy-engine's `trust-tier` rule
 * actually gates the delegate pipeline (#2957). Pre-#2957 the V2 delegate
 * path had zero policy enforcement because the producer never wrote
 * trustTier into metadata. */
function instrumentV2Pipeline(
  input: { task: string },
  logger: ILogger,
  trustTier: string | undefined
): void {
  const tc = delegateInputToTaskContract(input, trustTier !== undefined ? { trustTier } : {});
  // #2960: catch rejections so an instrumentation-path failure logs
  // instead of becoming an unhandled rejection. Mirrors the sibling
  // pattern at `mcp/tools/orchestrate.ts:822-826`.
  void executeDelegatePipeline(tc)
    .then((m) => {
      logger.info('V2 delegate pipeline', { ...m });
    })
    .catch((error: unknown) => {
      logger.warn('V2 delegate instrumentation failed', { error: getErrorMessage(error) });
    });
}

/** Options for notifyAndRecord. */
interface NotifyRecordOpts {
  notifier: IMcpNotifier;
  task: string;
  model: string;
  router: string;
  startMs: number;
  governance: GovernanceClassification;
}

/** Notifies model selection and records delegation. */
function notifyAndRecord(opts: NotifyRecordOpts): void {
  opts.notifier.info('delegate', {
    event: 'model_selected',
    model: opts.model,
    router: opts.router,
    durationMs: Date.now() - opts.startMs,
  });
  recordDelegation(
    opts.task,
    opts.model,
    opts.router === 'CompositeRouter',
    opts.startMs,
    opts.governance
  );
}

/** Attempts routing via CompositeRouter. Returns result or null. */
async function tryCompositeRoute(
  deps: DelegateDeps,
  ctx: HandlerContext,
  opts: NotifyRecordOpts
): Promise<ToolResult | null> {
  if (deps.router === undefined) return null;
  const requirements = analyzeTask(opts.task);
  const routerResult = await routeViaCompositeRouter(
    opts.task,
    deps.router,
    deps.feedbackIntegration,
    ctx.logger
  );
  if (routerResult === null) {
    ctx.logger.info('Falling back to local model selection');
    return null;
  }
  const output = mapCompositeDecisionToOutput(routerResult.decision, requirements.estimatedTokens);
  ctx.logger.info('Routed via CompositeRouter', { model: output.recommended_model });
  notifyAndRecord({ ...opts, model: output.recommended_model, router: 'CompositeRouter' });
  // Close the feedback loop so pending decisions don't accumulate (#1160)
  recordRoutingOutcome(routerResult, Date.now() - opts.startMs, ctx.logger);
  return successResultStructured(enrichWithGovernance(output, opts.governance));
}

/**
 * Creates the core handler logic for delegate_to_model tool.
 * Uses CompositeRouter when available, falls back to local model selection.
 */
function createDelegateHandler(
  deps: DelegateDeps
): (args: unknown, ctx: HandlerContext) => Promise<ToolResult> {
  const notifier = deps.notifier ?? NOOP_NOTIFIER;
  return async (args: unknown, ctx: HandlerContext): Promise<ToolResult> => {
    const startMs = Date.now();
    const validated = DelegateInputSchema.safeParse(args);
    if (!validated.success) {
      ctx.logger.warn('Invalid input', { errors: validated.error.issues });
      return errorResult(`Validation error: ${formatZodError(validated.error)}`);
    }
    const input = validated.data;
    notifier.info('delegate', { event: 'routing_start', taskLength: input.task.length });
    ctx.logger.info('Analyzing task for model routing', { taskLength: input.task.length });
    const governance = classifyDelegateGovernance(input, ctx.logger);
    if (resolveV2Config().delegateEnabled) {
      // Thread requestContext.trustTier so the V2 policy-engine actually
      // gates the pipeline (#2957).
      instrumentV2Pipeline(input, ctx.logger, ctx.requestContext.trustTier);
    }
    const baseOpts: NotifyRecordOpts = {
      notifier,
      task: input.task,
      model: '',
      router: '',
      startMs,
      governance,
    };
    const compositeResult = await tryCompositeRoute(deps, ctx, baseOpts);
    if (compositeResult !== null) {
      return compositeResult;
    }
    const requirements = analyzeTask(input.task);
    const billingMode = input.billing_mode ?? DEFAULTS.PROVIDER_DEFAULTS.billingMode;
    const selection = selectModel(input, requirements, billingMode);
    const output = buildDelegateOutput(selection, requirements);
    if (!output) return errorResult(`Unknown model: ${selection.model}`);
    ctx.logger.info('Model recommendation complete', { model: output.recommended_model });
    notifyAndRecord({ ...baseOpts, model: output.recommended_model, router: 'local' });
    return successResultStructured(enrichWithGovernance(output, governance));
  };
}

/**
 * Registers the delegate_to_model tool with the MCP server.
 *
 * Uses createSecureHandler for standardized security middleware (Issue #531).
 * Includes timeout protection for CVE-2026-0621 mitigation (Issue #271).
 *
 * @category MCP
 * @param server - MCP server instance
 * @param deps - Dependencies
 */
export function registerDelegateToModelTool(server: McpServer, deps: DelegateDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'delegate_to_model' });
  const notifier = deps.notifier ?? createMcpNotifier(server);

  // Wrap handler with secure handler for rate limiting and request context (Issue #531)
  const depsWithNotifier = { ...deps, notifier };
  const secureHandler = createSecureHandler(createDelegateHandler(depsWithNotifier), {
    toolName: 'delegate_to_model',
    rateLimiter: deps.rateLimiter,
    logger,
  });

  // Wrap with timeout protection (Issue #271, CVE-2026-0621)
  const timeoutMs = getToolTimeout('delegate_to_model', deps.security);
  const wrappedHandler = wrapToolWithTimeout('delegate_to_model', secureHandler, {
    timeoutMs,
    logger,
  });

  server.registerTool(
    'delegate_to_model',
    {
      description:
        'Pick which EXISTING model should handle a task. Inspects task complexity and returns the best-fit model from the routing registry — does NOT add a new model. Read-only. (For drafting a registry entry for a new model, use `registry_import`.)',
      inputSchema: TOOL_SCHEMA,
      outputSchema: DelegateOutputSchema.shape,

      annotations: getToolAnnotations('delegate_to_model'),
    },
    toSdkCallback(wrappedHandler)
  );
  logger.info('Registered delegate_to_model tool with secure handler and timeout protection');
}

/**
 * Exports for testing.
 */
export const _testing = {
  analyzeTask,
  scoreModel,
  selectModel,
  classifyDelegateGovernance,
  enrichWithGovernance,
};
