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
import { createLogger, formatZodError, getTimeProvider, type ILogger } from '../../core/index.js';
import { DEFAULTS } from '../../config/defaults.js';
import { wrapToolWithTimeout, toSdkCallback, getToolTimeout } from '../middleware/tool-wrapper.js';
import { createSecureHandler, type HandlerContext } from '../middleware/secure-handler.js';
import {
  mapCompositeDecisionToOutput,
  routeViaCompositeRouter,
} from './delegate-to-model-router.js';
import type { DelegateDeps, ToolResult } from './delegate-to-model-types.js';
import { DelegateInputSchema, TOOL_SCHEMA } from './delegate-to-model-types.js';
import {
  analyzeTask,
  selectModel,
  buildDelegateOutput,
  successResult,
  errorResult,
  scoreModel,
  getCliForModel,
} from './delegate-to-model-helpers.js';
import { getToolMemory } from './tool-memory.js';
import { getOutcomeStore } from '../../orchestration/outcomes/index.js';
import { detectTaskCategory } from '../../config/task-specialization.js';
import type { CliName } from '../../cli-adapters/types-core.js';
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

/** Records successful delegation to memory and outcome store. Best-effort. */
function recordDelegation(
  task: string,
  model: string,
  usedRouter: boolean,
  startMs: number,
  governance?: GovernanceClassification
): void {
  recordToMemory(task, model, usedRouter);
  recordToOutcomeStore(task, model, startMs, governance);
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
      createLogger({ tool: 'delegate-to-model' }).debug('Promotion pipeline failed', { error });
    });
  } catch {
    // Best-effort
  }
}

/** Records delegation outcome. Best-effort, never throws. */
function recordToOutcomeStore(
  task: string,
  model: string,
  startMs: number,
  governance?: GovernanceClassification
): void {
  try {
    const cli = getCliForModel(model) as CliName | undefined;
    if (cli === undefined) return;
    const match = detectTaskCategory(task);
    const qualitySignals: string[] = [];
    if (governance?.promoted === true) {
      qualitySignals.push(`governance:${governance.domain}`);
    }
    getOutcomeStore().append({
      id: `del-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`,
      cli,
      category: match?.category ?? 'exploration',
      model,
      success: true,
      durationMs: Date.now() - startMs,
      timestamp: new Date(getTimeProvider().now()).toISOString(),
      source: 'delegate',
      ...(qualitySignals.length > 0 ? { qualitySignals } : {}),
    });
  } catch {
    // Best-effort — never block the tool response
  }
}

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

/** Fire-and-forget V2 pipeline instrumentation (Phase A, Issue #920). */
function instrumentV2Pipeline(input: { task: string }, logger: ILogger): void {
  const tc = delegateInputToTaskContract(input);
  void executeDelegatePipeline(tc).then((m) => {
    logger.info('V2 delegate pipeline', { ...m });
  });
}

/**
 * Creates the core handler logic for delegate_to_model tool.
 * Uses CompositeRouter when available, falls back to local model selection.
 */
function createDelegateHandler(
  deps: DelegateDeps
): (args: unknown, ctx: HandlerContext) => Promise<ToolResult> {
  return async (args: unknown, ctx: HandlerContext): Promise<ToolResult> => {
    const startMs = Date.now();
    const validated = DelegateInputSchema.safeParse(args);
    if (!validated.success) {
      ctx.logger.warn('Invalid input', { errors: validated.error.issues });
      return errorResult(`Validation error: ${formatZodError(validated.error)}`);
    }
    const input = validated.data;
    ctx.logger.info('Analyzing task for model routing', { taskLength: input.task.length });
    const requirements = analyzeTask(input.task);
    const governance = classifyDelegateGovernance(input, ctx.logger);
    if (resolveV2Config().delegateEnabled) instrumentV2Pipeline(input, ctx.logger);
    // Try CompositeRouter first if available
    if (deps.router !== undefined) {
      const routingResult = await routeViaCompositeRouter(
        input.task,
        deps.router,
        deps.feedbackIntegration,
        ctx.logger
      );
      if (routingResult !== null) {
        const output = mapCompositeDecisionToOutput(
          routingResult.decision,
          requirements.estimatedTokens
        );
        ctx.logger.info('Routed via CompositeRouter', { model: output.recommended_model });
        recordDelegation(input.task, output.recommended_model, true, startMs, governance);
        return successResult(JSON.stringify(enrichWithGovernance(output, governance), null, 2));
      }
      ctx.logger.info('Falling back to local model selection');
    }
    const billingMode = input.billing_mode ?? DEFAULTS.PROVIDER_DEFAULTS.billingMode;
    const selection = selectModel(input, requirements, billingMode);
    const output = buildDelegateOutput(selection, requirements);
    if (!output) return errorResult(`Unknown model: ${selection.model}`);
    ctx.logger.info('Model recommendation complete', { model: output.recommended_model });
    recordDelegation(input.task, output.recommended_model, false, startMs, governance);
    return successResult(JSON.stringify(enrichWithGovernance(output, governance), null, 2));
  };
}

/**
 * Registers the delegate_to_model tool with the MCP server.
 *
 * Uses createSecureHandler for standardized security middleware (Issue #531).
 * Includes timeout protection for CVE-2026-0621 mitigation (Issue #271).
 *
 * @param server - MCP server instance
 * @param deps - Dependencies
 */
export function registerDelegateToModelTool(server: McpServer, deps: DelegateDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'delegate_to_model' });

  // Wrap handler with secure handler for rate limiting and request context (Issue #531)
  const secureHandler = createSecureHandler(createDelegateHandler(deps), {
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
        'Route a task to the optimal model based on capability matching. Returns model recommendation with reasoning.',
      inputSchema: TOOL_SCHEMA,
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
