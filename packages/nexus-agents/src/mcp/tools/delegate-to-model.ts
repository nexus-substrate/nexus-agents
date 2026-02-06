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
import { createLogger, formatZodError } from '../../core/index.js';
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
} from './delegate-to-model-helpers.js';
import { getToolMemory } from './tool-memory.js';

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

/** Records successful model delegation. Best-effort. */
function recordDelegationSuccess(task: string, model: string, usedRouter: boolean): void {
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

/**
 * Creates the core handler logic for delegate_to_model tool.
 * Rate limiting is handled by createSecureHandler wrapper.
 * Uses CompositeRouter when available for intelligent routing.
 * Falls back to local model selection when router is not provided.
 */
function createDelegateHandler(
  deps: DelegateDeps
): (args: unknown, ctx: HandlerContext) => Promise<ToolResult> {
  return async (args: unknown, ctx: HandlerContext): Promise<ToolResult> => {
    const validated = DelegateInputSchema.safeParse(args);
    if (!validated.success) {
      ctx.logger.warn('Invalid delegate_to_model input', { errors: validated.error.issues });
      return errorResult(`Validation error: ${formatZodError(validated.error)}`);
    }

    const input = validated.data;
    ctx.logger.info('Analyzing task for model routing', {
      taskLength: input.task.length,
      hasRouter: deps.router !== undefined,
    });

    const requirements = analyzeTask(input.task);
    ctx.logger.debug('Task requirements analyzed', { ...requirements });

    // Try CompositeRouter first if available (Issue #169)
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
        ctx.logger.info('Model recommendation via CompositeRouter', {
          recommendedModel: output.recommended_model,
          confidence: routingResult.decision.confidence,
          stages: routingResult.decision.stagesExecuted,
          routingId: routingResult.routingId,
        });
        recordDelegationSuccess(input.task, output.recommended_model, true);
        return successResult(JSON.stringify(output, null, 2));
      }

      ctx.logger.info('Falling back to local model selection');
    }

    // Fall back to local model selection
    const billingMode = input.billing_mode ?? DEFAULTS.PROVIDER_DEFAULTS.billingMode;
    const selection = selectModel(input, requirements, billingMode);
    const output = buildDelegateOutput(selection, requirements);

    if (!output) return errorResult(`Unknown model: ${selection.model}`);

    ctx.logger.info('Model recommendation complete', {
      recommendedModel: output.recommended_model,
    });
    recordDelegationSuccess(input.task, output.recommended_model, false);
    return successResult(JSON.stringify(output, null, 2));
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
};
